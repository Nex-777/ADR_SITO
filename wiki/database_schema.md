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
| `versione_privacy` | `varchar` | Version of the privacy policy accepted at signature time (e.g. `1.03.90`). |

### 2. `public.registro_consensi`
Registro di audit append-only immutabile per la storicizzazione di ogni modifica ai consensi (marketing, audiovisivi).

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Chiave primaria della variazione consenso. |
| `utente_id` | `uuid` (FK) | Riferimento a `public.utenti(id)` ON DELETE CASCADE. |
| `tipo_consenso` | `varchar` | Tipo di consenso variato (`consenso_marketing`, `consenso_audiovisivi`). |
| `stato_consenso` | `boolean` | Valore del consenso (`true` / `false`). |
| `fonte_modifica` | `varchar` | Origine del consenso (`registrazione_otp` via service_role vs `dashboard_utente`). |
| `versione_policy` | `varchar` | Versione dell'informativa privacy in vigore. |
| `ip_address` | `varchar` | Indirizzo IP del firmatario/utente al momento della modifica. |
| `created_at` | `timestamptz` | Data e ora esatta dell'operazione. |

### 3. `public.certificati_medici`
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
| `deciso_da` | `uuid` (FK) | References `utenti(id)` for the decider. |

### 8. `public.eventi`
Stores courses and events information.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique ID of the event. |
| `titolo` | `varchar` | Title of the course/event. |
| `descrizione` | `text` | Extended description of details. |
| `data_evento` | `date` | Scheduled date. |
| `ora_evento` | `time` | Scheduled start time. |
| `luogo` | `text` | Venue description. |
| `prezzo` | `numeric` | Booking fee (0.00 for free). |
| `stripe_price_id` | `text` | Optional Stripe pricing token. |
| `max_partecipanti` | `integer` | Attendance cap. |

### 9. `public.iscrizioni_eventi`
Tracks athlete bookings to courses and events.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique booking record ID. |
| `evento_id` | `uuid` (FK) | References `eventi(id)`. |
| `utente_id` | `uuid` (FK) | References `utenti(id)`. |
| `data_iscrizione` | `timestamp` | Time the registration occurred. |
| `stato_pagamento` | `varchar` | State of payment (`DA_PAGARE`, `PAGATO`, `GRATUITO`). |
| `codice_transazione` | `text` | Stripe payment intent code (if paid). |

### 10. `public.comunicazioni`
Stores noticeboard announcements.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Unique notice ID. |
| `titolo` | `varchar` | Header of the notice. |
| `testo` | `text` | Content body. |
| `data_creazione` | `timestamp` | Date posted. |
| `tipo` | `varchar` | Notice tag (`GENERALE`, `AVVISO`, `URGENTE`). |
| `creato_da` | `uuid` (FK) | References the author in `utenti(id)`. |

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
WHERE u.ruolo && ARRAY['tesserato_esterno'::ruolo_utente]
  AND NOT (u.ruolo && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente, 'istruttore'::ruolo_utente, 'volontario'::ruolo_utente])
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

1. **Trigger `on_auth_user_created` (Sincronizzazione Auth-Utenti)**: Creato trigger `AFTER INSERT` su `auth.users` associato alla funzione `public.handle_new_user()`. Garantisce l'inserimento immediato e transazionale del record base in `public.utenti` (con ruolo `tesserato_esterno`), eliminando la possibilità di creare utenti orfani se il client si disconnette dopo la chiamata `signUp`.
2. **Trigger sync deletion**: Removed redundant DB trigger `tr_sync_utente_to_normalized` on `public.utenti`. This trigger was conflicting with the API registration flow (which already performs the inserts manually in `/api/otp-verify.js`), causing errors like `record "new" has no field "step_registrazione"` during user signups.
3. **OTP Verify API Upsert Fix**: Modified `api/otp-verify.js` to avoid calls to `.upsert()` on the staging table `registro_approvazioni`. Because of partial unique index constraints (`anagrafica_id, tipo WHERE stato = 'IN_ATTESA'`), `upsert` calls failed with 500 exceptions. The API now uses a safe, sequential `delete` + `insert` pattern for pending approvals.


---

## 🔢 Progressive Registry Numbering

The registry utilizes gapless progressive numbers for both Soci and Tesserati:
-   **Soci**: Format `S-N/ANNO` (e.g. `S-1/2026`). Assigned upon council minute registration.
-   **Tesserati**: Format `T-N/ANNO` (e.g. `T-1/2026`). Assigned upon president/vp activation in the dashboard.
-   **Methodology**: Handled securely on the database layer via `next_registro_number(tipo, anno)` generator function called within the atomic transactions (`salva_verbale_relazionale` and `approva_tesserato`).

---

## 🏋️‍♂️ Gestione Corsi, Istruttori e Presenze (Riforma 2026)

