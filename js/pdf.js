// ── pdf.js ────────────────────────────────────────────────────────────────────
// PDF generation. Depends on: utils.js, state.js, ui.js (setLog, setProgress,
// showLoadingOverlay, hideLoadingOverlay, isBasicLand, BASIC_LAND_NAMES)

async function generatePDF() {
    const skipBasics = document.getElementById('pdf-skip-basics').checked;
    const duplexMode = document.getElementById('pdf-duplex').value === 'yes';

    let unique = state.cards.filter(c => !c.error && c.pdfImageUrl);
    if (skipBasics) {
        unique = unique.filter(c => !isBasicLand(c) && !BASIC_LAND_NAMES.has(c.name.toLowerCase()));
    }
    if (!unique.length) { setLog('No valid cards for PDF.', 'error'); return; }

    showLoadingOverlay(t('log_pdf'));
    setProgress(5);
    document.getElementById('btn-pdf').disabled = true;

    const concurrency = Math.min(navigator.hardwareConcurrency || 8, 10);
    let done = 0;

// ── Download blobs ────────────────────────────────────────────────────────
const tasks = unique.map(card => async () => {
    try {
        if (!card._blob) {
            if (card._isCustom) {
                const res = await fetch(card.pdfImageUrl);
                card._blob = await res.blob();
            } else {
                card._blob = await fetchImageBlob(card.pdfImageUrl);
            }
        }
        if (card.pdfImageUrl2 && !card._blob2) card._blob2 = await fetchImageBlob(card.pdfImageUrl2);
        
        // DESCARGA DEL REVERSO PERSONALIZADO ASIGNADO A LA CARTA
        if (card.backUrl && !card._backBlob) {
            if (card.backUrl.startsWith('blob:')) {
                const res = await fetch(card.backUrl);
                card._backBlob = await res.blob(); // FIX: era card._blob (sobreescribía la cara frontal)
            } else {
                card._backBlob = await fetchImageBlob(card.backUrl);
            }
        }
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

        // ── Scale ─────────────────────────────────────────────────────────────
        const scaleSetting = document.getElementById('pdf-size').value;
        let CARD_W_RENDER, CARD_H_RENDER;
        if (scaleSetting === 'fit') {
            const availW = PAGE_W - 20;
            const availH = PAGE_H - 20;
            const fitW = (availW - gap * (COLS - 1)) / COLS;
            const fitH = (availH - gap * (ROWS - 1)) / ROWS;
            const ratio = Math.min(fitW / CARD_W, fitH / CARD_H);
            CARD_W_RENDER = CARD_W * ratio;
            CARD_H_RENDER = CARD_H * ratio;
        } else {
            CARD_W_RENDER = CARD_W;
            CARD_H_RENDER = CARD_H;
        }

        const MX = (PAGE_W - (CARD_W_RENDER * COLS + gap * (COLS - 1))) / 2;
        const MY = (PAGE_H - (CARD_H_RENDER * ROWS + gap * (ROWS - 1))) / 2;
        const marksSetting = document.getElementById('pdf-marks').value;
        const marks = marksSetting !== 'no';
        
        // Ajuste para soportar las resoluciones numéricas de la interfaz (600, 300, 150 DPI)
        const qualitySetting = document.getElementById('pdf-quality')?.value || '300';
        const jpegQuality = qualitySetting === '600' ? 0.95 : qualitySetting === '300' ? 0.85 : 0.70;

        // ── Bleed ─────────────────────────────────────────────────────────────
        const bleedSetting = document.getElementById('pdf-bleed').value;
        const bleed = bleedSetting === 'mm2' ? 2 : 0;

        // ── Border ────────────────────────────────────────────────────────────
        const borderSetting = document.getElementById('pdf-border').value;
        const borderWidth = borderSetting === 'thin' ? 0.3 : borderSetting === 'thick' ? 0.8 : 0;

        // ── Feature flags ─────────────────────────────────────────────────────
        const watermark     = document.getElementById('pdf-watermark')?.checked || false;
        const printDecklist = document.getElementById('pdf-decklist')?.checked || false;

        // ── Cut marks ─────────────────────────────────────────────────────────
        function drawCutMarks(doc, col, row, x, y, cw, ch) {
            const lw = marksSetting === 'thick' ? 0.4 : 0.15;
            doc.setDrawColor(60, 60, 60); doc.setLineWidth(lw);
            if (col === 0) {
                doc.line(0, y, x, y);
                doc.line(0, y + ch, x, y + ch);
            }
            if (col === COLS - 1) {
                doc.line(x + cw, y, PAGE_W, y);
                doc.line(x + cw, y + ch, PAGE_W, y + ch);
            }
            if (row === 0) {
                doc.line(x, 0, x, y);
                doc.line(x + cw, 0, x + cw, y);
            }
            if (row === ROWS - 1) {
                doc.line(x, y + ch, x, PAGE_H);
                doc.line(x + cw, y + ch, x + cw, PAGE_H);
            }
        }

        // ── Generic card back (duplex mode) ───────────────────────────────────
        const dfcMode = document.getElementById('pdf-dfc').value;
        const needsGenericBack = duplexMode;
        // URLs en orden de preferencia. Si wixmp expira su JWT, Scryfall actúa de fallback estable.
        const GENERIC_BACK_URLS = [
            'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/513b7bfa-42c9-4d08-ad6c-8e5d478c42d3/dalfpib-83f22b02-5802-40b4-901b-3eecf0ca2058.png/v1/fit/w_828,h_1182,q_70,strp/unofficial_magic_the_gathering_six_color_card_back_by_lordnyriox_dalfpib-414w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTQ2MyIsInBhdGgiOiIvZi81MTNiN2JmYS00MmM5LTRkMDgtYWQ2Yy04ZTVkNDc4YzQyZDMvZGFsZnBpYi04M2YyMmIwMi01ODAyLTQwYjQtOTAxYi0zZWVjZjBjYTIwNTgucG5nIiwid2lkdGgiOiI8PTEwMjQifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.E6ain-taz3WAOjHlySF768nq0Id5NkQMRzOrm95OGXY',
            'https://cards.scryfall.io/back.jpg',
        ];
        let genericBackBlob = null;
        if (needsGenericBack) {
            for (const url of GENERIC_BACK_URLS) {
                try {
                    genericBackBlob = await fetchImageBlob(url);
                    if (genericBackBlob) break;
                } catch(e) {
                    console.warn('Could not load generic card back from:', url, e);
                }
            }
            if (!genericBackBlob) console.error('All generic back URLs failed. Duplex backs will be blank.');
        }

        // ── Render one blob into PDF ───────────────────────────────────────────
        async function renderBlobToDoc(blob, x, y) {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            const imgX = x - bleed;
            const imgY = y - bleed;
            const imgW = CARD_W_RENDER + bleed * 2;
            const imgH = CARD_H_RENDER + bleed * 2;
            doc.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', imgX, imgY, imgW, imgH, undefined, 'FAST');

            if (watermark) {
                const cx = x + CARD_W_RENDER / 2;
                const cy = y + CARD_H_RENDER / 2;
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(180, 180, 180);
                doc.text('PROXY', cx, cy, { align: 'center', baseline: 'middle', angle: 35 });
            }

            if (borderWidth > 0) {
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(borderWidth);
                doc.rect(x, y, CARD_W_RENDER, CARD_H_RENDER, 'S');
            }
        }

        // ── Build fronts[] and backs[] arrays ─────────────────────────────────
        const fronts = [];
        const backs  = [];

        for (const card of unique) {
            if (!card._blob) continue;
            const isDFC = !!(card.pdfImageUrl2 && card._blob2);

            for (let i = 0; i < card.qty; i++) {
                if (!duplexMode && dfcMode === 'both' && isDFC) {
                    fronts.push(card._blob);
                    fronts.push(card._blob2);
                } else if (duplexMode && dfcMode === 'both' && isDFC) {
                    fronts.push(card._blob);
                    backs.push(card._backBlob || card._blob2);
                } else if (duplexMode && dfcMode === 'checklist') {
                    fronts.push(card._blob);
                    backs.push(card._backBlob || genericBackBlob);
                } else {
                    fronts.push(card._blob);
                    if (duplexMode) backs.push(card._backBlob || genericBackBlob);
                }
            }
        }

        // ── Render pages ──────────────────────────────────────────────────────
        const totalSlots  = fronts.length;
        const totalSheets = Math.ceil(totalSlots / 9);
        let pdfPageCount  = 0;

        for (let sheet = 0; sheet < totalSheets; sheet++) {
            const slotStart = sheet * 9;
            const slotEnd   = Math.min(slotStart + 9, totalSlots);

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

        // ── Decklist page ─────────────────────────────────────────────────────
        if (printDecklist) {
            doc.addPage();
            const margin = 16;
            const lineH  = 5.5;
            const colW   = (PAGE_W - margin * 2) / 2;
            let curY     = margin + 2;

            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(40, 40, 40);
            doc.text('DECKLIST', PAGE_W / 2, curY, { align: 'center' });
            curY += 5;

            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.2);
            doc.line(margin, curY, PAGE_W - margin, curY);
            curY += 5;

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
                    doc.setFont('helvetica', 'bold');   doc.setTextColor(60, 60, 60);
                    doc.text(`${c.qty}×`, margin, rowY);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
                    doc.text(c.name, margin + 7, rowY);
                }
                if (col2[i]) {
                    const c = col2[i];
                    const cx = margin + colW + 2;
                    doc.setFont('helvetica', 'bold');   doc.setTextColor(60, 60, 60);
                    doc.text(`${c.qty}×`, cx, rowY);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
                    doc.text(c.name, cx + 7, rowY);
                }
            }

            const footY = curY + maxRows * lineH + 4;
            doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
            doc.line(margin, footY, PAGE_W - margin, footY);
            const totalCards = deckCards.reduce((s, c) => s + (c.qty || 0), 0);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(120, 120, 120);
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