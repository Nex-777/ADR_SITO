# NESTORE Portal Architecture & AI Assistant

Welcome to the documentation for **NESTORE**, the digital fitness, training, and nutrition assistant of Adrenalina Club.

---

## 1. Overview & Objectives

**NESTORE** is an intelligent assistant dedicated exclusively to active course athletes at Adrenalina Club (e.g., *Ibrido*, *SCAB*, *Strongman*). It empowers athletes to effortlessly track:
- **Body Weight & Circumferences**: Periodic weigh-ins, waist, chest, arm, thigh measurements, and historical progress.
- **Workout Logs**: Exercise details, sets, reps, load (kg), duration, and perceived exertion (RPE 1-10).
- **Nutritional Intake**: Meal descriptions, calorie estimation, and macronutrient breakdowns (proteins, carbs, fats), including photo-based meal recognition.
- **Multimodal Interaction**: Athletes can communicate via natural Italian text, real-time voice speech dictation (Web Speech API), or photo uploads.

---

## 2. Access Control & Gatekeeping

Access to Nestore follows the standalone portal pattern established by [EPIKA Portal Architecture](epika_portal.md):

1. **Sidebar Presence**: The NESTORE button (`#tab-btn-user-nestore`) is visible in the Adrenalina Club portal sidebar and mobile menu with distinctive branding (Electric Cyan `#00e5ff` and Neon Lime `#76ff03`).
2. **Authorization Requirements**:
   - **Standard Athletes**: Require athlete registration and annual dues approved (`registro_approvazioni.stato === 'APPROVATO'`), active non-expired course enrollment (`eventi.tipo === 'corso'` with `data_scadenza_corso >= CURRENT_DATE` or available carnet entries in `iscrizioni_eventi`), and approved medical certificate.
   - **Unconditional Access (v1.05.15)**: Board Members (`ruolo_utente` including `presidente`, `vice_presidente`, `segretario`, `tesoriere`, `consigliere`) and certified instructors registered in `public.registro_istruttori` bypass the active course requirement and have permanent access.
   - **Role-Aware View Switcher**: A contextual switcher in the header enables direct personal usage while preserving role state for coach management and admin features.
   - **Modalità Assistenza / Impersonazione (v1.05.43)**: Quando un Amministratore (Presidente) accede a Nestore in modalità assistenza per conto di un utente (`?impersonate_id=...`):
     - I permessi (`isAuthorizedAdmin`, `isBoardMember`, `isIstruttore`, `hasUnconditionalAccess`) vengono **ricalcolati al 100%** sui dati reali dell'utente impersonato.
     - Viene azzerata qualsiasi fuga di privilegi da amministratore (es. l'opzione `AMMINISTRATORE` non compare se l'utente assistito non è presidente).
     - Compare in cima alla pagina il banner `#nst-assistenza-banner` (*"⚠️ MODALITÀ ASSISTENZA ATTIVA — Stai visualizzando Nestore come: [Nome]"*) con pulsante rapido per ritornare alla Dashboard.
3. **Restricted Modal**: If a non-eligible user clicks NESTORE, `#nestore-access-modal` informs the athlete and directs them via CTA to the available courses list (`user_corsi`).

---

## 3. Database Schema (`supabase/migration_nestore_v1.sql`)

In accordance with the core project rule of **historical persistence (storicizzazione)**:
- No destructive overwrites occur on metric records.
- Records use soft-delete flags (`attivo = true`) and timestamped event dates.
- All tables have Row Level Security (RLS) strictly enforced:

### 3.1. `public.nestore_preferenze`
Stores athlete-specific assistant preferences.
- `utente_id` (UUID PK, FK `utenti.id`)
- `conferma_preventiva` (BOOLEAN DEFAULT true): When `true`, Nestore asks for manual confirmation before persisting data; when `false`, data is saved directly.
- `calorie_target`, `proteine_target_g`, `peso_target_kg`
- `creato_il`, `aggiornato_il`

### 3.2. `public.nestore_pesi_misure`
Append-only log of athlete weigh-ins and body dimensions.
- `id` (UUID PK), `utente_id` (UUID FK)
- `data_rilevazione` (DATE NOT NULL)
- `peso_kg` (NUMERIC(5,2))
- `collo_cm`, `torace_cm`, `vita_cm`, `fianchi_cm`, `braccio_dx_cm`, `braccio_sx_cm`, `coscia_dx_cm`, `coscia_sx_cm`
- `note` (TEXT), `attivo` (BOOLEAN DEFAULT true), `creato_il` (TIMESTAMPTZ)

### 3.3. `public.nestore_allenamenti`
Workout log tracking training sessions and fatigue.
- `id` (UUID PK), `utente_id` (UUID FK)
- `data_allenamento` (DATE NOT NULL)
- `corso_disciplina` (TEXT)
- `durata_minuti` (INTEGER)
- `scheda_dati` (JSONB)
- `rpe_fatica` (SMALLINT CHECK 1-10)
- `note` (TEXT), `attivo` (BOOLEAN DEFAULT true), `creato_il` (TIMESTAMPTZ)

### 3.4. `public.nestore_pasti`
Dietary intake log with estimated nutritional values.
- `id` (UUID PK), `utente_id` (UUID FK)
- `data_pasto` (DATE NOT NULL)
- `tipo_pasto` (VARCHAR: `colazione`, `pranzo`, `cena`, `snack`)
- `descrizione` (TEXT NOT NULL)
- `calorie_stimate` (INTEGER)
- `carboidrati_g`, `proteine_g`, `grassi_g` (NUMERIC(5,1))
- `foto_url` (TEXT), `attivo` (BOOLEAN DEFAULT true), `creato_il` (TIMESTAMPTZ)

### 3.5. `public.nestore_chat_messaggi`
Chat history between athlete and NESTORE assistant.
- `id` (UUID PK), `utente_id` (UUID FK)
- `ruolo` (VARCHAR: `user`, `assistant`, `system`)
- `contenuto` (TEXT NOT NULL)
- `foto_url` (TEXT)
- `metadata` (JSONB): Contains structured extraction payload and saved status.
- `creato_il` (TIMESTAMPTZ)

---

## 4. AI Engine & Conversational Context (`api/nestore-chat.js`)

