// ══════════════════════════════════════════════════════════════
// i18n — UI Language System
// ══════════════════════════════════════════════════════════════
const TRANSLATIONS = {
    en: {
        step1: 'Paste Decklist', step2: 'Load Cards',
        step3: 'Customize Arts', step4: 'Build PDF',
        label_decklist: 'Decklist (Arena / MTGO Format)',
        label_lang: 'Main Search Language',
        label_pdf: 'PDF Print Settings',
        pdf_scale: 'Scale', pdf_bleed: 'Bleed', pdf_dfc: 'DFC Cards',
        pdf_marks: 'Cut Marks', pdf_quality: 'Resolution (DPI)',
        pdf_paper: 'Paper', pdf_gap: 'Card Gap',
        stat_unique: 'Unique', stat_total: 'Total', stat_pages: 'Pages',
        btn_sync: 'Sync Cards', btn_pdf: 'Generate Proxy File',
        btn_cancel: 'Cancel', btn_confirm: 'Confirm Art',
        modal_title: 'Print Catalog', modal_lang_label: 'Localization:',
        preview_title: 'Workspace and Composition',
        loading_title: 'Processing Data',
        log_init: 'Enter a structured decklist to initialize the forge.',
        log_error_none: 'No cards loaded. Check card names.',
        log_done: n => `✓ ${n} cards loaded.`,
        log_done_errors: (ok, err) => `Done with ${err} error(s). ${ok} cards loaded.`,
        log_pdf: 'Generating PDF…',
        log_pdf_done: (n, p) => `✓ PDF: ${n} cards in ${p} page(s).`,
        loading_phase1: n => `Fetching ${n} cards…`,
        loading_phase2: l => `Searching ${l} versions…`,
        empty_state: 'The studio is ready. Import a competitive deck.',
        footer_text: 'Multimedia assets provided by',
        theme_dark: 'Dark', theme_light: 'Light',
        opt_scale_real: 'Real Size (100%)',
        opt_scale_fit: 'Fit to page',
        opt_bleed_none: 'No Bleed',
        opt_bleed_mm2: '2mm Professional',
        opt_dfc_both: 'Both Faces',
        opt_dfc_checklist: 'Front Only',
        opt_marks_yes: 'Thin lines',
        opt_marks_no: 'No marks',
        opt_quality_high: '300 DPI High-Res',
        opt_quality_std: '150 DPI Fast',
        opt_paper_a4: 'A4 Standard',
        opt_paper_letter: 'US Letter',
        opt_gap_0: 'None (0mm)',
        opt_gap_1: '1mm',
        opt_gap_2: '2mm',
        opt_gap_3: '3mm',
        opt_gap_5: '5mm',
        btn_latest_art: 'Update to Latest Arts',
        confirm_latest_art: 'Do you want to update all cards with the most recent art in your language? This might mean that some cards without a matching version will get artwork you do not want, please review it afterwards.',
        pdf_marks: 'Cut Marks',
        opt_marks_no: 'None',
        opt_marks_thin: 'Thin',
        opt_marks_thick: 'Thick',
        pdf_border: 'Card Border',
        opt_border_none: 'None',
        opt_border_thin: 'Thin (0.3mm)',
        opt_border_thick: 'Thick (0.8mm)',
        opt_duplex_no: 'Single-sided',
        opt_duplex_yes: 'Double-sided (Mirror)',
        pdf_skip_basics: 'Skip Basic Lands',
        btn_custom_upload: 'Add Custom Card',
        modal_year_label: 'Era:',
        opt_year_all: 'All Eras',
    },
    es: {
        step1: 'Pegar Lista', step2: 'Cargar Cartas',
        step3: 'Elegir Arte', step4: 'Crear PDF',
        label_decklist: 'Lista de Mazo (Formato Arena / MTGO)',
        label_lang: 'Idioma Principal de Búsqueda',
        label_pdf: 'Ajustes de Impresión PDF',
        pdf_scale: 'Escala', pdf_bleed: 'Sangrado', pdf_dfc: 'Cartas DFC',
        pdf_marks: 'Marcas de Corte', pdf_quality: 'Resolución (DPI)',
        pdf_paper: 'Papel', pdf_gap: 'Espacio entre Cartas',
        stat_unique: 'Únicas', stat_total: 'Total', stat_pages: 'Páginas',
        btn_sync: 'Cargar Cartas', btn_pdf: 'Generar PDF',
        btn_cancel: 'Cancelar', btn_confirm: 'Confirmar Arte',
        modal_title: 'Catálogo de Impresiones', modal_lang_label: 'Idioma:',
        preview_title: 'Área de Trabajo',
        loading_title: 'Procesando',
        log_init: 'Pega una lista de mazo para empezar.',
        log_error_none: 'No se cargó ninguna carta. Revisa los nombres.',
        log_done: n => `✓ ${n} cartas cargadas.`,
        log_done_errors: (ok, err) => `Listo con ${err} error(es). ${ok} cartas cargadas.`,
        log_pdf: 'Generando PDF…',
        log_pdf_done: (n, p) => `✓ PDF: ${n} cartas en ${p} página(s).`,
        loading_phase1: n => `Buscando ${n} cartas en batch…`,
        loading_phase2: l => `Buscando versiones en ${l}…`,
        empty_state: 'El estudio está listo. Importa un mazo para previsualizar.',
        footer_text: 'Imágenes proporcionadas por',
        theme_dark: 'Oscuro', theme_light: 'Claro',
        opt_scale_real: 'Tamaño Real (100%)',
        opt_scale_fit: 'Ajustar a la página',
        opt_bleed_none: 'Sin sangrado',
        opt_bleed_mm2: 'Sangrado Profesional',
        opt_dfc_both: 'Ambas caras',
        opt_dfc_checklist: 'Solo frente',
        opt_marks_yes: 'Líneas finas',
        opt_marks_no: 'Sin marcas',
        opt_quality_high: 'Alta Resolución',
        opt_quality_std: 'Render Rápido',
        opt_paper_a4: 'A4 Estándar',
        opt_paper_letter: 'Carta US',
        opt_gap_0: 'Ninguno',
        opt_gap_1: 'Pequeño',
        opt_gap_2: 'Mediano',
        opt_gap_3: 'Grande',
        opt_gap_5: 'Muy Grande',
        btn_latest_art: 'Actualizar a Artes Recientes',
        confirm_latest_art: '¿Quieres actualizar todas las cartas con el arte más actual en tu idioma? Esto puede suponer que algunas cartas que no tengan versión salgan con artes que no quieres, revísalo luego por favor.',
        pdf_marks: 'Marcas de Corte',
        opt_marks_no: 'Sin marcas',
        opt_marks_thin: 'Finas',
        opt_marks_thick: 'Gruesas',
        pdf_border: 'Borde de Carta',
        opt_border_none: 'Sin borde',
        opt_border_thin: 'Fino (0.3mm)',
        opt_border_thick: 'Grueso (0.8mm)',
        opt_duplex_no: 'Una cara',
        opt_duplex_yes: 'Doble cara (Espejo)',
        pdf_skip_basics: 'Omitir Tierras Básicas',
        btn_custom_upload: 'Añadir Carta Personalizada',
        modal_year_label: 'Era:',
        opt_year_all: 'Todas las Eras',
    },
    fr: {
        step1: 'Coller la Liste', step2: 'Charger les Cartes',
        step3: 'Personnaliser', step4: 'Créer PDF',
        label_decklist: 'Liste de Deck (Format Arena / MTGO)',
        label_lang: 'Langue de Recherche Principale',
        label_pdf: "Paramètres d'Impression PDF",
        pdf_scale: 'Échelle', pdf_bleed: 'Fond Perdu', pdf_dfc: 'Cartes DFC',
        pdf_marks: 'Repères de Coupe', pdf_quality: 'Résolution (DPI)',
        pdf_paper: 'Papier', pdf_gap: 'Espacement',
        stat_unique: 'Uniques', stat_total: 'Total', stat_pages: 'Pages',
        btn_sync: 'Charger les Cartes', btn_pdf: 'Générer le PDF',
        btn_cancel: 'Annuler', btn_confirm: "Confirmer l'Art",
        modal_title: "Catalogue d'Impressions", modal_lang_label: 'Langue:',
        preview_title: 'Espace de Travail',
        loading_title: 'Traitement en Cours',
        log_init: 'Collez une liste de deck pour commencer.',
        log_error_none: 'Aucune carte chargée. Vérifiez les noms.',
        log_done: n => `✓ ${n} cartes chargées.`,
        log_done_errors: (ok, err) => `Terminé avec ${err} erreur(s). ${ok} cartes chargées.`,
        log_pdf: 'Génération du PDF…',
        log_pdf_done: (n, p) => `✓ PDF: ${n} cartes en ${p} page(s).`,
        loading_phase1: n => `Recherche de ${n} cartes en lot…`,
        loading_phase2: l => `Recherche de versions en ${l}…`,
        empty_state: 'Le studio est prêt. Importez un deck pour prévisualiser.',
        footer_text: 'Images fournies par',
        theme_dark: 'Sombre', theme_light: 'Clair',
        opt_scale_real: 'Taille Réelle (100%)',
        opt_scale_fit: 'Ajuster à la page',
        opt_bleed_none: 'Sans fond perdu',
        opt_bleed_mm2: 'Fond perdu professionnel',
        opt_dfc_both: 'Les deux faces',
        opt_dfc_checklist: 'Face avant seulement',
        opt_marks_yes: 'Lignes fines',
        opt_marks_no: 'Sans repères',
        opt_quality_high: 'Haute Résolution',
        opt_quality_std: 'Rendu Rapide',
        opt_paper_a4: 'A4 Standard',
        opt_paper_letter: 'Lettre US',
        opt_gap_0: 'Aucun',
        opt_gap_1: 'Petit',
        opt_gap_2: 'Moyen',
        opt_gap_3: 'Grand',
        opt_gap_5: 'Très Grand',
        btn_latest_art: 'Mettre à jour les illustrations',
        confirm_latest_art: 'Voulez-vous mettre à jour toutes les cartes avec l\'illustration la plus récente dans votre langue ? Cela peut signifier que certaines cartes sans version correspondante s\'afficheront avec des illustrations que vous ne souhaitez pas, veuillez vérifier ensuite.',
        pdf_duplex: 'Impression Recto-Verso',
        opt_duplex_no: 'Recto seulement',
        opt_duplex_yes: 'Recto-verso (Miroir)',
        pdf_skip_basics: 'Ignorer Terrains de Base',
        btn_custom_upload: 'Ajouter une Carte Personnalisée',
        modal_year_label: 'Ère:',
        opt_year_all: 'Toutes les Ères',
    },
    de: {
        step1: 'Liste Einfügen', step2: 'Karten Laden',
        step3: 'Kunst Wählen', step4: 'PDF Erstellen',
        label_decklist: 'Deckliste (Arena / MTGO Format)',
        label_lang: 'Hauptsuchsprache',
        label_pdf: 'PDF-Druckeinstellungen',
        pdf_scale: 'Skalierung', pdf_bleed: 'Anschnitt', pdf_dfc: 'DFC-Karten',
        pdf_marks: 'Schnittmarken', pdf_quality: 'Auflösung (DPI)',
        pdf_paper: 'Papier', pdf_gap: 'Kartenabstand',
        stat_unique: 'Einzigartig', stat_total: 'Gesamt', stat_pages: 'Seiten',
        btn_sync: 'Karten Laden', btn_pdf: 'PDF Generieren',
        btn_cancel: 'Abbrechen', btn_confirm: 'Druck Bestätigen',
        modal_title: 'Druckkatalog', modal_lang_label: 'Sprache:',
        preview_title: 'Arbeitsbereich',
        loading_title: 'Verarbeitung',
        log_init: 'Füge eine Deckliste ein, um zu beginnen.',
        log_error_none: 'Keine Karten geladen. Überprüfe die Namen.',
        log_done: n => `✓ ${n} Karten geladen.`,
        log_done_errors: (ok, err) => `Fertig mit ${err} Fehler(n). ${ok} Karten geladen.`,
        log_pdf: 'PDF wird erstellt…',
        log_pdf_done: (n, p) => `✓ PDF: ${n} Karten auf ${p} Seite(n).`,
        loading_phase1: n => `Suche nach ${n} Karten im Batch…`,
        loading_phase2: l => `Suche nach ${l}-Versionen…`,
        empty_state: 'Das Studio ist bereit. Importiere ein Deck zur Vorschau.',
        footer_text: 'Bilder bereitgestellt von',
        theme_dark: 'Dunkel', theme_light: 'Hell',
        opt_scale_real: 'Originalgröße (100%)',
        opt_scale_fit: 'An Seite anpassen',
        opt_bleed_none: 'Ohne Anschnitt',
        opt_bleed_mm2: 'Professioneller Anschnitt',
        opt_dfc_both: 'Beide Seiten',
        opt_dfc_checklist: 'Nur Vorderseite',
        opt_marks_yes: 'Dünne Linien',
        opt_marks_no: 'Ohne Markierungen',
        opt_quality_high: 'Hohe Auflösung',
        opt_quality_std: 'Schneller Render',
        opt_paper_a4: 'A4 Standard',
        opt_paper_letter: 'US Letter',
        opt_gap_0: 'Ohne',
        opt_gap_1: 'Klein',
        opt_gap_2: 'Mittel',
        opt_gap_3: 'Groß',
        opt_gap_5: 'Sehr Groß',
        btn_latest_art: 'Auf neueste Grafiken aktualisieren',
        confirm_latest_art: 'Möchten Sie alle Karten mit der neuesten Grafik in Ihrer Sprache aktualisieren? Dies kann dazu führen, dass einige Karten ohne passende Version eine unerwünschte Grafik erhalten, bitte überprüfen Sie dies später.',
        pdf_duplex: 'Duplexdruck',
        opt_duplex_no: 'Einseitig',
        opt_duplex_yes: 'Doppelseitig (Spiegel)',
        pdf_skip_basics: 'Basisländer überspringen',
        btn_custom_upload: 'Eigene Karte hinzufügen',
        modal_year_label: 'Ära:',
        opt_year_all: 'Alle Ären',
    },
    it: {
        step1: 'Incolla Lista', step2: 'Carica Carte',
        step3: 'Scegli Arte', step4: 'Crea PDF',
        label_decklist: 'Lista Mazzo (Formato Arena / MTGO)',
        label_lang: 'Lingua di Ricerca Principale',
        label_pdf: 'Impostazioni Stampa PDF',
        pdf_scale: 'Scala', pdf_bleed: 'Abbondanza', pdf_dfc: 'Carte DFC',
        pdf_marks: 'Segni di Taglio', pdf_quality: 'Risoluzione (DPI)',
        pdf_paper: 'Carta', pdf_gap: 'Spazio tra Carte',
        stat_unique: 'Uniche', stat_total: 'Totale', stat_pages: 'Pagine',
        btn_sync: 'Carica Carte', btn_pdf: 'Genera PDF',
        btn_cancel: 'Annulla', btn_confirm: 'Conferma Arte',
        modal_title: 'Catalogo Stampe', modal_lang_label: 'Lingua:',
        preview_title: 'Area di Lavoro',
        loading_title: 'Elaborazione',
        log_init: 'Incolla una lista mazzo per iniziare.',
        log_error_none: 'Nessuna carta caricata. Controlla i nomi.',
        log_done: n => `✓ ${n} carte caricate.`,
        log_done_errors: (ok, err) => `Completato con ${err} errore/i. ${ok} carte caricate.`,
        log_pdf: 'Generazione PDF…',
        log_pdf_done: (n, p) => `✓ PDF: ${n} carte in ${p} pagina/e.`,
        loading_phase1: n => `Ricerca di ${n} carte in batch…`,
        loading_phase2: l => `Ricerca versioni in ${l}…`,
        empty_state: 'Lo studio è pronto. Importa un mazzo per visualizzare le carte.',
        footer_text: 'Immagini fornite da',
        theme_dark: 'Scuro', theme_light: 'Chiaro',
        opt_scale_real: 'Dimensione Reale (100%)',
        opt_scale_fit: 'Adatta alla pagina',
        opt_bleed_none: 'Senza margine d\'esubero',
        opt_bleed_mm2: 'Margine professionale',
        opt_dfc_both: 'Entrambe le facce',
        opt_dfc_checklist: 'Solo fronte',
        opt_marks_yes: 'Linee sottili',
        opt_marks_no: 'Senza segni',
        opt_quality_high: 'Alta Risoluzione',
        opt_quality_std: 'Rendering Rapido',
        opt_paper_a4: 'A4 Standard',
        opt_paper_letter: 'Lettera US',
        opt_gap_0: 'Nessuno',
        opt_gap_1: 'Piccolo',
        opt_gap_2: 'Medio',
        opt_gap_3: 'Grande',
        opt_gap_5: 'Molto Grande',
        btn_latest_art: 'Aggiorna alle ultime illustrazioni',
        confirm_latest_art: 'Vuoi aggiornare tutte le carte con l\'illustrazione más recente nella tua lingua? Questo potrebbe far sì que alcune carte senza una versione corrispondente mostrino illustraciones sgradite, per favore controllale dopo.',
        pdf_duplex: 'Stampa Fronte-Retro',
        opt_duplex_no: 'Solo fronte',
        opt_duplex_yes: 'Fronte-retro (Specchio)',
        pdf_skip_basics: 'Ignora Terre Base',
        btn_custom_upload: 'Aggiungi Carta Personalizzata',
        modal_year_label: 'Era:',
        opt_year_all: 'Tutte le Ere',
    },
};

