# Wiki Index - Table of Contents

Welcome to the **Adrenalina Club (ADR_SITO)** LLM Wiki. This is a persistent knowledge base documenting the architecture, workflows, and integrations of the Adrenalina Club ecosystem.

---

## 📂 Wiki Directory

### 🗺️ System Overview
*   **[Project Overview](project_overview.md)** – High-level goals, training disciplines, and technology stack of Adrenalina Club.
*   **[Database Schema](database_schema.md)** – Database tables, views (e.g. `vw_registrazioni_incomplete`), RPCs (`elimina_utente_fantasma`), states, and RLS policies on Supabase.

### 🎨 Frontend Architecture
*   **[Frontend Architecture](frontend_architecture.md)** – Landing page structure, styling tokens, GSAP animations, and Lenis smooth scrolling.
*   **[Registration Flow](registration_flow.md)** – Multi-step registration wizard (`portal/registrazione.html`), Italian tax code validation, municipal lookup cascade, date validation, and jsPDF document generation.
*   **[Portal Dashboard](portal_dashboard.md)** – Athlete, President, and Vice President dashboards (`portal/dashboard.html`), management grids, and incomplete registrations resolution panel.
*   **[Auth & Payments](auth_and_payments.md)** – Login processing (`portal/login.html`) and fee routing checkout (`portal/pagamento.html`).

### ⚙️ Backend & API Integrations
*   **[API Endpoints](api_endpoints.md)** – API endpoints for OTP request and verification (Vercel serverless + Supabase Edge Functions).
*   **[OTP Signature System](otp_signature_system.md)** – Secure paperless digital signature process, from generation to validation.

---

## 🪵 Changelog & History
*   **[Wiki Log](log.md)** – Append-only history of ingestion, updates, and maintenance passes on this wiki.
