# OTP Signature System

Adrenalina Club uses a paperless electronic signature system backed by One-Time Passwords (OTP) sent to the athlete's email address. This ensures document validation without manual paper prints or signatures.

---

## 🔁 Signature Lifecycle Flow

```mermaid
sequenceDiagram
    participant A as Athlete (Browser)
    participant B as OTP API Handler
    participant DB as Supabase DB
    participant R as Resend Service

    A->>B: POST /api/otp (Bearer JWT)
    B->>DB: Clear old pending OTP codes for athlete
    B->>B: Generate 6-digit random code
    B->>B: Hash code via SHA-256
    B->>DB: Insert record into public.atti_adesione (Stato: in_attesa_otp)
    B->>R: Send email with raw 6-digit code
    B->>A: Respond HTTP 200 OK
    Note over A: Athlete checks email, inputs code
    A->>B: POST /api/otp-verify (Bearer JWT + code)
    B->>B: Hash submitted code
    B->>DB: Query public.atti_adesione for matching utente_id + hash + stato
    alt Valid Code
        B->>A: Respond HTTP 200 (Success)
        Note over A: Generate PDF & finalize
    else Invalid / Expired Code
        B->>A: Respond HTTP 400 (Invalid / Expired)
    end
```

---

## 🔒 Security Practices

1.  **JWT Verification**: Both OTP generation and validation require a valid JWT passed in the request Authorization headers, checked directly via Supabase Auth (`supabase.auth.getUser()`).
2.  **Cryptographic Hashing**: Raw OTP codes are never saved in the database. Instead, they are hashed using SHA-256:
    -   *Serverless API*: Done using Deno/Web Crypto APIs (`crypto.subtle.digest('SHA-256')`) and Node `crypto.createHash('sha256')`.
3.  **State Isolation**: Database updates use the Supabase `service_role` client to bypass Row-Level Security constraints while writing, but verify matching User IDs securely.
4.  **Automatic TTL**: Codes expire within 2 minutes of generation. Active table cleanup occurs on new requests, removing old unverified keys.
