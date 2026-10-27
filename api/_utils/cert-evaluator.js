/**
 * api/_utils/cert-evaluator.js
 * 
 * Modulo puro di valutazione deterministica e parsing date per certificati medici sportivi italiani.
 * Gestisce:
 * 1. Normalizzazione e parsing date formato italiano (GG/MM/AAAA e AAAA-MM-GG)
 * 2. Prevenzione confusione giorno-anno (es. giorno 23 non confuso con anno 2023)
 * 3. Valutazione idoneità sportiva (AGONISTICO / NON AGONISTICO vs LUDICO-MOTORIO)
 * 4. Calcolo scadenza annuale automatica (+1 anno da data rilascio se non specificata)
 * 5. Costruzione deterministica di stato ('VERDE' | 'GIALLO' | 'ROSSO') e note veritiere
 */

/**
 * Converte una data in formato ISO 'YYYY-MM-DD' o data italiana 'GG/MM/AAAA'
 * in formato visualizzabile 'GG/MM/AAAA'.
 */
export function formatToItalianDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return 'N/D';
    const cleaned = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
        const [y, m, d] = cleaned.split('-');
        return `${d}/${m}/${y}`;
    }
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(cleaned)) {
        return cleaned.replace(/-/g, '/');
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }
    return cleaned;
}

/**
 * Normalizza una data in formato ISO 'YYYY-MM-DD'.
 */
export function normalizeIsoDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const cleaned = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
    const mIt = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (mIt) {
        const d = String(parseInt(mIt[1], 10)).padStart(2, '0');
        const m = String(parseInt(mIt[2], 10)).padStart(2, '0');
        const y = mIt[3];
        return `${y}-${m}-${d}`;
    }
    return null;
}

/**
 * Valuta un certificato medico combinando i dati estratti dall'AI con guardrail deterministici.
 * 
 * @param {Object} params
 * @param {Object} params.aiResult - Output JSON di Mistral / Pixtral
 * @param {string} [params.declaredEmissionDate] - Data dichiarata dall'utente in fase di upload
 * @param {Date} [params.referenceDate] - Data odierna di riferimento (per unit testing)
 * @returns {Object} { finalStatus, finalNotes, finalRelease, finalExpiry, finalType, isLudicoMotorio, isExpired }
 */
