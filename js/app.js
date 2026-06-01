// CORE LOGIC
const LANG_NAMES = { en: 'EN', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT', ja: 'JA', ko: 'KO', ru: 'RU', zhs: 'ZHS', zht: 'ZHT', ph: 'PH' };
const imageBlobCache = new Map();
const state = { cards: [], loading: false, printsCache: {}, abortController: null, langCache: {} };
const modal = { cardIndex: -1, selectedPrintId: null, prints: [], currentLang: 'en' };

function getGlobalLang() { return document.getElementById('global-lang').value }

function setLog(msg, type = '') {
    const el = document.getElementById('log');
    el.textContent = msg;
    el.className = type;
    if (type === 'error') document.getElementById('step-2').classList.remove('active');
}

function setProgress(pct) {
    document.getElementById('progress-bar').style.width = pct + '%';
    const pb = document.getElementById('loading-prog-bar');
    if (pb) pb.style.width = pct + '%';
}

function updateStats(cards) {
    const unique = cards.length;
    const total = cards.reduce((s, c) => s + (c.qty || 0), 0);
    const pages = total ? Math.ceil(total / 9) : 0;
    document.getElementById('stat-unique').textContent = unique;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pages').textContent = pages;
    document.getElementById('preview-count').textContent = total > 0 ? `${total} ASSETS · ${pages} PAGES` : '';

    if (unique > 0) {
        document.getElementById('step-1').classList.add('active');
        document.getElementById('step-2').classList.add('active');
    } else {
        document.getElementById('step-2').classList.remove('active');
        document.getElementById('step-3').classList.remove('active');
        document.getElementById('step-4').classList.remove('active');
    }
}

function normalizeCardName(name) {
    return String(name).normalize('NFKD').replace(/[''`´]/g, "'").replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s*\/\/\s*/g, " // ").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseArena(text) {
    const result = [];
    for (const raw of text.split('\n')) {
        let line = raw.trim();
        if (!line || /^(Deck|Sideboard|Commander|Companion|About)$/i.test(line)) continue;

        // Detect set+collector annotation: (SET) NUM [optional suffix like *F* *E*] at end of line
        let setCode = null, collectorNumber = null;
        const setAnnotation = line.match(/\(([A-Z0-9]{2,6})\)\s+(\d+[a-zA-Z]?)(?:\s+\*[A-Z]+\*)?\s*$/i);
        if (setAnnotation) {
            setCode = setAnnotation[1].toLowerCase();
            collectorNumber = setAnnotation[2];
            line = line.slice(0, setAnnotation.index).trim();
        } else {
            // Strip bare (SET) with no collector number
            line = line.replace(/\s+\([A-Z0-9]+\)\s*(?:\*[A-Z]+\*)?\s*$/i, '').trim();
        }

        const m = line.match(/^(\d+)[xX]?\s+(.+?)\s*$/);
        let qty, name;
        if (m) { qty = parseInt(m[1], 10); name = m[2].trim(); } else if (line.length > 1) { qty = 1; name = line; } else continue;
        name = name.replace(/\s+\/\/\s+/g, ' // ').replace(/\s+\/\s+/g, ' // ');
        name = name.split(' // ')[0].trim();
        if (qty > 0 && name) result.push({ qty, name, setCode, collectorNumber });
    }
    return result;
}

function hasValidImage(card) {
    if (!card) return false;
    const s = card.image_status;
    if (s === 'placeholder' || s === 'missing') return false;
    return !!extractImageUrl(card, 'small');
}

function extractImageUrl(data, size = 'normal') {
    if (data.image_uris && data.image_uris[size]) return data.image_uris[size];
    if (data.card_faces && data.card_faces[0] && data.card_faces[0].image_uris && data.card_faces[0].image_uris[size]) return data.card_faces[0].image_uris[size];
    return null;
}

function extractFace2Url(data, size = 'normal') {
    if (data.card_faces && data.card_faces.length >= 2 && data.card_faces[1] && data.card_faces[1].image_uris && data.card_faces[1].image_uris[size]) {
        return data.card_faces[1].image_uris[size];
    }
    return null;
}

function extractFace2Name(data) {
    if (data.card_faces && data.card_faces.length >= 2) return data.card_faces[1].name || null;
    return null;
}

async function fetchWithRetry(url, opts = {}, retries = 3, baseDelay = 500, timeoutMs = 15000) {
    const externalSignal = opts.signal;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (externalSignal && externalSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        const timeoutCtrl = new AbortController();
        const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs * (attempt + 1));
        const onExtAbort = () => timeoutCtrl.abort();
        if (externalSignal) externalSignal.addEventListener('abort', onExtAbort, { once: true });
        try {
            const reqOpts = Object.assign({}, opts, { signal: timeoutCtrl.signal });
            const res = await fetch(url, reqOpts);
            clearTimeout(timer);
            if (externalSignal) externalSignal.removeEventListener('abort', onExtAbort);
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
                const wait = retryAfter > 0 ? retryAfter * 1000 + 500 : baseDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            return res;
        } catch (e) {
            clearTimeout(timer);
            if (externalSignal) externalSignal.removeEventListener('abort', onExtAbort);
            if (externalSignal && externalSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            if (attempt === retries) throw e;
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
    }
}

async function fetchImageBlob(url, retries = 3, timeoutMs = 20000) {
    if (imageBlobCache.has(url)) return imageBlobCache.get(url);
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    for (let attempt = 0; attempt <= retries; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(fetchUrl, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            imageBlobCache.set(url, blob);
            return blob;
        } catch (e) {
            clearTimeout(timer);
            if (attempt === retries) throw new Error('Could not download image: ' + e.message);
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
    }
}

async function runWithConcurrency(tasks, limit) {
    const results = []; let idx = 0;
    async function worker() { while (idx < tasks.length) { const i = idx++; results[i] = await tasks[i](); } }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

async function fetchCollectionBatch(entries) {
    // entries: array of { name, setCode?, collectorNumber? } or plain strings
    const identifiers = entries.map(e => {
        if (typeof e === 'string') return { name: e };
        if (e.setCode && e.collectorNumber) return { set: e.setCode, collector_number: e.collectorNumber };
        return { name: e.name };
    });
    const body = JSON.stringify({ identifiers });
    const res = await fetchWithRetry('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res || !res.ok) throw new Error('Error in batch collection');
    const data = await res.json();
    const map = new Map();
    for (const card of (data.data || [])) {
        map.set(normalizeCardName(card.name), card);
        if (card.name.includes(' // ')) map.set(normalizeCardName(card.name.split(' // ')[0].trim()), card);
        // Also key by set+collector for pinned prints
        if (card.set && card.collector_number) map.set(`${card.set}:${card.collector_number}`, card);
    }
    for (const nf of (data.not_found || [])) {
        if (!nf.name) continue;
        try {
            await new Promise(r => setTimeout(r, 100));
            const rRes = await fetchWithRetry('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(nf.name));
            if (rRes && rRes.ok) {
                const rCard = await rRes.json();
                map.set(normalizeCardName(nf.name), rCard);
                map.set(normalizeCardName(rCard.name), rCard);
                if (rCard.name.includes(' // ')) map.set(normalizeCardName(rCard.name.split(' // ')[0].trim()), rCard);
            }
        } catch (e) { }
    }
    return { map };
}

async function fetchCardLangBatch(names, lang, signal) {
    const orParts = names.map(n => '!"' + n + '"').join(' OR ');
    const q = '(' + orParts + ') lang:' + lang;
    const url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=cards&order=released&dir=desc';
    const res = await fetchWithRetry(url, signal ? { signal } : {});
    const result = new Map();
    if (!res || !res.ok) return result;
    const data = await res.json();
    const nameSet = new Map(names.map(n => [normalizeCardName(n), n]));
    for (const card of (data.data || [])) {
        if (!hasValidImage(card)) continue;
        const normCardEN = normalizeCardName(card.name);
        const normFace1 = normalizeCardName(card.name.split(' // ')[0]);
        let matchKey = null;
        if (nameSet.has(normCardEN)) matchKey = normCardEN;
        else if (nameSet.has(normFace1)) matchKey = normFace1;
        if (matchKey && !result.has(matchKey)) result.set(matchKey, card);
    }
    return result;
}

function showLoadingOverlay(msg) {
    const ov = document.getElementById('loading-overlay');
    const tx = document.getElementById('loading-text');
    if (ov) ov.classList.add('active');
    if (tx && msg) tx.textContent = msg;
}

function hideLoadingOverlay() {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.classList.remove('active');
    setProgress(0);
}

function editQty(index) {
    const thumb = document.querySelector(`.card-thumb[data-card-idx="${index}"]`);
    if (!thumb) return;
    const badge = thumb.querySelector('.qty-badge');
    if (!badge) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1'; input.max = '99';
    input.value = state.cards[index].qty;
    input.style.cssText = 'position:absolute; top:10px; left:10px; width:44px; background:rgba(0,0,0,0.92); color:var(--gold); font-weight:700; font-size:0.82rem; border:1.5px solid var(--gold); border-radius:5px; padding:2px 4px; text-align:center; outline:none; z-index:10;';

    badge.replaceWith(input);
    input.focus(); input.select();

    function commit() {
        const v = parseInt(input.value, 10);
        if (v > 0 && v !== state.cards[index].qty) {
            state.cards[index].qty = v;
            updateStats(state.cards.filter(c => !c.error));
        }
        renderPreview();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') renderPreview();
        e.stopPropagation();
    });
}

function renderPreview() {
    const grid = document.getElementById('preview-grid');
    if (!state.cards.length) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🃏</div><span style="font-size:0.9rem;" data-i18n="empty_state">${t('empty_state')}</span></div>`;
        return;
    }

    grid.innerHTML = '';
    state.cards.forEach((card, index) => {
        const block = document.createElement('div');
        block.className = 'card-thumb';
        block.dataset.cardIdx = index;

        if (card.error) {
            block.innerHTML = `<div style="padding:20px; color:var(--error); font-size:0.8rem; text-align:center;"><strong>Error</strong><br>${card.name}<br><span style="color:var(--text-dim)">${card.error}</span></div>`;
            const rm = document.createElement('button');
            rm.className = 'card-remove-btn'; rm.innerHTML = '✕';
            rm.style.position = 'absolute'; rm.style.top = '10px'; rm.style.right = '10px';
            rm.onclick = (e) => { e.stopPropagation(); removeCard(index); };
            block.appendChild(rm);
        } else {
            const badgeLang = card._isCustom
                ? `<span class="card-badge-ui badge-custom">CUST</span>`
                : card.lang !== 'en' ? `<span class="card-badge-ui">${card.lang.toUpperCase()}</span>` : '';
            const badgeDfc = card.imageUrl2 ? `<span class="card-badge-ui" style="background:#4c1d95; border-color:#7c3aed;" title="${card.face2Name || 'Back face'}">DFC</span>` : '';
            const setCode = card.setCode || '---';

            block.innerHTML = `
                            <img src="${card.imageUrl}" alt="${card.name}" loading="lazy" />
                            <div class="card-meta-overlay">
                                <div class="card-info-top">
                                <div class="qty-stepper" onclick="event.stopPropagation()">
    <button class="qty-btn" onclick="changeQty(${index}, -1)">−</button>
    <span class="qty-display">${card.qty}</span>
    <button class="qty-btn" onclick="changeQty(${index}, +1)">+</button>
</div>   
                                <div style="display:flex;gap:4px;">
                                        <button class="card-dup-btn" title="Duplicate as independent copy" onclick="event.stopPropagation(); duplicateCard(${index})">⧉</button>
                                        <button class="card-remove-btn" onclick="event.stopPropagation(); removeCard(${index})">✕</button>
                                    </div>
                                </div>
                                <div class="card-info-bottom">
                                    <div class="card-title-text">${card.name}</div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                        <span class="card-set-text">${setCode}</span>
                                        <div style="display:flex; gap:4px; margin-left:auto;">${badgeLang}${badgeDfc}</div>
                                    </div>
                                </div>
                            </div>
                        `;
            block.onclick = (e) => {
                if (e.target.closest('.card-remove-btn')) return;
                openModal(index);
            };
        }
        grid.appendChild(block);
    });

    if (state.cards.length > 0) document.getElementById('step-3').classList.add('active');
}

function removeCard(i) {
    state.cards.splice(i, 1);
    updateStats(state.cards.filter(c => !c.error));
    renderPreview();
}
function changeQty(index, delta) {
    const card = state.cards[index];
    if (!card) return;
    const newQty = Math.max(1, Math.min(99, (card.qty || 1) + delta));
    if (newQty === card.qty) return;
    card.qty = newQty;
    // Actualizar solo el número sin rerenderizar toda la grid
    const thumb = document.querySelector(`.card-thumb[data-card-idx="${index}"]`);
    if (thumb) {
        const display = thumb.querySelector('.qty-display');
        if (display) display.textContent = newQty;
    }
    updateStats(state.cards.filter(c => !c.error));
}
function duplicateCard(i) {
    const original = state.cards[i];
    if (!original) return;
    // Deep clone with a new unique _uid so art changes are independent
    const clone = Object.assign({}, original, {
        _uid: Math.random().toString(36).slice(2),
        _blob: null,  // don't share blob reference — regenerated on PDF
        _blob2: null,
        qty: 1,
    });
    state.cards.splice(i + 1, 0, clone);
    updateStats(state.cards.filter(c => !c.error));
    renderPreview();
}

// ── Custom image upload ────────────────────────────────────────────────────
function handleCustomUpload(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    files.forEach(file => {
        const objectUrl = URL.createObjectURL(file);
        const label = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        const customCard = {
            qty: 1,
            name: label,
            imageUrl: objectUrl,
            imageUrlHQ: objectUrl,
            pdfImageUrl: objectUrl,
            imageUrl2: null, imageUrl2HQ: null, pdfImageUrl2: null,
            face2Name: null,
            lang: 'custom',
            printId: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            setCode: 'CUST',
            error: false,
            hqLoaded: true,
            _isCustom: true,
            _objectUrl: objectUrl,
        };
        state.cards.push(customCard);
    });
    // Reset input so same file can be re-added if wanted
    input.value = '';
    updateStats(state.cards.filter(c => !c.error));
    document.getElementById('btn-pdf').disabled = false;
    renderPreview();
    setLog(`✓ ${files.length} custom image(s) added.`, 'ok');
}

async function loadDeck() {
    if (state.loading) return;

    try {
        const inputEl = document.getElementById('deck-input');
        let text = inputEl.value.trim();

        if (!text) {
            text = "1 Rograkh, Son of Rohgahh\n1 Thrasios, Triton Hero\n1 Polymorph\n1 Sol Ring";
            inputEl.value = text;
            setLog('Empty list detected. Syncing automatic test block.', 'ok');

            inputEl.style.transition = '0.3s';
            inputEl.style.borderColor = 'var(--gold)';
            inputEl.style.boxShadow = '0 0 8px var(--gold-glow)';
            setTimeout(() => {
                inputEl.style.borderColor = 'var(--border)';
                inputEl.style.boxShadow = 'none';
            }, 1200);
        }

        const parsed = parseArena(text);
        if (!parsed.length) {
            setLog('Invalid format. Make sure to include quantity and name (e.g., 4 Sol Ring).', 'error');
            inputEl.style.transition = '0.3s';
            inputEl.style.borderColor = 'var(--error)';
            setTimeout(() => { inputEl.style.borderColor = 'var(--border)'; }, 1500);
            return;
        }

        if (state.abortController) state.abortController.abort();
        const controller = new AbortController();
        state.abortController = controller;

        const targetLang = getGlobalLang();
        state.loading = true; state.cards = [];
        document.getElementById('btn-load').disabled = true;
        document.getElementById('btn-pdf').disabled = true;

        const uniqueNames = [...new Map(parsed.map(p => [normalizeCardName(p.name), p])).values()];
        
        showLoadingOverlay(t('loading_phase1', uniqueNames.length));
        setLog('Searching Scryfall database...', '');

        const grid = document.getElementById('preview-grid');
        grid.innerHTML = Array(Math.min(uniqueNames.length, 8)).fill('<div class="skeleton-card"></div>').join('');

        const enMap = new Map();
        let batchOk = false;
        try {
            for (let i = 0; i < uniqueNames.length; i += 75) {
                if (controller.signal.aborted) break;
                const chunk = uniqueNames.slice(i, i + 75);
                const { map } = await fetchCollectionBatch(chunk);
                for (const [k, v] of map) enMap.set(k, v);
                setProgress(Math.round(((i + 75) / uniqueNames.length) * 40));
            }
            batchOk = true;
        } catch (e) { console.warn('Batch request failed, attempting manual searches', e); }

        if (!batchOk || enMap.size < uniqueNames.length) {
            const missing = uniqueNames.filter(e => !enMap.has(normalizeCardName(e.name)) && !(e.setCode && e.collectorNumber && enMap.has(`${e.setCode}:${e.collectorNumber}`)));
            if (missing.length > 0) {
                let done = 0;
                const fallbackTasks = missing.map(entry => async () => {
                    if (controller.signal.aborted) return;
                    try {
                        const res = await fetchWithRetry('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(entry.name), { signal: controller.signal });
                        if (res && res.ok) {
                            const card = await res.json();
                            enMap.set(normalizeCardName(card.name), card);
                            if (card.name.includes(' // ')) enMap.set(normalizeCardName(card.name.split(' // ')[0].trim()), card);
                            enMap.set(normalizeCardName(entry.name), card);
                        }
                    } catch (e) { }
                    done++; setProgress(Math.round((done / missing.length) * 40));
                });
                await runWithConcurrency(fallbackTasks, 2);
            }
        }
        if (controller.signal.aborted) return;

        const langMap = new Map();
        if (targetLang !== 'en') {
            showLoadingOverlay(t('loading_phase2', targetLang.toUpperCase()));

            // Build the list of canonical names to translate.
            // For entries with set+collector, resolve their name from enMap first.
            const needsLang = uniqueNames.map(e => {
                const pinnedKey = e.setCode && e.collectorNumber ? `${e.setCode}:${e.collectorNumber}` : null;
                const resolvedCard = (pinnedKey && enMap.get(pinnedKey)) || enMap.get(normalizeCardName(e.name));
                if (!resolvedCard) return null;
                // Use the canonical EN name from Scryfall, not the user input
                const canonicalName = resolvedCard.name.split(' // ')[0].trim();
                return { entry: e, canonicalName, canonicalKey: normalizeCardName(canonicalName) };
            }).filter(Boolean);

            const toFetch = [];
            for (const { entry, canonicalName, canonicalKey } of needsLang) {
                const cacheKey = canonicalKey + '|' + targetLang;
                if (state.langCache[cacheKey]) langMap.set(normalizeCardName(entry.name), state.langCache[cacheKey]);
                else if (!toFetch.find(n => normalizeCardName(n) === canonicalKey)) toFetch.push(canonicalName);
            }
            if (toFetch.length > 0) {
                const batches = [];
                for (let i = 0; i < toFetch.length; i += 12) batches.push(toFetch.slice(i, i + 12));
                let done = 0;
                for (const batch of batches) {
                    if (controller.signal.aborted) break;
                    try {
                        const batchMap = await fetchCardLangBatch(batch, targetLang, controller.signal);
                        for (const { entry, canonicalName, canonicalKey } of needsLang) {
                            if (!batch.includes(canonicalName)) continue;
                            const card = batchMap.get(canonicalKey);
                            if (card) {
                                langMap.set(normalizeCardName(entry.name), card);
                                state.langCache[canonicalKey + '|' + targetLang] = card;
                            }
                        }
                    } catch (e) { }
                    done += batch.length;
                    setProgress(40 + Math.round((done / toFetch.length) * 40));
                    if (!controller.signal.aborted) await new Promise(r => setTimeout(r, 400));
                }
            }
        }
        if (controller.signal.aborted) return;

        let errors = 0;
        for (const { qty, name, setCode, collectorNumber } of parsed) {
            const key = normalizeCardName(name);
            const pinnedKey = setCode && collectorNumber ? `${setCode}:${collectorNumber}` : null;

            // Resolve the base card (used for metadata: name, type, DFC structure)
            const baseCard = (pinnedKey && enMap.get(pinnedKey)) || enMap.get(key);

            // Resolve the display card (used for image/lang):
            // - If lang is set and we found a translation, use it
            // - Otherwise fall back to the base card (EN or pinned edition)
            const langCard = langMap.get(key);
            const data = langCard || baseCard;
            if (!data) {
                errors++; state.cards.push({ qty, name, error: 'Not found in Scryfall database.' }); continue;
            }
            const imageUrl = extractImageUrl(data, 'small');
            if (!imageUrl) {
                errors++; state.cards.push({ qty, name, error: 'No image available' }); continue;
            }
            state.cards.push({
                qty,
                name: data.name || name,
                imageUrl,
                imageUrlHQ: extractImageUrl(data, 'normal'),
                pdfImageUrl: extractImageUrl(data, 'normal'),
                imageUrl2: extractFace2Url(data, 'small'),
                imageUrl2HQ: extractFace2Url(data, 'normal'),
                pdfImageUrl2: extractFace2Url(data, 'normal'),
                face2Name: extractFace2Name(data),
                lang: data.lang || targetLang,
                printId: data.id,
                setCode: data.set ? data.set.toUpperCase() : '---',
                error: false,
                hqLoaded: false
            });
        }

        setProgress(100);
        renderPreview(); // state.cards es global, no necesita parámetro
        updateStats(state.cards.filter(c => !c.error));

        const totalOk = state.cards.filter(c => !c.error).length;
        if (totalOk === 0) setLog(t('log_error_none'), 'error');
        else if (errors > 0) setLog(t('log_done_errors', totalOk, errors), 'error');
        else { setLog(t('log_done', totalOk), 'ok'); document.getElementById('step-4').classList.add('active'); }

        if (totalOk > 0) document.getElementById('btn-pdf').disabled = false;

        upgradePreviewHQ(state.cards);

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error("Critical Failure:", err);
            setLog('Critical failure processing deck: ' + err.message, 'error');
        }
    } finally {
        state.loading = false;
        document.getElementById('btn-load').disabled = false;
        hideLoadingOverlay();
    }
}

async function upgradePreviewHQ(cards) {
    const batchId = ++upgradePreviewHQ._id;
    const valid = cards.filter(c => !c.error && c.imageUrlHQ && !c.hqLoaded);
    if (!valid.length) return;

    let done = 0;
    for (const card of valid) {
        if (batchId !== upgradePreviewHQ._id) return;
        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                card.imageUrl = card.imageUrlHQ;
                if (card.imageUrl2HQ) card.imageUrl2 = card.imageUrl2HQ;
                card.hqLoaded = true;
                const cardIdx = state.cards.indexOf(card);
                const thumb = document.querySelector(`.card-thumb[data-card-idx="${cardIdx}"] img`);
                if (thumb) { thumb.classList.remove('hq-loading'); thumb.src = card.imageUrl; }
                resolve();
            };
            img.onerror = () => resolve();

            const cardIdx2 = state.cards.indexOf(card);
            const thumbLoading = document.querySelector(`.card-thumb[data-card-idx="${cardIdx2}"] img`);
            if (thumbLoading) thumbLoading.classList.add('hq-loading');
            img.src = card.imageUrlHQ + (card.imageUrlHQ.includes('?') ? '&' : '?') + '_hq=1';
            setTimeout(resolve, 8000);
        });
        done++;
    }
}
upgradePreviewHQ._id = 0;

