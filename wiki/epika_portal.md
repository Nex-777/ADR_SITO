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
*   `nome_di_battaglia` (TEXT)
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

---

## 🔒 Row Level Security (RLS)

- Lookups (`epika_gruppi_storici`, `epika_gruppi_lavoro`, `epika_opzioni`): Read access to all authenticated users. Write/Delete restricted to President or users with `is_admin_epika = TRUE`.
- Profiles (`epika_profili`): Select/Update allowed only for the owner, President, or `is_admin_epika = TRUE`. Insert only allowed for the owner.
- Events (`epika_eventi`): Read allowed for all authenticated users. Writes/Delete restricted to admins.
- Signups & Attendance: Select/write restricted to owner/admin where appropriate.
