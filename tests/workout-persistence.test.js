import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser globals before requiring nestore.js
global.APP_CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key' };
let mockStorage = {};
global.localStorage = {
    getItem: vi.fn((k) => mockStorage[k] || null),
    setItem: vi.fn((k, v) => { mockStorage[k] = String(v); }),
    removeItem: vi.fn((k) => { delete mockStorage[k]; }),
    clear: vi.fn(() => { mockStorage = {}; })
};

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
    location: { search: '', hash: '', pathname: '/portal/nestore.html' },
    requestAnimationFrame: () => {}
};

const nestore = await import('../portal/nestore.js');

describe('Workout Session Persistence & UI Restoration (Forza & Metcon)', () => {
    beforeEach(() => {
        mockStorage = {};
        vi.restoreAllMocks();
    });

    it('renderForzaEserciziAttivi should populate container with exercise cards, warmups, and work rows', () => {
        let innerHtmlContent = '';
        const mockContainer = {
            set innerHTML(val) { innerHtmlContent = val; },
            get innerHTML() { return innerHtmlContent; }
        };

        global.document = {
            getElementById: vi.fn((id) => {
                if (id === 'nst-ibrido-active-ex-table-container') return mockContainer;
                return null;
            })
        };

        const sampleProg = { id: 'forza_3', nome: 'Forza 3', tipo: 'forza' };
        const sampleConfig = {
            programma_id: 'forza_3',
            programma_nome: 'Forza 3',
            esercizi: [
                {
                    nome: 'Back Squat',
                    isBw: false,
                    serie_target: 3,
                    rip_target: 5,
                    peso_target_kg: 100,
                    target_descrittivo: '3x5 @ 100kg',
                    riscaldamento: [
                        { rip: 10, pct: 50, peso_kg: 50 },
                        { rip: 5, pct: 70, peso_kg: 70 }
                    ]
                }
            ]
        };

        nestore.renderForzaEserciziAttivi(sampleProg, sampleConfig);

        expect(innerHtmlContent).toContain('Back Squat');
        expect(innerHtmlContent).toContain('TARGET: 3x5 @ 100kg');
        expect(innerHtmlContent).toContain('Risc 1 10x');
        expect(innerHtmlContent).toContain('Risc 2 5x');
        expect(innerHtmlContent).toContain('Serie 1');
        expect(innerHtmlContent).toContain('Serie 2');
        expect(innerHtmlContent).toContain('Serie 3');
        expect(innerHtmlContent).toContain('+ AGGIUNGI SERIE EXTRA');
    });

    it('salvaStatoWorkoutAttivo should persist complete Forza state into localStorage', () => {
        const sampleProg = { id: 'forza_3', nome: 'Forza 3', tipo: 'forza', categoria: 'forza' };
        const sampleConfig = {
            programma_id: 'forza_3',
            programma_nome: 'Forza 3',
            esercizi: [{ nome: 'Stacco', serie_target: 2, rip_target: 5, peso_target_kg: 120 }]
        };

        const mockIbridoModal = {
            classList: { contains: vi.fn((c) => c === 'nst-hidden' ? false : false) }
        };
        const mockNote = { value: 'Sensazioni ottime' };

        const mockRow1 = {
            dataset: { setStatus: 'fatta', exIdx: '0' },
            getAttribute: vi.fn((attr) => attr === 'data-set-status' ? 'fatta' : null),
            classList: { contains: vi.fn(() => false) },
            querySelector: vi.fn((sel) => {
                if (sel === '.peso-input') return { value: '120' };
                if (sel === '.rip-input') return { value: '5' };
                return null;
            }),
            closest: vi.fn(() => ({ dataset: { exIdx: '0' } }))
        };

        global.document = {
            getElementById: vi.fn((id) => {
                if (id === 'nst-ibrido-active-modal') return mockIbridoModal;
                if (id === 'nst-ibrido-workout-note-inline') return mockNote;
                return null;
            }),
            querySelectorAll: vi.fn((sel) => {
                if (sel === '.nst-active-set-row') return [mockRow1];
                return [];
            })
        };

        // Imposta variabili globali e salva
        window.ibridoSelezionato = sampleProg;
        window.ibridoConfigurazionePersonalizzata = sampleConfig;

        nestore.salvaStatoWorkoutAttivo();

        const rawSaved = mockStorage['adr_active_workout_session'];
        expect(rawSaved).toBeTruthy();
        const saved = JSON.parse(rawSaved);
        expect(saved.type).toBe('ibrido');
        expect(saved.state.note).toBe('Sensazioni ottime');
        expect(saved.state.ibridoConfigurazionePersonalizzata.programma_nome).toBe('Forza 3');
        expect(saved.state.forzaState).toHaveLength(1);
        expect(saved.state.forzaState[0].status).toBe('fatta');
        expect(saved.state.forzaState[0].peso).toBe('120');
        expect(saved.state.forzaState[0].rip).toBe('5');
    });

    it('pulisciStatoWorkoutAttivo removes session from localStorage', () => {
        mockStorage['adr_active_workout_session'] = JSON.stringify({ type: 'ibrido' });
        nestore.pulisciStatoWorkoutAttivo();
        expect(mockStorage['adr_active_workout_session']).toBeUndefined();
    });

    it('ripristinaStatoWorkoutAttivo restores complete Forza session and regenerates UI', () => {
        const savedSession = {
            type: 'ibrido',
            state: {
                ibridoSelezionato: { id: 'forza_3', nome: 'Forza 3', tipo: 'forza', categoria: 'forza' },
                ibridoConfigurazionePersonalizzata: {
                    programma_id: 'forza_3',
                    programma_nome: 'Forza 3',
                    esercizi: [{ nome: 'Panca Piana', serie_target: 1, rip_target: 6, peso_target_kg: 80 }]
                },
                currentTimerMode: 'stopwatch',
                note: 'Nota ripristinata',
                forzaState: [
                    { index: 0, exIdx: 0, status: 'fatta', peso: '85', rip: '6', isExtra: false }
                ]
            }
        };

        mockStorage['adr_active_workout_session'] = JSON.stringify(savedSession);

        const modalClasses = new Set(['nst-hidden']);
        const mockModal = {
            classList: {
                add: (c) => modalClasses.add(c),
                remove: (c) => modalClasses.delete(c),
                contains: (c) => modalClasses.has(c)
            }
        };

        const mockTitle = { textContent: '', style: {} };
        const mockNote = { value: '' };
        let renderedHtml = '';
        const mockContainer = {
            set innerHTML(v) { renderedHtml = v; },
            get innerHTML() { return renderedHtml; }
        };

        const mockRow = {
            dataset: { setStatus: '' },
            setAttribute: vi.fn(),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
                contains: vi.fn(() => false)
            },
            querySelector: vi.fn((sel) => {
                if (sel === '.peso-input') return { value: '' };
                if (sel === '.rip-input') return { value: '' };
                return null;
            })
        };

        global.document = {
            getElementById: vi.fn((id) => {
                if (id === 'nst-ibrido-active-modal') return mockModal;
                if (id === 'nst-ibrido-active-title') return mockTitle;
                if (id === 'nst-ibrido-workout-note-inline') return mockNote;
                if (id === 'nst-ibrido-active-ex-table-container') return mockContainer;
                if (id === 'nst-timer-dock') return { classList: { add: vi.fn(), remove: vi.fn() } };
                return null;
            }),
            querySelectorAll: vi.fn((sel) => {
                if (sel === '.nst-active-set-row') return [mockRow];
                return [];
            })
        };

        nestore.ripristinaStatoWorkoutAttivo();

        // Verifica apertura modale e rimozione nst-hidden
        expect(modalClasses.has('nst-hidden')).toBe(false);
        // Verifica titolo aggiornato con il nome programma
        expect(mockTitle.textContent).toContain('FORZA 3');
        // Verifica note ripristinate
        expect(mockNote.value).toBe('Nota ripristinata');
        // Verifica tabella esercizi generata
        expect(renderedHtml).toContain('Panca Piana');
        // Verifica status applicato alla riga
        expect(mockRow.dataset.setStatus).toBe('fatta');
        // Verifica timer mode impostato a stopwatch
        expect(mockStorage['adr_timer_mode']).toBe('stopwatch');
    });

    it('aggiornaVisibilitaDock hides dock when workout modal is full screen', () => {
        let dockHidden = false;
        const mockDock = {
            classList: {
                add: vi.fn((c) => { if (c === 'nst-hidden') dockHidden = true; }),
                remove: vi.fn((c) => { if (c === 'nst-hidden') dockHidden = false; })
            }
        };

        // Modale aperto a tutto schermo (non nascosto)
        const mockIbridoModal = {
            classList: { contains: vi.fn((c) => c === 'nst-hidden' ? false : false) }
        };

        global.document = {
            getElementById: vi.fn((id) => {
                if (id === 'nst-timer-dock') return mockDock;
                if (id === 'nst-ibrido-active-modal') return mockIbridoModal;
                return null;
            })
        };

        window.ibridoSessionMinimized = false;

        nestore.aggiornaVisibilitaDock();

        // La dock deve essere nascosta perché il modale è full screen
        expect(dockHidden).toBe(true);
    });
});
