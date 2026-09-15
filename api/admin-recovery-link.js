import { createClient } from '@supabase/supabase-js';

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
