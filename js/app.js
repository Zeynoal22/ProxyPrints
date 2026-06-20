// ── app.js ────────────────────────────────────────────────────────────────────
// Main orchestration: loadDeck, updateAllToLatestArts, and init listeners.
// Depends on: utils.js, state.js, api.js, ui.js, pdf.js

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

        // Aplica artes fijados manualmente en sesiones/cargas anteriores (state.pinnedPrints)
        // a las lineas que no traigan ya una anotacion (SET) num explicita. Esto permite
        // que el pin sobreviva a un "Sync Cards" aunque el textarea solo tenga el nombre.
        for (const entry of parsed) {
            if (entry.setCode && entry.collectorNumber) continue; // ya viene anotado en la linea
            const pin = state.pinnedPrints.get(normalizeCardName(entry.name));
            if (pin) {
                entry.setCode = pin.setCode;
                entry.collectorNumber = pin.collectorNumber;
            }
        }

        if (state.abortController) state.abortController.abort();
        const controller = new AbortController();
        state.abortController = controller;

        const targetLang = getGlobalLang();
        state.loading = true;
        state.cards = [];
        document.getElementById('btn-load').disabled = true;
        document.getElementById('btn-pdf').disabled = true;

        const uniqueNames = [...new Map(parsed.map(p => [normalizeCardName(p.name), p])).values()];

        // Separar tokens (prefijo T:) del resto — se resuelven con endpoint distinto
        const tokenEntries  = uniqueNames.filter(e => e._isToken);
        const normalEntries = uniqueNames.filter(e => !e._isToken);

        showLoadingOverlay(t('loading_phase1', uniqueNames.length));
        setLog('Searching Scryfall database...', '');

        const grid = document.getElementById('preview-grid');
        grid.innerHTML = Array(Math.min(uniqueNames.length, 8)).fill('<div class="skeleton-card"></div>').join('');

        // ── Phase 0: resolver tokens ──────────────────────────────────────────
        const enMap = new Map();
        if (tokenEntries.length > 0) {
            const tokenTasks = tokenEntries.map(entry => async () => {
                if (controller.signal.aborted) return;
                try {
                    // Scryfall: buscar por nombre exacto dentro de type:token
                    const q = encodeURIComponent(`!"${sanitizeNameForApi(entry.name)}" type:token`);
                    const res = await fetchWithRetry(
                        `https://api.scryfall.com/cards/search?q=${q}&order=released&dir=desc&unique=art`,
                        { signal: controller.signal }
                    );
                    if (res && res.ok) {
                        const data = await res.json();
                        const card = (data.data || []).find(c => hasValidImage(c));
                        if (card) {
                            enMap.set(normalizeCardName(entry.name), card);
                            enMap.set(normalizeCardName(card.name), card);
                            if (card.set && card.collector_number)
                                enMap.set(`${card.set}:${card.collector_number}`, card);
                        }
                    }
                } catch (e) { }
            });
            await runWithConcurrency(tokenTasks, 3);
        }
        if (controller.signal.aborted) return;

        // ── Phase 1: fetch EN base data (batch + fallback) ────────────────────
        let batchOk = false;
        try {
            for (let i = 0; i < normalEntries.length; i += 75) {
                if (controller.signal.aborted) break;
                const chunk = normalEntries.slice(i, i + 75);
                const { map } = await fetchCollectionBatch(chunk);
                for (const [k, v] of map) enMap.set(k, v);
                setProgress(Math.round(((i + 75) / normalEntries.length) * 40));
            }
            batchOk = true;
        } catch (e) { console.warn('Batch request failed, attempting manual searches', e); }

        if (!batchOk || enMap.size < uniqueNames.length) {
            const missing = normalEntries.filter(e =>
                !enMap.has(normalizeCardName(e.name)) &&
                !(e.setCode && e.collectorNumber && enMap.has(`${e.setCode}:${e.collectorNumber}`))
            );
            if (missing.length > 0) {
                let done = 0;
                const fallbackTasks = missing.map(entry => async () => {
                    if (controller.signal.aborted) return;
                    try {
                        const res = await fetchWithRetry(
                            'https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(sanitizeNameForApi(entry.name)),
                            { signal: controller.signal }
                        );
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

        // ── Phase 2: fetch localized versions (non-EN only) ───────────────────
        const langMap = new Map();
        if (targetLang !== 'en') {
            showLoadingOverlay(t('loading_phase2', targetLang.toUpperCase()));

            const needsLang = uniqueNames.map(e => {
                const pinnedKey = e.setCode && e.collectorNumber ? `${e.setCode}:${e.collectorNumber}` : null;
                const resolvedCard = (pinnedKey && enMap.get(pinnedKey)) || enMap.get(normalizeCardName(e.name));
                if (!resolvedCard) return null;
                const canonicalName = resolvedCard.name.split(' // ')[0].trim();
                return { entry: e, canonicalName, canonicalKey: normalizeCardName(canonicalName), pinnedKey };
            }).filter(Boolean);

            const pinnedEntries = needsLang.filter(n => n.pinnedKey);
            // freeEntries es mutable: las pineadas sin traducción caerán aquí tras el 404
            const freeEntries   = needsLang.filter(n => !n.pinnedKey);

            if (pinnedEntries.length > 0) {
                let done = 0;
                const pinnedTasks = pinnedEntries.map(({ entry, canonicalName, canonicalKey, pinnedKey }) => async () => {
                    if (controller.signal.aborted) return;
                    const cacheKey = pinnedKey + '|' + targetLang;
                    if (state.langCache[cacheKey]) {
                        langMap.set(normalizeCardName(entry.name), state.langCache[cacheKey]);
                    } else {
                        try {
                            const [setC, numC] = pinnedKey.split(':');
                            const url = `https://api.scryfall.com/cards/${setC}/${numC}/${targetLang}`;
                            const res = await fetchWithRetry(url, { signal: controller.signal });
                            if (res && res.ok) {
                                const card = await res.json();
                                if (hasValidImage(card)) {
                                    langMap.set(normalizeCardName(entry.name), card);
                                    state.langCache[cacheKey] = card;
                                } else {
                                    // Imagen no válida → soltar pin y buscar libre
                                    state.pinnedPrints.delete(normalizeCardName(entry.name));
                                    entry.setCode = null; entry.collectorNumber = null;
                                    freeEntries.push({ entry, canonicalName, canonicalKey });
                                }
                            } else {
                                // 404 u otro error → esa edición no existe en este idioma.
                                // Soltamos el pin y dejamos que el batch libre encuentre
                                // cualquier impresión traducida de esta carta.
                                state.pinnedPrints.delete(normalizeCardName(entry.name));
                                entry.setCode = null; entry.collectorNumber = null;
                                freeEntries.push({ entry, canonicalName, canonicalKey });
                            }
                        } catch (e) {
                            // Error de red → mismo fallback
                            state.pinnedPrints.delete(normalizeCardName(entry.name));
                            entry.setCode = null; entry.collectorNumber = null;
                            freeEntries.push({ entry, canonicalName, canonicalKey });
                        }
                    }
                    done++; setProgress(40 + Math.round((done / needsLang.length) * 40));
                });
                await runWithConcurrency(pinnedTasks, 4);
            }

            const toFetch = [];
            for (const { entry, canonicalName, canonicalKey } of freeEntries) {
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
                        for (const { entry, canonicalName, canonicalKey } of freeEntries) {
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

        // ── Phase 3: build cards[] ────────────────────────────────────────────
        let errors = 0;
        for (const { qty, name, setCode, collectorNumber, _isToken } of parsed) {
            const key = normalizeCardName(name);
            const pinnedKey = setCode && collectorNumber ? `${setCode}:${collectorNumber}` : null;

            const baseCard = (pinnedKey && enMap.get(pinnedKey)) || enMap.get(key);
            const langCard = langMap.get(key);
            const data = langCard || baseCard;

            if (!data) {
                errors++;
                state.cards.push({ qty, name, error: 'Not found in Scryfall database.' });
                continue;
            }
            const imageUrl = extractImageUrl(data, 'small');
            if (!imageUrl) {
                errors++;
                state.cards.push({ qty, name, error: 'No image available' });
                continue;
            }
            state.cards.push({
                qty,
                name:            data.name || name,
                imageUrl,
                imageUrlHQ:      extractImageUrl(data, 'normal'),
                pdfImageUrl:     extractImageUrl(data, 'normal'),
                imageUrl2:       extractFace2Url(data, 'small'),
                imageUrl2HQ:     extractFace2Url(data, 'normal'),
                pdfImageUrl2:    extractFace2Url(data, 'normal'),
                face2Name:       extractFace2Name(data),
                lang:            data.lang || targetLang,
                printId:         data.id,
                setCode:         data.set ? data.set.toUpperCase() : '---',
                collectorNumber: data.collector_number || null,
                error:           false,
                hqLoaded:        false,
                _isToken:        !!_isToken,
                // Si esta carta llegó con set+número (línea explícita o pin recuperado de
                // state.pinnedPrints), queda marcada como fijada para que syncDeckInput
                // siga anotándola y el pin persista en próximas recargas.
                _pinnedPrint:    !!pinnedKey
            });
        }

        setProgress(100);
        renderPreview();
        updateStats(state.cards.filter(c => !c.error));

        const totalOk = state.cards.filter(c => !c.error).length;
        if (totalOk === 0) setLog(t('log_error_none'), 'error');
        else if (errors > 0) setLog(t('log_done_errors', totalOk, errors), 'error');
        else {
            setLog(t('log_done', totalOk), 'ok');
            document.getElementById('step-4').classList.add('active');
        }

        if (totalOk > 0) document.getElementById('btn-pdf').disabled = false;

        syncDeckInput();
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

async function updateAllToLatestArts() {
    const confirmed = confirm(t('confirm_latest_art'));
    if (!confirmed) return;

    const validCards = state.cards.filter(c => !c.error);
    if (validCards.length === 0) return;

    const targetLang = getGlobalLang();
    showLoadingOverlay(`Updating all arts to ${targetLang.toUpperCase()}...`);

    const tasks = validCards.map((card, index) => async () => {
        try {
            const query = `!"${card.name}" lang:${targetLang} -is:promo -is:digital`;
            const url   = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`;
            const res   = await fetchWithRetry(url);
            const data  = await res.json();

            if (data.data && data.data.length > 0) {
                const latest = data.data.find(c => c.lang === targetLang) || data.data[0];

                card.imageUrl     = extractImageUrl(latest, 'small');
                card.imageUrlHQ   = extractImageUrl(latest, 'normal');
                card.pdfImageUrl  = extractImageUrl(latest, 'normal');
                card.imageUrl2    = extractFace2Url(latest, 'small');
                card.imageUrl2HQ  = extractFace2Url(latest, 'normal');
                card.pdfImageUrl2 = extractFace2Url(latest, 'normal');
                card.face2Name    = extractFace2Name(latest);
                card.lang         = latest.lang || targetLang;
                card.printId      = latest.id;
                card.setCode      = latest.set ? latest.set.toUpperCase() : '---';
                card.collectorNumber = latest.collector_number || null;
                card.hqLoaded     = false;
                card._blob        = null;
                card._blob2       = null;
                // "Latest Arts" es lo opuesto a fijar una edición concreta: suelta el pin
                // para que futuras recargas vuelvan a tomar la edición más reciente.
                if (card._pinnedPrint) state.pinnedPrints.delete(normalizeCardName(card.name));
                card._pinnedPrint = false;
            }
        } catch (e) {
            console.error("Error updating:", card.name, e);
        }
        setProgress(Math.round(((index + 1) / validCards.length) * 100));
    });

    await runWithConcurrency(tasks, 3);

    hideLoadingOverlay();
    renderPreview();
    upgradePreviewHQ(state.cards);
    setLog(`✓ ${validCards.length} cards updated to latest arts.`, 'ok');
}


// ── Sync textarea from state.cards ───────────────────────────────────────────
// Reconstruye el textarea de la izquierda a partir de state.cards.
// Se llama tras cualquier operación que modifique el mazo (drop, remove, qty).
function syncDeckInput() {
    const inputEl = document.getElementById('deck-input');
    if (!inputEl) return;
    inputEl.value = state.cards
        .filter(c => !c._isCustom)
        .map(c => {
            if (c.error) return `${c.qty} ${c._isToken ? 'T:' : ''}${c.name}`;
            const prefix = c._isToken ? 'T:' : '';
            if (c._pinnedPrint && c.setCode && c.setCode !== '---' && c.collectorNumber) {
                return `${c.qty} ${prefix}${c.name} (${c.setCode}) ${c.collectorNumber}`;
            }
            return `${c.qty} ${prefix}${c.name}`;
        })
        .join('\n');
    updateStats(state.cards.filter(c => !c.error));
    persistDeckState();
}

// ── Help panel ────────────────────────────────────────────────────────────────
function toggleHelpPanel() {
    const panel   = document.getElementById('help-panel');
    const overlay = document.getElementById('help-overlay');
    const isOpen  = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    document.body.style.overflow = isOpen ? '' : 'hidden';
}

function copyExample(btn) {
    const pre = btn.closest('.help-example').querySelector('pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent.trim()).then(() => {
        btn.classList.add('copied');
        const span = btn.querySelector('span');
        const original = span.textContent;
        span.textContent = '✓';
        setTimeout(() => { btn.classList.remove('copied'); span.textContent = original; }, 1800);
    }).catch(() => {
        // Fallback para navegadores sin clipboard API
        const ta = document.createElement('textarea');
        ta.value = pre.textContent.trim();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

// ── localStorage persistence ──────────────────────────────────────────────────
const LS_KEY = 'proxyprints_deck';

function persistDeckState() {
    try {
        const inputEl = document.getElementById('deck-input');
        const payload = {
            decklist: inputEl ? inputEl.value : '',
            pinnedPrints: [...state.pinnedPrints.entries()],  // Map → array serializable
            savedAt: Date.now()
        };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e) { /* cuota excedida u otro error, ignorar silenciosamente */ }
}

function restoreLastDeck() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw);

        // Restaurar decklist en el textarea
        const inputEl = document.getElementById('deck-input');
        if (inputEl && payload.decklist) {
            inputEl.value = payload.decklist;
            updateStats(parseArena(payload.decklist));
        }

        // Restaurar pinnedPrints
        if (Array.isArray(payload.pinnedPrints)) {
            state.pinnedPrints = new Map(payload.pinnedPrints);
        }

        // Lanzar carga automáticamente para que el grid se reconstruya
        loadDeck();
    } catch (e) {
        console.warn('ProxyPrints: error restaurando mazo anterior', e);
    }
}

function initRestoreButton() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw);
        // Solo mostrar el botón si hay algo guardado con al menos una carta
        if (payload.decklist && payload.decklist.trim().length > 3) {
            const btn = document.getElementById('btn-restore');
            if (btn) btn.style.display = '';
        }
    } catch (e) { }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById('deck-input').addEventListener('input', function () {
    updateStats(parseArena(this.value));
    persistDeckState();  // Guardar también cuando el usuario escribe manualmente
});

initRestoreButton();
