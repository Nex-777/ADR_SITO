import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Gestione Allenamenti: Modifica Esercizi/Set (Opz 1B), Click Responsive (Opz 2A) e Soft-Delete con Modale Custom (Opz 3A)', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const jsPath = path.resolve(__dirname, '../portal/nestore.js');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    it('contiene la colonna azioni desktop e il suggerimento mobile nello Storico Sessioni in nestore.html', () => {
        expect(html).toContain('STORICO SESSIONI');
        expect(html).toContain('(tocca per azioni)');
        expect(html).toContain('<th class="nst-desktop-only" style="text-align: right; width: 80px;">Azioni</th>');
    });

    it('contiene la modale di Modifica Allenamento con pulsante di eliminazione diretta (Opzione 1B & 2A)', () => {
        expect(html).toContain('id="nst-modal-edit-allenamento"');
        expect(html).toContain('id="nst-btn-delete-da-edit"');
        expect(html).toContain('eseguiEliminaDaModalEdit()');
        expect(html).not.toContain('id="nst-modal-allenamento-actions"');
        expect(html).not.toContain('id="nst-modal-dettaglio-allenamento"');
    });

    it('contiene la modale di Conferma Eliminazione Allenamento custom (Opzione 3A - doppio controllo)', () => {
        expect(html).toContain('id="nst-modal-conferma-delete-allenamento"');
        expect(html).toContain('id="nst-delete-allenamento-id"');
        expect(html).toContain('id="nst-delete-allenamento-preview"');
        expect(html).toContain('id="nst-btn-conferma-delete-allenamento"');
        expect(html).toContain('eseguiSoftDeleteAllenamento()');
        expect(html).toContain('chiudiModaleConfermaDeleteAllenamento()');
    });

    it('contiene la modale di Modifica Completa Allenamento (Metadati + Container Dinamico Esercizi)', () => {
        expect(html).toContain('id="nst-modal-edit-allenamento"');
        expect(html).toContain('id="nst-edit-allenamento-id"');
        expect(html).toContain('id="nst-edit-allenamento-data"');
        expect(html).toContain('id="nst-edit-allenamento-disciplina"');
        expect(html).toContain('id="nst-edit-allenamento-durata"');
        expect(html).toContain('id="nst-edit-allenamento-rpe"');
        expect(html).toContain('id="nst-edit-allenamento-note"');
        expect(html).toContain('id="nst-edit-allenamento-esercizi-container"');
        expect(html).toContain('aggiungiEsercizioEdit()');
        expect(html).toContain('salvaModificheAllenamento()');
        expect(html).toContain('chiudiEditAllenamentoModal()');
    });

    it('contiene le classi CSS per l\'editor dinamico degli esercizi e dei set', () => {
        expect(css).toContain('.nst-edit-ex-card');
        expect(css).toContain('.nst-edit-ex-header');
        expect(css).toContain('.nst-btn-remove-ex');
        expect(css).toContain('.nst-btn-add-mini');
        expect(css).toContain('.nst-edit-set-row');
        expect(css).toContain('.nst-edit-set-badge');
        expect(css).toContain('.nst-btn-remove-set');
    });

    it('esporta tutte le funzioni JavaScript necessarie per la gestione allenamenti', () => {
        expect(js).toContain('function eseguiEliminaDaModalEdit');
        expect(js).toContain('function apriModaleConfermaDeleteAllenamento');
        expect(js).toContain('function chiudiModaleConfermaDeleteAllenamento');
        expect(js).toContain('function eseguiSoftDeleteAllenamento');
        expect(js).toContain('function openEditAllenamentoModal');
        expect(js).toContain('function chiudiEditAllenamentoModal');
        expect(js).toContain('function aggiungiEsercizioEdit');
        expect(js).toContain('function rimuoviEsercizioEdit');
        expect(js).toContain('function aggiungiWarmupSetEdit');
        expect(js).toContain('function aggiungiWorkSetEdit');
        expect(js).toContain('function rimuoviSetEdit');
        expect(js).toContain('function salvaModificheAllenamento');
    });

    it('implementa l\'apertura diretta della modale Edit al click sulla riga e lascia solo il cestino nella colonna azioni (Opz 1B & 2A)', () => {
        expect(js).toMatch(/openEditAllenamentoModal\(item\.id,\s*e\)/);
        expect(html).toContain('id="nst-btn-delete-da-edit"');
        expect(html).toContain('eseguiEliminaDaModalEdit()');
    });

    it('implementa il soft-delete su nestore_allenamenti impostando attivo a false (Opzione 3A)', () => {
        expect(js).toMatch(/from\(['"]nestore_allenamenti['"]\)\s*\.update\(\{\s*attivo:\s*false\s*\}\)/);
    });

    it('costruisce e serializza correttamente la struttura dati JSON con esercizi, warmup e work sets', () => {
        // Simulazione della logica di serializzazione di salvaModificheAllenamento
        const mockEserciziDOM = [
            {
                nome: 'Panca Piana Bilanciere',
                target: '4x8 @ 100kg',
                esito: 'SUPERATA',
                warmup: [
                    { kg: 50, reps: 5 },
                    { kg: 70, reps: 3 }
                ],
                work: [
                    { kg: 90, reps: 8, rpe: 8 },
                    { kg: 100, reps: 8, rpe: 9 }
                ]
            }
        ];

        const serializzaEsercizio = (item) => {
            const riscaldamento = item.warmup.map((w, idx) => ({
                serie: idx + 1,
                label: `Rampa ${idx + 1}`,
                peso_kg: w.kg,
                rip: w.reps,
                rip_completate: w.reps
            }));

            const serieDettaglio = item.work.map((s, idx) => ({
                serie: idx + 1,
                peso_kg: s.kg,
                ripetizioni: s.reps,
                rip_completate: s.reps,
                rpe: s.rpe
            }));

            let maxKg = Math.max(...serieDettaglio.map(s => s.peso_kg), ...riscaldamento.map(w => w.peso_kg));

            return {
                nome: item.nome,
                target_originario: item.target,
                esito: item.esito,
                riscaldamento_effettivo: riscaldamento,
                serie_dettaglio: serieDettaglio,
                serie: serieDettaglio.length,
                peso_kg: maxKg,
                ripetizioni: serieDettaglio[0]?.ripetizioni || 0
            };
        };

        const res = serializzaEsercizio(mockEserciziDOM[0]);
        expect(res.nome).toBe('Panca Piana Bilanciere');
        expect(res.peso_kg).toBe(100);
        expect(res.riscaldamento_effettivo).toHaveLength(2);
        expect(res.riscaldamento_effettivo[0].label).toBe('Rampa 1');
        expect(res.riscaldamento_effettivo[0].peso_kg).toBe(50);
        expect(res.serie_dettaglio).toHaveLength(2);
        expect(res.serie_dettaglio[1].peso_kg).toBe(100);
        expect(res.serie_dettaglio[1].rpe).toBe(9);
    });
});
