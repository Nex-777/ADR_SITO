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

Added in version **1.00.25** and updated in **1.00.27**:
-   **Problem**: Users creating credentials (`auth.users`) and public profiles (`public.utenti`) but abandoning registration during OTP signing left "orphan/ghost" rows in the DB, blocking their emails.
-   **Dashboard Section**: "REGISTRAZIONI INCOMPLETE" (within the approval panel).
-   **Behavior**: Identifies pending users who lack `anagrafiche` profiles.
-   **Action**: Allows the President or Vice President to trigger the `elimina_utente_fantasma(p_utente_id)` RPC, performing a cascaded cleanup across the schema and removing the authentication row in `auth.users`.

---

## 🏋️‍♂️ Member & Athlete Dashboard Panels

Added in version **1.00.37**:
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
-   *Updated in version **1.00.38** to support dynamic course checkout based on chosen plans (e.g. Strongman e Powerlifting, Ibrido, SCAB).*

### 5. Pagamenti e Ricevute (Payments & Receipts)
-   Lists all user payments (memberships, donations, and events).
-   Provides an action to open a clean printable window containing receipt details (representing the paid invoice).

