import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Official Partners & Sponsors Integration', () => {
    const rootDir = path.resolve(__dirname, '..');
    const indexHtmlPath = path.join(rootDir, 'index.html');
    const dashboardHtmlPath = path.join(rootDir, 'portal', 'dashboard.html');
    const sponsorsDir = path.join(rootDir, 'assets', 'sponsors');

    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');

    it('verifies that all 3 sponsor logo assets exist and are non-empty', () => {
        const expectedFiles = [
            'agenzia-italia-2.png',
            'euro3-immobiliare.png',
            'z-new-progect.png'
        ];

        expectedFiles.forEach(file => {
            const filePath = path.join(sponsorsDir, file);
            expect(fs.existsSync(filePath), `File ${file} should exist in assets/sponsors`).toBe(true);
            const stats = fs.statSync(filePath);
            expect(stats.size, `File ${file} should not be empty`).toBeGreaterThan(1000);
        });
    });

    it('verifies the sponsors section in index.html', () => {
        expect(indexHtml).toContain('id="sponsors"');
        expect(indexHtml).toContain('href="#sponsors"');
        expect(indexHtml).toContain('OFFICIAL PARTNERS');
        
        // Sponsor 1: Agenzia Italia 2 Snc
        expect(indexHtml).toContain('AGENZIA ITALIA 2 S.N.C.');
        expect(indexHtml).toContain('01886680444');
        expect(indexHtml).toContain('assets/sponsors/agenzia-italia-2.png');
        expect(indexHtml).toContain('Viale Costantino Rozzi 13/F1');

        // Sponsor 2: Euro 3 Immobiliare
        expect(indexHtml).toContain('EURO 3 IMMOBILIARE S.A.S.');
        expect(indexHtml).toContain('02037950447');
        expect(indexHtml).toContain('assets/sponsors/euro3-immobiliare.png');
        expect(indexHtml).toContain('Corso Giuseppe Mazzini 108');

        // Sponsor 3: Z New Progect SRL
        expect(indexHtml).toContain('Z NEW PROGECT S.R.L.');
        expect(indexHtml).toContain('01955210438');
        expect(indexHtml).toContain('assets/sponsors/z-new-progect.png');
        expect(indexHtml).toContain('Via del Forno Vecchio 39/41');
    });

    it('verifies the sponsor block in member dashboard (portal/dashboard.html)', () => {
        expect(dashboardHtml).toContain('PARTNER UFFICIALI &amp; CONVENZIONI CLUB');
        expect(dashboardHtml).toContain('../assets/sponsors/agenzia-italia-2.png');
        expect(dashboardHtml).toContain('../assets/sponsors/euro3-immobiliare.png');
        expect(dashboardHtml).toContain('../assets/sponsors/z-new-progect.png');

        expect(dashboardHtml).toContain('AGENZIA ITALIA 2');
        expect(dashboardHtml).toContain('EURO 3 IMMOBILIARE');
        expect(dashboardHtml).toContain('Z NEW PROGECT');
    });

    it('verifies navigation links to sponsors in topbar and mobile nav of index.html', () => {
        expect(indexHtml).toMatch(/<a[^>]+href="#sponsors"[^>]*>Partners<\/a>/i);
        expect(indexHtml).toMatch(/<a[^>]+href="#sponsors"[^>]*>[\s\S]*?PARTNER[\s\S]*?<\/a>/i);
    });
});