async function openModal(i) {
    const card = state.cards[i];
    if (!card || card.error || card._isCustom) return;
    modal.cardIndex = i;
    modal.selectedPrintId = card.printId;
    modal.currentLang = card.lang || getGlobalLang();

    document.getElementById('modal-card-name').textContent = card.name;
    document.getElementById('modal-lang').value = modal.currentLang;
    document.getElementById('btn-apply').disabled = true;
    document.getElementById('art-modal').classList.add('open');
    document.body.style.overflow = 'hidden';

    await loadPrints(card.name, modal.currentLang);
}

const BASIC_LAND_NAMES = new Set(['plains','island','swamp','mountain','forest','wastes','snow-covered plains','snow-covered island','snow-covered swamp','snow-covered mountain','snow-covered forest']);

function isBasicLand(card) {
    return !!(card && card.type_line && card.type_line.toLowerCase().includes('basic land'));
}

async function loadPrints(name, lang) {
    const grid = document.getElementById('prints-grid');
    grid.innerHTML = '<div class="prints-loading" style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);"><div class="spinner-ring" style="margin:0 auto 12px;"></div> Indexing alternative arts...</div>';
    document.getElementById('modal-print-count').textContent = '';

    const yearSelect = document.getElementById('modal-year-filter');
    const yearLabel  = document.getElementById('modal-year-label');
    yearSelect.style.display = 'none';
    yearLabel.style.display  = 'none';

    // ── Función auxiliar: descarga TODAS las páginas de una query ────────────
    async function fetchAllPages(firstUrl) {
        const all = [];
        let url = firstUrl;
        while (url) {
            const res = await fetchWithRetry(url);
            if (!res || !res.ok) break;
            const data = await res.json();
            if (data.data) all.push(...data.data);
            url = data.has_more ? data.next_page : null;
            // Pequeña pausa entre páginas para no saturar la API
            if (url) await new Promise(r => setTimeout(r, 150));
        }
        return all;
    }

    try {
        // Primera búsqueda en el idioma solicitado
        let allCards = await fetchAllPages(
            `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" lang:${lang}`)}&unique=prints&order=released&dir=desc`
        );

        // Si no hay resultados y el idioma no es EN, caer a EN
        if (allCards.length === 0 && lang !== 'en') {
            allCards = await fetchAllPages(
                `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}"`)}&unique=prints&order=released&dir=desc`
            );
        }

        if (allCards.length === 0) {
            grid.innerHTML = '<div class="no-prints" style="grid-column:1/-1;text-align:center;padding:40px;">No variants found.</div>';
            return;
        }

        modal.prints = allCards.filter(c => extractImageUrl(c, 'small'));

        // ── Selector de eras para tierras básicas ────────────────────────────
        const isBasic = modal.prints.length > 0 && isBasicLand(modal.prints[0]);
        if (isBasic && modal.prints.length > 8) {
            const years = modal.prints.map(p => parseInt(p.released_at.substring(0, 4)));
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            const buckets = [];
            for (let start = minYear; start <= maxYear; start += 5) {
                const end = Math.min(start + 4, maxYear);
                if (years.some(y => y >= start && y <= end)) {
                    buckets.push({ label: `${start}–${end}`, min: start, max: end });
                }
            }
            buckets.reverse(); // más reciente primero
            yearSelect.innerHTML = buckets.map(b => `<option value="${b.min}-${b.max}">${b.label}</option>`).join('');
            yearSelect.value = `${buckets[0].min}-${buckets[0].max}`;
            yearSelect.style.display = '';
            yearLabel.style.display  = '';
        }

        // Aplicar filtro inicial solo si es básica (tiene yearSelect visible), si no renderizar todo
        if (isBasic && modal.prints.length > 8) {
            applyYearFilter();
        } else {
            renderPrintsGrid(modal.prints);
        }
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div class="no-prints" style="grid-column:1/-1;text-align:center;padding:40px;">Connection error.</div>';
    }
}

