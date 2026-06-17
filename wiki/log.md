# Wiki Transaction Log

Chronological append-only record of ingestions, lint passes, and updates to the LLM Wiki.

---

## [2026-06-18] update | Course Subscriptions UI & Version Bump (v1.00.38)
- Added subscription selection dropdown controls for the catalog courses (*Strongman e Powerlifting*, *Ibrido*, *SCAB*) inside `portal/dashboard.html`.
- Implemented visual dynamic price updating when choosing different subscription tiers (Mese, Trimestre, Semestre, Annuale).
- Linked selected plan values to the checkout API call (`/api/create-event-checkout-session`).
- Bumped application version to `1.00.38`.

## [2026-06-18] update | Member Dashboard Implementation (v1.00.37)
- Implemented the complete user dashboard for standard members in `portal/dashboard.html`.
- Extended the database schema with new tables `public.eventi`, `public.iscrizioni_eventi`, `public.comunicazioni`, and profile-related columns in `public.utenti`.
- Created `api/create-event-checkout-session.js` and updated `api/stripe-webhook.js` to automate event booking and payments.
- Bumped application version to `1.00.37`.

## [2026-06-18] update | Animated OTP Loading Indicator & Version Bump (v1.00.36)
- Implemented CSS animated spinners for the OTP confirmation button status updates in `portal/registrazione.html`.
- Updated test user Alessandro Bianchi status to paid and inserted receipt in database.
- Bumped application version to `1.00.36`.

## [2026-06-17] update | Admin Alert Banner Role Isolation (v1.00.35)
- Restricted the dynamic pending approvals alert banner to Board Members only in `portal/dashboard.html`.
- Filtered dashboard data loaders to prevent query overhead and console RLS warnings for non-board member profiles.
- Bumped application version to `1.00.35`.

## [2026-06-17] update | Subdomain Portal Migration, CORS & Stripe Hardening (v1.00.34)
- Configured dynamic CORS whitelist across APIs (`api/otp.js`, `api/otp-verify.js`, `api/create-checkout-session.js`) to support `portal.adrenalinaclub.it` and temporary `nex-777.github.io` origins.
- Resolved AI certificate validation loop bug by setting the API base url to use request headers host dynamically in `api/otp-verify.js`.
- Implemented Stripe webhook idempotency check on `codice_transazione` in `api/stripe-webhook.js`.
- Replaced hardcoded relative checkout redirect path in `portal/pagamento.html` with dynamic configured `API_BASE_URL`.
- Centralized fallback configuration values pointing to `https://portal.adrenalinaclub.it` across all frontend portal pages.
- Bumped application version to `1.00.34`.

## [2026-06-17] update | Fixed GitHub Pages config loading & Vercel API Base URL
- Removed `portal/config.js` and `config.js` from `.gitignore` to ensure configurations are pushed to GitHub Pages.
- Updated `portal/config.js` to set `API_BASE_URL` to the production Vercel deployment (`https://adr-sito.vercel.app`) instead of empty/relative paths.
- Bumped application version to `1.00.33` across all pages and configurations.

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

## [2026-06-02] update | Phase 3 Refinements & Compliance
- Implemented Phase 3 Security Refinements & Compliance:
    - REM-22: Created [vercel.json](../vercel.json) in project root configuring security headers (HSTS, nosniff, DENY, Permissions-Policy) and cron mapping for `/api/cron-scadenze`.
    - REM-23: Pinned Supabase JS UMD version `2.43.4` and added SRI `integrity` attributes along with `crossorigin="anonymous"` to GSAP, jsPDF, and Supabase JS libraries in `login.html`, `dashboard.html`, `pagamento.html`, and `registrazione.html`.
    - REM-25: Enforced security compliance linking `SECURITY.md` rules inside `AGENTS.md` to secure future agent operations.

## [2026-06-02] update | Safe Fallbacks for config.js 404 on Vercel
- Added inline `APP_CONFIG` fallback declarations to [registrazione.html](../portal/registrazione.html), [login.html](../portal/login.html), [pagamento.html](../portal/pagamento.html), and [dashboard.html](../portal/dashboard.html). This ensures that if the `.gitignore`-d `config.js` file is not found (404) on production deployments like Vercel, the application gracefully loads the correct Supabase anon/public key configuration without crashing. This restores the Fiscal Code auto-population functionality and all database connections on the live site.

## [2026-06-02] update | Fix onConflict constraint in registration
- Changed the upsert conflict target in `portal/registrazione.html` from `'id,codice_fiscale'` to `'id'`. Since `id` is the primary key (with a unique constraint `utenti_pkey`) and `codice_fiscale` is a separate unique constraint (`utenti_codice_fiscale_key`), targeting both in a single spec triggered a PostgreSQL syntax/definition error (42P10) because there is no single composite constraint matching both fields. Setting the conflict target to `'id'` resolves the profile save issue.

