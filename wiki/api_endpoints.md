# API Endpoints Documentation

The backend services for Adrenalina Club are comprised of serverless functions handled via Vercel serverless scripts (`/api/`) and a Supabase Edge Function (`/supabase/functions/`).

---

## 1. OTP Request Handler

Generates a secure OTP, saves the cryptographic hash to the database, and sends the raw code to the athlete's email.

### Node/Vercel Serverless Function
-   **File Path**: `[otp.js](../api/otp.js)`
-   **Endpoint Route**: `POST /api/otp`
-   **Headers**:
    -   `Authorization: Bearer <Supabase_JWT>`
-   **Actions**:
    -   Validates the athlete token.
    -   Deletes prior `in_attesa_otp` tokens for the athlete.
    -   Generates a 6-digit random code.
    -   Hashes via SHA-256 (`crypto.createHash('sha256')`).
    -   Inserts state `in_attesa_otp` into the database.
    -   Dispatches code via Resend Mail.

### Supabase Edge Function
-   **File Path**: `[index.ts](../supabase/functions/otp/index.ts)`
-   **Runtime**: Deno
-   **Actions**:
    -   Performs identical logic using Deno Web Crypto standard APIs.

---

## 2. OTP Verification Handler

Verifies the client-submitted OTP against the cryptographic hash in the database.

### Node/Vercel Serverless Function
-   **File Path**: `[otp-verify.js](../api/otp-verify.js)`
-   **Endpoint Route**: `POST /api/otp-verify`
-   **Headers**:
    -   `Authorization: Bearer <Supabase_JWT>`
-   **Body JSON Parameters**:
    ```json
    {
      "otp": "123456",
      "cert_token": "payload.hmac",
      "doc_token": "payload.hmac",
      "tutore_token": "payload.hmac",
      "cert_revisione_umana": false,
      "doc_revisione_umana": false,
      "tutore_revisione_umana": false,
      "doc_modificato_manualmente": false
    }
    ```
-   **Actions**:
    -   Hashes the input OTP string and validates against database.
    -   Verifies HMAC-SHA256 signatures of `cert_token`, `doc_token`, `tutore_token` using `[precheck-token.js](../api/_utils/precheck-token.js)`.
    -   Recalculates SHA-256 hash of uploaded file in Supabase Storage and verifies match against token `sha256_file`.
    -   Directly inserts records into `public.certificati_medici` and `public.documenti_identita` with status `VERDE` (if AI verified) or `GIALLO` (if human review was requested or if `doc_modificato_manualmente` is true), attaching contextual notes for the board.
    -   Sends confirmation email with immediate Stripe payment link if the medical certificate is already verified (`VERDE`).
    -   **Telegram Push Alert (ADR_BOT)**: Dispatches instant HTML alert to board Telegram channel via `[telegram-bot.js](../api/_utils/telegram-bot.js)` if the registration is pending manual review (modifiche manuali anagrafica, documento/certificato GIALLO, ammissione soci).

---

## 3. Unified Document & Medical Certificate Validation Handler

Validates uploaded medical certificates and identity documents via Mistral AI Vision (`pixtral-12b-2409`) to ensure 100% GDPR compliance (Art. 28 / EU-hosted infrastructure).

### Node/Vercel Serverless Function
-   **File Path**: `[validate.js](../api/validate.js)`
-   **Endpoint Route**: `POST /api/validate`
-   **Headers**:
    -   Pre-Auth (Anonimo durante registrazione): nessun header di autenticazione richiesto per `target_type: "precheck_cert"` o `"precheck_doc"`, protetto da strict IP rate limit (12 req / 5 min).
    -   Post-Auth / Cron: `Authorization: Bearer <Supabase_JWT>` (approvazioni manuali) o `X-Internal-Secret: <CRON_SECRET>` (trigger automatici).
-   **Body JSON Parameters (Pre-check anonimo nel wizard)**:
    ```json
    {
      "target_type": "precheck_cert" | "precheck_doc",
      "images": ["data:image/jpeg;base64,..."],
      "sha256_file": "hex_string",
      "nome": "Mario",
      "cognome": "Rossi"
    }
    ```
