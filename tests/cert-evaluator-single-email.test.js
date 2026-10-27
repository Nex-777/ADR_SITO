import { describe, it, expect, vi } from 'vitest';
import { 
    formatToItalianDate, 
    normalizeIsoDate, 
    evaluateMedicalCertificate 
} from '../api/_utils/cert-evaluator.js';

describe('Cert Evaluator & Date Formatting Tests', () => {
    it('normalizza date in formato italiano e ISO', () => {
        expect(formatToItalianDate('2026-10-23')).toBe('23/10/2026');
        expect(formatToItalianDate('23/10/2026')).toBe('23/10/2026');
        expect(formatToItalianDate('23-10-2026')).toBe('23/10/2026');
        expect(normalizeIsoDate('23/10/2026')).toBe('2026-10-23');
        expect(normalizeIsoDate('23-10-2026')).toBe('2026-10-23');
        expect(normalizeIsoDate('2026-10-23')).toBe('2026-10-23');
        expect(normalizeIsoDate('invalid')).toBeNull();
    });

    it('risolve il caso Daniele Sturba: corregge confusione giorno/anno e blocca per ludico-motoria SENZA allucinare scadenza passata', () => {
        const referenceDate = new Date('2026-10-27T10:00:00Z');
        
        // Mistral aveva confuso il giorno 23 con l'anno 2023
        const aiResult = {
            data_emissione: '2023-10-23',
            data_scadenza: null,
            agonistico: false,
            stato: 'ROSSO',
            note: 'Attività ludico-motoria non idonea.',
            diciture_idoneita_presenti: false,
            validita_annuale_indicata: true
        };

        const result = evaluateMedicalCertificate({
            aiResult,
            declaredEmissionDate: '2026-10-23',
            referenceDate
        });

        // 1. La data di rilascio viene sanata a 2026-10-23
        expect(result.finalRelease).toBe('2026-10-23');
        // 2. La scadenza annuale viene calcolata correttamente al 2027-10-23
        expect(result.finalExpiry).toBe('2027-10-23');
        // 3. Il certificato NON è scaduto
        expect(result.isExpired).toBe(false);
        // 4. Lo stato è ROSSO per la dicitura ludico-motoria
        expect(result.finalStatus).toBe('ROSSO');
        expect(result.isLudicoMotorio).toBe(true);
        // 5. La nota non contiene falsi riferimenti a scadenze passate
        expect(result.finalNotes).toContain('attività ludico-motoria');
        expect(result.finalNotes).not.toContain('scaduto');
    });

    it('blocca con dicitura di scadenza quando il certificato è realmente scaduto con idoneità sportiva', () => {
        const referenceDate = new Date('2026-10-27T10:00:00Z');
        const aiResult = {
            data_emissione: '2024-05-10',
            data_scadenza: '2025-05-10',
            agonistico: false,
            stato: 'VERDE',
            note: 'Certificato non agonistico leggibile.',
            diciture_idoneita_presenti: true
        };

        const result = evaluateMedicalCertificate({ aiResult, referenceDate });

        expect(result.finalStatus).toBe('ROSSO');
        expect(result.isExpired).toBe(true);
        expect(result.finalNotes).toBe('Certificato medico scaduto il 10/05/2025.');
    });

    it('riporta entrambe le motivazioni se il certificato è SIA ludico-motorio SIA scaduto', () => {
        const referenceDate = new Date('2026-10-27T10:00:00Z');
        const aiResult = {
            data_emissione: '2024-05-10',
            data_scadenza: '2025-05-10',
            agonistico: false,
            stato: 'ROSSO',
            note: 'Attività ludico-motoria.',
            diciture_idoneita_presenti: false
        };

        const result = evaluateMedicalCertificate({ aiResult, referenceDate });

        expect(result.finalStatus).toBe('ROSSO');
        expect(result.isLudicoMotorio).toBe(true);
        expect(result.isExpired).toBe(true);
        expect(result.finalNotes).toContain('attività ludico-motoria');
        expect(result.finalNotes).toContain('scaduto il 10/05/2025');
    });

    it('approva con VERDE un certificato con idoneità sportiva in corso di validità e calcola scadenza automatica +1 anno', () => {
        const referenceDate = new Date('2026-10-27T10:00:00Z');
        const aiResult = {
            data_emissione: '2026-10-15',
            data_scadenza: null,
            agonistico: true,
            stato: 'VERDE',
            note: 'Certificato agonistico conforme.',
            diciture_idoneita_presenti: true,
            validita_annuale_indicata: true
        };

        const result = evaluateMedicalCertificate({ aiResult, referenceDate });

        expect(result.finalStatus).toBe('VERDE');
        expect(result.finalRelease).toBe('2026-10-15');
        expect(result.finalExpiry).toBe('2027-10-15');
        expect(result.finalType).toBe('AGONISTICO');
        expect(result.isExpired).toBe(false);
    });

    it('blocca come ROSSO i facsimile o specimen', () => {
        const aiResult = {
            data_emissione: '2026-10-20',
            data_scadenza: '2027-10-20',
            agonistico: false,
            stato: 'VERDE',
            note: 'Immagine contrassegnata come FACSIMILE',
            diciture_idoneita_presenti: true
        };

        const result = evaluateMedicalCertificate({ aiResult });
        expect(result.finalStatus).toBe('ROSSO');
        expect(result.finalNotes).toContain('facsimile/copia');
    });
});

