import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

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

        require('../portal/nestore.js');
        const target = global.window || require('../portal/nestore.js');
        expect(typeof target.switchNestoreView).toBe('function');
        expect(typeof target.switchNestorePanel).toBe('function');
        expect(typeof target.caricaCoachDashboard).toBe('function');
        expect(typeof target.caricaAdminDashboard).toBe('function');
        expect(typeof target.caricaSchedeAtleta).toBe('function');
    });
});
