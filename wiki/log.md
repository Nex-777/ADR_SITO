# Wiki Transaction Log

Chronological append-only record of ingestions, lint passes, and updates to the LLM Wiki.

---

## [2026-05-31] bootstrap | Initial Wiki Setup
- Established the LLM Wiki schema in `AGENTS.md`.
- Created central directory structure in `wiki/`.
- Ingested files:
    - Root page: `index.html` (Landing page)
    - Registration: `portal/registrazione.html`
    - API & Functions: `api/otp.js`, `api/otp-verify.js`, `supabase/functions/otp/index.ts`
- Documented core project areas including:
    - [Project Overview](project_overview.md)
    - [Database Schema](database_schema.md)
    - [Frontend Architecture](frontend_architecture.md)
    - [Registration Flow](registration_flow.md)
    - [API Endpoints](api_endpoints.md)
    - [OTP Signature System](otp_signature_system.md)

## [2026-06-01] update | AI-Assisted Medical Certificate & Gated Onboarding
- Extended database schema in `public.certificati_medici` (added validation columns) and `public.utenti` (added metadata columns).
- Configured DB trigger function `sync_utente_to_normalized_tables()` to parse user-entered certificate details and handle metadata resets.
- Added RLS policy `self_update_certificato` for user-initiated mock validation updates.
- Redesigned `portal/registrazione.html` to capture certificate tipologia, emission date, and explicit GDPR health processing consent.
- Implemented Mock AI simulation on frontend and dashboard for staging phase validation testing.
- Restructured `portal/pagamento.html` and `portal/dashboard.html` to implement gated/conditional payment (payment unlocked only after certificate VERDE validation).
- Added President's GIALLO manual review queue and CSEN CSV export in `portal/dashboard.html`.
- Updated concept documentation: [Database Schema](database_schema.md) and [Registration Flow](registration_flow.md).

## [2026-06-01] update | Brand Header Graphics Across Portal Pages
- Updated the brand header in [login.html](../portal/login.html), [dashboard.html](../portal/dashboard.html), and [pagamento.html](../portal/pagamento.html) to display the Adrenalina logo (`assets/logo_icon.png` and `assets/logo.png`) and application version tag, ensuring consistency with the registration page and main landing page.


## [2026-06-01] update | Dropdown Styling & DB Trigger Security Definer Fixes
- Redefined database trigger function `sync_utente_to_normalized_tables()` with `SECURITY DEFINER` to bypass RLS policy blocks when inserting or updating normalized tables (like `indirizzi_residenza`) upon user profile updates.
- Patched dropdown option text styling in `portal/registrazione.html` and `portal/dashboard.html` to guarantee text visibility across all user agents/themes by setting `color-scheme: dark` and explicit option backgrounds/text colors.

## [2026-06-01] update | Interactive Column Sorting Standards
- Implemented client-side column-based sorting for all remaining tables in the administrator dashboard (Quote, Direttivo, Bilanci, Contabilità).
- Added visual indicator icons (▲/▼) to indicate sorting field and direction.
- Documented the general sorting standard for tabular visualizations in [Frontend Architecture](frontend_architecture.md).

## [2026-06-01] update | Board Minutes Relational Lifecycle & Quorum verification
- Defined four new relational tables on Supabase: `public.riunioni_consiglio`, `public.presenze_riunione`, `public.punti_odg`, and `public.votazioni_odg` to track the full lifecycle of minutes (verbali).
- Developed a secure database stored procedure `public.salva_verbale_relazionale()` using `SECURITY DEFINER` to atomically record minutes, presence, agenda points, votes, and mutate approved applicants' state to `ATTIVO` (and user roles to `socio_approvato`) in the Libro Soci.
- Upgraded the minutes modal in `portal/dashboard.html` to a 4-step wizard: general meeting parameters, dynamic board members checklist with live constitutive quorum calculation, automatic list of pending soci with approval selection, custom ODG point manager, and a dynamic plaintext preview conforming to legal requirements.
- Documented updated structures in [Database Schema](database_schema.md).

## [2026-06-01] update | Board Minutes Wizard Bugfixes
- Corrected input field background colors in the wizard (fixing the white-on-white text visibility issue) by adding specificity overrides for `input[type="text"]`, `input[type="date"]`, `input[type="time"]`, and `textarea` in the main stylesheet.
- Fixed the compiled minutes preview bug where approving a new member did not output their details. Added a robust array-or-object format handler for `anagrafiche` references to prevent TypeErrors and guarantee correct printing.
- Cleaned up unused legacy code (the singular `#modal-approvazione` modal and its submit functions) as member approvals are now fully handled within the board minutes wizard flow.

