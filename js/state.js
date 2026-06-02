// ── state.js ──────────────────────────────────────────────────────────────────
// Shared mutable state and Arena-format deck parser.
// All modules that need to read/write cards import from here.

const state = {
    cards: [],
    loading: false,
    printsCache: {},
    abortController: null,
    langCache: {}
};

const modal = {
    cardIndex: -1,
    selectedPrintId: null,
    prints: [],
    currentLang: 'en'
};

// ── Arena / MTGO format parser ────────────────────────────────────────────────
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
        if (m) { qty = parseInt(m[1], 10); name = m[2].trim(); }
        else if (line.length > 1) { qty = 1; name = line; }
        else continue;

        name = name.replace(/\s+\/\/\s+/g, ' // ').replace(/\s+\/\s+/g, ' // ');
        name = name.split(' // ')[0].trim();
        if (qty > 0 && name) result.push({ qty, name, setCode, collectorNumber });
    }
    return result;
}
