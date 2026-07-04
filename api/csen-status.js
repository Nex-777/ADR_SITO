import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    const allowedOrigins = [
        'https://adrenalinaclub.it',
        'https://www.adrenalinaclub.it',
        'https://portal.adrenalinaclub.it',
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
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Auth: solo presidente/vice_presidente/segretario
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Token non valido' });
    }
    const { data: userProfile } = await supabase.from('utenti').select('ruolo').eq('id', user.id).single();
    const authorizedRoles = ['presidente', 'vice_presidente', 'segretario'];
    const userRoles = Array.isArray(userProfile?.ruolo) ? userProfile.ruolo : [userProfile?.ruolo];
    if (!userRoles.some(r => authorizedRoles.includes(r))) {
        return res.status(403).json({ error: 'Accesso negato' });
    }

    try {
        // 1. Contatori per stato CSEN
        const { data: statusCounts } = await supabase
            .from('registro_tesserati')
            .select('sync_csen_status')
            .in('stato_tesseramento', ['ATTIVO', 'SOSPESO']);

        const counts = { PENDING: 0, SYNCED: 0, ERROR: 0, SYNCED_NO_NUM: 0, other: 0 };
        (statusCounts || []).forEach(r => {
            if (counts[r.sync_csen_status] !== undefined) counts[r.sync_csen_status]++;
            else counts.other++;
        });

        // 2. Ultimi errori (in stato ERROR)
        const { data: errors } = await supabase
            .from('registro_tesserati')
            .select(`
                id_tesserato,
                sync_csen_log,
                anagrafiche ( nome, cognome, codice_fiscale )
            `)
            .eq('sync_csen_status', 'ERROR')
            .limit(20);

        // 3. PENDING senza numero tessera (da sincronizzare)
        const { data: pendingList } = await supabase
            .from('registro_tesserati')
            .select(`
                id_tesserato,
                livello_copertura,
                data_richiesta_tesseramento,
                anagrafiche ( nome, cognome, codice_fiscale )
            `)
            .eq('sync_csen_status', 'PENDING')
            .is('numero_tessera_csen', null)
            .order('data_richiesta_tesseramento', { ascending: true })
            .limit(30);

        // 4. PENDING ma con numero tessera già presente (bug legacy)
        const { count: pendingConTessera } = await supabase
            .from('registro_tesserati')
            .select('id_tesserato', { count: 'exact', head: true })
            .eq('sync_csen_status', 'PENDING')
            .not('numero_tessera_csen', 'is', null);

        return res.status(200).json({
            timestamp: new Date().toISOString(),
            counts,
            pendingConTessera: pendingConTessera || 0,
            pending_da_sincronizzare: pendingList || [],
            errori: (errors || []).map(e => ({
                id: e.id_tesserato,
                nome: `${e.anagrafiche?.nome} ${e.anagrafiche?.cognome}`,
                cf: e.anagrafiche?.codice_fiscale,
                log: e.sync_csen_log
            }))
        });

    } catch (err) {
        console.error('csen-status error:', err);
        return res.status(500).json({ error: 'Errore interno del server.' });
    }
}
