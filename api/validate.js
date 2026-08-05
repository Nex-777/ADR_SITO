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
            if (authError || !user) return res.status(401).json({ error: 'Token non valido o sessione scaduta.' });

            const { data: userProfile } = await supabase.from('utenti').select('ruolo').eq('id', user.id).single();
            if (!userProfile) return res.status(403).json({ error: 'Accesso negato.' });

            const userRoles = Array.isArray(userProfile.ruolo) ? userProfile.ruolo : [userProfile.ruolo];
            if (!userRoles.some(r => BOARD_ROLES.includes(r))) {
                return res.status(403).json({ error: 'Accesso negato: operazione riservata al direttivo.' });
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

            if (isManual && cert_id && !targetAnagraficaId) {
                const { data: certObj } = await supabase.from('certificati_medici').select('anagrafica_id').eq('id', cert_id).maybeSingle();
                if (certObj) targetAnagraficaId = certObj.anagrafica_id;
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
                finalNotes = note || 'Approvazione manuale del direttivo.';
                let certQuery = supabase.from('certificati_medici').select('*');
                certQuery = cert_id ? certQuery.eq('id', cert_id) : certQuery.eq('anagrafica_id', targetAnagraficaId);
                const { data: currentCert } = await certQuery.maybeSingle();
                if (currentCert) {
                    finalRelease = currentCert.data_rilascio;
                    finalExpiry = currentCert.data_scadenza;
                    finalType = currentCert.tipologia;
                }
            } else {
                if (!targetFileUrl) return res.status(400).json({ error: 'Parametri mancanti: file_url per AI.' });

                let fileToFetchUrl = targetFileUrl;
                if (!fileToFetchUrl.startsWith('https://')) {
                    let pathToSign = fileToFetchUrl;
                    if (pathToSign.toLowerCase().endsWith('.pdf')) {
                        const thumbPath = pathToSign.replace(/\.pdf$/i, '_thumb.jpg');
                        const { data: thumbSign } = await supabase.storage.from('certificati_medici').createSignedUrl(thumbPath, 120);
                        if (thumbSign?.signedUrl) pathToSign = thumbPath;
                    }
                    const { data: signedData } = await supabase.storage.from('certificati_medici').createSignedUrl(pathToSign, 120);
                    if (!signedData?.signedUrl) return res.status(400).json({ error: 'File non accessibile.' });
                    fileToFetchUrl = signedData.signedUrl;
                } else if (fileToFetchUrl.toLowerCase().includes('.pdf')) {
                    const thumbUrl = fileToFetchUrl.replace(/\.pdf(\?.*)?$/i, '_thumb.jpg$1');
                    try {
                        const testResp = await fetch(thumbUrl, { method: 'HEAD' });
                        if (testResp.ok) fileToFetchUrl = thumbUrl;
                    } catch (hErr) {
                        console.warn(`[CERT AI] Thumb HEAD check failed:`, hErr);
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
Sei un assistente medico-legale esperto in certificati medici sportivi italiani.
Sto per fornirti un'immagine di un certificato medico.
IMPORTANTE: La data odierna è il ${todayStr}. Utilizzala come punto di riferimento per verificare se il certificato è scaduto.

Devi estrarre le date esatte scritte sul documento. Ignora qualsiasi altra informazione esterna.
Se le date presenti sul certificato indicano che è scaduto rispetto a oggi, lo stato DEVE essere "ROSSO".

REQUISITO FONDAMENTALE SULLE DICITURE DI IDONEITÀ:
Affinché il certificato sia valido per il tesseramento sportivo, sul documento DEVE ESSERE PRESENTE IN MODO CHIARO ED ESPLICITO almeno una delle seguenti parole/diciture (senza distinzione tra maiuscole e minuscole):
- "AGONISTICO"
- "AGONISTICI"
- "NON AGONISTICO"
- "NON AGONISTICI"

Se il certificato NON contiene nessuna di queste parole esplicite (ad esempio se riporta soltanto "attività ludico-motoria", "ludico-ricreativa", "attività amatoriale" o altre diciture prive dei termini sopra indicati), il certificato NON È VALIDO ai fini del tesseramento sportivo e lo stato DEVE essere tassativamente "ROSSO".

Devi estrarre le seguenti informazioni in formato JSON STRICT:
1. data_emissione (formato YYYY-MM-DD, la data in cui il certificato è stato rilasciato)
2. data_scadenza (formato YYYY-MM-DD, la data in cui scade la validità del certificato)
3. agonistico (booleano, true se specifica idoneità agonistica, false se specifica non agonistica)
4. stato (stringa: "VERDE" se il certificato è originale, leggibile, in corso di validità e contiene esplicitamente una delle diciture obbligatorie AGONISTICO/NON AGONISTICO; "GIALLO" se c'è qualcosa di incomprensibile o non si legge bene; "ROSSO" se il certificato è scaduto rispetto a oggi, non contiene la dicitura obbligatoria o non è un certificato medico).
5. note (una breve spiegazione del perché hai assegnato quello stato).

Rispondi SOLO con il JSON, senza markdown, senza blockquote. Esempio:
{"data_emissione": "2023-10-15", "data_scadenza": "2024-10-14", "agonistico": false, "stato": "VERDE", "note": "Certificato non agonistico valido e leggibile."}
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
                    finalRelease = aiResult.data_emissione || null;
                    finalExpiry = aiResult.data_scadenza || null;
                    finalType = aiResult.agonistico ? 'AGONISTICO' : 'NON_AGONISTICO';

                    // Guardrail Deterministico Javascript su Date Scadenza Certificati
                    if (finalExpiry) {
                        const expiryDate = new Date(finalExpiry);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (expiryDate < today) {
                            finalStatus = 'ROSSO';
                            finalNotes = `Certificato scaduto il ${finalExpiry}.`;
                        } else if (expiryDate >= today && finalStatus === 'ROSSO') {
                            if (finalType === 'AGONISTICO' || finalType === 'NON_AGONISTICO') {
                                finalStatus = 'VERDE';
                                finalNotes = `Certificato medico valido e leggibile fino al ${finalExpiry} (Validato da JS).`;
                            }
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

            if (isManual && doc_id && !targetAnagraficaId) {
                const { data: docObj } = await supabase.from('documenti_identita').select('anagrafica_id').eq('id', doc_id).maybeSingle();
                if (docObj) targetAnagraficaId = docObj.anagrafica_id;
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
                if (!fileToFetchUrl.startsWith('https://')) {
                    let pathToSign = fileToFetchUrl;
                    if (pathToSign.toLowerCase().endsWith('.pdf')) {
                        const thumbPath = pathToSign.replace(/\.pdf$/i, '_thumb.jpg');
                        const { data: thumbSign } = await supabase.storage.from('documenti_identita').createSignedUrl(thumbPath, 120);
                        if (thumbSign?.signedUrl) pathToSign = thumbPath;
                    }
                    const { data: signedData } = await supabase.storage.from('documenti_identita').createSignedUrl(pathToSign, 120);
                    if (!signedData?.signedUrl) return res.status(400).json({ error: 'File non accessibile.' });
                    fileToFetchUrl = signedData.signedUrl;
                } else if (fileToFetchUrl.toLowerCase().includes('.pdf')) {
                    const thumbUrl = fileToFetchUrl.replace(/\.pdf(\?.*)?$/i, '_thumb.jpg$1');
                    try {
                        const testResp = await fetch(thumbUrl, { method: 'HEAD' });
                        if (testResp.ok) fileToFetchUrl = thumbUrl;
                    } catch (hErr) {
                        console.warn(`[DOC AI] Thumb HEAD check failed:`, hErr);
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
                    const prompt = `Sei un esperto di documenti di identità italiani. La data odierna è il ${todayStr}. Ti fornisco l'immagine di un documento di identità (Carta d'Identità, Passaporto o Patente di Guida). Devi estrarre queste informazioni in formato JSON STRICT: 1. tipo_documento (stringa: "CARTA_IDENTITA", "PASSAPORTO", "PATENTE" oppure "ALTRO"), 2. data_scadenza (formato YYYY-MM-DD, null se non leggibile), 3. leggibile (booleano), 4. stato (stringa: "VERDE" se documento valido non scaduto e leggibile; "GIALLO" se qualcosa non è chiaro; "ROSSO" se chiaramente scaduto o non è un documento valido), 5. note (breve spiegazione). Rispondi SOLO con il JSON senza markdown. Esempio: {"tipo_documento":"CARTA_IDENTITA","data_scadenza":"2029-05-10","leggibile":true,"stato":"VERDE","note":"Documento valido e leggibile."}`;

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
                    const isLegible = aiResult.leggibile === true;
                    const isValidDocType = aiResult.tipo_documento && aiResult.tipo_documento !== 'ALTRO';

                    if (finalExpiry) {
                        const expiryDate = new Date(finalExpiry);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (expiryDate < today) {
                            finalStatus = 'ROSSO';
                            finalNotes = `Documento scaduto il ${finalExpiry}.`;
                        } else if (expiryDate >= today && finalStatus === 'ROSSO') {
                            if (isLegible && isValidDocType) {
                                finalStatus = 'VERDE';
                                finalNotes = `Documento valido e leggibile fino al ${finalExpiry} (Validato da JS).`;
                            }
                        }
                    }
                } catch (aiErr) {
                    console.error('[DOC AI ERROR] Fallback a GIALLO:', aiErr.message);
                    finalStatus = 'GIALLO';
                    finalNotes = "Formato documento non leggibile automaticamente dall'AI (richiede revisione manuale).";
                }
            }

            const updatePayload = { stato_validazione: finalStatus, note_ai: finalNotes, data_scadenza: finalExpiry };
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
                const fallbackNote = "Formato o contenuto documento inviato alla direzione per revisione manuale.";
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
