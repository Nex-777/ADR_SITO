import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock browser globals before requiring nestore.js in Node
global.APP_CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key' };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
global.window = global.window || {
    supabase: { createClient: () => ({ from: () => ({ select: () => ({}) }) }) },
    addEventListener: () => {},
    location: { search: '', hash: '' },
    requestAnimationFrame: () => {}
};
global.document = global.document || {
    addEventListener: () => {},
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, textContent: '', innerHTML: '' })
};

describe('Nestore Coach & Admin Dashboard (Fase 2)', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');
    const jsPath = path.resolve(__dirname, '../portal/nestore.js');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');

    it('contains coach view switcher in header', () => {
        expect(html).toContain('id="nst-view-switcher"');
        expect(html).toContain('onchange="switchNestoreView(this.value)"');
    });

    it('contains athlete SCHEDE panel and navigation buttons', () => {
        expect(html).toContain('id="nst-schede-panel"');
        expect(html).toContain('id="nst-tab-btn-schede"');
        expect(html).toContain('id="nst-nav-schede"');
        expect(html).toContain('id="nst-atleta-schede-container"');
    });

    it('contains coach and admin container and views', () => {
        expect(html).toContain('id="nst-coach-container"');
        expect(html).toContain('id="nst-coach-list-view"');
        expect(html).toContain('id="nst-coach-atleta-view"');
        expect(html).toContain('id="nst-coach-course-select"');
        expect(html).toContain('id="nst-coach-search-input"');
        expect(html).toContain('id="nst-coach-atleti-container"');
    });

    it('contains athlete inspection subpanels in coach view', () => {
        expect(html).toContain('id="nst-coach-subpanel-schede"');
        expect(html).toContain('id="nst-coach-subpanel-peso"');
        expect(html).toContain('id="nst-coach-subpanel-allenamenti"');
        expect(html).toContain('id="nst-coach-subpanel-dieta"');
        expect(html).toContain('id="nst-coach-subpanel-profilo"');
        expect(html).toContain('chiudiDettaglioAtletaPerCoach()');
    });

    it('contains workout plan creation form with text and word upload modes', () => {
        expect(html).toContain('id="nst-scheda-titolo"');
        expect(html).toContain('id="nst-scheda-periodo"');
        expect(html).toContain('id="nst-scheda-obiettivo"');
        expect(html).toContain('id="nst-scheda-testo-content"');
        expect(html).toContain('id="nst-scheda-word-file"');
        expect(html).toContain('inviaNuovaSchedaCoach()');
        expect(html).toContain('id="nst-modal-scheda-view"');
    });

    it('contains necessary CSS classes in nestore.css', () => {
        expect(css).toContain('.nst-coach-container');
        expect(css).toContain('.nst-coach-athlete-card');
        expect(css).toContain('.nst-scheda-card');
        expect(css).toContain('.nst-file-dropzone');
        expect(css).toContain('.nst-btn-open-atleta');
        expect(css).toContain('.nst-modal-overlay');
    });

    it('exports coach and schede functions in nestore.js', () => {
        require('../portal/nestore.js');
        const target = global.window;
        expect(typeof target.switchNestoreView).toBe('function');
        expect(typeof target.switchNestorePanel).toBe('function');
        expect(typeof target.caricaCoachDashboard).toBe('function');
        expect(typeof target.caricaAdminDashboard).toBe('function');
        expect(typeof target.caricaSchedeAtleta).toBe('function');
        expect(typeof target.escapeHtml).toBe('function');
        expect(typeof target.isIscrizioneAttiva).toBe('function');
    });

    it('escapeHtml safely sanitizes strings in Node without relying on DOM', () => {
        require('../portal/nestore.js');
        const escapeHtml = global.window.escapeHtml;
        expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        expect(escapeHtml("Mario O'Connor & Sons")).toBe('Mario O&#39;Connor &amp; Sons');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('isIscrizioneAttiva correctly evaluates course expiration and remaining entries', () => {
        require('../portal/nestore.js');
        const isIscrizioneAttiva = global.window.isIscrizioneAttiva;
        const today = '2026-09-16';

        // Course with expiration date
        expect(isIscrizioneAttiva({ data_scadenza_corso: '2026-09-20' }, today)).toBe(true);
        expect(isIscrizioneAttiva({ data_scadenza_corso: '2026-09-16' }, today)).toBe(true);
        expect(isIscrizioneAttiva({ data_scadenza_corso: '2026-09-15' }, today)).toBe(false);

        // Course with entries (carnet ingressi)
        expect(isIscrizioneAttiva({ ingressi_totali: 10, ingressi_usati: 5 }, today)).toBe(true);
        expect(isIscrizioneAttiva({ ingressi_totali: 10, ingressi_usati: 10 }, today)).toBe(false);
        expect(isIscrizioneAttiva({ ingressi_totali: 10, ingressi_usati: 11 }, today)).toBe(false);

        // Invalid / null
        expect(isIscrizioneAttiva(null, today)).toBe(false);
    });

    it('prevents XSS by avoiding inline onclick for athlete opening and schede modal in dynamic HTML', () => {
        expect(js).not.toContain('onclick="apriModalSchedaTesto(');
        expect(js).not.toContain('onclick="apriAtletaPerAllenatore(');
        expect(js).toContain('data-atleta-id');
        expect(js).toContain('data-scheda-id');
    });

    it('enforces strict admin check only for presidente', () => {
        // Checking JS source logic to ensure only presidente gets isAuthorizedAdmin
        expect(js).toContain("isAuthorizedAdmin = Array.isArray(profile.ruolo) && profile.ruolo.includes('presidente')");
        expect(js).not.toContain("['presidente', 'vice_presidente'].includes(r)");
    });

    it('switcher only displays options according to specific roles', () => {
        // Verification of switcher generation logic
        expect(js).toContain("if (isIstruttore) {");
        expect(js).toContain("optCoach.value = 'coach'");
        expect(js).toContain("if (isAuthorizedAdmin) {");
        expect(js).toContain("optAdmin.value = 'admin'");
        expect(js).toContain("if (switcher.options.length > 1)");
    });

    it('contains assistance banner in nestore.html and manages it in nestore.js', () => {
        expect(html).toContain('id="nst-assistenza-banner"');
        expect(html).toContain('id="nst-assistenza-target-nome"');
        expect(html).toContain('MODALITÀ ASSISTENZA ATTIVA');
        expect(js).toContain("document.getElementById('nst-assistenza-banner')");
        expect(js).toContain("document.getElementById('nst-assistenza-target-nome')");
    });

    it('recalculates permissions strictly during impersonation without privilege leakage', () => {
        // Must fetch anagrafiche for targetProfile to check registro_istruttori
        expect(js).toContain("select('id, nome, cognome, ruolo, anagrafiche(id, registro_approvazioni(stato))')");
        // Must recalculate isAuthorizedAdmin strictly for targetProfile
        expect(js).toContain("// Ricalcolo permessi per l'utente impersonato (simulazione al 100% dell'utente reale)");
        // Must evaluate hasUnconditionalAccess after the impersonation block
        const impersonateBlockIdx = js.indexOf('if (impersonateId && isAuthorizedAdmin)');
        const unconditionalIdx = js.indexOf('const hasUnconditionalAccess = isBoardMember || isIstruttore;');
        expect(impersonateBlockIdx).toBeGreaterThan(-1);
        expect(unconditionalIdx).toBeGreaterThan(impersonateBlockIdx);
    });

    it('contains IBRIDO BASE programs catalog with exactly 8 programs (Metcon 1-4 and Forza 1-4)', () => {
        require('../portal/nestore.js');
        const catalog = global.window.IBRIDO_PROGRAMMI_CATALOGO;
        expect(Array.isArray(catalog)).toBe(true);
        expect(catalog.length).toBe(8);

        const metcons = catalog.filter(p => p.tipo === 'metcon');
        const forze = catalog.filter(p => p.tipo === 'forza');
        expect(metcons.length).toBe(4);
        expect(forze.length).toBe(4);

        // Metcon 1, 2, 4 use tabata with configurable work and rest
        const m1 = catalog.find(p => p.id === 'ibrido_metcon_1');
        const m2 = catalog.find(p => p.id === 'ibrido_metcon_2');
        const m4 = catalog.find(p => p.id === 'ibrido_metcon_4');
        expect(m1.timer_mode).toBe('tabata');
        expect(m1.work_default).toBe(30);
        expect(m1.rest_default).toBe(30);
        expect(m2.timer_mode).toBe('tabata');
        expect(m4.timer_mode).toBe('tabata');
        expect(m4.work_default).toBe(25);
        expect(m4.rest_default).toBe(35);

        // Metcon 3 and all Forza use stopwatch (with pause and lap)
        const m3 = catalog.find(p => p.id === 'ibrido_metcon_3');
        expect(m3.timer_mode).toBe('stopwatch');
        forze.forEach(f => {
            expect(f.timer_mode).toBe('stopwatch');
            expect(f.esercizi.length).toBeGreaterThanOrEqual(3);
        });
    });

    it('contains HTML components for Ibrido catalog and interactive workout execution', () => {
        expect(html).toContain('id="nst-ibrido-programmi-section"');
        expect(html).toContain('id="nst-ibrido-programmi-grid"');
        expect(html).toContain('id="nst-ibrido-preview-modal"');
        expect(html).toContain('id="nst-ibrido-active-modal"');
        expect(html).toContain('id="nst-ibrido-final-duration-input"');
        expect(html).toContain('id="nst-ibrido-timer-warning"');
        expect(html).toContain('confermaSalvaIbridoSeduta()');
    });

    it('exports all Ibrido interactive workflow functions', () => {
        require('../portal/nestore.js');
        const target = global.window;
        expect(typeof target.renderCatalogoIbrido).toBe('function');
        expect(typeof target.apriAnteprimaIbrido).toBe('function');
        expect(typeof target.chiudiAnteprimaIbrido).toBe('function');
        expect(typeof target.avviaIbridoSeduta).toBe('function');
        expect(typeof target.terminaIbridoSeduta).toBe('function');
        expect(typeof target.annullaSalvataggioIbrido).toBe('function');
        expect(typeof target.confermaSalvaIbridoSeduta).toBe('function');
        expect(typeof target.chiudiIbridoActiveModal).toBe('function');
        expect(typeof target.apriAnteprimaInvictus).toBe('function');
        expect(typeof target.chiudiAnteprimaInvictus).toBe('function');
    });

    it('contains compact card and preview modal for INVICTUS', () => {
        expect(html).toContain('nst-standard-card-compact');
        expect(html).toContain('onclick="apriAnteprimaInvictus()"');
        expect(html).toContain('id="nst-invictus-preview-modal"');
    });

    it('contains coach 2-tab main navigation bar (Atleti vs Libreria Allenamenti)', () => {
        expect(html).toContain('class="nst-coach-main-tabs-bar"');
        expect(html).toContain('id="nst-coach-tab-athletes"');
        expect(html).toContain('id="nst-coach-tab-library"');
        expect(html).toContain('onclick="switchCoachMainTab(\'athletes\')"');
        expect(html).toContain('onclick="switchCoachMainTab(\'library\')"');
        expect(html).toContain('id="nst-coach-athletes-wrapper"');
        expect(html).toContain('id="nst-coach-library-view"');
        expect(css).toContain('.nst-coach-main-tabs-bar');
        expect(css).toContain('.nst-coach-main-tab');
        expect(css).toContain('.nst-coach-library-grid');
    });

    it('contains coach library view controls and program editor modal', () => {
        expect(html).toContain('id="nst-coach-library-grid"');
        expect(html).toContain('id="nst-lib-filter-tipo"');
        expect(html).toContain('id="nst-lib-search-input"');
        expect(html).toContain('id="nst-coach-programma-modal"');
        expect(html).toContain('id="nst-prog-edit-nome"');
        expect(html).toContain('id="nst-prog-edit-tipo"');
        expect(html).toContain('id="nst-prog-edit-categoria"');
        expect(html).toContain('id="nst-prog-edit-timer-mode"');
        expect(html).toContain('id="nst-prog-edit-tabata-row"');
        expect(html).toContain('id="nst-prog-edit-esercizi-container"');
        expect(html).toContain('salvaProgrammaLibreriaDaModal()');
    });

    it('exports all coach library CRUD and navigation functions', () => {
        require('../portal/nestore.js');
        const target = global.window;
        expect(typeof target.switchCoachMainTab).toBe('function');
        expect(typeof target.caricaLibreriaProgrammi).toBe('function');
        expect(typeof target.caricaLibreriaProgrammiCoach).toBe('function');
        expect(typeof target.filtraProgrammiLibreriaCoach).toBe('function');
        expect(typeof target.apriModalEditorProgramma).toBe('function');
        expect(typeof target.chiudiModalEditorProgramma).toBe('function');
        expect(typeof target.gestisciCambioTimerMode).toBe('function');
        expect(typeof target.gestisciCambioTipoProgramma).toBe('function');
        expect(typeof target.aggiungiRigaEsercizioModal).toBe('function');
        expect(typeof target.salvaProgrammaLibreriaDaModal).toBe('function');
        expect(typeof target.disattivaProgrammaLibreria).toBe('function');
    });

    it('enforces EPIKA soft-delete rule in disattivaProgrammaLibreria (attivo = false, no DELETE)', () => {
        expect(js).toContain("update({ attivo: false");
        expect(js).not.toContain(".from('nestore_programmi_libreria').delete()");
    });
});