- **LLM Model**: Google Gemini 2.5 Flash (`gemini-2.5-flash`), balancing multimodal visual understanding with low latency.
- **Server-Side Temporal Anchoring**: Italian server date (`Europe/Rome`) is injected into the system prompt, enabling accurate parsing of relative expressions (e.g., *"ieri il mio peso era..."*, *"lunedì scorso"*).
- **Mandatory Date Field in Extraction**: The extraction JSON block requires `"data": "YYYY-MM-DD"`, which allows retroactive tracking without overwriting today's date.
- **Multi-Turn Chat Memory**: Recent chat history is formatted as alternating `user` and `model` turns, providing the model with conversational awareness.
- **Full Database Context Feed**: Historical weigh-ins, recent workouts, and nutritional intake logs are synthesized into the system prompt, allowing athletes to ask retrospective analytical questions directly (e.g., *"quanto pesavo la scorsa settimana?"*).
- **Multi-Event Extraction**: Supporta l'estrazione parallela di molteplici blocchi ````json:extraction```` in un singolo turno di conversazione (es. registrazione contestuale di colazione + pranzo, oppure pasto + allenamento), garantendo la persistenza integrale di ciascun evento senza perdite di dati.
- **Preference Tuning via Chat & Action API**: Permette all'atleta di aggiornare i propri target (es. `calorie_target`) tramite linguaggio naturale o via endpoint `action: 'save_target'`.

---

## 5. Visual Analytics & Responsive UI (`portal/nestore.*`)

