# Code Quality & Analisi Statica con KNIP

Questa pagina documenta il sistema di analisi statica e igiene del codice basato su **[KNIP](https://knip.dev/)**, configurato per rilevare codice orfano, dipendenze non utilizzate e file dismessi all'interno dell'ecosistema Adrenalina ed Epika.

---

## 1. Obiettivi e Scopo

Con l'evoluzione continua del repository (rotte serverless Vercel, moduli frontend Vanilla JS, Edge Functions Supabase, script di sincronizzazione CSEN e automazioni di backup), è fondamentale prevenire il "code rot" e l'accumulo di codice morto.

KNIP verifica periodicamente:
1. **File non utilizzati** (`unused files`): script o moduli presenti nel repository ma mai importati né registrati come entrypoint.
2. **Dipendenze e DevDependencies orfane**: pacchetti registrati in [`package.json`](../package.json) non più importati in alcun file di produzione o script.
3. **Export e tipi inutilizzati**: funzioni, costanti o classi esportate che non hanno alcun consumatore.
4. **Dipendenze non tracciate o binari orfani**: moduli utilizzati nel codice ma assenti da `package.json`.

---

## 2. Configurazione del Progetto (`knip.json`)

Il file di configurazione radice [`knip.json`](../knip.json) mappa tutti i punti di ingresso del progetto per evitare falsi positivi:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "api/*.js",
    "portal/*.js",
    "scripts/*.js",
    "scripts/*.cjs",
    "supabase/functions/*/index.ts",
    "tests/**/*.js",
    "*.js",
    "*.cjs"
  ],
  "project": [
    "**/*.{js,cjs,mjs,ts}"
  ],
  "ignoreDependencies": [
    "@tailwindcss/cli"
  ]
}
```

- `@tailwindcss/cli` è escluso dalle dipendenze non usate poiché viene invocato manualmente tramite CLI in fase di build CSS.

---

## 3. Script di Report & Alerting (`scripts/knip_report.js`)

Lo script [`scripts/knip_report.js`](../scripts/knip_report.js) riceve l'output JSON di KNIP (`knip --reporter json`) e:
1. **Calcola il totale delle anomalie** per ciascuna categoria.
2. **Scrive il riepilogo Markdown** all'interno di `$GITHUB_STEP_SUMMARY`, rendendolo visibile nella dashboard del job GitHub Actions.
3. **Invia notifica Telegram su ADR_BOT** se e solo se sono presenti anomalie (`totalIssues > 0`) oppure se l'analisi fallisce.
   - **Zero Rumore**: Se il codice è pulito (0 anomalie), non viene inviato alcun messaggio Telegram.
   - **Sicurezza HTML**: Il testo viene sanificato con escape HTML per evitare errori di sintassi con caratteri speciali (`_`, `*`, `<`).
   - **Troncamento Intelligente**: Messaggi oltre i 3500 caratteri vengono troncati con link diretto al run GitHub Actions.
   - **Best Effort**: Eventuali problemi di rete con l'API Telegram vengono loggati ma non fanno mai fallire il job.

---

## 4. Workflow GitHub Actions (`.github/workflows/knip_scan.yml`)

Il workflow [`knip_scan.yml`](../.github/workflows/knip_scan.yml) è schedulato ed eseguibile su richiesta:

- **Trigger Schedulato**: ogni lunedì alle `02:00 UTC` (`04:00 CEST` / `03:00 CET`).
- **Trigger Manuale**: `workflow_dispatch` dalla scheda Actions di GitHub.
- **Trigger Pull Request**: su ogni PR aperta verso `main` (esegue il report su Step Summary ma salta la notifica Telegram per evitare notifiche su branch di bozza).
- **Artifact**: archivia il file grezzo `knip-report.json` per 30 giorni.
- **Modalità Non-Bloccante**: `continue-on-error: true` garantisce che il report venga sempre elaborato anche in caso di violazioni segnalate da KNIP.

---

## 5. Esecuzione Locale

Per eseguire il controllo rapido in locale:

```bash
# Analisi testuale a terminale
npm run knip

# Generazione report JSON ed elaborazione di prova
npx knip --reporter json > temp-report.json
node scripts/knip_report.js temp-report.json
```