Le seguenti tabelle, colonne e viste supportano il sistema di assegnazione istruttori e registro presenze introdotto a Giugno 2026:

### 1. Colonne aggiuntive su `public.eventi`
- `tipo` (`varchar`): Distingue tra `'corso'` (corsi ricorrenti settimanali) e `'evento'` (singolo evento o stage).
- `orari_settimanali` (`jsonb`): Contiene la programmazione dei giorni e orari del corso (es. `[{"giorno": "LUN", "ora": "18:00"}, {"giorno": "MER", "ora": "18:00"}]`).
- `piani_abbonamento` (`jsonb`): Contiene i piani di pagamento associabili al corso (es. `[{"nome": "Mese", "prezzo": 65, "durata_mesi": 1}]`).

### 2. Colonne aggiuntive su `public.iscrizioni_eventi`
- `orario_libero` (`boolean`): Specifica se l'atleta usufruisce del corso al di fuori degli orari previsti (orario libero, default `false`).
- `data_inizio_corso` (`date`): Data di inizio dell'abbonamento al corso.
- `data_scadenza_corso` (`date`): Data di scadenza dell'abbonamento al corso.
- `scadenza_modificata_a_mano` (`boolean`): Flag che indica se la scadenza del corso è stata modificata a mano dall'istruttore.

### 3. Nuova tabella `public.istruttori_eventi`
Mappa l'assegnazione molti-a-molti degli istruttori ai corsi.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Chiave primaria. |
| `evento_id` | `uuid` (FK) | Riferimento a `public.eventi(id)` ON DELETE CASCADE. |
| `istruttore_id` | `uuid` (FK) | Riferimento a `public.utenti(id)` ON DELETE CASCADE. |
| `data_assegnazione` | `timestamptz` | Data e ora dell'assegnazione. |

### 4. Nuova tabella `public.presenze_eventi`
Tiene traccia delle presenze degli atleti registrate dagli istruttori lezione per lezione.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Chiave primaria. |
| `evento_id` | `uuid` (FK) | Riferimento a `public.eventi(id)` ON DELETE CASCADE. |
| `utente_id` | `uuid` (FK) | Riferimento a `public.utenti(id)` ON DELETE CASCADE. |
| `data_lezione` | `date` | Data del giorno di lezione. |
| `presente` | `boolean` | Flag di presenza (default `false`). |
| `registrato_da` | `uuid` (FK) | Riferimento all'istruttore/operatore in `public.utenti(id)`. |
| `created_at` | `timestamptz` | Timestamp creazione. |

### 5. Nuova vista `public.vw_stato_atleta_corso`
Centralizza tutti i join relativi a tesseramento, quota annuale, quota corso, certificato medico e date abbonamento corso (esponendo **solo** lo stato del semaforo e la scadenza per la tutela dei dati sensibili degli atleti).

```sql
CREATE OR REPLACE VIEW public.vw_stato_atleta_corso AS
SELECT
    ie.id AS iscrizione_id,
    ie.evento_id,
    ie.utente_id,
    ie.stato_pagamento,
    ie.orario_libero,
    ie.data_inizio_corso,
    ie.data_scadenza_corso,
    ie.scadenza_modificata_a_mano,
    u.nome,
    u.cognome,
    COALESCE(u.quota_totale, 0) AS quota_totale,
    CASE WHEN COALESCE(u.quota_totale, 0) <= 0 THEN true ELSE false END AS quota_annuale_ok,
    rs.quota_scadenza,
    rt.stato_tesseramento,
    cm.stato_validazione AS cert_stato,
    cm.data_scadenza AS cert_scadenza,
    CASE
        WHEN cm.stato_validazione = 'VERDE' AND cm.data_scadenza >= CURRENT_DATE THEN true
        ELSE false
    END AS cert_valido
FROM public.iscrizioni_eventi ie
JOIN public.utenti u ON u.id = ie.utente_id
LEFT JOIN public.anagrafiche a ON a.utente_id = u.id
LEFT JOIN public.registro_soci rs ON rs.anagrafica_id = a.id
LEFT JOIN public.registro_tesserati rt ON rt.anagrafica_id = a.id
LEFT JOIN LATERAL (
    SELECT stato_validazione, data_scadenza
    FROM public.certificati_medici
    WHERE certificati_medici.anagrafica_id = a.id
    ORDER BY data_scadenza DESC
    LIMIT 1
) cm ON true;
```

---

## 🔒 Policy di Sicurezza RLS per Corsi e Presenze

Le seguenti regole di accesso e scrittura controllano le tabelle relative ai corsi e presenze:

### `public.eventi`
- **SELECT**: Consentito a tutti gli utenti autenticati (`auth.uid() IS NOT NULL`).
- **ALL (Write)**: Limitato esclusivamente al ruolo `presidente` e `vice_presidente` (tramite controllo array in `utenti.ruolo`).

