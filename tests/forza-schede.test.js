import { describe, it, expect, beforeEach, vi } from 'vitest';

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
});
