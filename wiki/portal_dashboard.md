# Portal Dashboard

The client administration dashboard is implemented in [dashboard.html](../portal/dashboard.html). It dynamically presents interfaces based on user roles (Athletes, President, Vice President) fetched from the Supabase Session.

---

## 👥 Role-Based Access Controls (RBAC)

The dashboard layout changes depending on the user's role retrieved from the database:
-   **Athletes (`tesserato_esterno`)**: Access to personal metrics, payment history, and physical profile.
-   **Management Roles (`presidente`, `vice_presidente`)**: Access to the administrative panels, audit trail, member registry, and pending approvals.

---

## 📑 Administrative Views & Tables

The management board organizes athletes and verification files via three registries:
1.   **Registro Soci**: Active association members with voting rights.
2.   **Registro Tesserati**: Course participants/athletes with valid sports licenses.
3.   **Storico Approvazioni**: Archive of past registration approvals and signatures.

---

## 👻 Ghost Users Resolution Panel

Added in version **1.02.19** and updated in **1.02.19**:
-   **Problem**: Users creating credentials (`auth.users`) and public profiles (`public.utenti`) but abandoning registration during OTP signing left "orphan/ghost" rows in the DB, blocking their emails.
-   **Dashboard Section**: "REGISTRAZIONI INCOMPLETE" (within the approval panel).
-   **Behavior**: Identifies pending users who lack `anagrafiche` profiles.
-   **Action**: Allows the President or Vice President to trigger the `elimina_utente_fantasma(p_utente_id)` RPC, performing a cascaded cleanup across the schema and removing the authentication row in `auth.users`.

---

## 🏋️‍♂️ Member & Athlete Dashboard Panels

Added in version **1.02.19**:
Standard athletes and members (`!isBoardMember` such as `tesserato_esterno` or `socio_approvato`) have a personalized workspace:

### 1. Panoramica (Overview)
-   **Registration Date**: Displayed as technical information indicating when the athlete profile was approved.
-   **Membership Expiry**: Expiry tracker with dynamic status badge (Active/Expired).
-   **Medical Certificate Status**: Quick overview of validity.
-   **Noticeboard (Bacheca)**: Renders recent club announcements fetched from `public.comunicazioni`.
-   **Download Area**: Section with links to download corporate documents (Statutes, Rules, Waivers).

### 2. Il Mio Profilo (My Profile)
-   **Profile Data Update**: Allows editing contact information, phone, address, and emergency contact details.
-   **Avatar Upload**: Enables uploading profile pictures to `certificati_medici` bucket under the `avatars/` folder.
-   **Security**: Dedicated change password form.
-   **Privacy Controls**: Toggles to update newsletter/marketing and media (photos/videos) releases.

### 3. Certificato Medico (Medical Certificate)
-   Displays validation traffic light state (`VERDE` / `GIALLO` / `ROSSO` / `IN_ATTESA`) and notes.
-   A form to upload a new medical certificate (which sets verification status to `IN_ATTESA`).
-   History log table showing all past uploads.

### 4. Corsi ed Eventi (Courses & Events)
-   **Catalogo**: A grid showing all active activities. Supports multi-tier subscription plans (e.g. Mensile, Trimestrale, Semestrale, Annuale) rendered as a brutalist select dropdown that dynamically updates the price tag on option changes.
-   **Reservations**: Display of active bookings.
-   **Payment Redirection**: Redirects to a dynamic Stripe session specifying the exact plan selected (or registers directly for free events).
-   *Updated in version **1.02.19** to support dynamic course checkout based on chosen plans (e.g. Strongman e Powerlifting, Ibrido, SCAB).*

### 5. Pagamenti e Ricevute (Payments & Receipts)
-   Lists all user payments (memberships, donations, and events).
-   Provides an action to open a clean printable window containing receipt details (representing the paid invoice).

---

## 🏋️‍♂️ Gestione Corsi ed Eventi (Direttivo)

Aggiunto nella versione **1.02.19**:
-   **Ruoli Autorizzati**: `presidente` e `vice_presidente`.
-   **Dashboard Section**: Tab "GESTIONE CORSI" nella sidebar amministrativa.
-   **Funzionalità CRUD**:
    -   **Creazione/Modifica Corso**: Modale per inserire titolo, descrizione, luogo, prezzo base, Stripe Price ID e cap massimo partecipanti.
    -   **Orari Settimanali (JSONB)**: Sezione con checkbox per selezionare i giorni e time picker per l'ora.
    -   **Piani Abbonamento (JSONB)**: Interfaccia per aggiungere N piani tariffari associati (nome e prezzo).
    -   **Cancellazione**: Eliminazione logica del corso con cascata automatica su iscrizioni, presenze e assegnazioni.
-   **Assegnazione Istruttori**:
    -   Modale attivabile sulla riga del corso per assegnare uno o più istruttori (utenti con ruolo `istruttore`).
    -   Gestione dei differenziali (inserisce o cancella record in `istruttori_eventi` in base al delta delle checkbox).

---

## 👨‍🏫 Area Istruttore

Aggiunta nella versione **1.02.19**:
-   **Ruolo Autorizzato**: `istruttore`.
-   **Dashboard Section**: Tab "I MIEI CORSI" (contesto `instructor` nel switcher).
-   **Widget 1: I Miei Corsi**:
    -   Card grid dei corsi in cui l'utente loggato è assegnato come istruttore.
    -   Visualizza orari settimanali, luogo, numero iscritti totali e quanti di questi usufruiscono dell'orario libero.
-   **Widget 2: Registro Presenze**:
    -   **Date Picker**: Consente di registrare presenze per qualsiasi lezione (oggi, passata o futura).
    -   **Stato Atleti (View vw_stato_atleta_corso)**: Tabella atleti iscritti che visualizza:
        -   *Fruizione*: Badge "ORARIO LIBERO" o "ORARIO CORSO".
        -   *Stato Quota*: Stato pagamento abbonamento e quota annuale di iscrizione.
        -   *Tessera e CSEN*: Validità del tesseramento societario e tesseramento CSEN.
        -   *Certificato Medico*: Icona semaforo (🟢 Verde, 🟡 Giallo, 🔴 Rosso) e data di scadenza.
    -   **Registrazione Presenze**: Toggle checkbox per registrare la presenza dell'atleta.
    -   **Warning Visivi**: Righe contrassegnate con bordo rosso in caso di certificato medico non in regola/scaduto (il salvataggio è comunque consentito).
-   **Widget 3: Storico Presenze**:
    -   Visualizza l'elenco delle lezioni passate registrate, con conteggio dei presenti/assenti e l'indicazione dell'operatore che ha effettuato il salvataggio.
    -   Pulsante di modifica per riaprire il registro presenze per quella determinata data.


