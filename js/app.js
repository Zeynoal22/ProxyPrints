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
                line = line.replace(/\s+\([A-Z0-9]+\)\s*\d*$/i, '').trim();
                const m = line.match(/^(\d+)[xX]?\s+(.+?)\s*$/);
                let qty, name;
                if (m) { qty = parseInt(m[1], 10); name = m[2].trim(); } else if (line.length > 1) { qty = 1; name = line; } else continue;
                name = name.replace(/\s+\/\/\s+/g, ' // ').replace(/\s+\/\s+/g, ' // ');
                name = name.split(' // ')[0].trim();
                if (qty > 0 && name) result.push({ qty, name });
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

        async function fetchCollectionBatch(names) {
            const cleaned = names.map(n => String(n).trim()).filter(Boolean);
            const body = JSON.stringify({ identifiers: cleaned.map(name => ({ name })) });
            const res = await fetchWithRetry('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
            if (!res || !res.ok) throw new Error('Error in batch collection');
            const data = await res.json();
            const map = new Map();
            for (const card of (data.data || [])) {
                map.set(normalizeCardName(card.name), card);
                if (card.name.includes(' // ')) map.set(normalizeCardName(card.name.split(' // ')[0].trim()), card);
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

        function renderPreview() {
            const grid = document.getElementById('preview-grid');
            if (!state.cards.length) {
                grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🃏</div><span>The studio is ready. Import a competitive deck to preview the assets.</span></div>`;
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
                    const badgeLang = card.lang !== 'en' ? `<span class="card-badge-ui">${card.lang.toUpperCase()}</span>` : '';
                    const badgeDfc = card.imageUrl2 ? `<span class="card-badge-ui" style="background:#4c1d95; border-color:#7c3aed;" title="${card.face2Name || 'Back face'}">DFC</span>` : '';
                    const setCode = card.setCode || '---';

                    block.innerHTML = `
                                    <img src="${card.imageUrl}" alt="${card.name}" loading="lazy" />
                                    <div class="card-meta-overlay">
                                        <div class="card-info-top">
                                            <span class="card-badge-ui" style="background:var(--gold-dim); color:#000; padding:2px 6px;">x${card.qty}</span>
                                            <button class="card-remove-btn" onclick="event.stopPropagation(); removeCard(${index})">✕</button>
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

                showLoadingOverlay('Initiating card forge...');
                setLog('Searching Scryfall database...', '');

                const uniqueNames = [...new Map(parsed.map(p => [normalizeCardName(p.name), p.name])).values()];

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
                    const missing = uniqueNames.filter(n => !enMap.has(normalizeCardName(n)));
                    if (missing.length > 0) {
                        let done = 0;
                        const fallbackTasks = missing.map(name => async () => {
                            if (controller.signal.aborted) return;
                            try {
                                const res = await fetchWithRetry('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(name), { signal: controller.signal });
                                if (res && res.ok) {
                                    const card = await res.json();
                                    enMap.set(normalizeCardName(card.name), card);
                                    if (card.name.includes(' // ')) enMap.set(normalizeCardName(card.name.split(' // ')[0].trim()), card);
                                    enMap.set(normalizeCardName(name), card);
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
                    showLoadingOverlay(`Translating catalog (${targetLang.toUpperCase()})...`);
                    const needsLang = uniqueNames.filter(n => enMap.get(normalizeCardName(n)));
                    const toFetch = [];
                    for (const name of needsLang) {
                        const cacheKey = normalizeCardName(name) + '|' + targetLang;
                        if (state.langCache[cacheKey]) langMap.set(normalizeCardName(name), state.langCache[cacheKey]);
                        else toFetch.push(name);
                    }
                    if (toFetch.length > 0) {
                        const batches = [];
                        for (let i = 0; i < toFetch.length; i += 12) batches.push(toFetch.slice(i, i + 12));
                        let done = 0;
                        for (const batch of batches) {
                            if (controller.signal.aborted) break;
                            try {
                                const batchMap = await fetchCardLangBatch(batch, targetLang, controller.signal);
                                for (const name of batch) {
                                    const key = normalizeCardName(name);
                                    const card = batchMap.get(key);
                                    if (card) { langMap.set(key, card); state.langCache[key + '|' + targetLang] = card; }
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
                for (const { qty, name } of parsed) {
                    const key = normalizeCardName(name);
                    const data = langMap.get(key) || enMap.get(key);
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
                renderPreview(state.cards);
                updateStats(state.cards.filter(c => !c.error));

                const totalOk = state.cards.filter(c => !c.error).length;
                if (totalOk === 0) setLog('Could not load any cards. Check the names.', 'error');
                else if (errors > 0) setLog(`Done with ${errors} error(s). Sync completed.`, 'error');
                else { setLog(`Sync completed successfully. ${totalOk} cards processed.`, 'ok'); document.getElementById('step-4').classList.add('active'); }

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
            if (!card || card.error) return;
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

        async function loadPrints(name, lang) {
            const grid = document.getElementById('prints-grid');
            grid.innerHTML = '<div class="prints-loading" style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);"><div class="spinner-ring" style="margin:0 auto 12px;"></div> Indexing alternative arts...</div>';
            document.getElementById('modal-print-count').textContent = '';

            const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" lang:${lang}`)}&unique=prints&order=released&dir=asc`;
            try {
                let res = await fetchWithRetry(url);
                let data = res && res.ok ? await res.json() : null;

                if (!data || !data.data || data.data.length === 0) {
                    if (lang !== 'en') {
                        res = await fetchWithRetry(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}"`)}&unique=prints&order=released&dir=asc`);
                        data = res && res.ok ? await res.json() : null;
                    }
                    if (!data || !data.data) {
                        grid.innerHTML = '<div class="no-prints" style="grid-column:1/-1;text-align:center;padding:40px;">No variants found.</div>';
                        return;
                    }
                }

                modal.prints = data.data.filter(c => extractImageUrl(c, 'small'));
                document.getElementById('modal-print-count').textContent = `${modal.prints.length} Editions located`;

                grid.innerHTML = '';
                modal.prints.forEach(p => {
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

                if (modal.prints.some(p => p.id === modal.selectedPrintId)) document.getElementById('btn-apply').disabled = false;
            } catch (e) {
                grid.innerHTML = '<div class="no-prints" style="grid-column:1/-1;text-align:center;padding:40px;">Connection error.</div>';
            }
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
            const unique = state.cards.filter(c => !c.error && c.pdfImageUrl);
            if (!unique.length) { setLog('No valid cards for PDF.', 'error'); return }

            showLoadingOverlay('Compiling PDF and injecting high-resolution arts...');
            setProgress(5);
            document.getElementById('btn-pdf').disabled = true;

            const concurrency = Math.min(navigator.hardwareConcurrency || 8, 10);
            let done = 0;

            const tasks = unique.map(card => async () => {
                try {
                    if (!card._blob) card._blob = await fetchImageBlob(card.pdfImageUrl);
                    if (card.pdfImageUrl2 && !card._blob2) card._blob2 = await fetchImageBlob(card.pdfImageUrl2);
                } catch (e) { console.error("Download error: " + card.name, e); }
                done++; setProgress(5 + Math.round((done / unique.length) * 40));
            });

            await runWithConcurrency(tasks, concurrency);

            const dfcMode = document.getElementById('pdf-dfc').value;
            const deck = [];

            for (const card of state.cards) {
                if (card.error || !card._blob) continue;
                const isDFC = !!card.pdfImageUrl2;
                for (let i = 0; i < card.qty; i++) {
                    deck.push({ ...card, _useBlob: card._blob, _faceLabel: isDFC && dfcMode === 'both' ? 'F1' : null });
                    if (isDFC && card._blob2 && dfcMode === 'both') {
                        deck.push({ ...card, _useBlob: card._blob2, _faceLabel: 'F2' });
                    }
                }
            }

            try {
                const { jsPDF } = window.jspdf;
                const isA4 = document.getElementById('pdf-paper').value === 'a4';
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: isA4 ? 'a4' : 'letter', compress: true });

                const PAGE_W = isA4 ? 210 : 215.9;
                const PAGE_H = isA4 ? 297 : 279.4;
                const CARD_W = 63, CARD_H = 88;
                const MX = (PAGE_W - (CARD_W * 3)) / 2;
                const MY = (PAGE_H - (CARD_H * 3)) / 2;
                const marks = document.getElementById('pdf-marks').value === 'yes';

                for (let i = 0; i < deck.length; i++) {
                    const pos = i % 9;
                    if (pos === 0 && i > 0) doc.addPage();
                    const col = pos % 3, row = Math.floor(pos / 3);
                    const x = MX + col * CARD_W, y = MY + row * CARD_H;

                    try {
                        const bitmap = await createImageBitmap(deck[i]._useBlob);
                        const canvas = document.createElement('canvas');
                        canvas.width = bitmap.width; canvas.height = bitmap.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(bitmap, 0, 0);
                        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, CARD_W, CARD_H, undefined, 'FAST');
                    } catch (e) { console.error("Error rendering PDF img", e); }

                    if (marks) {
                        doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.1);
                        if (col === 0) { doc.line(x - 4, y, x, y); doc.line(x - 4, y + CARD_H, x, y + CARD_H); }
                        if (col === 2) { doc.line(x + CARD_W, y, x + CARD_W + 4, y); doc.line(x + CARD_W, y + CARD_H, x + CARD_W + 4, y + CARD_H); }
                        if (row === 0) { doc.line(x, y - 4, x, y); doc.line(x + CARD_W, y - 4, x + CARD_W, y); }
                        if (row === 2) { doc.line(x, y + CARD_H, x, y + CARD_H + 4); doc.line(x + CARD_W, y + CARD_H, x + CARD_W + 4, y + CARD_H + 4); }
                    }

                    if (deck[i]._faceLabel) {
                        doc.setFontSize(6); doc.setTextColor(200, 150, 255);
                        doc.text(deck[i]._faceLabel, x + CARD_W - 1, y + CARD_H - 1.5, { align: 'right' });
                        doc.setTextColor(0, 0, 0);
                    }
                    setProgress(45 + Math.round(((i + 1) / deck.length) * 55));
                }

                doc.save('MTG_Forge_Premium_Proxies.pdf');
                setLog(`✓ PDF Generated: ${deck.length} cards total.`, 'ok');
            } catch (err) {
                setLog('Error during PDF rendering: ' + err.message, 'error');
            } finally {
                hideLoadingOverlay();
                document.getElementById('btn-pdf').disabled = false;
            }
        }

        // Theming UI
        function toggleTheme() {
            const curr = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = curr === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            document.getElementById('theme-icon').textContent = next === 'dark' ? '🌙' : '☀️';
            document.getElementById('theme-label').textContent = next === 'dark' ? 'Dark' : 'Light';
        }

        document.getElementById('deck-input').addEventListener('input', function () {
            updateStats(parseArena(this.value));
        });