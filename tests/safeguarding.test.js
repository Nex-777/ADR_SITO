import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as PDFLib from 'pdf-lib';

describe('Safeguarding Module (D.Lgs. 36/2021 & 39/2021)', () => {
    const rootDir = path.resolve(__dirname, '..');
    let docsApi;

    beforeAll(async () => {
        globalThis.PDFLib = PDFLib;
        const mod = await import('../portal/safeguarding-docs.js');
        docsApi = mod.default || globalThis.SafeguardingDocs;
    });

    it('interpola correttamente nome, email e dati delibera nelle 3 bozze legali', () => {
        const nomina = {
            nome_responsabile: 'Elena',
            cognome_responsabile: 'Verdi',
            email_contatto: 'elena.verdi.sg@example.org',
            numero_verbale: 'CD-07/2026',
            data_nomina: '2026-11-17',
            data_scadenza: '2028-12-31',
            presidente_verbalizzante: 'Marco Bianchi',
            segretario_verbalizzante: 'Luca Neri'
        };

        const mocas = docsApi.getDefaultDraft('mocas', nomina);
        const codice = docsApi.getDefaultDraft('codice', nomina);
        const verbale = docsApi.getDefaultDraft('verbale', nomina);

        expect(mocas).toContain('Elena Verdi');
        expect(mocas).toContain('elena.verdi.sg@example.org');
        expect(mocas).toContain('CD-07/2026');
        expect(mocas).toContain('17/11/2026');
        expect(mocas).toContain('ASD ADRENALINA CLUB APS');

        expect(codice).toContain('Elena Verdi');
        expect(codice).toContain('elena.verdi.sg@example.org');

        expect(verbale).toContain('Marco Bianchi');
        expect(verbale).toContain('Luca Neri');
        expect(verbale).toContain('Elena Verdi');
        expect(verbale).toContain('31/12/2028');
    });

    it('genera PDF A4 validi client-side per MOCAS, Codice di Condotta e Verbale anche con caratteri speciali', async () => {
        const nomina = {
            nome_responsabile: 'Giulia',
            cognome_responsabile: 'Conti',
            email_contatto: 'safeguarding.conti@example.com',
            numero_verbale: 'CD-08/2026',
            data_nomina: '2026-11-17',
            testo_mocas_custom: 'ART. 1 - PROVA TESTO “SPECIALE” € 100 — con emoji 🛡️ e freccia → ok'
        };

        for (const docType of ['mocas', 'codice', 'verbale']) {
            const bytes = await docsApi.generateSafeguardingPdfBytes(docType, nomina);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBeGreaterThan(1000);
            const header = Buffer.from(bytes.slice(0, 5)).toString('ascii');
            expect(header).toBe('%PDF-');
        }
    });

    it('offusca e decodifica correttamente l\'email del Responsabile senza esporla in chiaro', () => {
        const rawEmail = 'safeguarding.officer@example.it';
        const encoded = docsApi.encodeEmailPayload(rawEmail);

        expect(encoded).not.toBe('');
        expect(encoded).not.toContain('@');
        expect(encoded).not.toContain('safeguarding');
        expect(docsApi.decodeEmailPayload(encoded)).toBe(rawEmail);

        const masked = docsApi.maskEmailForDisplay(rawEmail);
        expect(masked).not.toContain(rawEmail);
        expect(masked).toContain('[at]');

        const mailto = docsApi.buildMailtoHref(rawEmail, 'Mario Rossi');
        expect(mailto.startsWith('mailto:' + rawEmail + '?subject=')).toBe(true);
    });

    it('garantisce architettura stateless, assenza di form interni e sicurezza SRI su safeguarding.html', () => {
        const html = fs.readFileSync(path.join(rootDir, 'safeguarding.html'), 'utf8');
        const publicJs = fs.readFileSync(path.join(rootDir, 'portal', 'safeguarding-public.js'), 'utf8');
        const vercelJson = fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8');

        // Nessun form interno e nessun mailto statico in HTML
        expect(html).not.toMatch(/<form\b/i);
        expect(html).not.toMatch(/href=["']mailto:/i);

        // Presenza di SRI sui CDN scripts (SECURITY.md § 4.5)
        expect(html).toMatch(/@supabase\/supabase-js@2\.43\.4[\s\S]*?integrity="sha384-/);
        expect(html).toMatch(/pdf-lib@1\.17\.1[\s\S]*?integrity="sha384-/);

        // Nessun invio segnalazioni verso /api/* o getPublicUrl o SELECT *
        expect(publicJs).not.toMatch(/\/api\//);
        expect(publicJs).not.toContain('getPublicUrl');
        expect(publicJs).not.toContain("select('*')");

        // Rewrites su vercel.json
        expect(vercelJson).toContain('"/safeguarding"');
        expect(vercelJson).toContain('"/trasparenza"');
    });

    it('verifica i collegamenti di navigazione pubblici e il pannello presidenza in dashboard', () => {
        const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
        const legalHtml = fs.readFileSync(path.join(rootDir, 'legal.html'), 'utf8');
        const privacyHtml = fs.readFileSync(path.join(rootDir, 'privacy.html'), 'utf8');
        const cookieHtml = fs.readFileSync(path.join(rootDir, 'cookie-policy.html'), 'utf8');
        const loginHtml = fs.readFileSync(path.join(rootDir, 'portal', 'login.html'), 'utf8');
        const dashboardHtml = fs.readFileSync(path.join(rootDir, 'portal', 'dashboard.html'), 'utf8');
        const migrationSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migration_safeguarding_nomine.sql'), 'utf8');

        expect(indexHtml).toContain('href="safeguarding.html"');
        expect(legalHtml).toContain('href="safeguarding.html"');
        expect(privacyHtml).toContain('href="safeguarding.html"');
        expect(cookieHtml).toContain('href="safeguarding.html"');
        expect(loginHtml).toContain('href="../safeguarding.html"');

        expect(dashboardHtml).toContain('id="tab-btn-safeguarding"');
        expect(dashboardHtml).toContain('id="panel-safeguarding"');
        expect(dashboardHtml).toContain('safeguarding-docs.js');
        expect(dashboardHtml).toContain('dashboard-safeguarding.js');

        expect(migrationSql).toContain('ENABLE ROW LEVEL SECURITY');
        expect(migrationSql).toContain('USING (attivo = true)');
        expect(migrationSql).toContain('salva_nomina_safeguarding');
    });
});
