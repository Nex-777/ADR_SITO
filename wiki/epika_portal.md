# EPIKA Portal Architecture

EPIKA is an isolated portal within Adrenalina Club focusing on historical re-enactment from Classical Antiquity (300 BC - 0 AD: Ancient Greece and Rome). 

---

## 🗄️ Database Tables (`epika_*`)

To satisfy the **Golden Rule** of not corrupting Adrenalina's workspace, all EPIKA data is contained in isolated tables prefixed with `epika_`.

### 1. `public.epika_gruppi_storici`
Stores the lookup of historical groups and their associated ancient cultures.
*   `id` (BIGINT PK)
*   `nome` (TEXT UNIQUE)
*   `popolo` (TEXT NULLABLE)
*   `attivo` (BOOLEAN DEFAULT TRUE)

#### Seed Data:
- `Kaitorikes` (Celti)
- `Lega Panellenica` (Greci)
- `Legio Malasorte` (Romani)
- `Torc Na Moire` (Celti)
- `Drukos Liguri` (Liguri)
- `Lega Italica` (Sanniti)
- `Aes Cranna` (Celti)
- `Villhest Folk` (Germani)
- `Mercenari` (NULL)

### 2. `public.epika_gruppi_lavoro`
Stores working groups that assist in organizing events.
*   `id` (BIGINT PK)
*   `nome` (TEXT UNIQUE)
*   `ordine` (INT) - Used for structural sorting.
*   `attivo` (BOOLEAN DEFAULT TRUE)

#### Seed Data:
1. `Direttivo EPIKA`
2. `Direttivo SCAB`
3. `Direttivo Logistica`
4. `Direttivo Marketing`
5. `Gruppo Capi Gruppo`
6. `Gruppo Responsabili Iscrizioni`
7. `Gruppo Validatori`
8. `Coordinamento Allenatori Validatori`

### 3. `public.epika_opzioni`
Lookup table for dynamic system options, such as coaches.
*   `id` (BIGINT PK)
*   `tipo` (TEXT DEFAULT 'allenatore')
*   `valore` (TEXT)
*   `attivo` (BOOLEAN DEFAULT TRUE)

#### Seed Data:
- Beleno, Canturios, Cunagato, Garid, Kratos, Lisando, Minor, Tito, Nevio, Mirco

### 4. `public.epika_profili`
Stores historical profile data for members.
*   `id` (UUID PK, FK to `public.utenti.id` with `ON DELETE CASCADE`)
*   `nome_di_battaglia` (TEXT UNIQUE case-insensitive, CHECK length <= 40)
*   `ruolo_combattimento` (TEXT CHECK `combattente`, `non_combattente`)
*   `popolo` (TEXT)
*   `gruppo_storico_id` (BIGINT FK to `epika_gruppi_storici.id`)
*   `allenatore_id` (BIGINT FK to `epika_opzioni.id`)
*   `gruppo_lavoro_id` (BIGINT FK to `epika_gruppi_lavoro.id`, NULL if none)
*   `is_admin_epika` (BOOLEAN DEFAULT FALSE)
*   `primo_anno_partecipazione` (INT)
*   `profilo_completato` (BOOLEAN DEFAULT FALSE)

### 5. `public.epika_eventi`
Stores historical re-enactment events (independent from Adrenalina courses/events).
*   `id` (UUID PK)
*   `titolo` (TEXT)
*   `descrizione` (TEXT)
*   `data_evento` (DATE)
*   `luogo` (TEXT)
*   `tipo_evento` (TEXT CHECK `campo_marzio`, `torneo`, `altro`)
*   `max_partecipanti` (INT)
*   `attivo` (BOOLEAN DEFAULT TRUE)

### 6. `public.epika_iscrizioni_eventi`
Stores member registrations to events.
*   `id` (UUID PK)
*   `evento_id` (UUID FK to `epika_eventi.id` ON DELETE CASCADE)
*   `utente_id` (UUID FK to `utenti.id` ON DELETE CASCADE)
*   Unique index on `(evento_id, utente_id)`