### 5.1. Single Page Application (SPA) Panels & History
Nestore is built as an SPA, transitioning seamlessly between Chat and Data visualizations:
- **Desktop**: A persistent left-side navigation menu enables switching between Chat, Weight, Workouts, and Diet.
- **Dedicated Data Panels**: Each metric has a dedicated full-width panel containing visual tracking and a detailed History Table with raw tracking data:
  1. **Weight & Body Dimensions (Multi-Line Chart)**: Dual Y-Axis (Weight vs Circumferences).
   2. **Workouts, Personal Records (PR Grid), Dettaglio & Gestione Sessioni**:
      - **Record Personali (All-Time)**: Bacheca a card dei PR per ciascun esercizio svolto. Per gli esercizi con carico vince il peso massimo sollevato in qualsiasi serie valida con ripetizioni completate $>0$ (inclusi i test massimali al 100% eseguiti durante la rampa di riscaldamento `riscaldamento_effettivo`, e a parità di carico le ripetizioni maggiori), mentre per gli esercizi a corpo libero vince il numero massimo di ripetizioni. Supporta sia i dati strutturati `scheda_dati` (sia come array sia come oggetto `{ tipo, esercizi: [...] }`) che il parsing retroattivo intelligente delle note libere, con normalizzazione automatica dei nomi degli esercizi composti. Le date sono formattate con anno compatto (`DD/MM/YY`).
      - **Interazione Desktop vs Mobile (Opzione 2A)**: Su desktop il click sulla riga apre direttamente il dettaglio sessione (`#nst-modal-dettaglio-allenamento`), mentre a destra è presente la colonna "Azioni" con le icone Matita (✏️ Modifica) e Cestino (🗑️ Elimina). Su mobile ($\le 768\text{px}$) il tocco sulla riga apre un Action Sheet dedicato (`#nst-modal-allenamento-actions`) con 3 scelte: *Dettaglio Sessione*, *Modifica Sessione*, *Elimina Sessione*.
      - **Modale di Modifica Completa (Opzione 1B - `#nst-modal-edit-allenamento`)**: Consente di modificare sia i metadati della seduta (Data, Disciplina, Durata minuti, RPE fatica 1-10, Note) sia i singoli esercizi e serie contenuti nel JSONB `scheda_dati`. Include un generatore DOM dinamico con cui aggiungere/rimuovere esercizi, serie di riscaldamento (Rampa) e serie target/effettive con carichi, ripetizioni ed RPE. Alla conferma, serializza fedelmente la struttura JSON e aggiorna Supabase, ricalcolando PR e statistiche.
      - **Modale Conferma Eliminazione & Soft-Delete (Opzione 3A - `#nst-modal-conferma-delete-allenamento`)**: Modale di conferma personalizzata in stile Nestore (con avviso visivo e riepilogo della seduta) per prevenire cancellazioni accidentali. Esegue il soft-delete (`attivo = false`) preservando lo storico nel database e ricalcolando all'istante i PR e la dashboard.
  3. **Daily Nutrition (Stacked Bar Chart with TDEE & Target Overlays)**: Grafico a barre verticali impilate (Stacked Bar Chart) che somma i macronutrienti giornalieri (in kcal) dal basso verso l'alto nell'ordine standard: **Proteine** (Cyan, base), **Grassi** (Lime, centro) e **Carboidrati** (Amber, cima con `borderRadius: 4` sugli angoli superiori). L'asse Y ha `stacked: true` per riflettere l'intake calorico complessivo, integrando due linee orizzontali comparative a tutta larghezza (disegnate edge-to-edge da un custom inline plugin di Chart.js, indipendenti dal numero di giorni registrati):
     - **Linea Rossa Tratteggiata (TDEE Salute)**: Rappresenta il fabbisogno calorico stimato scientificamente (Formula Mifflin-St Jeor) aggregato nella Wiki Atleta.
     - **Linea Verde Tratteggiata (Target Atleta)**: Rappresenta l'obiettivo calorico giornaliero personalizzato dell'atleta (impostabile sia via chat sia tramite l'editor rapido inline `Target: [X] kcal ✏️` nel pannello dieta).
  4. **Gestione Storico Pasti (Modifica, Cancellazione & Mobile Long-Press)**:
     - **Desktop**: Colonna "Azioni" con icone Matita (✏️ modifica) e Cestino (🗑️ elimina).
     - **Mobile / Touch**: Per evitare sovraffollamento visivo, la colonna azioni è nascosta e sostituita da un'interazione con **pressione prolungata (Long-Press ~450ms)** sulla riga del pasto. Il tocco prolungato attiva un feedback tattile (`navigator.vibrate`) e visuale (`.nst-long-press-active`) aprendo un Action Sheet dedicato (`#nst-modal-pasto-actions`).
     - **Modale di Modifica (`#nst-modal-edit-pasto`)**: Permette di modificare data, tipo pasto (`colazione`, `pranzo`, `cena`, `snack`), descrizione, calorie e macronutrienti (Proteine, Carboidrati, Grassi). Include il pulsante rapido *"Ricalcola dai Macro"* che applica la formula $(Pro \times 4 + Carb \times 4 + Fat \times 9)$.
     - **Unicità Giornaliera Pasti Principali (`v1.05.62`)**: Per ogni giornata è ammessa una sola Colazione, un solo Pranzo e una sola Cena attiva. Se l'atleta integra o modifica il pasto (es. aggiunge un alimento via chat o aggiorna la cena), il sistema disattiva via soft-delete il record precedente (`attivo: false`) inserendo quello aggiornato senza duplicare le calorie giornaliere.
     - **Numerazione Progressiva Spuntini (`v1.05.62`)**: Gli snack/merende giornalieri possono essere molteplici e vengono etichettati automaticamente in ordine cronologico come *"Spuntino 1"*, *"Spuntino 2"*, ecc., sia nella tabella dello storico che nei modal di dettaglio ed eliminazione.
     - **Policy RLS `FOR UPDATE` su Chat Messaggi (`v1.05.62`)**: Introdotta la policy `nst_chat_update_own` su `nestore_chat_messaggi` per consentire la corretta persistenza di `{ salvato: true }` nei metadata, prevenendo la ripresentazione di card di conferma già elaborate.
     - **Soft-Delete**: L'eliminazione avviene impostando `attivo = false` per preservare la storicizzazione, ricalcolando e aggiornando istantaneamente grafico e totali giornalieri.
- **Time Horizon Filter Chips**: `7G`, `14G`, `30G`, `ALL` selectors per filtrare i dati di periodo.

### 5.2. Mobile Tab Switcher Layout & Top-Down Inverted Chat
- On viewports $\le 1024\text{px}$, the desktop sidebar is hidden.
- **Layout Tab Mobile Multi-Riga (v1.05.27)**:
  - Eliminato lo scorrimento orizzontale a favore di una disposizione flexbox multi-riga accessibile con un singolo tocco:
    - **Riga 1 (100% larghezza)**: `CHAT ASSISTANT AI` (`.nst-tab-full`).
    - **Riga 2 (50% / 50%)**: `PESO & MISURE` e `ALLENAMENTI`.
    - **Riga 3 (50% / 50%)**: `DIETA & MACRO` e `TIMER & TABATA`.
  - **Stile Minimal Text-Only**: Rimosse le icone grafiche dai pulsanti mobile per massimizzare la chiarezza e l'area di tocco per il testo centrato in Orbitron, con responsive breakpoint specifico sotto i 380px per smartphone compatti.
- **Top-Down Inverted Chat Flow**: In contrast to standard bottom-anchored chats, NESTORE's input bar and photo attachment preview are pinned directly at the **top** of the chat panel. New messages (athlete and assistant) appear immediately at the top of the stream, while previous conversation turns flow downwards. The viewport stays anchored at `scrollTop = 0`, ensuring athletes never have to scroll down to interact with the input or view recent replies.
- **Chat Length Limits & Pagination**:
  - **Client-Side Cap**: Textarea is constrained to a `maxlength="1500"` character cap with a dynamic countdown badge (`X/1500`) to prevent token-exhausting text pastes.
  - **Server-Side Cap**: Requests exceeding 1500 characters are rejected with HTTP 400.
  - **History Pagination**: Initial view renders the 35 most recent messages. A *"Carica messaggi precedenti"* button at the bottom of the feed loads additional 20-message chunks backwards in time.
  - **LLM Multi-Turn Context**: Always selects the 20 most recent conversation messages, ordered chronologically for Google Gemini Flash.
- Chat is presented full-height on entry, ensuring instant mobile usability, and the "Controllo Preventivo" toggle is rendered inside the sidebar block but remains available via structural CSS/JS fallbacks.

---

## 6. Cronometro, Tabata & Floating Dock Cross-Page

Aggiunto nella versione **1.05.26**:
Nestore include un pannello sportivo interattivo ad alta precisione dedicato all'allenamento in sala pesi, rack e conditioning:

### 6.1. Cronometro con Lap e Auto-Stop di Sicurezza a 3 Ore
- **Misurazione Temporale Assoluta**: Calcolato tramite delta timestamp (`Date.now() - startTimestamp`), azzerando le derive tipiche di `setInterval` e mantenendo precisione al millisecondo anche durante cambio pagina o tab in background.
- **Rilevazione Giri (Laps)**: Tasto dedicato per registrare parziali (Split) e totali cumulativi con indicatore visivo del giro più veloce (`⚡`) e più lento.
- **Auto-Stop & Reset a 3 Ore**: Se l'atleta dimentica il cronometro acceso, al raggiungimento di 3 ore esatte (10.800.000 ms) il sistema esegue lo stop automatico, resetta i dati, azzera `localStorage`, emette un buzzer prolungato e mostra un toast di notifica per salvaguardare la sessione.

### 6.2. Tabata & Timer a Intervalli Dinamici
- **State Machine Multi-Fase**: Ciclo `PREP` (preparazione) $\rightarrow$ `WORK` (lavoro) $\rightarrow$ `REST` (riposo) $\rightarrow$ avanzamento `ROUND` e `SET` $\rightarrow$ `DONE`.
- **Feedback Acustico Web Audio API**: Beep sinusoidali a 3, 2, 1 secondi prima del cambio fase, buzzer ad alta energia (1200Hz) all'avvio del Work, buzzer medio (650Hz) al riposo, e fanfara di completamento. Zero dipendenze da file audio `.mp3` esterni.
- **Parametri Personalizzabili & Preset Rapidi**:
  - Stepper interattivi per Prep (sec), Work (sec), Rest (sec), Rounds, Sets.
  - Preset preimpostati con un click: *Tabata Classico (20/10 x8)*, *Cardio HIIT (30/15 x10)*, *EMOM (50/10 x5)*, *Forza (40/20 x6)*.
- **Tasto Salta Fase**: Consente all'atleta di anticipare o saltare il tempo residuo della fase corrente.

### 6.3. Persistenza Cross-Page & Floating Dock (`portal/timer-dock.js`)
- Lo stato di cronometro e tabata viene serializzato in tempo reale su `localStorage` (`adr_stopwatch_state`, `adr_tabata_state`, `adr_timer_mode`).
- Se l'utente esce da Nestore o naviga in [`dashboard.html`](portal_dashboard.md) mentre un timer è attivo, compare un **mini-widget fluttuante (Floating Dock)** in basso a destra con:
  - Display del tempo in tempo reale
  - Indicatore di fase/modalità (es. `TABATA: WORK`, `CRONOMETRO`)
  - Tasto Pausa/Riprendi rapido
  - Tasto Espandi a tutto schermo per riaprire istantaneamente `nestore.html#timer`.
- Il dock globale gestisce autonomamente il loop temporale e i suoni a scadenza anche al di fuori di Nestore.

---

## 7. Scheda Atleta & Memoria Sintetica LLM (Modello Wiki Karpathy)

Aggiunto nella versione **1.05.35** (`supabase/migration_nestore_v2_wiki.sql`, [`api/nestore-chat.js`](../api/nestore-chat.js)):
Nestore supera il pattern del dump grezzo da 90 righe di database per ogni chiamata LLM, adottando l'architettura **LLM Wiki** teorizzata da Andrej Karpathy:
1. **Zero PII (Massima Protezione Privacy)**:
   - Dati anagrafici identificativi (`nome`, `cognome`, `codice_fiscale`, `indirizzo`, `telefono`, `email`) sono tassativamente esclusi dal System Prompt di Gemini. L'assistente dialoga in seconda persona ("tu") o con il ruolo anonimo di *"Atleta"*.
2. **Aggregazione Biometrica e Metabolica**:
   - `altezza_cm`: Gestita come costante fisiologica in `nestore_preferenze` e rilevabile storicamente in `nestore_pesi_misure`.
   - Età (calcolata dall'anno di nascita) e sesso biologico (desunto dal CF) utilizzati per la formula **Mifflin-St Jeor** per il Metabolismo Basale (BMR).
   - Indice di Massa Corporea (BMI) con classificazione OMS.
   - Fabbisogno Energetico Stimato (TDEE) moltiplicando il BMR per il coefficiente di attività basato sulla frequenza reale degli allenamenti negli ultimi 30 giorni.
3. **Profilo Sportivo e Nutrizionale Compresso**:
   - Disciplina dominante (frequenza più alta tra *Ibrido*, *Strongman*, *SCAB*).
   - Frequenza settimanale media (sessioni/settimana) e RPE medio degli ultimi allenamenti.
   - Medie intake calorico e macronutrienti su 30 giorni tracciati vs target prefissati.
4. **Trigger di Ricalcolo Incrementale e Silente**:
   - Ogni salvataggio diretto o confermato di nuovi dati scatena in background la funzione `calcolaSchedaAtleta(supabaseAdmin, utenteId)`.
   - Possibilità di ricalcolo esplicito tramite `POST /api/nestore-chat` con `{ action: 'recalculate_wiki' }`.
5. **Trasparenza Utente nel Portale**:
   - Nuovo pannello SPA **"SCHEDA AI"** (`#nst-profilo-panel`) con card visive intuitive (Biometria, Allenamento, Nutrizione) e visualizzazione del testo **Raw Markdown** trasmesso a Gemini.

---

---

## 8. Vista Allenatore & Amministratore (Fase 2)

Introdotta con la migrazione `migration_nestore_schede_allenamento.sql`:
Nestore introduce le modalità operative dedicate al corpo docenti e alla direzione sportiva:

### 8.1. Regola di Accesso & Switcher Ruoli
1. **Punto di Ingresso Unificato**: Tutti gli utenti (atleti, istruttori certificati e membri del Consiglio Direttivo) accedono a NESTORE visualizzando sempre per default la propria vista personale **ATLETA**.
2. **Accesso Incondizionato (v1.05.15 & v1.05.42)**: Tutti i componenti del Consiglio Direttivo (`presidente`, `vice_presidente`, `segretario`, `tesoriere`, `consigliere`) e gli istruttori in `registro_istruttori` hanno accesso incondizionato a NESTORE (senza necessità di corso attivo a pagamento).
3. **Selettore di Ruolo (`#nst-view-switcher`) & Principio del Minimo Privilegio**:
   - Se l'utente dispone solo della vista Atleta (es. consigliere/segretario/tesoriere che non è istruttore, o atleta comune), il selettore resta **nascosto**.
   - Se l'utente dispone di ruoli aggiuntivi, il selettore compare permettendo di passare tra le viste autorizzate:
     - `ATLETA`: Vista personale ordinaria di allenamento, chat e diari (disponibile per tutti).
     - `ALLENATORE`: Riservata **esclusivamente** a chi è registrato nel `registro_istruttori` (es. Ciaralli, Mannocchi). Mostra i soli corsi assegnati all'istruttore in `public.istruttori_eventi`.
     - `AMMINISTRATORE`: Riservata **rigorosamente ed esclusivamente al `presidente`** (`nexglg@gmail.com`). Mostra la dashboard globale di tutti i corsi e atleti di Adrenalina Club.
4. **Hardening Database RLS (`supabase/migration_nestore_admin_strict.sql`)**:
   - Tutte le policy SELECT/INSERT/UPDATE sulle tabelle `nestore_schede_allenamento`, `nestore_pesi_misure`, `nestore_allenamenti`, `nestore_pasti`, `nestore_scheda_atleta`, `nestore_preferenze` e sul bucket Storage `schede_allenamento` sono state ristrette per consentire la lettura/gestione globale unicamente a `ARRAY['presidente'::public.ruolo_utente]`. I membri generici del direttivo non possono effettuare query su atleti altrui a livello database.

### 8.2. Dashboard Allenatore (`#nst-coach-list-view`)
- **Associazione Corsi**: L'allenatore visualizza solo ed esclusivamente i corsi a cui è assegnato tramite la tabella ponte `public.istruttori_eventi`.
- **Filtro Corso a Tendina & Ricerca Rapida**: Menù a tendina (`#nst-coach-course-select`) per filtrare istantaneamente gli atleti per corso, affiancato da un campo di ricerca testuale in tempo reale per nome, cognome ed email.
- **Card Atleta**: Ciascuna card riporta l'avatar con iniziale, stato tesseramento/abbonamento, badge della scheda di allenamento attiva (o indicatore di assenza scheda), e pulsante *"APRI SCHEDA ATLETA"*.

### 8.3. Ispezione Atleta in Sola Lettura (`#nst-coach-atleta-view`)
Cliccando su un atleta, l'allenatore accede al pannello di ispezione dedicato provvisto di:
- **Barra Superiore**: Pulsante *"← TORNA ALLA LISTA ATLETI"*, nome dell'atleta e nome del corso.
- **Sotto-Tab di Consultazione (Read-Only)**:
  1. `PESO & MISURE`: Storico peso e circonferenze registrate dall'atleta.
  2. `ALLENAMENTI & PR`: Bacheca massimali e sessioni completate.
  3. `DIETA & MACRO`: Diario pasti e calorie assunte.
  4. `SCHEDA AI`: Scheda biometria Karpathy e sintesi markdown.
  *(Tutti i pannelli di metriche sono esposti con banner di sola lettura per impedire sovrascritture accidentali da parte del coach).*

---

## 9. Schede di Allenamento & Storicizzazione Anti-Bloat (`public.nestore_schede_allenamento`)

La sezione **SCHEDE DI ALLENAMENTO** consente al coach di preparare e assegnare programmi di allenamento su misura per l'atleta.

### 9.1. Modalità di Inserimento Flessibili
1. **Testo Libero / Copia-Incolla da Word**:
   - Area di testo ad alta capacità (fino a 50.000 caratteri) per incollare tabelle ed esercizi direttamente da documenti Word o note (es. schede Strongman multi-fase/giorno).
2. **File Word (.docx / .doc)**:
   - Caricamento diretto di file Word archiviati in modo sicuro nel bucket Supabase Storage privato `schede_allenamento`.
   - **Policy Anti-Bloat**: Limite dimensionale rigido a **5 MB** sia a livello client che a livello storage bucket, prevenendo sprechi di storage per file ridondanti.

### 9.2. Storicizzazione EPIKA & Ciclo di Vita Scheda
- **Nessun DELETE fisico**: In ossequio alla regola cardine di storicizzazione del progetto, le schede non vengono mai eliminate fisicamente dal database.
- **Transizione Stato**: Quando l'allenatore assegna una nuova scheda all'atleta, le schede attive precedenti per quell'atleta vengono automaticamente contrassegnate come de-attivate (`attivo = false`).
- **Archivio Consultabile**: Sia l'atleta che l'allenatore possono consultare lo storico completo di tutte le schede passate (badge `ARCHIVIATA`), visualizzare il testo del programma o scaricare il file Word originale tramite URL firmato temporaneo.
- **Vista Atleta**: Nella vista personale dell'atleta è presente il tab dedicato `SCHEDE` (`#nst-schede-panel`) che mostra in primo piano la scheda attiva e l'elenco dei programmi precedenti.
- **Sicurezza & Hardening (WFTEST Audit)**:
  - **Filtro Iscrizioni Attive**: Le dashboard Coach e Amministratore visualizzano unicamente gli atleti con iscrizione in corso di validità (scadenza o carnet ingressi residui) tramite l'helper `isIscrizioneAttiva`.
  - **Protezione XSS & Event Delegation**: Rimossi tutti gli attributi `onclick` inline con concatenazione di parametri utente/testo; implementata architettura event delegation su container con `data-*` attributes e sanitizzazione universale tramite `escapeHtml`.
  - **Rollback File Storage**: Se l'upload del file Word su Supabase Storage ha successo ma l'inserimento del record a database fallisce, il sistema tenta automaticamente la cancellazione compensativa del file per evitare sprechi di storage.
  - **Anti-Bloat Admin Query**: Query globale iscrizioni limitata a 500 record con avviso visuale se la soglia viene saturata.

### 9.3. Allenamenti Standard & Benchmark WOD (INVICTUS)
Aggiunto nella versione **1.05.41**:
Nel pannello `SCHEDE` dell'atleta (`#nst-schede-panel`) è presente la sezione dedicata agli **Allenamenti Standard & Benchmark WOD**:
- **WOD INVICTUS**:
  - Sequenza strutturata: **Pull-up** $\rightarrow$ **Push-up** $\rightarrow$ **Air Squat** con proporzione fissa **1 : 2 : 4**.
  - **Stepper Interattivo**: L'atleta imposta il numero base di Pull-up (default 5); il sistema calcola istantaneamente i target correlati (es. 5 Pull $\rightarrow$ 10 Push $\rightarrow$ 20 Squat).
- **Modale Esecuzione Attiva (`#nst-active-workout-modal`)**:
  - Premendo *"AVVIA PROGRAMMA"*, si apre una modale focalizzata con display cronometro gigante, checklist dei target da chiudere e controlli di corsa:
    - **Pausa / Riprendi**: Sincronizzato con il `timerEngine` nativo di Nestore.
    - **Giro (Lap)**: Registrazione degli intertempi con split parziale e totale progressivo.
    - **Termina e Salva**: Arresta il cronometro e apre il form di completamento.
    - **Pulsante ANNULLA con Blocco di Sicurezza**: Sostituita la precedente "✕" con un pulsante esplicito `[ANNULLA]` con stile ghost rosso (`.nst-btn-danger-ghost`), provvisto di dialogo di conferma obbligatorio per impedire la perdita accidentale della sessione (anche quando il timer si trova in stato di pausa).
- **Salvataggio Persistente, Rendiconto Dettagliato & Multi-Serie**:
  - **Auto-Lap Conclusivo**: Alla pressione di *"TERMINA E SALVA"*, se il cronometro è proseguito oltre l'ultimo lap registrato ($\ge 1$s), il sistema registra automaticamente il tempo residuo come ultimo lap.
  - **Rendiconto Lap-by-Lap nelle Note**: Generazione automatica di un report strutturato multiriga pre-popolato nel campo note (`Totali: [tempo], [tot Pull] + [tot Push] + [tot Squat] \n 1: [tempo lap], [reps]...`), salvato su database e visualizzato con ritorni a capo sia nel form di completamento che nel dettaglio sessione.
  - **Storicizzazione Multi-Serie (`scheda_dati`)**: Per ogni giro (lap) completato, viene generata una specifica serie in `serie_dettaglio` per ciascuno dei tre esercizi a corpo libero (`Pull-up`, `Push-up`, `Air Squat`), consentendo la corretta consultazione analitica e la tracciatura della progressione storica.
  - Inserimento diretto in `public.nestore_allenamenti` con disciplina `'Invictus'`, durata in minuti, note complete e alimentazione della bacheca **Record Personali (PR Grid)**.

### 9.4. Programmi Ufficiali Corso Ibrido Base (Metcon 1-4 & Forza 1-4)
Aggiunto nella versione **1.05.44**, perfezionato in **1.05.45**:
Nel pannello `SCHEDE` dell'atleta (`#nst-schede-panel`) è presente la sezione `#nst-ibrido-programmi-section` con il catalogo dei **8 Programmi Ufficiali Ibrido Base**:
- **Design Ultra-Compatto (v1.05.45)**:
  - Le 8 card sono disposte su griglia a 4 colonne (2 righe compatte), mostrando unicamente il **Nome** (es. `Metcon 1`, `Forza 1`) e il **Badge di Tipologia** (`METCON` in ciano, `FORZA` in ambra).
  - Rimossi i pulsanti statici e i testi prolissi dal riepilogo: l'intera card è cliccabile (`cursor: pointer` con hover glow) per aprire istantaneamente la modale di anteprima.
  - Lo stesso principio si applica a **INVICTUS** (`#nst-standard-card-compact`), la cui card è stata ridotta ad altezza minima e il cui stepper di configurazione pull-up è accessibile via modale popup dedicata (`#nst-invictus-preview-modal`).
- **Metcon 1-4 (Conditioning Metabolico)**:
  - **Metcon 1, 2, 4**: integrano il motore `tabataEngine` con intervalli lavoro/riposo preimpostati (es. 30" work + 30" rest o 25" work + 35" rest), con possibilità per l'atleta di modificare i parametri di work, rest e rounds prima dell'avvio.
  - **Metcon 3**: programma Unbroken a 20 giri no time limit (tempo target 40'), integrato con il cronometro `timerEngine` (supporto a pause e lap).
- **Forza 1-4 (Progressione Carichi & Ramping)**:
  - Tabelle di progressione per esercizi multiarticolari fondamentali (Panca Piana, Squat, Stacco da terra, Trazioni Pesate, Lento Avanti, Rematore Bilanciere).
  - Gestiti tramite `timerEngine` stopwatch con intertempi (Lap) e tabella interattiva per inserire carichi (kg) e ripetizioni effettive per serie.
- **Workflow Esecuzione e Prevenzione Timer Dimenticato**:
  - **Modale Anteprima (`#nst-ibrido-preview-modal`)**: esposizione dello schema completo degli esercizi e configurazione parametri timer.
  - **Modale Esecuzione Attiva (`#nst-ibrido-active-modal`)**: timer gigante a 60fps sincronizzato con il render loop master, tabella inserimento carichi live e pulsante *"TERMINA E SALVA"*.
  - **Schermata di Conferma Dati & Prevenzione Errori**: durata calcolata esposta in un input numerico modificabile dall'atleta, alert visuale giallo se il timer supera 90 minuti (`#nst-timer-warning-box`), riepilogo carichi confermati e campo note.
  - **Persistenza & Storicizzazione**: registrazione automatica in `public.nestore_allenamenti` con `corso_disciplina = 'Ibrido — ' + nome_programma` e `scheda_dati` JSONB strutturato.

### 9.5. Gestione Libreria Programmi Allenatore (`public.nestore_programmi_libreria`)
Introdotta nella versione **1.05.46**:
Consente agli allenatori (Istruttori) e agli Amministratori di gestire in modo dinamico e centralizzato tutti i programmi di allenamento ufficiali (Invictus, Ibrido Metcon 1-4, Ibrido Forza 1-4 e programmi personalizzati futuri):
- **Dashboard Allenatore a Due Tab Principali (`.nst-coach-main-tabs-bar`)**:
  - **`[I MIEI ATLETI]`** (`#nst-coach-athletes-wrapper`): include la vista elenco atleti/corsi e la sotto-vista di ispezione parametri atleta.
  - **`[LIBRERIA ALLENAMENTI]`** (`#nst-coach-library-view`): griglia interattiva dei programmi di allenamento gestibili, dotata di contatore KPI, filtro per tipologia (`Tutti`, `Ibrido Metcon`, `Ibrido Forza`, `Invictus`, `Altro`) e barra di ricerca live.
- **Modale Editor Programma (`#nst-coach-programma-modal`)**:
  - Form completo per la creazione e la modifica di schede e programmi (nome, macrotipologia, categoria, modalità timer `tabata`/`stopwatch`, parametri intervalli lavoro/riposo/giri, tempi target e note).
  - Gestione dinamica degli esercizi della scheda con aggiunta/rimozione di righe (`nome` e schema `target`).
- **Regola EPIKA - Soft Delete Rigoroso**:
  - Nessun programma viene mai cancellato fisicamente dal database: la disattivazione imposta `attivo = false`, preservando l'integrità referenziale e lo storico degli allenamenti registrati dagli atleti nel tempo.
- **Sincronizzazione Real-Time con la Vista Atleta**:
  - Le modifiche o i nuovi programmi salvati nella tabella Supabase `nestore_programmi_libreria` si riflettono istantaneamente nelle schede visualizzate dagli atleti (`#nst-schede-panel`).

### 9.6. Duplicazione e Assegnazione Diretta Programmi ad Atleti
Introdotta nella versione **1.05.47**:
- **Tasto DUPLICA Programma (`duplicaProgrammaLibreria`)**:
  - Presente su ogni card nella libreria coach.
  - Apre istantaneamente l'editor precompilato con tutti i campi del programma di origine, incrementando l'ordine, azzerando l'ID e aggiungendo `(Copia)` al nome. Il salvataggio genera un nuovo record indipendente nel database (`INSERT`).
- **Doppio Flusso di Assegnazione ad Atleta (Opzione A)**:
  1. **Dalla Card in Libreria (`apriModalAssegnaProgramma`)**:
     - Pulsante `ASSEGNA` con icona `person_add` sulla card.
     - Modale dedicata `#nst-modal-assegna-programma` che visualizza il riassunto del programma e un menu a discesa degli atleti attivi seguiti dall'istruttore nei suoi corsi (con corso di appartenenza).
     - Possibilità di specificare periodo di validità e note personalizzate per l'atleta.
     - Alla conferma, esegue il soft-archive della scheda attiva precedente dell'atleta e inserisce la nuova scheda collegata tramite `programma_libreria_id`.
  2. **Dall'Ispezione Atleta (`#nst-coach-subpanel-schede`)**:
     - Aggiunta terza modalità nel selettore a pillole: `IMPORTA DA LIBRERIA` (`#nst-pill-mode-lib`).
     - Menu a tendina `#nst-scheda-select-programma-lib` con tutti i programmi attivi in libreria e anteprima live in tempo reale (`#nst-scheda-programma-lib-preview`) di esercizi e timer.
- **Esperienza Atleta & Timer Integrato**:
  - Quando un atleta riceve una scheda collegata a un programma di libreria (`programma_libreria_id`), la sua card mostra la preview completa e leggibile dello schema esercizi e il pulsante **`AVVIA PROGRAMMA`** (`.nst-btn-launch-workout`).
  - Il click apre direttamente il modale di anteprima e timer (`apriAnteprimaIbrido`), permettendo all'atleta di avviare il workout, configurare il Tabata o registrare i lap col cronometro nativo e salvare la sessione nei propri registri.

### 9.7. Editor Serie Programmi Forza (Ripetizioni, % Massimale & Calcolo Carico Automatico)
Introdotto nella versione **1.05.48**:
- **Editor Dedicato nella Libreria Allenamenti (Opzione A)**:
  - Per i programmi di categoria o tipologia `forza`, l'editor del programma (`#nst-coach-programma-modal`) attiva una vista avanzata per ciascun esercizio.
  - Al posto del campo di testo generico `Target / Schema`, ogni esercizio di forza presenta un container per le serie strutturate (`.nst-ex-serie-container`).
  - **Schema Predefinito Standard (5 serie)**:
    1. 10 rip @ 60%
    2. 5 rip @ 70%
    3. 3 rip @ 80%
    4. 1 rip @ 90%
    5. 1 rip @ 100%
  - **Due Caselle Modificabili per Serie**: numero di ripetizioni (`serie-rip`) e percentuale sul massimale (`serie-pct`).
  - **Pulsanti Dinamici**: aggiunta di nuove serie (`+ AGGIUNGI SERIE`) e rimozione (`✕`) con re-indicizzazione automatica dei badge (`Serie 1`, `Serie 2`, ...).
- **Serializzazione JSONB & Retrocompatibilità**:
  - Gli esercizi di forza vengono salvati in `nestore_programmi_libreria` come:
    ```json
    {
      "nome": "Back Squat",
      "serie": [
        { "rip": 10, "pct": 60, "percentuale": 60 },
        { "rip": 5, "pct": 70, "percentuale": 70 },
        { "rip": 3, "pct": 80, "percentuale": 80 },
        { "rip": 1, "pct": 90, "percentuale": 90 },
        { "rip": 1, "pct": 100, "percentuale": 100 }
      ],
      "target": "10 rip @ 60%, 5 rip @ 70%, 3 rip @ 80%, 1 rip @ 90%, 1 rip @ 100%"
    }
    ```
  - La generazione automatica del campo descrittivo `target` garantisce che qualsiasi vista o componente legacy che visualizza solo il testo continui a funzionare senza interruzioni.
- **Calcolo Automatico del Peso (kg) a Runtime (`avviaIbridoSeduta`)**:
  - Quando un atleta avvia un programma di forza, il sistema risolve la base di carico (`ottieniBaseMassimaleEsercizio`):
    1. **PR dell'Atleta**: se esiste un record personale registrato per l'esercizio con peso > 0 in `nestore_allenamenti`, viene utilizzato come massimale (100%).
    2. **Peso Corporeo dell'Atleta (Fallback)**: se non è presente un massimale registrato, il sistema usa come carico base l'ultimo peso corporeo registrato in `nestore_pesi_misure`.
    3. **Default Standard (70 kg)**: se mancano sia il PR che il peso corporeo, viene utilizzato il default di sicurezza di 70 kg.
  - Per ciascuna serie, la colonna **PESO (KG)** viene calcolata e precompilata automaticamente come:
    $$\text{peso\_kg} = \text{round}\left(\text{baseKg} \times \frac{\%}{100} \times 2\right) / 2$$
    (arrotondamento al mezzo chilo).
  - L'atleta visualizza sotto il nome dell'esercizio la fonte utilizzata (es. `PR: 120 kg`, `Peso atleta: 78 kg`, `Default: 70 kg`) e può liberamente correggere o affinare i carichi effettivi sollevati durante la seduta.
- **Registrazione Sessione & Alimentazione Massimali**:
  - Al termine della seduta, vengono salvate tutte le serie con dettaglio in `scheda_dati.serie_dettaglio`, e il carico massimo sollevato viene registrato come `peso_kg` principale dell'esercizio per aggiornare automaticamente la bacheca dei Record Personali (PR).

### 9.8. Flusso Schede Forza Avanzato: Configurazione Anteprima & Tracciamento Seduta (v1.05.52)
Introdotto nella versione **1.05.52**:
Riorganizza il flusso dei programmi Forza in due fasi concettualmente separate e ottimizzate per l'atleta:

1. **Modale Anteprima / Pre-Configurazione (`#nst-ibrido-preview-modal`)**:
   - **Riscaldamento Generico**: 10 minuti dinamici liberi.
   - **Riscaldamento Specifico (`DEFAULT_FORZA_WARMUP`)**: sequenza di ramp-up a 5 serie progressive ($1\times10@75\%$, $1\times5@80\%$, $1\times3@85\%$, $1\times1@95\%$, $1\times1@100\%$) con **pesi in kg modificabili** dall'atleta per ciascuna serie.
   - **Sequenza Allenante (Target)**: serie, ripetizioni e carico target (kg) modificabili prima di iniziare la sessione.
   - **Risoluzione Intelligente dei Carichi**:
     - Se l'atleta ha già completato in passato una seduta dello **stesso programma**, i carichi e le ripetizioni vengono precompilati prendendoli automaticamente dall'ultima sessione precedente (`recuperaUltimaSessioneProgramma`).
     - Al primo avvio, i carichi vengono calcolati sul massimale PR, peso corporeo o fallback 70 kg (`ottieniBaseMassimaleEsercizio`).
   - **Badge Massimo Storico (`verificaForzaMaxStorico`)**:
     - Se l'atleta imposta un carico inferiore rispetto al suo record all-time registrato per l'esercizio, compare un badge visivo ambra con avviso (*"Il peso impostato è inferiore al tuo massimo storico (X kg)"*). Se pari o superiore, compare il badge di record verde.
   - **Suggerimento di Progressione**: guida visiva alla progressione di sovraccarico progressivo ($4\times4 \rightarrow 4\times5 \rightarrow 4\times6$, e a $4\times6$ superato: passaggio a $4\times7$ o incremento carico tornando a $4\times4$).

2. **Modale Seduta in Corso (`#nst-ibrido-active-modal`)**:
   - **Target Fisso (Read-Only)**: il nome del programma e i target configurati in anteprima sono esposti come riferimento e non possono essere modificati durante la sessione.
   - **Guida Riscaldamento**: promemoria visivo compatto dei pesi di riscaldamento specifico configurati.
   - **Registrazione Effettivo Zero-Effort**:
     - Per ciascuna serie allenante, la casella delle ripetizioni è **già precompilata con il numero target di default**.
     - Se l'atleta completa tutte le ripetizioni, **non deve fare alcuna azione né spuntare checkbox**.
     - Se ne completa di meno (o di più), modifica semplicemente il numero nella casella.
   - **Serie Extra**: pulsante `+ AGGIUNGI SERIE EXTRA` se l'atleta esegue serie supplementari superando la scheda.

3. **Valutazione Esito, Feedback Visivo & Storicizzazione**:
   - A fine sessione (`terminaIbridoSeduta`), il sistema confronta le ripetizioni effettive con quelle target per ciascun esercizio e a livello globale:
     - 🎯 `COMPLETATA` (tutte le serie chiuse a target)
     - 🔥 `SUPERATA` (rip totali o serie superiori al target)
     - ⚡ `PARZIALE` (rip inferiori al target o serie incomplete)
   - Badge visivo evidenziato nella schermata di salvataggio (`#nst-ibrido-esito-badge`) con indicazioni sul mantenimento o incremento del carico.
   - Persistenza in `nestore_allenamenti.scheda_dati` con `esito_globale`, `serie_target`, `rip_target`, `peso_target_kg`, `serie_effettive` e alimentazione della bacheca PR.

### 9.9. Bacheca Record Personali (PR) — Griglia Fissa a 8 Esercizi & Corsa Zavorrata vs Corpo Libero (v1.05.66)
Introdotta nella versione **1.05.66**:
Riforma organica della bacheca dei Record Personali (`RECORD PERSONALI (ALL-TIME)`) visibile nella sezione Allenamenti dell'atleta e nella vista Coach:
1. **Whitelist Rigida a 8 Esercizi Canonici**:
   - Vengono tracciati e mostrati **esclusivamente** i record per 8 movimenti ufficiali:
     - **Forza**: *Panca Piana*, *Squat*, *Stacco da Terra*, *Trazioni*.
     - **Corsa**: *Corsa 60m*, *Corsa 100m*, *Corsa 5km*, *Corsa 10km*.
   - Qualsiasi altro esercizio presente nei log o nelle note (es. Leg Press, Push-up, Addominali, Dip) viene escluso dal calcolo dei PR.
2. **Griglia Fissa con Placeholder (Opzione 1A)**:
   - La griglia mostra sempre e costantemente tutte le 8 card nell'ordine canonico stabilito.
   - Se un esercizio non ha ancora un record registrato, viene renderizzata una card placeholder stilizzata (`.nst-pr-empty-card`) con valori tratteggiati (`--`), stato *"Nessun record"* e contatore KPI dinamico (*"X su 8 registrati"*).
3. **Doppio Record per la Corsa (Opzione 2)**:
   - Per ciascuna distanza di corsa (60m, 100m, 5km, 10km) vengono tracciati **due record distinti**:
     - **Corpo Libero** (`peso_kg === 0`): miglior tempo in secondi (vince il tempo più basso).
     - **Con Sovraccarico / Zavorrata** (`peso_kg > 0`): carico di zavorra e miglior tempo associato (vince il carico maggiore; a parità di carico vince il tempo più basso).
   - Card a due righe sincronizzate (`.nst-pr-run-row`) con label `Libero:` e `Zavorra:`.
4. **Gerarchia Dati per la Forza (Opzione 3A)**:
   - Valore grande primario: **Peso Sovraccarico in KG** (es. `125 KG`).
   - Riga secondaria: **Ripetizioni e Serie** (es. `1 rep (1 serie)`).
   - Se l'esercizio è svolto a corpo libero (0 kg di sovraccarico), il valore grande espone le ripetizioni con la dicitura esplicita `Corpo libero (0 kg)`.
5. **Regola del Sovraccarico Puro**:
   - Per peso si intende rigorosamente solo ed esclusivamente il carico aggiunto (zavorra, bilanciere o dischi), senza mai sommare il peso corporeo dell'atleta (es. 10 kg di zavorra su corsa o trazioni = 10 kg registrati).
6. **Parser Cronometrico Multi-Formato & Decimale**:
   - Funzioni dedicate `parseTimeToSeconds` e `formatSecondsToDisplay` per estrarre e formattare tempi da stringhe `11.8s`, `21:40`, `01:05:20`, `22m 15s`, preservando i decimali con lookahead sicuro sul parsing testuale.

---

## 10. Related Concept Pages
- [Database Schema](database_schema.md)
- [Portal Dashboard](portal_dashboard.md)
- [EPIKA Portal Architecture](epika_portal.md)
- [API Endpoints](api_endpoints.md)


