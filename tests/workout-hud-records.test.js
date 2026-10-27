import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock browser environment
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
    createElement: () => ({
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        innerHTML: '',
        style: {},
        appendChild: () => {}
    }),
    querySelectorAll: () => []
};

const nestore = await import('../portal/nestore.js');

describe('NESTORE — Workout HUD Records (REC, ULT, ATTUALE)', () => {

    describe('1. Formula di Superiorità & Formattazione Compatta', () => {
        it('calcola correttamente il volume (kg × rip) con peso > 0', () => {
            const cand = { peso_kg: 80, rip: 10 }; // 800kg
            const best = { peso_kg: 100, rip: 7 }; // 700kg
            expect(nestore.confrontaPrestazioneSerie(cand, best, false)).toBe(true);
            expect(nestore.confrontaPrestazioneSerie(best, cand, false)).toBe(false);
        });

        it('gestisce il tie-breaker a parità di volume premiando il carico maggiore', () => {
            const heavier = { peso_kg: 100, rip: 5 }; // 500kg, 100kg
            const lighter = { peso_kg: 50, rip: 10 }; // 500kg, 50kg
            expect(nestore.confrontaPrestazioneSerie(heavier, lighter, false)).toBe(true);
            expect(nestore.confrontaPrestazioneSerie(lighter, heavier, false)).toBe(false);
        });

        it('usa le sole ripetizioni per esercizi a corpo libero (isBw = true)', () => {
            const r1 = { rip: 15, peso_kg: 0 };
            const r2 = { rip: 12, peso_kg: 0 };
            expect(nestore.confrontaPrestazioneSerie(r1, r2, true)).toBe(true);
            expect(nestore.confrontaPrestazioneSerie(r2, r1, true)).toBe(false);
            expect(nestore.confrontaPrestazioneSerie(r1, r1, true)).toBe(false);
        });

        it('esclude o penalizza serie saltate o con ripetizioni <= 0', () => {
            const valid = { rip: 5, peso_kg: 50 };
            const skipped = { rip: 10, peso_kg: 80, stato_esecutivo: 'saltata' };
            const zeroRep = { rip: 0, peso_kg: 50 };
            expect(nestore.confrontaPrestazioneSerie(skipped, valid, false)).toBe(false);
            expect(nestore.confrontaPrestazioneSerie(valid, skipped, false)).toBe(true);
            expect(nestore.confrontaPrestazioneSerie(zeroRep, valid, false)).toBe(false);
        });

        it('formattaPrestazioneCompatta restituisce "0" se non ci sono dati storici', () => {
            expect(nestore.formattaPrestazioneCompatta(0, 0, false, false)).toBe('0');
            expect(nestore.formattaPrestazioneCompatta(100, 5, false, false)).toBe('0');
        });

        it('formattaPrestazioneCompatta restituisce {peso}×{rip} se con sovraccarico', () => {
            expect(nestore.formattaPrestazioneCompatta(82.5, 5, false, true)).toBe('82.5×5');
            expect(nestore.formattaPrestazioneCompatta(100, 4, false, true)).toBe('100×4');
        });

        it('formattaPrestazioneCompatta restituisce {rip} se corpo libero', () => {
            expect(nestore.formattaPrestazioneCompatta(0, 15, true, true)).toBe('15');
        });
    });

    describe('2. Motore Analitico per-Set / per-Round', () => {
        it('calcolaStoricoSerieForza restituisce REC, ULT e "0" per serie mai eseguite', () => {
            const sessioni = [
                {
                    data_allenamento: '2026-10-25',
                    scheda_dati: {
                        tipo: 'forza',
                        esercizi: [
                            {
                                nome: 'Panca Piana',
                                riscaldamento_effettivo: [
                                    { serie: 1, peso_kg: 40, rip: 10 },
                                    { serie: 2, peso_kg: 60, rip: 5 }
                                ],
                                serie_effettive: [
                                    { serie: 1, peso_kg: 80, rip: 5 },
                                    { serie: 2, peso_kg: 80, rip: 5 }
                                ]
                            }
                        ]
                    }
                },
                {
                    data_allenamento: '2026-10-18',
                    scheda_dati: {
                        tipo: 'forza',
                        esercizi: [
                            {
                                nome: 'Panca Piana',
                                riscaldamento_effettivo: [
                                    { serie: 1, peso_kg: 40, rip: 10 },
                                    { serie: 2, peso_kg: 65, rip: 5 }
                                ],
                                serie_effettive: [
                                    { serie: 1, peso_kg: 85, rip: 5 },
                                    { serie: 2, peso_kg: 80, rip: 4 },
                                    { serie: 3, peso_kg: 75, rip: 5 }
                                ]
                            }
                        ]
                    }
                }
            ];

            const storico = nestore.calcolaStoricoSerieForza('Panca Piana', false, 2, 4, sessioni);

            // Work set 1: Sessione 25/10 ha 80x5 (400), 18/10 ha 85x5 (425).
            // REC deve essere 85×5, ULT deve essere 80×5 (dall'ultima del 25/10)
            expect(storico.workSets[0].rec_display).toBe('85×5');
            expect(storico.workSets[0].ult_display).toBe('80×5');

            // Work set 2: Sessione 25/10 ha 80x5 (400), 18/10 ha 80x4 (320).
            // REC deve essere 80×5, ULT 80×5
            expect(storico.workSets[1].rec_display).toBe('80×5');
            expect(storico.workSets[1].ult_display).toBe('80×5');

            // Work set 3: Presente solo il 18/10 con 75x5.
            // REC deve essere 75×5, ULT deve essere 75×5
            expect(storico.workSets[2].rec_display).toBe('75×5');
            expect(storico.workSets[2].ult_display).toBe('75×5');

            // Work set 4: Mai eseguito in nessuna sessione -> "0"
            expect(storico.workSets[3].rec_display).toBe('0');
            expect(storico.workSets[3].ult_display).toBe('0');
        });

        it('calcolaStoricoGiriMetcon restituisce REC, ULT per giro e overall', () => {
            const exDef = { nome: 'Thruster 40kg', target: '10 rip' };
            const sessioni = [
                {
                    data_allenamento: '2026-10-20',
                    scheda_dati: {
                        tipo: 'metcon',
                        esercizi: [
                            {
                                nome: 'Thruster 40kg',
                                peso_kg: 40,
                                target_val: '10',
                                giri_dettaglio: [
                                    { giro: 1, effettivo: '10' },
                                    { giro: 2, effettivo: '8' }
                                ]
                            }
                        ]
                    }
                },
                {
                    data_allenamento: '2026-10-10',
                    scheda_dati: {
                        tipo: 'metcon',
                        esercizi: [
                            {
                                nome: 'Thruster 40kg',
                                peso_kg: 45,
                                target_val: '10',
                                giri_dettaglio: [
                                    { giro: 1, effettivo: '12' },
                                    { giro: 2, effettivo: '7' }
                                ]
                            }
                        ]
                    }
                }
            ];

            const storico = nestore.calcolaStoricoGiriMetcon(exDef, 3, sessioni);

            // Giro 1: Sessione 20/10 ha 10 (40kg = 400), 10/10 ha 12 (45kg = 540).
            expect(storico.rounds[0].rec_display).toBe('45×12');
            expect(storico.rounds[0].ult_display).toBe('40×10');

            // Giro 2: Sessione 20/10 ha 8 (40kg = 320), 10/10 ha 7 (45kg = 315).
            expect(storico.rounds[1].rec_display).toBe('40×8');
            expect(storico.rounds[1].ult_display).toBe('40×8');

            // Giro 3: mai eseguito
            expect(storico.rounds[2].rec_display).toBe('0');
            expect(storico.rounds[2].ult_display).toBe('0');
        });

        it('calcolaStoricoInvictus estrae record storico e ultima sessione per pull/push/squat', () => {
            const sessioni = [
                {
                    data_allenamento: '2026-10-22',
                    corso_disciplina: 'INVICTUS',
                    scheda_dati: {
                        pull_base: 6,
                        total_pull: 60,
                        total_push: 120,
                        total_squat: 240,
                        giri_completati: 10
                    }
                },
                {
                    data_allenamento: '2026-10-15',
                    corso_disciplina: 'INVICTUS',
                    scheda_dati: {
                        pull_base: 8,
                        total_pull: 80,
                        total_push: 160,
                        total_squat: 320,
                        giri_completati: 10
                    }
                }
            ];

            const inv = nestore.calcolaStoricoInvictus(sessioni);
            expect(inv.recPull).toBe(8);
            expect(inv.ultPull).toBe(6);
            expect(inv.recPush).toBe(16);
            expect(inv.ultPush).toBe(12);
            expect(inv.recSquat).toBe(32);
            expect(inv.ultSquat).toBe(24);
        });

        it('calcolaStoricoInvictus restituisce 0 se mai eseguito', () => {
            const inv = nestore.calcolaStoricoInvictus([]);
            expect(inv.recPull).toBe(0);
            expect(inv.ultPull).toBe(0);
            expect(inv.recPush).toBe(0);
            expect(inv.ultPush).toBe(0);
            expect(inv.recSquat).toBe(0);
            expect(inv.ultSquat).toBe(0);
        });
    });

    describe('3. Rendering UI Anteprima & Attiva HUD (REC / ULT / ATTUALE)', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('renderForzaAnteprimaEsercizi crea tabella con colonne SET, REC, ULT, ATTUALE', () => {
            const mockExListEl = { innerHTML: '' };
            const prog = {
                id: 'forza_1',
                nome: 'Forza 1',
                tipo: 'forza',
                esercizi: [
                    { nome: 'Panca Piana', serie_target: 3, rip_target: 5 }
                ]
            };

            nestore.renderForzaAnteprimaEsercizi(prog, mockExListEl, []);

            expect(mockExListEl.innerHTML).toContain('nst-hud-table');
            expect(mockExListEl.innerHTML).toContain('SET');
            expect(mockExListEl.innerHTML).toContain('REC');
            expect(mockExListEl.innerHTML).toContain('ULT');
            expect(mockExListEl.innerHTML).toContain('ATTUALE');

            // Riscaldamento e serie allenanti
            expect(mockExListEl.innerHTML).toContain('R1');
            expect(mockExListEl.innerHTML).toContain('S1');
            expect(mockExListEl.innerHTML).toContain('S2');
            expect(mockExListEl.innerHTML).toContain('S3');

            // Cifre '0' per serie mai eseguite
            expect(mockExListEl.innerHTML).toContain('<td class="nst-hud-num-col rec">0</td>');
            expect(mockExListEl.innerHTML).toContain('<td class="nst-hud-num-col ult">0</td>');
        });

        it('renderForzaEserciziAttivi renderizza righe interattive con REC, ULT e ATTUALE dual input', () => {
            const mockContainer = { innerHTML: '' };
            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-active-ex-table-container') return mockContainer;
                return null;
            });

            const config = {
                programma_id: 'forza_1',
                programma_nome: 'Forza 1',
                esercizi: [
                    {
                        nome: 'Panca Piana',
                        isBw: false,
                        serie_target: 2,
                        rip_target: 5,
                        peso_target_kg: 80,
                        riscaldamento: [
                            { rip: 10, pct: 40, peso_kg: 32, rec_display: '0', ult_display: '0' }
                        ],
                        serie_iniziali: [
                            { setIdx: 0, peso_kg: 80, rip: 5, rec_display: '85×5', ult_display: '80×5' },
                            { setIdx: 1, peso_kg: 80, rip: 5, rec_display: '80×5', ult_display: '80×5' }
                        ]
                    }
                ]
            };

            nestore.renderForzaEserciziAttivi({ tipo: 'forza' }, config);

            expect(mockContainer.innerHTML).toContain('nst-hud-table');
            expect(mockContainer.innerHTML).toContain('SET');
            expect(mockContainer.innerHTML).toContain('REC');
            expect(mockContainer.innerHTML).toContain('ULT');
            expect(mockContainer.innerHTML).toContain('ATTUALE');

            // Valori REC / ULT
            expect(mockContainer.innerHTML).toContain('85×5');
            expect(mockContainer.innerHTML).toContain('80×5');

            // Presenza inputs dual per peso e rip
            expect(mockContainer.innerHTML).toContain('nst-ibrido-ex-peso-0-0');
            expect(mockContainer.innerHTML).toContain('nst-ibrido-ex-rip-0-0');
            expect(mockContainer.innerHTML).toContain('value="80"');
            expect(mockContainer.innerHTML).toContain('value="5"');
        });

        it('renderMetconGiroCorrente renderizza 4 colonne con REC, ULT e ATTUALE', () => {
            const mockContainer = { innerHTML: '' };
            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-active-ex-table-container') return mockContainer;
                return null;
            });

            nestore.setCurrentMetconDisplayedRound(1);
            nestore.setIbridoMetconResults([
                [
                    {
                        nome: 'Thruster 40kg',
                        target_originario: '10 rip',
                        rec_display: '12',
                        ult_display: '10',
                        risultato_effettivo: '10'
                    }
                ]
            ]);

            nestore.renderMetconGiroCorrente();

            expect(mockContainer.innerHTML).toContain('ESERCIZIO');
            expect(mockContainer.innerHTML).toContain('REC');
            expect(mockContainer.innerHTML).toContain('ULT');
            expect(mockContainer.innerHTML).toContain('ATTUALE');
            expect(mockContainer.innerHTML).toContain('Thruster 40kg');
            expect(mockContainer.innerHTML).toContain('<td class="nst-hud-num-col rec">12</td>');
            expect(mockContainer.innerHTML).toContain('<td class="nst-hud-num-col ult">10</td>');
            expect(mockContainer.innerHTML).toContain('id="nst-metcon-ex-risultato-0"');
            expect(mockContainer.innerHTML).toContain('value="10"');
        });
    });

    describe('4. CSS & Zero Scroll Orizzontale a 360px', () => {
        it('verifica che nestore.css contenga le classi HUD essenziali e non contenga min-width: 440px/460px non sovrascritti', () => {
            const cssPath = path.resolve(__dirname, '../portal/nestore.css');
            const cssContent = fs.readFileSync(cssPath, 'utf8');

            expect(cssContent).toContain('.nst-hud-table');
            expect(cssContent).toContain('.nst-hud-num-col');
            expect(cssContent).toContain('.nst-hud-input');
            expect(cssContent).toContain('.nst-hud-input-dual');

            // Verifica che .nst-metcon-compare-table e .nst-hud-table abbiano table-layout: fixed e min-width: 0
            expect(cssContent).toContain('table-layout: fixed');
            expect(cssContent).toContain('min-width: 0 !important');

            // Verifica assenza di vecchie regole min-width rigide non gestite
            expect(cssContent).not.toMatch(/\.nst-metcon-compare-table\s*\{[^}]*min-width:\s*460px/);
            expect(cssContent).not.toMatch(/@media[^{]*\{[^}]*\.nst-metcon-compare-table\s*\{[^}]*min-width:\s*440px/);
        });

        it('verifica che nestore.html includa la tabella HUD in anteprima Invictus', () => {
            const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');

            expect(htmlContent).toContain('nst-hud-table');
            expect(htmlContent).toContain('REC');
            expect(htmlContent).toContain('ULT');
            expect(htmlContent).toContain('ATTUALE');
            expect(htmlContent).toContain('nst-invictus-rec-pull');
            expect(htmlContent).toContain('nst-invictus-ult-pull');
            expect(htmlContent).toContain('nst-invictus-target-pull');
            expect(htmlContent).toContain('nst-modal-pull-reps');
        });
    });

    describe('5. Conformità Schema PostgreSQL & Anti-Regressione Valori Iniziali ATTUALE', () => {
        it('garantisce che nessuna query su nestore_allenamenti selezioni created_at o usi select(*)', () => {
            const jsPath = path.resolve(__dirname, '../portal/nestore.js');
            const jsContent = fs.readFileSync(jsPath, 'utf8');

            // Trova tutte le query .from('nestore_allenamenti').select(...)
            const matches = jsContent.match(/\.from\(['"]nestore_allenamenti['"]\)\s*\.select\(([^)]+)\)/g) || [];
            expect(matches.length).toBe(4); // 3 per atleta + 1 per vista coach

            matches.forEach(block => {
                expect(block).not.toContain('created_at');
                expect(block).not.toContain('*');
                expect(block).toContain('creato_il');
            });
        });

        it('renderForzaAnteprimaEsercizi inizializza ATTUALE con target di default se mai eseguito (REC=0, ULT=0)', () => {
            const mockExListEl = { innerHTML: '' };
            const prog = {
                id: 'ibrido_forza_1',
                nome: 'Forza 1',
                tipo: 'forza',
                esercizi: [
                    { nome: 'Panca Piana', serie_target: 4, rip_target: 5, peso_target: 105 }
                ]
            };

            nestore.renderForzaAnteprimaEsercizi(prog, mockExListEl, []);

            // REC e ULT sono 0
            expect(mockExListEl.innerHTML).toContain('<td class="nst-hud-num-col rec">0</td>');
            expect(mockExListEl.innerHTML).toContain('<td class="nst-hud-num-col ult">0</td>');

            // ATTUALE per R1 riscaldamento precompila con default warmup (10 rip e peso > 0)
            expect(mockExListEl.innerHTML).toContain('id="nst-forza-cfg-warmup-0-0"');
            expect(mockExListEl.innerHTML).toContain('id="nst-forza-cfg-warmup-rip-0-0"');
            expect(mockExListEl.innerHTML).toContain('value="10"');

            // ATTUALE per S1 serie allenante precompila con il target di catalogo (105kg x 5 rip)
            expect(mockExListEl.innerHTML).toContain('id="nst-forza-cfg-work-peso-0-0"');
            expect(mockExListEl.innerHTML).toContain('value="105"');
            expect(mockExListEl.innerHTML).toContain('id="nst-forza-cfg-work-rip-0-0"');
            expect(mockExListEl.innerHTML).toContain('value="5"');
        });

        it('renderForzaAnteprimaEsercizi inizializza ATTUALE con ULTIMO se già eseguito in precedenza', () => {
            const mockExListEl = { innerHTML: '' };
            const prog = {
                id: 'ibrido_forza_1',
                nome: 'Forza 1',
                tipo: 'forza',
                esercizi: [
                    { nome: 'Panca Piana', serie_target: 4, rip_target: 5, peso_target: 105 }
                ]
            };

            const sessioni = [
                {
                    data_allenamento: '2026-10-25',
                    scheda_dati: {
                        tipo: 'forza',
                        esercizi: [
                            {
                                nome: 'Panca Piana',
                                riscaldamento_effettivo: [
                                    { serie: 1, peso_kg: 70, rip: 10 }
                                ],
                                serie_effettive: [
                                    { serie: 1, peso_kg: 100, rip: 5 }
                                ]
                            }
                        ]
                    }
                }
            ];

            nestore.renderForzaAnteprimaEsercizi(prog, mockExListEl, sessioni);

            // REC e ULT mostrano i valori reali
            expect(mockExListEl.innerHTML).toContain('<td class="nst-hud-num-col rec">100×5</td>');
            expect(mockExListEl.innerHTML).toContain('<td class="nst-hud-num-col ult">100×5</td>');

            // ATTUALE precompila con i valori dell'ultima sessione
            expect(mockExListEl.innerHTML).toContain('id="nst-forza-cfg-work-peso-0-0"');
            expect(mockExListEl.innerHTML).toContain('value="100"');
            expect(mockExListEl.innerHTML).toContain('id="nst-forza-cfg-work-rip-0-0"');
            expect(mockExListEl.innerHTML).toContain('value="5"');
        });

        it('apriAnteprimaInvictus precompila ATTUALE a 5 se prima volta e con ultPull se già eseguito', () => {
            const mockPullVal = { textContent: '' };
            const mockTargetPull = { textContent: '' };
            const mockTargetPush = { textContent: '' };
            const mockTargetSquat = { textContent: '' };
            const mockRecPull = { textContent: '' };
            const mockUltPull = { textContent: '' };
            const mockRecPush = { textContent: '' };
            const mockUltPush = { textContent: '' };
            const mockRecSquat = { textContent: '' };
            const mockUltSquat = { textContent: '' };
            const mockModal = { classList: { remove: vi.fn(), add: vi.fn() } };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-invictus-preview-modal') return mockModal;
                if (id === 'nst-invictus-pull-val') return mockPullVal;
                if (id === 'nst-invictus-target-pull') return mockTargetPull;
                if (id === 'nst-invictus-target-push') return mockTargetPush;
                if (id === 'nst-invictus-target-squat') return mockTargetSquat;
                if (id === 'nst-invictus-rec-pull') return mockRecPull;
                if (id === 'nst-invictus-ult-pull') return mockUltPull;
                if (id === 'nst-invictus-rec-push') return mockRecPush;
                if (id === 'nst-invictus-ult-push') return mockUltPush;
                if (id === 'nst-invictus-rec-squat') return mockRecSquat;
                if (id === 'nst-invictus-ult-squat') return mockUltSquat;
                return null;
            });

            // 1. Senza storico
            window.currentAllenamentiData = [];
            nestore.apriAnteprimaInvictus();
            expect(mockPullVal.textContent).toBe(5);
            expect(mockTargetPull.textContent).toBe(5);
            expect(mockTargetPush.textContent).toBe(10);
            expect(mockTargetSquat.textContent).toBe(20);
            expect(mockRecPull.textContent).toBe(0);
            expect(mockUltPull.textContent).toBe(0);

            // 2. Con storico
            window.currentAllenamentiData = [
                {
                    data_allenamento: '2026-10-20',
                    corso_disciplina: 'INVICTUS',
                    scheda_dati: {
                        pull_base: 8,
                        giri_completati: 10
                    }
                }
            ];
            nestore.apriAnteprimaInvictus();
            expect(mockPullVal.textContent).toBe(8);
            expect(mockTargetPull.textContent).toBe(8);
            expect(mockTargetPush.textContent).toBe(16);
            expect(mockTargetSquat.textContent).toBe(32);
            expect(mockRecPull.textContent).toBe(8);
            expect(mockUltPull.textContent).toBe(8);
        });
    });
});
