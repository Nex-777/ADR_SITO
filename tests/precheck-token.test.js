import { describe, it, expect } from 'vitest';
import { signPrecheck, verifyPrecheck, matchIntestatario, normalizeText } from '../api/_utils/precheck-token.js';

describe('Precheck Token & Validation Helper', () => {
    it('correttamente firma e verifica un token valido', () => {
        const payload = {
            kind: 'cert',
            esito: 'VERDE',
            tipologia: 'NON_AGONISTICO',
            data_emissione: '2026-10-01',
            data_scadenza: '2027-10-01',
            sha256_file: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
        };

        const token = signPrecheck(payload);
        expect(token).toBeTypeOf('string');
        expect(token.split('.').length).toBe(2);

        const verified = verifyPrecheck(token);
        expect(verified).not.toBeNull();
        expect(verified.kind).toBe('cert');
        expect(verified.esito).toBe('VERDE');
        expect(verified.tipologia).toBe('NON_AGONISTICO');
        expect(verified.sha256_file).toBe(payload.sha256_file);
    });

    it('rifiuta un token manomesso', () => {
        const payload = { kind: 'cert', esito: 'VERDE' };
        const token = signPrecheck(payload);
        const [payloadB64, hmac] = token.split('.');

        // Manomettiamo il payload decodificato/ricodificato
        const tamperedB64 = Buffer.from(JSON.stringify({ kind: 'cert', esito: 'VERDE', hacker: true })).toString('base64url');
        const tamperedToken = `${tamperedB64}.${hmac}`;

        expect(verifyPrecheck(tamperedToken)).toBeNull();
    });

    it('rifiuta un token scaduto', () => {
        const payload = {
            kind: 'cert',
            esito: 'VERDE',
            exp: Date.now() - 1000 // Scaduto un secondo fa
        };
        const token = signPrecheck(payload);
        expect(verifyPrecheck(token)).toBeNull();
    });

    it('imposta exp di default a 2 ore se non fornita', () => {
        const payload = { kind: 'doc', esito: 'VERDE' };
        const token = signPrecheck(payload);
        const verified = verifyPrecheck(token);
        expect(verified).not.toBeNull();
        expect(verified.exp).toBeGreaterThan(Date.now() + 7100 * 1000);
    });

    it('gestisce input non validi in verifyPrecheck in modo sicuro', () => {
        expect(verifyPrecheck(null)).toBeNull();
        expect(verifyPrecheck(undefined)).toBeNull();
        expect(verifyPrecheck('')).toBeNull();
        expect(verifyPrecheck('senzapunto')).toBeNull();
        expect(verifyPrecheck('troppi.punti.qui')).toBeNull();
        expect(verifyPrecheck('invalidb64.invalidhmac')).toBeNull();
    });

    it('effettua match robusto dell intestatario con accenti e maiuscole', () => {
        expect(matchIntestatario('Certificato per Mario Rossi rilasciato da Dott. Bianchi', 'Mario', 'Rossi')).toBe(true);
        expect(matchIntestatario('Si certifica che il sig. NICOLÒ D\'AMATO è idoneo', 'Nicolo', 'D Amato')).toBe(true);
        expect(matchIntestatario('Idoneità sportiva per GIOVANNI BATTISTA PIRAS', 'Giovanni', 'Piras')).toBe(true);
        expect(matchIntestatario('Rossi Mario', 'Mario', 'Rossi')).toBe(true); // Ordine inverso
        expect(matchIntestatario('Certificato rilasciato a Luigi Verdi', 'Mario', 'Rossi')).toBe(false);
        expect(matchIntestatario('', 'Mario', 'Rossi')).toBe(false);
        expect(matchIntestatario('Mario Bianchi', 'Mario', 'Rossi')).toBe(false);
        expect(matchIntestatario(null, 'Mario', 'Rossi')).toBe(false);
    });

    it('normalizza correttamente le stringhe', () => {
        expect(normalizeText('È un test con Accènti e Simboli #@!')).toBe('e un test con accenti e simboli');
    });
});
