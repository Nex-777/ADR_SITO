import crypto from 'crypto';

function getSigningKey() {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'adr-precheck-fallback-dev-secret';
    return crypto.createHash('sha256').update(`precheck:${secret}`).digest();
}

/**
 * Normalizza una stringa per confronti robusti (rimuove accenti, punteggiatura, spazi multipli e converte in minuscolo).
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Confronta l'intestatario estratto da Mistral con il nome e cognome dichiarati dall'utente.
 * Ritorna true se vi è corrispondenza attendibile.
 */
export function matchIntestatario(estratto, dichiaratoNome, dichiaratoCognome) {
    if (!estratto || typeof estratto !== 'string') return false;
    const normEstratto = normalizeText(estratto);
    const normNome = normalizeText(dichiaratoNome);
    const normCognome = normalizeText(dichiaratoCognome);

    if (!normEstratto || !normCognome) return false;

    // Controllo se il cognome è presente
    const cognomeMatch = normEstratto.includes(normCognome);
    
    // Se c'è anche il nome, verifichiamo la presenza di almeno una parola del nome
    const nomeWords = normNome.split(' ').filter(w => w.length > 1);
    const nomeMatch = nomeWords.length === 0 || nomeWords.some(word => normEstratto.includes(word));

    return cognomeMatch && nomeMatch;
}

/**
 * Firma digitalmente l'esito della pre-validazione con HMAC-SHA256.
 * Il token ha durata predefinita di 2 ore.
 */
export function signPrecheck(data) {
    const key = getSigningKey();
    const exp = data.exp || (Date.now() + 2 * 60 * 60 * 1000); // 2 ore
    const payload = {
        ...data,
        exp,
        iat: Date.now()
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const hmac = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
    return `${payloadB64}.${hmac}`;
}

/**
 * Verifica la firma e la validità temporale del token di pre-validazione.
 * Restituisce il payload se integro e non scaduto, altrimenti null.
 */
export function verifyPrecheck(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, providedHmac] = parts;
    const key = getSigningKey();
    const expectedHmac = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');

    const expectedBuf = Buffer.from(expectedHmac);
    const providedBuf = Buffer.from(providedHmac);

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (!payload.exp || Date.now() > payload.exp) {
            return null; // Scaduto
        }
        return payload;
    } catch {
        return null;
    }
}
