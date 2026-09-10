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

        if (message && typeof message === 'string' && message.length > 1500) {
            return res.status(400).json({ error: 'Messaggio troppo lungo. Il limite massimo è di 1500 caratteri.' });
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
                .order('creato_il', { ascending: false })
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
1. TONO E STILE DI RISPOSTA:
- Sii secco, essenziale e professionale. EVITA ASSOLUTAMENTE frasi motivazionali, incoraggiamenti o slogan da palestra (es. MAI dire "Avanti tutta!", "Ottimo lavoro!", "Sei un grande!", "La precisione fa la differenza!"). NON usare emoji di muscoli o esclamazioni enfatiche.
- Quando registri un dato completo, rispondi con una sola riga essenziale nel formato:
  "Registrato: [riepilogo sintetico del dato]."
  Esempi:
  - Pasto: "Registrato: Pranzo — 100g zucchine, 2 uova, 80g pane (~375 kcal)."
  - Peso: "Registrato: 75.9 kg." oppure "Registrato: Peso 75.9 kg — 7 settembre 2026."
  - Allenamento: "Registrato: Strongman — 60 min, RPE 8/10."
- Quando rispondi a domande informative o storiche dell'atleta (es. "quanto pesavo ieri?", "che allenamenti ho fatto?"), rispondi in modo asciutto e diretto fornendo i dati numerici e fattuali senza fronzoli.

2. PROTOCOLLO DATI INCOMPLETI & ACCUMULO PASTI (FONDAMENTALE):
A) PASTI & NUTRIZIONE:
- Se l'atleta menziona alimenti o ingredienti MA MANCA il momento del pasto (colazione, pranzo, cena, snack) oppure menziona solo un ingrediente isolato (es. "le zucchine 100 grammi", "una mela", "80g di riso"):
  NON emettere il blocco json:extraction e NON salvare un pasto parziale!
  Fai invece subito una domanda secca e diretta per completare l'informazione:
  "Quando le hai mangiate? (colazione, pranzo, cena o snack?) C'era altro nel pasto?"
- Quando l'atleta risponde specificando il momento o aggiungendo ingredienti (es. dopo aver detto "100g zucchine" dice "a pranzo con due uova e 80g di pane"):
  RIUNISCI E AGGREGA TUTTI gli alimenti della conversazione riferiti a quel pasto in una singola descrizione completa (es. "100g zucchine, 2 uova, 80g pane").
  Calcola le calorie e i macronutrienti COMPLESSIVI di TUTTI gli ingredienti sommati insieme.
  Emetti SOLO ALLORA il blocco json:extraction con la somma totale reale!
- Se l'atleta risponde che non c'era altro (es. "solo quello a pranzo", "è tutto"), allora e solo allora registra quell'unico alimento per quel pasto.
- Se l'atleta fornisce fin da subito un pasto completo con momento e ingredienti (es. "a pranzo ho mangiato 100g pasta al pomodoro e 150g petto di pollo"), calcola il totale ed emetti subito il blocco json:extraction.

B) ALLENAMENTI:
- Se l'atleta dice solo "mi sono allenato" o "ho fatto palestra" senza indicare disciplina, durata o esercizi:
  NON emettere il blocco json:extraction. Chiedi in modo secco: "Che allenamento hai fatto e per quanto tempo?"
- Appena fornisce i dettagli, registra ed emetti json:extraction.

C) PESO E MISURE:
- Se l'atleta dice "mi sono pesato" senza indicare il valore in kg:
  NON emettere il blocco json:extraction. Chiedi: "Qual è il tuo peso in kg?"
- Se l'atleta fornisce il peso (es. "75.9 kg", "pesavo 76"), emetti subito il blocco json:extraction.

3. TABELLA DI RIFERIMENTO PER CALCOLO CALORIE E MACRONUTRIENTI:
Calcola le stime basandoti su questi standard nutrizionali realistici (MAI stimare 10-20 kcal per pasti completi):
- Verdure comuni / zucchine / pomodori / insalata: ~15-25 kcal / 100g (P 1-2g, C 3g, G 0.2g)
- Uovo intero medio: ~75-80 kcal ciascuno (P 6.5-7g, C 0.4g, G 5.5g) -> 2 uova = ~150 kcal
- Pane comune (bianco / comune / integrale): ~260-270 kcal / 100g (P 8-9g, C 50-54g, G 1-1.5g) -> 80g pane = ~210 kcal
- Pasta o riso (pesati a crudo): ~350-360 kcal / 100g (P 12g, C 72g, G 1.5g)
- Pasta o riso (cotti): ~130-150 kcal / 100g
- Carne bianca magra (pollo, tacchino): ~110-130 kcal / 100g (P 23-25g, G 1-2g)
- Carne rossa magra (manzo): ~160-200 kcal / 100g (P 20-22g, G 8-12g)
- Pesce bianco magro (merluzzo, spigola): ~80-100 kcal / 100g (P 18-20g, G 1g)
- Salmone / pesce grasso: ~180-210 kcal / 100g (P 20g, G 12-14g)
- Olio extravergine d'oliva: 1 cucchiaio (~10g) = 90 kcal (G 10g)
- Frutta media (mela, pera, banana): ~60-90 kcal (C 15-22g)
- Proteine in polvere (1 scoop ~30g): ~110-120 kcal (P 24g, C 2g, G 1.5g)

