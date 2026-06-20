// ── utils.js ─────────────────────────────────────────────────────────────────
// Pure helpers: string normalization, fetch with retry, image extraction,
// concurrency limiter. No DOM access, no global state.

const LANG_NAMES = { en: 'EN', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT', ja: 'JA', ko: 'KO', ru: 'RU', zhs: 'ZHS', zht: 'ZHT', ph: 'PH' };
// LRU cache para blobs de imagen: evita consumo de memoria ilimitado en sesiones
// largas. Máximo 200 entradas; cuando se supera, descarta las más antiguas.
const IMAGE_BLOB_CACHE_LIMIT = 200;
const imageBlobCache = new Map();
function blobCacheGet(url) {
    if (!imageBlobCache.has(url)) return undefined;
    // Mover al final (más reciente) — LRU
    const val = imageBlobCache.get(url);
    imageBlobCache.delete(url);
    imageBlobCache.set(url, val);
    return val;
}
function blobCacheSet(url, blob) {
    if (imageBlobCache.has(url)) imageBlobCache.delete(url);
    imageBlobCache.set(url, blob);
    if (imageBlobCache.size > IMAGE_BLOB_CACHE_LIMIT) {
        // Eliminar la entrada más antigua (primera del Map)
        imageBlobCache.delete(imageBlobCache.keys().next().value);
    }
}

// ── HTML escaping ─────────────────────────────────────────────────────────────
// Úsala siempre que insertes datos externos (nombres de cartas, mensajes de
// error de Scryfall, etc.) en innerHTML para evitar XSS.
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function normalizeCardName(name) {
    return String(name).normalize('NFKD')
        .replace(/[''`´]/g, "'")
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/\s*\/\/\s*/g, " // ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

// ── Sanitize a card name for use in Scryfall API queries ──────────────────────
// Convierte comillas/guiones tipográficos a sus equivalentes ASCII para que
// fuzzy/named/search no devuelvan 404 (lo cual aparece como error CORS en consola).
function sanitizeNameForApi(name) {
    return String(name).normalize('NFKD')
        .replace(/[''`´]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .trim();
}

// ── Image URL extraction ──────────────────────────────────────────────────────
function extractImageUrl(data, size = 'normal') {
    if (data.image_uris && data.image_uris[size]) return data.image_uris[size];
    if (data.card_faces?.[0]?.image_uris?.[size]) return data.card_faces[0].image_uris[size];
    return null;
}

function extractFace2Url(data, size = 'normal') {
    if (data.card_faces?.length >= 2 && data.card_faces[1]?.image_uris?.[size]) {
        return data.card_faces[1].image_uris[size];
    }
    return null;
}

function extractFace2Name(data) {
    if (data.card_faces?.length >= 2) return data.card_faces[1].name || null;
    return null;
}

function hasValidImage(card) {
    if (!card) return false;
    const s = card.image_status;
    if (s === 'placeholder' || s === 'missing') return false;
    return !!extractImageUrl(card, 'small');
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchWithRetry(url, opts = {}, retries = 3, baseDelay = 500, timeoutMs = 15000) {
    const externalSignal = opts.signal;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const timeoutCtrl = new AbortController();
        const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs * (attempt + 1));
        const onExtAbort = () => timeoutCtrl.abort();
        if (externalSignal) externalSignal.addEventListener('abort', onExtAbort, { once: true });
        try {
            const res = await fetch(url, { ...opts, signal: timeoutCtrl.signal });
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
            if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
            if (attempt === retries) throw e;
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
    }
}

async function fetchImageBlob(url, retries = 3, timeoutMs = 20000) {
    const cached = blobCacheGet(url);
    if (cached) return cached;
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    for (let attempt = 0; attempt <= retries; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(fetchUrl, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            blobCacheSet(url, blob);
            return blob;
        } catch (e) {
            clearTimeout(timer);
            if (attempt === retries) throw new Error('Could not download image: ' + e.message);
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
    }
}

// ── Concurrency limiter ───────────────────────────────────────────────────────
async function runWithConcurrency(tasks, limit) {
    const results = [];
    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}