## [2026-06-02] update | President Profile Restore & Registration Security
- Restored the overwritten President profile (`Tito Fabio Paoletti` under `nexglg@gmail.com`) and cleared the erroneous "Alessandro Bianchi" entries that were written to the President's `utente_id` in `utenti`, `anagrafiche`, `atti_adesione`, etc.
- Modified [registrazione.html](../portal/registrazione.html) to implement:
  - A preventive database check searching for the input email prior to calling `auth.signUp` or `signInWithPassword`.
  - A block prohibiting registration resumption/upserts if the logged-in user already has an administrative role or is fully registered.

## [2026-06-02] update | OTP Expiration Extension & Manual Resend
- Increased the OTP validity period from 5 minutes to 15 minutes in the backend verification service `api/otp-verify.js` and updated the frontend countdown timer duration from 2 minutes to 15 minutes (900 seconds) in `portal/registrazione.html`.
- Added a manual resend link ("Non hai ricevuto la mail? Rinvia codice") in `portal/registrazione.html` allowing candidates to request a fresh OTP immediately without reloading or waiting for the timer to expire.
- Bumped application version to `1.00.17`.

## [2026-06-02] fix | Registration Retry Crash & Storage RLS Update Policies (v1.00.18)
- Fixed crash in `api/otp-verify.js`: changed `insert()` to `upsert(onConflict)` for `anagrafiche`, `indirizzi_residenza`, and `contatti` tables. This prevents a duplicate-key crash when OTP validation is retried after a partial failure.
- Fixed storage RLS bug: `upsert: true` on file uploads requires both INSERT and UPDATE policies. Only INSERT policies existed. Added missing UPDATE policies for all three buckets: `certificati_medici`, `documenti_adesione`, `documenti_tutori`.
- Verified and confirmed `elimina_utente_completo()` stored function covers full cascade cleanup including `auth.users`, `utenti`, `atti_adesione`, `ricevute_pagamenti`, `anagrafiche` (+ its cascade children). Recreated with added robustness.
- Manually cleaned all residual records for test user Alessandro Bianchi (`nexmny@gmail.com`) to allow fresh registration.
- Bumped application version to `1.00.18`.

## [2026-06-02] update | Registry Restructuring & Dashboard UI (v1.00.20)
- Designed and created new database staging table `registro_approvazioni` to queue socio/tesserato applications.
- Altered tables `registro_soci` and `registro_tesserati` to add progressives `numero_registro` for gapless numbering (`S-N/ANNO` and `T-N/ANNO`).
- Built DB stored function `next_registro_number` to dynamically fetch the next gapless index.
- Replaced database trigger `sync_utente_to_normalized_tables()` and stored procedure `salva_verbale_relazionale()` to write to `registro_approvazioni` and handle progressive numbering.
- Defined RPC `approva_tesserato` to safely move approved tesserati into the official ledger once medical certificates are validated VERDE.
- Patched API endpoint `api/otp-verify.js` to land pending signups into `registro_approvazioni` staging.
- Redesigned `portal/dashboard.html` adding the **REGISTRO APPROVAZIONI** tab, separating pending Soci and Tesserati, displaying `numero_registro` instead of DB serial IDs, adding a dynamic pending count alert banner, and securing `openSignedFile` against URL injection vectors.
- Bumped application version to `1.00.20`.

## [2026-06-02] release | Gapless Registry & Dashboard Fixes (v1.00.21)
- Finalized registry restructure, dashboard UI, and security fixes.
- Bumped application version to `1.00.21`.

## [2026-06-02] fix | Registration ON CONFLICT trigger error (v1.00.22)
- Fixed a bug in `sync_utente_to_normalized_tables()` trigger function where `ON CONFLICT (utente_id)` failed on `anagrafiche` insert because `utente_id` is not uniquely constrained. Changed it to `ON CONFLICT (codice_fiscale)` which is correctly indexed as unique.
- Bumped application version to `1.00.22`.

## [2026-06-02] fix | Registration redundant trigger & Date Validation (v1.00.23)
- Dropped the redundant DB trigger `tr_sync_utente_to_normalized` on `utenti` table. The trigger was conflicting with the OTP registration flow which already handles the exact same inserts via `api/otp-verify.js`, resolving the `record "new" has no field "step_registrazione"` error.
- Added frontend JS validation in `portal/registrazione.html` to prevent users from selecting a medical certificate issue date in the future.
- Bumped application version to `1.00.23`.

