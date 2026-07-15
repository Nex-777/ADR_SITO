import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { sendEmail } from './resend-mail.js';

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
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Errore di configurazione del server.' });
    if (!geminiApiKey) return res.status(500).json({ error: 'Errore di configurazione del server.' });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const internalSecret = req.headers['x-internal-secret'];
        const cronSecret = process.env.CRON_SECRET;
        let isInternalCall = false;

        if (internalSecret && cronSecret && internalSecret === cronSecret) {
            isInternalCall = true;
        } else {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Richiesta non autorizzata: token mancante.' });
            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            if (authError || !user) return res.status(401).json({ error: 'Token non valido o sessione scaduta.' });
            const { data: userProfile } = await supabase.from('utenti').select('ruolo').eq('id', user.id).single();
            if (!userProfile) return res.status(403).json({ error: 'Accesso negato.' });
            const boardRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
            const userRoles = Array.isArray(userProfile.ruolo) ? userProfile.ruolo : [userProfile.ruolo];
            if (!userRoles.some(r => boardRoles.includes(r))) return res.status(403).json({ error: 'Accesso negato: operazione riservata al direttivo.' });
        }

        if (!isInternalCall) {
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
            const { data: allowed } = await supabase.rpc('check_rate_limit', { p_key: `validate-doc:${clientIp}`, p_max_requests: 15, p_window_seconds: 60 });
            if (allowed === false) return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
        }

        let targetAnagraficaId = req.body.anagrafica_id;
        let targetFileUrl = req.body.file_url;
        let isManual = req.body.is_manual;
        let nuovo_stato = req.body.nuovo_stato;
        let note = req.body.note;
        let doc_id = req.body.doc_id;

        if (req.body.type === 'INSERT' && req.body.table === 'documenti_identita' && req.body.record) {
            targetAnagraficaId = req.body.record.anagrafica_id;
            targetFileUrl = req.body.record.file_url;
            doc_id = req.body.record.id;
            isManual = false;
            if (req.body.record.stato_validazione !== 'IN_ATTESA') return res.status(200).json({ message: 'Documento non in attesa, ignorato.' });
        }

        if (isManual && doc_id && !targetAnagraficaId) {
            const { data: docObj } = await supabase.from('documenti_identita').select('anagrafica_id').eq('id', doc_id).maybeSingle();
            if (docObj) targetAnagraficaId = docObj.anagrafica_id;
        }

        if (!targetAnagraficaId) return res.status(400).json({ error: 'Parametri mancanti: anagrafica_id o doc_id non validi.' });

        let finalStatus = 'GIALLO';
        let finalNotes = '';
        let finalExpiry = null;

        if (isManual) {
            if (!nuovo_stato || !['VERDE', 'GIALLO', 'ROSSO'].includes(nuovo_stato)) return res.status(400).json({ error: 'Stato manuale non valido.' });
            finalStatus = nuovo_stato;
            finalNotes = note || 'Approvazione manuale del direttivo.';
            let docQuery = supabase.from('documenti_identita').select('data_scadenza');
            docQuery = doc_id ? docQuery.eq('id', doc_id) : docQuery.eq('anagrafica_id', targetAnagraficaId).order('created_at', { ascending: false }).limit(1);
            const { data: currentDoc } = await docQuery.maybeSingle();
            if (currentDoc) finalExpiry = currentDoc.data_scadenza;
        } else {
            if (!targetFileUrl) return res.status(400).json({ error: 'Parametri mancanti: file_url per AI.' });

            // If it is a storage path (not a full URL), generate a signed URL
            if (!targetFileUrl.startsWith('https://')) {
                const { data: signedData } = await supabase.storage.from('documenti_identita').createSignedUrl(targetFileUrl, 60);
                if (!signedData?.signedUrl) return res.status(400).json({ error: 'File non accessibile.' });
                targetFileUrl = signedData.signedUrl;
            }

            const allowedUrlPrefix = `${supabaseUrl}/storage/v1/`;
            if (!targetFileUrl.startsWith(allowedUrlPrefix)) {
                console.error(`[DOC AI] SSRF attempt blocked. URL: ${targetFileUrl}`);
                return res.status(400).json({ error: 'URL del file non valido.' });
            }

            console.log(`[DOC AI] Starting validation for anagrafica_id: ${targetAnagraficaId}`);
            const imageResponse = await fetch(targetFileUrl);
            if (!imageResponse.ok) throw new Error('Impossibile scaricare il documento.');

            const arrayBuffer = await imageResponse.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            const todayStr = new Date().toISOString().split('T')[0];
            const prompt = `Sei un esperto di documenti di identità italiani. La data odierna è il ${todayStr}. Ti fornisco l'immagine di un documento di identità (Carta d'Identità, Passaporto o Patente di Guida). Devi estrarre queste informazioni in formato JSON STRICT: 1. tipo_documento (stringa: "CARTA_IDENTITA", "PASSAPORTO", "PATENTE" oppure "ALTRO"), 2. data_scadenza (formato YYYY-MM-DD, null se non leggibile), 3. leggibile (booleano), 4. stato (stringa: "VERDE" se documento valido non scaduto e leggibile; "GIALLO" se qualcosa non è chiaro; "ROSSO" se chiaramente scaduto o non è un documento valido), 5. note (breve spiegazione). Rispondi SOLO con il JSON senza markdown. Esempio: {"tipo_documento":"CARTA_IDENTITA","data_scadenza":"2029-05-10","leggibile":true,"stato":"VERDE","note":"Documento valido e leggibile."}`;

            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ inlineData: { data: base64Data, mimeType } }, { text: prompt }] }] });
            let responseText = (typeof response.text === 'function' ? response.text() : response.text).trim().replace(/```json/g, '').replace(/```/g, '').trim();
            console.log('[DOC AI] Gemini response length:', responseText.length);
            const aiResult = JSON.parse(responseText);
            finalStatus = aiResult.stato || 'GIALLO';
            finalNotes = aiResult.note || 'Impossibile interpretare la risposta AI';
            finalExpiry = aiResult.data_scadenza || null;
        }

        const updatePayload = { stato_validazione: finalStatus, note_ai: finalNotes, data_scadenza: finalExpiry };
        let dbQuery = supabase.from('documenti_identita').update(updatePayload);
        dbQuery = doc_id ? dbQuery.eq('id', doc_id) : dbQuery.eq('anagrafica_id', targetAnagraficaId);
        const { error: updateError } = await dbQuery;
        if (updateError) throw updateError;

        console.log(`[DOC VALIDATION] Updated documenti_identita. doc_id: ${doc_id || 'N/A'}, stato: ${finalStatus}`);

        const { data: profile } = await supabase.from('anagrafiche').select('nome, utenti(email)').eq('id', targetAnagraficaId).single();
        if (profile?.utenti?.email) {
            const userEmail = profile.utenti.email;
            const nomeUtente = profile.nome;
            if (finalStatus === 'ROSSO') {
                await sendEmail({ to: userEmail, subject: 'Problema con il tuo Documento di Identità - Adrenalina Club', html: `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center"><h1 style="color:#df293e">ADRENALINA CLUB</h1><p>Ciao ${nomeUtente}, il documento di identità caricato non è stato accettato.</p><p style="color:#aaa;font-size:13px">Motivazione: <strong>${finalNotes}</strong></p><a href="https://portal.adrenalinaclub.it/portal/dashboard.html" style="background:#df293e;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:15px">AGGIORNA DOCUMENTO</a></div>` });
            } else if (finalStatus === 'GIALLO' && !isManual) {
                await sendEmail({ to: userEmail, subject: 'Documento di Identità in Verifica - Adrenalina Club', html: `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center"><h1 style="color:#df293e">ADRENALINA CLUB</h1><p>Ciao ${nomeUtente}, il documento di identità è in attesa di verifica manuale. Riceverai una conferma a breve.</p></div>` });
            }
        }

        return res.status(200).json({ success: true, result: updatePayload });

    } catch (error) {
        console.error('[DOC VALIDATION] Error:', error);
        const targetDocId = doc_id || req.body?.record?.id;
        if (targetDocId && !req.body?.is_manual) {
            try {
                await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
                    .from('documenti_identita').update({ stato_validazione: 'GIALLO', note_ai: `Errore tecnico: ${error.message || 'Timeout/Crash'}. Richiesta revisione manuale.` }).eq('id', targetDocId);
            } catch (dbErr) { console.error('[DOC VALIDATION] Failed fallback GIALLO:', dbErr); }
        }
        return res.status(500).json({ error: 'Si è verificato un errore durante la validazione. Riprova più tardi.' });
    }
}