### `public.iscrizioni_eventi`
- **SELECT**: Consentito a membri del Consiglio Direttivo, all'atleta stesso (`utente_id = auth.uid()`), o agli istruttori assegnati a quel corso (`istruttori_eventi`).
- **INSERT**: Consentito all'utente stesso per iscrizioni dirette ad eventi gratuiti o tramite webhooks Stripe (bypassa RLS via Service Role).
- **DELETE**: Riservato a `presidente` e `vice_presidente`.

### `public.istruttori_eventi`
- **SELECT**: Consentito ai membri del Consiglio Direttivo o all'istruttore stesso (`istruttore_id = auth.uid()`).
- **ALL (Write)**: Riservato a `presidente` e `vice_presidente`.

### `public.presenze_eventi`
- **SELECT**: Consentito ai membri del Consiglio Direttivo o agli istruttori assegnati al corso.
- **INSERT/UPDATE**: Consentito solo agli istruttori assegnati a quel corso.
- **DELETE**: Riservato a `presidente` e `vice_presidente`.

## 🩹 Patch Istruttori v2

Introdotta con `migration_patch_istruttori_v2.sql` per consolidare le policy e l'area atleta:
- **`public.iscrizioni_eventi` (UPDATE)**: Aggiunta policy `update_own_iscrizioni` (permette agli atleti di modificare la colonna `orario_libero` delle proprie iscrizioni) e `update_board_iscrizioni` (consente al Direttivo di aggiornare le iscrizioni).
- **Accesso Istruttori**: Estese le policy di `SELECT` sulle tabelle `utenti`, `anagrafiche`, `registro_soci`, `registro_tesserati` e `certificati_medici` per consentire agli istruttori di visualizzare lo stato (badge/semafori) esclusivamente per gli atleti iscritti ai corsi da loro seguiti.

## ⚔️ Abilitazioni al Combattimento SCAB (EPIKA 2026)

Introdotta con `migration_epika_scab_abilitazioni.sql` per la gestione del ciclo annuale di abilitazione al combattimento SCAB per gli atleti.

### Tabella: `public.epika_scab_abilitazioni`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `bigint` (PK) | Identificativo dell'abilitazione. |
| `profilo_id` | `uuid` (FK) | Riferimento al profilo in `epika_profili(id)`. |
| `anno_abilitativo` | `integer` | Anno di riferimento dell'abilitazione (es. `2026`). |
| `allenatore_opzione_id` | `bigint` (FK) | Allenatore titolare in `epika_opzioni(id)`. |
| `allievo_opzione_id` | `bigint` (FK) | Allievo allenatore (opzionale) in `epika_opzioni(id)`. |
| `validatore_opzione_id` | `bigint` (FK) | Validatore di riferimento in `epika_opzioni(id)`. |
| `stato_allenatore` | `text` | Stato gestito dall'allenatore: `in_attesa`, `in_valutazione`, `video_fatto`, `video_in_valutazione`. |
| `stato_validatore` | `text` | Semaforo del validatore: `giallo`, `rosso`, `verde`. |
| `note_allenatore` | `text` | Note dell'allenatore. |
| `note_validatore` | `text` | Note del validatore. |
| `ha_partecipato_cm` | `boolean` | Flag presenza al Campo Marzio nell'anno corrente. |
| `data_scadenza` | `date` | Data di scadenza abilitazione (31/12 se CM, 31/08 se no CM). |
| `created_at` | `timestamptz` | Data creazione richiesta. |
| `updated_at` | `timestamptz` | Data ultimo aggiornamento. |

### RPC PostgreSQL SECURITY DEFINER
1. **`public.crea_richiesta_abilitazione(p_anno INT, p_soggetto_opzione_id BIGINT)`**:
   - Invocata dall'atleta per inviare la richiesta di abilitazione per l'anno corrente.
   - Risolve automaticamente l'allenatore supervisore ed il validatore della struttura tramite `epika_scab_abbinamenti`.
   - Verifica la presenza a Campo Marzio e imposta la data di scadenza.
2. **`public.aggiorna_stato_allenatore(p_abilitazione_id BIGINT, p_nuovo_stato TEXT, p_note TEXT)`**:
   - Invocata dall'allenatore per aggiornare lo stato di valutazione dell'atleta.
   - Valida che il chiamante (`auth.uid()`) corrisponda all'allenatore o co-allenatore responsabile.
3. **`public.aggiorna_stato_validatore(p_abilitazione_id BIGINT, p_nuovo_stato TEXT, p_note TEXT)`**:
   - Invocata dal validatore per aggiornare il semaforo (giallo/rosso/verde).
   - Valida che il chiamante (`auth.uid()`) corrisponda al validatore di riferimento.

