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

/**
 * Validazione formale dell'algoritmo del Codice Fiscale italiano (16 caratteri con carattere di controllo).
 */
export function isValidCodiceFiscale(cf) {
    if (!cf || typeof cf !== 'string') return false;
    cf = cf.toUpperCase().trim();
    if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) {
        return false;
    }
    const oddMap = {
        '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
        'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
        'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
        'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
    };
    const evenMap = {
        '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
        'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
        'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
        'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25
    };
    let sum = 0;
    for (let i = 0; i < 15; i++) {
        const char = cf[i];
        if (i % 2 === 0) {
            sum += oddMap[char];
        } else {
            sum += evenMap[char];
        }
    }
    const checkChar = String.fromCharCode(65 + (sum % 26));
    return checkChar === cf[15];
}