function applyYearFilter() {
    const val = document.getElementById('modal-year-filter').value;
    let filtered = modal.prints;
    if (val) {
        const [minY, maxY] = val.split('-').map(Number);
        filtered = modal.prints.filter(p => {
            const y = parseInt(p.released_at.substring(0, 4));
            return y >= minY && y <= maxY;
        });
    }
    renderPrintsGrid(filtered);
}

function renderPrintsGrid(prints) {
    const grid = document.getElementById('prints-grid');
    document.getElementById('modal-print-count').textContent = `${prints.length} Editions located`;
    grid.innerHTML = '';
    prints.forEach(p => {
        const item = document.createElement('div');
        const isSelected = p.id === modal.selectedPrintId;
        item.className = `print-card ${isSelected ? 'selected' : ''}`;
        item.onclick = () => selectPrint(p.id);
        const imgUrl = extractImageUrl(p, 'small');
        const foilBadge = p.foil ? '<span class="print-badge" style="background:linear-gradient(45deg, #f59e0b, #ec4899)">Foil</span>' : '';
        const r = p.rarity ? p.rarity.charAt(0).toUpperCase() : '';
        item.innerHTML = `
                        <img src="${imgUrl}" alt="${p.set_name}" />
                        ${foilBadge}
                        <div class="print-meta">
                            <span class="set-name">${p.set_name}</span>
                            <span class="set-detail">${p.set.toUpperCase()} · ${p.released_at.substring(0, 4)} · [${r}]</span>
                        </div>
                    `;
        grid.appendChild(item);
    });
    if (prints.some(p => p.id === modal.selectedPrintId)) document.getElementById('btn-apply').disabled = false;
}