### 7. `public.epika_presenze_eventi`
Stores confirmed event attendance (used to calculate member statistics on the fly).
*   `id` (UUID PK)
*   `evento_id` (UUID FK to `epika_eventi.id` ON DELETE CASCADE)
*   `utente_id` (UUID FK to `utenti.id` ON DELETE CASCADE)
*   `presente` (BOOLEAN DEFAULT FALSE)
*   `confermato_da` (UUID FK to `utenti.id`)
*   Unique index on `(evento_id, utente_id)`

### 8. `public.epika_registro_modifiche_profilo`
Stores audit logs for athlete profile modifications (such as battle name/historical name, historical group, people/culture, combat role, and reference coach).
*   `id` (BIGINT PK)
*   `profilo_id` (UUID FK to `epika_profili.id` ON DELETE CASCADE)
*   `campo` (TEXT) - Name of the modified field (`Nome Storico`, `Gruppo Storico`, `Popolo/Cultura`, `Ruolo Combattimento`, `Allenatore`)
*   `valore_precedente` (TEXT)
*   `valore_nuovo` (TEXT)
*   `data_modifica` (TIMESTAMPTZ DEFAULT NOW())

### 9. `public.epika_scab_abilitazioni`
Stores annual SCAB combat certification state per athlete.
*   `id` (BIGINT PK)
*   `profilo_id` (UUID FK to `epika_profili.id` ON DELETE CASCADE)
*   `anno_abilitativo` (INT)
*   `allenatore_opzione_id` (BIGINT FK to `epika_opzioni.id`)
*   `allievo_opzione_id` (BIGINT FK to `epika_opzioni.id`)
*   `validatore_opzione_id` (BIGINT FK to `epika_opzioni.id`)
*   `stato_allenatore` (TEXT CHECK `in_attesa`, `in_valutazione`, `video_fatto`, `video_in_valutazione`)
*   `stato_validatore` (TEXT CHECK `giallo`, `rosso`, `verde`)
*   `ha_partecipato_cm` (BOOLEAN)
*   `data_scadenza` (DATE)

---

## ⚔️ SCAB Combat Certification Workflow

1. **Athlete Request**: The athlete requests annual certification by selecting an Allenatore or Allievo Allenatore. The system invokes `crea_richiesta_abilitazione`, automatically resolving the supervising coach and structure validator via `epika_scab_abbinamenti`, and setting expiration (Dec 31 if Campo Marzio attended, Aug 31 otherwise).
2. **Trainer Assessment**: The Allenatore updates evaluation state (`in_attesa` → `in_valutazione` → `video_fatto` → `video_in_valutazione`) via `aggiorna_stato_allenatore`.
3. **Validator Approval**: The Validatore sets the validation semaphore (`giallo` → `verde`/`rosso`) via `aggiorna_stato_validatore`.
4. **Assistant Trainer View & Hierarchical Resolution**: The Allievo Allenatore monitors athletes under their supervision in read-only mode. In the Allenatore dashboard and event participant lists, `getAllenatoreAllieviIds` dynamically resolves both direct athletes (`epika_profili.allenatore_id = coach_id`) and athletes trained by assigned assistant trainers (`epika_profili.allenatore_id IN opzioniAllieviIds` resolved via `epika_scab_abbinamenti`).

### 10. `public.epika_battaglie_eventi`
Stores individual battle results during Campo Martio events (e.g. Friday/Saturday battles).
*   `id` (UUID PK)
*   `evento_id` (UUID FK to `epika_eventi.id` ON DELETE CASCADE)
*   `numero_battaglia` (INT)
*   `vincitore` (TEXT CHECK `A`, `B`, `PAREGGIO`)
*   `note` (TEXT)
*   Unique constraint on `(evento_id, numero_battaglia)`

### 11. `public.epika_campioni_scab`
Stores annual SCAB champion designations managed within the SCAB portal section.
*   `id` (BIGINT PK)
*   `anno` (INT UNIQUE)
*   `profilo_id` (UUID FK to `epika_profili.id` ON DELETE SET NULL)
*   `nome_campione` (TEXT)
*   `note` (TEXT)

