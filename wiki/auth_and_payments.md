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
    -   Processes payment through Stripe Checkout or manual board cash/bank collection.
    -   Upon checkout success, writes transaction audit receipts to the database (`public.ricevute_pagamenti`) and triggers instant push notifications to `ADR_BOT` on Telegram.

---

## 🏷️ Descrizioni Transazioni Stripe (Stripe Dashboard)

Per garantire massima chiarezza e trasparenza contabile nella lista *Pagamenti* di Stripe, ogni transazione viene valorizzata con descrizioni deterministiche e leggibili:

| Tipologia Pagamento | Modalità | Formato Descrizione Stripe | Esempio |
| :--- | :--- | :--- | :--- |
| **Tesseramento / Quota Associativa** | Saldo Unico (`payment`) | `Tesseramento {Anno} - {LIVELLO/SOCIO} per {Nome Cognome}` | `Tesseramento 2026 - BASE per Mario Rossi` |
| **Tesseramento a Rate** | Ricorrente (`subscription`) | `Abb {N} Rate - Tesseramento - {Nome Cognome}` | `Abb 12 Rate - Tesseramento - Mario Rossi` |
| **Corso / Evento Sportivo** | Saldo Unico (`payment`) | `Iscrizione {Titolo Evento} ({Piano}) per {Nome Cognome}` | `Iscrizione Strongman (Semestrale) per Mario Rossi` |
| **Corso Sportivo a Rate** | Ricorrente (`subscription`) | `Abb {N} Rate - {Titolo Evento} - {Nome Cognome}` | `Abb 6 Rate - Strongman - Mario Rossi` |
| **Evento Storico Epika** | Saldo Unico (`payment`) | `Epika {Titolo Evento} per {Nome Cognome}` | `Epika Battaglia del Metauro per Mario Rossi` |

- **Implementazione Checkout**: i pagamenti unici popolano `payment_intent_data.description` su [create-checkout-session.js](../api/create-checkout-session.js), mentre gli abbonamenti popolano `subscription_data.description`.
- **Sincronizzazione Webhook**: in [stripe-webhook.js](../api/stripe-webhook.js), all'evento `invoice.paid` / `invoice.payment_succeeded`, il `PaymentIntent` associato all'abbonamento viene aggiornato programmaticamente con la descrizione della sottoscrizione, garantendo che su Stripe Dashboard compaia sempre la causale parlante anziché la dicitura generica `Subscription creation`.
- **Integrità Contabile**: i campi `metadata.causale` e `description` delle ricevute fiscali in `ricevute_pagamenti` rimangono intatti e protetti.

-   **Database Enforcement (`public.approva_tesserato`)**:
    -   Strictly forbids activating an athlete (`stato_tesseramento = 'ATTIVO'`) if `utenti.quota_totale > 0` and no receipt exists in `ricevute_pagamenti` (`evento_id IS NULL`).
    -   Raises a blocking database exception preventing manual or accidental activation without fee settlement.
-   **Document-Driven State Transition (`public.aggiorna_stato_approvazione`)**:
    -   Automatically transitions `registro_approvazioni.stato` to `IN_ATTESA_PAGAMENTO` once medical certificate and identity documents are validated (`VERDE`).
    -   Sends automated payment email with Stripe checkout link.
-   **Dashboard Anomaly Detection & Sollecito**:
    -   Athletes in `ATTIVO` state with unpaid fees display an animated red badge: `🚨 ANOMALIA: QUOTA NON SALDATA (€...)`.
    -   Board members have 1-click actions:
        -   `SOLLECITO`: Sends notification email + push to Telegram `ADR_BOT` with copyable WhatsApp message.
        -   `INCASSO`: Registers cash/bank payment manually and issues official receipt.

---

## 🔄 Rinnovi Annuali 2027 (Socio e Tessera CSEN)

- **Endpoint dedicati**: `type: 'rinnovo_annuale'` su [create-checkout-session.js](../api/create-checkout-session.js) e `session.metadata.is_membership_renewal === 'true'` su [stripe-webhook.js](../api/stripe-webhook.js).
- **Isolamento di `utenti.quota_totale`**: Il flusso di rinnovo è avviato su iniziativa dell'utente dalla dashboard e **non** modifica `utenti.quota_totale`, evitando falsi positivi di morosità sulle iscrizioni iniziali e blocchi sul codice accesso palestra.
- **Tariffe e Guardrail**: Gli importi sono letti server-side da `configurazioni_tariffe` (modificabili in dashboard esclusivamente da Presidente e Vice Presidente); il rinnovo `Quota Socio` è abilitato dal `01/11/(anno_scadenza)`, mentre il rinnovo `Tessera CSEN` è abilitato da `60 giorni` prima della `data_scadenza_tessera` (o se `SCADUTO`), previa validità `VERDE` di Documento d'Identità e Certificato Medico, preservando eventuali giorni residui per rinnovi anticipati.
- **Assenza Maggiorazione Spese Stripe (v1.06.38+)**: Su tutti i flussi Stripe del portale (rinnovi, prime iscrizioni, corsi/eventi, rateizzazioni ed Epika), la maggiorazione del 2% è stata eliminata: l'importo addebitato coincide con la quota nominale senza costi aggiuntivi né avvisi sulle commissioni di pagamento.
