import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Legacy Certificates and Dossier Logic in dashboard.js', () => {
    const dashboardJsPath = path.resolve(__dirname, '../portal/dashboard.js');
    const dashboardJsContent = fs.readFileSync(dashboardJsPath, 'utf8');

    it('apriDossierTesserato queries registro_tesserati using anagrafica_id instead of utente_id', () => {
        expect(dashboardJsContent).toContain(".from('registro_tesserati')");
        expect(dashboardJsContent).toContain(".eq('anagrafica_id', ana.id)");
        expect(dashboardJsContent).not.toMatch(/\.from\('registro_tesserati'\)\s*\.select\('[^']*'\)\s*\.eq\('utente_id',\s*utente_id\)/);
    });

    it('apriDossierTesserato renders FILE NON DISPONIBILE (CARTACEO) badge when c.file_url === fittizio', () => {
        expect(dashboardJsContent).toContain("c.file_url === 'fittizio'");
        expect(dashboardJsContent).toContain("FILE NON DISPONIBILE (CARTACEO)");
    });

    it('loadUserCertificato sets prompt to upload digital cert when currentCert.file_url === fittizio', () => {
        expect(dashboardJsContent).toContain("Dato storico cartaceo: carica il file digitale del tuo certificato");
    });

    it('openSignedFile contains safeguard intercepting fittizio paths without throwing storage error', () => {
        expect(dashboardJsContent).toContain("filePath === 'fittizio'");
        expect(dashboardJsContent).toContain("File non disponibile (Dato cartaceo storico non ancora digitalizzato).");
    });
});
