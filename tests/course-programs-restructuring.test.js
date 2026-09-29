import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Setup globals for Node environment
global.APP_CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key' };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };

const createChainableQuery = () => {
    const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        gte: () => q,
        insert: () => Promise.resolve({ error: null }),
        update: () => q,
        then: (resolve) => resolve({ data: [], error: null })
    };
    return q;
};

global.window = global.window || {
    supabase: { createClient: () => ({ from: () => createChainableQuery() }) },
    addEventListener: () => {},
    location: { search: '', hash: '' },
    requestAnimationFrame: () => {}
};

global.document = global.document || {
    addEventListener: () => {},
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, textContent: '', innerHTML: '' })
};

const nestoreModule = await import('../portal/nestore.js');

describe('Course-Based Workout Programs Restructuring', () => {
    it('exports official course IDs and configuration constants', () => {
        expect(nestoreModule.CORSO_IBRIDO_ID).toBe('11102454-b063-4811-a361-6c8459764ce8');
        expect(nestoreModule.CORSO_STRONGMAN_ID).toBe('b1d8c235-fc94-4372-bff1-28f183700c92');
        expect(nestoreModule.CORSO_SCAB_ID).toBe('3854f25c-db1c-4c6a-b62a-70398643239a');
        expect(typeof nestoreModule.determinaCorsiAccessibili).toBe('function');
        expect(typeof nestoreModule.renderSchedeCorsoAttivo).toBe('function');
        expect(typeof nestoreModule.selezionaCorsoSchede).toBe('function');
        expect(typeof nestoreModule.popolaSelectFiltroCorsiCoach).toBe('function');
        expect(typeof nestoreModule.popolaSelectCorsiModal).toBe('function');
    });

    it('determinaCorsiAccessibili grants complimentary SCAB access to athletes enrolled in Ibrido', async () => {
        window.utenteIscrizioniCorsi = [
            { evento_id: nestoreModule.CORSO_IBRIDO_ID, stato_pagamento: 'PAGATO' }
        ];

        const corsi = await nestoreModule.determinaCorsiAccessibili();
        expect(corsi).toHaveLength(2);

        const ibrido = corsi.find(c => c.id === nestoreModule.CORSO_IBRIDO_ID);
        const scab = corsi.find(c => c.id === nestoreModule.CORSO_SCAB_ID);

        expect(ibrido).toBeDefined();
        expect(ibrido.isGift).toBe(false);

        expect(scab).toBeDefined();
        expect(scab.isGift).toBe(true);
    });

    it('determinaCorsiAccessibili restricts athletes to only their enrolled course when not enrolled in Ibrido', async () => {
        window.utenteIscrizioniCorsi = [
            { evento_id: nestoreModule.CORSO_STRONGMAN_ID, stato_pagamento: 'PAGATO' }
        ];

        const corsi = await nestoreModule.determinaCorsiAccessibili();
        expect(corsi).toHaveLength(1);
        expect(corsi[0].id).toBe(nestoreModule.CORSO_STRONGMAN_ID);
        expect(corsi[0].isGift).toBe(false);
    });

    it('renders Strongman Base with PL BEGINNER 1 and empty Avanzato/Benchmark placeholders', () => {
        const mockBaseGrid = { innerHTML: '' };
        const mockAvanzatoGrid = { innerHTML: '' };
        const mockBenchGrid = { innerHTML: '' };
        const mockBaseTitle = { textContent: '' };
        const mockBaseBadge = { textContent: '' };
        const mockAvanzatoTitle = { textContent: '' };
        const mockNavBar = { classList: { add: vi.fn(), remove: vi.fn() }, innerHTML: '' };
        const mockScabBanner = { classList: { add: vi.fn(), remove: vi.fn() } };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-programmi-grid') return mockBaseGrid;
            if (id === 'nst-schede-avanzato-grid') return mockAvanzatoGrid;
            if (id === 'nst-schede-benchmark-grid') return mockBenchGrid;
            if (id === 'nst-schede-base-title') return mockBaseTitle;
            if (id === 'nst-schede-base-badge') return mockBaseBadge;
            if (id === 'nst-schede-avanzato-title') return mockAvanzatoTitle;
            if (id === 'nst-athlete-course-selector-bar') return mockNavBar;
            if (id === 'nst-scab-gift-banner') return mockScabBanner;
            return { textContent: '', innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } };
        });

        window.libreriaProgrammiTotali = [
            { id: 'prog-pl-beg', nome: 'PL BEGINNER 1', tipo: 'forza', categoria: 'forza', corso_id: nestoreModule.CORSO_STRONGMAN_ID, raggruppamento: 'base', attivo: true }
        ];

        nestoreModule.selezionaCorsoSchede(nestoreModule.CORSO_STRONGMAN_ID);

        // Strongman Base contains PL BEGINNER 1
        expect(mockBaseGrid.innerHTML).toContain('PL BEGINNER 1');
        expect(mockBaseTitle.textContent).toContain('STRONGMAN');
        // Avanzato & Benchmark empty placeholders
        expect(mockAvanzatoGrid.innerHTML).toContain('Nessun programma avanzato disponibile');
        expect(mockBenchGrid.innerHTML).toContain('Nessun allenamento benchmark registrato');
    });

    it('keeps PL BEGINNER 1 separate from Ibrido Base catalog', () => {
        const mockBaseGrid = { innerHTML: '' };
        const mockAvanzatoGrid = { innerHTML: '' };
        const mockBenchGrid = { innerHTML: '' };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-programmi-grid') return mockBaseGrid;
            if (id === 'nst-schede-avanzato-grid') return mockAvanzatoGrid;
            if (id === 'nst-schede-benchmark-grid') return mockBenchGrid;
            return { textContent: '', innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } };
        });

        window.libreriaProgrammiTotali = [
            { id: 'ibrido-1', nome: 'Metcon 1', tipo: 'ibrido', categoria: 'metcon', corso_id: nestoreModule.CORSO_IBRIDO_ID, raggruppamento: 'base', attivo: true },
            { id: 'prog-pl-beg', nome: 'PL BEGINNER 1', tipo: 'forza', categoria: 'forza', corso_id: nestoreModule.CORSO_STRONGMAN_ID, raggruppamento: 'base', attivo: true }
        ];

        nestoreModule.selezionaCorsoSchede(nestoreModule.CORSO_IBRIDO_ID);

        expect(mockBaseGrid.innerHTML).toContain('Metcon 1');
        expect(mockBaseGrid.innerHTML).not.toContain('PL BEGINNER 1');
    });

    it('popolaSelectFiltroCorsiCoach and popolaSelectCorsiModal generate valid course options', () => {
        const filterMock = { value: '', innerHTML: '' };
        const modalSelectMock = { value: '', innerHTML: '' };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-lib-filter-corso') return filterMock;
            if (id === 'nst-prog-edit-corso') return modalSelectMock;
            return null;
        });

        nestoreModule.popolaSelectFiltroCorsiCoach();
        expect(filterMock.innerHTML).toContain('TUTTI I CORSI');
        expect(filterMock.innerHTML).toContain(nestoreModule.CORSO_IBRIDO_ID);
        expect(filterMock.innerHTML).toContain(nestoreModule.CORSO_STRONGMAN_ID);

        nestoreModule.popolaSelectCorsiModal();
        expect(modalSelectMock.innerHTML).toContain(nestoreModule.CORSO_IBRIDO_ID);
        expect(modalSelectMock.innerHTML).toContain(nestoreModule.CORSO_STRONGMAN_ID);
    });

    it('HTML and CSS contain all course navigation and grouping classes', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.html'), 'utf-8');
        const css = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.css'), 'utf-8');

        expect(html).toContain('id="nst-athlete-course-selector-bar"');
        expect(html).toContain('id="nst-scab-gift-banner"');
        expect(html).toContain('id="nst-prog-edit-corso"');
        expect(html).toContain('id="nst-prog-edit-raggruppamento"');
        expect(html).toContain('id="nst-lib-filter-corso"');
        expect(html).toContain('id="nst-lib-filter-raggruppamento"');

        expect(css).toContain('.nst-course-tabs-nav');
        expect(css).toContain('.nst-course-tab-btn');
        expect(css).toContain('.nst-course-gift-banner');
        expect(css).toContain('.nst-empty-group-box');
        expect(css).toContain('.nst-badge-raggruppamento');
    });

    it('isProgrammaBenchmark identifies Invictus and benchmark items correctly', () => {
        expect(nestoreModule.isProgrammaBenchmark({ raggruppamento: 'benchmark' })).toBe(true);
        expect(nestoreModule.isProgrammaBenchmark({ tipo: 'invictus' })).toBe(true);
        expect(nestoreModule.isProgrammaBenchmark({ codice: 'invictus_base' })).toBe(true);
        expect(nestoreModule.isProgrammaBenchmark({ id: 'invictus' })).toBe(true);
        expect(nestoreModule.isProgrammaBenchmark({ nome: 'Invictus' })).toBe(true);
        expect(nestoreModule.isProgrammaBenchmark({ nome: 'INVICTUS WOD' })).toBe(true);

        expect(nestoreModule.isProgrammaBenchmark({ nome: 'Metcon 1', tipo: 'metcon' })).toBe(false);
        expect(nestoreModule.isProgrammaBenchmark({ nome: 'Forza 1', tipo: 'forza' })).toBe(false);
        expect(nestoreModule.isProgrammaBenchmark(null)).toBe(false);
    });

    it('strictly excludes Invictus from Ibrido Base grid and places it in Benchmark', () => {
        const mockBaseGrid = { innerHTML: '' };
        const mockBenchGrid = { innerHTML: '' };
        const mockBaseTitle = { textContent: '' };
        const mockBaseBadge = { textContent: '' };
        const mockBenchTitle = { textContent: '' };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-programmi-grid') return mockBaseGrid;
            if (id === 'nst-schede-benchmark-grid') return mockBenchGrid;
            if (id === 'nst-schede-base-title') return mockBaseTitle;
            if (id === 'nst-schede-base-badge') return mockBaseBadge;
            if (id === 'nst-schede-benchmark-title') return mockBenchTitle;
            return { textContent: '', innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } };
        });

        // Simulate DB returning Invictus tagged with corso_id Ibrido and tipo forza
        window.libreriaProgrammiTotali = [
            { id: 'inv-1', nome: 'Invictus', tipo: 'forza', categoria: 'forza', corso_id: nestoreModule.CORSO_IBRIDO_ID, attivo: true },
            { id: 'm1', nome: 'Metcon 1', tipo: 'metcon', categoria: 'metcon', corso_id: nestoreModule.CORSO_IBRIDO_ID, raggruppamento: 'base', attivo: true },
            { id: 'f1', nome: 'Forza 1', tipo: 'forza', categoria: 'forza', corso_id: nestoreModule.CORSO_IBRIDO_ID, raggruppamento: 'base', attivo: true }
        ];

        nestoreModule.selezionaCorsoSchede(nestoreModule.CORSO_IBRIDO_ID);

        // Base grid MUST NOT contain Invictus
        expect(mockBaseGrid.innerHTML).not.toContain('Invictus');
        expect(mockBaseGrid.innerHTML).toContain('Metcon 1');
        expect(mockBaseGrid.innerHTML).toContain('Forza 1');
        expect(mockBaseBadge.textContent).toBe('2 PROGRAMMI');

        // Benchmark grid and title
        expect(mockBenchGrid.innerHTML).toContain('INVICTUS');
        expect(mockBenchTitle.textContent).toBe('ALLENAMENTI BENCHMARK');
    });

    it('verifies HTML title is ALLENAMENTI BENCHMARK and CSS has flex-wrap: wrap', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.html'), 'utf-8');
        const css = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.css'), 'utf-8');

        expect(html).toContain('<span id="nst-schede-benchmark-title">ALLENAMENTI BENCHMARK</span>');
        expect(html).not.toContain('ALLENAMENTI STANDARD &amp; BENCHMARK');

        // Tabs nav has flex-wrap: wrap and no scrollbar-width: thin
        expect(css).toMatch(/\.nst-course-tabs-nav\s*\{[^}]*flex-wrap:\s*wrap;/);
        expect(css).not.toMatch(/\.nst-course-tabs-nav\s*\{[^}]*scrollbar-width:\s*thin;/);

        // Compact card has min-height and padding
        expect(css).toMatch(/\.nst-standard-card-compact\s*\{[^}]*min-height:\s*68px;/);
    });

    it('verifies .nst-card has flex-shrink: 0 to prevent vertical squishing and .nst-data-panel has overflow scrolling', () => {
        const css = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.css'), 'utf-8');

        // .nst-card must not shrink inside flex panels
        expect(css).toMatch(/\.nst-card\s*\{[^}]*flex-shrink:\s*0;/);
        expect(css).toMatch(/\.nst-card\s*\{[^}]*min-height:\s*max-content;/);

        // .nst-data-panel must have overflow-y auto and overflow-x hidden
        expect(css).toMatch(/\.nst-data-panel\s*\{[^}]*overflow-y:\s*auto;/);
        expect(css).toMatch(/\.nst-data-panel\s*\{[^}]*overflow-x:\s*hidden;/);

        // #nst-schede-panel padding bottom
        expect(css).toMatch(/#nst-schede-panel\s*\{[^}]*padding-bottom:\s*32px;/);

        // course tabs nav and gift banner must not shrink
        expect(css).toMatch(/\.nst-course-tabs-nav\s*\{[^}]*flex-shrink:\s*0;/);
        expect(css).toMatch(/\.nst-course-gift-banner\s*\{[^}]*flex-shrink:\s*0;/);
    });
});
