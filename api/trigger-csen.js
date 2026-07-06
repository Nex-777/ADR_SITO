import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Credentials', true);
    const allowedOrigins = [
        'https://adrenalinaclub.it',
        'https://www.adrenalinaclub.it',
        'https://portal.adrenalinaclub.it',
        'https://nex-777.github.io',
        'https://adr-sito.vercel.app',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- Environment validation ---
    const githubToken = process.env.GITHUB_PAT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!githubToken) {
        console.error('trigger-csen: GITHUB_PAT_TOKEN mancante.');
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('trigger-csen: Configurazione Supabase mancante.');
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // --- Authentication: Bearer token ---
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Richiesta non autorizzata: token mancante.' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Token non valido o sessione scaduta.' });
        }

        // --- Authorization: only board members (presidente, vice_presidente, segretario) ---
        const { data: userProfile, error: profileError } = await supabase
            .from('utenti')
            .select('ruolo')
            .eq('id', user.id)
            .single();

        if (profileError || !userProfile) {
            return res.status(403).json({ error: 'Accesso negato.' });
        }

        const authorizedRoles = ['presidente', 'vice_presidente', 'segretario'];
        const userRoles = Array.isArray(userProfile.ruolo) ? userProfile.ruolo : [userProfile.ruolo];
        const isAuthorized = userRoles.some(r => authorizedRoles.includes(r));

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Accesso negato: operazione riservata a presidente, vice presidente e segretario.' });
        }

        // --- Rate limiting ---
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
        const { data: allowed } = await supabase.rpc('check_rate_limit', {
            p_key: `trigger-csen:${clientIp}`,
            p_max_requests: 3,
            p_window_seconds: 3600
        });
        if (allowed === false) {
            return res.status(429).json({ error: 'Troppe richieste. Riprova tra un\'ora.' });
        }

        // --- Trigger GitHub Actions workflow ---
        const response = await fetch('https://api.github.com/repos/Nex-777/ADR_SITO/actions/workflows/csen_sync.yml/dispatches', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ref: 'main'
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('GitHub API Error:', errorData);
            return res.status(502).json({ error: 'Impossibile avviare il workflow. Riprova più tardi.' });
        }

        console.log(`[CSEN] Workflow triggered by user ${user.id}`);
        return res.status(200).json({ success: true, message: 'Workflow CSEN avviato con successo.' });
    } catch (err) {
        console.error('Error triggering workflow:', err);
        return res.status(500).json({ error: 'Errore interno del server.' });
    }
}
