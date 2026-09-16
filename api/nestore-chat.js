import { createClient } from '@supabase/supabase-js';

// ==============================================================================
// /api/nestore-chat — Assistente AI per atleti corsi Adrenalina Club
// Supporto multimodale (testo + foto), estrazione strutturata sport/nutrizione,
// e gestione Memoria Sintetica "Wiki Atleta" (modello Karpathy, Zero PII)
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

// ==============================================================================
// FUNZIONE CORE: Ricalcolo Wiki Atleta Sintetica (Modello Karpathy)
// Estrae ed aggrega biometria, allenamento e nutrizione SENZA dati sensibili PII
// ==============================================================================
export async function calcolaSchedaAtleta(supabaseClient, utenteId) {
    try {
        const adesso = new Date();
        const formatterIso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' });
        const oggiIso = formatterIso.format(adesso);
        const trentaGiorniFa = new Date(adesso.getTime() - 30 * 86400000).toISOString().split('T')[0];

        // Query aggregata dati atleta
        const [userRes, prefRes, pesiRes, allRes, pastiRes, schedaRes] = await Promise.all([
            supabaseClient.from('utenti').select('data_nascita, codice_fiscale').eq('id', utenteId).maybeSingle(),
            supabaseClient.from('nestore_preferenze').select('altezza_cm, calorie_target, proteine_target_g, peso_target_kg').eq('utente_id', utenteId).maybeSingle(),
            supabaseClient.from('nestore_pesi_misure')
                .select('data_rilevazione, peso_kg, altezza_cm, vita_cm, torace_cm, braccio_dx_cm')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_rilevazione', { ascending: false })
                .limit(60),
            supabaseClient.from('nestore_allenamenti')
                .select('data_allenamento, corso_disciplina, durata_minuti, rpe_fatica')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_allenamento', { ascending: false })
                .limit(60),
            supabaseClient.from('nestore_pasti')
                .select('data_pasto, calorie_stimate, proteine_g, carboidrati_g, grassi_g')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_pasto', { ascending: false })
                .limit(60),
            supabaseClient.from('nestore_scheda_atleta').select('versione').eq('utente_id', utenteId).maybeSingle()
        ]);

        // 1. Biometria Base
        let eta = null;
        if (userRes.data?.data_nascita) {
            const nascita = new Date(userRes.data.data_nascita);
            if (!isNaN(nascita.getTime())) {
                const diffMs = adesso.getTime() - nascita.getTime();
                eta = Math.floor(diffMs / (365.25 * 24 * 3600 * 1000));
            }
        }

        let sesso = 'Non specificato';
        const cf = (userRes.data?.codice_fiscale || '').toUpperCase();
        if (cf.length >= 11) {
            const giorno = parseInt(cf.substring(9, 11), 10);
            if (!isNaN(giorno)) {
                sesso = giorno > 40 ? 'Donna' : 'Uomo';
            }
        }

        // Altezza
        const pesiList = pesiRes.data || [];
        const ultimoConAltezza = pesiList.find(p => p.altezza_cm != null);
        const altezza = prefRes.data?.altezza_cm ? Number(prefRes.data.altezza_cm) : (ultimoConAltezza?.altezza_cm ? Number(ultimoConAltezza.altezza_cm) : null);

        // Peso attuale
        const ultimoPeso = pesiList.find(p => p.peso_kg != null);
        const pesoKg = ultimoPeso ? Number(ultimoPeso.peso_kg) : null;
        const dataUltimoPeso = ultimoPeso ? ultimoPeso.data_rilevazione : null;

        // Trend peso ultimi 30 giorni
        const pesi30gg = pesiList.filter(p => p.data_rilevazione >= trentaGiorniFa && p.peso_kg != null);
        let delta30gg = null;
        if (pesi30gg.length > 1) {
            const primoDelPeriodo = Number(pesi30gg[pesi30gg.length - 1].peso_kg);
            delta30gg = Number((pesoKg - primoDelPeriodo).toFixed(1));
        }

        // BMI
        let bmi = null;
        let bmiCat = 'N/D';
        if (pesoKg && altezza) {
            const hMetri = altezza / 100;
            bmi = Number((pesoKg / (hMetri * hMetri)).toFixed(1));
            if (bmi < 18.5) bmiCat = 'Sottopeso';
            else if (bmi < 25) bmiCat = 'Normopeso';
            else if (bmi < 30) bmiCat = 'Sovrappeso';
            else bmiCat = 'Obesità';
        }

        // BMR (Formula Mifflin-St Jeor)
        let bmr = null;
        if (pesoKg && altezza && eta) {
            const sessoOffset = (sesso === 'Donna') ? -161 : 5;
            bmr = Math.round(10 * pesoKg + 6.25 * altezza - 5 * eta + sessoOffset);
        }

        // 2. Profilo Sportivo & Allenamento (ultimi 30gg)
        const allList = allRes.data || [];
        const all30gg = allList.filter(a => a.data_allenamento >= trentaGiorniFa);
        const sessioniSettimana = Number(((all30gg.length / 30) * 7).toFixed(1));

        // Disciplina più frequente
        const disciplineCount = {};
        for (const a of all30gg) {
            const disc = (a.corso_disciplina || 'Workout generale').trim();
            disciplineCount[disc] = (disciplineCount[disc] || 0) + 1;
        }
        let topDisciplina = 'Nessuna registrazione recente';
        let maxCount = 0;
        for (const [disc, count] of Object.entries(disciplineCount)) {
            if (count > maxCount) {
                maxCount = count;
                topDisciplina = disc;
            }
        }

        // RPE medio delle ultime sessioni
        const rpeArr = allList.filter(a => a.rpe_fatica != null).slice(0, 10);
        const rpeMedio = rpeArr.length ? Number((rpeArr.reduce((s, a) => s + a.rpe_fatica, 0) / rpeArr.length).toFixed(1)) : null;

        // TDEE stimato
        let tdee = null;
        if (bmr) {
            let fattore = 1.2;
            if (sessioniSettimana >= 5) fattore = 1.65;
            else if (sessioniSettimana >= 3) fattore = 1.5;
            else if (sessioniSettimana >= 1.5) fattore = 1.35;
            tdee = Math.round(bmr * fattore);
        }

        // 3. Profilo Nutrizionale (ultimi 30gg)
        const pastiList = pastiRes.data || [];
        const pasti30gg = pastiList.filter(p => p.data_pasto >= trentaGiorniFa);
        const giorniPasti = {};
        for (const p of pasti30gg) {
            if (!giorniPasti[p.data_pasto]) {
                giorniPasti[p.data_pasto] = { kcal: 0, pro: 0, carb: 0, fat: 0 };
            }
            giorniPasti[p.data_pasto].kcal += Number(p.calorie_stimate || 0);
            giorniPasti[p.data_pasto].pro += Number(p.proteine_g || 0);
            giorniPasti[p.data_pasto].carb += Number(p.carboidrati_g || 0);
            giorniPasti[p.data_pasto].fat += Number(p.grassi_g || 0);
        }
        const numGiorniTracciati = Object.keys(giorniPasti).length;
        let avgKcal = 0, avgPro = 0, avgCarb = 0, avgFat = 0;
        if (numGiorniTracciati > 0) {
            const sommaTot = Object.values(giorniPasti).reduce((acc, g) => {
                acc.kcal += g.kcal;
                acc.pro += g.pro;
                acc.carb += g.carb;
                acc.fat += g.fat;
                return acc;
            }, { kcal: 0, pro: 0, carb: 0, fat: 0 });
            avgKcal = Math.round(sommaTot.kcal / numGiorniTracciati);
            avgPro = Math.round(sommaTot.pro / numGiorniTracciati);
            avgCarb = Math.round(sommaTot.carb / numGiorniTracciati);
            avgFat = Math.round(sommaTot.fat / numGiorniTracciati);
        }

        // 4. Composizione Markdown Sintetico (Karpathy Wiki Style)
        let bioMd = `- Età: ${eta ? eta + ' anni' : 'Non specificata'} | Sesso biologico: ${sesso}\n`;
        bioMd += `- Altezza: ${altezza ? altezza + ' cm' : 'Non ancora inserita'}\n`;
        bioMd += `- Peso attuale: ${pesoKg ? pesoKg + ' kg (al ' + dataUltimoPeso + ')' : 'Nessuna pesata registrata'}`;
        if (prefRes.data?.peso_target_kg) bioMd += ` | Target peso: ${prefRes.data.peso_target_kg} kg`;
        bioMd += '\n';
        if (delta30gg !== null) {
            const freccia = delta30gg > 0 ? `+${delta30gg} kg ▲` : `${delta30gg} kg ▼`;
            bioMd += `- Variazione peso (ultimi 30gg): ${freccia}\n`;
        }
        if (bmi) bioMd += `- Indice Massa Corporea (BMI): ${bmi} (${bmiCat})\n`;
        if (bmr) bioMd += `- Metabolismo Basale (BMR stimato): ~${bmr} kcal/die\n`;
        if (tdee) bioMd += `- Fabbisogno Energetico (TDEE stimato): ~${tdee} kcal/die\n`;

        let allMd = `- Disciplina dominante: ${topDisciplina}\n`;
        allMd += `- Frequenza allenamenti: ${sessioniSettimana} sessioni/settimana (${all30gg.length} sessioni negli ultimi 30gg)\n`;
        if (rpeMedio) allMd += `- Intensità media percepita (RPE): ${rpeMedio} / 10\n`;

        let nutMd = '';
        if (prefRes.data?.calorie_target || prefRes.data?.proteine_target_g) {
            nutMd += `- Target stabiliti: ${prefRes.data.calorie_target ? prefRes.data.calorie_target + ' kcal/die' : ''}${prefRes.data.proteine_target_g ? ' | ' + prefRes.data.proteine_target_g + 'g proteine' : ''}\n`;
        }
        if (numGiorniTracciati > 0) {
            nutMd += `- Intake medio 30gg (${numGiorniTracciati} gg tracciati): ~${avgKcal} kcal/die (Proteine: ${avgPro}g, Carboidrati: ${avgCarb}g, Grassi: ${avgFat}g)\n`;
        } else {
            nutMd += `- Nessun pasto registrato negli ultimi 30 giorni.\n`;
        }

        const dataOraAggiornamento = new Intl.DateTimeFormat('it-IT', {
            timeZone: 'Europe/Rome',
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(adesso);

        const schedaMarkdown = `SCHEDA WIKI ATLETA (Aggiornata al ${dataOraAggiornamento})
--------------------------------------------------
[BIOMETRIA & PARAMETRI CORPOREI]
${bioMd.trim()}

[PROFILO ALLENAMENTO & PERFORMANCE]
${allMd.trim()}

[NUTRIZIONE & OBIETTIVI ENERGETICI]
${nutMd.trim()}`;

        const biometriaObj = {
            eta,
            sesso,
            altezza_cm: altezza,
            peso_kg: pesoKg,
            peso_target_kg: prefRes.data?.peso_target_kg || null,
            data_ultimo_peso: dataUltimoPeso,
            delta_30gg: delta30gg,
            bmi,
            bmi_categoria: bmiCat,
            bmr,
            tdee_stimato: tdee
        };

        const allenamentoObj = {
            sessioni_settimana: sessioniSettimana,
            totale_sessioni_30gg: all30gg.length,
            disciplina_principale: topDisciplina,
            rpe_medio: rpeMedio
        };

        const nutrizioneObj = {
            calorie_target: prefRes.data?.calorie_target || null,
            proteine_target_g: prefRes.data?.proteine_target_g || null,
            media_kcal: avgKcal,
            media_pro_g: avgPro,
            media_carb_g: avgCarb,
            media_fat_g: avgFat,
            giorni_tracciati_30gg: numGiorniTracciati
        };

        const nuovaVersione = (schedaRes.data?.versione || 0) + 1;

        await supabaseClient.from('nestore_scheda_atleta').upsert({
            utente_id: utenteId,
            scheda_markdown: schedaMarkdown,
            biometria: biometriaObj,
            allenamento: allenamentoObj,
            nutrizione: nutrizioneObj,
            versione: nuovaVersione,
            aggiornato_il: adesso.toISOString()
        });

        return {
            scheda_markdown: schedaMarkdown,
            biometria: biometriaObj,
            allenamento: allenamentoObj,
            nutrizione: nutrizioneObj,
            versione: nuovaVersione,
            aggiornato_il: adesso.toISOString()
        };
    } catch (err) {
        console.error("Errore in calcolaSchedaAtleta:", err);
        return null;
    }
}

// ==============================================================================
// HANDLER PRINCIPALE
// ==============================================================================
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

        // 5. Azioni speciali (recalculate_wiki, save_height)
        const { action, message, image_base64, image_mime, conferma_preventiva, altezza_cm } = req.body || {};

        if (action === 'recalculate_wiki') {
            const schedaData = await calcolaSchedaAtleta(supabaseAdmin, utenteId);
            return res.status(200).json({ success: true, scheda: schedaData });
        }

        if (action === 'save_height') {
            const altNum = parseFloat(altezza_cm);
            if (!altNum || isNaN(altNum) || altNum < 100 || altNum > 250) {
                return res.status(400).json({ error: 'Altezza non valida. Inserisci un valore in cm (es. 175).' });
            }
            await supabaseAdmin.from('nestore_preferenze').upsert({
                utente_id: utenteId,
                altezza_cm: altNum,
                aggiornato_il: new Date().toISOString()
            });
            const schedaData = await calcolaSchedaAtleta(supabaseAdmin, utenteId);
            return res.status(200).json({ success: true, altezza_cm: altNum, scheda: schedaData });
        }

        // 6. Validazione parametri per messaggio standard
        if (!message && !image_base64) {
            return res.status(400).json({ error: 'Messaggio o immagine obbligatori.' });
        }

        if (message && typeof message === 'string' && message.length > 1500) {
            return res.status(400).json({ error: 'Messaggio troppo lungo. Il limite massimo è di 1500 caratteri.' });
        }

        // 7. Riferimenti Temporali (Timezone Europe/Rome)
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
        const oggiIso = formatterIso.format(adesso);
        const oggiDesc = formatterData.format(adesso);
        const ieriDate = new Date(adesso.getTime() - 86400000);
        const ieriIso = formatterIso.format(ieriDate);

        // 8. Recupera Scheda Atleta (Wiki Karpathy) + Working Memory odierna + Chat History
        // ZERO PII: Non chiediamo né esponiamo nome, cognome, codice fiscale o indirizzo
        let [schedaRes, pastiOggiRes, pesiRecentiRes, allRecentiRes, historyRes] = await Promise.all([
            supabaseAdmin.from('nestore_scheda_atleta')
                .select('*')
                .eq('utente_id', utenteId)
                .maybeSingle(),
            supabaseAdmin.from('nestore_pasti')
                .select('tipo_pasto, descrizione, calorie_stimate')
                .eq('utente_id', utenteId)
                .eq('data_pasto', oggiIso)
                .eq('attivo', true),
            supabaseAdmin.from('nestore_pesi_misure')
                .select('data_rilevazione, peso_kg, altezza_cm, vita_cm')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_rilevazione', { ascending: false })
                .limit(2),
            supabaseAdmin.from('nestore_allenamenti')
                .select('data_allenamento, corso_disciplina, durata_minuti, rpe_fatica')
                .eq('utente_id', utenteId)
                .eq('attivo', true)
                .order('data_allenamento', { ascending: false })
                .limit(2),
            supabaseAdmin.from('nestore_chat_messaggi')
                .select('ruolo, contenuto, creato_il')
                .eq('utente_id', utenteId)
                .order('creato_il', { ascending: false })
                .limit(20)
        ]);

        let schedaAtleta = schedaRes?.data;
        if (!schedaAtleta || !schedaAtleta.scheda_markdown) {
            schedaAtleta = await calcolaSchedaAtleta(supabaseAdmin, utenteId);
        }

        const schedaMarkdown = schedaAtleta?.scheda_markdown || 'Nessun dato biometrico o sportivo ancora consolidato.';

        // Working memory di oggi / recentissima (per domande in tempo reale)
        const pastiOggiList = (pastiOggiRes?.data || []).map(p => 
            `- [${p.tipo_pasto || 'pasto'}]: ${p.descrizione} (~${p.calorie_stimate || 0} kcal)`
        ).join('\n') || '- Nessun pasto ancora registrato oggi.';

        const pesiRecentiList = (pesiRecentiRes?.data || []).map(p =>
            `- Data ${p.data_rilevazione}: ${p.peso_kg ? p.peso_kg + ' kg' : ''}${p.altezza_cm ? ', altezza ' + p.altezza_cm + 'cm' : ''}`
        ).join('\n') || '- Nessuna pesata recente registrata.';

        const allRecentiList = (allRecentiRes?.data || []).map(a =>
            `- Data ${a.data_allenamento}: ${a.corso_disciplina || 'Workout'} (${a.durata_minuti || 0} min)`
        ).join('\n') || '- Nessun allenamento recente registrato.';

        // 9. System Prompt Specializzato e Contestualizzato (Zero PII)
        const systemPrompt = `Sei NESTORE, l'assistente virtuale di fitness, preparazione atletica e nutrizione del club sportivo Adrenalina Club.
Ti rivolgi all'atleta in modo diretto, secco e professionale (usando il "tu").
DIRETTIVA PRIVACY ASSOLUTA: NON utilizzare MAI nome, cognome, indirizzi o recapiti personali dell'atleta.

CALENDARIO & DATA DI RIFERIMENTO:
- Oggi è: ${oggiDesc} (Data ISO: ${oggiIso}).
- Ieri era: ${ieriIso}.

--- SCHEDA ATLETA SINTETICA (MEMORIA WIKI DI RIFERIMENTO) ---
${schedaMarkdown}

--- ATTIVITÀ E REGISTRAZIONI RECENTI (WORKING MEMORY) ---
PASTI REGISTRATI OGGI (${oggiIso}):
${pastiOggiList}

ULTIME RILEVAZIONI PESO:
${pesiRecentiList}

ULTIMI ALLENAMENTI:
${allRecentiList}

LINEE GUIDA E COMPORTAMENTO:
1. TONO E STILE DI RISPOSTA:
- Sii secco, essenziale e professionale. EVITA ASSOLUTAMENTE frasi motivazionali, incoraggiamenti o slogan da palestra (es. MAI dire "Avanti tutta!", "Ottimo lavoro!", "Sei un grande!", "La precisione fa la differenza!"). NON usare emoji di muscoli o esclamazioni enfatiche.
- Quando registri un dato completo, rispondi con una sola riga essenziale nel formato:
  "Registrato: [riepilogo sintetico del dato]."
  Esempi:
  - Pasto: "Registrato: Pranzo — 100g zucchine, 2 uova, 80g pane (~375 kcal)."
  - Peso/Misure: "Registrato: 75.9 kg." oppure "Registrato: Peso 75.9 kg, Altezza 178 cm."
  - Allenamento: "Registrato: Strongman — 60 min, RPE 8/10."
- Quando rispondi a domande informative o storiche dell'atleta (es. "qual è il mio BMI?", "quanto peso?", "qual è il mio fabbisogno?"), consulta la Scheda Atleta e rispondi in modo asciutto e diretto fornendo i dati numerici e fattuali senza fronzoli.

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

C) PESO E MISURE / ALTEZZA:
- Se l'atleta dice "mi sono pesato" senza indicare il valore in kg:
  NON emettere il blocco json:extraction. Chiedi: "Qual è il tuo peso in kg?"
- Se l'atleta fornisce il peso (es. "75.9 kg", "pesavo 76"), emetti subito il blocco json:extraction.
- Se l'atleta indica la propria altezza (es. "sono alto 180cm", "altezza 175"), includila nel blocco extraction come "altezza_cm": 180.0.

3. TABELLA DI RIFERIMENTO PER CALCOLO CALORIE E MACRONUTRIENTI:
Calcola le stime basandoti su questi standard nutrizionali realistici:
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
  "altezza_cm": 178.0,
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

        // 10. Costruzione Payload Conversazionale Multi-Turn per Google Gemini API
        const contents = [];
        let lastRole = null;

        const recentMsgs = (historyRes?.data || []).slice().reverse();
        for (const m of recentMsgs) {
            if (!m.contenuto || typeof m.contenuto !== 'string') continue;
            const geminiRole = m.ruolo === 'assistant' ? 'model' : 'user';

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

        if (lastRole === 'user') {
            contents.push({
                role: 'model',
                parts: [{ text: "Ricevuto." }]
            });
        }

        contents.push({
            role: 'user',
            parts: currentParts
        });

        // 11. Invocazione API Gemini (modello gemini-2.5-flash)
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

        // 12. Estrazione blocco JSON se presente (con fallback resiliente)
        let cleanReply = rawText;
        let extractionPayload = null;
        const extractionRegex = /```json:extraction\s*([\s\S]*?)\s*```/;
        const match = rawText.match(extractionRegex);

        if (match && match[1]) {
            try {
                extractionPayload = JSON.parse(match[1]);
                cleanReply = rawText.replace(extractionRegex, '').trim();
            } catch (jsonErr) {
                console.warn("Errore parsing extraction JSON:", jsonErr);
            }
        } else if (rawText.includes('```json:extraction')) {
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

        // 13. Gestione Salvataggio Diretto vs Controllo Preventivo
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
                        altezza_cm: extractionPayload.altezza_cm || null,
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
                    if (extractionPayload.altezza_cm) {
                        await supabaseAdmin.from('nestore_preferenze').upsert({
                            utente_id: utenteId,
                            altezza_cm: extractionPayload.altezza_cm,
                            aggiornato_il: new Date().toISOString()
                        });
                    }
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

                // Trigger silente di ricalcolo Wiki Atleta (post salvataggio diretto)
                if (salvatoDirettamente) {
                    await calcolaSchedaAtleta(supabaseAdmin, utenteId).catch(err => {
                        console.error("[nestore-chat] Errore ricalcolo scheda post-save diretto:", err);
                    });
                }
            } catch (saveErr) {
                console.error("Errore salvataggio diretto dati:", saveErr);
            }
        }

        // 14. Salvataggio Messaggi in nestore_chat_messaggi
        await supabaseAdmin.from('nestore_chat_messaggi').insert({
            utente_id: utenteId,
            ruolo: 'user',
            contenuto: message || '(Foto allegata)',
            metadata: image_base64 ? { has_image: true } : {}
        });

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

        // 15. Risposta JSON
        return res.status(200).json({
            reply: cleanReply,
            extraction_payload: extractionPayload,
            salvato_direttamente: salvatoDirettamente,
            messaggio_id: assistantMsg?.id || null,
            scheda_aggiornata: salvatoDirettamente
        });

    } catch (err) {
        console.error("Eccezione in nestore-chat:", err);
        return res.status(500).json({ error: 'Errore interno del server. Riprova più tardi.' });
    }
}
