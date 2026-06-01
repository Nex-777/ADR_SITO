# Database Schema & Security

The persistent data storage layer is managed by Supabase. The signature system maps its transactional state onto a specialized table inside the `public` schema.

---

## 📊 Core Tables

### 1. `public.atti_adesione`
Tracks signature attempts, OTP statuses, and associated biometric/contract signatures.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique transaction identity. |
| `utente_id` | `uuid` (FK) | Maps to `auth.users.id`. |
| `ip_address` | `inet` / `varchar` | Tracks signer source IP for validation logging. |
| `otp_codice_hash` | `varchar` | Cryptographic SHA-256 hash of the generated OTP. |
| `stato` | `varchar` | Progress states: `in_attesa_otp`, `approvato`, or `scaduto`. |
| `data_creazione` | `timestamp` | Creation time of the request. Defaults to `now()`. |
| `data_firma` | `timestamp` | Time verification was completed. |

### 2. `public.certificati_medici`
Gestisce la memorizzazione e lo stato di validazione AI/manuale dei certificati medici degli atleti.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Identificativo del certificato. |
| `anagrafica_id` | `uuid` (FK) | Collegamento all'anagrafica del socio/tesserato. |
| `tipologia` | `varchar` | Tipo di certificato: `AGONISTICO` o `NON_AGONISTICO`. |
| `medico_rilascio` | `text` | Nome del medico che ha rilasciato il documento. |
| `data_rilascio` | `date` | Data di emissione/rilascio del certificato. |
| `data_scadenza` | `date` | Data di scadenza del certificato (calcolato a 365gg). |
| `file_url` | `text` | Link al file caricato nel bucket storage Supabase. |
| `stato_validazione` | `varchar` | Semaforo validazione: `VERDE`, `GIALLO`, `ROSSO` o `IN_ATTESA`. |
| `confidence_score` | `integer` | Punteggio di affidabilità dell'estrazione dati (1-100). |
| `note_ai` | `text` | Note aggiuntive o motivo di rifiuto (se ROSSO). |

### 3. `public.riunioni_consiglio`
Master record for board meetings, referencing the legacy `verbali_consiglio` table by its unique `numero_verbale`.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique ID of the meeting. |
| `numero_verbale` | `varchar` (FK) | Unique minute number referencing `verbali_consiglio(numero_verbale)`. |
| `data_riunione` | `date` | Date of the meeting. |
| `ora_inizio` | `time` | Start time of the meeting. |
| `ora_fine` | `time` | End time of the meeting. |
| `luogo` | `text` | Meeting address or Zoom/Meet platform name. |
| `tipo` | `varchar` | Seduta type: `ORDINARIA` or `STRAORDINARIA`. |
| `data_convocazione` | `date` | Date the convocation was sent. |
| `mezzo_convocazione` | `varchar` | Delivery method (PEC, Email, Letter). |
| `id_presidente` | `uuid` (FK) | References the president user profile. |
| `id_segretario` | `uuid` (FK) | References the secretary user profile. |
| `quorum_costitutivo` | `boolean` | Flag indicating whether the constitutive quorum was reached. |
| `presenti_conteggio` | `integer` | Count of present board members. |
| `totale_membri_conteggio` | `integer` | Count of active board members at that time. |

### 4. `public.presenze_riunione`
Tracks board member attendance for meeting validation.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique record ID. |
| `riunione_id` | `uuid` (FK) | References `riunioni_consiglio(id)`. |
| `utente_id` | `uuid` (FK) | References `utenti(id)`. |
| `presenza` | `varchar` | Status: `PRESENTE`, `ASSENTE_GIUSTIFICATO`, `ASSENTE_INGIUSTIFICATO`. |

### 5. `public.punti_odg`
Tracks single agenda items discussed during a board session.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique agenda point ID. |
| `riunione_id` | `uuid` (FK) | References `riunioni_consiglio(id)`. |
| `ordine` | `integer` | Numeric order index of the item (e.g. 1, 2, 3...). |
| `titolo` | `text` | Title of the item. |
| `discussione` | `text` | Markdown text summarizing discussion. |
| `delibera_tipo` | `varchar` | Resolution category: `APPROVAZIONE_NUOVI_SOCI`, `ALTRO`, `VARIE_E_EVENTUALI`. |
| `delibera_testo` | `text` | Actual resolution text. |

### 6. `public.votazioni_odg`
Tracks votes for each agenda item.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique record ID. |
| `punto_odg_id` | `uuid` (FK) | References `punti_odg(id)`. |
| `favorevoli` | `integer` | Count of votes in favor. |
| `contrari` | `integer` | Count of votes against. |
| `astenuti` | `integer` | Count of abstentions. |
| `esito` | `varchar` | Result: `APPROVATO`, `RESPINTO`, `NON_DELIBERATO`. |

---

## 🔒 Row-Level Security (RLS) & API Access

-   **Write Protections**: Standard clients are restricted from directly inserting/updating records in `atti_adesione` to prevent arbitrary state modification.
-   **Service Role bypass**: Serverless/Edge API functions invoke database updates using the `SUPABASE_SERVICE_ROLE_KEY`, which overrides RLS. This permits secure inserts, updates, and deletes restricted exclusively to the validated `utente_id` context.
