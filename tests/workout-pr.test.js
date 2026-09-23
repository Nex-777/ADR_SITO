import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock browser globals before requiring nestore.js in Node
global.APP_CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key' };
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
};
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

// Require nestore.js to populate global.window
require('../portal/nestore.js');
const {
    normalizeExerciseName,
    isBetterPerformance,
    parseExercisesFromWorkout,
    calcolaRecordPersonali,
    formatDateWithYear,
    parseTimeToSeconds,
    formatSecondsToDisplay,
    renderPrGrid,
    PR_ALLOWED_EXERCISES,
    getCanonicalPrExercise,
    apriDettaglioAllenamentoModal,
    chiudiDettaglioAllenamentoModal,
    setCurrentAllenamentiData
} = global.window;

describe('Nestore Workout PR & Personal Records Engine', () => {

    describe('isBetterPerformance logic', () => {
        it('prefers higher weight over higher reps (User Example: 1 rep @ 80kg beats 3 reps @ 70kg)', () => {
            const cand = { nome: 'Panca Piana', peso_kg: 80, ripetizioni: 1 };
            const currentBest = { nome: 'Panca Piana', peso_kg: 70, ripetizioni: 3 };
            expect(isBetterPerformance(cand, currentBest)).toBe(true);

            // Reverse should be false
            expect(isBetterPerformance(currentBest, cand)).toBe(false);
        });

        it('prefers higher reps when weights are equal', () => {
            const cand = { nome: 'Panca Piana', peso_kg: 80, ripetizioni: 5 };
            const currentBest = { nome: 'Panca Piana', peso_kg: 80, ripetizioni: 3 };
            expect(isBetterPerformance(cand, currentBest)).toBe(true);
            expect(isBetterPerformance(currentBest, cand)).toBe(false);
        });

        it('prefers higher repetitions for bodyweight exercises without overload', () => {
            const cand = { nome: 'Squat', peso_kg: 0, ripetizioni: 200 };
            const currentBest = { nome: 'Squat', peso_kg: 0, ripetizioni: 50 };
            expect(isBetterPerformance(cand, currentBest)).toBe(true);
            expect(isBetterPerformance(currentBest, cand)).toBe(false);
        });
    });

    describe('Legacy Workout Note Parser', () => {
        it('parses structured and legacy text notes correctly, ignoring failed sets', () => {
            const workout = {
                data_allenamento: '2026-09-09',
                scheda_dati: [],
                note: 'Panca: 10x90kg, 5x100kg, 1x110kg, 1x120kg (fallita), 4x105kg. Leg Press: 10x50kg, 10x100kg, 10x150kg, 3x10x180kg. 50 addominali.'
            };

            const exercises = parseExercisesFromWorkout(workout);

            // Should have parsed Panca sets (without the 120kg fail)
            const pancaSets = exercises.filter(e => e.nome === 'Panca Piana');
            expect(pancaSets.length).toBe(4);
            expect(pancaSets.some(e => e.peso_kg === 120)).toBe(false);
            expect(pancaSets.some(e => e.peso_kg === 110 && e.ripetizioni === 1)).toBe(true);

            // Leg Press
            const legPressSets = exercises.filter(e => e.nome === 'Leg Press');
            expect(legPressSets.length).toBe(4);
            const maxLegPress = legPressSets.find(e => e.peso_kg === 180);
            expect(maxLegPress).toBeDefined();
            expect(maxLegPress.ripetizioni).toBe(10);
            expect(maxLegPress.serie).toBe(3);

            // Addominali
            const abs = exercises.find(e => e.nome === 'Addominali');
            expect(abs).toBeDefined();
            expect(abs.ripetizioni).toBe(50);
            expect(abs.peso_kg).toBe(0);
        });

        it('parses bodyweight total list from INVICTUS session', () => {
            const workout = {
                data_allenamento: '2026-09-11',
                scheda_dati: [],
                note: 'INVICTUS. Totale: 50 pull, 100 push, 200 squat.'
            };

            const exercises = parseExercisesFromWorkout(workout);
            expect(exercises.length).toBe(3);

            const pull = exercises.find(e => e.nome === 'Trazioni');
            expect(pull).toBeDefined();
            expect(pull.ripetizioni).toBe(50);
            expect(pull.peso_kg).toBe(0);

            const push = exercises.find(e => e.nome === 'Push-up');
            expect(push).toBeDefined();
            expect(push.ripetizioni).toBe(100);

            const squat = exercises.find(e => e.nome === 'Squat');
            expect(squat).toBeDefined();
            expect(squat.ripetizioni).toBe(200);
        });

        it('uses structured scheda_dati if present', () => {
            const workout = {
                data_allenamento: '2026-09-16',
                scheda_dati: [
                    { nome: 'Stacco da Terra', peso_kg: 190, ripetizioni: 3, serie: 2 }
                ],
                note: 'Qualche nota'
            };

            const exercises = parseExercisesFromWorkout(workout);
            expect(exercises.length).toBe(1);
            expect(exercises[0].nome === 'Stacco da Terra').toBe(true);
            expect(exercises[0].peso_kg).toBe(190);
            expect(exercises[0].ripetizioni).toBe(3);
        });
    });

    describe('calcolaRecordPersonali (Whitelist 8 Esercizi)', () => {
        it('calculates the exact all-time PRs for only the 8 whitelisted exercises', () => {
            const workouts = [
                {
                    data_allenamento: '2026-09-09',
                    scheda_dati: [],
                    note: 'Panca: 10x90kg, 5x100kg, 1x110kg, 1x120kg (fallita), 4x105kg. Leg Press: 10x50kg, 10x100kg, 10x150kg, 3x10x180kg. 50 addominali.'
                },
                {
                    data_allenamento: '2026-09-11',
                    scheda_dati: [],
                    note: 'INVICTUS. Totale: 50 pull, 100 push, 200 squat.'
                }
            ];

            const prs = calcolaRecordPersonali(workouts);
            expect(prs.length).toBe(8);

            const prMap = Object.fromEntries(prs.map(p => [p.nome, p]));

            // Panca: best is 1x110kg on 2026-09-09
            expect(prMap['Panca Piana']).toBeDefined();
            expect(prMap['Panca Piana'].hasRecord).toBe(true);
            expect(prMap['Panca Piana'].peso_kg).toBe(110);
            expect(prMap['Panca Piana'].ripetizioni).toBe(1);
            expect(prMap['Panca Piana'].data).toBe('2026-09-09');

            // Squat: 200 reps on 2026-09-11
            expect(prMap['Squat']).toBeDefined();
            expect(prMap['Squat'].hasRecord).toBe(true);
            expect(prMap['Squat'].peso_kg).toBe(0);
            expect(prMap['Squat'].ripetizioni).toBe(200);
            expect(prMap['Squat'].data).toBe('2026-09-11');

            // Trazioni: 50 reps
            expect(prMap['Trazioni']).toBeDefined();
            expect(prMap['Trazioni'].hasRecord).toBe(true);
            expect(prMap['Trazioni'].ripetizioni).toBe(50);

            // Excluded non-whitelisted exercises MUST NOT be present in PR list
            expect(prMap['Leg Press']).toBeUndefined();
            expect(prMap['Push-up']).toBeUndefined();
            expect(prMap['Addominali']).toBeUndefined();

            // Unrecorded whitelisted exercises remain in grid as empty placeholders
            expect(prMap['Stacco da Terra'].hasRecord).toBe(false);
            expect(prMap['Corsa 60m'].hasRecord).toBe(false);
            expect(prMap['Corsa 100m'].hasRecord).toBe(false);
            expect(prMap['Corsa 5km'].hasRecord).toBe(false);
            expect(prMap['Corsa 10km'].hasRecord).toBe(false);
        });
    });

    describe('formatDateWithYear helper', () => {
        it('formats ISO dates correctly into DD/MM/YY', () => {
            expect(formatDateWithYear('2026-09-09')).toBe('09/09/26');
            expect(formatDateWithYear('2026-09-21')).toBe('21/09/26');
            expect(formatDateWithYear('2026-09-21T18:30:00Z')).toBe('21/09/26');
            expect(formatDateWithYear('')).toBe('');
        });
    });

    describe('Structured scheda_dati with Warmup/Ramp PRs (Valerio Case: 125kg Bench Press)', () => {
        it('extracts PR from 100% ramp set in riscaldamento_effettivo when scheda_dati is an object', () => {
            const workout = {
                id: 'valerio-session-1',
                data_allenamento: '2026-09-21',
                corso_disciplina: 'Ibrido - Forza 1',
                durata_minuti: 45,
                rpe_fatica: 8,
                scheda_dati: {
                    tipo: 'forza',
                    programma_nome: 'IBRIDO - FORZA 1',
                    esito_globale: 'COMPLETATA',
                    esercizi: [
                        {
                            nome: 'Panca piana con bilanciere',
                            serie: 4,
                            peso_kg: 110,
                            ripetizioni: 20,
                            esito: 'COMPLETATA',
                            target_originario: '4x5 @ 110kg',
                            riscaldamento_effettivo: [
                                { serie: 1, rip: 5, rip_target: 5, peso_kg: 65, pct: 50 },
                                { serie: 2, rip: 4, rip_target: 4, peso_kg: 80, pct: 65 },
                                { serie: 3, rip: 3, rip_target: 3, peso_kg: 95, pct: 80 },
                                { serie: 4, rip: 2, rip_target: 2, peso_kg: 110, pct: 90 },
                                { serie: 5, rip: 1, rip_target: 1, peso_kg: 125, pct: 100 } // 1RM test single!
                            ],
                            serie_dettaglio: [
                                { serie: 1, peso_kg: 110, ripetizioni: 5 },
                                { serie: 2, peso_kg: 110, ripetizioni: 5 },
                                { serie: 3, peso_kg: 110, ripetizioni: 5 },
                                { serie: 4, peso_kg: 110, ripetizioni: 5 }
                            ]
                        }
                    ]
                }
            };

            const parsed = parseExercisesFromWorkout(workout);
            expect(parsed.length).toBe(1);
            expect(parsed[0].nome).toBe('Panca Piana');
            // The 125kg 1RM single from the ramp should be detected as the best lift
            expect(parsed[0].peso_kg).toBe(125);
            expect(parsed[0].ripetizioni).toBe(1);
            expect(parsed[0].data).toBe('2026-09-21');

            // When aggregated with previous PRs (110kg from 2026-09-09), 125kg beats 110kg!
            const allWorkouts = [
                {
                    data_allenamento: '2026-09-09',
                    scheda_dati: [],
                    note: 'Panca: 1x110kg.'
                },
                workout
            ];

            const prs = calcolaRecordPersonali(allWorkouts);
            const benchPr = prs.find(p => p.nome === 'Panca Piana');
            expect(benchPr).toBeDefined();
            expect(benchPr.peso_kg).toBe(125);
            expect(benchPr.ripetizioni).toBe(1);
            expect(benchPr.data).toBe('2026-09-21');
        });
    });

    describe('UI Markup & CSS Verification', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.html'), 'utf8');
        const css = fs.readFileSync(path.resolve(__dirname, '../portal/nestore.css'), 'utf8');

        it('confirms the chart canvas was removed and the PR container is in place', () => {
            expect(html).not.toContain('id="nst-chart-allenamenti"');
            expect(html).toContain('id="nst-pr-container"');
            expect(html).toContain('class="nst-pr-grid"');
            expect(html).toContain('RECORD PERSONALI (ALL-TIME)');
        });

        it('confirms CSS classes for the PR grid and cards exist', () => {
            expect(css).toContain('.nst-pr-grid');
            expect(css).toContain('.nst-pr-card');
            expect(css).toContain('.nst-pr-best-val');
            expect(css).toContain('.nst-pr-section');
        });

        it('confirms workout detail modal markup and CSS exist', () => {
            expect(html).toContain('id="nst-modal-dettaglio-allenamento"');
            expect(html).toContain('id="nst-modal-dettaglio-titolo"');
            expect(html).toContain('id="nst-modal-dettaglio-body"');
            expect(css).toContain('.nst-session-meta-grid');
            expect(css).toContain('.nst-session-ex-card');
            expect(css).toContain('.nst-warmup-pill');
            expect(css).toContain('#nst-tbody-allenamenti tr.nst-clickable-row');
        });
    });

    describe('Workout Detail Modal Controller', () => {
        it('opens, renders breakdown with warmup ramp, and closes properly', () => {
            const modalEl = {
                classList: {
                    classes: new Set(['nst-hidden']),
                    remove(c) { this.classes.delete(c); },
                    add(c) { this.classes.add(c); },
                    contains(c) { return this.classes.has(c); }
                }
            };
            const bodyEl = { innerHTML: '' };
            const titleEl = { textContent: '' };

            const origGetById = global.document.getElementById;
            global.document.getElementById = (id) => {
                if (id === 'nst-modal-dettaglio-allenamento') return modalEl;
                if (id === 'nst-modal-dettaglio-body') return bodyEl;
                if (id === 'nst-modal-dettaglio-titolo') return titleEl;
                return null;
            };

            const sampleWorkout = {
                id: 'sess-valerio-123',
                data_allenamento: '2026-09-21',
                corso_disciplina: 'Ibrido - Forza 1',
                durata_minuti: 48,
                rpe_fatica: 9,
                note: 'Ottima spinta su panca, test 125kg riuscito!',
                scheda_dati: {
                    tipo: 'forza',
                    esito_globale: 'COMPLETATA',
                    esercizi: [
                        {
                            nome: 'Panca piana con bilanciere',
                            target_originario: '4x5 @ 110kg',
                            esito: 'COMPLETATA',
                            riscaldamento_effettivo: [
                                { serie: 5, rip: 1, peso_kg: 125, label: 'Rampa 5 (100%)' }
                            ],
                            serie_dettaglio: [
                                { serie: 1, peso_kg: 110, ripetizioni: 5 }
                            ]
                        }
                    ]
                }
            };

            setCurrentAllenamentiData([sampleWorkout]);

            // Open modal
            apriDettaglioAllenamentoModal('sess-valerio-123');

            expect(modalEl.classList.contains('nst-hidden')).toBe(false);
            expect(titleEl.textContent).toContain('IBRIDO - FORZA 1');
            expect(titleEl.textContent).toContain('21/09/26');

            // Check rendered content in modal body
            expect(bodyEl.innerHTML).toContain('21/09/26');
            expect(bodyEl.innerHTML).toContain('48 min');
            expect(bodyEl.innerHTML).toContain('9/10');
            expect(bodyEl.innerHTML).toContain('Ottima spinta su panca');
            expect(bodyEl.innerHTML).toContain('Panca piana con bilanciere');
            expect(bodyEl.innerHTML).toContain('125 kg');
            expect(bodyEl.innerHTML).toContain('110 kg');

            // Close modal
            chiudiDettaglioAllenamentoModal();
            expect(modalEl.classList.contains('nst-hidden')).toBe(true);

            global.document.getElementById = origGetById;
        });
    });

    describe('Running Time Parsers & Helpers', () => {
        it('correctly parses running time strings into seconds', () => {
            expect(parseTimeToSeconds('11.8s')).toBe(11.8);
            expect(parseTimeToSeconds('11.8 sec')).toBe(11.8);
            expect(parseTimeToSeconds('21:40')).toBe(1300);
            expect(parseTimeToSeconds('01:05:20')).toBe(3920);
            expect(parseTimeToSeconds('22m 15s')).toBe(1335);
            expect(parseTimeToSeconds('7.5')).toBe(7.5);
            expect(parseTimeToSeconds('')).toBe(0);
        });

        it('formats seconds into human readable running times', () => {
            expect(formatSecondsToDisplay(11.8)).toBe('11.8s');
            expect(formatSecondsToDisplay(1300)).toBe('21:40');
            expect(formatSecondsToDisplay(3920)).toBe('1:05:20');
            expect(formatSecondsToDisplay(0)).toBe('--');
        });
    });

    describe('Running PR Dual Tracking (Corpo Libero vs Zavorrata)', () => {
        it('tracks both bodyweight and weighted PRs separately for running exercises', () => {
            const workouts = [
                {
                    data_allenamento: '2026-09-10',
                    scheda_dati: [],
                    note: 'Corsa 100m: 11.8s' // Corpo libero
                },
                {
                    data_allenamento: '2026-09-12',
                    scheda_dati: [],
                    note: 'Corsa 100m: 10kg, 13.5s' // Zavorrata (+10kg sovraccarico)
                }
            ];

            const prs = calcolaRecordPersonali(workouts);
            const prMap = Object.fromEntries(prs.map(p => [p.nome, p]));

            const run100 = prMap['Corsa 100m'];
            expect(run100).toBeDefined();
            expect(run100.hasRecord).toBe(true);

            // Both records exist
            expect(run100.corpo_libero).toBeDefined();
            expect(run100.corpo_libero.tempo_secondi).toBe(11.8);
            expect(run100.corpo_libero.tempo).toBe('11.8s');
            expect(run100.corpo_libero.peso_kg).toBe(0);
            expect(run100.corpo_libero.data).toBe('2026-09-10');

            expect(run100.zavorrata).toBeDefined();
            expect(run100.zavorrata.tempo_secondi).toBe(13.5);
            expect(run100.zavorrata.tempo).toBe('13.5s');
            expect(run100.zavorrata.peso_kg).toBe(10);
            expect(run100.zavorrata.data).toBe('2026-09-12');
        });

        it('updates running PR when a lower time is achieved (Lower Time Wins)', () => {
            const workouts = [
                {
                    data_allenamento: '2026-09-10',
                    scheda_dati: [],
                    note: 'Corsa 5km: 22:30'
                },
                {
                    data_allenamento: '2026-09-15',
                    scheda_dati: [],
                    note: 'Corsa 5km: 21:40' // Faster time
                },
                {
                    data_allenamento: '2026-09-18',
                    scheda_dati: [],
                    note: 'Corsa 5km: 23:10' // Slower time, should NOT overwrite
                }
            ];

            const prs = calcolaRecordPersonali(workouts);
            const prMap = Object.fromEntries(prs.map(p => [p.nome, p]));

            const run5k = prMap['Corsa 5km'];
            expect(run5k.hasRecord).toBe(true);
            expect(run5k.corpo_libero.tempo_secondi).toBe(1300); // 21:40
            expect(run5k.corpo_libero.tempo).toBe('21:40');
            expect(run5k.corpo_libero.data).toBe('2026-09-15');
        });

        it('never counts athlete bodyweight into overload (sovraccarico only)', () => {
            const workout = {
                data_allenamento: '2026-09-20',
                scheda_dati: [
                    {
                        nome: 'Corsa 60m',
                        sovraccarico_kg: 10,
                        tempo: '8.2s'
                    }
                ]
            };

            const prs = calcolaRecordPersonali([workout]);
            const run60 = prs.find(p => p.nome === 'Corsa 60m');

            expect(run60.zavorrata.peso_kg).toBe(10); // Exactly 10kg overload, NOT 70+10kg
            expect(run60.corpo_libero).toBeNull();
        });
    });

    describe('renderPrGrid with Placeholders & Dual Running Layout', () => {
        it('renders exactly 8 cards with empty placeholders and dual running rows', () => {
            const container = {
                innerHTML: '',
                children: [],
                appendChild(el) {
                    this.children.push(el);
                }
            };
            const countEl = { textContent: '' };

            const origGetById = global.document.getElementById;
            global.document.getElementById = (id) => {
                if (id === 'nst-pr-container') return container;
                if (id === 'nst-pr-count') return countEl;
                return origGetById ? origGetById(id) : null;
            };

            // Call renderPrGrid with 1 strength record and 1 running record
            const mockPrs = [
                { key: 'panca', nome: 'Panca Piana', type: 'strength', peso_kg: 125, ripetizioni: 1, serie: 1, data: '2026-09-21', hasRecord: true },
                { key: 'squat', nome: 'Squat', type: 'strength', peso_kg: 0, ripetizioni: 0, serie: 0, data: '', hasRecord: false },
                { key: 'stacco', nome: 'Stacco da Terra', type: 'strength', peso_kg: 0, ripetizioni: 0, serie: 0, data: '', hasRecord: false },
                { key: 'trazioni', nome: 'Trazioni', type: 'strength', peso_kg: 0, ripetizioni: 0, serie: 0, data: '', hasRecord: false },
                { key: 'corsa_60m', nome: 'Corsa 60m', type: 'running', corpo_libero: null, zavorrata: null, hasRecord: false },
                {
                    key: 'corsa_100m',
                    nome: 'Corsa 100m',
                    type: 'running',
                    corpo_libero: { tempo: '11.8s', tempo_secondi: 11.8, peso_kg: 0, data: '2026-09-10' },
                    zavorrata: { tempo: '13.5s', tempo_secondi: 13.5, peso_kg: 10, data: '2026-09-12' },
                    hasRecord: true
                },
                { key: 'corsa_5km', nome: 'Corsa 5km', type: 'running', corpo_libero: null, zavorrata: null, hasRecord: false },
                { key: 'corsa_10km', nome: 'Corsa 10km', type: 'running', corpo_libero: null, zavorrata: null, hasRecord: false }
            ];

            renderPrGrid(mockPrs, container);

            expect(container.children.length).toBe(8);
            expect(countEl.textContent).toBe('2 su 8 registrati');

            // 1. Panca Piana (Recorded Strength)
            const pancaCard = container.children[0];
            expect(pancaCard.className).toBe('nst-pr-card');
            expect(pancaCard.innerHTML).toContain('125 <span style="font-size:11px;">KG</span>');
            expect(pancaCard.innerHTML).toContain('1 rep');
            expect(pancaCard.innerHTML).toContain('21/09/26');

            // 2. Squat (Empty Placeholder Strength)
            const squatCard = container.children[1];
            expect(squatCard.className).toContain('nst-pr-empty-card');
            expect(squatCard.innerHTML).toContain('--');
            expect(squatCard.innerHTML).toContain('Nessun record');

            // 6. Corsa 100m (Recorded Running with both Bodyweight & Ballast)
            const corsaCard = container.children[5];
            expect(corsaCard.className).toBe('nst-pr-card');
            expect(corsaCard.innerHTML).toContain('Libero:');
            expect(corsaCard.innerHTML).toContain('11.8s');
            expect(corsaCard.innerHTML).toContain('Zavorra:');
            expect(corsaCard.innerHTML).toContain('13.5s');
            expect(corsaCard.innerHTML).toContain('(+10kg)');

            // 7. Corsa 5km (Empty Placeholder Running)
            const corsa5kCard = container.children[6];
            expect(corsa5kCard.className).toContain('nst-pr-empty-card');
            expect(corsa5kCard.innerHTML).toContain('Libero:');
            expect(corsa5kCard.innerHTML).toContain('Zavorra:');

            global.document.getElementById = origGetById;
        });
    });
});