function selectPrint(id) {
    modal.selectedPrintId = id;
    document.querySelectorAll('.print-card').forEach(el => el.classList.remove('selected'));
    const idx = modal.prints.findIndex(p => p.id === id);
    if (idx >= 0) {
        document.getElementById('prints-grid').children[idx].classList.add('selected');
        document.getElementById('btn-apply').disabled = false;
    }
}

async function onModalLangChange() {
    const lang = document.getElementById('modal-lang').value;
    modal.currentLang = lang; modal.selectedPrintId = null;
    const card = state.cards[modal.cardIndex];
    if (card) await loadPrints(card.name, lang);
}

function applySelection() {
    if (modal.cardIndex < 0 || !modal.selectedPrintId) return;
    const print = modal.prints.find(p => p.id === modal.selectedPrintId);
    if (!print) return;

    const card = state.cards[modal.cardIndex];
    card.imageUrl = extractImageUrl(print, 'small');
    card.imageUrlHQ = extractImageUrl(print, 'normal');
    card.pdfImageUrl = extractImageUrl(print, 'normal');
    card.imageUrl2 = extractFace2Url(print, 'small');
    card.imageUrl2HQ = extractFace2Url(print, 'normal');
    card.pdfImageUrl2 = extractFace2Url(print, 'normal');
    card.face2Name = extractFace2Name(print);
    card.lang = print.lang || modal.currentLang;
    card.printId = print.id;
    card.setCode = print.set ? print.set.toUpperCase() : '---';
    card.hqLoaded = false;
    card._blob = null; card._blob2 = null;

    // Actualizar la lista de texto (textarea) para reflejar la versión seleccionada
    const inputEl = document.getElementById('deck-input');
    if (inputEl && print.set && print.collector_number) {
        const parsed = parseArena(inputEl.value);
        if (parsed.length > 0 && modal.cardIndex < parsed.length) {
            // Reemplazar la línea correspondiente manteniendo el orden
            const lines = inputEl.value.split('\n');
            let targetMatchIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (!line || /^(Deck|Sideboard|Commander|Companion|About)$/i.test(line)) continue;
                
                // Si coincide con el elemento mapeado en parseArena
                if (targetMatchIndex === modal.cardIndex) {
                    lines[i] = `${card.qty} ${card.name} (${print.set.toUpperCase()}) ${print.collector_number}`;
                    break;
                }
                targetMatchIndex++;
            }
            inputEl.value = lines.join('\n');
        }
    }

    closeModal();
    renderPreview();
    upgradePreviewHQ(state.cards);
}