### 12. `public.epika_cm_gruppi_vincenti`
Stores historical winning groups lookup per year for Gloria points computation.
*   `anno` (INT PK)
*   `nome_gruppo` (TEXT PK)

### 13. `public.epika_richiami_encomi`
Stores individual commendations (encomi) and infractions/warnings (richiami) per athlete across events and general conduct.
*   `id` (BIGINT PK)
*   `atleta_id` (UUID FK to `epika_profili.id` ON DELETE CASCADE)
*   `autore_id` (UUID FK to `epika_profili.id` ON DELETE SET NULL)
*   `evento_id` (UUID FK to `epika_eventi.id` ON DELETE SET NULL)
*   `tipo` (TEXT CHECK `richiamo`, `encomio`)
*   `categoria` (TEXT CHECK `disciplinare`, `comportamentale`, `tecnico_sicurezza`, `ritardo_assenza`, `violazione_regolamento`, `valore_in_battaglia`, `fair_play`, `spirito_gruppo`, `merito_organizzativo`, `onore_al_campo`)
*   `gravita` (TEXT CHECK `lieve`, `medio`, `grave`, `nota_merito`, `solenne`, `onorifico`)
*   `motivazione` (TEXT)
*   `note_interne_direttivo` (TEXT)
*   `data_assegnazione` (DATE)
*   `attivo` (BOOLEAN DEFAULT TRUE)

### 14. `public.epika_palmares_atleti`
Stores historical tournament results, podiums, titles, and special recognitions per athlete.
*   `id` (UUID PK)
*   `atleta_id` (UUID FK to `epika_profili.id` ON DELETE CASCADE)
*   `anno` (INT)
*   `tipo` (TEXT CHECK `torneo`, `titolo`, `onorificenza`, `speciale`)
*   `titolo_evento` (TEXT)
*   `posizione` (INT NULLABLE, e.g. 1, 2, 3)
*   `dettagli` (TEXT)
*   `attivo` (BOOLEAN DEFAULT TRUE)
*   `created_at` (TIMESTAMPTZ DEFAULT NOW())
*   `updated_at` (TIMESTAMPTZ DEFAULT NOW())

### 15. `public.epika_contabilita_eventi`
Stores manual accounting movements (expenses and manual revenues) both for specific events and general EPIKA treasury prima nota (when `evento_id IS NULL`), combining with automatic registration fees from `epika_iscrizioni_eventi`.
*   `id` (UUID PK)
*   `evento_id` (UUID NULLABLE, FK to `epika_eventi.id` ON DELETE CASCADE) - `NULL` for General EPIKA entries.
*   `tipo_movimento` (TEXT CHECK `entrata`, `uscita`)
*   `voce` (TEXT) - Description of transaction
*   `quantita` (INT DEFAULT 1)
*   `importo_unitario` (NUMERIC(10,2))
*   `metodo_pagamento` (TEXT CHECK `cassa`, `banca`)
*   `data_movimento` (DATE)
*   `note` (TEXT)
*   `creato_da` (UUID FK to `epika_profili.id` ON DELETE SET NULL)
*   `attivo` (BOOLEAN DEFAULT TRUE) - Soft delete
*   `created_at` (TIMESTAMPTZ DEFAULT NOW())
*   `updated_at` (TIMESTAMPTZ DEFAULT NOW())

---

## ⚡ POTENZA & Scheda Battaglie Workflow

For each Campo Martio event, the system calculates the **POTENZA** ranking per Historical Group using the formula:
$$\text{POTENZA} = \text{FORZA NUMERICA} + \text{PUNTI GLORIA} + \text{BONUS CAMPIONE SCAB}$$

