import { createClient } from '@supabase/supabase-js';
import { sendTelegramAlert, escapeTelegramHtml } from './_utils/telegram-bot.js';

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

const BOARD_ROLES = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];

export async function handleNotifyRecoveryRequest(req, res, supabase) {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
        p_key: `recovery-notify:${clientIp}`,
        p_max_requests: 5,
        p_window_seconds: 300
    });
    if (allowed === false) {
        return res.status(429).json({ success: false, error: 'Troppe richieste. Riprova tra qualche minuto.' });
    }

    const rawEmail = req.body?.email;
    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.includes('@') || rawEmail.length > 254) {
        return res.status(200).json({ success: true, tracked: false });
    }
    const targetEmail = rawEmail.trim().toLowerCase();

    // Verifica censimento reale in public.utenti (anti-enumerazione e anti-spam bot)
    const { data: matchedUser, error: lookupError } = await supabase
        .from('utenti')
        .select('id, email, nome, cognome, cellulare, anagrafiche(id, nome, cognome, codice_fiscale, contatti(telefono))')
        .ilike('email', targetEmail)
        .limit(1)
        .maybeSingle();

    if (lookupError || !matchedUser) {
        return res.status(200).json({ success: true, tracked: false });
    }

    const { data: existingReq } = await supabase
        .from('richieste_recupero_password')
        .select('id, created_at')
        .ilike('email', targetEmail)
        .eq('stato', 'in_attesa')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const fifteenMinMs = 15 * 60 * 1000;
    const isRecentDuplicate = existingReq?.created_at && (Date.now() - new Date(existingReq.created_at).getTime() < fifteenMinMs);

    if (!existingReq) {
        await supabase.from('richieste_recupero_password').insert({
            email: targetEmail,
            ip_address: clientIp !== 'unknown' ? clientIp : null,
            stato: 'in_attesa'
        });
    } else if (!isRecentDuplicate) {
        await supabase.from('richieste_recupero_password')
            .update({
                ip_address: clientIp !== 'unknown' ? clientIp : null,
                created_at: new Date().toISOString()
            })
            .eq('id', existingReq.id);
    }

    if (!isRecentDuplicate) {
        const anag = Array.isArray(matchedUser.anagrafiche) ? matchedUser.anagrafiche[0] : matchedUser.anagrafiche;
        const nomeComp = `${matchedUser.nome || anag?.nome || ''} ${matchedUser.cognome || anag?.cognome || ''}`.trim() || 'N/D';
        const conObj = anag?.contatti ? (Array.isArray(anag.contatti) ? anag.contatti[0] : anag.contatti) : null;
        const telefono = matchedUser.cellulare || conObj?.telefono || 'N/D';
        const nowStr = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });

        const tgMsg = `🔑 <b>RICHIESTA RECUPERO PASSWORD</b>\n\n` +
            `👤 <b>Utente:</b> ${escapeTelegramHtml(nomeComp)}\n` +
            `✉️ <b>Email:</b> ${escapeTelegramHtml(targetEmail)}\n` +
            `📞 <b>Telefono:</b> ${escapeTelegramHtml(telefono)}\n` +
            `📅 <b>Data/Ora:</b> ${nowStr}\n\n` +
            `👉 <i>Card popolata in Registro Approvazioni → Richieste Recupero Password.</i>`;

        await sendTelegramAlert(tgMsg).catch(e => console.warn('[RECOVERY TELEGRAM]', e.message));
    }

    return res.status(200).json({ success: true, tracked: true });
}

export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Credentials', true);
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

    // --- Env ---
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Errore di configurazione del server (variabili mancanti).' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // --- 0. Azione pubblica rate-limited: Tracciamento & Notifica Telegram recupero password ---
        if (req.body?.action === 'notify_request') {
            return await handleNotifyRecoveryRequest(req, res, supabase);
        }

        // --- 1. Autenticazione Chiamante ---
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Autorizzazione mancante.' });
        }
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Sessione non valida o scaduta.' });
        }

        // --- 2. Verifica Ruolo Direttivo (Board) ---
        const { data: userProfile, error: profileError } = await supabase
            .from('utenti')
            .select('ruolo, nome, cognome')
            .eq('id', user.id)
            .single();

        if (profileError || !userProfile) {
            return res.status(403).json({ error: 'Profilo utente non trovato.' });
        }

        const userRoles = Array.isArray(userProfile.ruolo) ? userProfile.ruolo : [userProfile.ruolo];
        const isBoard = userRoles.some(r => BOARD_ROLES.includes(r));

        if (!isBoard) {
            return res.status(403).json({ error: 'Accesso negato: operazione riservata al Direttivo.' });
        }

        // --- 3. Parametri Richiesta ---
        const { email } = req.body || {};
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'Indirizzo email non valido.' });
        }
        const targetEmail = email.trim().toLowerCase();

        // --- 4. Generazione Link di Recupero con Service Role ---
        const resetRedirectUrl = 'https://portal.adrenalinaclub.it/portal/reset-password.html';
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: targetEmail,
            options: {
                redirectTo: resetRedirectUrl
            }
        });

        if (linkError || !linkData?.properties?.action_link) {
            console.error('[ADMIN RECOVERY] Errore generazione link:', linkError);
            return res.status(400).json({ 
                error: linkError?.message || 'Impossibile generare il link di recupero per questa email. Verifica che l\'utente sia registrato.' 
            });
        }

        const actionLink = linkData.properties.action_link;

        // Traccia opzionale nel registro audit se la tabella esiste
        try {
            await supabase.from('registro_audit_operazioni').insert({
                operatore_id: user.id,
                tipo_operazione: 'GENERA_LINK_RECUPERO_PASSWORD',
                dettagli: { email_target: targetEmail, operatore: `${userProfile.nome || ''} ${userProfile.cognome || ''}`.trim() }
            });
        } catch (auditErr) {
            // Non bloccare l'operazione se l'audit log fallisce
            console.warn('[ADMIN RECOVERY] Audit log non registrato:', auditErr.message);
        }

        return res.status(200).json({
            success: true,
            action_link: actionLink,
            email: targetEmail
        });

    } catch (err) {
        console.error('[ADMIN RECOVERY] Internal error:', err);
        return res.status(500).json({ error: 'Errore interno del server durante la generazione del link.' });
    }
}
