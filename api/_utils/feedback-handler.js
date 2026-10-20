/**
 * api/_utils/feedback-handler.js
 * 
 * Gestore backend serverless per le segnalazioni e feedback utenti (Adrenalina Club).
 * Conforme alle regole di SECURITY.md:
 * - Autenticazione Bearer Token obbligatoria (Zero Trust)
 * - Dati anagrafici ricavati esclusivamente dal database utenti
 * - Validazione payload strict con Zod
 * - Rate limiting per IP/Utente (5 invii per 5 minuti)
 * - Notifica Telegram fail-open con supporto allegato JPEG compresso
 */

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { sendTelegramFeedbackAlert, escapeTelegramHtml } from './telegram-bot.js';

const ALLOWED_ORIGINS = [
    'https://adrenalinaclub.it',
    'https://www.adrenalinaclub.it',
    'https://portal.adrenalinaclub.it',
    'https://nex-777.github.io',
    'https://adr-sito.vercel.app',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
];

// Schema Zod per validazione input client
const feedbackSchema = z.object({
    category: z.enum(['SUGGERIMENTO', 'BUG']),
    title: z.string().trim().min(3, 'Il titolo deve contenere almeno 3 caratteri').max(160, 'Il titolo supera 160 caratteri'),
    message: z.string().trim().min(5, 'La descrizione deve contenere almeno 5 caratteri').max(4000, 'La descrizione supera 4000 caratteri'),
    page_url: z.string().trim().max(500).default(''),
    app_version: z.string().trim().max(32).default(''),
    diagnostic_data: z.object({
        browser: z.string().max(100).optional(),
        os: z.string().max(100).optional(),
        viewport: z.string().max(50).optional(),
        online: z.boolean().optional(),
        lang: z.string().max(20).optional(),
        errors: z.array(z.object({
            message: z.string().max(500),
            source: z.string().max(500).optional(),
            lineno: z.union([z.number(), z.string()]).optional(),
            colno: z.union([z.number(), z.string()]).optional(),
            time: z.string().max(30).optional()
        })).max(10).optional().default([])
    }).passthrough().optional().default({}),
    attachment_name: z.string().trim().max(120).nullable().optional(),
    attachment_base64: z.string().max(900000, 'Allegato troppo grande (max ~600KB base64)').nullable().optional()
});

// Cache in-memory per rate-limiting (sliding window 5 minuti)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function checkRateLimit(key) {
    const now = Date.now();
    const records = rateLimitMap.get(key) || [];
    const validRecords = records.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (validRecords.length >= MAX_REQUESTS_PER_WINDOW) {
        return false;
    }
    validRecords.push(now);
    rateLimitMap.set(key, validRecords);
    return true;
}

