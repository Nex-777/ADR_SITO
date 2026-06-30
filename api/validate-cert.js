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
        const internalSecret = req.headers['x-internal-secret'];
        const cronSecret = process.env.CRON_SECRET;
        let isInternalCall = false;

        if (internalSecret && cronSecret && internalSecret === cronSecret) {
            isInternalCall = true;
        } else {
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
                p_max_requests: 15,
                p_window_seconds: 60
            });
            if (allowed === false) {
                return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
            }
        }

        // --- Input validation ---
        const { anagrafica_id, cert_id, file_url, is_manual, nuovo_stato, note } = req.body;

        let targetAnagraficaId = anagrafica_id;

        if (is_manual && cert_id && !targetAnagraficaId) {
            const { data: certObj } = await supabase
                .from('certificati_medici')
                .select('anagrafica_id')
                .eq('id', cert_id)
                .maybeSingle();
            if (certObj) {
                targetAnagraficaId = certObj.anagrafica_id;
            }
        }

        if (!targetAnagraficaId) {
            return res.status(400).json({ error: 'Parametri mancanti: anagrafica_id o cert_id non validi.' });
        }

        let finalStatus = 'GIALLO';
        let finalNotes = '';
        let finalRelease = null;
        let finalExpiry = null;
        let finalType = 'NON_AGONISTICO';

        if (is_manual) {
            // Manual path: validation done by President/Segretaria
            if (!nuovo_stato || !['VERDE', 'GIALLO', 'ROSSO'].includes(nuovo_stato)) {
                return res.status(400).json({ error: 'Stato manuale non valido.' });
            }
            finalStatus = nuovo_stato;
            finalNotes = note || 'Approvazione manuale del direttivo.';

            // Get current certificate values to preserve dates
            const { data: currentCert } = await supabase
                .from('certificati_medici')
                .select('*')
                .eq('anagrafica_id', targetAnagraficaId)
                .maybeSingle();

            if (currentCert) {
                finalRelease = currentCert.data_rilascio;
                finalExpiry = currentCert.data_scadenza;
                finalType = currentCert.tipologia;
            }
        } else {
            // Automated AI path
            if (!file_url) {
                return res.status(400).json({ error: 'Parametri mancanti: file_url per AI.' });
            }
            const allowedUrlPrefix = `${supabaseUrl}/storage/v1/`;
            if (!file_url.startsWith(allowedUrlPrefix)) {
                console.error(`[AI VALIDATION] SSRF attempt blocked. URL: ${file_url}`);
                return res.status(400).json({ error: 'URL del file non valido.' });
            }

            console.log(`[AI VALIDATION] Starting validation for anagrafica_id: ${targetAnagraficaId}`);

            const imageResponse = await fetch(file_url);
            if (!imageResponse.ok) {
                console.error(`[AI VALIDATION] Failed to fetch image: ${imageResponse.status}`);
                throw new Error('Impossibile scaricare il file.');
            }
            
            const arrayBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
            const base64Data = buffer.toString('base64');

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
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            }

            console.log('[AI VALIDATION] Gemini response received, length:', responseText.length);
            const aiResult = JSON.parse(responseText);

            finalStatus = aiResult.stato || 'GIALLO';
            finalNotes = aiResult.note || 'Impossibile interpretare la risposta AI';
            finalRelease = aiResult.data_emissione || null;
            finalExpiry = aiResult.data_scadenza || null;
            finalType = aiResult.agonistico ? 'AGONISTICO' : 'NON_AGONISTICO';
        }

        // --- Database Update ---
        const updatePayload = {
            stato_validazione: finalStatus,
            note_ai: finalNotes,
            data_rilascio: finalRelease,
            data_scadenza: finalExpiry,
            tipologia: finalType
        };

        const { error: updateError } = await supabase
            .from('certificati_medici')
            .update(updatePayload)
            .eq('anagrafica_id', targetAnagraficaId);

        if (updateError) throw updateError;
        console.log(`[VALIDATION] Successfully updated certificati_medici for anagrafica_id: ${targetAnagraficaId}`);

        // --- Post-Validation Actions & Notifications ---
        // Fetch user/anagrafica details for emails and checkout checks
        const { data: profile, error: profileErr } = await supabase
            .from('anagrafiche')
            .select('nome, cognome, utente_id, utenti(email, quota_totale)')
            .eq('id', targetAnagraficaId)
            .single();

        if (!profileErr && profile) {
            const userEmail = profile.utenti?.email;
            const nomeUtente = profile.nome;
            const quota = parseFloat(profile.utenti?.quota_totale || 0);

            // Fetch registration approval record to see if it transitioned to IN_ATTESA_PAGAMENTO
            const { data: approvazione } = await supabase
                .from('registro_approvazioni')
                .select('stato')
                .eq('anagrafica_id', targetAnagraficaId)
                .maybeSingle();

            if (finalStatus === 'VERDE') {
                if (approvazione && approvazione.stato === 'IN_ATTESA_PAGAMENTO' && userEmail) {
                    // Send approval payment email
                    const checkoutLink = 'https://portal.adrenalinaclub.it/portal/pagamento.html';
                    const emailSubject = 'Certificato Medico Approvato - Procedi al pagamento';
                    const emailHtml = `
                        <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                            <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                            <p style="color: #ccc;">Ciao ${nomeUtente}, il tuo certificato medico è stato approvato con successo!</p>
                            <p style="color: #aaa; font-size: 13px;">Puoi ora procedere al pagamento della quota associativa di <strong>€${quota.toFixed(2)}</strong> per completare la tua iscrizione ed attivare la tua copertura assicurativa:</p>
                            <a href="${checkoutLink}" style="background-color: #df293e; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 15px; border-radius: 4px;">PAGA ORA LA QUOTA</a>
                        </div>
                    `;
                    await sendEmail({ to: userEmail, subject: emailSubject, html: emailHtml });
                    console.log(`[VALIDATION] Sent confirmation & checkout email to: ${userEmail}`);
                }
            } else if (finalStatus === 'ROSSO') {
                if (userEmail) {
                    // Send certificate rejection email
                    const emailSubject = 'Problema con il tuo Certificato Medico - Richiesta di ricaricamento';
                    const emailHtml = `
                        <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                            <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                            <p style="color: #ccc;">Ciao ${nomeUtente}, ti informiamo che il certificato medico da te caricato è stato rifiutato.</p>
                            <p style="color: #aaa; font-size: 13px;">Motivazione: <strong>${finalNotes}</strong></p>
                            <p style="color: #aaa; font-size: 13px;">Per completare il tesseramento sportivo, è obbligatorio caricare un certificato medico in corso di validità. Clicca sul link sottostante per ricaricare il certificato:</p>
                            <a href="https://portal.adrenalinaclub.it/portal/dashboard.html" style="background-color: #df293e; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 15px; border-radius: 4px;">RICARICA CERTIFICATO MEDICO</a>
                        </div>
                    `;
                    await sendEmail({ to: userEmail, subject: emailSubject, html: emailHtml });
                    console.log(`[VALIDATION] Sent rejection email to: ${userEmail}`);
                }
            }
        }

        return res.status(200).json({ success: true, result: updatePayload });

    } catch (error) {
        console.error('[VALIDATION] Error:', error);
        
        if (req.body?.anagrafica_id && !req.body.is_manual) {
            try {
                await supabase.from('certificati_medici').update({
                    stato_validazione: 'GIALLO',
                    note_ai: 'Elaborazione automatica AI non riuscita. Richiesta revisione manuale.'
                }).eq('anagrafica_id', req.body.anagrafica_id);
            } catch (dbErr) {
                console.error('[VALIDATION] Failed to set GIALLO fallback:', dbErr);
            }
        }

        return res.status(500).json({ error: 'Si è verificato un errore durante la validazione. Riprova più tardi.' });
    }
}


