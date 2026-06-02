// ── ui.js ─────────────────────────────────────────────────────────────────────
// All DOM rendering, UI helpers, modal logic, theme, and card interactions.
// Depends on: utils.js, state.js, api.js

// ── Basic land helpers ────────────────────────────────────────────────────────
const BASIC_LAND_NAMES = new Set(['plains','island','swamp','mountain','forest','wastes','snow-covered plains','snow-covered island','snow-covered swamp','snow-covered mountain','snow-covered forest']);

function isBasicLand(card) {
    return !!(card?.type_line?.toLowerCase().includes('basic land'));
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function getGlobalLang() {
    return document.getElementById('global-lang').value;
}

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

// ── Theme ─────────────────────────────────────────────────────────────────────
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

(function initTheme() {
    try {
        const saved = localStorage.getItem('aetherforge-theme');
        if (saved === 'light' || saved === 'dark') applyTheme(saved);
    } catch(e) {}
})();

// ── Preview grid ──────────────────────────────────────────────────────────────
function renderPreview() {
    const grid = document.getElementById('preview-grid');
    if (!state.cards.length) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🃏</div><span style="font-size:0.9rem;" data-i18n="empty_state">${t('empty_state')}</span></div>`;
        return;
    }

    grid.innerHTML = '';
    state.cards.forEach((card, index) => {
        const block = document.createElement('div');
        
        // REQUISITO 3: Clases visuales de selección según el estado de la carta
        const isSelected = card._selectedForBack;
        const duplexActive = document.getElementById('pdf-duplex')?.value === 'yes';
        
        block.className = `card-thumb ${duplexActive && isSelected ? 'selected-back' : ''}`;
        block.dataset.cardIdx = index;

        if (card.error) {
            // ... mantener código de error intacto ...
        } else {
            const badgeLang = card._isCustom
                ? `<span class="card-badge-ui badge-custom">CUST</span>`
                : card.lang !== 'en' ? `<span class="card-badge-ui">${card.lang.toUpperCase()}</span>` : '';
            const badgeDfc = card.imageUrl2 ? `<span class="card-badge-ui" style="background:#4c1d95; border-color:#7c3aed;" title="${card.face2Name || 'Back face'}">DFC</span>` : '';
            const badgeBack = card.backUrl ? `<span class="card-badge-ui" style="background:var(--gold); color:#000; border-color:var(--gold); font-weight:bold;">BACK</span>` : '';
            const setCode = card.setCode || '---';

            // REQUISITO 4: Determinar qué cara renderizar en el grid según el switch de previsualización
            const defaultGenericBack = 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/513b7bfa-42c9-4d08-ad6c-8e5d478c42d3/dalfpib-83f22b02-5802-40b4-901b-3eecf0ca2058.png/v1/fit/w_828,h_1182,q_70,strp/unofficial_magic_the_gathering_six_color_card_back_by_lordnyriox_dalfpib-414w-2x.jpg';
            const targetImage = state._previewBacksActive 
    ? (card.backUrl || DEFAULT_CARD_BACK) 
    : card.imageUrl;

            // Inyectamos un checkmark flotante si la carta está seleccionada (Como en MPC/MPCAutofill)
            const indicatorCheck = (duplexActive && isSelected) ? `<div class="card-back-indicator">✓</div>` : '';

            block.innerHTML = `
                <img src="${targetImage}" alt="${card.name}" loading="lazy" />
                ${indicatorCheck}
                <div class="card-meta-overlay">
                    <div class="card-info-top">
                        <div class="qty-stepper" onclick="event.stopPropagation()">
                            <button class="qty-btn" onclick="changeQty(${index}, -1)">−</button>
                            <span class="qty-display">${card.qty}</span>
                            <button class="qty-btn" onclick="changeQty(${index}, +1)">+</button>
                        </div>
                        <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
                            <button class="card-dup-btn" title="Duplicate as independent copy" onclick="duplicateCard(${index})">⧉</button>
                            <button class="card-remove-btn" onclick="removeCard(${index})">✕</button>
                        </div>
                    </div>
                    <div class="card-info-bottom">
                        <div class="card-title-text">${card.name}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <span class="card-set-text">${setCode}</span>
                            <div style="display:flex; gap:4px; margin-left:auto;">${badgeLang}${badgeDfc}${badgeBack}</div>
                        </div>
                    </div>
                </div>
            `;

            // REQUISITO 3: Al hacer click en el cuerpo de la carta se selecciona/deselecciona si doble cara está activo
            block.onclick = (e) => {
                if (duplexActive) {
                    card._selectedForBack = !card._selectedForBack;
                    renderPreview();
                } else {
                    openModal(index);
                }
            };
        }
        grid.appendChild(block);
    });

    if (state.cards.length > 0) document.getElementById('step-3').classList.add('active');
    updateBulkBackPanel(); 
}

// ── HQ image upgrade ──────────────────────────────────────────────────────────
async function upgradePreviewHQ(cards) {
    const batchId = ++upgradePreviewHQ._id;
    const valid = cards.filter(c => !c.error && c.imageUrlHQ && !c.hqLoaded);
    if (!valid.length) return;

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
    }
}
upgradePreviewHQ._id = 0;

// ── Card actions ──────────────────────────────────────────────────────────────
function removeCard(i) {
    state.cards.splice(i, 1);
    updateStats(state.cards.filter(c => !c.error));
    renderPreview();
    if (typeof syncDeckInput === 'function') syncDeckInput();
}

function changeQty(index, delta) {
    const card = state.cards[index];
    if (!card) return;
    const newQty = Math.max(1, Math.min(99, (card.qty || 1) + delta));
    if (newQty === card.qty) return;
    card.qty = newQty;
    const thumb = document.querySelector(`.card-thumb[data-card-idx="${index}"]`);
    if (thumb) {
        const display = thumb.querySelector('.qty-display');
        if (display) display.textContent = newQty;
    }
    updateStats(state.cards.filter(c => !c.error));
    if (typeof syncDeckInput === 'function') syncDeckInput();
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

function duplicateCard(i) {
    const original = state.cards[i];
    if (!original) return;
    const clone = Object.assign({}, original, {
        _uid: Math.random().toString(36).slice(2),
        _blob: null,
        _blob2: null,
        qty: 1,
    });
    state.cards.splice(i + 1, 0, clone);
    updateStats(state.cards.filter(c => !c.error));
    renderPreview();
}

// ── Custom image upload ───────────────────────────────────────────────────────
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
    input.value = '';
    updateStats(state.cards.filter(c => !c.error));
    document.getElementById('btn-pdf').disabled = false;
    renderPreview();
    setLog(`✓ ${files.length} custom image(s) added.`, 'ok');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
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

async function loadPrints(name, lang) {
    const grid = document.getElementById('prints-grid');
    grid.innerHTML = '<div class="prints-loading" style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);"><div class="spinner-ring" style="margin:0 auto 12px;"></div> Indexing alternative arts...</div>';
    document.getElementById('modal-print-count').textContent = '';

    const yearSelect = document.getElementById('modal-year-filter');
    const yearLabel  = document.getElementById('modal-year-label');
    yearSelect.style.display = 'none';
    yearLabel.style.display  = 'none';

    try {
        let allCards = await fetchAllPages(
            `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" lang:${lang}`)}&unique=prints&order=released&dir=desc`
        );

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
            buckets.reverse();
            yearSelect.innerHTML = buckets.map(b => `<option value="${b.min}-${b.max}">${b.label}</option>`).join('');
            yearSelect.value = `${buckets[0].min}-${buckets[0].max}`;
            yearSelect.style.display = '';
            yearLabel.style.display  = '';
        }

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
    modal.currentLang = lang;
    modal.selectedPrintId = null;
    const card = state.cards[modal.cardIndex];
    if (card) await loadPrints(card.name, lang);
}