## [2026-06-02] fix | OTP Verify API Upsert Error (v1.00.24)
- Fixed a 500 Internal Server Error in `api/otp-verify.js` caused by `supabase.upsert()` failing against a partial unique index (`anagrafica_id, tipo WHERE stato = 'IN_ATTESA'`) in `registro_approvazioni`. Replaced the unsupported `upsert` with a safe `delete` + `insert` pattern for all 3 registration cases (Socio, Tesserato, Socio+Tesserato).
- Bumped application version to `1.00.24`.

## [2026-06-02] feature | Ghost Users Cleanup (v1.00.25)
- Added SQL view `vw_registrazioni_incomplete` to identify users who created an account in `auth.users` but failed to complete the OTP verification (resulting in missing `anagrafiche` records).
- Created a new SQL RPC `elimina_utente_fantasma(p_utente_id)` with `SECURITY DEFINER` allowing the President to delete these ghost users, securely cascading the deletion to `auth.users` to free up the email.
- Updated `portal/dashboard.html` to include a new "REGISTRAZIONI INCOMPLETE" section within the "Registro Approvazioni" panel, allowing the President to delete stuck registrations with one click.
- Bumped application version to `1.00.25`.

## [2026-06-02] fix | Dashboard JS Syntax Error (v1.00.26)
- Fixed an `Uncaught SyntaxError` in `portal/dashboard.html` caused by using `await` inside the synchronous `renderApprovazioniTables` function. Converted the function to `async`.
- Bumped application version to `1.00.26`.

## [2026-06-02] fix | Registrazione Browser Autofill Bug (v1.00.27)
- Added `autocomplete="off"` to the email field and `autocomplete="new-password"` to the password field in `portal/registrazione.html` to prevent browsers from automatically injecting the President's saved credentials during new registrations.
- Bumped application version to `1.00.27`.

## [2026-06-02] feature | AI Certificate Validation & Missing Cert Bugfix (v1.00.28)
- Fixed the "MANCANTE" certificate bug by migrating the certificate data from the old `utenti` schema to the new `certificati_medici` table during OTP verification in `api/otp-verify.js`.
- Integrated Google Gemini 1.5 Flash Vision API (`@google/genai`) to automatically process and validate uploaded medical certificates.
- Created `api/validate-cert.js` endpoint which downloads the certificate image from Supabase Storage and prompts Gemini to extract issue dates, expiry dates, and the certificate type (agonistico/non agonistico).
- The system now automatically assigns a status (`VERDE`, `GIALLO`, `ROSSO`) to the certificate based on the AI's analysis and logs it in `certificati_medici`.
- Added the `GEMINI_API_KEY` to the Vercel environment variables.
- Bumped application version to `1.00.28`.

## [2026-06-02] hotfix | Fix certificati_medici insertion crash (v1.00.29)
- Fixed a backend crash in `api/otp-verify.js` where the insertion into `certificati_medici` failed silently due to Postgres `NOT NULL` constraints on `data_scadenza` and `medico_rilascio`. Added fallback dummy values that will be immediately overwritten by the AI validation step.
- Bumped application version to `1.00.29`.

## [2026-06-02] hotfix | Fix Gemini SDK parsing & Dashboard manual approval (v1.00.30)
- Fixed a backend crash in `api/validate-cert.js` caused by `response.text()` being used instead of `response.text` for the new `@google/genai` SDK.
- Modified the Dashboard's "Registro Approvazioni" panel to display a clickable "APPROVA CERT." button for certificates in `GIALLO` (Revisione) state, allowing the President to manually force a green status without leaving the tab.
- Bumped application version to `1.00.30`.

## [2026-06-02] update | Dashboard UI improvement (v1.00.31)
- Added the "ELIMINA" button for pending Tesserati in the "REGISTRO APPROVAZIONI" panel, allowing the President to completely clean up failed or duplicate registrations using the deep-clean `elimina_utente_completo` RPC function.
- Bumped application version to `1.00.31`.

## [2026-06-02] update | Ingest Portal Pages & Ghost User Management
- Created documentation for `portal/dashboard.html` in [portal_dashboard.md](portal_dashboard.md).
- Created documentation for `portal/login.html` and `portal/pagamento.html` in [auth_and_payments.md](auth_and_payments.md).
- Updated [registration_flow.md](registration_flow.md) with browser autofill prevention and medical certificate validation details.
- Updated [database_schema.md](database_schema.md) with details of the new `vw_registrazioni_incomplete` view, the `elimina_utente_fantasma` RPC, trigger cleanup, and the upsert fix.

## [2026-06-17] hotfix | Fix dashboard registration approvals list refresh after deletion (v1.00.32)
- Added `loadApprovazioni()` call to `eliminaUtente` inside `portal/dashboard.html` to ensure that when an admin deletes a pending user, the "Registro Approvazioni" panel refreshes instantly.
- Bumped application version to `1.00.32`.



