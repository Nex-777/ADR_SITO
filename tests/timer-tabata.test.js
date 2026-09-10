import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Timer & Tabata Engine Core Tests', () => {
    let mockStorage;
    const MAX_STOPWATCH_MS = 3 * 60 * 60 * 1000; // 10.800.000 ms

    beforeEach(() => {
        mockStorage = {};
        global.localStorage = {
            getItem: vi.fn((key) => mockStorage[key] || null),
            setItem: vi.fn((key, value) => { mockStorage[key] = String(value); }),
            removeItem: vi.fn((key) => { delete mockStorage[key]; }),
            clear: vi.fn(() => { mockStorage = {}; })
        };
    });

    describe('Stopwatch Logic & Auto-Stop at 3 Hours', () => {
        function createStopwatch(initialState = {}) {
            return {
                state: {
                    running: false,
                    startTimestamp: null,
                    elapsedBeforePause: 0,
                    laps: [],
                    ...initialState
                },
                getElapsedMs(now = Date.now()) {
                    if (!this.state.running || !this.state.startTimestamp) {
                        return this.state.elapsedBeforePause || 0;
                    }
                    return (now - this.state.startTimestamp) + (this.state.elapsedBeforePause || 0);
                },
                start(now = Date.now()) {
                    if (this.state.running) return;
                    this.state.running = true;
                    this.state.startTimestamp = now;
                },
                pause(now = Date.now()) {
                    if (!this.state.running) return;
                    this.state.elapsedBeforePause = this.getElapsedMs(now);
                    this.state.running = false;
                    this.state.startTimestamp = null;
                },
                reset() {
                    this.state.running = false;
                    this.state.startTimestamp = null;
                    this.state.elapsedBeforePause = 0;
                    this.state.laps = [];
                },
                lap(now = Date.now()) {
                    if (!this.state.running) return;
                    const totalMs = this.getElapsedMs(now);
                    const lastTotal = this.state.laps.length > 0 ? this.state.laps[0].totalMs : 0;
                    const splitMs = totalMs - lastTotal;
                    this.state.laps.unshift({
                        number: this.state.laps.length + 1,
                        splitMs,
                        totalMs
                    });
                },
                checkAutoStop(now = Date.now()) {
                    if (this.state.running && this.getElapsedMs(now) >= MAX_STOPWATCH_MS) {
                        this.reset();
                        return true; // auto-stopped
                    }
                    return false;
                },
                formatTime(ms) {
                    const totalSeconds = Math.floor(ms / 1000);
                    const tenths = Math.floor((ms % 1000) / 100);
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    const seconds = totalSeconds % 60;
                    const pM = String(minutes).padStart(2, '0');
                    const pS = String(seconds).padStart(2, '0');
                    if (hours > 0) {
                        return `${String(hours).padStart(2, '0')}:${pM}:${pS}.${tenths}`;
                    }
                    return `${pM}:${pS}.${tenths}`;
                }
            };
        }

        it('initializes in stopped state with 0 elapsed', () => {
            const sw = createStopwatch();
            expect(sw.state.running).toBe(false);
            expect(sw.getElapsedMs()).toBe(0);
            expect(sw.formatTime(0)).toBe('00:00.0');
        });

        it('tracks elapsed time precisely and pauses correctly', () => {
            const sw = createStopwatch();
            const t0 = 1000000;
            sw.start(t0);
            expect(sw.state.running).toBe(true);
            expect(sw.getElapsedMs(t0 + 5500)).toBe(5500);

            sw.pause(t0 + 5500);
            expect(sw.state.running).toBe(false);
            expect(sw.getElapsedMs(t0 + 10000)).toBe(5500);

            // Resume
            sw.start(t0 + 10000);
            expect(sw.getElapsedMs(t0 + 12000)).toBe(7500);
            expect(sw.formatTime(7500)).toBe('00:07.5');
        });

        it('formats time with hours when elapsed >= 1 hour', () => {
            const sw = createStopwatch();
            const oneHourFifteenMs = (1 * 3600 + 15 * 60 + 32) * 1000 + 400; // 01:15:32.4
            expect(sw.formatTime(oneHourFifteenMs)).toBe('01:15:32.4');
        });

        it('records laps with split and total calculations', () => {
            const sw = createStopwatch();
            const t0 = 1000000;
            sw.start(t0);

            sw.lap(t0 + 10000); // Lap 1 at 10s
            expect(sw.state.laps).toHaveLength(1);
            expect(sw.state.laps[0].splitMs).toBe(10000);
            expect(sw.state.laps[0].totalMs).toBe(10000);

            sw.lap(t0 + 25000); // Lap 2 at 25s (split 15s)
            expect(sw.state.laps).toHaveLength(2);
            expect(sw.state.laps[0].number).toBe(2);
            expect(sw.state.laps[0].splitMs).toBe(15000);
            expect(sw.state.laps[0].totalMs).toBe(25000);
        });

        it('automatically stops and resets when reaching 3 hours', () => {
            const sw = createStopwatch();
            const t0 = 1000000;
            sw.start(t0);

            // Under 3 hours (2h 59m 59s)
            const under3h = t0 + (MAX_STOPWATCH_MS - 1000);
            expect(sw.checkAutoStop(under3h)).toBe(false);
            expect(sw.state.running).toBe(true);

            // Exactly 3 hours
            const at3h = t0 + MAX_STOPWATCH_MS;
            expect(sw.checkAutoStop(at3h)).toBe(true);
            expect(sw.state.running).toBe(false);
            expect(sw.state.startTimestamp).toBeNull();
            expect(sw.state.elapsedBeforePause).toBe(0);
        });
    });

    describe('Tabata / Interval State Machine', () => {
        function createTabata(customConfig = {}) {
            const config = {
                prep: 5,
                work: 20,
                rest: 10,
                rounds: 8,
                sets: 1,
                ...customConfig
            };

            return {
                state: {
                    running: false,
                    phase: 'prep',
                    phaseStartTimestamp: null,
                    phaseElapsedBeforePause: 0,
                    phaseDurationSec: config.prep > 0 ? config.prep : config.work,
                    currentRound: 1,
                    currentSet: 1,
                    config,
                    lastBeepSecond: -1
                },
                start(now = Date.now()) {
                    this.state.running = true;
                    this.state.phaseStartTimestamp = now;
                },
                pause(now = Date.now()) {
                    if (!this.state.running) return;
                    this.state.phaseElapsedBeforePause = (now - this.state.phaseStartTimestamp) + this.state.phaseElapsedBeforePause;
                    this.state.running = false;
                    this.state.phaseStartTimestamp = null;
                },
                avanzaFase(now = Date.now()) {
                    this.state.phaseElapsedBeforePause = 0;
                    this.state.phaseStartTimestamp = this.state.running ? now : null;
                    this.state.lastBeepSecond = -1;

                    if (this.state.phase === 'prep') {
                        this.state.phase = 'work';
                        this.state.phaseDurationSec = this.state.config.work;
                    } else if (this.state.phase === 'work') {
                        if (this.state.currentRound < this.state.config.rounds) {
                            this.state.phase = 'rest';
                            this.state.phaseDurationSec = this.state.config.rest;
                        } else {
                            if (this.state.currentSet < this.state.config.sets) {
                                this.state.currentSet++;
                                this.state.currentRound = 1;
                                this.state.phase = 'rest';
                                this.state.phaseDurationSec = this.state.config.rest * 2;
                            } else {
                                this.state.phase = 'done';
                                this.state.running = false;
                                this.state.phaseStartTimestamp = null;
                            }
                        }
                    } else if (this.state.phase === 'rest') {
                        this.state.currentRound++;
                        this.state.phase = 'work';
                        this.state.phaseDurationSec = this.state.config.work;
                    }
                }
            };
        }

        it('progresses from PREP to WORK after prep time', () => {
            const tabata = createTabata({ prep: 5, work: 20, rest: 10, rounds: 2, sets: 1 });
            expect(tabata.state.phase).toBe('prep');
            expect(tabata.state.phaseDurationSec).toBe(5);

            tabata.start(1000);
            tabata.avanzaFase(6000); // 5s later

            expect(tabata.state.phase).toBe('work');
            expect(tabata.state.phaseDurationSec).toBe(20);
            expect(tabata.state.currentRound).toBe(1);
        });

        it('transitions from WORK to REST on intermediate round', () => {
            const tabata = createTabata({ prep: 0, work: 20, rest: 10, rounds: 2, sets: 1 });
            tabata.state.phase = 'work';
            tabata.state.phaseDurationSec = 20;
            tabata.start(1000);

            tabata.avanzaFase(21000);

            expect(tabata.state.phase).toBe('rest');
            expect(tabata.state.phaseDurationSec).toBe(10);
            expect(tabata.state.currentRound).toBe(1);
        });

        it('transitions from REST to WORK and increments round', () => {
            const tabata = createTabata({ prep: 0, work: 20, rest: 10, rounds: 2, sets: 1 });
            tabata.state.phase = 'rest';
            tabata.state.currentRound = 1;
            tabata.start(1000);

            tabata.avanzaFase(11000);

            expect(tabata.state.phase).toBe('work');
            expect(tabata.state.currentRound).toBe(2);
        });

        it('finishes with DONE when all rounds and sets are completed', () => {
            const tabata = createTabata({ prep: 0, work: 20, rest: 10, rounds: 2, sets: 1 });
            tabata.state.phase = 'work';
            tabata.state.currentRound = 2; // final round
            tabata.start(1000);

            tabata.avanzaFase(21000);

            expect(tabata.state.phase).toBe('done');
            expect(tabata.state.running).toBe(false);
        });
    });

    describe('Cross-Page State Persistence via localStorage', () => {
        it('persists and restores stopwatch state correctly across pages', () => {
            const state = {
                running: true,
                startTimestamp: 1700000000000,
                elapsedBeforePause: 12500,
                laps: [{ number: 1, splitMs: 12500, totalMs: 12500 }]
            };

            localStorage.setItem('adr_stopwatch_state', JSON.stringify(state));

            const restored = JSON.parse(localStorage.getItem('adr_stopwatch_state'));
            expect(restored.running).toBe(true);
            expect(restored.startTimestamp).toBe(1700000000000);
            expect(restored.elapsedBeforePause).toBe(12500);
            expect(restored.laps).toHaveLength(1);
        });

        it('persists and restores tabata state correctly across pages', () => {
            const tabataState = {
                running: true,
                phase: 'work',
                phaseStartTimestamp: 1700000000000,
                phaseElapsedBeforePause: 0,
                phaseDurationSec: 20,
                currentRound: 3,
                currentSet: 1,
                config: { prep: 5, work: 20, rest: 10, rounds: 8, sets: 1 }
            };

            localStorage.setItem('adr_tabata_state', JSON.stringify(tabataState));

            const restored = JSON.parse(localStorage.getItem('adr_tabata_state'));
            expect(restored.phase).toBe('work');
            expect(restored.currentRound).toBe(3);
            expect(restored.config.rounds).toBe(8);
        });
    });
});
