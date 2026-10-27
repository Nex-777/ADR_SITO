import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * Confronta due nomi/denominazioni verificando corrispondenza testuale standard o collassando gli spazi (es. DISIDORO vs D'ISIDORO, SANT'OMERO vs SANT OMERO).
 */
export function namesMatch(a, b) {
    if (!a || !b) return false;
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (na === nb) return true;
    return na.replace(/\s+/g, '') === nb.replace(/\s+/g, '');
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

/**
 * Esegue l'escape sicuro di caratteri HTML per notifiche Telegram.
 */
export function escapeTelegramHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

let cachedCatastaleLookup = null;

/**
 * Carica e indicizza in-memory i file catastali comunali e stati esteri.
 */
export function getCatastaleLookup() {
    if (cachedCatastaleLookup) return cachedCatastaleLookup;

    const byCatastale = new Map();
    const byComuneName = new Map();

    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const candidateBaseDirs = [
            process.cwd(),
            path.resolve(__dirname, '../..'),
            path.resolve(__dirname, '..'),
            __dirname
        ];

        let comuniPath = null;
        let statiPath = null;
        for (const base of candidateBaseDirs) {
            const pComuni = path.join(base, 'portal', 'comuni.json');
            const pStati = path.join(base, 'portal', 'stati.json');
            if (fs.existsSync(pComuni) && fs.existsSync(pStati)) {
                comuniPath = pComuni;
                statiPath = pStati;
                break;
            }
        }

        if (comuniPath && statiPath) {
            const comuni = JSON.parse(fs.readFileSync(comuniPath, 'utf8'));
            const stati = JSON.parse(fs.readFileSync(statiPath, 'utf8'));

            for (const c of comuni) {
                if (c.codiceCatastale) {
                    byCatastale.set(c.codiceCatastale.toUpperCase(), { nome: c.nome, sigla: c.sigla });
                }
                if (c.nome) {
                    byComuneName.set(normalizeText(c.nome), c.sigla);
                }
            }

            for (const s of stati) {
                if (s.codiceCatastale) {
                    byCatastale.set(s.codiceCatastale.toUpperCase(), { nome: s.nome, sigla: s.sigla || 'EE' });
                }
                if (s.nome) {
                    byComuneName.set(normalizeText(s.nome), s.sigla || 'EE');
                }
            }
        }
    } catch (err) {
        console.warn('[PRECHECK] Errore caricamento catastale in getCatastaleLookup:', err.message);
    }

    cachedCatastaleLookup = { byCatastale, byComuneName };
    return cachedCatastaleLookup;
}

/**
 * Decodifica la data e il luogo di nascita dal Codice Fiscale italiano (inclusa omocodia).
 */
export function decodeCodiceFiscaleBirthData(cf, lookup = null) {
    if (!cf || typeof cf !== 'string') return null;
    const cleanCf = cf.trim().toUpperCase();
    if (cleanCf.length !== 16) return null;

    const omoMap = { 'L': '0', 'M': '1', 'N': '2', 'P': '3', 'Q': '4', 'R': '5', 'S': '6', 'T': '7', 'U': '8', 'V': '9' };
    const toDigit = (c) => omoMap[c] !== undefined ? omoMap[c] : c;

    const yearStr = toDigit(cleanCf[6]) + toDigit(cleanCf[7]);
    const monthChar = cleanCf[8];
    const monthMap = {
        'A': '01', 'B': '02', 'C': '03', 'D': '04', 'E': '05', 'H': '06',
        'L': '07', 'M': '08', 'P': '09', 'R': '10', 'S': '11', 'T': '12'
    };
    const monthStr = monthMap[monthChar];
    if (!monthStr) return null;

    let dayNum = parseInt(toDigit(cleanCf[9]) + toDigit(cleanCf[10]), 10);
    if (isNaN(dayNum)) return null;

    let sesso = 'M';
    if (dayNum > 40) {
        dayNum -= 40;
        sesso = 'F';
    }
    const dayStr = String(dayNum).padStart(2, '0');

    const currentYear = new Date().getFullYear();
    const currentCentury = Math.floor(currentYear / 100) * 100;
    let fullYear = currentCentury + parseInt(yearStr, 10);
    if (fullYear > currentYear) {
        fullYear -= 100;
    }
    const dataNascita = `${fullYear}-${monthStr}-${dayStr}`;

    const codiceCatastale = cleanCf[11] + toDigit(cleanCf[12]) + toDigit(cleanCf[13]) + toDigit(cleanCf[14]);

    const resolvedLookup = lookup || getCatastaleLookup();
    const place = resolvedLookup?.byCatastale?.get(codiceCatastale.toUpperCase());

    return {
        dataNascita,
        sesso,
        codiceCatastale,
        comuneNascita: place?.nome || null,
        provinciaNascita: place?.sigla || (codiceCatastale.startsWith('Z') ? 'EE' : null)
    };
}

function formatItalianDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
    const parts = clean.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return clean;
}

function cleanIsoDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
}

function normFormal(s) {
    if (s === null || s === undefined) return '';
    return String(s).trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizeAddress(addr) {
    if (!addr || typeof addr !== 'string') return '';
    return addr
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Valuta la corrispondenza dei dati anagrafici del profilo rispetto al doc_token autenticato.
 * Ritorna stato validazione, note strutturate e lista diff prima/dopo per gli 8 campi monitorati.
 */
export function evaluateDocumentAnagrafica(profile, verifiedDoc, options = {}) {
    const {
        docModificatoManualmente = false,
        docRevisioneUmana = false,
        catastaleLookup = null
    } = options;

    const lookup = catastaleLookup || getCatastaleLookup();
    let anagraficaMismatch = false;
    const coreMismatchMotivi = [];
    const fieldDiffs = [];

    if (!verifiedDoc || verifiedDoc.kind !== 'doc') {
        const docStato = docModificatoManualmente ? 'GIALLO' : 'IN_ATTESA';
        const docNote = docModificatoManualmente
            ? 'Dati anagrafici modificati manualmente dall\'utente. Richiesta revisione manuale del Direttivo.'
            : null;
        return {
            docStato,
            docNote,
            anagraficaMismatch: false,
            fieldDiffs: [],
            formattedDiffLines: [],
            coreMismatchMotivi: []
        };
    }

    const docCf = (verifiedDoc.codice_fiscale || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const cfBirthData = docCf.length === 16 ? decodeCodiceFiscaleBirthData(docCf, lookup) : null;

    // 1. Nome
    const profNome = (profile?.nome || '').trim();
    const docNome = (verifiedDoc?.nome || '').trim();
    if (docNome) {
        if (profNome && !namesMatch(profNome, docNome)) {
            anagraficaMismatch = true;
            coreMismatchMotivi.push(`Nome (${profNome} vs doc ${docNome})`);
            fieldDiffs.push(`- Nome: ${profNome} [doc: ${docNome}]`);
        } else if (docModificatoManualmente && normFormal(profNome) !== normFormal(docNome)) {
            fieldDiffs.push(`- Nome: ${profNome} [doc: ${docNome}]`);
        }
    } else if (docModificatoManualmente && profNome) {
        fieldDiffs.push(`- Nome: ${profNome} [doc: non rilevato]`);
    }

    // 2. Cognome
    const profCognome = (profile?.cognome || '').trim();
    const docCognome = (verifiedDoc?.cognome || '').trim();
    if (docCognome) {
        if (profCognome && !namesMatch(profCognome, docCognome)) {
            anagraficaMismatch = true;
            coreMismatchMotivi.push(`Cognome (${profCognome} vs doc ${docCognome})`);
            fieldDiffs.push(`- Cognome: ${profCognome} [doc: ${docCognome}]`);
        } else if (docModificatoManualmente && normFormal(profCognome) !== normFormal(docCognome)) {
            fieldDiffs.push(`- Cognome: ${profCognome} [doc: ${docCognome}]`);
        }
    } else if (docModificatoManualmente && profCognome) {
        fieldDiffs.push(`- Cognome: ${profCognome} [doc: non rilevato]`);
    }

    // 3. Codice Fiscale
    const profCf = (profile?.codice_fiscale || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (docCf) {
        if (profCf && profCf !== docCf) {
            anagraficaMismatch = true;
            coreMismatchMotivi.push(`CF (${profCf} vs doc ${docCf})`);
            fieldDiffs.push(`- Codice Fiscale: ${profCf} [doc: ${docCf}]`);
        }
    } else if (docModificatoManualmente && profCf) {
        fieldDiffs.push(`- Codice Fiscale: ${profCf} [doc: non rilevato]`);
    }

    // 4. Data di Nascita
    const profBirth = cleanIsoDate(profile?.data_nascita);
    const docBirth = cfBirthData?.dataNascita || cleanIsoDate(verifiedDoc?.data_nascita);
    if (docBirth) {
        if (profBirth && profBirth !== docBirth) {
            anagraficaMismatch = true;
            coreMismatchMotivi.push(`Data Nascita (${formatItalianDate(profBirth)} vs doc ${formatItalianDate(docBirth)})`);
            fieldDiffs.push(`- Data di Nascita: ${formatItalianDate(profBirth)} [doc: ${formatItalianDate(docBirth)}]`);
        }
    } else if (docModificatoManualmente && profBirth) {
        fieldDiffs.push(`- Data di Nascita: ${formatItalianDate(profBirth)} [doc: non rilevato]`);
    }

    // 5. Luogo di Nascita (Comune / Provincia)
    const profComuneNas = (profile?.luogo_nascita_comune || '').trim();
    const profProvNas = (profile?.luogo_nascita_provincia || '').trim();
    const profPlaceStr = profProvNas ? `${profComuneNas} (${profProvNas})` : profComuneNas;

    const docComuneNas = cfBirthData?.comuneNascita || (verifiedDoc?.luogo_nascita || '').trim();
    const docProvNas = cfBirthData?.provinciaNascita || '';
    const docPlaceStr = docProvNas ? `${docComuneNas} (${docProvNas})` : docComuneNas;

    if (docComuneNas) {
        const comuneMismatch = profComuneNas && !namesMatch(profComuneNas, docComuneNas);
        const provMismatch = docProvNas && profProvNas && normalizeText(profProvNas) !== normalizeText(docProvNas);
        if (comuneMismatch || provMismatch) {
            anagraficaMismatch = true;
            coreMismatchMotivi.push(`Luogo Nascita (${profPlaceStr} vs doc ${docPlaceStr})`);
            fieldDiffs.push(`- Luogo di Nascita: ${profPlaceStr} [doc: ${docPlaceStr}]`);
        }
    } else if (docModificatoManualmente && profPlaceStr) {
        fieldDiffs.push(`- Luogo di Nascita: ${profPlaceStr} [doc: non rilevato]`);
    }

    // 6. Indirizzo Residenza (Non bloccante)
    const profInd = (profile?.indirizzo || '').trim();
    const docInd = (verifiedDoc?.indirizzo_residenza || '').trim();
    if (docInd && profInd) {
        if (normalizeAddress(profInd) !== normalizeAddress(docInd)) {
            fieldDiffs.push(`- Indirizzo Residenza: ${profInd} [doc: ${docInd}]`);
        }
    }

    // 7. Comune Residenza (Non bloccante)
    const profComuneRes = (profile?.comune || '').trim();
    const profProvRes = (profile?.provincia || '').trim();
    const profResStr = profProvRes ? `${profComuneRes} (${profProvRes})` : profComuneRes;

    const docComuneRes = (verifiedDoc?.comune_residenza || '').trim();
    if (docComuneRes && profComuneRes) {
        const docProvRes = lookup?.byComuneName?.get(normalizeText(docComuneRes)) || '';
        const docResStr = docProvRes ? `${docComuneRes} (${docProvRes})` : docComuneRes;
        const comuneDiff = normalizeText(profComuneRes) !== normalizeText(docComuneRes);
        const provDiff = docProvRes && profProvRes && normalizeText(profProvRes) !== normalizeText(docProvRes);
        if (comuneDiff || provDiff) {
            fieldDiffs.push(`- Comune Residenza: ${profResStr} [doc: ${docResStr}]`);
        }
    }

    // 8. Scadenza Documento
    const profScad = cleanIsoDate(profile?.documento_identita_scadenza);
    const docScad = cleanIsoDate(verifiedDoc?.data_scadenza);
    if (docScad && profScad) {
        if (profScad !== docScad) {
            anagraficaMismatch = true;
            coreMismatchMotivi.push(`Scadenza Doc (${formatItalianDate(profScad)} vs doc ${formatItalianDate(docScad)})`);
            fieldDiffs.push(`- Scadenza Documento: ${formatItalianDate(profScad)} [doc: ${formatItalianDate(docScad)}]`);
        }
    } else if (docModificatoManualmente && profScad && !docScad) {
        fieldDiffs.push(`- Scadenza Documento: ${formatItalianDate(profScad)} [doc: non rilevato]`);
    }

    const formattedDiffLines = fieldDiffs.length > 0
        ? fieldDiffs
        : (docModificatoManualmente ? ['(nessun campo variato rispetto ai dati estratti dal documento)'] : []);

    let docStato = 'IN_ATTESA';
    let docNote = null;

    if (anagraficaMismatch) {
        docStato = 'GIALLO';
        docNote = `Dati anagrafici discordanti rispetto al documento autenticato:\n${formattedDiffLines.join('\n')}\nRichiesta revisione manuale del Direttivo.`;
    } else if (docModificatoManualmente) {
        docStato = 'GIALLO';
        docNote = `Dati anagrafici modificati manualmente dall'utente rispetto al documento:\n${formattedDiffLines.join('\n')}\nRichiesta revisione manuale del Direttivo.`;
    } else if (docRevisioneUmana || verifiedDoc.esito !== 'VERDE') {
        docStato = 'GIALLO';
        const baseNote = verifiedDoc.note
            ? `Revisione manuale richiesta. Nota AI: ${verifiedDoc.note}`
            : 'Revisione manuale richiesta dall\'utente.';
        docNote = fieldDiffs.length > 0 ? `${baseNote}\nDifferenze rilevate:\n${fieldDiffs.join('\n')}` : baseNote;
    } else if (verifiedDoc.esito === 'VERDE') {
        docStato = 'VERDE';
        docNote = verifiedDoc.note || 'Documento identità validato con successo da Mistral AI';
    }

    return {
        docStato,
        docNote,
        anagraficaMismatch,
        fieldDiffs,
        formattedDiffLines,
        coreMismatchMotivi
    };
}


