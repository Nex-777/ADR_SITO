import { describe, it, expect } from 'vitest';
import {
    signPrecheck,
    verifyPrecheck,
    decodeCodiceFiscaleBirthData,
    evaluateDocumentAnagrafica,
    escapeTelegramHtml,
    getCatastaleLookup
} from '../api/_utils/precheck-token.js';

describe('Server-Side Anagrafica Verification Logic (Anti-Bypass Guard & Field Diffing)', () => {
    const validPayload = {
        kind: 'doc',
        esito: 'VERDE',
        nome: 'MARIO',
        cognome: 'ROSSI',
        codice_fiscale: 'RSSMRA85M01H501Z', // Nascita: 01/08/1985 a Roma (RM)
        data_scadenza: '2030-01-01',
        indirizzo_residenza: 'VIA DEI MILLE 12',
        comune_residenza: 'ROMA',
        sha256_file: 'abcdef123456'
    };

    const validProfile = {
        nome: 'Mario',
        cognome: 'Rossi',
        codice_fiscale: 'RSSMRA85M01H501Z',
        data_nascita: '1985-08-01',
        luogo_nascita_comune: 'Roma',
        luogo_nascita_provincia: 'RM',
        indirizzo: 'Via dei Mille 12',
        comune: 'Roma',
        provincia: 'RM',
        documento_identita_scadenza: '2030-01-01'
    };

    it('consente lo stato VERDE se tutti i dati corrispondono e non vi è sblocco manuale', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const res = evaluateDocumentAnagrafica(validProfile, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('VERDE');
        expect(res.anagraficaMismatch).toBe(false);
        expect(res.fieldDiffs.length).toBe(0);
        expect(res.docNote).toContain('validato con successo');
    });

    it('blocca con stato GIALLO se il CF viene alterato anche con flag client false (Anti-Bypass)', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileAttaccante = {
            ...validProfile,
            codice_fiscale: 'BNCGNN80A01H501X' // CF alterato
        };

        const res = evaluateDocumentAnagrafica(profileAttaccante, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Codice Fiscale: BNCGNN80A01H501X [doc: RSSMRA85M01H501Z]'))).toBe(true);
        expect(res.docNote).toContain('Dati anagrafici discordanti rispetto al documento autenticato');
    });

    it('blocca con stato GIALLO se il Cognome viene alterato anche con flag client false', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileAttaccante = {
            ...validProfile,
            cognome: 'Bianchi'
        };

        const res = evaluateDocumentAnagrafica(profileAttaccante, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Cognome: Bianchi [doc: ROSSI]'))).toBe(true);
    });

    it('blocca con stato GIALLO se il Nome viene alterato anche con flag client false', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileAttaccante = {
            ...validProfile,
            nome: 'Luigi'
        };

        const res = evaluateDocumentAnagrafica(profileAttaccante, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Nome: Luigi [doc: MARIO]'))).toBe(true);
    });

    it('blocca con stato GIALLO se la Data di Nascita viene alterata rispetto al documento (Anti-Bypass Tutore)', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileAttaccante = {
            ...validProfile,
            data_nascita: '2005-08-01' // Anno alterato rispetto al 1985
        };

        const res = evaluateDocumentAnagrafica(profileAttaccante, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Data di Nascita: 01/08/2005 [doc: 01/08/1985]'))).toBe(true);
    });

    it('blocca con stato GIALLO se il Luogo di Nascita viene alterato rispetto al documento', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileAttaccante = {
            ...validProfile,
            luogo_nascita_comune: 'Milano',
            luogo_nascita_provincia: 'MI'
        };

        const res = evaluateDocumentAnagrafica(profileAttaccante, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Luogo di Nascita: Milano (MI) [doc: Roma (RM)]'))).toBe(true);
    });

    it('blocca con stato GIALLO se la Scadenza del Documento viene alterata nel profilo', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileAttaccante = {
            ...validProfile,
            documento_identita_scadenza: '2035-12-31'
        };

        const res = evaluateDocumentAnagrafica(profileAttaccante, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Scadenza Documento: 31/12/2035 [doc: 01/01/2030]'))).toBe(true);
    });

    it('rispetta la regola "Residenza Libera Non Bloccante": modifica solo indirizzo/comune residenza con flag false mantiene VERDE', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        const profileNuovaResidenza = {
            ...validProfile,
            indirizzo: 'Via Garibaldi 45', // Residenza aggiornata
            comune: 'Pescara',
            provincia: 'PE'
        };

        const res = evaluateDocumentAnagrafica(profileNuovaResidenza, verifiedDoc, {
            docModificatoManualmente: false,
            docRevisioneUmana: false
        });

        // Non deve bloccare il tesserato
        expect(res.docStato).toBe('VERDE');
        expect(res.anagraficaMismatch).toBe(false);
        // Ma deve comunque tracciare la discrepanza per eventuale consultazione
        expect(res.fieldDiffs.some(d => d.includes('- Indirizzo Residenza: Via Garibaldi 45 [doc: VIA DEI MILLE 12]'))).toBe(true);
        expect(res.fieldDiffs.some(d => d.includes('- Comune Residenza: Pescara (PE) [doc: ROMA (RM)]'))).toBe(true);
    });

    it('gestisce lo sblocco manuale anagrafica con rilevamento modifiche ortografiche e apostrofi (caso Andrea D\'Isidoro)', () => {
        const payloadDisidoro = {
            ...validPayload,
            cognome: 'DISIDORO',
            nome: 'ANDREA',
            codice_fiscale: 'DSDNDR93P08I348X' // 08/09/1993 a San Salvo (CH)
        };
        const token = signPrecheck(payloadDisidoro);
        const verifiedDoc = verifyPrecheck(token);

        const profileDisidoro = {
            ...validProfile,
            cognome: "D'ISIDORO", // Modificato a mano per aggiungere l'apostrofo
            nome: 'ANDREA',
            codice_fiscale: 'DSDNDR93P08I348X',
            data_nascita: '1993-09-08',
            luogo_nascita_comune: "Sant'Omero",
            luogo_nascita_provincia: 'TE',
            indirizzo: 'Via Roma 10', // Ha aggiornato anche l'indirizzo
            comune: 'Pescara',
            provincia: 'PE'
        };

        const res = evaluateDocumentAnagrafica(profileDisidoro, verifiedDoc, {
            docModificatoManualmente: true,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(false); // Non è un mismatch fraudolento ma una modifica manuale tracciata
        expect(res.formattedDiffLines.some(d => d.includes("- Cognome: D'ISIDORO [doc: DISIDORO]"))).toBe(true);
        expect(res.formattedDiffLines.some(d => d.includes("- Indirizzo Residenza: Via Roma 10 [doc: VIA DEI MILLE 12]"))).toBe(true);
        expect(res.docNote).toContain("Dati anagrafici modificati manualmente dall'utente rispetto al documento:");
        expect(res.docNote).toContain("- Cognome: D'ISIDORO [doc: DISIDORO]");
    });

    it('gestisce lo sblocco manuale senza alcuna variazione effettiva apportata dall\'utente', () => {
        const token = signPrecheck(validPayload);
        const verifiedDoc = verifyPrecheck(token);

        // L'utente ha premuto "Sblocca a mano" ma non ha modificato nulla
        const res = evaluateDocumentAnagrafica(validProfile, verifiedDoc, {
            docModificatoManualmente: true,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.anagraficaMismatch).toBe(false);
        expect(res.formattedDiffLines).toEqual(['(nessun campo variato rispetto ai dati estratti dal documento)']);
        expect(res.docNote).toContain('(nessun campo variato rispetto ai dati estratti dal documento)');
    });

    it('gestisce campi core compilati manualmente quando il documento non li conteneva (es. OCR parziale)', () => {
        const payloadSenzaScadenza = {
            ...validPayload,
            data_scadenza: null
        };
        const token = signPrecheck(payloadSenzaScadenza);
        const verifiedDoc = verifyPrecheck(token);

        const res = evaluateDocumentAnagrafica(validProfile, verifiedDoc, {
            docModificatoManualmente: true,
            docRevisioneUmana: false
        });

        expect(res.docStato).toBe('GIALLO');
        expect(res.formattedDiffLines.some(d => d.includes('- Scadenza Documento: 01/01/2030 [doc: non rilevato]'))).toBe(true);
    });

    describe('decodeCodiceFiscaleBirthData', () => {
        it('decodifica correttamente data e luogo di nascita da CF maschile', () => {
            const data = decodeCodiceFiscaleBirthData('RSSMRA85M01H501Z');
            expect(data.dataNascita).toBe('1985-08-01');
            expect(data.sesso).toBe('M');
            expect(data.comuneNascita).toBe('Roma');
            expect(data.provinciaNascita).toBe('RM');
        });

        it('decodifica correttamente data da CF femminile (sottrazione 40)', () => {
            // Nascita 15/05/1990 (+40 = 55) a Milano (F205)
            const data = decodeCodiceFiscaleBirthData('BNCFNC90E55F205K');
            expect(data.dataNascita).toBe('1990-05-15');
            expect(data.sesso).toBe('F');
            expect(data.comuneNascita).toBe('Milano');
            expect(data.provinciaNascita).toBe('MI');
        });

        it('gestisce i caratteri omocodici nel Codice Fiscale', () => {
            // In omocodia: 0 -> L, 1 -> M. Quindi 85M01 con omocodia (0->L, 1->M) = 85MLM (o 85ML1 / 85M0M)
            const dataL1 = decodeCodiceFiscaleBirthData('RSSMRA85ML1H501Z');
            expect(dataL1.dataNascita).toBe('1985-08-01');

            const dataLM = decodeCodiceFiscaleBirthData('RSSMRA85MLMH501Z');
            expect(dataLM.dataNascita).toBe('1985-08-01');
        });

        it('decodifica correttamente stati esteri (codice catastale Z)', () => {
            // Z100 = Albania
            const data = decodeCodiceFiscaleBirthData('ALBPLA90A01Z100X');
            expect(data.dataNascita).toBe('1990-01-01');
            expect(data.comuneNascita).toBe('ALBANIA');
            expect(data.provinciaNascita).toBe('EE');
        });
    });

    describe('escapeTelegramHtml', () => {
        it('esegue l\'escape HTML corretto dei caratteri speciali Telegram', () => {
            expect(escapeTelegramHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
            expect(escapeTelegramHtml('Mario & Luigi <Co.>')).toBe('Mario &amp; Luigi &lt;Co.&gt;');
            expect(escapeTelegramHtml(null)).toBe('');
            expect(escapeTelegramHtml(undefined)).toBe('');
            expect(escapeTelegramHtml(12345)).toBe('12345');
        });
    });
});
