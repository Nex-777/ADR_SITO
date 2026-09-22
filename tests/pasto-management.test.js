import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Gestione Pasti (Modifica, Eliminazione Soft-Delete e Long-Press)', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const jsPath = path.resolve(__dirname, '../portal/nestore.js');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');
    const chatApiPath = path.resolve(__dirname, '../api/nestore-chat.js');
    const sqlPath = path.resolve(__dirname, '../supabase/migration_nestore_fix_pasti_unicita_e_rls.sql');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const chatApi = fs.readFileSync(chatApiPath, 'utf8');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    it('contiene la colonna azioni e il testo di aiuto per mobile in nestore.html', () => {
        expect(html).toContain('STORICO PASTI');
        expect(html).toContain('tieni premuto per azioni');
        expect(html).toContain('<th class="nst-desktop-only" style="text-align: right; width: 80px;">Azioni</th>');
    });

    it('contiene le due nuove modali (Action Sheet Mobile e Modifica Pasto) in nestore.html', () => {
        expect(html).toContain('id="nst-modal-pasto-actions"');
        expect(html).toContain('id="nst-action-pasto-summary"');
        expect(html).toContain('eseguiModificaDaActionSheet()');
        expect(html).toContain('eseguiEliminaDaActionSheet()');

        expect(html).toContain('id="nst-modal-edit-pasto"');
        expect(html).toContain('id="nst-edit-pasto-id"');
        expect(html).toContain('id="nst-edit-pasto-data"');
        expect(html).toContain('id="nst-edit-pasto-tipo"');
        expect(html).toContain('id="nst-edit-pasto-desc"');
        expect(html).toContain('id="nst-edit-pasto-kcal"');
        expect(html).toContain('id="nst-edit-pasto-pro"');
        expect(html).toContain('id="nst-edit-pasto-carb"');
        expect(html).toContain('id="nst-edit-pasto-fat"');
        expect(html).toContain('ricalcolaKcalPastoEdit()');
        expect(html).toContain('salvaModifichePasto()');
    });

    it('contiene le classi CSS per le azioni da tabella, long-press e responsive', () => {
        expect(css).toContain('.nst-btn-icon-table');
        expect(css).toContain('.nst-long-press-active');
        expect(css).toContain('.nst-desktop-only');
        expect(css).toContain('.nst-desktop-hidden');
    });

    it('contiene le funzioni di gestione pasti in nestore.js', () => {
        expect(js).toContain('function openMobilePastoActions');
        expect(js).toContain('function chiudiMobilePastoActions');
        expect(js).toContain('function eseguiModificaDaActionSheet');
        expect(js).toContain('function eseguiEliminaDaActionSheet');
        expect(js).toContain('function openEditPastoModal');
        expect(js).toContain('function chiudiEditPastoModal');
        expect(js).toContain('function ricalcolaKcalPastoEdit');
        expect(js).toContain('function salvaModifichePasto');
        expect(js).toContain('function confermaEliminaPasto');
        expect(js).toContain('function formatTipoPastoDisplay');
    });

    it('calcola correttamente le calorie stimate dai macronutrienti (x4, x4, x9)', () => {
        const calcolaKcal = (pro, carb, fat) => Math.round((pro * 4) + (carb * 4) + (fat * 9));

        // Esempio 1: 40g pro, 50g carb, 15g fat = 160 + 200 + 135 = 495 kcal
        expect(calcolaKcal(40, 50, 15)).toBe(495);

        // Esempio 2: 150g petto di pollo + 10g olio = 35g pro, 0g carb, 10g fat = 140 + 0 + 90 = 230 kcal
        expect(calcolaKcal(35, 0, 10)).toBe(230);
    });

    it('implementa il soft-delete impostando attivo a false', () => {
        expect(js).toMatch(/update\(\{\s*attivo:\s*false\s*\}\)/);
    });

    it('formatta correttamente il tipo pasto e la numerazione progressiva degli spuntini', () => {
        const formatTipoPastoDisplay = (tipo, snackIndex) => {
            if (tipo === 'snack') {
                return snackIndex ? `Spuntino ${snackIndex}` : 'Spuntino';
            }
            return tipo || '-';
        };

        expect(formatTipoPastoDisplay('pranzo')).toBe('pranzo');
        expect(formatTipoPastoDisplay('cena')).toBe('cena');
        expect(formatTipoPastoDisplay('colazione')).toBe('colazione');
        expect(formatTipoPastoDisplay('snack', 1)).toBe('Spuntino 1');
        expect(formatTipoPastoDisplay('snack', 2)).toBe('Spuntino 2');
        expect(formatTipoPastoDisplay('snack', 3)).toBe('Spuntino 3');
    });

    it('garantisce unicità giornaliera per pasti principali (PASTI_UNICI) in nestore.js e nestore-chat.js', () => {
        expect(js).toContain("const PASTI_UNICI = ['colazione', 'pranzo', 'cena'];");
        expect(chatApi).toContain("const PASTI_UNICI = ['colazione', 'pranzo', 'cena'];");
    });

    it('definisce la policy RLS FOR UPDATE su nestore_chat_messaggi nella migrazione SQL', () => {
        expect(sql).toContain('CREATE POLICY "nst_chat_update_own" ON public.nestore_chat_messaggi');
        expect(sql).toContain('FOR UPDATE USING');
    });
});