const UI_LANG_FLAGS  = { en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹' };
const UI_LANG_LABELS = { en: 'EN',   es: 'ES',  fr: 'FR',  de: 'DE',  it: 'IT'  };
let currentUILang = 'en';

// Devuelve la traducción para una clave, llamando la función si aplica
function t(key, ...args) {
    const tr  = TRANSLATIONS[currentUILang] || TRANSLATIONS.en;
    const val = tr[key] ?? TRANSLATIONS.en[key] ?? key;
    return typeof val === 'function' ? val(...args) : val;
}

// Aplica todas las traducciones al DOM y guarda en localStorage
function setLang(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentUILang = lang;
    try { localStorage.setItem('aetherforge-ui-lang', lang); } catch(e) {}
    
    // Actualizar flag y código en el botón
    const flagEl  = document.getElementById('lang-flag');
    const labelEl = document.getElementById('lang-label');
    if (flagEl)  flagEl.textContent  = UI_LANG_FLAGS[lang]  || '🌐';
    if (labelEl) labelEl.textContent = UI_LANG_LABELS[lang] || lang.toUpperCase();
    
    // Traducir todos los elementos marcados con data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (typeof text === 'string') el.textContent = text;
    });
    
    // Actualizar el label del botón de tema con el nuevo idioma
    const themeLabel = document.getElementById('theme-label');
    if (themeLabel) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeLabel.textContent = t(isDark ? 'theme_dark' : 'theme_light');
    }
    
    // Cerrar el menú
    closeLangMenu();
}

function toggleLangMenu() {
    document.getElementById('lang-menu').classList.toggle('open');
}

function closeLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (menu) menu.classList.remove('open');
}

// Cerrar el menú al hacer clic fuera
document.addEventListener('click', e => {
    if (!e.target.closest('.lang-selector')) closeLangMenu();
});

// Restaurar idioma guardado al cargar la página
(function initLang() {
    try {
        const saved = localStorage.getItem('aetherforge-ui-lang');
        if (saved && TRANSLATIONS[saved]) setLang(saved);
    } catch(e) {}
})();
