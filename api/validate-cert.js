import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

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
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Environment validation (fail-hard, no fallbacks) ---
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('validate-cert: Configurazione Supabase mancante.');
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }
    if (!geminiApiKey) {
        console.error('validate-cert: GEMINI_API_KEY mancante.');
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // --- Authentication ---
        // Two modes: 
        // 1. Internal server-to-server call via x-internal-secret header (from otp-verify.js)
        // 2. External call via Bearer token (from dashboard, must be board member)
        const internalSecret = req.headers['x-internal-secret'];
        const cronSecret = process.env.CRON_SECRET;
        let isInternalCall = false;

        if (internalSecret && cronSecret && internalSecret === cronSecret) {
            // Trusted internal call — no further auth needed
            isInternalCall = true;
        } else {
            // External call — require Bearer token + board member role
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Richiesta non autorizzata: token mancante.' });
            }

            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            if (authError || !user) {
                return res.status(401).json({ error: 'Token non valido o sessione scaduta.' });
            }

            // Check board member role
            const { data: userProfile, error: profileError } = await supabase
                .from('utenti')
                .select('ruolo')
                .eq('id', user.id)
                .single();

            if (profileError || !userProfile) {
                return res.status(403).json({ error: 'Accesso negato.' });
            }

            const boardRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
            const userRoles = Array.isArray(userProfile.ruolo) ? userProfile.ruolo : [userProfile.ruolo];
            const isBoardMember = userRoles.some(r => boardRoles.includes(r));

            if (!isBoardMember) {
                return res.status(403).json({ error: 'Accesso negato: operazione riservata al direttivo.' });
            }
        }

        // --- Rate limiting (skip for internal calls) ---
        if (!isInternalCall) {
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
            const { data: allowed } = await supabase.rpc('check_rate_limit', {
                p_key: `validate-cert:${clientIp}`,
                p_max_requests: 5,
                p_window_seconds: 300
            });
            if (allowed === false) {
                return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
            }
        }

        // --- Input validation ---
        const { anagrafica_id, file_url } = req.body;

        if (!anagrafica_id || !file_url) {
            return res.status(400).json({ error: 'Parametri mancanti.' });
        }

        // --- Anti-SSRF: validate file_url is a Supabase storage URL ---
        const allowedUrlPrefix = `${supabaseUrl}/storage/v1/`;
        if (!file_url.startsWith(allowedUrlPrefix)) {
            console.error(`[AI VALIDATION] SSRF attempt blocked. URL: ${file_url}`);
            return res.status(400).json({ error: 'URL del file non valido.' });
        }

        console.log(`[AI VALIDATION] Starting validation for anagrafica_id: ${anagrafica_id}`);

        // 1. Download the image from the signed URL
        const imageResponse = await fetch(file_url);
        if (!imageResponse.ok) {
            console.error(`[AI VALIDATION] Failed to fetch image: ${imageResponse.status}`);
            throw new Error('Impossibile scaricare il file.');
        }
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
        
        // Convert to base64 for Gemini API
        const base64Data = buffer.toString('base64');

        // 2. Call Gemini API
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const prompt = `
Sei un assistente medico-legale esperto in certificati medici sportivi italiani.
Sto per fornirti un'immagine di un certificato medico.
Devi estrarre le seguenti informazioni in formato JSON STRICT:
1. data_emissione (formato YYYY-MM-DD, se non la trovi stima in base alla firma o metti null)
2. data_scadenza (formato YYYY-MM-DD, spesso è 1 anno dalla data di emissione)
3. agonistico (booleano: true se c'è scritto "agonistico" o fa riferimento al D.M. 18/02/1982, false se "non agonistico" o D.M. 24/04/2013)
4. stato (stringa: "VERDE" se il certificato è chiaramente leggibile, firmato e in corso di validità; "GIALLO" se c'è qualcosa di ambiguo, non si legge bene, o manca il timbro/firma; "ROSSO" se è chiaramente scaduto, palesemente falso, o non è un certificato medico).
5. note (una breve spiegazione del perché hai assegnato quello stato, max 100 caratteri).

Rispondi SOLO con il JSON, senza markdown, senza blockquote. Esempio:
{"data_emissione": "2023-10-15", "data_scadenza": "2024-10-14", "agonistico": false, "stato": "VERDE", "note": "Certificato valido e leggibile."}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { inlineData: { data: base64Data, mimeType: mimeType } },
                        { text: prompt }
                    ]
                }
            ]
        });

        let responseText = (typeof response.text === 'function' ? response.text() : response.text).trim();
        // Remove markdown formatting if the model still outputs it
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        console.log(`[AI VALIDATION] Gemini response:`, responseText);

        const aiResult = JSON.parse(responseText);

        // 3. Update the database
        const updatePayload = {
            stato_validazione: aiResult.stato || 'GIALLO',
            note_ai: aiResult.note || 'Impossibile interpretare la risposta AI',
            data_rilascio: aiResult.data_emissione || null,
            data_scadenza: aiResult.data_scadenza || null,
            tipologia: aiResult.agonistico ? 'AGONISTICO' : 'NON_AGONISTICO'
        };

        const { error: updateError } = await supabase
            .from('certificati_medici')
            .update(updatePayload)
            .eq('anagrafica_id', anagrafica_id);

        if (updateError) {
            throw updateError;
        }

        console.log(`[AI VALIDATION] Successfully updated anagrafica_id: ${anagrafica_id}`);
        return res.status(200).json({ success: true, result: updatePayload });

    } catch (error) {
        console.error('[AI VALIDATION] Error:', error);
        
        // If it fails, set to GIALLO so human reviews it — do NOT write error.message to DB
        if (req.body?.anagrafica_id) {
            try {
                await supabase.from('certificati_medici').update({
                    stato_validazione: 'GIALLO',
                    note_ai: 'Elaborazione automatica AI non riuscita. Richiesta revisione manuale.'
                }).eq('anagrafica_id', req.body.anagrafica_id);
            } catch (dbErr) {
                console.error('[AI VALIDATION] Failed to set GIALLO fallback:', dbErr);
            }
        }

        return res.status(500).json({ error: 'Si è verificato un errore durante la validazione. Riprova più tardi.' });
    }
}