export async function handleFeedback(req, res) {
    // --- 1. CORS Headers ---
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // --- 2. Rate Limiting ---
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(`ip:${clientIp}`)) {
        return res.status(429).json({ error: 'Troppe richieste inviate. Attendi qualche minuto prima di riprovare.' });
    }

    // --- 3. Verifica Configurazione Server ---
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[FEEDBACK] Variabili Supabase mancanti sul server.');
        return res.status(500).json({ error: 'Errore interno di configurazione server.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // --- 4. Autenticazione Bearer Token (Zero Trust) ---
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Non autorizzato: token di autenticazione mancante.' });
        }
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Sessione non valida o scaduta.' });
        }

        const userId = user.id;

        // Rate limit anche su utente autenticato
        if (!checkRateLimit(`user:${userId}`)) {
            return res.status(429).json({ error: 'Troppe segnalazioni inviate di recente. Riprova tra 5 minuti.' });
        }

        // --- 5. Validazione Schema Zod ---
        const parseResult = feedbackSchema.safeParse(req.body);
        if (!parseResult.success) {
            const firstErr = parseResult.error.issues[0]?.message || 'Dati payload non validi';
            return res.status(400).json({ error: firstErr, details: parseResult.error.issues });
        }

        const validatedData = parseResult.data;

        // Se è presente un allegato in base64, convalida il MIME type immagine
        if (validatedData.attachment_base64) {
            if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(validatedData.attachment_base64)) {
                return res.status(400).json({ error: 'Formato allegato non valido: sono consentite solo immagini JPEG, PNG o WebP.' });
            }
        }

        // --- 6. Ricava Anagrafica Certificata dal Database (Mai fidarsi del client) ---
        const { data: utenteDb, error: utenteError } = await supabaseAdmin
            .from('utenti')
            .select('nome, cognome, email, ruolo')
            .eq('id', userId)
            .maybeSingle();

        if (utenteError) {
            console.warn('[FEEDBACK] Attenzione recupero profilo utente:', utenteError.message);
        }

        const nome = utenteDb?.nome || '';
        const cognome = utenteDb?.cognome || '';
        const userEmail = utenteDb?.email || user.email || 'anonimo@adrenalinaclub.it';
        const roleArray = utenteDb?.ruolo;
        const userRole = Array.isArray(roleArray) ? roleArray.join(', ') : (roleArray || 'socio');
        const companyName = nome || cognome 
            ? `Adrenalina Club ASD - ${nome} ${cognome}`.trim()
            : 'Adrenalina Club ASD';

        // --- 7. Inserimento nel Database (feedback_reports) ---
        const newReport = {
            client_id: userId,
            company_name: companyName,
            user_email: userEmail,
            user_role: userRole,
            category: validatedData.category,
            title: validatedData.title,
            message: validatedData.message,
            page_url: validatedData.page_url,
            app_version: validatedData.app_version,
            diagnostic_data: validatedData.diagnostic_data,
            attachment_name: validatedData.attachment_name || null,
            attachment_base64: validatedData.attachment_base64 || null,
            status: 'DA_LEGGERE',
            admin_notes: null
        };

        const { data: insertedReport, error: insertError } = await supabaseAdmin
            .from('feedback_reports')
            .insert(newReport)
            .select('id, created_at, status')
            .single();

        if (insertError) {
            console.error('[FEEDBACK] Errore inserimento report in DB:', insertError.message);
            return res.status(500).json({ error: 'Impossibile registrare la segnalazione nel database.' });
        }

        // --- 8. Notifica Telegram Istantanea (Fail-Open) ---
        try {
            const isBug = validatedData.category === 'BUG';
            const icon = isBug ? '🚨' : '💡';
            const catLabel = isBug ? 'SEGNALAZIONE ERRORE / BLOCCO TECNICO' : 'SUGGERIMENTO / NUOVA FUNZIONE';

            let tgMessage = `${icon} <b>${catLabel}</b>\n\n`;
            tgMessage += `<b>Titolo:</b> ${escapeTelegramHtml(validatedData.title)}\n`;
            tgMessage += `<b>Utente:</b> ${escapeTelegramHtml(companyName)} (<code>${escapeTelegramHtml(userEmail)}</code>)\n`;
            tgMessage += `<b>Ruolo:</b> <i>${escapeTelegramHtml(userRole)}</i>\n`;
            if (validatedData.page_url) {
                tgMessage += `<b>Route:</b> <code>${escapeTelegramHtml(validatedData.page_url)}</code>\n`;
            }
            if (validatedData.app_version) {
                tgMessage += `<b>Versione:</b> v${escapeTelegramHtml(validatedData.app_version)}\n`;
            }

            tgMessage += `\n<b>Messaggio:</b>\n${escapeTelegramHtml(validatedData.message)}\n`;

            const diag = validatedData.diagnostic_data || {};
            if (diag.browser || diag.os || diag.viewport) {
                tgMessage += `\n🖥️ <b>Ambiente:</b> ${escapeTelegramHtml(diag.browser || '-')} / ${escapeTelegramHtml(diag.os || '-')} (${escapeTelegramHtml(diag.viewport || '-')})\n`;
            }

            if (Array.isArray(diag.errors) && diag.errors.length > 0) {
                tgMessage += `\n⚠️ <b>Errori JS Runtime Intercettati (${diag.errors.length}):</b>\n`;
                diag.errors.slice(-3).forEach(err => {
                    const line = err.lineno ? `:${err.lineno}` : '';
                    const col = err.colno ? `:${err.colno}` : '';
                    tgMessage += `• <code>${escapeTelegramHtml(err.message)}</code> (${escapeTelegramHtml(err.source || 'inline')}${line}${col})\n`;
                });
            }

            // Invio asincrono a Telegram senza attendere bloccando o rischiando eccezioni
            sendTelegramFeedbackAlert({
                htmlText: tgMessage,
                base64Image: validatedData.attachment_base64,
                attachmentName: validatedData.attachment_name
            }).catch(tgErr => {
                console.warn('[FEEDBACK] Invio notifica Telegram fallito (fail-open):', tgErr.message);
            });
        } catch (tgNotifyErr) {
            console.warn('[FEEDBACK] Errore composizione Telegram (fail-open):', tgNotifyErr.message);
        }

        // Risposta positiva immediata al client
        return res.status(200).json({
            success: true,
            id: insertedReport.id,
            status: insertedReport.status,
            created_at: insertedReport.created_at,
            message: 'Segnalazione inviata con successo.'
        });

    } catch (err) {
        console.error('[FEEDBACK] Eccezione non gestita handler feedback:', err);
        return res.status(500).json({ error: 'Errore interno durante il salvataggio della segnalazione.' });
    }
}