export function evaluateMedicalCertificate({ aiResult = {}, declaredEmissionDate = null, referenceDate = null }) {
    const today = referenceDate ? new Date(referenceDate) : new Date();
    today.setHours(0, 0, 0, 0);

    let rawRelease = normalizeIsoDate(aiResult.data_emissione);
    let rawExpiry = normalizeIsoDate(aiResult.data_scadenza);
    const declaredIso = normalizeIsoDate(declaredEmissionDate);

    // Heuristica anti-confusione giorno/anno:
    // Se l'AI ha estratto un anno < 2025 (es. 2023-10-23) mentre l'utente ha dichiarato una data recente
    // e il giorno della data AI coincide con l'anno o viceversa (es. giorno 23 scambiato per 2023),
    // correggiamo usando la data dichiarata.
    if (declaredIso && rawRelease) {
        const aiYear = parseInt(rawRelease.split('-')[0], 10);
        const declYear = parseInt(declaredIso.split('-')[0], 10);
        if (aiYear < 2025 && declYear >= 2025) {
            const aiDay = rawRelease.split('-')[2];
            const aiYearSuffix = String(aiYear).slice(-2);
            if (aiDay === aiYearSuffix || aiDay === declaredIso.split('-')[2]) {
                rawRelease = declaredIso;
            }
        }
    } else if (declaredIso && !rawRelease) {
        rawRelease = declaredIso;
    }

    const finalRelease = rawRelease || today.toISOString().split('T')[0];

    // Calcolo scadenza: se non specificata, calcola esattamente +1 anno dalla data di rilascio
    let finalExpiry = rawExpiry;
    if (!finalExpiry && finalRelease) {
        const relDate = new Date(finalRelease);
        if (!isNaN(relDate.getTime())) {
            relDate.setFullYear(relDate.getFullYear() + 1);
            finalExpiry = relDate.toISOString().split('T')[0];
        }
    }

    const finalType = aiResult.agonistico ? 'AGONISTICO' : 'NON_AGONISTICO';

    // Rilevamento diciture idoneità sportiva vs ludico-motoria
    const rawNotes = String(aiResult.note || '').toLowerCase();
    const explicitSuitability = aiResult.diciture_idoneita_presenti === true;
    const explicitNoSuitability = aiResult.diciture_idoneita_presenti === false;

    const containsLudico = rawNotes.includes('ludico') || rawNotes.includes('ludica') || rawNotes.includes('amatorial');
    const containsAgonistico = rawNotes.includes('agonistic');

    const isLudicoMotorio = explicitNoSuitability || (containsLudico && !containsAgonistico && !explicitSuitability);

    // Rilevamento facsimile / specimen
    const isFacsimile = rawNotes.includes('facsimile') || 
                        rawNotes.includes('fac-simile') || 
                        rawNotes.includes('specimen') || 
                        rawNotes.includes('campione');

    // Verifica scadenza temporale
    let isExpired = false;
    if (finalExpiry) {
        const expDate = new Date(finalExpiry);
        expDate.setHours(0, 0, 0, 0);
        if (!isNaN(expDate.getTime()) && expDate < today) {
            isExpired = true;
        }
    }

    let finalStatus = 'GIALLO';
    let finalNotes = '';

    if (isFacsimile) {
        finalStatus = 'ROSSO';
        finalNotes = 'Certificato non valido: rilevata dicitura facsimile/copia.';
    } else if (isLudicoMotorio && isExpired) {
        // Entrambe le condizioni bloccanti presenti
        finalStatus = 'ROSSO';
        finalNotes = `Certificato non valido per il tesseramento sportivo (rilevata attività ludico-motoria, richiesta idoneità agonistica o non agonistica) e scaduto il ${formatToItalianDate(finalExpiry)}.`;
    } else if (isLudicoMotorio && !isExpired) {
        // Solo ludico motorio bloccante, certificato NON scaduto: MAI menzionare scadenze
        finalStatus = 'ROSSO';
        finalNotes = 'Certificato non valido per il tesseramento sportivo: rilevata attività ludico-motoria (è richiesta idoneità agonistica o non agonistica in corso di validità).';
    } else if (!isLudicoMotorio && isExpired) {
        // Idoneità presente ma certificato scaduto
        finalStatus = 'ROSSO';
        finalNotes = `Certificato medico scaduto il ${formatToItalianDate(finalExpiry)}.`;
    } else {
        // Idoneità presente e certificato in corso di validità
        if (aiResult.stato === 'ROSSO') {
            // Se l'AI aveva dato ROSSO solo per allucinazione di scadenza, bonifichiamo a VERDE o GIALLO
            finalStatus = aiResult.data_scadenza ? 'VERDE' : 'GIALLO';
            finalNotes = finalStatus === 'VERDE' 
                ? (finalType === 'AGONISTICO' ? 'Certificato agonistico in corso di validità.' : 'Certificato non agonistico in corso di validità.')
                : 'Certificato con idoneità sportiva: richiesta verifica manuale della data di scadenza.';
        } else if (aiResult.stato === 'VERDE') {
            finalStatus = 'VERDE';
            finalNotes = aiResult.note && !/scadut/i.test(aiResult.note) 
                ? aiResult.note 
                : (finalType === 'AGONISTICO' ? 'Certificato medico agonistico valido.' : 'Certificato medico non agonistico valido.');
        } else {
            finalStatus = 'GIALLO';
            finalNotes = aiResult.note || 'Certificato da sottoporre a revisione manuale del Direttivo.';
        }
    }

    return {
        finalStatus,
        finalNotes,
        finalRelease,
        finalExpiry,
        finalType,
        isLudicoMotorio,
        isExpired
    };
}