## [2026-06-01] update | Dashboard Check Session Robustness
- Updated `checkSession()` in `portal/dashboard.html` to prevent app hanging and loading freezes when retrieving user profile.
- Added a fallback query that attempts a simple profile lookup if the complex relational query (with joins) fails.
- Wrapped role description formatting and downstream data loaders (like `loadStats`, `loadSoci`, `loadContabilita`, etc.) in individual `try/catch` blocks so that a failure in one panel doesn't crash the entire session check.

## [2026-06-01] update | Dashboard JS Syntax Fix
- Resolved syntax error in `portal/dashboard.html` that caused script parsing to fail completely (`Uncaught SyntaxError: Unexpected end of input` / `Uncaught ReferenceError: switchTab is not defined`).
- Restored missing closing braces in the legacy `submitApprovazione()` function catch block that was left incomplete during code cleanup.

## [2026-06-02] ingest | SECURITY.md & Phase 0 Remediation
- Copied SECURITY_RULES.md to workspace root as SECURITY.md.
- Linked SECURITY.md in AGENTS.md for AI security enforcement.
- Implemented Phase 0 Security Remediations:
    - REM-01: Blocked user role escalation via SQL INSERT policies and custom trigger `public.proteggi_ruolo_utente` on table `public.utenti`.
    - REM-02: Removed dev mode bypass logic (`?dev=true` and `isDevMode` fallback) from `portal/registrazione.html`.
    - REM-03: Removed client-side mock OTP generation/fallback in registration page.
    - REM-04: Moved the `atti_adesione` update logic out of registration client-side flow and fully server-side.
    - REM-05: Added Authorization token Bearer checks to `/api/create-checkout-session` and updated `portal/pagamento.html`.
    - REM-06: Configured DB trigger `public.calcola_quota_utente` to compute registration fees on insert, removing client-side calc from `portal/registrazione.html`.
    - REM-07: Added restricted CORS whitelist to API endpoints (`api/otp.js`, `api/otp-verify.js`, `api/create-checkout-session.js`, and `supabase/functions/otp/index.ts`).
    - REM-08: Configured OTP expiry checking (5 minutes) using `created_at` timestamp on table `public.atti_adesione`.
    - REM-09: Switched to cryptographically secure random number generation (`crypto.randomInt` in Node.js, `crypto.getRandomValues` in Edge function).
    - REM-10: Created missing private storage bucket `documenti_tutori` and RLS policies on Supabase.

## [2026-06-02] update | Phase 1 Backend Hardening
- Implemented Phase 1 Backend Hardening Remediations:
    - REM-11: Replaced insecure `getPublicUrl` with dynamic `openSignedFile` helper in `portal/dashboard.html` to generate on-the-fly signed URLs for medical certificates.
    - REM-12: Added rate limiting checks to `api/otp.js`, `api/otp-verify.js` (with a 3-strikes OTP invalidation logic), and `api/create-checkout-session.js`.
    - REM-13: Fixed cron authentication check in `api/cron-scadenze.js` to fail-closed instead of fail-open.
    - REM-14: Added authorization check in stored procedure `salva_verbale_relazionale` restricting access to board members.
    - REM-15: Sanitized all API handler catch blocks to return generic internal server error messages instead of leaking database/runtime details.
    - REM-16: Solved invoice receipt number race conditions in `api/stripe-webhook.js` using Postgres sequence and `prossimo_numero_ricevuta` stored function.
    - REM-17: Secured SELECT policy on `utenti` table to allow profile retrieval only for owner and board members, preventing recursive policy resolution.
## [2026-06-02] update | Finalizing Phase 1 Storage URL Hardening
- Completed REM-11 storage hardening in [dashboard.html](../portal/dashboard.html) and [registrazione.html](../portal/registrazione.html) by fully replacing all remaining `getPublicUrl()` calls with `createSignedUrl()` to match private bucket security rules.

## [2026-06-02] update | Phase 2 Frontend Hardening
- Implemented Phase 2 Frontend Hardening Remediations:
    - REM-18: Implemented `escapeHtml()` helper and systematically sanitized all `innerHTML` assignments using user/database data inside [dashboard.html](../portal/dashboard.html) to prevent XSS.
    - REM-19: Removed Mock AI setTimeout automatic validation and set the initial state to `IN_ATTESA` upon certificate uploads in [dashboard.html](../portal/dashboard.html).
    - REM-20: Created [config.js](../portal/config.js) and [config.example.js](../portal/config.example.js) to centralize Supabase URL and anon client keys across all portal pages, while adding `config.js` to [.gitignore](../.gitignore).
    - REM-21: Strengthened client-side registration password validation in [registrazione.html](../portal/registrazione.html) to require a minimum of 8 characters, uppercase, lowercase, and numeric characters.
