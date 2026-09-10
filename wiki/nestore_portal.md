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
   - **Role-Aware View Switcher**: A contextual switcher in the header enables direct personal usage while preserving role state for upcoming coach management features.
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

---

## 5. Visual Analytics & Responsive UI (`portal/nestore.*`)

### 5.1. Single Page Application (SPA) Panels & History
Nestore is built as an SPA, transitioning seamlessly between Chat and Data visualizations:
- **Desktop**: A persistent left-side navigation menu enables switching between Chat, Weight, Workouts, and Diet.
- **Dedicated Data Panels**: Each metric has a dedicated full-width panel containing an expanded Chart.js visualization (350px height) and a detailed History Table with raw tracking data.
- **Interactive Chart.js Visualizations** (integrated via CDN):
  1. **Weight & Body Dimensions (Multi-Line Chart)**: Dual Y-Axis (Weight vs Circumferences).
  2. **Workouts Timeline (Line Chart)**: Tracks training duration and RPE over time.
  3. **Daily Nutrition (Stacked Bar Chart)**: Stacks daily Carbs, Protein, and Fats (in kcal).
- **Time Horizon Filter Chips**: `7G`, `14G`, `30G`, `ALL` selectors for all charts.

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

## 7. Related Concept Pages
- [Database Schema](database_schema.md)
- [Portal Dashboard](portal_dashboard.md)
- [EPIKA Portal Architecture](epika_portal.md)
- [API Endpoints](api_endpoints.md)
