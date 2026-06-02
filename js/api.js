// ── api.js ────────────────────────────────────────────────────────────────────
// All Scryfall API calls. Depends on: utils.js, state.js

// ── Batch collection fetch ────────────────────────────────────────────────────
async function fetchCollectionBatch(entries) {
    const identifiers = entries.map(e => {
        if (typeof e === 'string') return { name: e };
        if (e.setCode && e.collectorNumber) return { set: e.setCode, collector_number: e.collectorNumber };
        return { name: e.name };
    });
    const body = JSON.stringify({ identifiers });
    const res = await fetchWithRetry('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });
    if (!res || !res.ok) throw new Error('Error in batch collection');
    const data = await res.json();
    const map = new Map();
    for (const card of (data.data || [])) {
        map.set(normalizeCardName(card.name), card);
        if (card.name.includes(' // ')) map.set(normalizeCardName(card.name.split(' // ')[0].trim()), card);
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

// ── Language batch fetch ──────────────────────────────────────────────────────
async function fetchCardLangBatch(names, lang, signal) {
    const orParts = names.map(n => '!"' + n + '"').join(' OR ');
    const q = '(' + orParts + ') lang:' + lang;
    const firstUrl = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=cards&order=released&dir=desc';
    const result = new Map();
    // FIX: usamos fetchAllPages para no perder resultados cuando hay más de una página
    let allCards;
    try {
        allCards = await fetchAllPages(firstUrl);
    } catch(e) {
        return result;
    }
    const nameSet = new Map(names.map(n => [normalizeCardName(n), n]));
    for (const card of allCards) {
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

// ── Fetch all paginated results from a Scryfall search URL ───────────────────
async function fetchAllPages(firstUrl) {
    const all = [];
    let url = firstUrl;
    while (url) {
        const res = await fetchWithRetry(url);
        if (!res || !res.ok) break;
        const data = await res.json();
        if (data.data) all.push(...data.data);
        url = data.has_more ? data.next_page : null;
        if (url) await new Promise(r => setTimeout(r, 150));
    }
    return all;
}
