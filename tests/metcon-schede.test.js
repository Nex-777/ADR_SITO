import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock globals for node environment
global.APP_CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key' };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };

const createChainableQuery = () => {
    const q = {
        select: () => q,
        eq: () => q,
        or: () => q,
        limit: () => q,
        order: () => q,
        gte: () => q,
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: () => q,
        then: (resolve) => resolve({ data: [], error: null })
    };
    return q;
};

const mockQuery = createChainableQuery();

global.window = global.window || {
    supabase: { createClient: () => ({ from: () => mockQuery }) },
    addEventListener: () => {},
    location: { search: '', hash: '' },
    requestAnimationFrame: () => {}
};

const nestore = await import('../portal/nestore.js');

describe('NESTORE — METCON Schede Overhaul & Giro Corrente', () => {
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
            supabaseClient: { from: () => mockQuery },
            currentUser: { id: 'test-user-123' },
            IBRIDO_PROGRAMMI_CATALOGO: nestore.IBRIDO_PROGRAMMI_CATALOGO
        };
    });

    describe('Step 1: Calcolo e Visualizzazione Tempo Totale in Anteprima', () => {
        it('calcola correttamente la durata per 30w + 30r x 40 rounds (40 min)', () => {
            const mockDisplay = { textContent: '' };
            const mockWork = { value: '30' };
            const mockRest = { value: '30' };
            const mockRounds = { value: '40' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-total-time-display') return mockDisplay;
                if (id === 'nst-ibrido-cfg-work') return mockWork;
                if (id === 'nst-ibrido-cfg-rest') return mockRest;
                if (id === 'nst-ibrido-cfg-rounds') return mockRounds;
                return null;
            });

            nestore.aggiornaIbridoParamDaInput();
            expect(mockDisplay.textContent).toBe('40 min (40:00)');
        });

        it('calcola correttamente la durata con secondi residui (es. 25w + 35r x 7 rounds = 7 min)', () => {
            const mockDisplay = { textContent: '' };
            const mockWork = { value: '25' };
            const mockRest = { value: '35' };
            const mockRounds = { value: '7' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-total-time-display') return mockDisplay;
                if (id === 'nst-ibrido-cfg-work') return mockWork;
                if (id === 'nst-ibrido-cfg-rest') return mockRest;
                if (id === 'nst-ibrido-cfg-rounds') return mockRounds;
                return null;
            });

            nestore.aggiornaIbridoParamDaInput();
            expect(mockDisplay.textContent).toBe('7 min (07:00)');
        });
    });

    describe('Step 2 & 4: Estrazione Target e Pulizia Unità di Misura', () => {
        it('estrae valore numerico e unità di misura correttamente da stringhe target standard', () => {
            expect(nestore.estraiTargetValoreEUnita('15 rip')).toEqual({
                targetVal: '15',
                unita: 'rip',
                targetNum: 15
            });

            expect(nestore.estraiTargetValoreEUnita('60 cal/rpm')).toEqual({
                targetVal: '60',
                unita: 'cal/rpm',
                targetNum: 60
            });

            expect(nestore.estraiTargetValoreEUnita('20 cal/m')).toEqual({
                targetVal: '20',
                unita: 'cal/m',
                targetNum: 20
            });
        });

        it('supporta espressioni composite come 3+3 rip', () => {
            const res = nestore.estraiTargetValoreEUnita('3+3 rip');
            expect(res.targetVal).toBe('3+3');
            expect(res.unita).toBe('rip');
            expect(res.targetNum).toBe(6);
        });

        it('gestisce formati descrittivi e fallback senza errori', () => {
            const res = nestore.estraiTargetValoreEUnita('5 salti massimali');
            expect(res.targetVal).toBe('5');
            expect(res.unita).toBe('salti massimali');
            expect(res.targetNum).toBe(5);

            const maxRep = nestore.estraiTargetValoreEUnita('max rep');
            expect(maxRep.targetVal).toBe('max rep');
            expect(maxRep.targetNum).toBe(0);
        });

        it('parseMetconResultNumber somma correttamente valori e stringhe composite', () => {
            expect(nestore.parseMetconResultNumber('15')).toBe(15);
            expect(nestore.parseMetconResultNumber('3+3')).toBe(6);
            expect(nestore.parseMetconResultNumber(20)).toBe(20);
            expect(nestore.parseMetconResultNumber('')).toBe(0);
            expect(nestore.parseMetconResultNumber(null)).toBe(0);
        });
    });

    describe('Step 3: Scheda Giro Corrente e Navigazione Rapida (Opzione 2.B)', () => {
        it('inizializza la matrice dei risultati giro-per-giro e pre-compila con i target', () => {
            const progMetcon = nestore.IBRIDO_PROGRAMMI_CATALOGO.find(p => p.id === 'ibrido_metcon_1');
            expect(progMetcon).toBeDefined();

            // Simula apertura anteprima e avvio con 3 giri per il test
            const mockWork = { value: '30' };
            const mockRest = { value: '30' };
            const mockRounds = { value: '3' };

            const mockContainer = { innerHTML: '' };
            const mockModal = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-cfg-work') return mockWork;
                if (id === 'nst-ibrido-cfg-rest') return mockRest;
                if (id === 'nst-ibrido-cfg-rounds') return mockRounds;
                if (id === 'nst-ibrido-active-ex-table-container') return mockContainer;
                if (id === 'nst-ibrido-active-modal') return mockModal;
                return { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) }, style: {}, value: '' };
            });

            nestore.apriAnteprimaIbrido('ibrido_metcon_1');
            mockRounds.value = '3';
            nestore.aggiornaIbridoParamDaInput();

            // Avvia
            nestore.avviaIbridoSeduta();

            const results = nestore.getIbridoMetconResults();
            expect(results).toHaveLength(3);
            expect(results[0]).toHaveLength(progMetcon.esercizi.length);

            // Verifica che il primo esercizio (PULL, target 15 rip) sia precompilato con '15'
            expect(results[0][0].nome).toBe('PULL');
            expect(results[0][0].target_val).toBe('15');
            expect(results[0][0].unita).toBe('rip');
            expect(results[0][0].risultato_effettivo).toBe('15');

            // Verifica che il round corrente mostrato sia il giro 1
            expect(nestore.getCurrentMetconDisplayedRound()).toBe(1);
            expect(mockContainer.innerHTML).toContain('GIRO');
            expect(mockContainer.innerHTML).toContain('1 di 3');
        });

        it('permette di cambiare giro con cambiaMetconGiro e impostaMetconGiro salvando le modifiche', () => {
            const mockContainer = { innerHTML: '' };
            const mockInput0 = { value: '12' }; // Utente ha fatto 12 invece di 15

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-active-ex-table-container') return mockContainer;
                if (id === 'nst-metcon-ex-risultato-0') return mockInput0;
                return null;
            });

            // Cambia al giro 2
            nestore.cambiaMetconGiro(1);
            expect(nestore.getCurrentMetconDisplayedRound()).toBe(2);

            // Verifica che il giro 1 abbia registrato 12
            const results = nestore.getIbridoMetconResults();
            expect(results[0][0].risultato_effettivo).toBe('12');

            // Salta direttamente al giro 3
            nestore.impostaMetconGiro(3);
            expect(nestore.getCurrentMetconDisplayedRound()).toBe(3);
        });
    });

    describe('Step 5 & 6: Calcolo Somme Totali, Esito Globale e Salvataggio', () => {
        it('calcola esito COMPLETATA quando tutti i target sono raggiunti su tutti i giri', () => {
            const mockEsitoBadge = { classList: { remove: vi.fn(), add: vi.fn() }, className: '', innerHTML: '' };
            const mockSummaryContainer = { innerHTML: '' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-esito-badge') return mockEsitoBadge;
                if (id === 'nst-ibrido-save-ex-summary') return mockSummaryContainer;
                return { classList: { remove: vi.fn(), add: vi.fn() }, value: '' };
            });

            // Imposta 2 giri per test
            nestore.setIbridoMetconResults([
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '15' },
                    { nome: 'Burpees', target_originario: '10 rip', target_val: '10', unita: 'rip', target_num: 10, risultato_effettivo: '10' }
                ],
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '15' },
                    { nome: 'Burpees', target_originario: '10 rip', target_val: '10', unita: 'rip', target_num: 10, risultato_effettivo: '10' }
                ]
            ]);

            nestore.terminaIbridoSeduta();

            const summary = nestore.getIbridoMetconSummary();
            expect(summary).toBeDefined();
            expect(summary.totalRounds).toBe(2);
            expect(summary.totalTargetAll).toBe(50); // (15+10)*2
            expect(summary.totalEffectiveAll).toBe(50);
            expect(summary.esitoGlobale).toBe('COMPLETATA');

            expect(mockEsitoBadge.className).toContain('completata');
            expect(mockSummaryContainer.innerHTML).toContain('COMPLETATA');
        });

        it('calcola esito PARZIALE se in un giro l utente ha fatto meno ripetizioni del target', () => {
            const mockEsitoBadge = { classList: { remove: vi.fn(), add: vi.fn() }, className: '', innerHTML: '' };
            const mockSummaryContainer = { innerHTML: '' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-esito-badge') return mockEsitoBadge;
                if (id === 'nst-ibrido-save-ex-summary') return mockSummaryContainer;
                return { classList: { remove: vi.fn(), add: vi.fn() }, value: '' };
            });

            nestore.setIbridoMetconResults([
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '15' }
                ],
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '10' } // -5 rip
                ]
            ]);

            nestore.terminaIbridoSeduta();

            const summary = nestore.getIbridoMetconSummary();
            expect(summary.totalTargetAll).toBe(30);
            expect(summary.totalEffectiveAll).toBe(25);
            expect(summary.esitoGlobale).toBe('PARZIALE');

            expect(mockEsitoBadge.className).toContain('parziale');
            expect(mockSummaryContainer.innerHTML).toContain('PARZIALE');
        });

        it('calcola esito SUPERATA se il totale effettivo supera il target complessivo', () => {
            const mockEsitoBadge = { classList: { remove: vi.fn(), add: vi.fn() }, className: '', innerHTML: '' };
            const mockSummaryContainer = { innerHTML: '' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-esito-badge') return mockEsitoBadge;
                if (id === 'nst-ibrido-save-ex-summary') return mockSummaryContainer;
                return { classList: { remove: vi.fn(), add: vi.fn() }, value: '' };
            });

            nestore.setIbridoMetconResults([
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '16' }
                ],
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '17' }
                ]
            ]);

            nestore.terminaIbridoSeduta();

            const summary = nestore.getIbridoMetconSummary();
            expect(summary.totalTargetAll).toBe(30);
            expect(summary.totalEffectiveAll).toBe(33);
            expect(summary.esitoGlobale).toBe('SUPERATA');

            expect(mockEsitoBadge.className).toContain('superata');
            expect(mockSummaryContainer.innerHTML).toContain('SUPERATA');
        });

        it('struttura correttamente il payload scheda_dati nel salvataggio su Supabase', async () => {
            let insertedPayload = null;
            const insertSpy = vi.fn((data) => {
                insertedPayload = data;
                return Promise.resolve({ error: null });
            });

            global.window.supabaseClient = {
                from: () => ({
                    insert: insertSpy
                })
            };

            nestore.setIbridoMetconResults([
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '15' }
                ],
                [
                    { nome: 'PULL', target_originario: '15 rip', target_val: '15', unita: 'rip', target_num: 15, risultato_effettivo: '15' }
                ]
            ]);

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-final-duration-input') return { value: '25' };
                if (id === 'nst-ibrido-workout-note') return { value: 'Ottime sensazioni' };
                return { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) }, style: {}, value: '' };
            });

            nestore.terminaIbridoSeduta();
            await nestore.confermaSalvaIbridoSeduta();

            expect(insertSpy).toHaveBeenCalled();
            expect(insertedPayload).toBeDefined();
            expect(insertedPayload.durata_minuti).toBe(25);
            expect(insertedPayload.scheda_dati.esito_globale).toBe('COMPLETATA');
            expect(insertedPayload.scheda_dati.giri_totali).toBe(2);
            expect(insertedPayload.scheda_dati.rip_totali_effettive).toBe(30);
            expect(insertedPayload.scheda_dati.esercizi[0].giri_dettaglio).toHaveLength(2);
        });
    });

    describe('Iteration 2: Calcolo Giri, Evidenziazione Visiva e Auto-Avanzamento', () => {
        it('calcola correttamente la durata totale moltiplicando i giri per il numero di esercizi del programma', () => {
            const mockDisplay = { textContent: '' };
            const mockWork = { value: '30' };
            const mockRest = { value: '30' };
            const mockRounds = { value: '6' };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-total-time-display') return mockDisplay;
                if (id === 'nst-ibrido-cfg-work') return mockWork;
                if (id === 'nst-ibrido-cfg-rest') return mockRest;
                if (id === 'nst-ibrido-cfg-rounds') return mockRounds;
                return { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) }, style: {}, value: '' };
            });

            // Apri anteprima Metcon 1 (ha 6 esercizi, 30w + 30r, 6 giri)
            nestore.apriAnteprimaIbrido('ibrido_metcon_1');
            nestore.aggiornaIbridoParamDaInput();

            // (30 + 30) * (6 giri * 6 esercizi) = 60 * 36 = 2160 sec = 36 min
            expect(mockDisplay.textContent).toBe('36 min (36:00)');
        });

        it('configura tabataEngine con rounds totali pari a Giri * Numero di Esercizi in avviaIbridoSeduta', async () => {
            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-cfg-work') return { value: '30' };
                if (id === 'nst-ibrido-cfg-rest') return { value: '30' };
                if (id === 'nst-ibrido-cfg-rounds') return { value: '6' };
                return {
                    classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) },
                    style: {},
                    value: '',
                    innerHTML: '',
                    textContent: ''
                };
            });

            nestore.apriAnteprimaIbrido('ibrido_metcon_1');
            nestore.aggiornaIbridoParamDaInput();
            await nestore.avviaIbridoSeduta();

            // Metcon 1 ha 6 esercizi. 6 giri * 6 esercizi = 36 intervalli totali
            expect(window.tabataEngine.state.config.rounds).toBe(36);
            expect(nestore.getIbridoMetconResults().length).toBe(6);
            expect(nestore.getCurrentMetconDisplayedRound()).toBe(1);
            expect(nestore.getLastActiveTimerGiro()).toBe(1);
        });

        it('mappa correttamente intervallo Tabata a Indice Esercizio e Giro del Circuito', () => {
            const numEsercizi = 6;

            // Round 1 (Primo esercizio del Giro 1)
            let round = 1;
            let exIdx = (round - 1) % numEsercizi;
            let giro = Math.floor((round - 1) / numEsercizi) + 1;
            expect(exIdx).toBe(0);
            expect(giro).toBe(1);

            // Round 6 (Ultimo esercizio del Giro 1)
            round = 6;
            exIdx = (round - 1) % numEsercizi;
            giro = Math.floor((round - 1) / numEsercizi) + 1;
            expect(exIdx).toBe(5);
            expect(giro).toBe(1);

            // Round 7 (Primo esercizio del Giro 2)
            round = 7;
            exIdx = (round - 1) % numEsercizi;
            giro = Math.floor((round - 1) / numEsercizi) + 1;
            expect(exIdx).toBe(0);
            expect(giro).toBe(2);

            // Round 36 (Ultimo esercizio del Giro 6)
            round = 36;
            exIdx = (round - 1) % numEsercizi;
            giro = Math.floor((round - 1) / numEsercizi) + 1;
            expect(exIdx).toBe(5);
            expect(giro).toBe(6);
        });

        it('evidenzia la riga con active-work durante LAVORO e active-rest durante RIPOSO', () => {
            const mockRows = [
                { classList: { add: vi.fn(), remove: vi.fn() } },
                { classList: { add: vi.fn(), remove: vi.fn() } }
            ];

            const mockSubEl = { textContent: '' };
            const mockDisplayEl = { textContent: '', style: {} };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-active-modal') return { classList: { contains: () => false } };
                if (id === 'nst-ibrido-timer-display') return mockDisplayEl;
                if (id === 'nst-ibrido-timer-sub') return mockSubEl;
                return { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) }, style: {} };
            });

            document.querySelectorAll = vi.fn((sel) => {
                if (sel === '.nst-metcon-ex-row') return mockRows;
                return [];
            });

            // Imposta tabataEngine su Round 1, fase 'work'
            window.tabataEngine.state.currentRound = 1;
            window.tabataEngine.state.phase = 'work';
            window.tabataEngine.state.running = true;
            window.tabataEngine.state.phaseDurationSec = 30;
            window.tabataEngine.getPhaseElapsedMs = () => 5000;

            nestore.setCurrentMetconDisplayedRound(1);
            nestore.setLastActiveTimerGiro(1);

            nestore.aggiornaIbridoModalAttivo();

            // Riga 0 deve avere active-work
            expect(mockRows[0].classList.add).toHaveBeenCalledWith('active-work');
            expect(mockSubEl.textContent).toContain('LAVORO (WORK)');
            expect(mockSubEl.textContent).toContain('GIRO 1');

            // Passa a 'rest'
            vi.clearAllMocks();
            window.tabataEngine.state.phase = 'rest';
            nestore.aggiornaIbridoModalAttivo();

            expect(mockRows[0].classList.add).toHaveBeenCalledWith('active-rest');
            expect(mockSubEl.textContent).toContain('RIPOSO (REST)');
        });

        it('auto-avanza automaticamente la scheda quando il timer passa al giro successivo', () => {
            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-active-modal') return { classList: { contains: () => false } };
                if (id === 'nst-ibrido-timer-display') return { textContent: '', style: {} };
                if (id === 'nst-ibrido-timer-sub') return { textContent: '' };
                return { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) }, style: {} };
            });

            nestore.setCurrentMetconDisplayedRound(1);
            nestore.setLastActiveTimerGiro(1);

            // Simula timer che supera l'esercizio 6 e passa a Round 7 (Giro 2)
            window.tabataEngine.state.currentRound = 7;
            window.tabataEngine.state.phase = 'work';
            window.tabataEngine.state.running = true;
            window.tabataEngine.getPhaseElapsedMs = () => 1000;

            nestore.aggiornaIbridoModalAttivo();

            // Il giro visualizzato deve avanzare automaticamente a 2
            expect(nestore.getCurrentMetconDisplayedRound()).toBe(2);
            expect(nestore.getLastActiveTimerGiro()).toBe(2);
        });
    });

    describe('Iteration 3: Anteprima Comparativa Metcon & Personalizzazione Pre-Seduta', () => {
        it('estraiPesoDaEsercizioMetcon estrae correttamente il carico in kg da nome o proprietà', () => {
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'Stacchi 90kg' })).toBe(90);
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'Swing 16kg' })).toBe(16);
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'C+J Manubrio 20kg' })).toBe(20);
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'Stacco 120.5kg' })).toBe(120.5);
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'PULL' })).toBeNull();
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'Assault Bike' })).toBeNull();
            expect(nestore.estraiPesoDaEsercizioMetcon({ nome: 'Distensioni', peso_target: 35 })).toBe(35);
        });

        it('renderMetconAnteprimaEsercizi mostra tabella comparativa a 4 colonne con valori di riferimento se prima seduta', () => {
            const mockExListEl = { innerHTML: '' };
            const prog = {
                id: 'ibrido_metcon_1',
                nome: 'Metcon 1',
                tipo: 'metcon',
                esercizi: [
                    { nome: 'PULL', target: '15 rip' },
                    { nome: 'Stacchi 90kg', target: '4 rip' }
                ]
            };

            nestore.renderMetconAnteprimaEsercizi(prog, mockExListEl, null, null);

            expect(mockExListEl.innerHTML).toContain('Prima seduta di questo programma');
            expect(mockExListEl.innerHTML).toContain('nst-metcon-compare-table');
            expect(mockExListEl.innerHTML).toContain('ESERCIZIO');
            expect(mockExListEl.innerHTML).toContain('MIGLIORE 🏆');
            expect(mockExListEl.innerHTML).toContain('ULTIMA SEDUTA');
            expect(mockExListEl.innerHTML).toContain('OGGI (TARGET)');

            // Colonne storico vuote
            expect(mockExListEl.innerHTML).toContain('—');

            // Input precompilati con valori di default
            expect(mockExListEl.innerHTML).toContain('value="15"');
            expect(mockExListEl.innerHTML).toContain('value="4"');
            expect(mockExListEl.innerHTML).toContain('value="90"');
        });

        it('renderMetconAnteprimaEsercizi precompila con ultima seduta e mostra record storico migliore', () => {
            const mockExListEl = { innerHTML: '' };
            const prog = {
                id: 'ibrido_metcon_1',
                nome: 'Metcon 1',
                tipo: 'metcon',
                esercizi: [
                    { nome: 'PULL', target: '15 rip' },
                    { nome: 'Stacchi 90kg', target: '4 rip' }
                ]
            };

            const ultimaSessione = {
                data_allenamento: '2026-09-24',
                scheda_dati: {
                    esercizi: [
                        { nome: 'PULL', target_val: '18', unita: 'rip', totale_effettivo: 108 },
                        { nome: 'Stacchi 90kg', target_val: '5', unita: 'rip', peso_kg: 95, totale_effettivo: 30 }
                    ]
                }
            };

            const miglioreSessione = {
                data_allenamento: '2026-09-20',
                scheda_dati: {
                    esercizi: [
                        { nome: 'PULL', target_val: '20', unita: 'rip', totale_effettivo: 120 },
                        { nome: 'Stacchi 90kg', target_val: '6', unita: 'rip', peso_kg: 100, totale_effettivo: 36 }
                    ]
                }
            };

            nestore.renderMetconAnteprimaEsercizi(prog, mockExListEl, ultimaSessione, miglioreSessione);

            expect(mockExListEl.innerHTML).toContain("Dati precompilati dall'ultima seduta");
            expect(mockExListEl.innerHTML).toContain('🏆');
            expect(mockExListEl.innerHTML).toContain('20 rip');
            expect(mockExListEl.innerHTML).toContain('@ 100kg');

            // Ultima seduta
            expect(mockExListEl.innerHTML).toContain('18 rip');
            expect(mockExListEl.innerHTML).toContain('@ 95kg');

            // Input di oggi precompilati con i dati dell'ultima seduta
            expect(mockExListEl.innerHTML).toContain('id="nst-metcon-cfg-target-0" class="nst-metcon-cfg-input" value="18"');
            expect(mockExListEl.innerHTML).toContain('id="nst-metcon-cfg-target-1" class="nst-metcon-cfg-input" value="5"');
            expect(mockExListEl.innerHTML).toContain('id="nst-metcon-cfg-peso-1" class="nst-metcon-cfg-input nst-weight-input" value="95"');
        });

        it('avviaIbridoSeduta acquisisce i valori personalizzati prima dell avvio del Metcon', async () => {
            const prog = {
                id: 'ibrido_metcon_test',
                nome: 'Metcon Test',
                tipo: 'metcon',
                timer_mode: 'tabata',
                rounds_default: 3,
                esercizi: [
                    { nome: 'PULL', target: '15 rip' },
                    { nome: 'Stacchi 90kg', target: '4 rip' }
                ]
            };

            window.IBRIDO_PROGRAMMI_CATALOGO = [prog];

            // Mock elementi DOM con valori modificati dall'utente
            document.getElementById = vi.fn((id) => {
                if (id === 'nst-metcon-cfg-target-0') return { value: '18' };
                if (id === 'nst-metcon-cfg-peso-0') return { value: '0' };
                if (id === 'nst-metcon-cfg-target-1') return { value: '5' };
                if (id === 'nst-metcon-cfg-peso-1') return { value: '95' };
                if (id === 'nst-ibrido-preview-modal') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-preview-card') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-preview-title') return { textContent: '' };
                if (id === 'nst-ibrido-preview-desc') return { textContent: '' };
                if (id === 'nst-ibrido-preview-icon') return { style: {} };
                if (id === 'nst-ibrido-tabata-config-box') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-preview-ex-list') return { innerHTML: '' };
                if (id === 'nst-ibrido-active-modal') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-active-title') return { textContent: '', style: {} };
                if (id === 'nst-ibrido-running-view') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-save-view') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-active-ex-table-container') return { innerHTML: '' };
                if (id === 'nst-ibrido-laps-wrapper') return { classList: { add: vi.fn(), remove: vi.fn() } };
                if (id === 'nst-ibrido-action-sec-icon') return { textContent: '' };
                if (id === 'nst-ibrido-action-sec-text') return { textContent: '' };
                return null;
            });

            nestore.apriAnteprimaIbrido(prog.id);
            await nestore.avviaIbridoSeduta();

            const customConfig = nestore.getIbridoMetconPersonalizzazione();
            expect(customConfig).toBeDefined();
            expect(customConfig.esercizi).toHaveLength(2);
            expect(customConfig.esercizi[0].target_val).toBe('18');
            expect(customConfig.esercizi[1].target_val).toBe('5');
            expect(customConfig.esercizi[1].peso_kg).toBe(95);
            expect(customConfig.esercizi[1].nome).toBe('Stacchi 95kg');

            // Verifica che la matrice dei round sia stata creata con i valori personalizzati
            const results = nestore.getIbridoMetconResults();
            expect(results.length).toBeGreaterThan(0);
            expect(results[0][0].target_val).toBe('18');
            expect(results[0][1].target_val).toBe('5');
            expect(results[0][1].peso_kg).toBe(95);
        });
    });
});

