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
   - Athlete registration and annual dues approved (`registro_approvazioni.stato === 'APPROVATO'`).
   - Active, non-expired enrollment in an ongoing course (`eventi.tipo === 'corso'` with `data_scadenza_corso >= CURRENT_DATE` or available carnet entries in `iscrizioni_eventi`).
   - Approved medical certificate and valid identity document.
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

## 4. Frontend & Backend Components

- **`portal/nestore.html`**: Dedicated full-screen sub-app featuring a responsive cyber-bio layout with KPI summary cards (weight delta, weekly workouts, daily macros) and interactive chat pane.
- **`portal/nestore.css`**: Styling tokens, dark navy backgrounds, cyan/lime glows, responsive grid, and pulse recording animations.
- **`portal/nestore.js`**: Client-side logic for authentication check, real-time KPI data binding, voice speech recognition via `webkitSpeechRecognition`, image compression, and API communication.
- **`api/nestore-chat.js`**: Protected Vercel serverless function with Bearer JWT verification, rate limiting (60 req/h), multimodal Google Gemini integration, and structured JSON extraction (`json:extraction`).

---

## 5. Related Concept Pages
- [Database Schema](database_schema.md)
- [Portal Dashboard](portal_dashboard.md)
- [EPIKA Portal Architecture](epika_portal.md)
- [API Endpoints](api_endpoints.md)
