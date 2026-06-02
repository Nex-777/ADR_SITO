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