describe('Single-Email Notification Gate & Queue Exclusion Tests', () => {
    it('garantisce che le chiamate automatiche AI (!isManual) non inviino email all utente su rifiuto', () => {
        const mockSendEmail = vi.fn();
        const mockSendTelegram = vi.fn();

        const handleValidationResult = ({ isManual, status, email, adminNote }) => {
            if (isManual) {
                if (status === 'ROSSO') {
                    mockSendEmail({ to: email, motivo: adminNote });
                }
            } else {
                if (status === 'ROSSO' || status === 'GIALLO') {
                    mockSendTelegram({ status, note: adminNote });
                }
            }
        };

        // 1. Chiamata automatica AI:
        handleValidationResult({
            isManual: false,
            status: 'ROSSO',
            email: 'atleta@example.com',
            adminNote: 'Attività ludico-motoria'
        });

        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockSendTelegram).toHaveBeenCalledTimes(1);

        // 2. Chiamata manuale Direttivo:
        handleValidationResult({
            isManual: true,
            status: 'ROSSO',
            email: 'atleta@example.com',
            adminNote: 'Il certificato ludico motorio non è valido per il tesseramento sportivo.'
        });

        // 1 sola email ufficiale inviata con la nota verificata
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        expect(mockSendEmail).toHaveBeenCalledWith({
            to: 'atleta@example.com',
            motivo: 'Il certificato ludico motorio non è valido per il tesseramento sportivo.'
        });
    });

    it('esclude dalla coda di verifica i certificati già revisionati manualmente (revisionato_manualmente === true)', () => {
        const certsQueue = [
            { id: 'cert-1', anagrafica_id: 'anag-1', revisionato_manualmente: false, stato_validazione: 'GIALLO' },
            { id: 'cert-2', anagrafica_id: 'anag-2', revisionato_manualmente: true, stato_validazione: 'ROSSO' },
            { id: 'cert-3', anagrafica_id: 'anag-3', revisionato_manualmente: false, stato_validazione: 'IN_ATTESA' }
        ];

        const visibleInQueue = certsQueue.filter(c => c.revisionato_manualmente === false);
        expect(visibleInQueue.map(c => c.id)).toEqual(['cert-1', 'cert-3']);
        expect(visibleInQueue.some(c => c.id === 'cert-2')).toBe(false);
    });

    it('esclude dalla coda di verifica i candidati la cui iscrizione risulta RESPINTO (senza tesseramento attivo)', () => {
        const certs = [
            {
                id: 'cert-respinto',
                anagrafica_id: 'anag-respinto',
                anagrafiche: {
                    registro_approvazioni: [{ stato: 'RESPINTO' }],
                    registro_tesserati: []
                }
            },
            {
                id: 'cert-attivo',
                anagrafica_id: 'anag-attivo',
                anagrafiche: {
                    registro_approvazioni: [{ stato: 'IN_ATTESA' }],
                    registro_tesserati: [{ stato_tesseramento: 'IN_ELABORAZIONE' }]
                }
            }
        ];

        const filtered = certs.filter(cert => {
            const anag = cert.anagrafiche;
            const raList = Array.isArray(anag?.registro_approvazioni) ? anag.registro_approvazioni : [anag?.registro_approvazioni];
            const rtList = Array.isArray(anag?.registro_tesserati) ? anag.registro_tesserati : [anag?.registro_tesserati];
            const isSocioRespinto = raList.some(r => r?.stato === 'RESPINTO');
            const hasActiveTess = rtList.some(t => t?.stato_tesseramento === 'ATTIVO');
            if (isSocioRespinto && !hasActiveTess) return false;
            return true;
        });

        expect(filtered.map(c => c.id)).toEqual(['cert-attivo']);
    });
});
