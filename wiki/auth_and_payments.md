# Authentication & Payment Portals

This page details the login entry point and the registration checkout workflow.

---

## 🔑 Login Portal

-   **File Path**: [login.html](../portal/login.html)
-   **Functionality**:
    -   Collects athlete email and password.
    -   Authenticates against Supabase Auth (`supabase.auth.signInWithPassword()`).
    -   Stores session variables in LocalStorage for persistence.
    -   Redirects based on profile setup status:
        -   If registration details are complete, redirects to [dashboard.html](../portal/dashboard.html).
        -   If registration was aborted midway, redirects back to registration steps.

---

## 💳 Payment Checkout Portal

-   **File Path**: [pagamento.html](../portal/pagamento.html)
-   **Functionality**:
    -   Activated post-OTP verification step in the registration flow.
    -   Displays the final associative fee and/or tesseramento license fees calculated during signup:
        -   *Quota Socio*: €25
        -   *Tessera Sportiva*: €10 (Silver), €15 (Gold), €20 (Integrativa A), €25 (Integrativa B)
    -   Simulates payment gateway transactions.
    -   Upon checkout success, writes transaction audit receipts to the database (`public.ricevute_pagamenti`) and activates the member profile state to pending board review.