function closeModal() {
    document.getElementById('art-modal').classList.remove('open');
    document.body.style.overflow = '';
}
function closeModalOnOverlay(e) { if (e.target === document.getElementById('art-modal')) closeModal() }

async function generatePDF() {
    const skipBasics = document.getElementById('pdf-skip-basics').checked;
    const duplexMode = document.getElementById('pdf-duplex').value === 'yes';

    let unique = state.cards.filter(c => !c.error && c.pdfImageUrl);
    if (skipBasics) {
        unique = unique.filter(c => !isBasicLand(c) && !BASIC_LAND_NAMES.has(c.name.toLowerCase()));
    }
    if (!unique.length) { setLog('No valid cards for PDF.', 'error'); return }

    showLoadingOverlay(t('log_pdf'));
    setProgress(5);
    document.getElementById('btn-pdf').disabled = true;

    const concurrency = Math.min(navigator.hardwareConcurrency || 8, 10);
    let done = 0;

    const tasks = unique.map(card => async () => {
        try {
            if (!card._blob) {
                if (card._isCustom) {
                    // Custom images: fetch from ObjectURL
                    const res = await fetch(card.pdfImageUrl);
                    card._blob = await res.blob();
                } else {
                    card._blob = await fetchImageBlob(card.pdfImageUrl);
                }
            }
            if (card.pdfImageUrl2 && !card._blob2) card._blob2 = await fetchImageBlob(card.pdfImageUrl2);
        } catch (e) { console.error("Download error: " + card.name, e); }
        done++; setProgress(5 + Math.round((done / unique.length) * 40));
    });

    await runWithConcurrency(tasks, concurrency);

    try {
    const { jsPDF } = window.jspdf;
    const isA4 = document.getElementById('pdf-paper').value === 'a4';
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: isA4 ? 'a4' : 'letter', compress: true });
    const PAGE_W = isA4 ? 210 : 215.9;
    const PAGE_H = isA4 ? 297 : 279.4;
    const CARD_W = 63, CARD_H = 88;
    const COLS = 3, ROWS = 3;
    const gap = parseFloat(document.getElementById('pdf-gap')?.value || 0);

    // ── Scale ────────────────────────────────────────────────────────────────
    const scaleSetting = document.getElementById('pdf-size').value; // 'real' | 'fit'
    let CARD_W_RENDER, CARD_H_RENDER;
    if (scaleSetting === 'fit') {
        // Available page area with 10mm margins
        const availW = PAGE_W - 20;
        const availH = PAGE_H - 20;
        const fitW = (availW - gap * (COLS - 1)) / COLS;
        const fitH = (availH - gap * (ROWS - 1)) / ROWS;
        // Maintain MTG aspect ratio (63:88), pick limiting dimension
        const ratio = Math.min(fitW / CARD_W, fitH / CARD_H);
        CARD_W_RENDER = CARD_W * ratio;
        CARD_H_RENDER = CARD_H * ratio;
    } else {
        CARD_W_RENDER = CARD_W;
        CARD_H_RENDER = CARD_H;
    }

    const MX = (PAGE_W - (CARD_W_RENDER * COLS + gap * (COLS - 1))) / 2;
    const MY = (PAGE_H - (CARD_H_RENDER * ROWS + gap * (ROWS - 1))) / 2;
    const marksSetting = document.getElementById('pdf-marks').value; // 'no' | 'thin' | 'thick'
    const marks = marksSetting !== 'no';
    const qualitySetting = document.getElementById('pdf-quality')?.value || 'high';
    const jpegQuality = qualitySetting === 'high' ? 0.94 : qualitySetting === 'std' ? 0.82 : 0.70;

    // ── Bleed ────────────────────────────────────────────────────────────────
    const bleedSetting = document.getElementById('pdf-bleed').value; // 'none' | 'mm2'
    const bleed = bleedSetting === 'mm2' ? 2 : 0; // mm of bleed on each side

    // ── Card Border ──────────────────────────────────────────────────────────
    const borderSetting = document.getElementById('pdf-border').value; // 'none' | 'thin' | 'thick'
    const borderWidth = borderSetting === 'thin' ? 0.3 : borderSetting === 'thick' ? 0.8 : 0;

    // ── New feature flags ────────────────────────────────────────────────────
    const watermark     = document.getElementById('pdf-watermark')?.checked || false;
    const printDecklist = document.getElementById('pdf-decklist')?.checked || false;

