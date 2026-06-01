# Project Overview: Adrenalina Club

Adrenalina Club is an elite athletic training facility and community specializing in high-performance conditioning, strongman training, and historical fencing (Scherma Antica). The digital workspace, **ADR_SITO**, represents the website and the player/athlete management platform.

---

## 🎯 Project Goals

1.  **Immersive Branding**: Introduce users to the Adrenalina Club ethos using a bold "Kinetic Brutalism" design language.
2.  **Paperless Registration**: Enable seamless sign-ups and membership activation via a digital athlete portal, eliminating manual paper signing using a custom digital OTP signature system.
3.  **Biometric Tracking & Progression**: Build a system where athletic profiles, mass physical metrics, and progression metrics are tracked securely (integrated with Supabase Auth & Database).

---

## ⚔️ Disciplines

-   **Metabolic Overdrive**: High-intensity metabolic conditioning and circuit training ("Metabolic Warfare").
-   **Kinetic Functional**: Biomechanically precise movement training ("Biomechanic Precision").
-   **Force Dominance**: Maximum power output strongman workouts.
-   **Martial Precision**: Ancient martial conditioning and historical swordplay training.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Vanilla JavaScript | Core application structure and behaviors. |
| **Styling** | Tailwind CSS (CDN) | Modern CSS styles utilizing a customized dark theme. |
| **Animations** | GSAP, ScrollTrigger, Lenis | High-quality kinetic scroll effects, skew transitions, and parallax layers. |
| **Database & Auth** | Supabase | Athlete database, row-level security (RLS), and authentication token flow. |
| **Backend & APIs** | Vercel Serverless (JS), Supabase Edge Functions (TS) | OTP generation, Resend email dispatch, and cryptographic verification handlers. |
| **Document Generation** | jsPDF | Dynamic PDF creation for signed athlete agreements. |
