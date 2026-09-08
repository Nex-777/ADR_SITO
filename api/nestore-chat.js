import { createClient } from '@supabase/supabase-js';

// ==============================================================================
// /api/nestore-chat — Assistente AI per atleti corsi Adrenalina Club
// Supporto multimodale (testo + foto), estrazione strutturata dati sport/nutrizione
// ==============================================================================

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

let supabaseAdmin = null;

export default async function handler(req, res) {
    // 1. CORS
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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito.' });

    // 2. Configurazione Environment
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error("Configurazione Supabase mancante.");
        return res.status(500).json({ error: 'Errore configurazione server.' });
    }

    if (!geminiApiKey) {
        console.error("Chiave GEMINI_API_KEY non configurata.");
        return res.status(500).json({ error: 'Servizio AI temporaneamente non disponibile.' });
    }

    if (!supabaseAdmin) {
        supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    }

    try {
        // 3. Autenticazione Bearer Token (SECURITY.md §1.1 & §1.2)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Autenticazione richiesta.' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Sessione non valida o scaduta.' });
        }

        const utenteId = user.id;

        // 4. Rate Limiting (max 60 messaggi/ora per utente)
        const unOraFa = new Date(Date.now() - 3600 * 1000).toISOString();
        const { count: msgCount } = await supabaseAdmin
            .from('nestore_chat_messaggi')
            .select('id', { count: 'exact', head: true })
            .eq('utente_id', utenteId)
            .gte('creato_il', unOraFa);

        if (msgCount && msgCount >= 60) {
            return res.status(429).json({ error: 'Hai raggiunto il limite orario di messaggi per Nestore. Riprova più tardi.' });
        }

        // 5. Parametri Body
        const { message, image_base64, image_mime, conferma_preventiva } = req.body || {};
        if (!message && !image_base64) {
            return res.status(400).json({ error: 'Messaggio o immagine obbligatori.' });
        }

        // 6. Recupera Contesto Utente (Anagrafica + Ultimo peso + Ultimi pasti)
        const [userRes, pesoRes, pastiRes] = await Promise.all([
            supabaseAdmin.from('utenti').select('nome, cognome').eq('id', utenteId).maybeSingle(),
            supabaseAdmin.from('nestore_pesi_misure').select('peso_kg, data_rilevazione').eq('utente_id', utenteId).eq('attivo', true).order('data_rilevazione', { ascending: false }).limit(1).maybeSingle(),
            supabaseAdmin.from('nestore_pasti').select('descrizione, calorie_stimate').eq('utente_id', utenteId).eq('data_pasto', new Date().toISOString().split('T')[0]).eq('attivo', true)
        ]);

        const nomeAtleta = userRes.data?.nome || 'Atleta';
        const ultimoPeso = pesoRes.data?.peso_kg ? `${pesoRes.data.peso_kg} kg (${pesoRes.data.data_rilevazione})` : 'Nessun peso registrato';
        const pastiOggi = (pastiRes.data || []).map(p => `${p.descrizione} (~${p.calorie_stimate || 0} kcal)`).join(', ') || 'Nessun pasto registrato oggi';

        // 7. System Prompt Specializzato
        const systemPrompt = `Sei NESTORE, l'assistente virtuale di fitness, preparazione atletica e nutrizione del club sportivo Adrenalina Club.
Parli direttamente con l'atleta ${nomeAtleta}.
Il suo ultimo peso registrato è: ${ultimoPeso}.
Pasti registrati oggi: ${pastiOggi}.

LINEE GUIDA E COMPORTAMENTO:
1. Sii motivante, professionale, chiaro e sintetico. Usa un tono energico e da coach esperto.
2. Aiuta l'atleta a monitorare:
   - Peso corporeo e misurazioni (collo, torace, vita, fianchi, braccia, cosce).
   - Allenamenti, esercizi, carichi (kg), ripetizioni, serie e scala di fatica RPE (1-10).
   - Dieta, alimenti, stima approssimativa di calorie e macronutrienti (proteine, carboidrati, grassi). Se l'utente invia una foto di un piatto, stima porzione, calorie e macro principali.
3. Se l'utente ti sta comunicando dati da registrare (peso, misure, un pasto consumato o un allenamento svolto), rispondi amichevolmente E includi OBBLIGATORIAMENTE alla fine della risposta un blocco JSON formattato esattamente così:
\`\`\`json:extraction
{
  "tipo": "peso_misure" | "pasto" | "allenamento",
  "peso_kg": 78.5,
  "vita_cm": 84.0,
  "torace_cm": 102.0,
  "tipo_pasto": "colazione" | "pranzo" | "cena" | "snack",
  "descrizione": "Descrizione del pasto",
  "calorie": 650,
  "proteine": 45.0,
  "carboidrati": 70.0,
  "grassi": 18.0,
  "disciplina": "Ibrido" | "SCAB" | "Strongman" | "Altro",
  "durata_minuti": 60,
  "rpe": 8,
  "note": "eventuali note"
}
\`\`\`
Inserisci nel JSON solo i campi pertinenti a ciò che l'utente ha comunicato (ometti i campi non menzionati o non rilevabili). Se l'utente fa solo una domanda informativa o saluta, NON inserire il blocco json:extraction.`;

        // 8. Costruzione Payload per Google Gemini API
        const contents = [];
        const userParts = [];

        if (image_base64) {
            const rawBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
            userParts.push({
                inline_data: {
                    mime_type: image_mime || 'image/jpeg',
                    data: rawBase64
                }
            });
        }

        userParts.push({
            text: message || "Analizza questa foto e aiutami a registrarla."
        });

        contents.push({
            role: 'user',
            parts: userParts
        });

        // 9. Invocazione API Gemini (modello gemini-1.5-flash)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents: contents,
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1000
                }
            })
        });

        if (!geminiResponse.ok) {
            const errBody = await geminiResponse.text().catch(() => '');
            console.error("Gemini API error status:", geminiResponse.status, errBody);
            return res.status(502).json({ error: "Errore durante l'elaborazione da parte dell'intelligenza artificiale. Riprova." });
        }

        const geminiData = await geminiResponse.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Non ho potuto elaborare una risposta. Riprova.";

        // 10. Estrazione blocco JSON se presente
        let cleanReply = rawText;
        let extractionPayload = null;
        const extractionRegex = /```json:extraction\s*([\s\S]*?)\s*```/;
        const match = rawText.match(extractionRegex);

        if (match && match[1]) {
            try {
                extractionPayload = JSON.parse(match[1]);
                // Rimuovi il blocco JSON dal testo mostrato all'utente
                cleanReply = rawText.replace(extractionRegex, '').trim();
            } catch (jsonErr) {
                console.warn("Errore parsing extraction JSON:", jsonErr);
            }
        }

        // 11. Gestione Salvataggio Diretto vs Controllo Preventivo
        let salvatoDirettamente = false;
        const richiedeConferma = conferma_preventiva !== false;

        if (extractionPayload && !richiedeConferma) {
            const oggi = new Date().toISOString().split('T')[0];
            try {
                if (extractionPayload.tipo === 'peso_misure') {
                    await supabaseAdmin.from('nestore_pesi_misure').insert({
                        utente_id: utenteId,
                        data_rilevazione: extractionPayload.data || oggi,
                        peso_kg: extractionPayload.peso_kg || null,
                        vita_cm: extractionPayload.vita_cm || null,
                        torace_cm: extractionPayload.torace_cm || null,
                        collo_cm: extractionPayload.collo_cm || null,
                        fianchi_cm: extractionPayload.fianchi_cm || null,
                        braccio_dx_cm: extractionPayload.braccio_dx_cm || null,
                        braccio_sx_cm: extractionPayload.braccio_sx_cm || null,
                        coscia_dx_cm: extractionPayload.coscia_dx_cm || null,
                        coscia_sx_cm: extractionPayload.coscia_sx_cm || null,
                        note: extractionPayload.note || null
                    });
                    salvatoDirettamente = true;
                } else if (extractionPayload.tipo === 'pasto') {
                    await supabaseAdmin.from('nestore_pasti').insert({
                        utente_id: utenteId,
                        data_pasto: extractionPayload.data || oggi,
                        tipo_pasto: extractionPayload.tipo_pasto || 'pranzo',
                        descrizione: extractionPayload.descrizione || 'Pasto',
                        calorie_stimate: extractionPayload.calorie || null,
                        proteine_g: extractionPayload.proteine || null,
                        carboidrati_g: extractionPayload.carboidrati || null,
                        grassi_g: extractionPayload.grassi || null
                    });
                    salvatoDirettamente = true;
                } else if (extractionPayload.tipo === 'allenamento') {
                    await supabaseAdmin.from('nestore_allenamenti').insert({
                        utente_id: utenteId,
                        data_allenamento: extractionPayload.data || oggi,
                        corso_disciplina: extractionPayload.disciplina || 'Generale',
                        durata_minuti: extractionPayload.durata_minuti || null,
                        scheda_dati: extractionPayload.esercizi || [],
                        rpe_fatica: extractionPayload.rpe || null,
                        note: extractionPayload.note || null
                    });
                    salvatoDirettamente = true;
                }
            } catch (saveErr) {
                console.error("Errore salvataggio diretto dati:", saveErr);
            }
        }

        // 12. Salvataggio Messaggi in nestore_chat_messaggi
        // Salva messaggio utente
        await supabaseAdmin.from('nestore_chat_messaggi').insert({
            utente_id: utenteId,
            ruolo: 'user',
            contenuto: message || '(Foto allegata)',
            metadata: image_base64 ? { has_image: true } : {}
        });

        // Salva risposta assistente
        const { data: assistantMsg } = await supabaseAdmin
            .from('nestore_chat_messaggi')
            .insert({
                utente_id: utenteId,
                ruolo: 'assistant',
                contenuto: cleanReply,
                metadata: extractionPayload ? {
                    dati_estratti: extractionPayload,
                    salvato: salvatoDirettamente
                } : {}
            })
            .select('id')
            .maybeSingle();

        // 13. Risposta JSON
        return res.status(200).json({
            reply: cleanReply,
            extraction_payload: extractionPayload,
            salvato_direttamente: salvatoDirettamente,
            messaggio_id: assistantMsg?.id || null
        });

    } catch (err) {
        console.error("Eccezione in nestore-chat:", err);
        return res.status(500).json({ error: 'Errore interno del server. Riprova più tardi.' });
    }
}