function drawCutMarks(doc, col, row, x, y, cw, ch) {
    const lw = marksSetting === 'thick' ? 0.4 : 0.15;
    doc.setDrawColor(60, 60, 60); doc.setLineWidth(lw);
    // Horizontal marks (top & bottom edges)
    if (col === 0) {
        doc.line(0, y, x, y);
        doc.line(0, y + ch, x, y + ch);
    }
    if (col === COLS - 1) {
        doc.line(x + cw, y, PAGE_W, y);
        doc.line(x + cw, y + ch, PAGE_W, y + ch);
    }
    // Vertical marks (left & right edges)
    if (row === 0) {
        doc.line(x, 0, x, y);
        doc.line(x + cw, 0, x + cw, y);
    }
    if (row === ROWS - 1) {
        doc.line(x, y + ch, x, PAGE_H);
        doc.line(x + cw, y + ch, x + cw, PAGE_H);
    }
}

    const dfcMode = document.getElementById('pdf-dfc').value;
    const needsGenericBack = duplexMode; // solo descargamos el dorso si hay dúplex

    const GENERIC_BACK_URL = 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/513b7bfa-42c9-4d08-ad6c-8e5d478c42d3/dalfpib-83f22b02-5802-40b4-901b-3eecf0ca2058.png/v1/fit/w_828,h_1182,q_70,strp/unofficial_magic_the_gathering_six_color_card_back_by_lordnyriox_dalfpib-414w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTQ2MyIsInBhdGgiOiIvZi81MTNiN2JmYS00MmM5LTRkMDgtYWQ2Yy04ZTVkNDc4YzQyZDMvZGFsZnBpYi04M2YyMmIwMi01ODAyLTQwYjQtOTAxYi0zZWVjZjBjYTIwNTgucG5nIiwid2lkdGgiOiI8PTEwMjQifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.E6ain-taz3WAOjHlySF768nq0Id5NkQMRzOrm95OGXY';
    let genericBackBlob = null;
    if (needsGenericBack) {
        try { genericBackBlob = await fetchImageBlob(GENERIC_BACK_URL); } catch(e) { console.warn('Could not load generic card back', e); }
    }

    // ── Helper: render one blob into the PDF at position (x,y) ──────────────
    async function renderBlobToDoc(blob, x, y) {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        // Apply bleed: expand image rect by bleed amount on all sides
        const imgX = x - bleed;
        const imgY = y - bleed;
        const imgW = CARD_W_RENDER + bleed * 2;
        const imgH = CARD_H_RENDER + bleed * 2;
        doc.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', imgX, imgY, imgW, imgH, undefined, 'FAST');

        // ── Proxy watermark ──────────────────────────────────────────────────
        if (watermark) {
            const cx = x + CARD_W_RENDER / 2;
            const cy = y + CARD_H_RENDER / 2;
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(180, 180, 180);
            doc.text('PROXY', cx, cy, { align: 'center', baseline: 'middle', angle: 35 });
        }

        // ── Card border ──────────────────────────────────────────────────────
        if (borderWidth > 0) {
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(borderWidth);
            doc.rect(x, y, CARD_W_RENDER, CARD_H_RENDER, 'S');
        }
    }

    // ── 4 combinaciones DFC × Dúplex ─────────────────────────────────────────
    //
    // [checklist + NO duplex]  Solo frentes. DFC: solo cara delantera por slot.
    // [checklist + duplex]     Frentes en pág impar, dorso genérico espejado en pág par.
    // [both + NO duplex]       Frente y reverso DFC lado a lado en la misma pág.
    // [both + duplex]          Frentes en pág impar, reversos DFC espejados en pág par.
    //
    // Usamos dos arrays paralelos: fronts[] y backs[].
    // backs[i] = null  → slot vacío en página de reverso (no se pinta nada).
    // backs[i] = blob  → se pinta ese blob en la página de reverso espejada.
    // En modo [both + NO duplex] no usamos backs[], sino que añadimos la cara2 como
    // un slot extra en fronts[] a continuación del slot de la cara1.

    const fronts = [];
    const backs  = []; // solo relevante si duplexMode

    for (const card of unique) {
        if (!card._blob) continue;
        const isDFC = !!(card.pdfImageUrl2 && card._blob2);

        for (let i = 0; i < card.qty; i++) {
            if (!duplexMode && dfcMode === 'both' && isDFC) {
                // [both + NO duplex]: cara1 y cara2 en slots consecutivos de la misma página
                fronts.push(card._blob);
                fronts.push(card._blob2);
                // backs no se usa en este modo
            } else if (duplexMode && dfcMode === 'both' && isDFC) {
                // [both + duplex]: cara1 en frentes, cara2 en reverso espejado
                fronts.push(card._blob);
                backs.push(card._blob2);
            } else if (duplexMode && dfcMode === 'checklist') {
                // [checklist + duplex]: solo cara1 en frentes, dorso genérico en reverso
                fronts.push(card._blob);
                backs.push(genericBackBlob);
            } else {
                // [checklist + NO duplex] y cartas normales en cualquier modo:
                // solo cara delantera, sin reverso
                fronts.push(card._blob);
                if (duplexMode) backs.push(genericBackBlob);
            }
        }
    }

    // ── Render pages ──────────────────────────────────────────────────────────
    const totalSlots = fronts.length;
    const totalSheets = Math.ceil(totalSlots / 9);
    let pdfPageCount = 0;

    for (let sheet = 0; sheet < totalSheets; sheet++) {
        const slotStart = sheet * 9;
        const slotEnd   = Math.min(slotStart + 9, totalSlots);

        // ── Página de frentes (siempre) ──────────────────────────────────────
        if (pdfPageCount > 0) doc.addPage();
        pdfPageCount++;

        for (let s = slotStart; s < slotEnd; s++) {
            const pos = s - slotStart;
            const col = pos % COLS;
            const row = Math.floor(pos / COLS);
            const x = MX + col * (CARD_W_RENDER + gap);
            const y = MY + row * (CARD_H_RENDER + gap);
            try { await renderBlobToDoc(fronts[s], x, y); } catch(e) { console.error(e); }
            if (marks) drawCutMarks(doc, col, row, x, y, CARD_W_RENDER, CARD_H_RENDER);
        }

        if (duplexMode && backs.length > 0) {
            doc.addPage();
            pdfPageCount++;

            for (let s = slotStart; s < slotEnd; s++) {
                if (s >= backs.length) continue;
                const pos = s - slotStart;
                const col = COLS - 1 - (pos % COLS);
                const row = Math.floor(pos / COLS);
                const x = MX + col * (CARD_W_RENDER + gap);
                const y = MY + row * (CARD_H_RENDER + gap);
                const backBlob = backs[s];
                if (backBlob) {
                    try { await renderBlobToDoc(backBlob, x, y); } catch(e) { console.error(e); }
                }
                if (marks) drawCutMarks(doc, col, row, x, y, CARD_W_RENDER, CARD_H_RENDER);
            }
        }

        setProgress(45 + Math.round(((sheet + 1) / totalSheets) * 55));
    }

    const totalPdfPages = pdfPageCount;

    // ── Decklist page ────────────────────────────────────────────────────────
    if (printDecklist) {
        doc.addPage();
        const margin = 16;
        const lineH = 5.5;
        const colW = (PAGE_W - margin * 2) / 2;
        let curY = margin + 2;

        // White background (minimal ink)
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        doc.text('DECKLIST', PAGE_W / 2, curY, { align: 'center' });
        curY += 5;

        // Thin rule
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.2);
        doc.line(margin, curY, PAGE_W - margin, curY);
        curY += 5;

        // Cards — two columns, plain text only
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);

        const deckCards = state.cards.filter(c => !c.error);
        const half = Math.ceil(deckCards.length / 2);
        const col1 = deckCards.slice(0, half);
        const col2 = deckCards.slice(half);
        const maxRows = Math.max(col1.length, col2.length);

        for (let i = 0; i < maxRows; i++) {
            const rowY = curY + i * lineH;
            if (col1[i]) {
                const c = col1[i];
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(60, 60, 60);
                doc.text(`${c.qty}×`, margin, rowY);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(30, 30, 30);
                doc.text(c.name, margin + 7, rowY);
            }
            if (col2[i]) {
                const c = col2[i];
                const cx = margin + colW + 2;
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(60, 60, 60);
                doc.text(`${c.qty}×`, cx, rowY);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(30, 30, 30);
                doc.text(c.name, cx + 7, rowY);
            }
        }

        // Footer rule + total
        const footY = curY + maxRows * lineH + 4;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.2);
        doc.line(margin, footY, PAGE_W - margin, footY);
        const totalCards = deckCards.reduce((s, c) => s + (c.qty || 0), 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(120, 120, 120);
        doc.text(`${totalCards} cards · ${deckCards.length} unique · AetherForge Proxy Studio`, PAGE_W / 2, footY + 4, { align: 'center' });
    }

        doc.save('MTG_Forge_Premium_Proxies.pdf');
        setLog(t('log_pdf_done', fronts.length, totalPdfPages), 'ok');
    } catch (err) {
        setLog('Error during PDF rendering: ' + err.message, 'error');
    } finally {
        hideLoadingOverlay();
        document.getElementById('btn-pdf').disabled = false;
    }
}