-   **Actions (Pre-check)**:
    -   Esegue rate limit per IP client.
    -   Dispatches compressed images directly to Mistral AI Vision API (`pixtral-12b-2409`).
    -   Per `precheck_cert`: estrae tipologia, date, idoneità e intestatario con guardrail deterministici.
    -   Per `precheck_doc`: estrae tipo documento, data scadenza, `nome`, `cognome`, `codice_fiscale`, `indirizzo_residenza` (via e civico) e `comune_residenza`.
    -   Firma i dati con HMAC-SHA256 (`[precheck-token.js](../api/_utils/precheck-token.js)`) e restituisce `{ success: true, esito: "VERDE"|"GIALLO"|"ROSSO", ..., token: "..." }`. Se il servizio AI va in timeout o errore, effettua fallback sicuro a `GIALLO` (revisione umana).
-   **Body JSON Parameters (Post-Auth / Webhook)**:
    ```json
    {
      "target_type": "cert" | "doc",
      "anagrafica_id": "uuid",
      "file_url": "https://..."
    }
    ```
-   **Actions (Post-Auth / Webhook)**:
    -   Downloads image from Supabase Storage and encodes as Base64 Data URI.
    -   Dispatches image to Mistral AI Vision API (`pixtral-12b-2409`) using `@mistralai/mistralai` SDK.
    -   Extracts structured JSON validation status (`VERDE`, `GIALLO`, `ROSSO`) and expiry dates.
    -   Updates `public.certificati_medici` or `public.documenti_identita` tables.
    -   Triggers email notifications to athlete based on validation outcome.

---

## 4. Admin Password Recovery Link Generator

Generates secure single-use password recovery links on-demand for board members to assist users who experience email delivery issues.

### Node/Vercel Serverless Function
-   **File Path**: `[admin-recovery-link.js](../api/admin-recovery-link.js)`
-   **Endpoint Route**: `POST /api/admin-recovery-link`
-   **Headers**:
    -   `Authorization: Bearer <Supabase_JWT>` (strictly requires board roles: `presidente`, `vice_presidente`, `segretario`, `tesoriere`, `consigliere`)
-   **Body JSON Parameters**:
    ```json
    {
      "email": "user@example.com",
      "action": "notify_request (opzionale)"
    }
    ```
-   **Actions**:
    -   **Default (Board Auth)**: Authenticates the caller via `supabase.auth.getUser()`, verifies board role in `public.utenti`, uses `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, ... })` to generate a secure `action_link`, logs action, and returns `{ success: true, action_link, email }`.
    -   **`action: "notify_request"` (Public Rate-Limited, max 5 req / 5 min per IP)**: Invoked fail-open by `portal/forgot-password.js`. Verifies whether the email exists in `public.utenti` (anti-enumeration), records/updates `public.richieste_recupero_password` with `ip_address` (anti-duplicate 15 min), and sends an alert to `ADR_BOT` via `[telegram-bot.js](../api/_utils/telegram-bot.js)`.

---

## 5. Cron Scadenze & Digest Registro Approvazioni (`/api/cron-scadenze`)

### Node/Vercel Serverless Function
-   **File Path**: `[cron-scadenze.js](../api/cron-scadenze.js)`
-   **Endpoint Route**: `GET /api/cron-scadenze` (Vercel Cron `0 7 * * *`)
-   **Headers**: `Authorization: Bearer <CRON_SECRET>` or `X-Cron-Secret: <CRON_SECRET>` (fail-closed).
-   **Actions**:
    -   Scans medical certificates and CSEN cards for expirations (-60d, -30d, -15d, expired) and social dues renewals.
    -   Archives `richieste_recupero_password` rows older than 7 days.
    -   Sends a daily unified Telegram digest (`buildDailyApprovalDigestMessage`) covering pending payments (`IN_ATTESA_PAGAMENTO`), stuck incomplete registrations (`vw_registrazioni_incomplete` > 1h), and summary counters of all other open cards in `#panel-approvazioni`.

