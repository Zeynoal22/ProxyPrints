// ── drop.js ───────────────────────────────────────────────────────────────────
// Drag & drop support. Accepts cards dragged from Scryfall, EDHREC, Moxfield
// and any plain-text card name or Scryfall URL.
// Depends on: utils.js, state.js, api.js, ui.js

// ── Parse a drop event into { name, setCode, collectorNumber } or null ────────
function parseDropData(e) {
    const plain = (e.dataTransfer.getData('text/plain') || '').trim();
    const uris  = (e.dataTransfer.getData('text/uri-list') || '').trim();
    const html  = (e.dataTransfer.getData('text/html') || '').trim();

    // 1. URL de Scryfall con set + collector number
    //    Formatos conocidos:
    //      https://scryfall.com/card/mh3/237/sol-ring
    //      https://cards.scryfall.io/large/front/...  (no útil directamente)
    for (const candidate of [plain, uris]) {
        const m = candidate.match(/scryfall\.com\/card\/([a-z0-9]{2,6})\/(\d+[a-z]?)\//i);
        if (m) return { name: null, setCode: m[1].toLowerCase(), collectorNumber: m[2] };
    }

    // 2. Nombre de carta extraído del HTML (EDHREC, Moxfield arrastran el nombre en el atributo alt o data-*)
    if (html) {
        const altMatch    = html.match(/alt="([^"]+)"/i);
        const dataMatch   = html.match(/data-card-name="([^"]+)"/i);
        const titleMatch  = html.match(/title="([^"]+)"/i);
        const candidate   = (dataMatch || altMatch || titleMatch)?.[1]?.trim();
        // Descartar nombres vacíos, URLs o texto genérico
        if (candidate && candidate.length > 1 && !candidate.startsWith('http')) {
            return { name: candidate, setCode: null, collectorNumber: null };
        }
    }

    // 3. Texto plano — puede ser nombre de carta o URL no-Scryfall
    if (plain && !plain.startsWith('http') && plain.length > 1) {
        // Filtramos basura: si tiene saltos de línea o es muy largo, ignoramos
        const singleLine = plain.split('\n')[0].trim();
        if (singleLine.length > 1 && singleLine.length < 120) {
            return { name: singleLine, setCode: null, collectorNumber: null };
        }
    }

    return null;
}

// ── Resolve the parsed data to a Scryfall card object and add to state ────────
async function resolveAndAddDroppedCard(parsed) {
    const { name, setCode, collectorNumber } = parsed;

    let entry;
    if (setCode && collectorNumber) {
        entry = { setCode, collectorNumber };
    } else if (name) {
        entry = { name };
    } else {
        return null;
    }

    const { map } = await fetchCollectionBatch([entry]);

    let data = null;
    if (setCode && collectorNumber) {
        data = map.get(`${setCode}:${collectorNumber}`);
    }
    if (!data && name) {
        data = map.get(normalizeCardName(name));
    }
    if (!data && map.size > 0) {
        data = map.values().next().value;
    }

    if (!data) return null;

    const imageUrl = extractImageUrl(data, 'small');
    if (!imageUrl) return null;

    // Comprobar si la carta ya existe en el mazo — si sí, incrementar cantidad
    const existingIdx = state.cards.findIndex(
        c => !c.error && normalizeCardName(c.name) === normalizeCardName(data.name)
    );
    if (existingIdx >= 0) {
        const existing = state.cards[existingIdx];
        existing.qty = Math.min(99, existing.qty + 1);
        return { card: existing, existed: true };
    }

    const card = {
        qty:             1,
        name:            data.name,
        imageUrl,
        imageUrlHQ:      extractImageUrl(data, 'normal'),
        pdfImageUrl:     extractImageUrl(data, 'normal'),
        imageUrl2:       extractFace2Url(data, 'small'),
        imageUrl2HQ:     extractFace2Url(data, 'normal'),
        pdfImageUrl2:    extractFace2Url(data, 'normal'),
        face2Name:       extractFace2Name(data),
        lang:            data.lang || 'en',
        printId:         data.id,
        setCode:         data.set ? data.set.toUpperCase() : '---',
        collectorNumber: data.collector_number || null,
        error:           false,
        hqLoaded:        false,
    };
    state.cards.push(card);
    return { card, existed: false };
}

// ── Visual feedback helpers ───────────────────────────────────────────────────
function setDropState(el, active) {
    el.classList.toggle('drop-active', active);
}

function showDropToast(msg, type = 'ok') {
    // Reutilizamos setLog del sistema existente
    setLog(msg, type);
    // Auto-limpiar después de 3s si es ok
    if (type === 'ok') setTimeout(() => setLog('', ''), 3000);
}

// ── Init drop listeners ───────────────────────────────────────────────────────
function initDrop() {
    // Zonas de drop: el grid de preview Y el textarea del decklist
    const zones = [
        document.getElementById('preview-grid'),
        document.getElementById('deck-input'),
    ].filter(Boolean);

    zones.forEach(zone => {
        zone.addEventListener('dragenter', e => {
            // Solo activar si viene algo arrastrable (no nuestros propios thumbs)
            if (e.dataTransfer.types.includes('text/plain') ||
                e.dataTransfer.types.includes('text/uri-list') ||
                e.dataTransfer.types.includes('text/html')) {
                e.preventDefault();
                setDropState(zone, true);
            }
        });

        zone.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        zone.addEventListener('dragleave', e => {
            // dragleave se dispara también al entrar en hijos — ignorar esos casos
            if (!zone.contains(e.relatedTarget)) {
                setDropState(zone, false);
            }
        });

        zone.addEventListener('drop', async e => {
            e.preventDefault();
            setDropState(zone, false);

            // Si el drop es en el textarea dejamos el comportamiento nativo (pegar texto)
            // solo si no parece una carta de Scryfall/EDHREC
            const plain = e.dataTransfer.getData('text/plain') || '';
            const isUrl = plain.trim().startsWith('http');
            const hasScryfallUrl = /scryfall\.com\/card\//i.test(plain);

            if (zone.id === 'deck-input' && !isUrl) {
                // Texto plano no-URL en el textarea: dejamos pegar normalmente
                return;
            }

            const parsed = parseDropData(e);
            if (!parsed) {
                showDropToast('⚠ Could not identify card from drop.', 'error');
                return;
            }

            showDropToast('⏳ Resolving card...', '');

            try {
                const result = await resolveAndAddDroppedCard(parsed);
                if (!result) {
                    showDropToast('✗ Card not found in Scryfall.', 'error');
                    return;
                }

                const { card, existed } = result;
                updateStats(state.cards.filter(c => !c.error));
                renderPreview();
                if (typeof syncDeckInput === 'function') syncDeckInput();
                document.getElementById('btn-pdf').disabled = false;

                if (existed) {
                    showDropToast(`+1 · ${card.name} (${card.qty} total)`, 'ok');
                } else {
                    showDropToast(`✓ Added: ${card.name}`, 'ok');
                    upgradePreviewHQ(state.cards);
                }
            } catch (err) {
                console.error('Drop resolve error:', err);
                showDropToast('✗ Error resolving card: ' + err.message, 'error');
            }
        });
    });

    // Drop sobre toda la ventana como safety net (cuando sueltan fuera de las zonas)
    document.addEventListener('dragover', e => {
        if (e.dataTransfer.types.includes('text/uri-list') ||
            e.dataTransfer.types.includes('text/html')) {
            e.preventDefault(); // evita que el navegador abra la URL
        }
    });
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDrop);
} else {
    initDrop();
}
