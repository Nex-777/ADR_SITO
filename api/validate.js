import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';
import { sendEmail } from './resend-mail.js';

// ═══════════════════════════════════════════════════════════════════
//  /api/validate  —  Endpoint unificato di validazione AI
//  Sostituisce validate-cert.js e validate-doc.js (erano 2 funzioni,
//  ora è 1 sola, restando entro il limite Hobby di Vercel).
//
//  Body params:
//    target_type  : 'cert' | 'doc'   (obbligatorio)
//    --- per cert ---
//    cert_id, anagrafica_id, file_url, is_manual, nuovo_stato, note
//    --- per doc ---
//    doc_id,  anagrafica_id, file_url, is_manual, nuovo_stato, note
//
//  Webhook DB (trigger Supabase → HTTP):
//    { type:'INSERT', table:'certificati_medici'|'documenti_identita', record:{...} }
//    Il target_type viene inferito dalla table se non esplicitato.
// ═══════════════════════════════════════════════════════════════════

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
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Errore di configurazione del server.' });
    if (!mistralApiKey) return res.status(500).json({ error: 'Errore di configurazione server Mistral AI.' });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Infer target_type from webhook table if not explicit ---
    let targetType = req.body.target_type;
    if (!targetType && req.body.type === 'INSERT' && req.body.table) {
        if (req.body.table === 'certificati_medici') targetType = 'cert';
        if (req.body.table === 'documenti_identita') targetType = 'doc';
    }
    if (!targetType || !['cert', 'doc'].includes(targetType)) {
        return res.status(400).json({ error: 'target_type mancante o non valido. Usa "cert" o "doc".' });
    }

    try {
        // --- Auth ---
        const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
        const incomingWebhookSecret = req.headers['x-webhook-secret'];
        const internalSecret = req.headers['x-internal-secret'];
        const cronSecret = process.env.CRON_SECRET;
        let isInternalCall = false;

        if (webhookSecret && incomingWebhookSecret && incomingWebhookSecret === webhookSecret) {
            isInternalCall = true;
        } else if (internalSecret && cronSecret && internalSecret === cronSecret) {
            isInternalCall = true;
        } else {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Richiesta non autorizzata: token mancante.' });
            }
            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            if (authError || !user) return res.status(401).json({ error: 'Token non valido o sessione scaduta.' });

            const { data: userProfile } = await supabase.from('utenti').select('ruolo').eq('id', user.id).single();
            if (!userProfile) return res.status(403).json({ error: 'Accesso negato.' });

            const userRoles = Array.isArray(userProfile.ruolo) ? userProfile.ruolo : [userProfile.ruolo];
            const isBoard = userRoles.some(r => BOARD_ROLES.includes(r));

            if (!isBoard) {
                if (req.body.is_manual) {
                    return res.status(403).json({ error: 'Accesso negato: operazione riservata al direttivo.' });
                }
                // Non-board user can only trigger automated AI validation on their own anagrafica
                const { data: userAnags } = await supabase.from('anagrafiche').select('id').eq('utente_id', user.id);
                const userAnagIds = (userAnags || []).map(a => a.id);

                let reqAnagId = req.body.anagrafica_id;
                if (!reqAnagId && req.body.cert_id) {
                    const { data: cData } = await supabase.from('certificati_medici').select('anagrafica_id').eq('id', req.body.cert_id).maybeSingle();
                    if (cData) reqAnagId = cData.anagrafica_id;
                }
                if (!reqAnagId && req.body.doc_id) {
                    const { data: dData } = await supabase.from('documenti_identita').select('anagrafica_id').eq('id', req.body.doc_id).maybeSingle();
                    if (dData) reqAnagId = dData.anagrafica_id;
                }

                if (!reqAnagId || !userAnagIds.includes(reqAnagId)) {
                    return res.status(403).json({ error: 'Accesso negato: non puoi validare documenti di altri utenti.' });
                }
            }
        }

        // --- Rate limit (solo chiamate manuali) ---
        if (!isInternalCall) {
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
            const { data: allowed } = await supabase.rpc('check_rate_limit', {
                p_key: `validate-${targetType}:${clientIp}`,
                p_max_requests: 15,
                p_window_seconds: 60
            });
            if (allowed === false) return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
        }

        // ═══════════════════════════════════
        //  BRANCH: CERTIFICATO MEDICO (cert)
        // ═══════════════════════════════════
        if (targetType === 'cert') {
            let targetAnagraficaId = req.body.anagrafica_id;
            let targetFileUrl = req.body.file_url;
            let isManual = req.body.is_manual;
            let nuovo_stato = req.body.nuovo_stato;
            let note = req.body.note;
            let cert_id = req.body.cert_id;

            // Webhook payload
            if (req.body.type === 'INSERT' && req.body.table === 'certificati_medici' && req.body.record) {
                targetAnagraficaId = req.body.record.anagrafica_id;
                targetFileUrl = req.body.record.file_url;
                cert_id = req.body.record.id;
                isManual = false;
                if (req.body.record.stato_validazione !== 'IN_ATTESA') {
                    return res.status(200).json({ message: 'Certificato non in attesa, ignorato.' });
                }
            }

            if (cert_id && (!targetAnagraficaId || !targetFileUrl)) {
                const { data: certObj } = await supabase.from('certificati_medici').select('anagrafica_id, file_url').eq('id', cert_id).maybeSingle();
                if (certObj) {
                    if (!targetAnagraficaId) targetAnagraficaId = certObj.anagrafica_id;
                    if (!targetFileUrl) targetFileUrl = certObj.file_url;
                }
            }

            if (!targetAnagraficaId) return res.status(400).json({ error: 'Parametri mancanti: anagrafica_id o cert_id non validi.' });

            let finalStatus = 'GIALLO';
            let finalNotes = '';
            let finalRelease = null;
            let finalExpiry = null;
            let finalType = 'NON_AGONISTICO';

            if (isManual) {
                if (!nuovo_stato || !['VERDE', 'GIALLO', 'ROSSO'].includes(nuovo_stato)) {
                    return res.status(400).json({ error: 'Stato manuale non valido.' });
                }
                finalStatus = nuovo_stato;
                finalNotes = (typeof note === 'string' && note.trim()) ? note.slice(0, 500) : 'Approvazione manuale del direttivo.';
                let certQuery = supabase.from('certificati_medici').select('*');
                certQuery = cert_id ? certQuery.eq('id', cert_id) : certQuery.eq('anagrafica_id', targetAnagraficaId);
                const { data: currentCert } = await certQuery.maybeSingle();
                if (currentCert) {
                    finalRelease = currentCert.data_rilascio;
                    finalExpiry = currentCert.data_scadenza;
                    finalType = currentCert.tipologia;
                }

                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (req.body.data_scadenza && dateRegex.test(req.body.data_scadenza)) {
                    finalExpiry = req.body.data_scadenza;
                }
                if (req.body.data_rilascio && dateRegex.test(req.body.data_rilascio)) {
                    finalRelease = req.body.data_rilascio;
                }
                if (req.body.tipologia && ['AGONISTICO', 'NON_AGONISTICO'].includes(req.body.tipologia)) {
                    finalType = req.body.tipologia;
                }
            } else {
                if (!targetFileUrl) return res.status(400).json({ error: 'Parametri mancanti: file_url per AI.' });

                let fileToFetchUrl = targetFileUrl;
                let relativePath = '';
                
                if (fileToFetchUrl.includes('/storage/v1/object/sign/certificati_medici/')) {
                    relativePath = fileToFetchUrl.split('/storage/v1/object/sign/certificati_medici/')[1].split('?')[0];
                } else if (fileToFetchUrl.includes('/storage/v1/object/public/certificati_medici/')) {
                    relativePath = fileToFetchUrl.split('/storage/v1/object/public/certificati_medici/')[1].split('?')[0];
                } else if (!fileToFetchUrl.startsWith('https://')) {
                    relativePath = fileToFetchUrl;
                }

                if (relativePath && relativePath.toLowerCase().endsWith('.pdf')) {
                    const thumbPath = relativePath.replace(/\.pdf$/i, '_thumb.jpg');
                    const { data: thumbSign } = await supabase.storage.from('certificati_medici').createSignedUrl(thumbPath, 120);
                    
                    if (thumbSign && thumbSign.signedUrl) {
                        fileToFetchUrl = thumbSign.signedUrl;
                    } else {
                        console.warn(`[CERT AI] Miniatura non trovata per: ${relativePath}. Fallback a GIALLO per revisione manuale.`);
                        await supabase.from('certificati_medici').update({
                            stato_validazione: 'GIALLO',
                            note_ai: 'File PDF senza miniatura. Richiesta revisione manuale.'
                        }).eq('id', cert_id);
                        return res.status(200).json({ message: 'Miniatura mancante, impostato a GIALLO.' });
                    }
                } else if (relativePath && !fileToFetchUrl.startsWith('https://')) {
                    const { data: imgSign } = await supabase.storage.from('certificati_medici').createSignedUrl(relativePath, 120);
                    if (imgSign && imgSign.signedUrl) {
                        fileToFetchUrl = imgSign.signedUrl;
                    } else {
                        return res.status(400).json({ error: 'File immagine non accessibile.' });
                    }
                }

                const allowedUrlPrefix = `${supabaseUrl}/storage/v1/`;
                if (!fileToFetchUrl.startsWith(allowedUrlPrefix)) {
                    console.error(`[CERT AI] SSRF attempt blocked. URL: ${fileToFetchUrl}`);
                    return res.status(400).json({ error: 'URL del file non valido.' });
                }

                console.log(`[CERT AI] Starting validation for anagrafica_id: ${targetAnagraficaId}`);
                
                try {
                    const imageResponse = await fetch(fileToFetchUrl);
                    if (!imageResponse.ok) throw new Error('Impossibile scaricare il file.');

                    const arrayBuffer = await imageResponse.arrayBuffer();
                    const base64Data = Buffer.from(arrayBuffer).toString('base64');
                    let mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
                    if (mimeType.includes('application/pdf')) mimeType = 'image/jpeg';

                    const mistral = new Mistral({ apiKey: mistralApiKey });
                    const todayStr = new Date().toISOString().split('T')[0];
                    const prompt = `
Oggi è il ${todayStr} (fornita come riferimento contestuale per il formato delle date — NON usarla per calcolare se il certificato è scaduto, la verifica temporale è delegata a un sistema separato).
Sei un assistente medico-legale esperto in certificati medici sportivi italiani.
Sto per fornirti un'immagine di un certificato medico.

Devi estrarre le date esatte scritte sul documento. Ignora qualsiasi altra informazione esterna.

REQUISITO FONDAMENTALE SULLE DICITURE DI IDONEITÀ:
Affinché il certificato sia valido per il tesseramento sportivo, sul documento DEVE ESSERE PRESENTE IN MODO CHIARO ED ESPLICITO almeno una delle seguenti parole/diciture (senza distinzione tra maiuscole e minuscole):
- "AGONISTICO"
- "AGONISTICI"
- "NON AGONISTICO"
- "NON AGONISTICI"

Se il certificato NON contiene nessuna di queste parole esplicite (ad esempio se riporta soltanto "attività ludico-motoria", "ludico-ricreativa", "attività amatoriale" o altre diciture prive dei termini sopra indicati), il certificato NON È VALIDO ai fini del tesseramento sportivo e lo stato DEVE essere tassativamente "ROSSO".

Devi estrarre le seguenti informazioni in formato JSON STRICT:
1. data_emissione (formato YYYY-MM-DD, la data in cui il certificato è stato rilasciato, null se non leggibile)
2. data_scadenza (formato YYYY-MM-DD, la data in cui scade la validità del certificato, null se non leggibile)
3. agonistico (booleano, true se specifica idoneità agonistica, false se specifica non agonistica)
4. stato (stringa: "VERDE" se il certificato è originale, ben leggibile e contiene esplicitamente una delle diciture obbligatorie AGONISTICO/NON AGONISTICO; "GIALLO" se l'immagine è sfuocata, tagliata o c'è qualcosa di incomprensibile; "ROSSO" se il certificato non contiene la dicitura obbligatoria o non è un certificato medico).
5. note (una breve spiegazione del perché hai assegnato quello stato).

Rispondi SOLO con il JSON, senza markdown, senza blockquote. Esempio:
{"data_emissione": "2025-10-15", "data_scadenza": "2026-10-14", "agonistico": false, "stato": "VERDE", "note": "Certificato non agonistico leggibile e ben fotografato."}
                    `;

                    const response = await mistral.chat.complete({
                        model: 'pixtral-12b-2409',
                        responseFormat: { type: 'json_object' },
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', imageUrl: `data:${mimeType};base64,${base64Data}` }
                            ]
                        }]
                    });

                    let responseText = (typeof response.choices[0].message.content === 'string' ? response.choices[0].message.content : JSON.stringify(response.choices[0].message.content)).trim()
                        .replace(/```json/g, '').replace(/```/g, '').trim();
                    console.log('[CERT AI] Mistral response length:', responseText.length);
                    const aiResult = JSON.parse(responseText);

                    finalStatus = aiResult.stato || 'GIALLO';
                    finalNotes = aiResult.note || 'Impossibile interpretare la risposta AI';
                    finalRelease = aiResult.data_emissione || new Date().toISOString().split('T')[0];
                    finalType = aiResult.agonistico ? 'AGONISTICO' : 'NON_AGONISTICO';

                    if (aiResult.data_scadenza) {
                        finalExpiry = aiResult.data_scadenza;
                    } else {
                        // Se l'AI non trova la data di scadenza esplicita, autocalcola 1 anno dalla data di rilascio
                        const relDate = new Date(finalRelease);
                        relDate.setFullYear(relDate.getFullYear() + 1);
                        finalExpiry = relDate.toISOString().split('T')[0];
                    }

                    // Guardrail Deterministico Javascript su Date Scadenza Certificati
                    if (finalExpiry) {
                        const expiryDate = new Date(finalExpiry);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (expiryDate < today) {
                            finalStatus = 'ROSSO';
                            finalNotes = `Certificato scaduto il ${finalExpiry}. (Nota AI: ${finalNotes})`;
                        }
                    }
                } catch (aiErr) {
                    console.error('[CERT AI ERROR] Fallback a GIALLO:', aiErr.message);
                    finalStatus = 'GIALLO';
                    finalNotes = "Formato documento non leggibile automaticamente dall'AI (richiede revisione manuale).";
                }
            }

            const updatePayload = { stato_validazione: finalStatus, note_ai: finalNotes, data_rilascio: finalRelease, data_scadenza: finalExpiry, tipologia: finalType };
            let dbQuery = supabase.from('certificati_medici').update(updatePayload);
            dbQuery = cert_id ? dbQuery.eq('id', cert_id) : dbQuery.eq('anagrafica_id', targetAnagraficaId);
            const { error: updateError } = await dbQuery;
            if (updateError) throw updateError;
            console.log(`[CERT VALIDATION] Updated. cert_id: ${cert_id || 'N/A'}, stato: ${finalStatus}`);

            // Post-validation notifications
            const { data: profile } = await supabase.from('anagrafiche')
                .select('nome, cognome, utente_id, utenti(email, quota_totale)')
                .eq('id', targetAnagraficaId).single();

            if (profile) {
                const userEmail = profile.utenti?.email;
                const nomeUtente = profile.nome;
                const quota = parseFloat(profile.utenti?.quota_totale || 0);
                const { data: approvazione } = await supabase.from('registro_approvazioni')
                    .select('stato').eq('anagrafica_id', targetAnagraficaId).maybeSingle();

                if (finalStatus === 'VERDE') {
                    await supabase.from('registro_tesserati').update({ stato_tesseramento: 'ATTIVO' })
                        .eq('anagrafica_id', targetAnagraficaId).eq('stato_tesseramento', 'SOSPESO');
                    if (approvazione?.stato === 'IN_ATTESA_PAGAMENTO' && userEmail) {
                        await sendEmail({
                            to: userEmail,
                            subject: 'Certificato Medico Approvato - Procedi al pagamento',
                            html: `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center"><h1 style="color:#df293e">ADRENALINA CLUB</h1><p>Ciao ${nomeUtente}, il tuo certificato medico è stato approvato!</p><p style="color:#aaa;font-size:13px">Puoi ora procedere al pagamento della quota associativa di <strong>€${quota.toFixed(2)}</strong> per completare la tua iscrizione:</p><a href="https://portal.adrenalinaclub.it/portal/pagamento.html" style="background:#df293e;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:15px">PAGA ORA LA QUOTA</a></div>`
                        });
                    }
                } else if (finalStatus === 'ROSSO') {
                    await supabase.from('registro_tesserati').update({ stato_tesseramento: 'SOSPESO' })
                        .eq('anagrafica_id', targetAnagraficaId).in('stato_tesseramento', ['ATTIVO', 'IN_ELABORAZIONE']);
                    if (userEmail) {
                        await sendEmail({
                            to: userEmail,
                            subject: 'Certificato Medico Non Valido - Tesseramento Sospeso',
                            html: `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center"><h1 style="color:#df293e">ADRENALINA CLUB</h1><p>Ciao ${nomeUtente}, il certificato medico caricato è stato rifiutato.</p><p style="color:#aaa;font-size:13px">Motivazione: <strong>${finalNotes}</strong></p><p style="color:#f87171;font-size:13px;font-weight:bold;margin-top:15px">Il tuo tesseramento è stato temporaneamente SOSPESO. Carica al più presto un certificato medico in corso di validità (Non Agonistico o Agonistico) per riattivare il tuo profilo.</p><a href="https://portal.adrenalinaclub.it/portal/dashboard.html" style="background:#df293e;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:15px">RICARICA CERTIFICATO MEDICO</a></div>`
                        });
                    }
                }
            }

            return res.status(200).json({ success: true, result: updatePayload });
        }

        // ═══════════════════════════════════
        //  BRANCH: DOCUMENTO IDENTITÀ (doc)
        // ═══════════════════════════════════
        if (targetType === 'doc') {
            let targetAnagraficaId = req.body.anagrafica_id;
            let targetFileUrl = req.body.file_url;
            let isManual = req.body.is_manual;
            let nuovo_stato = req.body.nuovo_stato;
            let note = req.body.note;
            let doc_id = req.body.doc_id;

            // Webhook payload
            if (req.body.type === 'INSERT' && req.body.table === 'documenti_identita' && req.body.record) {
                targetAnagraficaId = req.body.record.anagrafica_id;
                targetFileUrl = req.body.record.file_url;
                doc_id = req.body.record.id;
                isManual = false;
                if (req.body.record.stato_validazione !== 'IN_ATTESA') {
                    return res.status(200).json({ message: 'Documento non in attesa, ignorato.' });
                }
            }

            if (doc_id && (!targetAnagraficaId || !targetFileUrl)) {
                const { data: docObj } = await supabase.from('documenti_identita').select('anagrafica_id, file_url').eq('id', doc_id).maybeSingle();
                if (docObj) {
                    if (!targetAnagraficaId) targetAnagraficaId = docObj.anagrafica_id;
                    if (!targetFileUrl) targetFileUrl = docObj.file_url;
                }
            }

            if (!targetAnagraficaId) return res.status(400).json({ error: 'Parametri mancanti: anagrafica_id o doc_id non validi.' });

            let finalStatus = 'GIALLO';
            let finalNotes = '';
            let finalExpiry = null;

            if (isManual) {
                if (!nuovo_stato || !['VERDE', 'GIALLO', 'ROSSO'].includes(nuovo_stato)) {
                    return res.status(400).json({ error: 'Stato manuale non valido.' });
                }
                finalStatus = nuovo_stato;
                finalNotes = note || 'Approvazione manuale del direttivo.';
                let docQuery = supabase.from('documenti_identita').select('data_scadenza');
                docQuery = doc_id ? docQuery.eq('id', doc_id) : docQuery.eq('anagrafica_id', targetAnagraficaId).order('created_at', { ascending: false }).limit(1);
                const { data: currentDoc } = await docQuery.maybeSingle();
                if (currentDoc) finalExpiry = currentDoc.data_scadenza;
            } else {
                if (!targetFileUrl) return res.status(400).json({ error: 'Parametri mancanti: file_url per AI.' });

                let fileToFetchUrl = targetFileUrl;
                let relativePath = '';
                
                if (fileToFetchUrl.includes('/storage/v1/object/sign/documenti_identita/')) {
                    relativePath = fileToFetchUrl.split('/storage/v1/object/sign/documenti_identita/')[1].split('?')[0];
                } else if (fileToFetchUrl.includes('/storage/v1/object/public/documenti_identita/')) {
                    relativePath = fileToFetchUrl.split('/storage/v1/object/public/documenti_identita/')[1].split('?')[0];
                } else if (!fileToFetchUrl.startsWith('https://')) {
                    relativePath = fileToFetchUrl;
                }

                if (relativePath && relativePath.toLowerCase().endsWith('.pdf')) {
                    const thumbPath = relativePath.replace(/\.pdf$/i, '_thumb.jpg');
                    const { data: thumbSign } = await supabase.storage.from('documenti_identita').createSignedUrl(thumbPath, 120);
                    
                    if (thumbSign && thumbSign.signedUrl) {
                        fileToFetchUrl = thumbSign.signedUrl;
                    } else {
                        console.warn(`[DOC AI] Miniatura non trovata per: ${relativePath}. Fallback a GIALLO per revisione manuale.`);
                        let docQuery = supabase.from('documenti_identita').update({
                            stato_validazione: 'GIALLO',
                            note_ai: 'Documento PDF senza miniatura. Richiesta revisione manuale.'
                        });
                        docQuery = doc_id ? docQuery.eq('id', doc_id) : docQuery.eq('anagrafica_id', targetAnagraficaId);
                        await docQuery;
                        return res.status(200).json({ message: 'Miniatura mancante, impostato a GIALLO.' });
                    }
                } else if (relativePath && !fileToFetchUrl.startsWith('https://')) {
                    const { data: imgSign } = await supabase.storage.from('documenti_identita').createSignedUrl(relativePath, 120);
                    if (imgSign && imgSign.signedUrl) {
                        fileToFetchUrl = imgSign.signedUrl;
                    } else {
                        return res.status(400).json({ error: 'File immagine non accessibile.' });
                    }
                }

                const allowedUrlPrefix = `${supabaseUrl}/storage/v1/`;
                if (!fileToFetchUrl.startsWith(allowedUrlPrefix)) {
                    console.error(`[DOC AI] SSRF attempt blocked. URL: ${fileToFetchUrl}`);
                    return res.status(400).json({ error: 'URL del file non valido.' });
                }

                console.log(`[DOC AI] Starting validation for anagrafica_id: ${targetAnagraficaId}`);

                try {
                    const imageResponse = await fetch(fileToFetchUrl);
                    if (!imageResponse.ok) throw new Error('Impossibile scaricare il documento.');

                    const arrayBuffer = await imageResponse.arrayBuffer();
                    const base64Data = Buffer.from(arrayBuffer).toString('base64');
                    let mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
                    if (mimeType.includes('application/pdf')) mimeType = 'image/jpeg';

                    const mistral = new Mistral({ apiKey: mistralApiKey });
                    const todayStr = new Date().toISOString().split('T')[0];
                    const prompt = `Oggi è il ${todayStr} (fornita come riferimento contestuale per il formato delle date — NON usarla per calcolare se il documento è scaduto, la verifica temporale è delegata a un sistema separato). Sei un esperto di documenti di identità italiani. Ti fornisco l'immagine di un documento di identità (Carta d'Identità, Passaporto o Patente di Guida). Devi estrarre queste informazioni in formato JSON STRICT: 1. tipo_documento (stringa: "CARTA_IDENTITA", "PASSAPORTO", "PATENTE" oppure "ALTRO"), 2. data_scadenza (formato YYYY-MM-DD, null se non leggibile), 3. leggibile (booleano), 4. stato (stringa: "VERDE" se l'immagine è un documento d'identità valido e ben leggibile; "GIALLO" se l'immagine è sfuocata, tagliata o i dati non sono ben leggibili; "ROSSO" se l'immagine non è un documento d'identità valido), 5. note (breve spiegazione). Rispondi SOLO con il JSON senza markdown. Esempio: {"tipo_documento":"CARTA_IDENTITA","data_scadenza":"2029-05-10","leggibile":true,"stato":"VERDE","note":"Documento d'identità leggibile e ben fotografato."}`;

                    const response = await mistral.chat.complete({
                        model: 'pixtral-12b-2409',
                        responseFormat: { type: 'json_object' },
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', imageUrl: `data:${mimeType};base64,${base64Data}` }
                            ]
                        }]
                    });

                    let responseText = (typeof response.choices[0].message.content === 'string' ? response.choices[0].message.content : JSON.stringify(response.choices[0].message.content)).trim()
                        .replace(/```json/g, '').replace(/```/g, '').trim();
                    console.log('[DOC AI] Mistral response length:', responseText.length);
                    const aiResult = JSON.parse(responseText);
                    finalStatus = aiResult.stato || 'GIALLO';
                    finalNotes = aiResult.note || 'Impossibile interpretare la risposta AI';
                    finalExpiry = aiResult.data_scadenza || null;

                    // Guardrail Deterministico Javascript su Date Scadenza Documenti d'Identità
                    if (finalExpiry) {
                        const expiryDate = new Date(finalExpiry);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (expiryDate < today) {
                            finalStatus = 'ROSSO';
                            finalNotes = `Documento scaduto il ${finalExpiry}. (Nota AI: ${finalNotes})`;
                        }
                    }
                } catch (aiErr) {
                    console.error('[DOC AI ERROR] Fallback a GIALLO:', aiErr.message);
                    finalStatus = 'GIALLO';
                    finalNotes = "Formato documento non leggibile automaticamente dall'AI (richiede revisione manuale).";
                }
            }

            const updatePayload = { stato_validazione: finalStatus, note_ai: finalNotes };
            if (finalExpiry) updatePayload.data_scadenza = finalExpiry;

            let dbQuery = supabase.from('documenti_identita').update(updatePayload);
            if (doc_id) {
                dbQuery = dbQuery.eq('id', doc_id);
            } else {
                const { data: latestDoc } = await supabase
                    .from('documenti_identita')
                    .select('id')
                    .eq('anagrafica_id', targetAnagraficaId)
                    .eq('stato_validazione', 'IN_ATTESA')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (!latestDoc?.id) {
                    console.warn('[DOC VALIDATION] Nessun doc IN_ATTESA trovato per anagrafica_id:', targetAnagraficaId);
                    return res.status(200).json({ message: 'Nessun documento IN_ATTESA trovato, skip.' });
                }
                dbQuery = dbQuery.eq('id', latestDoc.id);
            }
            const { error: updateError } = await dbQuery;
            if (updateError) throw updateError;
            console.log(`[DOC VALIDATION] Updated. doc_id: ${doc_id || 'N/A'}, stato: ${finalStatus}`);

            const { data: profile } = await supabase.from('anagrafiche').select('nome, utenti(email)').eq('id', targetAnagraficaId).single();
            if (profile?.utenti?.email) {
                const userEmail = profile.utenti.email;
                const nomeUtente = profile.nome;
                if (finalStatus === 'ROSSO') {
                    await sendEmail({
                        to: userEmail,
                        subject: 'Problema con il tuo Documento di Identità - Adrenalina Club',
                        html: `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center"><h1 style="color:#df293e">ADRENALINA CLUB</h1><p>Ciao ${nomeUtente}, il documento di identità caricato non è stato accettato.</p><p style="color:#aaa;font-size:13px">Motivazione: <strong>${finalNotes}</strong></p><a href="https://portal.adrenalinaclub.it/portal/dashboard.html" style="background:#df293e;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:15px">AGGIORNA DOCUMENTO</a></div>`
                    });
                } else if (finalStatus === 'GIALLO' && !isManual) {
                    await sendEmail({
                        to: userEmail,
                        subject: 'Documento di Identità in Verifica - Adrenalina Club',
                        html: `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center"><h1 style="color:#df293e">ADRENALINA CLUB</h1><p>Ciao ${nomeUtente}, il documento di identità è in attesa di verifica manuale. Riceverai una conferma a breve.</p></div>`
                    });
                }
            }

            return res.status(200).json({ success: true, result: updatePayload });
        }

    } catch (error) {
        console.error('[VALIDATE] Error:', error);

        // Fallback: porta a GIALLO il record che ha causato il crash (solo per chiamate automatiche)
        if (!req.body?.is_manual) {
            try {
                const supaFallback = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                const fallbackNote = "Errore tecnico di sistema durante l'elaborazione AI (Crash Backend). Richiesta revisione manuale.";
                const targetType = req.body?.target_type || (req.body?.table === 'documenti_identita' ? 'doc' : 'cert');

                if (targetType === 'cert') {
                    const certId = req.body?.cert_id || req.body?.record?.id;
                    if (certId) await supaFallback.from('certificati_medici').update({ stato_validazione: 'GIALLO', note_ai: fallbackNote }).eq('id', certId);
                } else {
                    const docId = req.body?.doc_id || req.body?.record?.id;
                    if (docId) await supaFallback.from('documenti_identita').update({ stato_validazione: 'GIALLO', note_ai: fallbackNote }).eq('id', docId);
                }
            } catch (dbErr) {
                console.error('[VALIDATE] Failed fallback GIALLO:', dbErr);
            }
        }

        return res.status(500).json({ error: 'Si è verificato un errore durante la validazione. Riprova più tardi.' });
    }
}
