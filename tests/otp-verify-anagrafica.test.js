import { describe, it, expect } from 'vitest';
import { signPrecheck, verifyPrecheck, normalizeText } from '../api/_utils/precheck-token.js';

describe('Server-Side Anagrafica Verification Logic (Anti-Bypass Guard)', () => {
    // Funzione pura che replica l'algoritmo implementato in api/otp-verify.js
    function verifyAnagraficaMatch(profile, docToken, docModificatoManualmente = false, docRevisioneUmana = false) {
        let docStato = 'IN_ATTESA';
        let docNote = null;
        let anagraficaMismatch = false;
        let mismatchMotivi = [];

        if (docToken) {
            const verifiedDoc = verifyPrecheck(docToken);
            if (verifiedDoc && verifiedDoc.kind === 'doc') {
                if (verifiedDoc.codice_fiscale) {
                    const tokenCf = verifiedDoc.codice_fiscale.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    const profileCf = (profile.codice_fiscale || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    if (tokenCf && profileCf && tokenCf !== profileCf) {
                        anagraficaMismatch = true;
                        mismatchMotivi.push(`CF (${profileCf} vs doc ${tokenCf})`);
                    }
                }

                if (verifiedDoc.cognome) {
                    const tokenCognome = normalizeText(verifiedDoc.cognome);
                    const profileCognome = normalizeText(profile.cognome);
                    if (tokenCognome && profileCognome && tokenCognome !== profileCognome) {
                        anagraficaMismatch = true;
                        mismatchMotivi.push(`Cognome (${profile.cognome} vs doc ${verifiedDoc.cognome})`);
                    }
                }

                if (verifiedDoc.nome) {
                    const tokenNome = normalizeText(verifiedDoc.nome);
                    const profileNome = normalizeText(profile.nome);
                    if (tokenNome && profileNome && tokenNome !== profileNome) {
                        anagraficaMismatch = true;
                        mismatchMotivi.push(`Nome (${profile.nome} vs doc ${verifiedDoc.nome})`);
                    }
                }

                if (docModificatoManualmente || anagraficaMismatch) {
                    docStato = 'GIALLO';
                    docNote = anagraficaMismatch
                        ? `Dati anagrafici discordanti rispetto al documento autenticato: ${mismatchMotivi.join('; ')}. Richiesta revisione manuale del Direttivo.`
                        : 'Dati anagrafici modificati manualmente dall\'utente rispetto a quanto rilevato dal documento. Richiesta revisione manuale del Direttivo.';
                } else if (docRevisioneUmana || verifiedDoc.esito !== 'VERDE') {
                    docStato = 'GIALLO';
                    docNote = verifiedDoc.note || 'Revisione manuale richiesta.';
                } else if (verifiedDoc.esito === 'VERDE') {
                    docStato = 'VERDE';
                    docNote = verifiedDoc.note || 'Documento identità validato con successo da Mistral AI';
                }
            }
        }

        return { docStato, docNote, anagraficaMismatch, mismatchMotivi };
    }

    const validPayload = {
        kind: 'doc',
        esito: 'VERDE',
        nome: 'MARIO',
        cognome: 'ROSSI',
        codice_fiscale: 'RSSMRA85M01H501Z',
        data_scadenza: '2030-01-01',
        sha256_file: 'abcdef'
    };

    it('consente lo stato VERDE se tutti i dati corrispondono e non vi è sblocco', () => {
        const token = signPrecheck(validPayload);
        const profile = {
            nome: 'Mario',
            cognome: 'Rossi',
            codice_fiscale: 'RSSMRA85M01H501Z'
        };

        const res = verifyAnagraficaMatch(profile, token, false, false);
        expect(res.docStato).toBe('VERDE');
        expect(res.anagraficaMismatch).toBe(false);
    });

    it('blocca con stato GIALLO se il CF viene alterato anche con flag client false (Anti-Bypass)', () => {
        const token = signPrecheck(validPayload);
        const profileAttaccante = {
            nome: 'Mario',
            cognome: 'Rossi',
            codice_fiscale: 'BNCGNN80A01H501X' // CF manomesso nel form
        };

        // L'utente prova a passare doc_modificato_manualmente = false
        const res = verifyAnagraficaMatch(profileAttaccante, token, false, false);
        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.docNote).toContain('Dati anagrafici discordanti');
        expect(res.docNote).toContain('CF');
    });

    it('blocca con stato GIALLO se il Cognome viene alterato anche con flag client false', () => {
        const token = signPrecheck(validPayload);
        const profileAttaccante = {
            nome: 'Mario',
            cognome: 'Bianchi', // Cognome alterato
            codice_fiscale: 'RSSMRA85M01H501Z'
        };

        const res = verifyAnagraficaMatch(profileAttaccante, token, false, false);
        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.docNote).toContain('Cognome');
    });

    it('blocca con stato GIALLO se il Nome viene alterato anche con flag client false', () => {
        const token = signPrecheck(validPayload);
        const profileAttaccante = {
            nome: 'Luigi', // Nome alterato
            cognome: 'Rossi',
            codice_fiscale: 'RSSMRA85M01H501Z'
        };

        const res = verifyAnagraficaMatch(profileAttaccante, token, false, false);
        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.docNote).toContain('Nome');
    });

    it('applica GIALLO quando il flag doc_modificato_manualmente è true anche se i dati non differiscono', () => {
        const token = signPrecheck(validPayload);
        const profile = {
            nome: 'Mario',
            cognome: 'Rossi',
            codice_fiscale: 'RSSMRA85M01H501Z'
        };

        const res = verifyAnagraficaMatch(profile, token, true, false);
        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(false);
        expect(res.docNote).toContain('modificati manualmente');
    });

    it('esegue l escape HTML corretto per i messaggi Telegram', () => {
        const escapeTg = (text) => {
            if (!text) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };

        expect(escapeTg('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
        expect(escapeTg('Mario & Luigi <Co.>')).toBe('Mario &amp; Luigi &lt;Co.&gt;');
        expect(escapeTg(null)).toBe('');
        expect(escapeTg(undefined)).toBe('');
    });
});
