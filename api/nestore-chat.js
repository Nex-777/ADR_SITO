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

        // 6. Data Odierna e Riferimenti Temporali (Timezone Europe/Rome)
        const adesso = new Date();
        const formatterData = new Intl.DateTimeFormat('it-IT', {
            timeZone: 'Europe/Rome',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formatterIso = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Europe/Rome'
        });
        const oggiIso = formatterIso.format(adesso); // es. "2026-09-08"
        const oggiDesc = formatterData.format(adesso); // es. "martedì 8 settembre 2026"
        const ieriDate = new Date(adesso.getTime() - 86400000);
        const ieriIso = formatterIso.format(ieriDate); // es. "2026-09-07"

        // 7. Recupera Contesto Utente (Anagrafica + Storico Pesi + Storico Allenamenti + Storico Pasti + Chat History)
        const [userRes, pesiRes, allenamentiRes, pastiRes, historyRes] = await Promise.all([
            supabaseAdmin.from('utenti').select('nome, cognome').eq('id', utenteId).maybeSingle(),
            supabaseAdmin.from('nestore_pesi_misure')
                .select('data_rilevazione, peso_kg, vita_cm, torace_cm, braccio_dx_cm, note')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_rilevazione', { ascending: false })
                .limit(30),
            supabaseAdmin.from('nestore_allenamenti')
                .select('data_allenamento, corso_disciplina, durata_minuti, rpe_fatica, note')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_allenamento', { ascending: false })
                .limit(30),
            supabaseAdmin.from('nestore_pasti')
                .select('data_pasto, tipo_pasto, descrizione, calorie_stimate, proteine_g, carboidrati_g, grassi_g')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_pasto', { ascending: false })
                .limit(30),
            supabaseAdmin.from('nestore_chat_messaggi')
                .select('ruolo, contenuto, creato_il')
                .eq('utente_id', utenteId)
                .order('creato_il', { ascending: true })
                .limit(20)
        ]);

        const nomeAtleta = userRes.data?.nome || 'Atleta';

        // Formattazione elenchi storici per il System Prompt
        const pesiList = (pesiRes.data || []).map(p => 
            `- Data ${p.data_rilevazione}: ${p.peso_kg ? p.peso_kg + ' kg' : ''}${p.vita_cm ? ', vita ' + p.vita_cm + 'cm' : ''}${p.torace_cm ? ', torace ' + p.torace_cm + 'cm' : ''}${p.note ? ' (' + p.note + ')' : ''}`
        ).join('\n') || '- Nessun peso ancora registrato';

        const allenamentiList = (allenamentiRes.data || []).map(a =>
            `- Data ${a.data_allenamento}: ${a.corso_disciplina || 'Workout'}${a.durata_minuti ? ' (' + a.durata_minuti + ' min)' : ''}${a.rpe_fatica ? ' RPE ' + a.rpe_fatica + '/10' : ''}${a.note ? ' - ' + a.note : ''}`
        ).join('\n') || '- Nessun allenamento ancora registrato';

        const pastiList = (pastiRes.data || []).map(p =>
            `- Data ${p.data_pasto} [${p.tipo_pasto || 'pasto'}]: ${p.descrizione}${p.calorie_stimate ? ' (~' + p.calorie_stimate + ' kcal)' : ''}`
        ).join('\n') || '- Nessun pasto ancora registrato';

        // 8. System Prompt Specializzato e Contestualizzato
        const systemPrompt = `Sei NESTORE, l'assistente virtuale di fitness, preparazione atletica e nutrizione del club sportivo Adrenalina Club.
Parli direttamente con l'atleta ${nomeAtleta}.

CALENDARIO & DATA DI RIFERIMENTO:
- Oggi è: ${oggiDesc} (Data ISO: ${oggiIso}).
- Ieri era: ${ieriIso}.

STORICO REGISTRAZIONI RECENTI DELL'ATLETA NEL DATABASE:
--- PESO E CIRCONFERENZE ---
${pesiList}

--- ALLENAMENTI E WORKOUT ---
${allenamentiList}

--- PASTI E NUTRIZIONE ---
${pastiList}

LINEE GUIDA E COMPORTAMENTO:
1. Sii motivante, professionale, chiaro e sintetico. Usa un tono energico e da coach esperto.
2. Rispondi con precisione alle domande dell'atleta sui suoi progressi, confrontando i dati storici sopra elencati quando richiesto (es. "quanto pesavo ieri?", "che allenamento ho fatto il 5?", "che progressi ho fatto?").
3. REGISTRAZIONE DATI (PESO, MISURE, PASTI, ALLENAMENTI):
Quando l'atleta comunica dati da registrare, ANCHE SE RIFERITI AL PASSATO (es. "ieri pesavo 75.9kg", "lunedì ho mangiato...", "il 07/09 pesavo 76kg"):
- Riconosci SEMPRE che si tratta di un inserimento dati da salvare.
- Calcola SEMPRE accuratamente la data corrispondente nel formato "YYYY-MM-DD" prendendo come perno la data di oggi (${oggiIso}). Se dice "ieri" imposta "${ieriIso}". Se non specifica date o dice "oggi", imposta "${oggiIso}". Se specifica un giorno/mese, calcolalo coerentemente.
- Rispondi con incoraggiamento o commento tecnico, E ALLA FINE DEL MESSAGGIO INCLUDI OBBLIGATORIAMENTE il blocco di estrazione strutturato:
\`\`\`json:extraction
{
  "tipo": "peso_misure" | "pasto" | "allenamento",
  "data": "YYYY-MM-DD",
  "peso_kg": 75.9,
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
Inserisci nel JSON solo i campi pertinenti al dato comunicato. Il campo "data" DEVE SEMPRE ESSERE PRESENTE in formato YYYY-MM-DD.
Se l'utente fa solo una domanda informativa, chiede un riepilogo o saluta, rispondi usando i dati dello storico e NON inserire il blocco json:extraction.`;

        // 9. Costruzione Payload Conversazionale Multi-Turn per Google Gemini API
        const contents = [];
        let lastRole = null;

        // Inserimento cronologia recente (ultimi messaggi alternati user / model)
        const recentMsgs = historyRes.data || [];
        for (const m of recentMsgs) {
            if (!m.contenuto || typeof m.contenuto !== 'string') continue;
            const geminiRole = m.ruolo === 'assistant' ? 'model' : 'user';

            // Gemini richiede che il primo turno sia sempre 'user'
            if (contents.length === 0 && geminiRole !== 'user') continue;

            if (geminiRole === lastRole) {
                contents[contents.length - 1].parts.push({ text: m.contenuto });
            } else {
                contents.push({
                    role: geminiRole,
                    parts: [{ text: m.contenuto }]
                });
                lastRole = geminiRole;
            }
        }

        // Preparazione messaggio corrente dell'utente
        const currentParts = [];
        if (image_base64) {
            const rawBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
            currentParts.push({
                inline_data: {
                    mime_type: image_mime || 'image/jpeg',
                    data: rawBase64
                }
            });
        }

        currentParts.push({
            text: message || "Analizza questa foto e aiutami a registrarla."
        });

        // Se l'ultimo messaggio nella cronologia era già 'user', aggiungiamo un placeholder model per rispettare l'alternanza
        if (lastRole === 'user') {
            contents.push({
                role: 'model',
                parts: [{ text: "Ricevuto." }]
            });
        }

        // Aggiungi il messaggio utente corrente
        contents.push({
            role: 'user',
            parts: currentParts
        });

        // 10. Invocazione API Gemini (modello gemini-2.5-flash)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

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
