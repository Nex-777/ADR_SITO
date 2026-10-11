import { describe, it, expect } from 'vitest';
import { signPrecheck, verifyPrecheck, matchIntestatario, normalizeText, isValidCodiceFiscale } from '../api/_utils/precheck-token.js';

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

    it('firma e verifica un token di documento con dati anagrafici e di residenza estratti', () => {
        const payload = {
            kind: 'doc',
            esito: 'VERDE',
            tipo_documento: 'CARTA_IDENTITA',
            data_scadenza: '2030-05-15',
            nome: 'MARIO',
            cognome: 'ROSSI',
            codice_fiscale: 'RSSMRA85M01H501Z',
            indirizzo_residenza: 'Via Roma 10',
            comune_residenza: 'Roma',
            sha256_file: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000'
        };

        const token = signPrecheck(payload);
        const verified = verifyPrecheck(token);

        expect(verified).not.toBeNull();
        expect(verified.kind).toBe('doc');
        expect(verified.esito).toBe('VERDE');
        expect(verified.nome).toBe('MARIO');
        expect(verified.cognome).toBe('ROSSI');
        expect(verified.codice_fiscale).toBe('RSSMRA85M01H501Z');
        expect(verified.indirizzo_residenza).toBe('Via Roma 10');
        expect(verified.comune_residenza).toBe('Roma');
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

    it('valida formalmente i codici fiscali italiani con checksum', () => {
        expect(isValidCodiceFiscale('RSSMRA85M01H501Q')).toBe(true);
        expect(isValidCodiceFiscale('RCHSTV95A01F205A')).toBe(true);
        expect(isValidCodiceFiscale('RSSMRA85M01H501Z')).toBe(false); // Checksum errato
        expect(isValidCodiceFiscale('RSSMRA85M01H501')).toBe(false);  // Troppo corto (15 char)
        expect(isValidCodiceFiscale('RSSMRA85M01H501QQ')).toBe(false); // Troppo lungo (17 char)
        expect(isValidCodiceFiscale('1234567890123456')).toBe(false); // Solo numeri
        expect(isValidCodiceFiscale('')).toBe(false);
        expect(isValidCodiceFiscale(null)).toBe(false);
    });

    it('sanifica note e rileva diciture facsimile su documenti con scadenza futura', () => {
        // Funzione pura che replica la logica di guardrail deterministico di validate.js
        function evaluateDocGuardrail(aiResult, finalExpiry, today = new Date()) {
            let finalStatus = aiResult.stato || 'GIALLO';
            let finalNotes = aiResult.note || '';
            const expiryDate = new Date(finalExpiry);
            today.setHours(0, 0, 0, 0);

            if (expiryDate < today) {
                finalStatus = 'ROSSO';
                finalNotes = `Documento d'identità scaduto il ${finalExpiry}.`;
            } else {
                const rawLower = (finalNotes + ' ' + (aiResult.note || '')).toLowerCase();
                const isFacsimile = rawLower.includes('facsimile') || rawLower.includes('fac-simile') || rawLower.includes('specimen') || rawLower.includes('campione');
                if (isFacsimile) {
                    finalStatus = 'ROSSO';
                    finalNotes = 'Documento non valido: rilevata dicitura facsimile/copia.';
                } else if (finalStatus === 'ROSSO') {
                    finalNotes = 'Documento non conforme: rilevata anomalia nei dati o nel formato.';
                } else if (/scadut/i.test(finalNotes)) {
                    finalNotes = "Documento d'identità in corso di validità.";
                }
            }
            return { finalStatus, finalNotes };
        }

        // Caso 1: Data futura (2030-12-30) con allucinazione "scaduto" e facsimile
        const res1 = evaluateDocGuardrail({
            stato: 'ROSSO',
            note: 'Documento scaduto dal 30/12/2030. Rilevata scritta Facsimile sullo sfondo.'
        }, '2030-12-30', new Date('2026-10-11'));
        expect(res1.finalStatus).toBe('ROSSO');
        expect(res1.finalNotes).toBe('Documento non valido: rilevata dicitura facsimile/copia.');

        // Caso 2: Data futura (2030-12-30) con allucinazione "scaduto" senza facsimile
        const res2 = evaluateDocGuardrail({
            stato: 'ROSSO',
            note: 'Documento scaduto dal 30/12/2030 (oggi è 2026-10-11).'
        }, '2030-12-30', new Date('2026-10-11'));
        expect(res2.finalStatus).toBe('ROSSO');
        expect(res2.finalNotes).toBe('Documento non conforme: rilevata anomalia nei dati o nel formato.');

        // Caso 3: Data realmente passata (2020-01-01)
        const res3 = evaluateDocGuardrail({
            stato: 'VERDE',
            note: 'Documento originale e chiaro.'
        }, '2020-01-01', new Date('2026-10-11'));
        expect(res3.finalStatus).toBe('ROSSO');
        expect(res3.finalNotes).toBe("Documento d'identità scaduto il 2020-01-01.");

        // Caso 4: Data futura regolare con parole spurie "scaduto" ma stato VERDE
        const res4 = evaluateDocGuardrail({
            stato: 'VERDE',
            note: 'Il documento non è ancora scaduto e scadrà nel 2030.'
        }, '2030-12-30', new Date('2026-10-11'));
        expect(res4.finalStatus).toBe('VERDE');
        expect(res4.finalNotes).toBe("Documento d'identità in corso di validità.");
    });

    it('formatta correttamente i tentativi di sostituzione al singolare e al plurale', () => {
        function formatRetryLabels(retries) {
            const retriesLabel = retries === 1 
                ? 'Tentativo di sostituzione rimasto: 1' 
                : `Tentativi di sostituzione rimasti: ${retries}`;
            const buttonLabel = retries === 1 
                ? 'SOSTITUISCI FILE (1 TENTATIVO RIMASTO)' 
                : `SOSTITUISCI FILE (${retries} TENTATIVI RIMASTI)`;
            return { retriesLabel, buttonLabel };
        }

        expect(formatRetryLabels(2).retriesLabel).toBe('Tentativi di sostituzione rimasti: 2');
        expect(formatRetryLabels(2).buttonLabel).toBe('SOSTITUISCI FILE (2 TENTATIVI RIMASTI)');
        expect(formatRetryLabels(1).retriesLabel).toBe('Tentativo di sostituzione rimasto: 1');
        expect(formatRetryLabels(1).buttonLabel).toBe('SOSTITUISCI FILE (1 TENTATIVO RIMASTO)');
    });
});

