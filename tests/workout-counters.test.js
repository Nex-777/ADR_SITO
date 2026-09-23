import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock browser globals before loading nestore.js in Node
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

const nestore = await import('../portal/nestore.js');
const {
    calcolaCompletamentiProgrammi,
    aggiornaContatoreInvictus,
    renderCatalogoIbrido,
    IBRIDO_PROGRAMMI_CATALOGO,
    setCurrentAllenamentiData
} = nestore;

describe('Workout Counters (Ibrido & Benchmark Invictus)', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    describe('Markup & CSS Structure', () => {
        it('contiene il badge contatore per Invictus in nestore.html con stile iniziale zero', () => {
            expect(html).toContain('id="nst-invictus-counter"');
            expect(html).toContain('class="nst-workout-counter nst-workout-counter-zero"');
        });

        it('include le classi CSS per il contatore cerchiato e i suoi stati in nestore.css', () => {
            expect(css).toContain('.nst-workout-counter');
            expect(css).toContain('.nst-workout-counter-zero');
            expect(css).toContain('.nst-workout-counter-active');
            expect(css).toContain('.nst-ibrido-card.metcon .nst-workout-counter-active');
            expect(css).toContain('.nst-ibrido-card.forza .nst-workout-counter-active');
        });
    });

    describe('calcolaCompletamentiProgrammi', () => {
        it('ritorna contatori a 0 quando lo storico è vuoto o non valido', () => {
            const resNull = calcolaCompletamentiProgrammi(null);
            expect(resNull.invictus).toBe(0);
            expect(resNull.ibrido_metcon_1).toBe(0);
            expect(resNull.ibrido_forza_1).toBe(0);

            const resEmpty = calcolaCompletamentiProgrammi([]);
            expect(resEmpty.invictus).toBe(0);
            expect(resEmpty.ibrido_metcon_1).toBe(0);
        });

        it('ignora le sessioni soft-deleted (attivo: false)', () => {
            const data = [
                {
                    id: '1',
                    corso_disciplina: 'Invictus',
                    attivo: false
                },
                {
                    id: '2',
                    corso_disciplina: 'Ibrido — Metcon 1',
                    scheda_dati: { programma_id: 'ibrido_metcon_1' },
                    attivo: false
                },
                {
                    id: '3',
                    corso_disciplina: 'Invictus',
                    attivo: true
                }
            ];

            const res = calcolaCompletamentiProgrammi(data);
            expect(res.invictus).toBe(1);
            expect(res.ibrido_metcon_1).toBe(0);
        });

        it('conteggia accuratamente gli allenamenti Invictus da diverse varianti di disciplina o scheda_dati', () => {
            const data = [
                { id: '1', corso_disciplina: 'Invictus', attivo: true },
                { id: '2', corso_disciplina: 'invictus benchmark', attivo: true },
                { id: '3', corso_disciplina: 'Altro', scheda_dati: { benchmark: 'invictus' }, attivo: true },
                { id: '4', corso_disciplina: 'Custom', scheda_dati: JSON.stringify({ tipo: 'invictus' }), attivo: true }
            ];

            const res = calcolaCompletamentiProgrammi(data);
            expect(res.invictus).toBe(4);
        });

        it('conteggia accuratamente i programmi Ibrido (Metcon e Forza)', () => {
            const data = [
                // Metcon 1 via programma_id
                { id: 'm1_a', corso_disciplina: 'Ibrido — Metcon 1', scheda_dati: { programma_id: 'ibrido_metcon_1' }, attivo: true },
                // Metcon 1 via corso_disciplina standard
                { id: 'm1_b', corso_disciplina: 'Ibrido — Metcon 1', attivo: true },
                // Metcon 1 via corso_disciplina con trattino
                { id: 'm1_c', corso_disciplina: 'Ibrido - Metcon 1', attivo: true },
                // Forza 1 via programma_id
                { id: 'f1_a', corso_disciplina: 'Ibrido — Forza 1', scheda_dati: { programma_id: 'ibrido_forza_1' }, attivo: true },
                // Forza 1 via scheda_dati JSON string
                { id: 'f1_b', corso_disciplina: 'Ibrido', scheda_dati: JSON.stringify({ programma_id: 'ibrido_forza_1' }), attivo: true },
                // Metcon 2
                { id: 'm2_a', corso_disciplina: 'Ibrido — Metcon 2', scheda_dati: { programma_id: 'ibrido_metcon_2' }, attivo: true }
            ];

            const res = calcolaCompletamentiProgrammi(data);
            expect(res.ibrido_metcon_1).toBe(3);
            expect(res.ibrido_forza_1).toBe(2);
            expect(res.ibrido_metcon_2).toBe(1);
            expect(res.ibrido_forza_2).toBe(0);
            expect(res.invictus).toBe(0);
        });
    });

    describe('DOM Rendering & Updating', () => {
        let mockGrid;
        let mockInvictusCounter;

        beforeEach(() => {
            mockGrid = { innerHTML: '' };
            mockInvictusCounter = {
                textContent: '0',
                title: '',
                classList: {
                    classes: new Set(['nst-workout-counter', 'nst-workout-counter-zero']),
                    add(c) { this.classes.add(c); },
                    remove(c) { this.classes.delete(c); },
                    contains(c) { return this.classes.has(c); }
                }
            };

            global.document = {
                getElementById: (id) => {
                    if (id === 'nst-ibrido-programmi-grid') return mockGrid;
                    if (id === 'nst-invictus-counter') return mockInvictusCounter;
                    return null;
                }
            };
        });

        it('aggiornaContatoreInvictus imposta zero con classe nst-workout-counter-zero', () => {
            aggiornaContatoreInvictus(0);
            expect(mockInvictusCounter.textContent).toBe(0);
            expect(mockInvictusCounter.classList.contains('nst-workout-counter-zero')).toBe(true);
            expect(mockInvictusCounter.classList.contains('nst-workout-counter-active')).toBe(false);
        });

        it('aggiornaContatoreInvictus imposta valore positivo con classe nst-workout-counter-active', () => {
            aggiornaContatoreInvictus(3);
            expect(mockInvictusCounter.textContent).toBe(3);
            expect(mockInvictusCounter.classList.contains('nst-workout-counter-active')).toBe(true);
            expect(mockInvictusCounter.classList.contains('nst-workout-counter-zero')).toBe(false);
        });

        it('renderCatalogoIbrido inietta il contatore cerchiato tra titolo e badge', () => {
            const fakeData = [
                { id: '1', corso_disciplina: 'Ibrido — Metcon 1', scheda_dati: { programma_id: 'ibrido_metcon_1' }, attivo: true },
                { id: '2', corso_disciplina: 'Ibrido — Metcon 1', scheda_dati: { programma_id: 'ibrido_metcon_1' }, attivo: true },
                { id: '3', corso_disciplina: 'Invictus', attivo: true }
            ];

            setCurrentAllenamentiData(fakeData);
            renderCatalogoIbrido();

            // Invictus counter updated
            expect(mockInvictusCounter.textContent).toBe(1);
            expect(mockInvictusCounter.classList.contains('nst-workout-counter-active')).toBe(true);

            // Grid cards contain counters
            expect(mockGrid.innerHTML).toContain('class="nst-workout-counter nst-workout-counter-active" title="2 sessioni registrate">2<');
            expect(mockGrid.innerHTML).toContain('class="nst-workout-counter nst-workout-counter-zero" title="0 sessioni registrate">0<');
            expect(mockGrid.innerHTML).toContain('nst-ibrido-card-title');
            expect(mockGrid.innerHTML).toContain('nst-ibrido-badge');
        });
    });
});
