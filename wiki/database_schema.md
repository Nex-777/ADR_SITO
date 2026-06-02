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

### 7. `public.registro_approvazioni`
Staging table for pending socio and tesserato applications.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique record ID. |
| `anagrafica_id` | `uuid` (FK) | References `anagrafiche(id)`. |
| `tipo` | `varchar` | Request type: `SOCIO`, `TESSERATO`, `SOCIO_TESSERATO`. |
| `stato` | `varchar` | Status: `IN_ATTESA`, `APPROVATO`, `RESPINTO`. |
| `livello_copertura` | `varchar` | CSEN level: `BASE`, `INTEGRATIVA_A`, `INTEGRATIVA_B`. |
| `data_richiesta` | `date` | Date request was made. |
| `data_decisione` | `date` | Date approved or rejected. |
| `numero_verbale` | `varchar` | Associated meeting minute number. |
| `motivo_rifiuto` | `text` | Reason for rejection (if status is `RESPINTO`). |
| `deciso_da` | `uuid` (FK) | References `utenti(id)` for the decider. |

---

## 🔒 Row-Level Security (RLS) & API Access

-   **Write Protections**: Standard clients are restricted from directly inserting/updating records in `atti_adesione` to prevent arbitrary state modification.
-   **Service Role bypass**: Serverless/Edge API functions invoke database updates using the `SUPABASE_SERVICE_ROLE_KEY`, which overrides RLS. This permits secure inserts, updates, and deletes restricted exclusively to the validated `utente_id` context.
-   **Registro Approvazioni**: Board members (President, VP, Secretary, Treasurer) are granted full read and write access, while individual users can read their own pending applications.

---

## 👻 Ghost Users (Incomplete Registrations) Management

To prevent users from getting stuck when they create authentication credentials but abandon the registration flow prior to OTP completion, specialized views and functions are defined:

### 1. Database View: `public.vw_registrazioni_incomplete`
Identifies "ghost" users who have created records in `public.utenti` (with role `tesserato_esterno`) but lack:
- Active approval requests in `public.registro_approvazioni`.
- Active memberships in `public.registro_soci` or `public.registro_tesserati`.

```sql
CREATE OR REPLACE VIEW public.vw_registrazioni_incomplete AS
SELECT u.id as utente_id, u.nome, u.cognome, u.codice_fiscale, u.email, u.data_creazione
FROM public.utenti u
LEFT JOIN public.anagrafiche a ON u.id = a.utente_id
LEFT JOIN public.registro_approvazioni ra ON a.id = ra.anagrafica_id
LEFT JOIN public.registro_soci rs ON a.id = rs.anagrafica_id
LEFT JOIN public.registro_tesserati rt ON a.id = rt.anagrafica_id
WHERE u.ruolo = 'tesserato_esterno'
  AND ra.id IS NULL
  AND rs.id_socio IS NULL
  AND rt.id_tesserato IS NULL;
```

### 2. RPC Function: `public.elimina_utente_fantasma(p_utente_id)`
A secure function executing with `SECURITY DEFINER` privileges allowing Authorized board members (President and Vice President) to cleanly delete a stuck user.
-   Deletes partially created `public.anagrafiche` profiles (which cascades down to delete incomplete addresses, contacts, and certificates).
-   Cleans up related table traces in `public.registro_audit_operazioni`, `public.ricevute_pagamenti`, and `public.atti_adesione`.
-   Cascades deletion directly to the identity authentication profile in `auth.users` via triggers or direct deletion commands.

---

## ⚡ DB Trigger & API Modifications

1. **Trigger sync deletion**: Removed redundant DB trigger `tr_sync_utente_to_normalized` on `public.utenti`. This trigger was conflicting with the API registration flow (which already performs the inserts manually in `/api/otp-verify.js`), causing errors like `record "new" has no field "step_registrazione"` during user signups.
2. **OTP Verify API Upsert Fix**: Modified `api/otp-verify.js` to avoid calls to `.upsert()` on the staging table `registro_approvazioni`. Because of partial unique index constraints (`anagrafica_id, tipo WHERE stato = 'IN_ATTESA'`), `upsert` calls failed with 500 exceptions. The API now uses a safe, sequential `delete` + `insert` pattern for pending approvals.


---

## 🔢 Progressive Registry Numbering

The registry utilizes gapless progressive numbers for both Soci and Tesserati:
-   **Soci**: Format `S-N/ANNO` (e.g. `S-1/2026`). Assigned upon council minute registration.
-   **Tesserati**: Format `T-N/ANNO` (e.g. `T-1/2026`). Assigned upon president/vp activation in the dashboard.
-   **Methodology**: Handled securely on the database layer via `next_registro_number(tipo, anno)` generator function called within the atomic transactions (`salva_verbale_relazionale` and `approva_tesserato`).
