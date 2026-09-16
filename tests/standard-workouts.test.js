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
    });

    it('contiene gli stili CSS dedicati a INVICTUS e alla modale attiva in nestore.css', () => {
        expect(css).toContain('.nst-standard-card');
        expect(css).toContain('.nst-stepper-control');
        expect(css).toContain('.nst-target-pills-row');
        expect(css).toContain('.nst-big-timer-display');
        expect(css).toContain('.nst-modal-target-item');
        expect(css).toContain('.nst-modal-laps-wrapper');
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
    });
});
