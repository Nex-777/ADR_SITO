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
      "otp": "123456"
    }
    ```
-   **Actions**:
    -   Hashes the input OTP string.
    -   Checks the database for a matching record containing `utente_id`, the hashed value, and the state `in_attesa_otp`.
    -   Returns standard HTTP states:
        -   `200 OK`: Valid verification.
        -   `400 Bad Request`: Expired or invalid OTP.
        -   `401 Unauthorized`: Missing or invalid Bearer JWT.
