# Registration Flow: Athlete Portal

The registration wizard is implemented in [registrazione.html](../portal/registrazione.html). It provides a secure, four-step onboarding funnel for incoming athletes joining Adrenalina Club.

---

## 🗺️ Step Funnel Breakdown

```mermaid
graph TD
    S1[Step 1: Anagrafica] --> S2[Step 2: Residenza]
    S2 --> S3{Is Minor?}
    S3 -- Yes --> S4[Step 3: Tutore/Genitore]
    S3 -- No --> S5[Step 4: Firma Digitale OTP]
    S4 --> S5
    S5 --> S6[jsPDF Document + Submit]
```

### 1. Passo 1: Anagrafica (Personal Info)
-   Captures basic personal information (name, surname, fiscal code, birthdate, birth location).
-   Requires selection of the **Adesione (Membership type)**:
    -   *Tesserato*: Course licensing only. Requires a medical certificate.
    -   *Socio + Tesserato*: Full association membership + course licensing. Requires a medical certificate.
    -   *Socio*: Association membership only. Medical certificate is optional.
-   Requires selection of **Tessera Sportiva (Sport License)** (Silver, Gold, Integrativa A/B) if tesseramento is chosen.
-   Calculates fees dynamically.

### 2. Passo 2: Residenza (Address)
-   Captures residential address details.
-   Integrates a dynamic Italian municipality selector.

### 3. Passo 3: Tutore/Genitore (Parental Signoff)
-   Dynamically shown only if the calculated birthdate is under 18 years old.
-   Requires inputs for parental/guardian details (name, fiscal code, email).

### 4. Passo 4: Firma Digitale (OTP Electronic Signature)
-   Accepts legal waivers and terms.
-   Richiede il consenso GDPR obbligatorio sul trattamento dei dati sanitari e l'elaborazione automatizzata AI per i tesserati.
-   Generates and validates OTP code to e-sign the registration dynamically.

---

## 🔒 Gated Onboarding & Controllo Certificati (Flusso Ibrido AI)

Per i nuovi tesserati (casistica `tesserato` e `socio_tesserato`), l'iscrizione segue una logica condizionale di sicurezza per evitare ingressi senza adempimenti sanitari:

1. **Registrazione (Stato PENDING)**: L'atleta completa la firma digitale e carica il certificato medico, inserendo data di emissione e tipologia.
2. **Validazione AI (Semaforo)**:
   - **VERDE**: Certificato valido e corrispondente. Si sblocca immediatamente il link di pagamento.
   - **ROSSO**: Rifiutato. L'utente riceve un alert e deve ricaricare un documento leggibile/conforme nel portale.
   - **GIALLO**: Richiesta revisione manuale. Il certificato finisce nella coda del Presidente che delibera in un click.
3. **Pagamento (Attivazione)**: Solo con il certificato validato (VERDE) l'utente può procedere al pagamento tramite Stripe. All'avvenuto saldo, il tesseramento diventa `ATTIVO`.

---

## 🧠 Smart Client-Side Validations

1.  **Italian Codice Fiscale Algorithm**: Validates Italian tax code formatting and check character checksums.
2.  **Cascading Municipality Selection**: Fetches Italian municipalities directly from an open-source dataset, automatically populating and filtering Province, Commune, and ZIP/CAP codes based on selection.
3.  **Dynamic Age Calculations**: Parses the birthdate input, comparing it to current time to flag minor status and display the parental guardian input step (Step 3).
4.  **Medical Certificate Emission Date Validation**: Ensures the medical certificate emission date entered by the user is not in the future relative to the registration date (v1.02.00).
5.  **Browser Credential Autofill Prevention**: Form inputs use `autocomplete="off"` for email and `autocomplete="new-password"` for password to prevent modern browsers from pre-filling fields with administrative/President credentials during new registration sessions (v1.02.00).

