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

            const pull = exercises.find(e => e.nome === 'Pull-up');
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
            expect(exercises[0].nome).toBe('Stacco da Terra');
            expect(exercises[0].peso_kg).toBe(190);
            expect(exercises[0].ripetizioni).toBe(3);
        });
    });

    describe('calcolaRecordPersonali (All-Time PR Aggregator)', () => {
        it('calculates the exact all-time PRs across multiple sessions', () => {
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
            const prMap = Object.fromEntries(prs.map(p => [p.nome, p]));

            // Panca: best is 1x110kg on 2026-09-09
            expect(prMap['Panca Piana']).toBeDefined();
            expect(prMap['Panca Piana'].peso_kg).toBe(110);
            expect(prMap['Panca Piana'].ripetizioni).toBe(1);
            expect(prMap['Panca Piana'].data).toBe('2026-09-09');

            // Leg Press: best is 180kg x 10 reps
            expect(prMap['Leg Press']).toBeDefined();
            expect(prMap['Leg Press'].peso_kg).toBe(180);
            expect(prMap['Leg Press'].ripetizioni).toBe(10);

            // Squat: 200 reps on 2026-09-11
            expect(prMap['Squat']).toBeDefined();
            expect(prMap['Squat'].peso_kg).toBe(0);
            expect(prMap['Squat'].ripetizioni).toBe(200);
            expect(prMap['Squat'].data).toBe('2026-09-11');

            // Pull-up: 50 reps
            expect(prMap['Pull-up']).toBeDefined();
            expect(prMap['Pull-up'].ripetizioni).toBe(50);

            // Push-up: 100 reps
            expect(prMap['Push-up']).toBeDefined();
            expect(prMap['Push-up'].ripetizioni).toBe(100);

            // Addominali: 50 reps
            expect(prMap['Addominali']).toBeDefined();
            expect(prMap['Addominali'].ripetizioni).toBe(50);
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
});