async function updateAllToLatestArts() {

    // MODAL DE CONFIRMACIÓN
    const confirmed = confirm(t('confirm_latest_art'));

    if (!confirmed) {
        return;
    }

    const validCards = state.cards.filter(c => !c.error);

    if (validCards.length === 0) {
        return;
    }

    const targetLang = getGlobalLang();

    showLoadingOverlay(`Updating all arts to ${targetLang.toUpperCase()}...`);

    const tasks = validCards.map((card, index) => async () => {
        try {

            const query = `!"${card.name}" lang:${targetLang} -is:promo -is:digital`;

            const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;

            const res = await fetchWithRetry(url);

            const data = await res.json();

            if (data.data && data.data.length > 0) {

                const latest =
                    data.data.find(c => c.lang === targetLang)
                    || data.data[0];

                card.imageUrl = extractImageUrl(latest, 'small');
                card.imageUrlHQ = extractImageUrl(latest, 'normal');
                card.pdfImageUrl = extractImageUrl(latest, 'normal');

                card.imageUrl2 = extractFace2Url(latest, 'small');
                card.imageUrl2HQ = extractFace2Url(latest, 'normal');
                card.pdfImageUrl2 = extractFace2Url(latest, 'normal');

                card.face2Name = extractFace2Name(latest);

                card.lang = latest.lang || targetLang;
                card.printId = latest.id;
                card.setCode = latest.set
                    ? latest.set.toUpperCase()
                    : '---';

                card.hqLoaded = false;
                card._blob = null;
                card._blob2 = null;
            }

        } catch (e) {
            console.error("Error updating:", card.name, e);
        }

        setProgress(
            Math.round(((index + 1) / validCards.length) * 100)
        );
    });

    await runWithConcurrency(tasks, 3);

    hideLoadingOverlay();

    renderPreview();

    upgradePreviewHQ(state.cards);

    setLog(
        `✓ ${validCards.length} cards updated to latest arts.`,
        'ok'
    );
}
// Theming UI
function toggleTheme() {
    const curr = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = curr === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('aetherforge-theme', next); } catch(e) {}
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon  = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon)  icon.textContent  = theme === 'dark' ? '🌙' : '☀️';
    if (label) label.textContent = t(theme === 'dark' ? 'theme_dark' : 'theme_light');
}

// Restaurar tema guardado al cargar la página
(function initTheme() {
    try {
        const saved = localStorage.getItem('aetherforge-theme');
        if (saved === 'light' || saved === 'dark') applyTheme(saved);
    } catch(e) {}
})();

document.getElementById('deck-input').addEventListener('input', function () {
    updateStats(parseArena(this.value));
});