function applySelection() {
    if (modal.cardIndex < 0 || !modal.selectedPrintId) return;
    const print = modal.prints.find(p => p.id === modal.selectedPrintId);
    if (!print) return;

    // Detectar la calidad seleccionada en la UI
    const pdfQuality = document.getElementById('pdf-quality')?.value || '300';
    
    // Determinar el mejor formato de Scryfall disponible
    let scryfallSize = 'normal';
    if (pdfQuality === '600') {
        scryfallSize = 'png';    // Calidad máxima sin compresión
    } else if (pdfQuality === '300') {
        scryfallSize = 'large';  // Alta resolución estándar
    }

    const card = state.cards[modal.cardIndex];
    card.imageUrl     = extractImageUrl(print, 'small');
    card.imageUrlHQ   = extractImageUrl(print, 'normal');
    
    // Asignación dinámica basada en la resolución elegida
    card.pdfImageUrl  = extractImageUrl(print, scryfallSize); 
    
    card.imageUrl2    = extractFace2Url(print, 'small');
    card.imageUrl2HQ  = extractFace2Url(print, 'normal');
    
    // Lo mismo para cartas de doble cara (DFC)
    card.pdfImageUrl2 = extractFace2Url(print, scryfallSize); 

    card.face2Name    = extractFace2Name(print);
    card.lang         = print.lang || modal.currentLang;
    card.printId      = print.id;
    card.setCode      = print.set ? print.set.toUpperCase() : '---';
    card.hqLoaded     = false;
    card._blob = null; card._blob2 = null;

    const inputEl = document.getElementById('deck-input');
    if (inputEl && print.set && print.collector_number) {
        const parsed = parseArena(inputEl.value);
        if (parsed.length > 0 && modal.cardIndex < parsed.length) {
            const lines = inputEl.value.split('\n');
            let targetMatchIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (!line || /^(Deck|Sideboard|Commander|Companion|About)$/i.test(line)) continue;
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

function closeModalOnOverlay(e) {
    if (e.target === document.getElementById('art-modal')) closeModal();
}

// ── Lógica Multi-Back para impresión a doble cara ──────────────────────────────
// ── LÓGICA MULTI-BACK CORREGIDA (URLs estables sin expiración de Token) ──────
const BACK_PRESETS = [
    { name: 'Original Magic Back', url: 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/513b7bfa-42c9-4d08-ad6c-8e5d478c42d3/dalfpib-83f22b02-5802-40b4-901b-3eecf0ca2058.png/v1/fit/w_828,h_1182,q_70,strp/unofficial_magic_the_gathering_six_color_card_back_by_lordnyriox_dalfpib-414w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTQ2MyIsInBhdGgiOiIvZi81MTNiN2JmYS00MmM5LTRkMDgtYWQ2Yy04ZTVkNDc4YzQyZDMvZGFsZnBpYi04M2YyMmIwMi01ODAyLTQwYjQtOTAxYi0zZWVjZjBjYTIwNTgucG5nIiwid2lkdGgiOiI8PTEwMjQifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.E6ain-taz3WAOjHlySF768nq0Id5NkQMRzOrm95OGXY' },
    { name: 'Sleek Charcoal Deck', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80' },
    { name: 'Cosmic Gold Deck', url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&q=80' }
];

// Aseguramos una URL maestra por defecto para las cartas que no tengan reverso asignado todavía
const DEFAULT_CARD_BACK = 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/513b7bfa-42c9-4d08-ad6c-8e5d478c42d3/dalfpib-83f22b02-5802-40b4-901b-3eecf0ca2058.png/v1/fit/w_828,h_1182,q_70,strp/unofficial_magic_the_gathering_six_color_card_back_by_lordnyriox_dalfpib-414w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTQ2MyIsInBhdGgiOiIvZi81MTNiN2JmYS00MmM5LTRkMDgtYWQ2Yy04ZTVkNDc4YzQyZDMvZGFsZnBpYi04M2YyMmIwMi01ODAyLTQwYjQtOTAxYi0zZWVjZjBjYTIwNTgucG5nIiwid2lkdGgiOiI8PTEwMjQifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.E6ain-taz3WAOjHlySF768nq0Id5NkQMRzOrm95OGXY';

// Estado global
if (typeof state._previewBacksActive === 'undefined') {
    state._previewBacksActive = false;
}

function onDuplexChange() {
    const duplexMode = document.getElementById('pdf-duplex').value === 'yes';
    if (!duplexMode) {
        state.cards.forEach(c => c._selectedForBack = false);
        state._previewBacksActive = false;
    }
    renderPreview();
}

function updateBulkBackPanel() {
    const panel = document.getElementById('bulk-back-panel');
    if (!panel) return;

    const duplexMode = document.getElementById('pdf-duplex').value === 'yes';
    const selectedCount = state.cards.filter(c => c._selectedForBack).length;

    if (duplexMode && state.cards.length > 0) {
        panel.classList.add('active');
        document.getElementById('bulk-select-count').textContent = selectedCount;

        const presetsContainer = document.getElementById('back-presets-list');
        if (presetsContainer && !presetsContainer.children.length) {
            presetsContainer.innerHTML = BACK_PRESETS.map(p => `
                <div class="back-preset-item" title="${p.name}" onclick="assignBackToSelected('${p.url}')">
                    <img src="${p.url}" alt="${p.name}" />
                </div>
            `).join('');
        }
    } else {
        panel.classList.remove('active');
    }
}

function assignBackToSelected(url) {
    const selectedCards = state.cards.filter(c => c._selectedForBack);
    if (!selectedCards.length) {
        // Traducción dinámica del error de selección
        setLog(t('log_select_back_error'), 'error');
        return;
    }
    
    selectedCards.forEach(card => {
        card.backUrl = url;
        card._backBlob = null; 
        card._selectedForBack = false;
    });

    // Traducción dinámica del Log de éxito (usando función i18n con argumentos de conteo)
    setLog(t('log_back_assigned', selectedCards.length), 'ok');
    renderPreview();
}

function handleCustomBackUpload(input) {
    const file = input.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    assignBackToSelected(objectUrl);
    input.value = '';
}

function clearBackSelection() {
    state.cards.forEach(c => c._selectedForBack = false);
    renderPreview();
}

// REQUISITO 2 (Solución): Forzar el refresco de las imágenes de reverso con fallback inmediato
function toggleBackPreviewMode() {
    state._previewBacksActive = !state._previewBacksActive;
    const btn = document.getElementById('btn-toggle-back-preview');
    if (btn) {
        // Traduce dinámicamente el botón dependiendo del estado del "ojo"
        btn.textContent = state._previewBacksActive ? t('btn_view_fronts') : t('btn_preview_backs');
        if (state._previewBacksActive) {
            btn.classList.add('btn-gold');
        } else {
            btn.classList.remove('btn-gold');
        }
    }
    renderPreview();
}
