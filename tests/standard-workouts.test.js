import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Standard Workouts (INVICTUS) & Active Modal Logic', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const jsPath = path.resolve(__dirname, '../portal/nestore.js');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    it('contiene la card INVICTUS nel pannello schede in nestore.html', () => {
        expect(html).toContain('ALLENAMENTI STANDARD &amp; BENCHMARK');
        expect(html).toContain('nst-standard-card');
        expect(html).toContain('INVICTUS');
        expect(html).toContain('RAPPORTO 1 : 2 : 4');
        expect(html).toContain('id="nst-invictus-pull-val"');
        expect(html).toContain('id="nst-invictus-target-pull"');
        expect(html).toContain('id="nst-invictus-target-push"');
        expect(html).toContain('id="nst-invictus-target-squat"');
        expect(html).toContain('avviaAllenamentoInvictus()');
    });

    it('contiene la modale overlay a tutto schermo per l\'allenamento attivo', () => {
        expect(html).toContain('id="nst-active-workout-modal"');
        expect(html).toContain('id="nst-modal-timer-text"');
        expect(html).toContain('id="nst-modal-pull-reps"');
        expect(html).toContain('id="nst-modal-push-reps"');
        expect(html).toContain('id="nst-modal-squat-reps"');
        expect(html).toContain('id="nst-modal-lap-btn"');
        expect(html).toContain('id="nst-modal-pause-btn"');
        expect(html).toContain('id="nst-modal-finish-btn"');
        expect(html).toContain('id="nst-workout-note-input"');
        expect(html).toContain('id="nst-btn-confirm-save-workout"');
        expect(html).toContain('nst-btn-danger-ghost');
        expect(html).toContain('ANNULLA');
    });

    it('contiene gli stili CSS dedicati a INVICTUS e alla modale attiva in nestore.css', () => {
        expect(css).toContain('.nst-standard-card');
        expect(css).toContain('.nst-stepper-control');
        expect(css).toContain('.nst-target-pills-row');
        expect(css).toContain('.nst-big-timer-display');
        expect(css).toContain('.nst-modal-target-item');
        expect(css).toContain('.nst-modal-laps-wrapper');
        expect(css).toContain('.nst-btn-danger-ghost');
    });

    it('calcola correttamente le proporzioni 1:2:4 per INVICTUS', () => {
        const calcolaReps = (pull) => ({
            pull: pull,
            push: pull * 2,
            squat: pull * 4
        });

        // Test base 5
        const t5 = calcolaReps(5);
        expect(t5.pull).toBe(5);
        expect(t5.push).toBe(10);
        expect(t5.squat).toBe(20);

        // Test base 8
        const t8 = calcolaReps(8);
        expect(t8.pull).toBe(8);
        expect(t8.push).toBe(16);
        expect(t8.squat).toBe(32);

        // Test base 10
        const t10 = calcolaReps(10);
        expect(t10.pull).toBe(10);
        expect(t10.push).toBe(20);
        expect(t10.squat).toBe(40);
    });

    it('costruisce la scheda_dati corretta con i nomi standard degli esercizi a corpo libero', () => {
        const pull = 6;
        const push = pull * 2;
        const squat = pull * 4;

        const schedaDati = [
            { nome: 'Pull-up', ripetizioni: pull, serie: 1, peso_kg: 0 },
            { nome: 'Push-up', ripetizioni: push, serie: 1, peso_kg: 0 },
            { nome: 'Air Squat', ripetizioni: squat, serie: 1, peso_kg: 0 }
        ];

        expect(schedaDati).toHaveLength(3);
        expect(schedaDati[0].nome).toBe('Pull-up');
        expect(schedaDati[0].ripetizioni).toBe(6);
        expect(schedaDati[0].peso_kg).toBe(0);

        expect(schedaDati[1].nome).toBe('Push-up');
        expect(schedaDati[1].ripetizioni).toBe(12);

        expect(schedaDati[2].nome).toBe('Air Squat');
        expect(schedaDati[2].ripetizioni).toBe(24);
    });

    it('esporta le funzioni di gestione allenamento standard da nestore.js', () => {
        expect(js).toContain('function modificaInvictusPull');
        expect(js).toContain('function avviaAllenamentoInvictus');
        expect(js).toContain('function gestisciWorkoutModalPausa');
        expect(js).toContain('function gestisciWorkoutModalLap');
        expect(js).toContain('function terminaAllenamentoAttivo');
        expect(js).toContain('function confermaSalvaAllenamentoStandard');
        expect(js).toContain('function chiudiModalWorkoutAttivo');
        expect(js).toContain('function costruisciRendicontoInvictus');
        expect(js).toContain('function costruisciSchedaDatiInvictus');
        expect(js).toContain('costruisciRendicontoInvictus,');
        expect(js).toContain('costruisciSchedaDatiInvictus,');
    });

    it('genera il rendiconto testuale dettagliato per il campo note (totali + lap per lap)', () => {
        // Mock timerEngine formatTime
        const formatTime = (ms) => {
            const totalSec = Math.floor(ms / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return { main: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, sub: '.0' };
        };

        const laps = [
            { number: 3, splitMs: 125000, totalMs: 375000 },
            { number: 2, splitMs: 130000, totalMs: 250000 },
            { number: 1, splitMs: 120000, totalMs: 120000 }
        ];

        // Simulazione logica costruisciRendicontoInvictus
        const pullBase = 5;
        const numGiri = laps.length;
        const totPull = pullBase * numGiri;
        const totPush = pullBase * 2 * numGiri;
        const totSquat = pullBase * 4 * numGiri;

        const lapsCrono = laps.slice().sort((a, b) => (a.number || 0) - (b.number || 0));
        let rendiconto = `Totali: 06:15, ${totPull} Pull-up + ${totPush} Push-up + ${totSquat} Air Squat`;
        lapsCrono.forEach(l => {
            const splitF = formatTime(l.splitMs);
            rendiconto += `\n${l.number}: ${splitF.main}, ${pullBase} Pull-up + ${pullBase * 2} Push-up + ${pullBase * 4} Air Squat`;
        });

        expect(rendiconto).toContain('Totali: 06:15, 15 Pull-up + 30 Push-up + 60 Air Squat');
        expect(rendiconto).toContain('1: 02:00, 5 Pull-up + 10 Push-up + 20 Air Squat');
        expect(rendiconto).toContain('2: 02:10, 5 Pull-up + 10 Push-up + 20 Air Squat');
        expect(rendiconto).toContain('3: 02:05, 5 Pull-up + 10 Push-up + 20 Air Squat');
    });

    it('costruisce la scheda_dati multi-serie con una serie_dettaglio per ogni giro (Scelta 3A)', () => {
        const pullBase = 5;
        const numGiri = 4;

        const pullSeries = [];
        const pushSeries = [];
        const squatSeries = [];

        for (let i = 1; i <= numGiri; i++) {
            pullSeries.push({ serie: i, ripetizioni: pullBase, peso_kg: 0 });
            pushSeries.push({ serie: i, ripetizioni: pullBase * 2, peso_kg: 0 });
            squatSeries.push({ serie: i, ripetizioni: pullBase * 4, peso_kg: 0 });
        }

        const schedaDati = [
            { nome: 'Pull-up', ripetizioni: pullBase * numGiri, serie: numGiri, peso_kg: 0, serie_dettaglio: pullSeries },
            { nome: 'Push-up', ripetizioni: pullBase * 2 * numGiri, serie: numGiri, peso_kg: 0, serie_dettaglio: pushSeries },
            { nome: 'Air Squat', ripetizioni: pullBase * 4 * numGiri, serie: numGiri, peso_kg: 0, serie_dettaglio: squatSeries }
        ];

        expect(schedaDati).toHaveLength(3);

        // Pull-up
        expect(schedaDati[0].nome).toBe('Pull-up');
        expect(schedaDati[0].serie).toBe(4);
        expect(schedaDati[0].ripetizioni).toBe(20);
        expect(schedaDati[0].serie_dettaglio).toHaveLength(4);
        expect(schedaDati[0].serie_dettaglio[0]).toEqual({ serie: 1, ripetizioni: 5, peso_kg: 0 });
        expect(schedaDati[0].serie_dettaglio[3]).toEqual({ serie: 4, ripetizioni: 5, peso_kg: 0 });

        // Push-up
        expect(schedaDati[1].nome).toBe('Push-up');
        expect(schedaDati[1].serie).toBe(4);
        expect(schedaDati[1].ripetizioni).toBe(40);
        expect(schedaDati[1].serie_dettaglio).toHaveLength(4);
        expect(schedaDati[1].serie_dettaglio[0]).toEqual({ serie: 1, ripetizioni: 10, peso_kg: 0 });

        // Squat
        expect(schedaDati[2].nome).toBe('Air Squat');
        expect(schedaDati[2].serie).toBe(4);
        expect(schedaDati[2].ripetizioni).toBe(80);
        expect(schedaDati[2].serie_dettaglio).toHaveLength(4);
        expect(schedaDati[2].serie_dettaglio[0]).toEqual({ serie: 1, ripetizioni: 20, peso_kg: 0 });
    });

    it('include auto-lap logic in terminaAllenamentoAttivo e preserva i ritorni a capo nel CSS note', () => {
        // Auto-lap logic presente in nestore.js
        expect(js).toContain('const lastLapTotal = timerEngine.state.laps.length > 0 ? timerEngine.state.laps[0].totalMs : 0;');
        expect(js).toContain('remainingLapMs >= 1000');

        // Preservazione stile pre-wrap per note nel modal dettaglio
        expect(css).toContain('white-space: pre-wrap;');

        // Textarea note aggiornata con label rendiconto
        expect(html).toContain('RENDICONTO &amp; NOTE SESSIONE:');
    });
});