1. **Forza Numerica**: Counts active fighters (`ruolo_combattimento = 'combattente'`) with confirmed attendance (`epika_presenze_eventi.presente = TRUE`).
2. **Punti Gloria**: Tally of past 3 years' victories (3 yrs ago: 1pt, 2 yrs ago: 2pts, 1 yr ago: 3pts) queried from `epika_cm_gruppi_vincenti`. Draws award 0 points.
3. **Bonus Campione SCAB**: Grants +2 bonus points directly to the historical group if the year's defending SCAB Champion (`epika_campioni_scab`) is confirmed present as a fighter at the event.
4. **Scheda Battaglie**: Administrators log individual Friday/Saturday battles within `GESTIONE ESERCITI`. Clicking **DICHIARA VINCITORE** updates `epika_eserciti_eventi.esercito_vincente` and syncs winning groups into `epika_cm_gruppi_vincenti`.

---

## 🔒 Row Level Security (RLS)

- Lookups (`epika_gruppi_storici`, `epika_gruppi_lavoro`, `epika_opzioni`, `epika_cm_gruppi_vincenti`, `epika_campioni_scab`): Read access to all authenticated users. Write/Delete restricted to President or users with `is_admin_epika = TRUE`.
- Profiles (`epika_profili`): Select allowed for the owner, President, `is_admin_epika = TRUE`, or any Capogruppo/Vice Capogruppo of the profile's current or historical group (to access member lists and cronologia mandati). Update allowed only for the owner, President, or `is_admin_epika = TRUE`. Insert allowed only for the owner. Validated by `BEFORE INSERT OR UPDATE` trigger `trg_check_epika_tessera_ruolo` to prevent base card holders from enrolling as `combattente` and to automatically nullify `allenatore_id` for `non_combattente`.
- Abilitazioni (`epika_scab_abilitazioni`): Select allowed for all authenticated users. Insert/Update mutations restricted exclusively through `SECURITY DEFINER` RPCs (`crea_richiesta_abilitazione`, `aggiorna_stato_allenatore`, `aggiorna_stato_validatore`) enforcing strict caller role verification.
- Events (`epika_eventi`, `epika_eserciti_eventi`, `epika_battaglie_eventi`): Read allowed for all authenticated users. Writes/Delete restricted to admins.
- Signups & Attendance: Select/write restricted to owner/admin where appropriate.
- Audit Log (`epika_registro_modifiche_profilo`): Select allowed for the profile owner, President, or users with `is_admin_epika = TRUE`. Write operations restricted to database trigger only.

---

## 📢 Direttivo Marketing & Consensi GDPR

### 1. Accesso e Visibilità Direttivo Marketing
Gli utenti con ruolo `Direttivo Marketing` (`gruppo_lavoro_id = 4`) hanno accesso in modalità **Read-Only (Sola Visione)** alle seguenti sezioni del portale amministratore:
- **SCAB** (Palestre, Centri Pratica, Validatori, Allenatori, Allievi Allenatori, Campioni)
- **Gruppi Storici** (Lista e Dettaglio gruppo con Registro Storico Stati e Cronologia Mandati)
- **Popoli** (Anagrafica popoli e culture)
- **Eventi & Presenze**
- **Lista Generale** (Planning componenti)
- **Marketing**

### 2. Sicurezza e Protezione Read-Only
- **Frontend DOM Security**: Disabilitazione/occultamento automatico di form di inserimento, pulsanti di salvataggio, cancellazione, binding e attivazione/disattivazione in modalità `isReadOnly()`.
- **Backend RLS**: Tutte le operazioni di scrittura (`INSERT`, `UPDATE`, `DELETE`) sulle tabelle `epika_*` rimangono protette a livello database e consentite esclusivamente agli amministratori (`is_admin_epika = TRUE` o `presidente`).

### 3. Visualizzazione Consenso Riprese Audio/Video (GDPR)
Nella **Lista Generale**, ciascun tesserato espone lo stato del consenso al trattamento delle riprese audio/video e foto (`public.utenti.consenso_audiovisivi`):
- 🟢 `📹 RIPRESE A/V: SÌ` (se `consenso_audiovisivi = TRUE`)
- 🔴 `🚫 RIPRESE A/V: NO` (se `consenso_audiovisivi = FALSE` o `NULL`)
È inoltre disponibile il filtro dedicato `#gen-filter-consenso` per filtrare la tabella per consenso accordato o negato.