4. FORMATO ESTRAZIONE JSON (QUANDO IL DATO È COMPLETO):
Quando tutti i dati necessari sono presenti, ALLA FINE del tuo messaggio di risposta (dopo la riga "Registrato: ...") aggiungi OBBLIGATORIAMENTE il blocco:
\`\`\`json:extraction
{
  "tipo": "peso_misure" | "pasto" | "allenamento",
  "data": "YYYY-MM-DD",
  "peso_kg": 75.9,
  "vita_cm": 84.0,
  "torace_cm": 102.0,
  "tipo_pasto": "colazione" | "pranzo" | "cena" | "snack",
  "descrizione": "Descrizione sintetica degli alimenti",
  "calorie": 375,
  "proteine": 21.0,
  "carboidrati": 46.0,
  "grassi": 12.0,
  "disciplina": "Ibrido" | "SCAB" | "Strongman" | "Altro",
  "durata_minuti": 60,
  "rpe": 8,
  "note": "eventuali note"
}
\`\`\`
Inserisci nel JSON solo i campi pertinenti.
Il campo "data" DEVE SEMPRE ESSERE PRESENTE in formato YYYY-MM-DD (usando "${oggiIso}" per oggi o "${ieriIso}" per ieri o la data calcolata).
Se l'utente fa solo una domanda, saluta o i dati sono ancora INCOMPLETI, NON INSERIRE IL BLOCCO json:extraction.`;

        // 9. Costruzione Payload Conversazionale Multi-Turn per Google Gemini API
        const contents = [];
        let lastRole = null;

        // Inserimento cronologia recente (ultimi messaggi alternati user / model in ordine cronologico)
        const recentMsgs = (historyRes.data || []).slice().reverse();
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
                    temperature: 0.2,
                    maxOutputTokens: 4096,
                    thinkingConfig: { thinkingBudget: 1024 }
                }
            })
        });

        if (!geminiResponse.ok) {
            const errBody = await geminiResponse.text().catch(() => '');
            console.error("Gemini API error status:", geminiResponse.status, errBody);
            return res.status(502).json({ error: "Errore durante l'elaborazione da parte dell'intelligenza artificiale. Riprova." });
        }

        const geminiData = await geminiResponse.json();
        const candidate = geminiData.candidates?.[0];
        const finishReason = candidate?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
            console.warn(`[nestore-chat] Gemini finishReason: ${finishReason}`);
        }

        const rawText = candidate?.content?.parts?.[0]?.text || "Non ho potuto elaborare una risposta. Riprova.";

        // 10. Estrazione blocco JSON se presente (con fallback resiliente)
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
        } else if (rawText.includes('```json:extraction')) {
            // Fallback: blocco extraction non chiuso (es. troncamento anomalo)
            // Rimuove tassativamente la sintassi codice dal testo visibile all'utente
            console.warn("[nestore-chat] Trovato blocco json:extraction non chiuso, pulizia testo e tentato recupero.");
            const partialRegex = /```json:extraction[\s\S]*/;
            const partialMatch = rawText.match(partialRegex);
            if (partialMatch) {
                const jsonFragment = partialMatch[0].replace('```json:extraction', '').trim();
                try {
                    let repairedJson = jsonFragment;
                    const openBraces = (repairedJson.match(/\{/g) || []).length;
                    const closeBraces = (repairedJson.match(/\}/g) || []).length;
                    if (openBraces > closeBraces) {
                        repairedJson = repairedJson.replace(/,\s*$/, '').trim() + '\n}'.repeat(openBraces - closeBraces);
                        extractionPayload = JSON.parse(repairedJson);
                        console.info("[nestore-chat] Recuperato extractionPayload da JSON parziale:", extractionPayload);
                    }
                } catch (repairErr) {
                    console.warn("[nestore-chat] Impossibile recuperare JSON parziale:", repairErr.message);
                }
                cleanReply = rawText.replace(partialRegex, '').trim();
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
