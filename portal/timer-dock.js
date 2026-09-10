/**
 * ADR_SITO — Floating Timer Dock (Cross-Page Persistence)
 * Consente a Cronometro e Tabata di rimanere visibili, attivi e sonori
 * anche navigando nelle altre pagine del portale (es. dashboard.html).
 */

(function () {
    // Se ci troviamo su nestore.html ed è già presente il motore interno, non duplicare
    if (window.location.pathname.endsWith('nestore.html')) {
        return;
    }

    const MAX_STOPWATCH_MS = 3 * 60 * 60 * 1000;

    // Web Audio Sound Engine per pagine esterne a Nestore
    const DockAudio = {
        ctx: null,
        getCtx() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return this.ctx;
        },
        beep(freq = 880, durMs = 150, type = 'sine') {
            try {
                const ctx = this.getCtx();
                if (!ctx) return;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (durMs / 1000));
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + (durMs / 1000));
            } catch (e) {}
        },
        longBuzzer() { this.beep(440, 1000, 'sawtooth'); },
        countdownBeep() { this.beep(880, 150, 'sine'); },
        workBuzzer() { this.beep(1200, 350, 'triangle'); },
        restBuzzer() { this.beep(650, 350, 'triangle'); },
        finishFanfare() {
            this.beep(587, 150, 'triangle');
            setTimeout(() => this.beep(740, 150, 'triangle'), 150);
            setTimeout(() => this.beep(880, 450, 'triangle'), 300);
        }
    };

    // Stili CSS iniettati per garantire il render corretto ovunque
    function injectStyles() {
        if (document.getElementById('adr-timer-dock-style')) return;
        const style = document.createElement('style');
        style.id = 'adr-timer-dock-style';
        style.textContent = `
            #nst-timer-dock-global {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 999999;
                background: rgba(8, 17, 34, 0.95);
                border: 1px solid #00e5ff;
                border-radius: 12px;
                padding: 10px 16px;
                display: flex;
                align-items: center;
                gap: 14px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(0, 229, 255, 0.3);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                font-family: 'Inter', system-ui, sans-serif;
                transition: transform 0.25s ease, opacity 0.25s ease;
                animation: adrDockAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes adrDockAppear {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            #nst-timer-dock-global.dock-hidden { display: none !important; }
            .adr-dock-info { display: flex; flex-direction: column; gap: 2px; }
            .adr-dock-mode {
                font-family: 'Orbitron', monospace, sans-serif;
                font-size: 9px;
                font-weight: 800;
                color: #00e5ff;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .adr-dock-mode.work { color: #76ff03; }
            .adr-dock-mode.rest { color: #f59e0b; }
            .adr-dock-mode.done { color: #ef4444; }
            .adr-dock-time {
                font-family: 'Orbitron', monospace;
                font-size: 18px;
                font-weight: 900;
                color: #ffffff;
                line-height: 1;
                font-variant-numeric: tabular-nums;
            }
            .adr-dock-actions { display: flex; align-items: center; gap: 6px; }
            .adr-dock-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #fff;
                width: 32px;
                height: 32px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            .adr-dock-btn:hover {
                background: rgba(0, 229, 255, 0.2);
                border-color: #00e5ff;
                color: #00e5ff;
            }
            .adr-dock-btn.expand {
                background: linear-gradient(135deg, rgba(0, 229, 255, 0.25) 0%, rgba(118, 255, 3, 0.25) 100%);
                border-color: #00e5ff;
            }
            @media (max-width: 768px) {
                #nst-timer-dock-global {
                    bottom: 80px; /* Sopra la mobile bottom nav */
                    right: 12px;
                    left: 12px;
                    justify-content: space-between;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Iniezione elemento DOM
    function injectElement() {
        if (document.getElementById('nst-timer-dock-global')) return;
        const dock = document.createElement('div');
        dock.id = 'nst-timer-dock-global';
        dock.className = 'dock-hidden';
        dock.innerHTML = `
            <div class="adr-dock-info">
                <span class="adr-dock-mode" id="adr-dock-mode-label">
                    <span class="material-symbols-outlined" style="font-size: 14px;">timer</span>
                    <span id="adr-dock-mode-text">CRONOMETRO</span>
                </span>
                <span class="adr-dock-time" id="adr-dock-time-text">00:00.0</span>
            </div>
            <div class="adr-dock-actions">
                <button type="button" class="adr-dock-btn" id="adr-dock-toggle-btn" title="Avvia/Pausa">
                    <span class="material-symbols-outlined" style="font-size: 18px;" id="adr-dock-toggle-icon">play_arrow</span>
                </button>
                <button type="button" class="adr-dock-btn expand" id="adr-dock-expand-btn" title="Apri Timer Nestore">
                    <span class="material-symbols-outlined" style="font-size: 18px;">open_in_full</span>
                </button>
            </div>
        `;
        document.body.appendChild(dock);

        // Click handlers
        document.getElementById('adr-dock-toggle-btn').addEventListener('click', toggleActiveTimer);
        document.getElementById('adr-dock-expand-btn').addEventListener('click', () => {
            window.location.href = 'nestore.html#timer';
        });
    }

    // Toggle timer attivo da localStorage
    function toggleActiveTimer() {
        DockAudio.getCtx();
        const mode = localStorage.getItem('adr_timer_mode') || 'stopwatch';
        if (mode === 'stopwatch') {
            try {
                const raw = localStorage.getItem('adr_stopwatch_state');
                if (!raw) return;
                const state = JSON.parse(raw);
                if (state.running) {
                    const elapsed = (Date.now() - state.startTimestamp) + (state.elapsedBeforePause || 0);
                    state.elapsedBeforePause = elapsed;
                    state.running = false;
                    state.startTimestamp = null;
                } else {
                    state.running = true;
                    state.startTimestamp = Date.now();
                }
                localStorage.setItem('adr_stopwatch_state', JSON.stringify(state));
            } catch (e) {}
        } else {
            try {
                const raw = localStorage.getItem('adr_tabata_state');
                if (!raw) return;
                const state = JSON.parse(raw);
                if (state.running) {
                    const elapsed = (Date.now() - state.phaseStartTimestamp) + (state.phaseElapsedBeforePause || 0);
                    state.phaseElapsedBeforePause = elapsed;
                    state.running = false;
                    state.phaseStartTimestamp = null;
                } else {
                    state.running = true;
                    state.phaseStartTimestamp = Date.now();
                }
                localStorage.setItem('adr_tabata_state', JSON.stringify(state));
            } catch (e) {}
        }
    }

    // Formattatore tempo
    function formatTime(ms) {
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

    // Ciclo di aggiornamento
    function updateDock() {
        const dock = document.getElementById('nst-timer-dock-global');
        if (!dock) return;

        const mode = localStorage.getItem('adr_timer_mode') || 'stopwatch';
        let isVisible = false;

        if (mode === 'stopwatch') {
            try {
                const raw = localStorage.getItem('adr_stopwatch_state');
                if (raw) {
                    const state = JSON.parse(raw);
                    const elapsed = state.running && state.startTimestamp
                        ? (Date.now() - state.startTimestamp) + (state.elapsedBeforePause || 0)
                        : (state.elapsedBeforePause || 0);

                    // Auto-stop a 3 ore
                    if (state.running && elapsed >= MAX_STOPWATCH_MS) {
                        state.running = false;
                        state.startTimestamp = null;
                        state.elapsedBeforePause = 0;
                        localStorage.setItem('adr_stopwatch_state', JSON.stringify(state));
                        DockAudio.longBuzzer();
                    }

                    if (state.running || elapsed > 0) {
                        isVisible = true;
                        document.getElementById('adr-dock-mode-text').textContent = state.running ? 'CRONOMETRO' : 'CRONO IN PAUSA';
                        document.getElementById('adr-dock-time-text').textContent = formatTime(elapsed);
                        document.getElementById('adr-dock-mode-label').className = 'adr-dock-mode';
                        document.getElementById('adr-dock-toggle-icon').textContent = state.running ? 'pause' : 'play_arrow';
                    }
                }
            } catch (e) {}
        } else {
            try {
                const raw = localStorage.getItem('adr_tabata_state');
                if (raw) {
                    const state = JSON.parse(raw);
                    const elapsed = state.running && state.phaseStartTimestamp
                        ? (Date.now() - state.phaseStartTimestamp) + (state.phaseElapsedBeforePause || 0)
                        : (state.phaseElapsedBeforePause || 0);

                    const durationMs = (state.phaseDurationSec || 20) * 1000;
                    const remainingMs = Math.max(0, durationMs - elapsed);
                    const sec = Math.ceil(remainingMs / 1000);
                    const m = Math.floor(sec / 60);
                    const s = sec % 60;
                    const tenths = Math.floor((remainingMs % 1000) / 100);

                    if (state.running) {
                        // Beep acustico 3, 2, 1
                        if (sec <= 3 && sec > 0 && sec !== state.lastBeepSecond) {
                            DockAudio.countdownBeep();
                            state.lastBeepSecond = sec;
                            localStorage.setItem('adr_tabata_state', JSON.stringify(state));
                        }

                        // Fine fase Tabata
                        if (elapsed >= durationMs) {
                            state.phaseElapsedBeforePause = 0;
                            state.phaseStartTimestamp = Date.now();
                            state.lastBeepSecond = -1;

                            if (state.phase === 'prep') {
                                state.phase = 'work';
                                state.phaseDurationSec = state.config.work;
                                DockAudio.workBuzzer();
                            } else if (state.phase === 'work') {
                                if (state.currentRound < state.config.rounds) {
                                    state.phase = 'rest';
                                    state.phaseDurationSec = state.config.rest;
                                    DockAudio.restBuzzer();
                                } else {
                                    if (state.currentSet < state.config.sets) {
                                        state.currentSet++;
                                        state.currentRound = 1;
                                        state.phase = 'rest';
                                        state.phaseDurationSec = state.config.rest * 2;
                                        DockAudio.restBuzzer();
                                    } else {
                                        state.phase = 'done';
                                        state.running = false;
                                        state.phaseStartTimestamp = null;
                                        DockAudio.finishFanfare();
                                    }
                                }
                            } else if (state.phase === 'rest') {
                                state.currentRound++;
                                state.phase = 'work';
                                state.phaseDurationSec = state.config.work;
                                DockAudio.workBuzzer();
                            }
                            localStorage.setItem('adr_tabata_state', JSON.stringify(state));
                        }
                    }

                    if (state.running || (state.phase !== 'prep' && state.phase !== 'done')) {
                        isVisible = true;
                        document.getElementById('adr-dock-mode-text').textContent = `TABATA: ${state.phase.toUpperCase()} (R${state.currentRound}/${state.config?.rounds || 8})`;
                        document.getElementById('adr-dock-time-text').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
                        document.getElementById('adr-dock-mode-label').className = `adr-dock-mode ${state.phase}`;
                        document.getElementById('adr-dock-toggle-icon').textContent = state.running ? 'pause' : 'play_arrow';
                    }
                }
            } catch (e) {}
        }

        if (isVisible) {
            dock.classList.remove('dock-hidden');
        } else {
            dock.classList.add('dock-hidden');
        }
    }

    function init() {
        injectStyles();
        injectElement();
        updateDock();

        function loop() {
            updateDock();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);

        setInterval(updateDock, 300);
        window.addEventListener('storage', updateDock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
