import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser globals before requiring nestore.js in Node
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

describe('NESTORE — Schede Allenamento Forza & Flusso Personalizzato', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.document = {
            addEventListener: () => {},
            getElementById: vi.fn(),
            createElement: vi.fn(() => ({
                classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
                innerHTML: '',
                style: {},
                appendChild: vi.fn()
            })),
            querySelectorAll: vi.fn(() => [])
        };
        global.window = {
            ...global.window,
            currentUserPrList: [
                { nome: 'Panca Piana', peso_kg: 110, ripetizioni: 5, serie: 4 },
                { nome: 'Squat', peso_kg: 140, ripetizioni: 4, serie: 4 }
            ],
            currentUserPesoKg: 75,
            IBRIDO_PROGRAMMI_CATALOGO: nestore.IBRIDO_PROGRAMMI_CATALOGO
        };
    });

    it('ha la sequenza corretta di riscaldamento specifico standard (DEFAULT_FORZA_WARMUP)', () => {
        const warmup = nestore.DEFAULT_FORZA_WARMUP;
        expect(warmup).toHaveLength(5);
        expect(warmup[0]).toEqual({ rip: 10, pct: 75 });
        expect(warmup[1]).toEqual({ rip: 5, pct: 80 });
        expect(warmup[2]).toEqual({ rip: 3, pct: 85 });
        expect(warmup[3]).toEqual({ rip: 1, pct: 95 });
        expect(warmup[4]).toEqual({ rip: 1, pct: 100 });
    });

    it('identifica correttamente gli esercizi a corpo libero vs con carico tramite isPureBodyweight', () => {
        expect(nestore.isPureBodyweight('Jump Max')).toBe(true);
        expect(nestore.isPureBodyweight('Salto in alto')).toBe(true);
        expect(nestore.isPureBodyweight('Air Squat')).toBe(true);
        expect(nestore.isPureBodyweight('Panca Piana')).toBe(false);
        expect(nestore.isPureBodyweight('Squat')).toBe(false);
        expect(nestore.isPureBodyweight('Stacco da terra')).toBe(false);
        expect(nestore.isPureBodyweight('Trazioni Pesate')).toBe(false);
    });

    it('recupera il massimo storico registrato per un esercizio tramite ottieniMassimoStoricoEsercizio', () => {
        expect(nestore.ottieniMassimoStoricoEsercizio('Panca Piana')).toBe(110);
        expect(nestore.ottieniMassimoStoricoEsercizio('Squat')).toBe(140);
        expect(nestore.ottieniMassimoStoricoEsercizio('Stacco da terra')).toBe(0);
    });

    it('mostra badge di avviso se il peso inserito è inferiore al massimo storico', () => {
        const mockInput = { value: '95' };
        const mockBadge = {
            innerHTML: '',
            classList: { remove: vi.fn(), add: vi.fn() }
        };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-forza-cfg-peso-0') return mockInput;
            if (id === 'nst-forza-badge-max-0') return mockBadge;
            return null;
        });

        nestore.verificaForzaMaxStorico(0, 110);

        expect(mockBadge.classList.remove).toHaveBeenCalledWith('nst-hidden');
        expect(mockBadge.innerHTML).toContain('inferiore al tuo massimo storico (110 kg)');
    });

    it('mostra badge di record se il peso inserito è maggiore o uguale al massimo storico', () => {
        const mockInput = { value: '115' };
        const mockBadge = {
            innerHTML: '',
            classList: { remove: vi.fn(), add: vi.fn() }
        };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-forza-cfg-peso-0') return mockInput;
            if (id === 'nst-forza-badge-max-0') return mockBadge;
            return null;
        });

        nestore.verificaForzaMaxStorico(0, 110);

        expect(mockBadge.classList.remove).toHaveBeenCalledWith('nst-hidden');
        expect(mockBadge.innerHTML).toContain('Record storico: 110 kg');
    });

    it('genera la card di configurazione completa in anteprima per programmi forza', () => {
        const exListMock = { innerHTML: '' };
        const titleMock = { textContent: '' };
        const descMock = { textContent: '' };
        const cardMock = { classList: { add: vi.fn(), remove: vi.fn() } };
        const modalMock = { classList: { add: vi.fn(), remove: vi.fn() } };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-preview-ex-list') return exListMock;
            if (id === 'nst-ibrido-preview-title') return titleMock;
            if (id === 'nst-ibrido-preview-desc') return descMock;
            if (id === 'nst-ibrido-preview-card') return cardMock;
            if (id === 'nst-ibrido-preview-modal') return modalMock;
            return null;
        });

        nestore.apriAnteprimaIbrido('ibrido_forza_1');

        expect(exListMock.innerHTML).toContain('RISCALDAMENTO SPECIFICO');
        expect(exListMock.innerHTML).toContain('SEQUENZA ALLENANTE');
        expect(exListMock.innerHTML).toContain('Panca Piana');
        expect(exListMock.innerHTML).toContain('nst-forza-cfg-warmup-0-0');
        expect(exListMock.innerHTML).toContain('nst-forza-cfg-serie-0');
        expect(exListMock.innerHTML).toContain('nst-forza-cfg-rip-0');
        expect(exListMock.innerHTML).toContain('nst-forza-cfg-peso-0');
    });

    it('avvia la seduta forza con target fisso e caselle ripetizioni precompilate di default', async () => {
        const mockSerieInput = { value: '4' };
        const mockRipInput = { value: '5' };
        const mockPesoInput = { value: '105' };
        const mockWarmupInput = { value: '80' };

        const exTableContainer = { innerHTML: '' };
        const titleMock = { textContent: '', style: {} };
        const runningView = { classList: { remove: vi.fn(), add: vi.fn() } };
        const saveView = { classList: { remove: vi.fn(), add: vi.fn() } };
        const modalMock = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-ex-table-container') return exTableContainer;
            if (id === 'nst-ibrido-active-title') return titleMock;
            if (id === 'nst-ibrido-running-view') return runningView;
            if (id === 'nst-ibrido-save-view') return saveView;
            if (id === 'nst-ibrido-active-modal') return modalMock;
            if (id && id.startsWith('nst-forza-cfg-serie-')) return mockSerieInput;
            if (id && id.startsWith('nst-forza-cfg-rip-')) return mockRipInput;
            if (id && id.startsWith('nst-forza-cfg-peso-')) return mockPesoInput;
            if (id && id.startsWith('nst-forza-cfg-warmup-')) return mockWarmupInput;
            return null;
        });

        nestore.apriAnteprimaIbrido('ibrido_forza_1');
        await nestore.avviaIbridoSeduta();

        // Verifica che la tabella attiva contenga il target in sola lettura e le caselle con rip precompilate
        expect(exTableContainer.innerHTML).toContain('TARGET:');
        expect(exTableContainer.innerHTML).toContain('value="5"');
        expect(exTableContainer.innerHTML).toContain('nst-ibrido-ex-rip-0-0');
        expect(exTableContainer.innerHTML).toContain('+ AGGIUNGI SERIE EXTRA');
    });

    it('aggiungiSerieExtraForza appende una nuova serie extra dinamicamente', () => {
        const appendedChildren = [];
        const tbodyMock = {
            querySelectorAll: vi.fn(() => [{ id: 'row1' }, { id: 'row2' }, { id: 'row3' }, { id: 'row4' }]),
            appendChild: vi.fn((node) => appendedChildren.push(node))
        };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-active-tbody-ex-0') return tbodyMock;
            return null;
        });

        nestore.aggiungiSerieExtraForza(0);

        expect(tbodyMock.appendChild).toHaveBeenCalled();
        expect(appendedChildren[0].innerHTML).toContain('Serie 5 (Extra)');
        expect(appendedChildren[0].innerHTML).toContain('nst-ibrido-ex-rip-0-4');
    });

    it('terminaIbridoSeduta calcola correttamente gli esiti COMPLETATA, SUPERATA e PARZIALE', async () => {
        const mockSerieInput = { value: '4' };
        const mockRipInput = { value: '5' };
        const mockPesoInput = { value: '100' };

        const runningView = { classList: { remove: vi.fn(), add: vi.fn() } };
        const saveView = { classList: { remove: vi.fn(), add: vi.fn() } };
        const modalMock = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };
        const esitoBadgeMock = { className: '', innerHTML: '', classList: { remove: vi.fn(), add: vi.fn() } };
        const summaryMock = { innerHTML: '' };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') return modalMock;
            if (id === 'nst-ibrido-running-view') return runningView;
            if (id === 'nst-ibrido-save-view') return saveView;
            if (id === 'nst-ibrido-esito-badge') return esitoBadgeMock;
            if (id === 'nst-ibrido-save-ex-summary') return summaryMock;
            if (id === 'nst-ibrido-final-duration-input') return { value: '45' };
            if (id === 'nst-ibrido-save-prog-name') return { textContent: '' };
            if (id && id.startsWith('nst-forza-cfg-serie-')) return mockSerieInput;
            if (id && id.startsWith('nst-forza-cfg-rip-')) return mockRipInput;
            if (id && id.startsWith('nst-forza-cfg-peso-')) return mockPesoInput;
            if (id && id.startsWith('nst-active-tbody-ex-')) {
                return {
                    querySelectorAll: vi.fn(() => [{}, {}, {}, {}])
                };
            }
            // Tutte le serie completate con 5 rip (target = 5)
            if (id && id.startsWith('nst-ibrido-ex-rip-')) return { value: '5' };
            return null;
        });

        nestore.apriAnteprimaIbrido('ibrido_forza_1');
        await nestore.avviaIbridoSeduta();
        nestore.terminaIbridoSeduta();

        expect(esitoBadgeMock.className).toContain('completata');
        expect(esitoBadgeMock.innerHTML).toContain('SCHEDA COMPLETATA AL 100%');
        expect(summaryMock.innerHTML).toContain('COMPLETATA');

        // Test esito PARZIALE se una serie è inferiore
        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') return modalMock;
            if (id === 'nst-ibrido-running-view') return runningView;
            if (id === 'nst-ibrido-save-view') return saveView;
            if (id === 'nst-ibrido-esito-badge') return esitoBadgeMock;
            if (id === 'nst-ibrido-save-ex-summary') return summaryMock;
            if (id === 'nst-ibrido-final-duration-input') return { value: '45' };
            if (id === 'nst-ibrido-save-prog-name') return { textContent: '' };
            if (id && id.startsWith('nst-active-tbody-ex-')) {
                return { querySelectorAll: vi.fn(() => [{}, {}, {}, {}]) };
            }
            if (id === 'nst-ibrido-ex-rip-0-3') return { value: '3' }; // 3 rip invece di 5
            if (id && id.startsWith('nst-ibrido-ex-rip-')) return { value: '5' };
            return null;
        });

        nestore.terminaIbridoSeduta();
        expect(esitoBadgeMock.className).toContain('parziale');
        expect(esitoBadgeMock.innerHTML).toContain('SESSIONE PARZIALE');
    });

    it('WakeLockManager attiva e rilascia correttamente il wake lock gestendo il badge UI', async () => {
        const releaseFn = vi.fn().mockResolvedValue();
        const addListenerFn = vi.fn();
        const mockSentinel = { release: releaseFn, addEventListener: addListenerFn };
        
        Object.defineProperty(globalThis.navigator, 'wakeLock', {
            value: {
                request: vi.fn().mockResolvedValue(mockSentinel)
            },
            configurable: true,
            writable: true
        });

        const mockBadge = {
            classList: { remove: vi.fn(), add: vi.fn() }
        };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-wakelock-badge') return mockBadge;
            return null;
        });

        const success = await nestore.WakeLockManager.request();
        expect(success).toBe(true);
        expect(nestore.WakeLockManager.isActive).toBe(true);
        expect(mockBadge.classList.remove).toHaveBeenCalledWith('nst-hidden');

        await nestore.WakeLockManager.release();
        expect(releaseFn).toHaveBeenCalled();
        expect(nestore.WakeLockManager.isActive).toBe(false);
        expect(mockBadge.classList.add).toHaveBeenCalledWith('nst-hidden');
    });

    it('toggleIbridoNoteInSession alterna la visibilità del box note e aggiorna il testo', () => {
        let isHidden = true;
        const mockBox = {
            classList: {
                contains: vi.fn((cls) => cls === 'nst-hidden' ? isHidden : false),
                remove: vi.fn(() => { isHidden = false; }),
                add: vi.fn(() => { isHidden = true; })
            }
        };
        const mockBtnText = { textContent: '' };
        const mockTextarea = { focus: vi.fn() };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-note-inline-box') return mockBox;
            if (id === 'nst-ibrido-note-toggle-text') return mockBtnText;
            if (id === 'nst-ibrido-workout-note-inline') return mockTextarea;
            return null;
        });

        nestore.toggleIbridoNoteInSession();
        expect(mockBox.classList.remove).toHaveBeenCalledWith('nst-hidden');
        expect(mockBtnText.textContent).toBe('▲ Chiudi Note');
        expect(mockTextarea.focus).toHaveBeenCalled();

        nestore.toggleIbridoNoteInSession();
        expect(mockBox.classList.add).toHaveBeenCalledWith('nst-hidden');
        expect(mockBtnText.textContent).toBe('📝 Note Sessione');
    });

    it('avviaIbridoSeduta genera righe riscaldamento Risc 1..5 con input peso e rip modificabili', async () => {
        const modalMock = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };
        const tableContainerMock = { innerHTML: '' };
        
        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') return modalMock;
            if (id === 'nst-ibrido-active-ex-table-container') return tableContainerMock;
            if (id === 'nst-ibrido-timer-display') return { textContent: '', style: {} };
            if (id === 'nst-ibrido-timer-sub') return { textContent: '' };
            if (id === 'nst-ibrido-action-pause') return {};
            if (id === 'nst-ibrido-status-dot') return { style: {}, classList: { add: vi.fn(), remove: vi.fn() } };
            return null;
        });

        nestore.apriAnteprimaIbrido('ibrido_forza_1');
        await nestore.avviaIbridoSeduta();

        const html = tableContainerMock.innerHTML;
        // Verifica presenza righe riscaldamento richieste
        expect(html).toContain('Risc 1 10x');
        expect(html).toContain('Risc 2 5x');
        expect(html).toContain('Risc 3 3x');
        expect(html).toContain('Risc 4 1x');
        expect(html).toContain('Risc 5 1x');
        expect(html).toContain('nst-ibrido-warmup-peso-0-0');
        expect(html).toContain('nst-ibrido-warmup-rip-0-0');
        expect(html).toContain('nst-ibrido-ex-peso-0-0');
        expect(html).toContain('nst-ibrido-ex-rip-0-0');
    });

    it('terminaIbridoSeduta assegna esito PARZIALE se una serie di riscaldamento specifico non è completata', async () => {
        const modalMock = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };
        const runningView = { classList: { remove: vi.fn(), add: vi.fn() } };
        const saveView = { classList: { remove: vi.fn(), add: vi.fn() } };
        const esitoBadgeMock = { className: '', innerHTML: '', classList: { remove: vi.fn(), add: vi.fn() } };
        const summaryMock = { innerHTML: '' };

        nestore.apriAnteprimaIbrido('ibrido_forza_1');
        await nestore.avviaIbridoSeduta();

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') return modalMock;
            if (id === 'nst-ibrido-running-view') return runningView;
            if (id === 'nst-ibrido-save-view') return saveView;
            if (id === 'nst-ibrido-esito-badge') return esitoBadgeMock;
            if (id === 'nst-ibrido-save-ex-summary') return summaryMock;
            if (id === 'nst-ibrido-final-duration-input') return { value: '40' };
            if (id === 'nst-ibrido-save-prog-name') return { textContent: '' };
            if (id && id.startsWith('nst-active-tbody-ex-')) {
                return { querySelectorAll: vi.fn(() => [{}, {}, {}, {}]) };
            }
            // Tutte le serie allenanti regolari
            if (id && id.startsWith('nst-ibrido-ex-rip-')) return { value: '4' };
            // Riscaldamento 1 completato solo con 6 rip invece di 10
            if (id === 'nst-ibrido-warmup-rip-0-0') return { value: '6' };
            if (id && id.startsWith('nst-ibrido-warmup-rip-')) return null; // fallback default
            return null;
        });

        nestore.terminaIbridoSeduta();
        expect(esitoBadgeMock.className).toContain('parziale');
        expect(esitoBadgeMock.innerHTML).toContain('SESSIONE PARZIALE');
    });

    it('confermaSalvaIbridoSeduta salva riscaldamento_effettivo, carico per-serie e note in sessione nel payload Supabase', async () => {
        let insertedPayload = null;
        const mockQueryBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            insert: vi.fn(async (payload) => {
                insertedPayload = payload;
                return { error: null };
            })
        };
        const mockSupabase = {
            from: vi.fn(() => mockQueryBuilder)
        };

        global.window.supabaseClient = mockSupabase;
        global.window.currentUser = { id: 'usr-123-atleta' };
        global.currentUser = { id: 'usr-123-atleta' };
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

        nestore.apriAnteprimaIbrido('ibrido_forza_1');
        await nestore.avviaIbridoSeduta();

        // Simula input modificati durante la sessione attiva
        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') return { classList: { add: vi.fn(), remove: vi.fn() } };
            if (id === 'nst-ibrido-running-view') return { classList: { add: vi.fn(), remove: vi.fn() } };
            if (id === 'nst-ibrido-save-view') return { classList: { add: vi.fn(), remove: vi.fn() } };
            if (id === 'nst-ibrido-final-duration-input') return { value: '52' };
            if (id === 'nst-ibrido-workout-note-inline') return { value: 'Sensazione ottima alla panca' };
            if (id === 'nst-ibrido-workout-note') return { value: '' }; // vuoto nel save-view, deve prendere quello inline
            if (id && id.startsWith('nst-active-tbody-ex-')) {
                return { querySelectorAll: vi.fn(() => [{}, {}, {}, {}]) };
            }
            if (id === 'nst-ibrido-ex-peso-0-0') return { value: '105' }; // peso modificato
            if (id && id.startsWith('nst-ibrido-ex-peso-')) return { value: '100' };
            if (id && id.startsWith('nst-ibrido-ex-rip-')) return { value: '5' };
            if (id === 'nst-ibrido-warmup-peso-0-0') return { value: '85' };
            if (id === 'nst-ibrido-warmup-rip-0-0') return { value: '10' };
            return null;
        });

        nestore.terminaIbridoSeduta();
        await nestore.confermaSalvaIbridoSeduta();

        expect(mockSupabase.from).toHaveBeenCalledWith('nestore_allenamenti');
        expect(insertedPayload).not.toBeNull();
        expect(insertedPayload.durata_minuti).toBe(52);
        expect(insertedPayload.note).toBe('Sensazione ottima alla panca');
        expect(insertedPayload.scheda_dati).toBeDefined();

        const ex1 = insertedPayload.scheda_dati.esercizi[0];
        expect(ex1.riscaldamento_effettivo).toBeDefined();
        expect(ex1.riscaldamento_effettivo.length).toBeGreaterThan(0);
        expect(ex1.riscaldamento_effettivo[0].peso_kg).toBe(85);
        expect(ex1.serie_dettaglio[0].peso_kg).toBe(105);
    });

    it('minimizzaIbridoSeduta nasconde il modal e imposta ibridoSessionMinimized a true', () => {
        const modalClasses = new Set();
        const dockClasses = new Set(['nst-hidden']);

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') {
                return {
                    classList: {
                        add: vi.fn((cls) => modalClasses.add(cls)),
                        remove: vi.fn((cls) => modalClasses.delete(cls)),
                        contains: vi.fn((cls) => modalClasses.has(cls))
                    }
                };
            }
            if (id === 'nst-timer-dock') {
                return {
                    classList: {
                        add: vi.fn((cls) => dockClasses.add(cls)),
                        remove: vi.fn((cls) => dockClasses.delete(cls)),
                        contains: vi.fn((cls) => dockClasses.has(cls))
                    }
                };
            }
            if (id === 'nst-timer-panel') return { classList: { contains: () => true } };
            return null;
        });

        nestore.minimizzaIbridoSeduta();

        expect(modalClasses.has('nst-hidden')).toBe(true);
        expect(nestore.getIbridoSessionMinimized()).toBe(true);
    });

    it('dockExpandTimer riapre il modal se la sessione ibrido e minimizzata', () => {
        nestore.apriAnteprimaIbrido('ibrido_forza_1');
        nestore.setIbridoSessionMinimized(true);

        const modalClasses = new Set(['nst-hidden']);
        const dockClasses = new Set();

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-ibrido-active-modal') {
                return {
                    classList: {
                        add: vi.fn((cls) => modalClasses.add(cls)),
                        remove: vi.fn((cls) => modalClasses.delete(cls)),
                        contains: vi.fn((cls) => modalClasses.has(cls))
                    }
                };
            }
            if (id === 'nst-timer-dock') {
                return {
                    classList: {
                        add: vi.fn((cls) => dockClasses.add(cls)),
                        remove: vi.fn((cls) => dockClasses.delete(cls)),
                        contains: vi.fn((cls) => dockClasses.has(cls))
                    }
                };
            }
            if (id === 'nst-timer-panel') return { classList: { contains: () => true } };
            return null;
        });

        nestore.dockExpandTimer();

        expect(modalClasses.has('nst-hidden')).toBe(false);
        expect(nestore.getIbridoSessionMinimized()).toBe(false);
    });

    it('dockExpandTimer esegue il fallback a switchNestorePanel se non minimizzato', () => {
        nestore.setIbridoSessionMinimized(false);
        const timerPanelMock = { classList: { remove: vi.fn(), add: vi.fn() } };
        document.getElementById = vi.fn((id) => {
            if (id === 'nst-timer-panel') return timerPanelMock;
            return null;
        });

        nestore.dockExpandTimer();

        expect(timerPanelMock.classList.remove).toHaveBeenCalledWith('nst-hidden');
    });

    it('chiudiIbridoActiveModal resetta il flag ibridoSessionMinimized', () => {
        nestore.setIbridoSessionMinimized(true);
        document.getElementById = vi.fn(() => ({
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false }
        }));

        nestore.chiudiIbridoActiveModal();
        expect(nestore.getIbridoSessionMinimized()).toBe(false);
    });

    it('verifica che nestore.html contenga il pulsante RIDUCI e il wrapper scrollabile', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const html = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.html'), 'utf-8');

        expect(html).toContain('minimizzaIbridoSeduta()');
        expect(html).toContain('nst-btn-minimize');
        expect(html).toContain('nst-ibrido-scrollable-content');
        expect(html).toContain('TERMINA E SALVA');
    });

    it('promptTerminaIbridoSeduta richiede conferma prima di terminare', () => {
        const confirmSpy = vi.fn(() => false);
        window.confirm = confirmSpy;
        const terminaSpy = vi.fn();
        window.terminaIbridoSeduta = terminaSpy;

        nestore.promptTerminaIbridoSeduta();
        expect(confirmSpy).toHaveBeenCalled();
        expect(terminaSpy).not.toHaveBeenCalled();

        confirmSpy.mockReturnValue(true);
        nestore.promptTerminaIbridoSeduta();
        expect(terminaSpy).toHaveBeenCalled();
    });

    it('verifica che nestore.html e nestore.css contengano la UI ottimizzata per mobile (3 tasti icona e input)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const html = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.html'), 'utf-8');
        const css = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.css'), 'utf-8');

        // HTML checks
        expect(html).toContain('promptTerminaIbridoSeduta()');
        expect(html).toContain('nst-btn-danger');
        expect(html).toContain('nst-action-btn-text');
        expect(html).toContain('<span class="material-symbols-outlined">close</span>');

        // CSS checks
        expect(css).toContain('.nst-btn-danger');
        expect(css).toContain('grid-template-columns: 1fr 1fr 1fr');
        expect(css).toContain('.nst-workout-actions-row .nst-action-btn-text');
    });

    describe('Click-to-Cycle Stato Serie Forza (Cornice Verde/Gialla/Rossa)', () => {
        const createMockRow = (initialStatus = '') => {
            const classSet = new Set();
            const dataset = {};
            if (initialStatus) {
                dataset.setStatus = initialStatus;
                if (initialStatus === 'fatta') classSet.add('status-done').add('status-fatta');
                if (initialStatus === 'parziale') classSet.add('status-partial').add('status-parziale');
                if (initialStatus === 'saltata') classSet.add('status-skipped').add('status-saltata');
            }
            return {
                classList: {
                    add: vi.fn((...cls) => cls.forEach(c => classSet.add(c))),
                    remove: vi.fn((...cls) => cls.forEach(c => classSet.delete(c))),
                    contains: vi.fn((c) => classSet.has(c))
                },
                dataset,
                getAttribute: vi.fn((attr) => attr === 'data-set-status' ? dataset.setStatus || null : null),
                setAttribute: vi.fn((attr, val) => { if (attr === 'data-set-status') dataset.setStatus = val; }),
                removeAttribute: vi.fn((attr) => { if (attr === 'data-set-status') delete dataset.setStatus; })
            };
        };

        it('cicla correttamente la sequenza di 4 stati: non impostato -> fatta -> parziale -> saltata -> reset', () => {
            const row = createMockRow();

            // 1° tap: Fatta (Cornice Verde)
            const s1 = nestore.ciclaStatoSerieForza(row);
            expect(s1).toBe('fatta');
            expect(row.dataset.setStatus).toBe('fatta');
            expect(row.classList.contains('status-done')).toBe(true);

            // 2° tap: Parziale (Cornice Gialla)
            const s2 = nestore.ciclaStatoSerieForza(row);
            expect(s2).toBe('parziale');
            expect(row.dataset.setStatus).toBe('parziale');
            expect(row.classList.contains('status-partial')).toBe(true);
            expect(row.classList.contains('status-done')).toBe(false);

            // 3° tap: Saltata (Cornice Rossa)
            const s3 = nestore.ciclaStatoSerieForza(row);
            expect(s3).toBe('saltata');
            expect(row.dataset.setStatus).toBe('saltata');
            expect(row.classList.contains('status-skipped')).toBe(true);
            expect(row.classList.contains('status-partial')).toBe(false);

            // 4° tap: Reset (nessuna cornice)
            const s4 = nestore.ciclaStatoSerieForza(row);
            expect(s4).toBeNull();
            expect(row.dataset.setStatus).toBeUndefined();
            expect(row.classList.contains('status-skipped')).toBe(false);

            // 5° tap: Riparte da Fatta
            const s5 = nestore.ciclaStatoSerieForza(row);
            expect(s5).toBe('fatta');
            expect(row.dataset.setStatus).toBe('fatta');
            expect(row.classList.contains('status-done')).toBe(true);
        });

        it('gestisciClickRigaSerieForza non cicla lo stato se il click avviene su un input', () => {
            const row = createMockRow();
            const inputTarget = {
                closest: vi.fn((selector) => {
                    if (selector.includes('input')) return {};
                    if (selector === '.nst-active-set-row') return row;
                    return null;
                })
            };

            nestore.gestisciClickRigaSerieForza({ target: inputTarget });
            expect(row.dataset.setStatus).toBeUndefined();
            expect(row.classList.add).not.toHaveBeenCalled();
        });

        it('gestisciClickRigaSerieForza cicla lo stato se il click avviene sulla riga (o etichetta/spazio vuoto)', () => {
            const row = createMockRow();
            const labelTarget = {
                closest: vi.fn((selector) => {
                    if (selector.includes('input')) return null;
                    if (selector === '.nst-active-set-row') return row;
                    return null;
                })
            };

            nestore.gestisciClickRigaSerieForza({ target: labelTarget });
            expect(row.dataset.setStatus).toBe('fatta');
            expect(row.classList.contains('status-done')).toBe(true);
        });

        it('terminaIbridoSeduta include stato_esecutivo in riscaldamento_effettivo e serie_effettive', async () => {
            const mockWarmupRow = createMockRow('fatta');
            const mockWorkRow1 = createMockRow('parziale');
            const mockWorkRow2 = createMockRow('saltata');
            const mockWorkRow3 = createMockRow('');
            const mockWorkRow4 = createMockRow('');

            const modalMock = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };
            const runningView = { classList: { remove: vi.fn(), add: vi.fn() } };
            const saveView = { classList: { remove: vi.fn(), add: vi.fn() } };
            const esitoBadgeMock = { className: '', innerHTML: '', classList: { remove: vi.fn(), add: vi.fn() } };
            const summaryMock = { innerHTML: '' };
            const tableContainerMock = { innerHTML: '' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-active-modal') return modalMock;
                if (id === 'nst-ibrido-running-view') return runningView;
                if (id === 'nst-ibrido-save-view') return saveView;
                if (id === 'nst-ibrido-esito-badge') return esitoBadgeMock;
                if (id === 'nst-ibrido-save-ex-summary') return summaryMock;
                if (id === 'nst-ibrido-active-ex-table-container') return tableContainerMock;
                if (id === 'nst-ibrido-final-duration-input') return { value: '45' };
                if (id === 'nst-ibrido-save-prog-name') return { textContent: '' };
                if (id && id.startsWith('nst-active-warmup-tbody-ex-')) {
                    return { querySelectorAll: vi.fn(() => [mockWarmupRow]) };
                }
                if (id && id.startsWith('nst-active-tbody-ex-')) {
                    return { querySelectorAll: vi.fn(() => [mockWorkRow1, mockWorkRow2, mockWorkRow3, mockWorkRow4]) };
                }
                if (id && id.startsWith('nst-ibrido-ex-rip-')) return { value: '4' };
                if (id && id.startsWith('nst-ibrido-ex-peso-')) return { value: '80' };
                if (id && id.startsWith('nst-ibrido-warmup-rip-')) return { value: '10' };
                if (id && id.startsWith('nst-ibrido-warmup-peso-')) return { value: '40' };
                return null;
            });

            nestore.apriAnteprimaIbrido('ibrido_forza_1');
            await nestore.avviaIbridoSeduta();
            nestore.terminaIbridoSeduta();

            const cfg = nestore.getIbridoConfigurazionePersonalizzata();
            expect(cfg).toBeDefined();
            const summary = cfg.summaryEsercizi;
            expect(summary).toBeDefined();
            expect(summary.length).toBeGreaterThan(0);

            const ex0 = summary[0];
            expect(ex0.riscaldamento_effettivo[0].stato_esecutivo).toBe('fatta');
            expect(ex0.serie_effettive[0].stato_esecutivo).toBe('parziale');
            expect(ex0.serie_effettive[1].stato_esecutivo).toBe('saltata');
            expect(ex0.serie_effettive[2].stato_esecutivo).toBeNull();

            // Salva seduta e verifica inserimento in Supabase
            let insertedPayload = null;
            const mockQueryBuilder = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                gte: vi.fn().mockReturnThis(),
                insert: vi.fn(async (payload) => {
                    insertedPayload = payload;
                    return { error: null };
                })
            };
            global.window.supabaseClient = { from: vi.fn(() => mockQueryBuilder) };
            global.window.currentUser = { id: 'usr-forza-tester' };
            global.currentUser = { id: 'usr-forza-tester' };

            await nestore.confermaSalvaIbridoSeduta();
            expect(insertedPayload).not.toBeNull();
            const savedEx = insertedPayload.scheda_dati.esercizi[0];
            expect(savedEx.riscaldamento_effettivo[0].stato_esecutivo).toBe('fatta');
            expect(savedEx.serie_dettaglio[0].stato_esecutivo).toBe('parziale');
            expect(savedEx.serie_dettaglio[1].stato_esecutivo).toBe('saltata');
            expect(savedEx.serie_dettaglio[2].stato_esecutivo).toBeNull();
        });

        it('verifica che nestore.css contenga le regole di cornice verde, gialla e rossa per le righe attive', async () => {
            const fs = await import('fs');
            const path = await import('path');
            const css = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.css'), 'utf-8');

            expect(css).toContain('.nst-active-set-row.status-done');
            expect(css).toContain('.nst-active-set-row.status-partial');
            expect(css).toContain('.nst-active-set-row.status-skipped');
            expect(css).toContain('#10b981'); // verde
            expect(css).toContain('#f59e0b'); // giallo
            expect(css).toContain('#ef4444'); // rosso
            expect(css).toContain('cursor: pointer');
        });
    });
});
