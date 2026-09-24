# Wiki Transaction Log

Chronological append-only record of ingestions, lint passes, and updates to the LLM Wiki.

## [2026-09-24] refactor | Fix A/B/C da secondo audit WFTEST — Passphrase & VERCEL_ENV (v1.05.76)
- **FIX-A (`backup_db.yml`)**: Rimossa interpolazione shell della passphrase OpenSSL. `BACKUP_PASSPHRASE` ora è passata come env var dello step e usata con `-pass env:BACKUP_PASSPHRASE`.
- **FIX-B (`backup_storage_monthly.yml`)**: Stesso fix del FIX-A applicato al workflow di backup mensile Storage.
- **FIX-C (`api/otp.js`)**: Migliorata detection dell'ambiente non-production. Sostituito `!process.env.VERCEL && !process.env.NODE_ENV` con `process.env.VERCEL_ENV !== 'production'` per coprire correttamente anche i Vercel Preview Deployments, evitando che errori di configurazione blocchino i test E2E su branch feature.

## [2026-09-24] refactor | Audit WFTEST & Fix Correttivi di Sicurezza/Robustezza (v1.05.75)
- **Fix Alerting (`scripts/notify_alert.sh`)**:
  - Risolta vulnerabilità di iniezione caratteri e shell quote-splitting passando tutti i parametri a Node tramite `process.env` (payload JSON Telegram e Resend strutturati in modo rigoroso).
  - Impostato bit di esecuzione (`chmod +x`) nel repository git per l'interprete bash.
- **Fix Smoke Test (`scripts/test_backup_restore.js`)**:
  - Risolto conflitto di autenticazione su redirect S3 per repository privati: download via API `/releases/assets/{id}` con `redirect: manual` e strip dell'header `Authorization` sull'URL presigned S3.
  - Rimossa interpolazione shell della passphrase OpenSSL: passaggio tramite `-pass env:BACKUP_PASSPHRASE` isolato nell'environment del processo child.
- **Fix Anti-Bot (`api/otp.js`)**:
  - Reso il controllo Cloudflare Turnstile rigorosamente **fail-closed** in produzione (blocco con errore 500 se `TURNSTILE_SECRET_KEY` manca su server di produzione/Vercel, consentendo il bypass solo in ambiente di sviluppo locale).

## [2026-09-24] ingest | Alerting Automatico (Telegram+Email), Smoke Test Backup & Cloudflare Turnstile Anti-Bot (v1.05.74)
- **Alerting sui Workflow Notturni**:
  - Creato `scripts/notify_alert.sh` centralizzato per inviare notifiche push immediate su Telegram e via email con Resend in caso di fallimento (`if: failure()`).
  - Aggiornati `.github/workflows/backup_db.yml`, `.github/workflows/csen_sync.yml`, `.github/workflows/backup_storage_monthly.yml` per includere step di allerta automatica e checkout repository.
- **Smoke Test & Validazione Integrità Disaster Recovery**:
  - Creato `scripts/test_backup_restore.js` per decifrare dump cifrati (`.dump.enc`) ed eseguire `pg_restore --list` validando la presenza di tutte le 10 tabelle critiche (`utenti`, `anagrafiche`, `atti_adesione`, `registro_approvazioni`, `ricevute_pagamenti`, `epika_*`, `nestore_*`).
  - Aggiunto comando `npm run test:backup` in `package.json`.
  - Creato `.github/workflows/smoke_test_backup.yml` per esecuzione automatica settimanale (ogni domenica alle 04:00 UTC) sull'ultima release.
- **Protezione Anti-Bot & Anti-Spam (Cloudflare Turnstile)**:
  - Integrato widget Cloudflare Turnstile (`0x4AAAAAAFCpEjPr0QeArFVv`) invisibile in `portal/registrazione.html` e `portal/registrazione.js` prima della richiesta OTP.
  - Implementata validazione server-side token su `api/otp.js` tramite endpoint Turnstile siteverify (`https://challenges.cloudflare.com/turnstile/v0/siteverify`) prima della generazione OTP e invio Resend.
  - Aggiornata la CSP in `vercel.json` autorizzando `challenges.cloudflare.com` per `script-src`, `frame-src` e `connect-src`.
- **Documentazione**: Aggiornato `wiki/backup_system.md` con sezioni 8 (Smoke Test) e 9 (Alerting).

## [2026-09-24] ingest | Sistema di Backup Automatico — Database + Storage (v1.05.72)
- **Architettura**: Implementato sistema di backup a due layer: (1) backup DB PostgreSQL notturno (ore 02:00 IT) con `pg_dump --format=custom` su Session Pooler Supabase porta 5432; (2) backup Storage mensile (1° di ogni mese) dei file PDF (certificati medici, ricevute, documenti).
- **Sicurezza & GDPR**: Ogni file di backup viene cifrato con `openssl enc -aes-256-cbc -pbkdf2 -iter 100000` usando `BACKUP_PASSPHRASE` nei GitHub Secrets. Il dump in chiaro viene eliminato dal runner immediatamente dopo la cifratura. Nessun dato sensibile viene mai committato nel codice sorgente.
- **File creati**:
  - `.github/workflows/backup_db.yml` — Workflow cron notturno: `pg_dump` → cifratura AES-256 → GitHub Release con tag `backup/YYYY-MM-DD`, rotazione automatica a 60 giorni.
  - `.github/workflows/backup_storage_monthly.yml` — Workflow cron mensile: download Storage Supabase filtrato per ultimo mese → ZIP → cifratura AES-256 → GitHub Release con tag `storage-backup/YYYY-MM`, rotazione automatica a 12 mesi.
  - `scripts/backup_storage.js` — Script Node.js per download locale on-demand e differenziale (manifest-based) dei file Supabase Storage.
  - `wiki/backup_system.md` — Pagina Wiki con architettura, istruzioni operative e procedura di Disaster Recovery completa.
- **File modificati**:
  - `.gitignore` — Aggiunta esclusione `local_backup/`, `backup_storage_manifest.json`, `*.dump`, `*.dump.enc`, `*.zip.enc`, `storage_monthly_export/`.
  - `package.json` — Aggiunto script `backup:storage` (`node scripts/backup_storage.js`).
  - `wiki/index.md` — Aggiunta sezione `🛡️ Operations & Maintenance` con link a `backup_system.md`.
- **GitHub Secrets richiesti** (aggiunti manualmente dall'operatore): `SUPABASE_DB_URL` (Session Pooler :5432), `BACKUP_PASSPHRASE`.

## [2026-09-23] ingest | NESTORE — Contatori Completamenti su Card Ibrido e Benchmark Invictus (v1.05.71)
- **UI & Layout Card (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Aggiunto contatore circolare (`.nst-workout-counter`) al centro dell'header di ciascuna card Ibrido (Metcon 1-4, Forza 1-4) tra il nome del programma e il badge di tipologia.
  - Aggiunto contatore circolare analogo (`#nst-invictus-counter`) sulla card Benchmark WOD Invictus.
  - Stato a zero (`.nst-workout-counter-zero`): cerchio con sfondo e bordo traslucidi a bassa opacità e testo grigio tenue.
  - Stato attivo ($>0$, `.nst-workout-counter-active`): bordo e sfondo illuminati con glow dedicato (ciano per Metcon, ambra per Forza e Invictus).
- **Calcolo Storico Retroattivo (`portal/nestore.js`)**:
  - Implementata la funzione `calcolaCompletamentiProgrammi(allenamenti)` che analizza retroattivamente lo storico all-time `nestore_allenamenti` (`currentAllenamentiData`), supportando discipline sia in formato standard (`Ibrido — [Nome]`), sia varianti con trattino, sia match espliciti su `scheda_dati.programma_id` o `scheda_dati.programma_nome`, escludendo i record soft-deleted (`attivo: false`).
  - Implementata `aggiornaContatoreInvictus(count)` per l'aggiornamento dinamico del DOM.
  - Aggiornato `renderCatalogoIbrido()` e `renderGraficoAllenamenti()` per mantenere i contatori sincronizzati al caricamento e dopo ogni salvataggio di seduta (inclusa la correzione del controllo obsoleto su `nst-chart-allenamenti` in `confermaSalvaIbridoSeduta()`).
- **Testing & QA (`tests/workout-counters.test.js`)**:
  - Creata una nuova test suite con 9 test unitari per validare il calcolo su dati vuoti, soft-deleted, corrispondenze Invictus/Ibrido, e rendering dinamico del DOM.
  - Test suite globale vitest: 170/170 test superati (14 suite su 14).

## [2026-09-23] ingest | NESTORE — Schede Forza: Click-to-Cycle Stato Serie (Cornice Verde/Gialla/Rossa) & Storicizzazione (v1.05.70)
- **UI & Interazione Click-to-Cycle (`portal/nestore.js`, `portal/nestore.css`)**:
  - Implementata la logica di transizione a 4 stati al tap/click su una riga di serie (`.nst-active-set-row` sia per riscaldamento specifico sia per serie allenanti/extra):
    1. Tap 1: Cornice Verde brillante (`.status-done`, `.status-fatta`, `data-set-status="fatta"`), serie completata.
    2. Tap 2: Cornice Gialla ambra (`.status-partial`, `.status-parziale`, `data-set-status="parziale"`), serie parziale.
    3. Tap 3: Cornice Rossa pericolo (`.status-skipped`, `.status-saltata`, `data-set-status="saltata"`), serie saltata.
    4. Tap 4: Cornice rimossa e attributo resettato (`null`), ciclo pronto a ripartire al tap successivo.
  - Ignorati i click sui controlli interattivi (`input`, `button`, `select`, `textarea`) tramite `gestisciClickRigaSerieForza`, garantendo che l'atleta possa inserire o correggere i carichi (kg) e le ripetizioni (rip) senza innescare involontariamente il ciclo della cornice.
  - Aggiunti stili con `cursor: pointer;` ed effetti glow sui bordi per feedback tattile immediato.
- **Persistenza & Storicizzazione Non Distruttiva (`portal/nestore.js`)**:
  - In `terminaIbridoSeduta()`, estratto lo `stato_esecutivo` da ciascuna riga DOM di riscaldamento e allenante.
  - In `confermaSalvaIbridoSeduta()`, salvato `stato_esecutivo` in `riscaldamento_effettivo` e `serie_effettive`/`serie_dettaglio` all'interno del payload `scheda_dati` su Supabase.
- **Testing & QA (`tests/forza-schede.test.js`)**:
  - Aggiunti 5 nuovi test unitari a copertura dell'intero ciclo a 4 stati, dell'isolamento click su input, dell'estrazione dello stato esecutivo e della persistenza del payload.
  - Test suite globale vitest: 161/161 test superati senza errori.

## [2026-09-23] ingest | NESTORE — Fix Falso PR Trazioni: Isolamento Sovraccarico Calisthenics (Opz 2A) & Bonifica Record DB (Opz 1A)
- **Isolamento Fallback Carichi per Calisthenics (`portal/nestore.js`)**:
  - Introdotta la funzione helper `isCalisthenicsWithOverload(nome)` per intercettare trazioni, pull up, chin up, dip, piegamenti, muscle up.
  - In `ottieniBaseMassimaleEsercizio`: se l'esercizio rientra nei calisthenics e non è presente un PR registrato, il massimale di base non ripiega più sul peso corporeo dell'atleta (`currentUserPesoKg`, es. 76 kg), ma viene impostato a `0 kg` (`fonte: 'Sovraccarico base: 0 kg'`).
  - Nel builder di anteprima sessioni Forza (`renderAnteprimaSessioneIbrido`): se `maxStorico` è assente e l'esercizio è calisthenico, `baseKg` viene impostato a `0 kg`, prevenendo la generazione di serie di rampa o riscaldamento con sovraccarichi fittizi e sproporzionati.
- **Bonifica Record DB su Supabase (Opzione 1A)**:
  - Eseguita pulizia mirata sul record `nestore_allenamenti` ID `93c95e54-1481-4ce2-ac93-49387afdf3ee` (sessione del 19/09/2026): azzerate le ripetizioni (`rip: 0`, `peso_kg: 0`) delle 5 serie di riscaldamento generate erroneamente per "Trazioni Pesate" e normalizzate le ripetizioni complessive a 24.
  - Il motore dei Record Personali (`calcolaRecordPersonali`) legge ora correttamente l'effettivo record all-time dell'atleta: **4 serie x 4 ripetizioni con 22 kg** (stabilito nella seduta del 21/09/2026).
- **Testing & QA (`tests/workout-pr.test.js`)**:
  - Aggiunta suite di 4 test unitari per validare il riconoscimento calisthenics con sovraccarico, il fallback a 0 kg, il fallback sul peso corporeo preservato per esercizi bilanciere (Squat/Panca) e l'applicazione prioritaria dei PR storici.
  - Test suite globale vitest: 156/156 test superati (13 suite su 13).

## [2026-09-23] ingest | NESTORE — Allenamento Benchmark INVICTUS: Rendiconto Lap Dettagliato (Opz 2A), Auto-Lap (Opz 1A) & Storicizzazione Multi-Serie (Opz 3A)
- **Auto-Lap Conclusivo (Opzione 1A - `portal/nestore.js`)**:
  - Alla pressione di *"TERMINA E SALVA"* in `terminaAllenamentoAttivo()`, se il cronometro è proseguito oltre l'ultimo lap registrato per almeno 1 secondo ($\ge 1000\text{ms}$), viene inserito automaticamente l'ultimo lap senza perdita di tempo.
- **Rendiconto Dettagliato nel Campo Note (Opzione 2A - `portal/nestore.js`, `portal/nestore.html`, `portal/nestore.css`)**:
  - Creata la funzione `costruisciRendicontoInvictus(laps, pullBase, totalFormatted)` che calcola i totali complessivi di tempo e ripetizioni moltiplicando i target per il numero di giri e genera il rendiconto dettagliato conforme alle specifiche:
    `Totali: [tempo totale], [tot pull] + [tot push] + [tot squat]` seguito da `[lap]: [tempo lap], [reps pull] + [reps push] + [reps squat]` per ogni giro completato.
  - La textarea `#nst-workout-note-input` viene pre-popolata con il rendiconto, ingrandita con `rows="6"`, font monospace e nuova etichetta *"RENDICONTO & NOTE SESSIONE:"*.
  - Aggiunto `white-space: pre-wrap;` a `.nst-session-note-box` per visualizzare i ritorni a capo in modo pulito nel dettaglio sessione.
- **Storicizzazione Multi-Serie in `scheda_dati` (Opzione 3A - `portal/nestore.js`)**:
  - Creata la funzione `costruisciSchedaDatiInvictus(numGiri, pullBase)` che popola `serie_dettaglio` con una serie per ciascun giro (lap) per ogni esercizio (`Pull-up`, `Push-up`, `Air Squat`).
  - La modale di modifica ed esplorazione sessione (`openEditAllenamentoModal`) renderizza fedelmente tutte le singole serie (S1, S2, S3...) con i rispettivi target e carichi.
- **Testing & QA (`tests/standard-workouts.test.js`)**:
  - Aggiornata la test suite vitest con 9 test specifici passati al 100%. Suite complessiva: 152/152 test passati.

## [2026-09-23] ingest | NESTORE — Record Personali: Whitelist 8 Esercizi, Griglia Fissa (Opz 1A), Doppio Record Corsa (Opz 2) & Focus Sovraccarico Forza (Opz 3A)
- **Whitelist Rigida 8 Esercizi (`portal/nestore.js`)**:
  - Limitato il calcolo e la bacheca dei PR (`calcolaRecordPersonali`) esclusivamente agli 8 movimenti autorizzati: *Panca Piana*, *Squat*, *Stacco da Terra*, *Trazioni*, *Corsa 60m*, *Corsa 100m*, *Corsa 5km*, *Corsa 10km*.
  - Tutti gli altri esercizi presenti nello storico sessioni (es. Leg Press, Push-up, Addominali) vengono rigorosamente esclusi dai record personali.
- **Griglia Fissa con Placeholder (Opzione 1A)**:
  - La griglia `#nst-pr-container` renderizza sempre tutte le 8 card nell'ordine canonico stabilito.
  - Gli esercizi privi di record mostrano una card tratteggiata `.nst-pr-empty-card` con trattini `--` e dicitura *"Nessun record"*. Il contatore in testata aggiorna dinamicamente la dicitura *"X su 8 registrati"*.
- **Doppio Record Corsa: Zavorrata vs Corpo Libero (Opzione 2)**:
  - Per ciascuna corsa vengono tracciati due record indipendenti: uno per il tempo a corpo libero (`peso_kg === 0`) e uno per la corsa con sovraccarico (`peso_kg > 0`).
  - La card di corsa visualizza le righe sincronizzate `.nst-pr-run-row` (`Libero:` e `Zavorra:` con indicazione del carico `+Xkg`).
  - Criterio di confronto cronometrico: a parità di carico vince il tempo inferiore in secondi.
- **Gerarchia Dati Esercizi di Forza (Opzione 3A)**:
  - Valore principale in grande: **Peso (KG)** corrispondente al puro sovraccarico (senza mai includere il peso corporeo).
  - Riga secondaria: numero di ripetizioni e serie eseguite.
  - Per esercizi a corpo libero (0 kg), il valore principale indica le ripetizioni e la riga secondaria specifica `Corpo libero (0 kg)`.
- **Parser Cronometrico Avanzato & Lookahead Testuale**:
  - Introdotte le funzioni `parseTimeToSeconds` e `formatSecondsToDisplay` per gestire formati `SS.ms`, `MM:SS`, `HH:MM:SS` e unità testuali (`min`, `sec`, `h`).
  - Ottimizzato lo split delle note per preservare numeri decimali (es. `11.8s`) ed estrarre carichi e tempi separati da virgola.
- **Unificazione Vista Coach**:
  - La visualizzazione dei record personali nella dashboard Coach (`renderCoachAtletaDettaglio`) impiega ora la medesima funzione `renderPrGrid`, garantendo uniformità visuale e tecnica tra atleta e allenatore.
- **Testing & QA (`tests/workout-pr.test.js`)**:
  - Aggiornata e ampliata la suite di test con 19 verifiche automatizzate coprendo whitelist a 8, parsing tempi, doppio record corsa, lower-time wins, esclusione del peso corporeo dal sovraccarico e rendering griglia con placeholder.
  - 149/149 test superati con successo in tutto il repository.

## [2026-09-23] ingest | NESTORE — Gestione Storico Allenamenti: Modifica Esercizi/Set (Opz 1B), Click Responsive (Opz 2A) & Soft-Delete con Modale Custom (Opz 3A)
- **UI Tabella Sessioni & Routing Responsive (Opzione 2A)**:
  - Nella tabella `STORICO SESSIONI`, aggiunta la colonna `Azioni` (visibile su desktop) con icone Matita (✏️ Modifica) e Cestino (🗑️ Elimina).
  - Al click sulla riga: su Desktop ($> 768\text{px}$) apre direttamente la modale di dettaglio (`#nst-modal-dettaglio-allenamento`); su Mobile ($\le 768\text{px}$) apre l'Action Sheet dedicato a 3 voci (`#nst-modal-allenamento-actions`).
  - Inserito suggerimento per mobile `(tocca per azioni)`.
- **Action Sheet Mobile (`portal/nestore.html`, `portal/nestore.js`)**:
  - Modale `#nst-modal-allenamento-actions` con riepilogo seduta e 3 opzioni operative: *Dettaglio Sessione*, *Modifica Sessione*, *Elimina Sessione* oltre al pulsante Annulla.
- **Modale Conferma Eliminazione Custom (Opzione 3A)**:
  - Introdotta la modale `#nst-modal-conferma-delete-allenamento` con doppio controllo per prevenire cancellazioni accidentali.
  - Implementato rigorosamente il **Soft-Delete** (`attivo: false`) su `nestore_allenamenti` in conformità alle regole di storicizzazione Epika/Adrenalina. Ricalcola istantaneamente PR e KPI alla cancellazione.
- **Modale di Modifica Completa Dinamica (Opzione 1B)**:
  - Introdotta la modale `#nst-modal-edit-allenamento` per modificare sia i metadati di sessione (data, disciplina, durata, RPE, note) sia i singoli esercizi e serie contenuti nel campo JSONB `scheda_dati`.
  - Generatore DOM dinamico (`aggiungiEsercizioEdit`, `aggiungiWarmupSetEdit`, `aggiungiWorkSetEdit`, `rimuoviSetEdit`, `rimuoviEsercizioEdit`) per gestire liste arbitrarie di esercizi, serie di riscaldamento (Rampa) e serie target/effettive (kg, reps, RPE).
  - Serializzazione fedele del JSON con preservazione dei campi accessori (`wod_id`, `esito_globale`, ecc.), update asincrono su Supabase e ri-rendering istantaneo dei record personali e della tabella.
- **Testing & QA (`tests/workout-edit-delete.test.js`)**:
  - Creata suite con 9 test unitari per validare il markup delle modali, stili CSS, funzioni JS esportate, routing responsive desktop/mobile, logica di soft-delete e serializzazione JSON.
  - Tutti i 143 test del repository superati (13 suite su 13).

## [2026-09-22] ingest | NESTORE — Fix Calcolo PR (Rampa 1RM & Scheda Dati), Formato Date DD/MM/YY & Modale Dettaglio Sessione
- **Fix Parsing PR & Carichi di Rampa (`portal/nestore.js`)**:
  - Risolto il mancato calcolo dei nuovi massimali (es. Panca Piana a 125 kg di Valerio Mannocchi): la funzione `parseExercisesFromWorkout` ora gestisce correttamente `scheda_dati` sia quando è un oggetto (`{ tipo: 'ibrido', esercizi: [...] }`) sia quando è un array.
  - Estesa la logica di valutazione delle prestazioni per includere sia le serie allenanti (`serie_dettaglio`) sia le serie di rampa/riscaldamento (`riscaldamento_effettivo`), considerando valida qualsiasi alzata chiusa con ripetizioni $> 0$ (es. la singola 1RM al 100% eseguita durante la rampa).
  - Migliorata la normalizzazione dei nomi degli esercizi in `normalizeExerciseName` per raggruppare varianti descrittive come *"Panca piana con bilanciere"* sotto il massimale canonico *"Panca Piana"*.
- **Formattazione Date con Anno (`portal/nestore.js`)**:
  - Introdotta la funzione `formatDateWithYear(dateStr)` che restituisce la data nel formato `DD/MM/YY` (es. `21/09/26`, `09/09/26`).
  - Applicata alle card della bacheca **Record Personali (All-Time)** e alla tabella **Storico Sessioni**.
- **Modale Dettaglio Sessione Allenamento (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Le righe della tabella `STORICO SESSIONI` sono ora interattive (`.nst-clickable-row` con cursore pointer ed effetto hover).
  - Al click viene invocata `apriDettaglioAllenamentoModal(workoutId)` aprendo la nuova modale `#nst-modal-dettaglio-allenamento`.
  - La modale presenta una griglia di riepilogo metadati (Data, Disciplina, Durata, RPE Fatica, Esito Globale), le note della seduta, e l'elenco degli esercizi svolti con target originari, badge di esito, badge pillola per riscaldamento/rampa e tabella per serie e carichi di lavoro.
- **Testing & QA (`tests/workout-pr.test.js`)**:
  - Aggiunti test per `formatDateWithYear`, estrazione del PR da rampa al 100% su oggetto `scheda_dati`, markup HTML/CSS della modale e apertura/chiusura/popolamento di `#nst-modal-dettaglio-allenamento`.
  - Risultato test suite: 134/134 test passati (12/12 suite).

## [2026-09-22] ingest | Portal Dashboard — Gestione Certificati Storici Cartacei & Fix Query Dossier Tesserato
- **Fix Query Dossier Tesserato (`portal/dashboard.js`)**:
  - Risolto il bug in `apriDossierTesserato(utente_id)`: la query verso `registro_tesserati` utilizzava erroneamente `utente_id` anziché la foreign key `anagrafica_id`. I dati di tesseramento CSEN, quota e data richiesta vengono ora recuperati regolarmente.
- **Gestione Certificati Medici Cartacei / Fittizi (`portal/dashboard.js`)**:
  - Nella dashboard atleta (`loadUserCertificato`, banner panoramica e avviso legacy), i certificati pregressi senza file digitale (`file_url === 'fittizio'`) non mostrano più il fuorviante stato "Verifica in corso", ma richiedono esplicitamente: *"Dato storico cartaceo: carica il file digitale del tuo certificato"*, sbloccando il modulo di caricamento.
  - Nella tabella storico certificati dell'atleta e nel Dossier Amministrativo, il pulsante *"VEDI FILE"* per i record con `file_url === 'fittizio'` viene disabilitato e sostituito con il badge distintivo `FILE NON DISPONIBILE (CARTACEO)`.
  - La funzione globale `openSignedFile` include ora un controllo difensivo che intercetta i file con percorso `'fittizio'` mostrando un toast di notifica senza inviare richieste fallimentari verso Supabase Storage.
- **Testing & QA (`tests/legacy-cert-dossier.test.js`)**:
  - Aggiunta nuova suite di test automatizzati per validare la query su `anagrafica_id`, i badge di stato e i controlli difensivi.
  - Test suite globale: 130/130 test superati con successo (12 suite su 12).

## [2026-09-22] ingest | NESTORE — Fix Duplicazione Pasti: Unicità Giornaliera Pasti Principali, Spuntini Progressivi & RLS Chat Update
- **Unicità Pasti Giornalieri (`portal/nestore.js`, `api/nestore-chat.js`)**:
  - Risolto il bug delle cene/pranzi duplicati: per `colazione`, `pranzo` e `cena` il sistema verifica la presenza di un record attivo precedente per la stessa data e lo disattiva tramite soft-delete (`attivo = false`) prima dell'inserimento della versione aggiornata (es. aggiunta alimenti come la banana).
  - Preservata la libertà di inserire molteplici spuntini/merende al giorno (`snack`).
- **Numerazione Progressiva Spuntini (`portal/nestore.js`)**:
  - Introdotta la funzione `formatTipoPastoDisplay(tipo, snackIndex)`: nella tabella storico e nei modali di dettaglio, gli snack consumati nella stessa giornata vengono etichettati automaticamente come *"Spuntino 1"*, *"Spuntino 2"*, ecc., in base all'ordine cronologico di creazione (`creato_il ASC`).
- **Fix Policy RLS Chat Messaggi (`supabase/migration_nestore_fix_pasti_unicita_e_rls.sql`)**:
  - Creata e applicata la policy `nst_chat_update_own` su `public.nestore_chat_messaggi` per abilitare `UPDATE` dei metadata (`{ salvato: true }`).
  - Risolto il bug che faceva riapparire le card di conferma come non salvate al ricaricamento della chat, prevenendo doppi inserimenti accidentali da parte dell'utente.
- **Testing & QA (`tests/pasto-management.test.js`)**:
  - Aggiunti test per `formatTipoPastoDisplay`, vincolo `PASTI_UNICI` su client e API, e migrazione RLS. Suite 126/126 test superati con successo (11/11 file).

---

## [2026-09-22] ingest | NESTORE — Gestione Storico Pasti: Modifica, Cancellazione Soft-Delete & Mobile Long-Press
- **UI Tabella & Responsive (`portal/nestore.html`, `portal/nestore.css`)**:
  - Aggiunta colonna `Azioni` nella tabella `STORICO PASTI` con pulsanti icona compatti: ✏️ (Modifica) e 🗑️ (Elimina).
  - Su schermi mobili ($\le 768\text{px}$), la colonna azioni viene nascosta tramite `.nst-desktop-only` per preservare lo spazio e prevenire overflow.
  - Implementato supporto al **Long-Press (pressione prolungata ~450ms)** sulla riga della tabella touch con feedback tattile (`navigator.vibrate`) e visuale (`.nst-long-press-active`), che apre l'Action Sheet dedicato `#nst-modal-pasto-actions`.
  - Aggiunto testo guida discreto vicino al titolo: `(tieni premuto per azioni)`.
- **Modale di Modifica Pasto (`portal/nestore.html`, `portal/nestore.js`)**:
  - Introdotta la modale `#nst-modal-edit-pasto` per rettificare data, tipo pasto (`colazione`, `pranzo`, `cena`, `snack`), descrizione e macronutrienti.
  - Aggiunto pulsante di utilità *"Ricalcola dai Macro"* che applica istantaneamente la formula scientifica $(Pro \times 4 + Carb \times 4 + Fat \times 9)$.
- **Cancellazione & Soft-Delete (`portal/nestore.js`)**:
  - Implementata la conferma di sicurezza con `confirm()` e l'applicazione rigorosa del **Soft-Delete** (`attivo: false`) in conformità con la direttiva di storicizzazione del progetto.
  - All'aggiornamento o eliminazione del pasto, la dashboard e il grafico stacked bar dei macro/TDEE vengono ricalcolati e ri-renderizzati all'istante senza ricaricare la pagina.
- **Testing & QA (`tests/pasto-management.test.js`)**:
  - Creata suite dedicata per la verifica di modali, responsive design, calcolo macro, gestione soft-delete ed eventi. 123/123 test passati.

---

## [2026-09-20] ingest | NESTORE — Overhaul Schede Metcon Iterazione 2: Calcolo Giri/Intervalli, Evidenziazione Visiva (Work/Rest), Auto-Avanzamento & Tasto Annulla
- **Logica Giri vs Intervalli Tabata (`portal/nestore.html`, `portal/nestore.js`)**:
  - Ridefinita la nozione di "Giro": 1 Giro = completamento di tutti gli esercizi del circuito (es. 6 esercizi = 6 turni di lavoro e 6 di riposo).
  - Aggiornato `IBRIDO_PROGRAMMI_CATALOGO` impostando per Metcon 1 `rounds_default: 6` (invece di 40), perfettamente coerente con 6 giri da 6 minuti = 36 minuti.
  - Aggiornato `aggiornaIbridoTempoTotalePreview()` per calcolare la durata complessiva moltiplicando i giri per il numero di esercizi (`(work + rest) * (rounds * numEsercizi)`).
  - In `avviaIbridoSeduta()`, `tabataEngine.state.config.rounds` viene configurato automaticamente con il numero totale di intervalli (`rounds * numEsercizi`), mentre `ibridoMetconResults` mantiene la suddivisione esatta dei giri del circuito per la compilazione.
- **Evidenziazione Visiva Esercizio Attivo (`portal/nestore.css`, `portal/nestore.js`)**:
  - Create le classi CSS `.nst-metcon-ex-row.active-work` (bordo verde lime e glow) e `.active-rest` (bordo rosso corallo e glow) con evidenziazione integrale della riga e dell'input target/effettivo.
  - In `aggiornaIbridoModalAttivo()`, mappato l'intervallo corrente del Tabata all'indice dell'esercizio attivo `(round - 1) % numEsercizi` e al giro corrente del timer `Math.floor((round - 1) / numEsercizi) + 1`.
  - Aggiornato il display del sottotitolo timer con indicazione chiara di stato: `${phaseName} — GIRO X/Y • ES Z/N: NOME_ESERCIZIO`.
- **Auto-Avanzamento Automatico della Scheda (`portal/nestore.js`)**:
  - Al passaggio del timer da un giro all'altro, il sistema salva automaticamente i dati compilati nel DOM e avanza la scheda visualizzata (`currentMetconDisplayedRound`) al nuovo giro del timer senza interruzioni.
  - L'atleta mantiene comunque la libertà di navigare liberamente con `◀`, `▶` o selettore rapido per consultare o correggere giri passati.
- **Pulsante "ANNULLA" (`portal/nestore.html`)**:
  - Sostituita l'icona '✕' di chiusura nell'header della sessione modale con il pulsante rosso `.nst-btn-danger-ghost nst-btn-annulla-workout` ("ANNULLA"), uniformando il design alla scheda Invictus e chiedendo conferma prima di interrompere il timer.
- **Testing & QA (`tests/metcon-schede.test.js`)**:
  - Aggiunti 5 nuovi test unitari a copertura completa di: calcolo tempo totale con moltiplicatore esercizi, configurazione intervalli tabataEngine, mapping round-to-exercise/giro, evidenziazione classi work/rest e auto-avanzamento automatico.
  - Test suite globale: 117/117 test passati con successo (10 suite su 10).

---

## [2026-09-20] ingest | NESTORE — Overhaul Schede Metcon: Tempo Totale, Scheda Giro Corrente (Opzione 2.B) & Calcolo Esito Globale
- **Calcolo Dinamico Tempo Totale in Anteprima (`portal/nestore.html`, `portal/nestore.js`, `portal/nestore.css`)**:
  - Aggiunto badge dinamico `#nst-ibrido-preview-total-time` nel box di configurazione Tabata.
  - La funzione `aggiornaIbridoTempoTotalePreview()` calcola istantaneamente la durata totale prevista in minuti e secondi sulla base di lavoro, riposo e giri impostati (o modificati via stepper o input diretto).
- **Scheda Giro Corrente con Selettore Rapido (Opzione 2.B - `portal/nestore.html`, `portal/nestore.js`, `portal/nestore.css`)**:
  - Sostituita la tabella statica monolitica con una card dinamica `#nst-metcon-round-card` per la compilazione del giro corrente.
  - Navigazione bidirezionale con tasti `◀` e `▶` e menu a tendina `<select id="nst-metcon-round-select">` per saltare istantaneamente a qualsiasi round (es. da giro 1 a giro 20).
  - Le caselle input visualizzano esclusivamente il valore target grezzo (es. `15`, `60`, `3+3`) senza unità di misura, posizionando le unità nella colonna del target iniziale o come sottotitolo.
  - Salvataggio automatico in tempo reale dello stato round-by-round (`ibridoMetconResults`) tramite eventi `oninput` e alla navigazione tra i giri.
- **Calcolo Totali Sommati ed Esito Globale (`portal/nestore.js`)**:
  - A fine sessione (`terminaIbridoSeduta`), il sistema calcola la somma effettiva di ripetizioni/calorie su tutti i giri per ciascun esercizio confrontandola con il target totale atteso.
  - Attribuzione automatica dell'esito globale (`COMPLETATA`, `PARZIALE`, `SUPERATA`) con apposito badge visuale e tabella riassuntiva.
  - Persistenza del payload completo (`scheda_dati`) con array `giri_dettaglio` e status globale su Supabase (`confermaSalvaIbridoSeduta`).
- **Testing & QA (`tests/metcon-schede.test.js`)**:
  - Creati 12 nuovi test unitari a copertura di: calcolo tempo totale anteprima, estrazione valori e unità, parsing espressioni composite (`3+3`), gestione e navigazione matrice giri, calcolo esiti (Completata, Parziale, Superata) e conformità payload Supabase.
  - Test suite globale: 112/112 test passati con successo.

---

## [2026-09-19] ingest | NESTORE — Mobile UI Redesign Scheda Attiva: 3 Tasti Icona, Termina con Conferma & Ottimizzazione Input
- **Riorganizzazione Barra Azioni Mobile (`portal/nestore.html`, `portal/nestore.css`)**:
  - Posizionati i 3 tasti di controllo (`GIRO`, `PAUSA`, `TERMINA`) su una singola riga orizzontale in fondo allo schermo con larghezza perfettamente uguale (`grid-template-columns: 1fr 1fr 1fr`).
  - Rimossi i testi dei tasti su mobile tramite classe dedicata `.nst-action-btn-text` (`display: none !important;`), mostrando unicamente le icone (`flag`, `pause/play_arrow`, `close`).
  - Trasformato il tasto di termine seduta in un pulsante rosso ad alta visibilità (`.nst-btn-danger`) con icona `close` (X).
- **Protezione Anti-Pressione Accidentale (`portal/nestore.js`)**:
  - Implementata la funzione `promptTerminaIbridoSeduta()` con finestra di conferma modale prima di chiudere la sessione e passare alla schermata di salvataggio/riepilogo, evitando uscite involontarie non reversibili su mobile.
- **Ottimizzazione Campi Input Numerici (Opzione A - `portal/nestore.css`)**:
  - Nascoste le etichette ridondanti `kg` e `rip` all'interno delle singole righe (`.nst-active-unit-label { display: none !important; }`), in quanto già chiaramente specificate nelle intestazioni di colonna ("CARICO (KG)" e "RIP EFFETTIVE").
  - Rimossi i selettori di incremento/decremento nativi del browser (`appearance: textfield`, spin buttons nascosti).
  - Estesa la larghezza dei campi input numerici a `width: 100% !important;` per consentire la visualizzazione chiara e non troncata anche di numeri a più cifre con decimali (es. `82.5`) con font `Orbitron`.
- **Testing & QA (`tests/forza-schede.test.js`)**:
  - Aggiunti 2 nuovi test unitari a copertura del popup di conferma per `promptTerminaIbridoSeduta` e della conformità di classi/markup HTML e regole CSS.
  - Test suite globale: 100/100 test passati con successo.

---

## [2026-09-19] ingest | NESTORE — Layout Testata Mobile a 2 Righe (Stile EPIKA)
- **Ristrutturazione UI (`portal/nestore.html`, `portal/nestore.css`)**:
  - Modificato l'header principale (`.nst-header`) rimuovendo i vecchi wrapper rigidi `.nst-header-left` e `.nst-header-right`.
  - Su Desktop la testata rimane compatta su una singola riga orizzontale.
  - Su Mobile/Tablet (sotto 768px), la testata passa a un layout CSS Grid a due righe per evitare troncamenti:
    - **Riga 1**: Brand (Logo+Testo) a sinistra, tasto CHIUDI a destra.
    - **Riga 2**: Selettore Vista a sinistra, Info Utente (Nome e Corso) a destra.
  - Ripristinata la piena visibilità (`display: block / inline-block`) del badge versione e del corso attivo anche su smartphone compatti.

---

## [2026-09-19] ingest | NESTORE — Mobile UX Fix: Minimizzazione Scheda Ibrido & Sticky Action Bar
- **Riapertura Scheda Ibrido da Dock Timer (`portal/nestore.js`, `portal/nestore.html`)**:
  - Risolto il bug di riapertura che riportava forzatamente al solo cronometro: implementata variabile di stato `ibridoSessionMinimized` e funzione `minimizzaIbridoSeduta()`.
  - Aggiunto pulsante esplicito `▼ RIDUCI` (`.nst-btn-minimize`) nell'header della modale attiva a fianco del tasto di chiusura/annulla.
  - Aggiornato `dockExpandTimer()` per riaprire automaticamente la sessione Ibrido/Forza in corso mantenendo intatti dati, timer e serie registrate.
  - Aggiornato `aggiornaVisibilitaDock()` per mostrare il dock timer anche a sessione minimizzata e garantire sincronizzazione visiva istantanea.
- **Sticky Actions Footer & Ergonomia Mobile (`portal/nestore.css`, `portal/nestore.html`)**:
  - Risolto il bug dei bottoni azione non raggiungibili su smartphone con schede lunghe: ristrutturato `#nst-ibrido-running-view` con flex layout verticale.
  - Incapsulato il contenuto scorrevole (timer, tabella esercizi e carichi, note, laps) nel container `#nst-ibrido-scrollable-content` con `flex: 1 1 auto; overflow-y: auto;`.
  - Fissata la barra comandi `.nst-workout-actions-row` come footer sticky con `flex-shrink: 0`, garantendo che i bottoni `PAUSA` e `TERMINA E SALVA` rimangano sempre visibili e raggiungibili con un tocco del pollice.
  - Ottimizzato il display del timer gigante su dispositivi mobili (<= 600px) riducendolo a 32px con padding compresso, per massimizzare lo spazio verticale per gli esercizi.
- **Testing & QA (`tests/forza-schede.test.js`)**:
  - Aggiunti 5 nuovi test unitari a copertura di `minimizzaIbridoSeduta`, riapertura modale da dock, fallback pannello timer standard, reset alla chiusura/salvataggio e verifica struttura HTML. Suite: 98/98 test passanti con zero errori.

---

## [2026-09-19] ui_redesign | Header Mobile su Due Righe Stile EPIKA e Ripristino Dati Utente (v1.05.55)
- **Frontend Dashboard (`portal/dashboard.html`)**:
  - **Architettura Header a Due Livelli Responsive**: Riorganizzato l'header in un grid Tailwind 2x2 su mobile (`grid grid-cols-2 gap-y-3 gap-x-2`) che si trasforma automaticamente in riga flessibile su desktop (`lg:flex lg:items-center lg:gap-4`).
  - **Distribuzione Elementi (Mobile)**:
    - **Riga 1 (In alto)**: Logo e Versione (`order-1`, sinistra) | Azioni Logout e Hamburger (`order-2`, destra).
    - **Riga 2 (In basso)**: Selettore Ruolo / Badge Statico (`order-3`, sinistra) | Nome Utente e Ruolo (`order-4`, destra).
  - **Distribuzione Elementi (Desktop)**: Utilizzate le classi `lg:order-*` e `lg:ml-auto` sui dati utente per mantenere la classica riga singola (Logo + Switcher a sinistra, Dati Utente + Logout a destra).
  - **Ripristino Visibilità Dati Utente e Badge Statico**: Eliminato il blocco `hidden lg:block` e le regole CSS soppressive, rendendo nome utente, ruolo e badge statico leggibili e confortevoli su tutti i dispositivi mobile con supporto `truncate` anti-overflow.
- **Global Bump**: Versione globale aggiornata a **v1.05.55** su 23 file tramite `npm run bump`.

---

## [2026-09-19] ingest | NESTORE — Overhaul Modale Workout Attivo Mobile, Warmup Interattivo & Screen WakeLock API
- **Screen Wake Lock API (`portal/nestore.js`, `portal/nestore.html`, `portal/nestore.css`)**:
  - Implementato modulo nativo `WakeLockManager` (`navigator.wakeLock.request('screen')`) per impedire lo spegnimento dello schermo smartphone durante tutta la durata dell'allenamento attivo.
  - Gestione automatica dell'evento `visibilitychange` (re-acquisizione del blocco dello schermo se l'utente torna sull'app dopo un cambio finestra).
  - Indicatore visivo `SCHERMO ATTIVO` (`#nst-wakelock-badge`) con pulsazione cyber nell'header della modale attiva.
- **Riscaldamento Specifico e Serie Allenanti Interattive (`avviaIbridoSeduta`)**:
  - Trasformate le 5 serie di riscaldamento specifico (`Risc 1 10x`, `Risc 2 5x`, `Risc 3 3x`, `Risc 4 1x`, `Risc 5 1x`) in righe pienamente interattive e modificabili dall'atleta per **Carico (kg)** e **Ripetizioni**.
  - Dotate tutte le serie allenanti (`Serie 1..N`) e le serie extra di doppio input modificabile in-sessione per peso e ripetizioni.
- **Calcolo Esito con Warmup & Note In-Sessione**:
  - Il calcolo dell'esito scheda (`COMPLETATA`, `SUPERATA`, `PARZIALE`) ora include integralmente sia le serie di riscaldamento che le serie allenanti.
  - Aggiunto box note espandibile in tempo reale durante la sessione attiva (`#nst-ibrido-workout-note-inline`), con sincronizzazione bidirezionale verso la vista di salvataggio e persistenza in `public.nestore_allenamenti`.
  - Aggiornato payload di salvataggio per includere `riscaldamento_effettivo` e il carico reale per-serie.
- **Design Ergonomico Mobile-First (≤ 600px)**:
  - Eliminato il box a scorrimento fisso da 200px in favore di scorrimento naturale ampio (max 55vh su mobile).
  - Touch target degli input $\ge 44\text{px}$, font-size 16px per prevenire l'auto-zoom di Safari iOS, e controlli di fine sessione impilati ad alta ergonomia touch.
- **Testing & Quality Assurance (`tests/forza-schede.test.js`)**:
  - Aggiunti 5 nuovi test unitari su `WakeLockManager`, toggle note, rendering warmup modificabili ed esiti con riscaldamento. Totale test: 93/93 passanti con zero errori di log.

---

## [2026-09-19] ingest | NESTORE — Pulsante ANNULLA con Blocco di Sicurezza su Modale Workout Attivo
- **Frontend & UI Workout (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Sostituita la precedente icona "✕" nell'header della modale `#nst-active-workout-modal` con un pulsante esplicito `[ANNULLA]`.
  - Introdotta la classe CSS `.nst-btn-danger-ghost` per una visualizzazione chiara con bordo e testo rosso tenue, prevenendo tocchi accidentali rispetto a una generica chiusura di finestra.
  - Aggiornata la funzione `chiudiModalWorkoutAttivo()` rimuovendo la dipendenza dallo stato `timerEngine.state.running`, introducendo un `confirm()` incondizionato e bloccante con testo esplicito: *"Attenzione: sei sicuro di voler annullare l'allenamento? Tutti i progressi e il tempo registrato andranno persi."*.
  - Risolto il rischio di perdita dati immediata quando il timer veniva messo in pausa prima dell'uscita.
- **Testing & Quality Assurance (`tests/standard-workouts.test.js`)**:
  - Aggiunti controlli di conformità per `.nst-btn-danger-ghost` e la presenza del testo `ANNULLA`. Suite complessiva: 88/88 test passati.

---

## [2026-09-19] ingest | NESTORE — Rework Flusso Schede Forza (Preview Personalizzabile & Sessione con Precompilazione Zero-Effort)
- **Frontend & Configurazione Anteprima (`portal/nestore.html`, `portal/nestore.js`, `portal/nestore.css`)**:
  - Riorganizzato il flusso "Schede Forza" separando nettamente la configurazione pre-seduta dalla registrazione attiva in tempo reale.
  - Nella modale anteprima (`#nst-ibrido-preview-modal`):
    - Escluso il riscaldamento generico da 10' da indicazioni rigide (libero per l'atleta).
    - Esposto il protocollo di riscaldamento specifico a 5 serie progressive ($1\times10@75\%$, $1\times5@80\%$, $1\times3@85\%$, $1\times1@95\%$, $1\times1@100\%$) con **pesi in kg modificabili** dall'atleta.
    - Esposta la sequenza allenante con serie, ripetizioni e carico modificabili prima dell'avvio.
    - Risoluzione carichi: precompilazione automatica dai carichi della sessione precedente dello stesso programma (`recuperaUltimaSessioneProgramma`), oppure calcolo su massimale PR/peso atleta al primo avvio.
    - Badge di monitoraggio massimo storico (`verificaForzaMaxStorico`): avviso ambra se il carico impostato è inferiore al record storico all-time per quell'esercizio, badge verde se pari o superiore.
    - Guida visiva alla progressione di carico consigliata ($4\times4 \rightarrow 4\times5 \rightarrow 4\times6$).
- **Modale Esecuzione Attiva (`#nst-ibrido-active-modal`)**:
  - Target di riferimento fisso e immutabile durante la sessione.
  - Caselle delle ripetizioni precompilate con il valore target: nessun click né spunta richiesta se l'atleta chiude le ripetizioni (modalità zero-effort). Se ne completa meno o più, modifica direttamente la casella numerica.
  - Pulsante `+ AGGIUNGI SERIE EXTRA` (`aggiungiSerieExtraForza`) per serie supplementari oltre il programma.
- **Riepilogo, Valutazione Esito e Salvataggio**:
  - Calcolo automatico dell'esito globale e per esercizio: `COMPLETATA` (100%), `SUPERATA` (volume/ripetizioni extra), `PARZIALE` (mancato completamento).
  - Badge visuale di feedback (`#nst-ibrido-esito-badge`) in `#nst-ibrido-save-view` con consigli specifici sulla progressione.
  - Persistenza strutturata in `public.nestore_allenamenti` (`scheda_dati.esito_globale`, `serie_effettive`, `riscaldamento`) e alimentazione Record Personali (PR).
- **Testing & Quality Assurance (`tests/forza-schede.test.js`)**:
  - Suite dedicata con 9 test unitari su riscaldamento, bodyweight check, max storico, badge avviso carichi, rendering configurazione, avvio seduta, aggiunta serie extra e calcolo esiti. Tutti gli 88 test del progetto passano con 0 errori.

## [2026-09-18] ingest | Gestione Codice Accesso Palestra (PIN Personale Tastierino)
- **Database (`supabase/migration_codice_accesso_palestra.sql` & Supabase DB)**:
  - Aggiunta colonna `codice_accesso VARCHAR(20) DEFAULT NULL` su `public.utenti` con vincolo UNIQUE `utenti_codice_accesso_unique`.
  - Aggiornata la vista SQL `public.vw_stato_atleta_corso` per esporre `u.codice_accesso`.
  - Eseguito seed transazionale dei codici a 6 cifre per i 17 atleti registrati (Domenico Galanti ignorato come da direttiva in quanto non ancora registrato).
- **Dashboard Istruttori & Direttivo (`portal/dashboard.html`, `portal/dashboard.js`)**:
  - Estesa la griglia dei dettagli espandibili delle card atleti (`#instructor-iscritti-cards`) con il nuovo riquadro "CODICE ACCESSO PALESTRA".
  - Modalità Presidente / Vice Presidente: campo modificabile con validazione 6 cifre, controllo preventivo di unicità prima dell'UPDATE e pulsante 🎲 `generaCodiceAccesso()` per la creazione istantanea di codici casuali univoci.
  - Modalità Istruttore (sola lettura): badge protetto con visualizzazione del codice per assistenza all'accesso in palestra.
  - Funzioni globali implementate: `window.salvaCodicePalestra(utenteId, nuovoCodice)` e `window.generaCodiceAccesso(utenteId, inputId)`.
- **Dashboard Personale Atleta (`portal/dashboard.html`, `portal/dashboard.js`)**:
  - Aggiunto display del PIN di accesso personale in "PANORAMICA" (`#user-info-codice-accesso`) nella card Stato Registro Sportivo.
  - Aggiunto widget dedicato ad alta visibilità in "IL MIO PROFILO" (`#user-display-codice-accesso`) con evidenziazione in giallo primario e istruzioni per il tastierino d'ingresso.
  - Popolamento reattivo integrato in `populateUserPanoramicaSummary()` e `loadUserProfilo()`.

## [2026-09-18] ingest | Dashboard Istruttori — Filtri Multipli Indipendenti e Ricerca Real-Time Atleti
- **Frontend & UI (`portal/dashboard.html`)**:
  - Aggiunta toolbar di filtri avanzati (`#instructor-filter-search`, `#instructor-filter-csen`, `#instructor-filter-cert`, `#instructor-filter-corso`) e badge dinamico contatore `#instructor-filter-count-badge` posizionato sopra `#instructor-iscritti-cards`.
  - Tasto rapido di reset filtri `resetInstructorFilters()` con azzeramento campi e ripristino immediato della vista completa.
- **Logica di Ricerca e Filtraggio Lato Client (`portal/dashboard.js`)**:
  - Separata la logica di caricamento da quella di rendering tramite la funzione reattiva `renderInstructorCards()`, che applica i filtri sull'array in memoria `instructorStudentsData` per massimizzare la reattività senza chiamate di rete superflue.
  - Ricerca in tempo reale durante la digitazione (`oninput`) su nome o cognome.
  - Filtro indipendente CSEN (`ATTIVO`, `SOSPESO`, `SCADUTO/MANCANTE`).
  - Filtro indipendente Certificato Medico (`VALIDO`, `IN SCADENZA / IN ATTESA`, `SCADUTO / MANCANTE`).
  - Filtro indipendente Scadenza Corso / Pagamento (`REGOLARE`, `IN SCADENZA (≤10 gg)`, `SCADUTO / INSOLUTO`, con gestione automatica sia delle quote a rate insolute che dei carnet ingressi esauriti).
  - Feedback visivo dello stato vuoto contestuale qualora nessun atleta corrisponda ai filtri applicati.

## [2026-09-17] fix | Rettifica Data Scadenza Certificato Medico e Sblocco Tesseramento Alessandro Santucci
- **Database (`certificati_medici` & `registro_tesserati`)**:
  - Eseguita transazione atomica SQL per la rettifica della data di scadenza del certificato medico (`id: 430d3d50-b89d-485e-a876-a4f3b58f2b39`) dell'atleta Alessandro Santucci (`CF: SNTLSN00B16A462I`).
  - Corretta la data di scadenza da `2026-09-05` (valore errato trascritto a 1 mese) a `2027-08-05` (validità piena di 1 anno dal rilascio del 06/08/2026).
  - Ripristinato lo stato di tesseramento a `ATTIVO` su `registro_tesserati` (`id_tesserato: 177`), sbloccando l'atleta precedentemente marcato come `SOSPESO`.
  - Registrata traccia immutabile in `registro_audit_operazioni` con azione `RETTIFICA_SCADENZA_CERTIFICATO` a firma del Consiglio Direttivo, nel pieno rispetto delle regole di storicizzazione Epika.

## [2026-09-17] ingest | NESTORE — Editor Serie Programmi Forza con Ripetizioni, % Massimale e Calcolo Carico Automatico
- **Editor Dedicato nella Libreria Allenamenti (`portal/nestore.html`, `portal/nestore.js`, `portal/nestore.css`)**:
  - Implementato nella modale `#nst-coach-programma-modal` un editor strutturato per tutti i programmi con categoria o tipologia `forza`.
  - Ogni esercizio di forza include un container per le serie (`.nst-ex-serie-container`) precompilato con lo standard a 5 serie richieste:
    1. 10 rip @ 60%
    2. 5 rip @ 70%
    3. 3 rip @ 80%
    4. 1 rip @ 90%
    5. 1 rip @ 100%
  - Ciascuna serie dispone di due input numerici dedicati (`rip` e `%`), pulsante di eliminazione (`✕`) con re-indicizzazione istantanea delle serie e pulsante `+ AGGIUNGI SERIE` per aggiungere serie dinamiche a piacere.
- **Serializzazione JSONB & Piena Retrocompatibilità**:
  - Struttura salvata in `nestore_programmi_libreria` come `serie: [{ rip, pct, percentuale }]` con generazione automatica contestuale del testo `target` (es. `10 rip @ 60%, 5 rip @ 70%...`), garantendo compatibilità al 100% con qualsiasi vista esistente.
- **Risoluzione Massimale e Calcolo Carico a Runtime (`avviaIbridoSeduta`)**:
  - Algoritmo `ottieniBaseMassimaleEsercizio` che determina la base in kg:
    1. **PR dell'atleta** per quell'esercizio da `nestore_allenamenti` se presente e > 0.
    2. **Peso corporeo dell'atleta** da `nestore_pesi_misure` come primo fallback.
    3. **Default standard (70 kg)** se mancano sia PR che peso corporeo.
  - Tabella workout espansa per serie con calcolo automatico $\text{baseKg} \times \% / 100$ arrotondato a 0.5 kg, indicazione della fonte utilizzata e input modificabili durante l'allenamento.
  - Salvataggio dettagliato in `scheda_dati.serie_dettaglio` con alimentazione automatica del carico massimo per il calcolo dei Record Personali futuri.
- **Testing & Quality Assurance (`tests/nestore-coach.test.js`)**:
  - Aggiunti unit test specifici a copertura di: schema di default, rilevazione modalità forza, calcolo massimale con tutti i livelli di fallback (PR $\rightarrow$ peso $\rightarrow$ 70kg), serializzazione corretta e rendering dell'anteprima formattata.
  - Vitest suite: 79/79 test passati con successo (8 test files).

## [2026-09-17] ingest | NESTORE — Duplicazione e Assegnazione Programmi ad Atleti (Opzione A & Timer Integrato)
- **Database & Storicizzazione EPIKA (`supabase/migration_nestore_assegnazione_libreria.sql`)**:
  - Aggiunta colonna `programma_libreria_id` (UUID NULLABLE, FK `public.nestore_programmi_libreria(id)`) su `public.nestore_schede_allenamento`.
  - Creata policy RLS che assicura che gli atleti possano sempre accedere in lettura ai programmi della libreria collegati alle loro schede (anche qualora vengano archiviati successivamente dal coach).
- **Tasto Duplica Programma (`duplicaProgrammaLibreria`)**:
  - Aggiunto tasto `DUPLICA` su ciascuna card della libreria programmi del coach.
  - Apre istantaneamente la modale di modifica precompilata con tutti i campi originari, azzera l'ID (per forzare `INSERT`), incrementa l'ordine e aggiunge `(Copia)` al nome.
- **Doppio Flusso di Assegnazione ad Atleta (Opzione A)**:
  - **Dalla Card in Libreria (`apriModalAssegnaProgramma`)**: pulsante `ASSEGNA` con modale dedicata `#nst-modal-assegna-programma`, menu a discesa degli atleti attivi nei corsi dell'istruttore, campi periodo e note personalizzate. Soft-archive automatico della scheda precedente e inserimento a database.
  - **Dall'Ispezione Atleta (`#nst-coach-subpanel-schede`)**: terza opzione `IMPORTA DA LIBRERIA` nel selettore a pillole (`#nst-pill-mode-lib`), menu a tendina programmi e preview live dinamica di esercizi e timer (`#nst-scheda-programma-lib-preview`).
- **Esperienza Atleta con Timer Integrato (`caricaSchedeAtleta`)**:
  - Le schede assegnate collegate a un programma di libreria mostrano il box leggibile degli esercizi con i relativi target e il pulsante **`AVVIA PROGRAMMA`** (`.nst-btn-launch-workout`).
  - Il click apre l'anteprima e il timer interattivo (Tabata o cronometro), permettendo all'atleta di eseguire il workout registrando giri, serie e carichi.
- **Testing & Quality Assurance (`tests/nestore-coach.test.js`)**:
  - Aggiunti unit test per la duplicazione con azzeramento ID, l'assegnazione, la popolazione selettiva da libreria e il rendering del pulsante di avvio.
  - Vitest suite: 71/71 test superati con successo (8 test files).

## [2026-09-17] ingest | NESTORE — Gestione Libreria Programmi per Allenatore (Supabase & 2-Tab Coach UI)
- **Database & Storicizzazione EPIKA (`supabase/migration_nestore_libreria_programmi.sql`)**:
  - Creata la tabella `public.nestore_programmi_libreria` con RLS (lettura per tutti gli autenticati su programmi attivi, gestione per Istruttori e Admin).
  - Applicata la regola fondamentale EPIKA: soft-delete rigoroso tramite `attivo = false` (nessun DELETE fisico) per preservare l'integrità referenziale dello storico atleti.
  - Eseguito il seeding iniziale dei 9 programmi ufficiali (Invictus Base, 4 Ibrido Metcon, 4 Ibrido Forza) con parametri completi.
- **Frontend & Navigazione Coach (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Implementata la barra di navigazione principale a 2 tab nella dashboard Coach: `[I MIEI ATLETI]` (`#nst-coach-tab-athletes`) e `[LIBRERIA ALLENAMENTI]` (`#nst-coach-tab-library`).
  - Creata la vista `#nst-coach-library-view` con contatore KPI dei programmi, filtro dinamico per tipologia (`Tutti`, `Ibrido Metcon`, `Ibrido Forza`, `Invictus Benchmark`, `Altro`) e barra di ricerca live.
  - Realizzato il modale `#nst-coach-programma-modal` per la creazione e la modifica completa di qualsiasi programma:
    - Input nome, tipologia, categoria, modalità timer (`tabata` o `stopwatch` con campi condizionali work/rest/rounds).
    - Tempi e giri target opzionali, descrizione / linee guida operative.
    - Gestione dinamica degli esercizi con aggiunta/rimozione interattiva di righe.
  - Svincolato il catalogo da strutture statiche: i programmi vengono ora recuperati asincronamente da Supabase sia per gli atleti che per gli allenatori.
- **Testing & Quality Assurance (`tests/nestore-coach.test.js`)**:
  - Aggiunti unit test per il tab-switcher coach, per tutti gli elementi HTML della libreria e del modale di editing, per l'esportazione di tutte le funzioni CRUD e per la verifica del soft-delete.
  - Vitest suite: 67/67 test superati con successo.

## [2026-09-17] ingest | NESTORE — Card Ultra-Compatte Programmi Base (Ibrido) & Standard (INVICTUS)
- **UI & Interaction Design (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Compattate le 8 card dei programmi Ibrido Base (Metcon 1–4 e Forza 1–4) su griglia a 4 colonne $\times$ 2 righe su desktop:
    - Rimosse le descrizioni testuali, l'elenco esercizi e il pulsante statico dal riassunto a pannello.
    - Mostrati unicamente il Nome (`Metcon 1`, `Forza 1`, ecc.) e il Badge di tipologia (`METCON` in ciano, `FORZA` in ambra).
    - L'intera card è cliccabile con cursore `pointer` e hover glow distintivo, aprendo istantaneamente `#nst-ibrido-preview-modal` con i dettagli completi, lo schema esercizi e la configurazione timer.
  - Compattata la card **INVICTUS** (`#nst-standard-card-compact`) nel pannello standard workouts, ridotta ad altezza minima e resa cliccabile.
  - Introdotta la modale popup `#nst-invictus-preview-modal` con lo stepper di selezione Pull-up base (1:2:4) e il calcolo dinamico dei target prima dell'avvio.
- **Testing & Quality Assurance (`tests/standard-workouts.test.js`, `tests/nestore-coach.test.js`)**:
  - Aggiunti test di verifica per la card compatta di Invictus e la modale di setup dedicata. 63/63 test passati.

## [2026-09-17] ingest | NESTORE — Programmi Ufficiali Ibrido Base (8 Schede: Metcon 1-4 & Forza 1-4)
- **Frontend & Catalogo Schede (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Introdotto il catalogo ufficiale `IBRIDO_PROGRAMMI_CATALOGO` contenente gli 8 programmi del corso Ibrido Base estratti dal foglio Google Sheet ufficiale:
    - **Metcon 1, 2, 4**: conditioning con motore `tabataEngine` preconfigurato con i secondi specifici di lavoro e recupero (es. 30"/30" o 25"/35") e rounds obiettivo, completamente modificabili dall'atleta prima dell'avvio.
    - **Metcon 3**: programma Unbroken a 20 giri no time limit con tempo target 40', gestito via stopwatch `timerEngine` con supporto a pause e intertempi (lap).
    - **Forza 1, 2, 3, 4**: progressione carichi e rampa su Panca Piana, Squat, Stacco da terra, Trazioni Pesate, Lento Avanti e Rematore Bilanciere, con tabella interattiva serie/rip/kg.
  - Aggiunta nel pannello `SCHEDE` (`#nst-schede-panel`) della sezione `#nst-ibrido-programmi-section` con 8 card responsive (metcon in cyan, forza in amber).
  - Implementata la modale anteprima e setup parametri (`#nst-ibrido-preview-modal`).
  - Realizzata la modale di esecuzione attiva (`#nst-ibrido-active-modal`) sincronizzata a 60fps nel `masterTimerLoop`, con display cronometro gigante, laps/intertempi e tabella compilazione carichi ed esercizi dal vivo.
  - Creata la vista di chiusura seduta con **prevenzione timer sballato/dimenticato**: input numerico modificabile per la durata effettiva, warning box pulsante se il timer supera 90 minuti, riepilogo carichi confermati e campo note.
  - Salvataggio persistente in `public.nestore_allenamenti` con disciplina `Ibrido — [Nome]`, durata minuti e `scheda_dati` JSONB strutturato, con aggiornamento automatico dei KPI in dashboard e dei PR massimali.
- **Testing & Quality Assurance (`tests/nestore-coach.test.js`)**:
  - Aggiunti unit test specifici per verificare il catalogo da 8 programmi, le modalità timer corrette per ciascun programma, la presenza di tutti i componenti HTML e l'export di tutte le funzioni su `global.window`. Test suite complessiva: 62/62 superati senza errori.

## [2026-09-17] ingest | NESTORE — Fix Leak Permessi Impersonazione (Assistenza) & Banner Visivo
- **Frontend & Access Control (`portal/nestore.js`)**:
  - Risolto il bug di leak dei permessi amministrativi durante la modalità Assistenza (`?impersonate_id=...`):
    - All'attivazione dell'impersonazione, i flag di autorizzazione `isAuthorizedAdmin`, `isBoardMember` e `isIstruttore` vengono ora ricalcolati **al 100% sui dati reali dell'utente impersonato** (`targetProfile` e `registro_istruttori`).
    - Spostata la valutazione di `hasUnconditionalAccess` a valle del blocco di impersonazione per impedire che l'utente simulato erediti l'accesso incondizionato dell'amministratore.
    - Se l'utente impersonato è un istruttore (es. Ciaralli), il selettore mostra unicamente `ATLETA` e `ALLENATORE`, e il badge di stato riporta correttamente `ISTRUTTORE` (non più `AMMINISTRATORE` o `MODALITÀ ADMIN`).
- **UI & Layout (`portal/nestore.html`)**:
  - Introdotto il banner statico `#nst-assistenza-banner` posizionato subito sotto l'header, con bordo e accento rosso/arancio: *"⚠️ MODALITÀ ASSISTENZA ATTIVA — Stai visualizzando Nestore come: [Nome]"* e pulsante rapido *"← TORNA ALLA DASHBOARD"* conforme allo standard visuale di EPIKA e Dashboard.
- **Testing & Quality Assurance (`tests/nestore-coach.test.js`)**:
  - Aggiunti unit test specifici per verificare l'esistenza del banner HTML, la gestione in `nestore.js` e la rigorosa esclusione di privilegi da amministratore non dovuti durante l'impersonazione. Tutti i 59 test della suite sono passati senza errori.

## [2026-09-17] ingest | NESTORE — Restrizione Vista Amministratore (Solo Presidente) e Hardening RLS
- **Frontend & Access Control (`portal/nestore.js`)**:
  - Ristretto `isAuthorizedAdmin` rigorosamente al ruolo `'presidente'` (`Array.isArray(profile.ruolo) && profile.ruolo.includes('presidente')`), rimuovendo i consiglieri e altri membri del Direttivo dall'accesso globale admin.
  - Aggiornato il selettore `#nst-view-switcher`: l'opzione `AMMINISTRATORE` viene mostrata unicamente se `isAuthorizedAdmin === true`, mentre l'opzione `ALLENATORE` viene mostrata unicamente se `isIstruttore === true` (presenza in `registro_istruttori`).
  - Se un utente del direttivo non è istruttore (es. Sergio Paoletti), vede unicamente la vista `ATLETA` e il selettore rimane nascosto. Se un consigliere è istruttore (es. Ciaralli, Mannocchi), vede `ATLETA` e `ALLENATORE`. Solo il presidente vede `AMMINISTRATORE`.
  - Introdotti controlli di guardia e validazione ruoli all'inizio di `switchNestoreView`, `caricaCoachDashboard` e `caricaAdminDashboard` per bloccare tentativi di accesso anomali.
- **Database & Security RLS (`supabase/migration_nestore_admin_strict.sql`)**:
  - Applicata migrazione DDL in produzione (`zpategmkelqmexetpaot`).
  - Ristrette tutte le policy RLS di lettura e gestione globale (`nst_schede_select`, `nst_schede_insert`, `nst_schede_update`, `nst_pm_select_own`, `nst_all_select_own`, `nst_pasti_select_own`, `nst_scheda_select_own`, `nst_pref_select_own`) rimuovendo i membri generici del direttivo e consentendo l'accesso globale esclusivamente a `ARRAY['presidente'::public.ruolo_utente]`.
  - Ristrette le policy di lettura e upload sul bucket Supabase Storage `schede_allenamento`.
- **Testing (`tests/nestore-coach.test.js`)**:
  - Aggiunti unit test specifici per verificare la restrizione di `isAuthorizedAdmin` e la logica di generazione del selettore viste. Test suite complessiva: 57/57 passati.

## [2026-09-16] ingest | NESTORE — Allenamenti Standard & Benchmark WOD (INVICTUS) con Modale Timer Attivo
- **Frontend & UI Schede (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Aggiunta la sezione **"ALLENAMENTI STANDARD & BENCHMARK"** nel pannello `#nst-schede-panel` con card dedicata al benchmark **INVICTUS** (sequenza Pull $\rightarrow$ Push $\rightarrow$ Squat con ratio fisso 1 : 2 : 4).
  - Implementato stepper interattivo reattivo per impostare il numero base di Pull-up (default 5), con calcolo istantaneo delle ripetizioni di Push-up e Air Squat.
  - Creata la modale overlay a tutto schermo **`#nst-active-workout-modal`** attivata da *"AVVIA PROGRAMMA"*, provvista di display cronometro gigante, indicatore di stato pulsante, target checklist, registrazione intertempi (Giro/Lap) e pulsanti di Pausa/Riprendi.
  - Sincronizzazione a 60fps con il modulo nativo **`timerEngine`** (stopwatch ad alta precisione con persistenza `localStorage`, auto-stop a 3 ore e supporto al floating dock cross-page).
  - Flusso di completamento *"TERMINA E SALVA"* con finestra di riepilogo tempo e ripetizioni, campo note opzionale per l'atleta, e persistenza automatica su Supabase `nestore_allenamenti` con `scheda_dati` standardizzata (`Pull-up`, `Push-up`, `Air Squat`, `peso_kg: 0`).
  - Integrazione con il calcolo dei Record Personali (`calcolaRecordPersonali`) per aggiornare la bacheca massimali a corpo libero in tempo reale.
- **Testing (`tests/standard-workouts.test.js`)**:
  - Creati 6 unit test a copertura di: presenza card e modale in HTML, regole CSS, calcolo del ratio 1:2:4, composizione del payload `scheda_dati` ed export delle funzioni JavaScript. Suite complessiva: 55/55 test superati.

---

## [2026-09-16] ingest | NESTORE — Fix Grafico Dieta (Stacked Bars, Layer Order & Edge-to-Edge Target Lines)
- **Frontend & Visual Analytics (`portal/nestore.js`)**:
  - **Stacking Asse Y**: Abilitato `options.scales.y.stacked: true` in `renderGraficoDieta()`, correggendo la precedente sovrapposizione visiva delle barre che partivano tutte da Y=0.
  - **Ordinamento Layer Bottom-to-Top**: Riordinati i dataset dei macronutrienti con Proteine (Cyan `#00e5ff`) alla base (indice 0), Grassi (Lime `#76ff03`) al centro (indice 1), e Carboidrati (Amber `#ffb300`) in cima (indice 2).
  - **Border Radius Selettivo**: Impostato `borderRadius: 0` per Proteine e Grassi, e `borderRadius: 4` unicamente per i Carboidrati in cima, conferendo un aspetto compatto e solido alla colonna di consumo calorico.
  - **Custom Plugin Linee a Tutta Ampiezza (`fullWidthTargetLinesPlugin`)**: Introdotto plugin inline di Chart.js che traccia le linee orizzontali TDEE (rossa tratteggiata) e Target Atleta (verde tratteggiata) da `chartArea.left` a `chartArea.right`, estendendole per l'intera larghezza della griglia anche in presenza di una sola data o spazi di padding laterale.
  - **Preservazione Legenda**: Mantenuti i dataset nativi con `showLine: false` e `pointRadius: 0` per garantire l'esposizione in legenda e l'interazione senza duplicazione dei tratti tratteggiati.
- **Testing (`tests/diet-chart-target.test.js`)**:
  - Aggiunti unit test per validare la presenza di `stacked: true`, l'ordine dei macronutrienti, il `borderRadius` selettivo, e la registrazione del plugin full-width. Test suite complessiva: 49/49 passati.

---

## [2026-09-16] ingest | NESTORE — Multi-Event Extraction, Diet Chart TDEE/Target Lines & Inline Target Editor
- **Backend (`api/nestore-chat.js`)**:
  - Risolto bug di estrazione singola: `extractionRegexAll` ora itera su tutti i blocchi ````json:extraction```` presenti nella risposta di Gemini, persistendo simultaneamente tutti i pasti o eventi (es. colazione + pranzo) senza omissioni.
  - Aggiornato il system prompt per istruire Gemini a emettere blocchi `json:extraction` multipli distinti per ogni pasto/evento e a supportare l'aggiornamento preferenze (`tipo: "preferenze"`, `calorie_target`).
  - Introdotta action `save_target` per l'aggiornamento diretto del target calorico con validazione del range 800-6000 kcal.
- **Frontend & Visual Analytics (`portal/nestore.html`, `portal/nestore.js`)**:
  - Aggiunte due linee di riferimento nel grafico Chart.js di Dieta & Macro:
    - **Linea Rossa Tratteggiata (TDEE Salute)**: Mostra il fabbisogno calorico stimato scientificamente (Formula Mifflin-St Jeor) da Wiki Atleta.
    - **Linea Verde Tratteggiata (Target Atleta)**: Mostra l'obiettivo calorico giornaliero personalizzato dell'atleta.
  - Asse Y configurato con `stacked: false` per consentire ai macro in barre di sommarsi tramite `stack: 'macro'` mentre le linee rimangono al loro livello assoluto. Tooltip aggiornato per mostrare sia i macro che le calorie di riferimento senza falsare il totale pasti.
  - Aggiunto widget/container `Target: [X] kcal ✏️` con funzione `modificaTargetCalorie()` per consentire la modifica istantanea del target con re-render in tempo reale.
- **Data Recovery (Supabase Live)**:
  - Recuperato e inserito via SQL il record mancante del pranzo del 2026-09-16 per l'atleta (`utente_id: afb93c7b-a75d-42fb-b005-13d09fb6834d`, 1015 kcal, P 37g, C 88g, F 54g).
- **Testing & Documentazione**:
  - Creato `tests/diet-chart-target.test.js` e aggiunti unit test in `tests/nestore-chat.test.js` (48/48 test superati).
  - Aggiornati `wiki/nestore_portal.md` e `wiki/log.md`.

---

## [2026-09-16] ingest | NESTORE — Audit WFTEST, Hardening XSS & Refactoring Schede/Coach
- **Database (`supabase/migration_nestore_schede_fk_fix.sql`)**:
  - Applicata migrazione correttiva FK su Supabase live: `allenatore_id` reso nullable per compatibilità con vincolo `ON DELETE SET NULL`.
  - Vincolo FK `atleta_id` modificato da `ON DELETE CASCADE` a `ON DELETE RESTRICT` per conformità alla regola di storicizzazione EPIKA.
- **Frontend & Sicurezza (`portal/nestore.js`)**:
  - **Prevenzione XSS & Event Delegation**: Eliminata concatenazione di parametri utente negli attributi `onclick` inline in `renderCoachCoursesList` e `caricaSchedeAtleta`. Introdotti attributi `data-*` e event delegation sui container principali con cache in memoria `schedeCacheMap`.
  - **Universal Sanitization**: `escapeHtml` reimplementata come funzione pura di sostituzione caratteri (&, <, >, ", '), operativa senza dipendenza da DOM sia in browser che in Node.js.
  - **Filtro Iscrizioni Scadute**: Introdotto helper `isIscrizioneAttiva(isc, dataRif)` utilizzato in `initNestore`, `caricaCoachDashboard` e `caricaAdminDashboard` per escludere atleti con abbonamento/corso scaduto o ingressi esauriti.
  - **Limit Anti-Bloat Admin**: Query iscrizioni per l'amministratore limitata a 500 record con avviso visuale.
  - **Rollback File Storage**: Gestione di pulizia automatica in `inviaNuovaSchedaCoach` se il salvataggio a DB fallisce dopo l'upload del file Word.
- **Testing & Documentazione**:
  - Aggiornato `tests/nestore-coach.test.js` con 10 test (44/44 test complessivi del repository superati con successo).
  - Aggiornati `wiki/database_schema.md` (§7), `wiki/nestore_portal.md` (§9) e `wiki/log.md`.

---

## [2026-09-16] ingest | NESTORE Fase 2 — Vista Allenatore, Vista Amministratore & Schede di Allenamento
- **Database (`supabase/migration_nestore_schede_allenamento.sql`)**:
  - Creata tabella `public.nestore_schede_allenamento` con storicizzazione EPIKA (soft-delete `attivo = true`), indici dedicati e RLS per atleta, allenatore e Direttivo.
  - Aggiornate le policy SELECT su `nestore_pesi_misure`, `nestore_allenamenti`, `nestore_pasti`, `nestore_scheda_atleta` e `nestore_preferenze` per consentire la lettura in consultazione agli istruttori assegnati ai rispettivi corsi in `public.istruttori_eventi` e al Direttivo.
  - Creato bucket Supabase Storage `schede_allenamento` (privato, limite 5MB anti-bloat per file Word `.docx`/`.doc`) con relative RLS policies per upload e lettura tramite URL firmati.
  - Applicata ed eseguita migrazione con successo su Supabase `ADRENALINA_SERVICES`.
- **Frontend UI & SPA (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Configurato selettore ruoli `#nst-view-switcher` nell'header: ingresso iniziale sempre su vista personale `ATLETA`; se l'utente è istruttore registrato o membro del Direttivo, può passare a `ALLENATORE` o `AMMINISTRATORE`.
  - **Dashboard Coach (`#nst-coach-list-view`)**: elenco atleti raggruppati per corso con tendina di selezione corso (`#nst-coach-course-select`) e ricerca testuale in tempo reale per nome, cognome ed email.
  - **Dettaglio Atleta (`#nst-coach-atleta-view`)**: pannello di consultazione con barra di navigazione (`← TORNA ALLA LISTA ATLETI`), sub-tabs per `SCHEDE DI ALLENAMENTO`, `PESO & MISURE`, `ALLENAMENTI & PR`, `DIETA & MACRO`, `SCHEDA AI` con banner di sola lettura.
  - **Form Schede di Allenamento**: supporta sia il copia-incolla/testo libero fino a 50.000 caratteri sia il caricamento di file Word `.docx`/`.doc` con validazione client e server max 5MB.
  - **Vista Atleta**: aggiunto tab e pannello `SCHEDE` per la consultazione e download dei programmi assegnati dal coach.
  - Modale interattivo per la lettura completa a tutto schermo del programma e copia negli appunti.
- **Testing & Validazione**:
  - Creato test suite `tests/nestore-coach.test.js` con 7 test dedicati (41/41 test totali del progetto passati con successo).
- **Documentazione**:
  - Aggiornati `wiki/nestore_portal.md` (§8 e §9), `wiki/database_schema.md` (§7 e §8) e `wiki/log.md`.

---

## [2026-09-16] ingest | Scheda Atleta & Memoria Sintetica LLM (Modello Wiki Karpathy) - NESTORE
- **Database (`supabase/migration_nestore_v2_wiki.sql`)**:
  - Aggiunta colonna `altezza_cm` a `nestore_pesi_misure` e `nestore_preferenze`.
  - Creata tabella `public.nestore_scheda_atleta` con RLS abilitata (lettura propria e direttivo) e colonne `scheda_markdown`, `biometria`, `allenamento`, `nutrizione`, `versione`, `aggiornato_il`.
- **Backend AI Serverless (`api/nestore-chat.js`)**:
  - Implementata funzione esportata `calcolaSchedaAtleta(supabaseClient, utenteId)` che calcola età, sesso biologico (da CF), altezza, peso attuale, delta 30gg, BMI, BMR (Mifflin-St Jeor), TDEE stimato su frequenza settimanale, disciplina dominante, RPE medio e intake nutrizionale 30gg.
  - Sostituito il dump grezzo di 90 righe DB nel system prompt con la sola scheda sintetica Markdown e la working memory odierna (Zero PII: esclusione totale di nome, cognome, codice fiscale, indirizzo e recapiti).
  - Supportate azioni serverless dedicate: `save_height` e `recalculate_wiki`.
  - Trigger automatico e silente di ricalcolo scheda ad ogni salvataggio dati.
- **Frontend UI Portale (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Aggiunto tab e pannello SPA "SCHEDA AI" (`#nst-profilo-panel`) sia su desktop che su mobile tabs.
  - Mostrate card intuitive per Biometria & Metabolismo, Profilo Sportivo, Nutrizione & Target, con visualizzazione trasparente del Raw Markdown.
  - Banner discreto e modifica rapida per l'altezza in "PESO & MISURE" e nella scheda.
- **Testing & Documentazione**:
  - Aggiornati test in `tests/nestore-chat.test.js` e `tests/nestore-tabs.test.js` (34/34 test passati).
  - Documentato in `wiki/nestore_portal.md` (§7) e `wiki/database_schema.md` (§6).

---

## [2026-09-16] feature | Bacheca Record Personali (PR) All-Time e Rimozione Grafico Durata Allenamenti
- **Frontend UI & Layout (`portal/nestore.html`, `portal/nestore.css`)**:
  - Rimosso il grafico Chart.js a linee della durata delle sessioni dal pannello Allenamenti.
  - Aggiunta la sezione responsiva `.nst-pr-section` con griglia di card moderne `.nst-pr-grid` per i **Record Personali (All-Time)**.
  - Ciascuna card mostra il nome dell'esercizio normalizzato, il valore record in verde lime Orbitron (es. `110 KG`, `200 REP`), le serie/ripetizioni o l'indicazione di corpo libero, e la data del record.
  - I pulsanti di filtro temporale (`7G`, `14G`, `30G`, `ALL`) filtrano puntualmente la tabella "Storico Sessioni" sottostante, lasciando i Record Personali stabili su base All-Time.
- **Logica & Algoritmo PR (`portal/nestore.js`)**:
  - Implementata funzione `isBetterPerformance(candidate, currentBest)`: per esercizi con sovraccarico vince il peso maggiore (in caso di parità, le ripetizioni maggiori); per corpo libero vince il numero massimo di ripetizioni.
  - Implementato parser retroattivo `parseExercisesFromWorkout()` che supporta sia il JSON strutturato in `scheda_dati`, sia il parsing da note testuali libere (es. serie con carico `10x90kg`, multi-serie `3x10x180kg`, esclusioni serie fallite, elenchi corpo libero `50 pull, 100 push, 200 squat`).
  - Aggregatore all-time `calcolaRecordPersonali()` per raggruppare ed estrarre i massimali assoluti dell'atleta.
- **Backend Prompt AI (`api/nestore-chat.js`)**:
  - Aggiornato il system prompt e il template `json:extraction` affinché Google Gemini Flash popoli esplicitamente l'array `esercizi` (nome, peso_kg, ripetizioni, serie) nel campo `scheda_dati` ad ogni registrazione di allenamento.
- **Test & Validazione**: Creata suite `tests/workout-pr.test.js` (9 test) con esito 30/30 test totali superati.

---

## [2026-09-15] fix | Hotfix Limite Serverless Functions Vercel - Spostamento resend-mail in _utils (v1.05.34)
- **Backend (`api/_utils/resend-mail.js`)**:
  - Spostato `api/resend-mail.js` → `api/_utils/resend-mail.js`. Le cartelle prefissate da underscore (`_utils/`) non vengono compilate da Vercel come endpoint serverless, rispettando il limite di 12 funzioni del piano Hobby.
  - Aggiornati tutti i file che importano `sendEmail`: `api/cron-scadenze.js`, `api/otp-verify.js`, `api/validate.js`.
- Il conteggio delle Serverless Functions torna a **12/12** (entro il limite Hobby).
- **Global Bump**: Versionamento incrementato a `v1.05.34`.

---

## [2026-09-15] feat | Tracciamento Recupero Password, Generazione Link Diretti e Condivisione WhatsApp per il Direttivo (v1.05.33)
- **Database (`public.richieste_recupero_password`)**:
  - Creata nuova tabella dedicata al tracciamento delle procedure di "Password Dimenticata" (`id`, `email`, `stato`, `created_at`, `risolto_il`).
  - Implementate policy RLS sicure: inserimento pubblico/anonimo consentito, consultazione e gestione riservata al Direttivo (`BOARD_ROLES`), e auto-risoluzione per l'utente al completamento del reset.
- **Backend API (`api/admin-recovery-link.js`)**:
  - Nuovo endpoint serverless Vercel protetto da autenticazione JWT e verifica del ruolo direttivo.
  - Utilizza `supabaseAdmin.auth.admin.generateLink` con `type: 'recovery'` per generare un link di recovery sicuro e monouso, salvando l'azione nell'audit log.
- **Frontend Portale**:
  - `portal/forgot-password.js`: alla richiesta di reset password ordinaria, registra la pendenza nella tabella del database.
  - `portal/reset-password.js`: al completamento del cambio password (`updateUser`), contrassegna automaticamente la richiesta come `risolto`, eliminandola dalla vista del Direttivo.
  - `portal/dashboard.html` & `portal/dashboard.js`:
    - Aggiunta nuova sezione *"RICHIESTE RECUPERO PASSWORD"* nel tab Registro Approvazioni.
    - Mostra nome, cognome, email, telefono e orario della richiesta.
    - Pulsanti per **Copia Link Diretto**, **Invia su WhatsApp** (con messaggio precompilato pronto all'invio) e **Cestino / Archivia**.
    - Pulsante e campo **Link Rapido** per generare all'istante un link di accesso per qualsiasi email/tesserato.
- **Documentazione Wiki (`wiki/api_endpoints.md`, `wiki/log.md`)**:
  - Documentate le specifiche del nuovo endpoint e la relativa architettura di sicurezza.
- **Global Bump**: Versionamento incrementato a `v1.05.33`.

---

## [2026-09-11] fix | Bonifica Account Duplicato e Riallineamento Email Gaia Di Matteo (v1.05.32)
- **Database (`auth.users`, `auth.identities`, `public.utenti`, `public.vw_registrazioni_incomplete`)**:
  - Risolto il conflitto di account duplicato per la tesserata Gaia Di Matteo:
    - Eliminato l'account incompleto fantasma del 04/09/2026 (`c116676e-2a3f-4024-8df7-65a1da01624c`) generato da un tentativo di registrazione con errore di duplicazione CF.
    - Riallineata l'email dell'account attivo (`f3bcc7f6-3ad6-4da2-97b1-ec01be4b4cc0`) da `agaiadm81@gmail.com` (refuso storico importazione) alla corretta `gaiadm81@gmail.com` in modo sincronizzato su `auth.users`, `auth.identities` e `public.utenti`.
    - Rimossa la segnalazione orfana da `vw_registrazioni_incomplete`.
- **Diagnosi Documento d'Identità**:
  - Verificata l'assenza di documenti caricati su Supabase Storage (`tessere-sanitarie` / `documenti`).
  - Identificata la causa del blocco percepito: il widget di upload richiede obbligatoriamente la data di scadenza del documento; in sua assenza il form non invia la richiesta al server.

---

## [2026-09-11] fix & feat | Fix Selezione Certificati Medici in Vista SQL e Caselle Abbonamento nell'Header Atleta (v1.05.31)
- **Database (`public.vw_stato_atleta_corso`)**:
  - Risolto il bug di selezione nella subquery LATERAL sui certificati medici: introdotta prioritizzazione per stato di validazione (`VERDE` non scaduto > `VERDE` > `GIALLO` > `IN_ATTESA` > `ROSSO`) con tie-breaker su `data_scadenza DESC` e `created_at DESC`.
  - Risolto il falso positivo di allerta per Danilo Clementi e Adriano Mathlouthi, che possiedono certificati convalidati `VERDE` ma venivano erroneamente associati a vecchi record di seed o tentativi respinti.
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Spostate le caselle di controllo (`headerBoxesHtml`) direttamente nella barra principale dell'header della card atleta (`loadRegistroIscritti`), visibili a colpo d'occhio senza espandere la scheda.
  - **A RATE**: visualizzazione mesi solari con rate pagate `✓` e rate in attesa col numero del mese.
  - **UNICA RATA**: generazione automatica di tutte le caselle della durata del piano (1, 2, 3, 4, 6, 12 mesi) tutte spuntate verdi `✓` (saldo unico).
  - **CARNET INGRESSI**: visualizzazione degli ingressi totali con ingressi usati `✓` e casella successiva cliccabile `+` animata per obliterare la presenza direttamente dall'header con un singolo click.
  - La scheda espandibile conserva intatte tutte le altre informazioni (input per cambio piano abbonamento, data iscrizione, data picker scadenza con barra di avanzamento).

---

## [2026-09-11] feat | Numerazione Mesi Solari su Caselle Rate Abbonamento Corsi
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Aggiornato il rendering delle caselle delle rate per i piani `A RATE` nel registro atleti corso (`loadRegistroIscritti`).
  - Sostituito il numero sequenziale della rata con il **numero del mese solare reale** (calcolato con algoritmo circolare modulo 12 a partire dal mese di `data_inizio_corso` o `data_iscrizione`).
  - Le rate pagate mantengono il badge verde con segno di spunta `✓`, mentre le rate future mostrano il mese solare (es. `8, 9, 10, 11, 12, 1` per Danilo Clementi con semestre da agosto), fornendo a colpo d'occhio il mese di conclusione dell'abbonamento.
  - Arricchiti i tooltip al passaggio del mouse con il nome per esteso del mese (es. *"Rata 1/6 - Mese 8 (Agosto): Pagato"*, *"Rata 2/6 - Mese 9 (Settembre): In attesa di addebito"*).

---

## [2026-09-11] fix | Abilitazione Eventi Sottoscrizioni su Webhook Stripe e Riallineamento Rate Arretrate
- **Infrastruttura Stripe (`we_1TeENs7wrOk84bdxRdHZMAL4`)**:
  - Aggiornato l'endpoint webhook del portale aggiungendo gli eventi periodici di sottoscrizione mancanti: `invoice.paid`, `invoice.payment_failed` e `customer.subscription.deleted`.
  - Risolto il mancato recapito dei rinnovi mensili automatici a Vercel.
- **Database (`public.iscrizioni_eventi`, `public.ricevute_pagamenti`)**:
  - **Fabio Morganti** (`ef907d12-f7a1-437a-93ec-1f11bc038258`):
    - Aggiornate `rate_pagate = 2` (su 6).
    - Emessa ricevuta fiscale n. 169/2026 di €56,10 (data pagamento reale: 29/08/2026, Invoice `in_1U9gyb7wrOk84bdx19N6Ptm1`).
  - **Giulio De Vecchis** (`5a977105-71dd-41b4-8595-973016a0b6d9`):
    - Aggiornate `rate_pagate = 2` (su 12).
    - Emessa ricevuta fiscale n. 170/2026 di €51,00 (data pagamento reale: 06/09/2026, Invoice `in_1UChOq7wrOk84bdxISGJPa5k`).
  - Tracciati entrambi gli interventi nel registro audit (`public.registro_audit_operazioni`).

---

## [2026-09-11] fix | Rimozione FK Monolitica su Ricevute, Trigger Cross-Table e Regolarizzazione Iscrizione Strongman (v1.05.28)
- **Database (`supabase/migration_fix_ricevute_evento_fk.sql`)**:
  - Risolto il bug bloccante su `public.ricevute_pagamenti`: rimosso il vincolo FK rigido `ricevute_pagamenti_evento_id_fkey` che puntava esclusivamente ad `epika_eventi(id)` e causava il fallimento del webhook Stripe quando gli utenti acquistavano corsi societari (`public.eventi`).
  - Implementato trigger `BEFORE INSERT OR UPDATE` (`public.validate_ricevuta_evento_id()`) che garantisce validazione cross-table su `public.eventi` ed `public.epika_eventi`, preservando l'integrità referenziale.
  - Regolarizzata la posizione di Adriano Mathlouthi (pagamento 08/09/2026 per corso Strongman, subscription `sub_1UDOA97wrOk84bdxASDL60Sq`):
    - Creata iscrizione ufficiale in `public.iscrizioni_eventi` (Annuale a 12 rate, 1 rata pagata, IN_REGOLA).
    - Emessa ricevuta fiscale n. 168/2026 di €51,00 in `public.ricevute_pagamenti`.
    - Tracciato l'intervento manuale nel registro audit (`public.registro_audit_operazioni`).
- **Backend Webhook (`api/stripe-webhook.js`)**:
  - Sanitizzato `eventId` in `checkout.session.completed` per garantire l'invio di stringhe UUID a 36 caratteri o `null`.
- **Documentazione Wiki (`wiki/database_schema.md`, `wiki/log.md`)**:
  - Documentata l'architettura del nuovo trigger cross-table e la rimozione del vincolo obsoleto.
- **Global Bump**: Versionamento globale incrementato a `v1.05.28` tramite `npm run bump`.

---

## [2026-09-10] feature | Riprogettazione Tab Mobile Nestore a Più Righe (Text-Only)
- **Frontend Mobile UX (`portal/nestore.html`, `portal/nestore.css`)**:
  - Rimosso lo scorrimento orizzontale della barra tab mobile su schermi $\le 1024\text{px}$.
  - Implementato layout flexbox multi-riga senza icone grafiche:
    - **Riga 1**: `CHAT ASSISTANT AI` a larghezza intera (100%).
    - **Riga 2**: `PESO & MISURE` (50%) e `ALLENAMENTI` (50%).
    - **Riga 3**: `DIETA & MACRO` (50%) e `TIMER & TABATA` (50%).
  - Ottimizzazione responsive e padding dedicato per schermi ultra-compatti ($\le 380\text{px}$).
- **Test & Validazione**: Creato test dedicato `tests/nestore-tabs.test.js` (21/21 test totali superati).

---

## [2026-09-10] feature | Introduzione Cronometro, Tabata & Floating Dock Cross-Page in Nestore
- **Frontend Timer & Tabata (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Aggiunto il quinto pulsante "TIMER & TABATA" nella sidebar desktop di Nestore e "TIMER" nella tab bar mobile.
  - Implementato pannello dedicato a tutta larghezza con display gigante ad alta leggibilità, commutatore di modalità (Cronometro vs Tabata/Intervalli) e controlli tattili con feedback sonoro.
  - **Cronometro**:
    - Conteggio esatto al millisecondo basato su timestamp assoluti `Date.now()`.
    - Rilevazione e archivio dei Giri (Laps) con indicatore del giro migliore (`⚡`) e peggiore.
    - **Auto-Stop & Reset a 3 Ore**: Allo scadere di 3 ore (10.800.000 ms), il cronometro si ferma automaticamente, azzera i dati, emette un buzzer acustico prolungato e notifica con toast per sicurezza.
  - **Tabata & Interval Timer**:
    - State machine multi-fase (`PREP` $\rightarrow$ `WORK` $\rightarrow$ `REST` $\rightarrow$ cicli $\rightarrow$ `DONE`).
    - Configurazione interattiva di tempo preparazione, lavoro, recupero, rounds e sets con preset con un click (*Tabata 20/10*, *HIIT 30/15*, *EMOM 50/10*, *Forza 40/20*).
    - Countdown acustico con Web Audio API sintetico (beep a 3-2-1 secondi, work buzzer, rest buzzer e fanfara finale).
    - Tasto Salta Fase per passare istantaneamente allo step successivo.
- **Cross-Page Persistence & Mini-Widget (`portal/timer-dock.js`, `portal/dashboard.html`)**:
  - Sincronizzazione automatica bidirezionale tramite `localStorage` e listener `storage`.
  - Implementato modulo autonomo `timer-dock.js` incluso in `dashboard.html` che renderizza un mini-dock fluttuante in basso a destra quando un timer è attivo, consentendo di monitorare il tempo, mettere in pausa/riprendere e riaprire a tutto schermo anche navigando in altre pagine del portale.
- **Testing & Validazione**: Creata suite di test unitari `tests/timer-tabata.test.js` (11 test dedicati per calcoli temporali, auto-stop 3h, transizioni Tabata e persistenza; 18/18 test totali superati).

---

## [2026-09-10] ui_fix | Risoluzione Sbordamento Header Mobile e Rimozione Prefisso AREA (v1.05.25)
- **Frontend Dashboard (`portal/dashboard.html`, `portal/dashboard.js`)**:
  - **Rimozione Prefisso "AREA"**: Rimossa la parola "AREA" dal menu a tendina contestuale (`#context-switcher`) e dal badge statico (`#static-context-badge`), uniformando le voci in `DIRETTIVO`, `SOCIO`, `TESSERATO`, `ISTRUTTORE` e `VOLONTARIO` sia su desktop che su mobile.
  - **Ottimizzazione Gap Mobile**: Sostituito `gap-4` con `gap-2 sm:gap-4` nei contenitori flex sinistro e destro dell'header, recuperando oltre 20px di spazio orizzontale su schermi smartphone.
  - **Protezione Anti-Overflow**: Aggiunte classi responsive `max-w-[100px] sm:max-w-none truncate` al `<select>` per prevenire qualsiasi sbordamento orizzontale anche su schermi stretti (≤ 360px).
- **Versioning Globale**: Eseguito `npm run bump` con avanzamento globale a **v1.05.25** su 23 file.

---

## [2026-09-10] feature | Inversione Flusso Chat Nestore (Top-Down), Massimali e Paginazione Storico
- **Frontend Chat UX (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Invertito il layout della chat in paradigma Top-Down: barra di input e anteprima allegati posizionate fisse in alto direttamente sotto l'header.
  - Flusso messaggi invertito: i messaggi più recenti appaiono in cima subito sotto l'input, spingendo verso il basso la cronologia pregressa.
  - Scroll ancorato stabilmente a `scrollTop = 0`, azzerando la necessità di scorrere verso il basso per digitare o leggere le nuove risposte.
  - Implementato massimale di 1500 caratteri lato client con badge contatore dinamico `(X/1500)` e blocco invio in overflow.
  - Integrato il limite anche nella dettatura vocale con auto-troncamento a 1500 caratteri.
  - Implementata paginazione storico: caricamento iniziale dei 35 messaggi più recenti e pulsante in fondo alla lista (*"Carica messaggi precedenti"*) per recuperare blocchi di 20 messaggi a ritroso.
- **Backend AI (`api/nestore-chat.js`)**:
  - Aggiunta validazione di sicurezza sul payload `message`: rifiuto richieste superiori a 1500 caratteri con HTTP 400.
  - Risolto bug ordinamento cronologia per Gemini LLM: la query estrae ora i 20 messaggi più recenti in ordine decrescente e li inverte cronologicamente in-memory prima di costruire i turni per l'API.
- **Validazione & Test**: Aggiornata suite Vitest con mock Supabase e nuovi test di validazione caratteri (7/7 test passati).

---

## [2026-09-10] fix | Risoluzione Troncamento Token Gemini, Ripristino Grafico Nutrienti e Header Mobile Anti-Overflow
- **Backend AI (`api/nestore-chat.js`)**:
  - Diagnosticata e risolta la causa radice del troncamento risposte AI: con `maxOutputTokens: 1000`, il ragionamento interno (*thinking tokens*) di Gemini 2.5 Flash saturava ~889 token esaurendo il limite prima di completare il JSON di estrazione (`finishReason: MAX_TOKENS`).
  - Configurato `maxOutputTokens: 4096` e `thinkingConfig: { thinkingBudget: 1024 }`: garantiti oltre 3000 token effettivi alla risposta, azzerando qualsiasi rischio di troncamento (`finishReason: STOP`).
  - Implementato parser di estrazione resiliente con fallback di emergenza: qualsiasi blocco JSON parziale o non chiuso viene automaticamente rimosso dalla stringa visualizzata in chat (prevenendo la comparsa di codice grezzo all'utente) con algoritmo di riparazione e recupero payload.
  - Verificato il corretto salvataggio del pasto in database e l'aggiornamento real-time del grafico *Dieta & Macro (Kcal)*.
- **Frontend & Responsive UI (`portal/nestore.html`, `portal/nestore.css`)**:
  - Rimosso il prefisso superfluo "VISTA " dal menu selettore ruoli (`ATLETA`, `ALLENATORE`, `AMMINISTRATORE`).
  - Introdotto vincolo globale `overflow-x: hidden` e `max-width: 100vw` su `html, body, .nst-body, .nst-header`.
  - Ottimizzato il layout dell'header per smartphone ($\le 1024\text{px}$ e $\le 480\text{px}$): padding ridotto a `8px 12px` (e `6px 8px` su mobile piccolo), selettore compatto (`max-width: 110px/95px`) con text ellipsis, badge utente troncato elegantemente su schermi stretti e rimozione automatica badge corso/versione su display ultra-compatti per azzerare lo sbordamento laterale.
- **Validazione & Test**: Test Vitest 5/5 superati, test live Gemini con token usage validato empiricamente.

---

## [2026-09-09] fix | Risoluzione Duplicazione e Balbuzie Input Vocale Nestore (Opzione A)
- **Frontend Speech-to-Text (`portal/nestore.js`)**:
  - Risolto bug critico di duplicazione ricorsiva causato dal loop a indice zero su frammenti provvisori (`interimResults`).
  - Adottata **Opzione A**: impostato `speechRecognizer.interimResults = false` mantenendo `continuous = true`. Il browser elabora ed emette solo token definitivi e consolidati, azzerando le ripetizioni parziali in tempo reale.
  - Il loop di elaborazione in `onresult` parte ora rigorosamente da `event.resultIndex`.
  - Introdotto accumulatore di sessione `testoTrascrittoSessione` separato da `testoBaseInputVocale` con filtro anti-duplicazione dei chunk consecutivi identici (specifico per quirk Chrome Android).
- **Validazione & Test**: Tutti i test Vitest (5/5) passati.

---

## [2026-09-09] fix | Tono Diretto, Calcolo Calorie Pasti, Validazione Dati Incompleti e Dettatura Vocale Continua Nestore
- **Backend AI Prompt Engineering (`api/nestore-chat.js`)**:
  - Eliminati slogan motivazionali ed enfasi cheerleader (`Avanti tutta! 💪`, `Ottimo lavoro!`). Risposte di conferma conformate allo standard secco: `Registrato: [riepilogo sintetico del dato].`
  - Implementato il protocollo di validazione dati incompleti: se un alimento o ingrediente viene comunicato senza momento del pasto (colazione, pranzo, cena, snack), Nestore non salva un pasto parziale da poche calorie ma interroga l'atleta per completare le informazioni.
  - Implementato l'accumulo multi-turn del pasto: al completamento degli ingredienti, Nestore calcola l'apporto calorico e macro cumulativo sull'intero pasto, prevenendo registrazioni isolate e stime errate.
  - Inserita tabella standard di riferimento nutrizionale per alimenti comuni nel System Prompt (pane, uova, zucchine, pasta, carne, pesce, olio) e ridotta la temperatura di generazione a `0.2` per massima precisione deterministica.
- **Frontend Speech-to-Text (`portal/nestore.js`)**:
  - Impostato `speechRecognizer.continuous = true` per mantenere attivo l'ascolto vocale senza interruzioni premature dopo pause brevi.
  - Risolto il bug di cancellazione del testo: la nuova dettatura viene concatenata in coda al contenuto esistente della textarea (`testoBaseInputVocale`), consentendo registrazioni vocali multiple e modifiche miste testo/voce.
- **Validazione & Test**: Tutti i test unitari passano (5/5). Validazione empirica multi-turn con script di prova completata con successo.

---

## [2026-09-09] feature | Grafici Interattivi Chart.js e Filtri Temporali per Dashboard Nestore
- **Frontend UI & Grafici (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Integrata libreria vettoriale Chart.js v4 via CDN autorizzata in CSP (`cdn.jsdelivr.net`).
  - **Card 1 - Peso Corporeo & Misure**: Sostituiti i numeri statici con grafico multi-linea dinamico con doppio asse Y (Asse Sinistro: Peso in kg in Ciano Cyber; Asse Destro: Vita, Torace, Braccio in cm in Lime/Oro/Magenta) per visualizzare l'evoluzione corporea senza schiacciare le scale.
  - **Card 2 - Allenamenti & Frequenza**: Implementato grafico a linea/scatter di frequenza che traccia cronologicamente le sessioni svolte dall'atleta, evidenziando le date con punti illuminati e tooltip dettagliati (disciplina, durata e RPE).
  - **Card 3 - Dieta & Macro (Kcal Stacked)**: Realizzato grafico a colonne in pila (stacked bar chart) per data, dove ciascuna colonna giornaliera è composta da 3 segmenti energetici sovrapposti: Carboidrati (Ambra, x4 kcal), Proteine (Ciano, x4 kcal) e Grassi (Lime, x9 kcal), la cui somma costituisce l'apporto calorico totale della giornata conforme all'esempio Excel fornito dall'utente.
  - **Filtri Temporali Dinamici**: Aggiunti in cima a ciascuna card i chip di filtro orizzonte `[7G] [14G] [30G] [ALL]`, con valore predefinito impostato a 30 giorni.
- **Validazione**: Eseguiti test unitari Vitest (5/5 passing).

---

## [2026-09-08] feature | Memoria Conversazionale, Risoluzione Date Retroattive e Tab Switcher Mobile Nestore
- **Backend AI (`api/nestore-chat.js`)**:
  - Iniettata data odierna e data di ieri nel System Prompt con fuso orario italiano Europe/Rome.
  - Aggiunto caricamento esteso dello storico da database (ultimi 30 pesi, 30 workout e 30 pasti) per consentire a Nestore di rispondere a qualsiasi interrogazione sui dati storici dell'atleta.
  - Implementata cronologia chat multi-turn in formato alternato `user` / `model` conforme a Google Gemini API v1beta.
  - Campo `"data": "YYYY-MM-DD"` reso obbligatorio nel template `json:extraction` con risoluzione esplicita delle date relative ("ieri", "lunedì scorso", date specifiche).
- **Frontend UI & Responsive Mobile (`portal/nestore.html`, `portal/nestore.css`, `portal/nestore.js`)**:
  - Introdotto Tab Switcher Mobile (`#nst-mobile-tabs`) sticky in testa alla pagina su schermi <= 1024px, con toggle rapido tra `CHAT ASSISTANT` e `DASHBOARD KPI`.
  - Su mobile la Chat è ora posizionata in primo piano all'accesso a tutta altezza (`calc(100dvh - 145px)`), mentre le card della dashboard sono consultabili nel tab dedicato senza allungare la pagina.
- **Validazione & Test**:
  - Test unitari passati 5/5 con Vitest. Test di estrazione date retroattive e interrogazioni storiche validati con esito positivo.

---

## [2026-09-08] fix | Aggiornamento Modello Google Gemini a 2.5-Flash per Nestore AI
- **Backend API (`api/nestore-chat.js`)**:
  - Aggiornato l'endpoint di invocazione Google Generative Language API migrando dal modello deprecato `gemini-1.5-flash` (404) al modello stabile ad alte prestazioni `gemini-2.5-flash`.
  - Risolto l'errore 500 generato dalla mancata configurazione della variabile d'ambiente `GEMINI_API_KEY` su Vercel e dal modello legacy.
- **Validazione & Test (`tests/nestore-chat.test.js`)**:
  - Eseguiti tutti i test unitari con Vitest con esito 100% positivo (5/5 passing).

---

## [2026-09-08] ingest | Portale NESTORE & Assistente AI Sportivo-Nutrizionale
- **Database & Storicizzazione (`supabase/migration_nestore_v1.sql`)**:
  - Create 5 tabelle con Row Level Security (RLS) attiva: `nestore_preferenze`, `nestore_pesi_misure`, `nestore_allenamenti`, `nestore_pasti`, `nestore_chat_messaggi`.
  - Storicizzazione conforme a `.agents/AGENTS.md` (append-only con flag `attivo = true` e date rilevazione).
- **Dashboard Adrenalina (`portal/dashboard.html` & `portal/dashboard.js`)**:
  - Aggiunto pulsante `#tab-btn-user-nestore` nella sidebar e nel menu mobile con branding Ciano/Lime dal logo ufficiale Nestore.
  - Implementato gatekeeping con modale informativa `#nestore-access-modal`: accesso consentito solo a tesserati approvati con corsi continuativi attivi (`iscrizioni_eventi.data_scadenza_corso >= OGGI` o ingressi residui carnet).
- **Portale Indipendente NESTORE (`portal/nestore.html`, `portal/nestore.js`, `portal/nestore.css`)**:
  - Sub-app a tutto schermo con Cyber-Bio theme (`#060c18`, `#00e5ff`, `#76ff03`).
  - Dashboard KPI reattiva (peso corporeo con delta $\Delta$, ultimi workout, calorie e macronutrienti odierni).
  - Chat assistente multimodale con riconoscimento vocale in tempo reale (Web Speech API) e upload foto compresse.
  - Toggle impostazioni per scelta utente tra salvataggio diretto o controllo preventivo con card di conferma interattiva.
- **Backend AI Serverless (`api/nestore-chat.js`)**:
  - Endpoint Vercel protetto con Bearer JWT verification (`SECURITY.md §1.1`), rate limiting (60 req/h) e integrazione con Google Gemini API (`gemini-1.5-flash`).
  - Estrazione strutturata automatica dei dati (`json:extraction`) per pasti, pesi e allenamenti.
- **Wiki Documentation (`wiki/nestore_portal.md`, `wiki/index.md`)**:
  - Documentati flussi, permessi, schema e architettura del nuovo modulo.

---

## [2026-08-31] fix | Logica Inversa Presenze Campo Marzio (Opt-Out) & Sincronizzazione Iscrizioni (v1.05.13)
- **Database & Trigger (`supabase/migration_epika_sync_abilitazioni_cm.sql`)**:
  - Aggiornata la trigger function `epika_trg_sync_scadenza_abilitazioni()` con logica inversa (Opt-Out): tutti gli iscritti a Campo Marzio (`epika_iscrizioni_eventi`) sono considerati presenti estendendo l'abilitazione al `31/12/YYYY`, a meno che non sia registrata un'esplicita defezione (`presente = FALSE`) in `epika_presenze_eventi`.
  - Agganciato il trigger sia a `epika_presenze_eventi` (`trg_sync_abilitazioni_scadenza`) sia a `epika_iscrizioni_eventi` (`trg_sync_abilitazioni_iscrizioni`).
  - Eseguito backfill retroattivo su `epika_scab_abilitazioni`, estendendo la data al `31/12/2026` per tutti gli 80 atleti iscritti a Campo Marzio 2026.
- **Frontend UI (`portal/epika.js`)**:
  - In `mostraPannelloPresenze()`: impostato lo stato iniziale di presenza in modalità Opt-Out (`presenzeMappa[utente_id] !== false`), mostrando tutti gli atleti con il pulsante verde `PRESENTE` di default e consentendo all'amministratore di cliccare per segnare le defezioni come `ASSENTE`.
- **Global Bump**: Versionamento globale incrementato a `v1.05.13` tramite `npm run bump`.

---

## [2026-08-31] feature | Sincronizzazione Realtime Scadenze Abilitazioni SCAB & Rollover Anno (v1.05.11)
- **Database & Trigger (`supabase/migration_epika_sync_abilitazioni_cm.sql`)**:
  - Implementata la trigger function `epika_trg_sync_scadenza_abilitazioni()` su `public.epika_presenze_eventi` (AFTER INSERT, UPDATE OF `presente`, DELETE).
  - All'aggiornamento di una presenza ad un evento `campo_marzio`, il sistema ricalcola in tempo reale la scadenza dell'abilitazione per l'atleta (`31/12/YYYY` se presente, `31/08/YYYY` se assente) aggiornando `epika_scab_abilitazioni`.
  - Eseguito backfill retroattivo per allineare tutte le scadenze e presenze pregresse a Campo Marzio 2026.
- **Frontend UI & Visualizzazione (`portal/epika.js`)**:
  - Aggiornato `renderAbilitazioneAtleta()` per mostrare la data puntuale di scadenza dell'abilitazione (`Validazione attiva fino al 31/12/YYYY (Partecipante a Campo Marzio YYYY)` o `Validazione attiva fino al 31/08/YYYY`).
  - Formattato l'anno abilitativo nel formato a cavallo `(Y-1)/Y` sia nel badge principale che nei messaggi di rinnovo e nelle dashboard Allenatore, Allievo e Validatore.
- **Global Bump**: Versionamento globale incrementato a `v1.05.11` tramite `npm run bump`.

---

## [2026-08-31] feature | Dashboard Contabilità per Corso (v1.05.10)
- **Backend Webhook (`api/stripe-webhook.js`)**:
  - Garantito il popolamento esplicito della colonna `evento_id: eventId || null` nella tabella `public.ricevute_pagamenti` ad ogni checkout completato (`checkout.session.completed`).
- **Frontend UI & Dashboard (`portal/dashboard.html`, `portal/dashboard.js`)**:
  - Inserito il pulsante `Contabilità` nella tabella corsi dell'Admin (`loadGestioneCorsi`).
  - Creata la scheda a tutta larghezza `#admin-widget-corso-contabilita` con header personalizzato, selettore dell'anno solare e pulsante di ritorno.
  - Implementate le KPI cards: Totale Incassato Annuale, Incasso Mese Corrente e Totale Transazioni.
  - Implementata la griglia di andamento mese per mese (12 mesi) con totale incassi e numero di ricevute registrate.
  - Implementata la tabella dettagliata di tutte le ricevute del corso (`loadDatiContabilitaCorso`) con link per visualizzare/stampare ogni ricevuta (`stampaRicevuta`).
- **Documentazione Wiki (`wiki/portal_dashboard.md`, `wiki/log.md`)**:
  - Documentata la nuova sezione di Contabilità Corsi per il Direttivo.
- **Global Bump**: Versionamento globale incrementato a `v1.05.10` tramite `npm run bump`.

---

## [2026-08-31] fix | Risoluzione SyntaxError Onclick Tabelle Corsi Admin e Istruttore (v1.05.09)
- **Frontend (`portal/dashboard.js`)**:
  - Risolto il crash JavaScript (`Uncaught SyntaxError: Invalid or unexpected token`) generato dal rendering HTML dei corsi continuativi/H24 (`<span>` con attributi a doppi apici) iniettato direttamente nell'attributo `onclick` dei pulsanti "Partecipanti" e "Apri Registro".
  - Separate rigorosamente la stringa pura (`orariStrText`) passata ai parametri funzione (`openRegistroDaAdmin`, `openRegistroCorso`) dalla stringa formattata HTML (`orariStrHtml`) renderizzata a livello di cella tabella e card.
- **Global Bump**: Versionamento globale incrementato a `v1.05.09` tramite `npm run bump`.

---

## [2026-08-31] feature | Sistema Promo Bundle Ibrido+SCAB e Carnet Ingressi SCAB (v1.05.08)
- **Database (Supabase `zpategmkelqmexetpaot`)**:
  - Estesa la tabella `public.iscrizioni_eventi` con le colonne `ingressi_totali`, `ingressi_usati`, `iscrizione_promo_padre_id` e `tipo_iscrizione`.
  - Configurato il corso SCAB con piani Trimestre (€90), Semestre (€150), Annuale (€240), Carnet 8 Ingressi (€55) e Carnet 4 Ingressi (€30, con vincolo stagionale Maggio).
  - Ricreata la vista `public.vw_stato_atleta_corso` per esporre i campi carnet e promozionali.
- **Backend Checkout & Webhook (`api/create-checkout-session.js`, `api/stripe-webhook.js`)**:
  - `create-checkout-session.js`: blocco server-side per il carnet 4 ingressi prima del 1° Maggio, calcolo scadenza carnet fissa al 31/07 e passaggio metadati arricchiti per bundle e tipologia carnet.
  - `stripe-webhook.js`: all'evento `checkout.session.completed`, creazione automatica dell'iscrizione SCAB gratuita (`PROMO_BUNDLE`) per chi acquista Ibrido con abbonamento Trimestrale, Semestrale o Annuale; sincronizzazione automatica dello stato su mancato pagamento (`invoice.payment_failed` $\rightarrow$ sospensione collegata) o cancellazione abbonamento (`customer.subscription.deleted`).
- **Frontend (`portal/dashboard.js`)**:
  - `loadUserEventi()` / `aggiornaPrezzoCard()`: badge dinamico `🎁 CORSO SCAB COMPRESO` nella card Ibrido quando selezionato Trimestre/Semestre/Annuale; disabilitazione dell'opzione 4 Ingressi nei mesi antecedenti a Maggio; badge `🎁 COMPRESO CON IBRIDO` e contatore ingressi nel pannello iscrizioni utente.
  - `loadRegistroIscritti()`: visualizzazione carnet ingressi con badge di stato, contatore ingressi rimanenti e pulsante `[-1 SCALA INGRESSO]` con handler `scalaIngresso()` che aggiorna il DB e registra la presenza in `presenze_eventi`.
- **Global Bump**: Versionamento globale incrementato a `v1.05.08` tramite `npm run bump`.

---

## [2026-08-31] fix | Risoluzione Vincolo data_evento Nullable per Corsi H24 e Gestione Orari (v1.05.07)
- **Database (Supabase `zpategmkelqmexetpaot`)**:
  - Applicato `ALTER TABLE public.eventi ALTER COLUMN data_evento DROP NOT NULL;` per consentire ai corsi a fruizione continuativa/H24 (es. *Ibrido*) o con programmazione settimanale di avere `data_evento = NULL`, risolvendo l'errore PostgREST `400 Bad Request` in salvataggio/modifica.
- **Frontend (`portal/dashboard.js`)**:
  - Aggiunto helper protetto `formatDate()` per formattare le date in formato `it-IT` evitando il parsing errato di `null` (che produceva 01/01/1970).
  - In `loadGestioneCorsi()`: visualizzazione dinamica del badge `ACCESSO H24 / CONTINUATIVO` nella colonna orari/giornate per i corsi privi di orario fisso (anziché il trattino vuoto `-`).
  - In `loadUserEventi()` (Catalogo e Iscrizioni attive): gestione intelligente delle date/orari, mostrando orari settimanali o badge `ACCESSO H24 / CONTINUATIVO` per i corsi e formattando in sicurezza le date degli eventi singoli/multigiornata.
- **Documentazione (`wiki/database_schema.md`)**:
  - Aggiornata la documentazione della tabella `public.eventi` riflettendo la natura `nullable` di `data_evento`.
- **Global Bump**: Versionamento globale incrementato a `v1.05.07` tramite `npm run bump`.

---

## [2026-08-27] feature | Legenda Nodi Interattiva e Selettore Spaziatura Grafo Relazionale (v1.05.04)
- **Frontend UI (`portal/epika.html`)**:
  - Inserito lo slider `📏 Spazio` (`#epk-network-spacing`, range 30-220, default 80) nella barra comandi del grafo per regolare la distanza e la repulsione tra i nodi in tempo reale.
  - Trasformate le 8 voci della legenda cromatica in pulsanti-pillola interattivi con feedback visivo di stato (opacità 100% / 35% con bordo tratteggiato) e click handler `toggleLegendaCategoria()`.
- **Frontend JS (`portal/epika.js`)**:
  - Implementata la funzione `cambiaSpaziaturaNodi(val)` che modifica dinamicamente le forze fisiche native D3 (`d3Force('charge')` e `d3Force('link')`) e riscalda la simulazione con `d3ReheatSimulation()`.
  - Implementato il `Set` globale `epikaGraphLegendaAttiva` con tutte le 8 categorie attive di default.
  - Integrata la funzione `toggleLegendaCategoria(btn, cat)` e aggiornata la logica di `filtraGrafoNetwork()` per combinare dinamicamente il filtro a tendina con il set di categorie attive della legenda, filtrando contestualmente gli archi orfani per la massima robustezza.

## [2026-08-27] fix | Risoluzione Crash Grafo Relazionale Force-Graph (v1.05.03)
- **Frontend JS (`portal/epika.js`)**:
  - Rimossa la colonna inesistente `citta` dalla query `select('id, nome, tipo, attivo')` su `epika_scab_strutture`, eliminando l'errore PostgREST `400 Bad Request`.
  - Rimossi i richiami non supportati a `epikaGraphInstance.refresh()` che provocavano `TypeError: epikaGraphInstance.refresh is not a function` mandando in blocco il loop di eventi del canvas su hover e click.
  - Corretta la gestione del Set di highlighting (`epikaGraphHighlightNodes`) per utilizzare gli ID stringa (`node.id`), assicurando l'illuminazione istantanea del nodo selezionato e di tutti i suoi vicini diretti (allievi, maestri, gruppi) con opacità 100% ed effetto glow.

## [2026-08-27] feature | Sostituzione Organigramma Mermaid con Grafo Relazionale Dinamico Force-Graph (Dash Generale)
- **Frontend UI (`portal/epika.html`)**:
  - Sostituito lo script Mermaid.js con `force-graph` via CDN.
  - Ridisegnata la tab **Dash Generale** con la nuova interfaccia per il grafo dinamico relazionale:
    - Selettore filtri dinamici rapido (`🌐 Vista Globale`, `🏛️ Solo Direttivi`, `⚔️ Solo Rete SCAB`, `🛡️ Solo Gruppi Storici`, `⚔️ Solo Combattenti`, `📜 Solo Non Combattenti`).
    - Campo di ricerca rapida con auto-focus e zoom sul nodo.
    - Pulsanti `🎯 Centra` e `⏸️ Pausa/Riprendi` simulazione fisica.
    - Barra legenda cromatica per il riconoscimento immediato delle tipologie di nodo.
    - Container Canvas ad alta risoluzione con tooltip flottante contestuale e inspector laterale a comparsa al click del nodo.
- **Frontend JS (`portal/epika.js`)**:
  - Implementata la funzione `renderOrganigrammaNetwork()` con caricamento parallelo (`Promise.all`) da Supabase di: `epika_gruppi_lavoro`, `epika_gruppi_storici`, `epika_profili`, `epika_opzioni`, `epika_scab_strutture`, `epika_scab_abbinamenti`, `epika_scab_abilitazioni`, `epika_campioni_scab`.
  - Mappatura completa e multidirezionale di tutte le relazioni (Direttivo Supremo $\rightarrow$ Sottodirettivi $\rightarrow$ Membri; Strutture SCAB $\rightarrow$ Staff Tecnico $\rightarrow$ Allievi $\rightarrow$ Atleti; Gruppi Storici $\rightarrow$ Capi/Vice $\rightarrow$ Guerrieri e Non Combattenti).
  - Rendering custom su Canvas con forme differenziate (esagoni, scudi, quadrati, cerchi), scale gerarchiche, etichette anti-aliasing con contorno e gestione hover con effetto glow e dimming dei nodi non correlati.
  - Gestione interattività avanzata: `filtraGrafoNetwork`, `cercaNelGrafoNetwork`, `resetGrafoNetworkZoom`, `toggleFisicaNetwork`, `handleNodeHover`, `handleNodeClick`.
  - Aggiunto listener di resize per adattare dinamicamente il canvas alle dimensioni del viewport.
- **Wiki**: Aggiornata la documentazione architetturale in `wiki/epika_portal.md`.

## [2026-08-27] feature | Modifica Nome Storico in Scheda Personaggio con Unicità, Suggerimenti Tematici e Storicizzazione Audit (v1.05.00)
- **Frontend UI (`portal/epika.html`)**:
  - Inserito il campo di input `Nome Storico *` (`#edit-nome-storico`) come primo elemento nel modale `MODIFICA SCHEDA PERSONAGGIO` con vincolo `maxlength="40"`, uppercase automatico e box feedback live (`#edit-nome-storico-feedback`).
- **Frontend JS (`portal/epika.js`)**:
  - Implementata la funzione `onEditNomeBattagliaInput` con debounce a 350ms per verifica live di disponibilità del nome inserito.
  - Implementata `generaSuggerimentiNome` con varianti libere ed epiteti storici tematici (es. `IL FORTE`, `L'INVITTO`, `IL MAGNO`, `IL LUPO`, `MINOR`, ecc.) cliccabili per auto-compilazione istantanea.
  - Aggiornata `salvaModificheProfilo`: validazione pre-salvataggio di unicità e lunghezza (max 40 caratteri), no-op check integrato e inclusione di `nome_di_battaglia` nel payload di update su `epika_profili`.
  - Gestione graceful dell'errore PostgreSQL `23505` (unique violation) in caso di race condition.
- **Database (`Supabase`)**:
  - Creata ed eseguita la migrazione `supabase/migration_epika_nome_battaglia_unique.sql`:
    - Aggiunto vincolo `CHECK (nome_di_battaglia IS NULL OR char_length(nome_di_battaglia) <= 40)`.
    - Creato indice `CREATE UNIQUE INDEX epika_profili_nome_battaglia_unique ON public.epika_profili (UPPER(nome_di_battaglia)) WHERE nome_di_battaglia IS NOT NULL`.
    - Aggiornata la funzione trigger `trg_epika_log_profilo_modifiche()` per intercettare e registrare automaticamente nel registro audit `epika_registro_modifiche_profilo` ogni variazione del `Nome Storico` (`campo = 'Nome Storico'`).
    - Aggiornata `check_epika_tessera_ruolo()` per validare la tessera atleta solo in caso di cambio a ruolo `combattente`.
- **Wiki**: Aggiornata la documentazione di `epika_profili` e `epika_registro_modifiche_profilo` in `wiki/epika_portal.md`.

## [2026-08-27] fix | Fonte di Verità Atleti Allievo Allenatore tramite epika_scab_abilitazioni (v1.04.99)
- **Frontend JS (`portal/epika.js`)**:
  - In `renderTabellaRichiamiScab`: integrata la fetch di `public.epika_scab_abilitazioni` (`profilo_id, allievo_opzione_id`) nel `Promise.all` iniziale.
  - Costruita la mappa `allievoAtletiMap` basata su `epika_scab_abilitazioni.allievo_opzione_id`, unica fonte di verità attendibile per gli atleti seguiti dagli Allievi Allenatori (dato che `epika_profili.allenatore_id` punta al Maestro responsabile).
  - Collegato correttamente **Samuele** (`allievo_opzione_id = 30`) a **Bran**, ripristinando la visibilità del suo richiamo sotto Bran, ed escludendo gli allievi diretti di Minor (**Umbertone**, **Robert**).
  - Confermato che **Minor** continua a supervisionare tutti gli atleti della palestra (Umbertone, Robert, Samuele e Bran stesso).
- **Versionamento**: Eseguito `npm run bump` (➡️ `v1.04.99`).

## [2026-08-27] fix | Gerarchia Attribuzione Atleti Allievo Allenatore in Registro Richiami SCAB (v1.04.98)
- **Frontend JS (`portal/epika.js`)**:
  - Corretta la funzione `renderTabellaRichiamiScab`: per i membri dello staff con tipo `scab_allievo_allenatore` (es. Bran), la lista degli atleti supervisionati considera ora esclusivamente gli atleti che hanno scelto direttamente quell'Allievo Allenatore nel proprio profilo (`coachDirectAthletes[sid]`).
  - Eliminata la risalita errata al Maestro (`getAtletiForCoach(cid)`) per gli allievi allenatori, che attribuiva erroneamente all'allievo tutti gli atleti del proprio allenatore referente (es. Umbertone a Bran).
  - Confermato che l'Allievo Allenatore (in quanto atleta) e tutti i suoi atleti continuano ad essere supervisionati e conteggiati sotto l'Allenatore Responsabile (Minor).
- **Versionamento**: Eseguito `npm run bump` (➡️ `v1.04.98`).

## [2026-08-27] feature | Ottimizzazioni UI/UX Registro Richiami/Encomi (Filtri Riepiloghi & Text Clamping)
- **Frontend UI (`portal/epika.html`)**:
  - Rimossa la card KPI `🏛️ Gruppo più Riconosciuto` per pulizia visiva e riallineamento ottimale della griglia a 3 indicatori (Totale Encomi, Richiami Attivi, Atleti Coinvolti).
  - Aggiunti selettori a discesa indipendenti per `Evento` e `Anno` sia nella sezione `🏛️ Riepilogo per Gruppo` che in `🥋 Staff Tecnico SCAB`.
- **CSS Styling (`portal/epika.css`)**:
  - Introdotta la classe `.epk-re-text-clamp` con `-webkit-line-clamp: 3` e cursore pointer per troncare motivazioni e note direttivo su massimo 3 righe con effetto hover soft.
  - Introdotta la classe `.epk-re-text-clamp.epk-re-text-expanded` per espandere/collassare l'intero testo tramite click.
- **Logica Frontend (`portal/epika.js`)**:
  - Applicato il text clamping interattivo alle colonne Motivazione e Note Direttivo sia nella tabella principale del Registro Generale sia nelle sotto-tabelle accordion di Gruppi e SCAB.
  - Aggiornata la funzione `popolaFiltriRichiamiEncomi()` per alimentare dinamicamente i filtri Evento e Anno dei sub-tab.
  - Implementata la logica di pre-filtraggio in memoria in `renderReRiepilogoGruppi()` e `renderReRiepilogoScab()` in modo che i conteggi e le righe espanse riflettano accuratamente l'evento e l'anno selezionati.
- **Validazione**: Validata la sintassi con `node -c portal/epika.js` con esito positivo (0 errori).

## [2026-08-26] feature | Viste Sub-Tabs Registro Richiami/Encomi e Risoluzione Gerarchie SCAB
- **Frontend UI (`portal/epika.html`)**:
  - Impostato il tipo di provvedimento default su `Richiamo` nel modale `#re-modale` (inversione da Encomio a Richiamo).
  - Aggiunti 3 Sub-Tabs dedicati nella dashboard del Registro Richiami ed Encomi (`#epk-adm-tab-richiami-encomi`):
    1. `📋 Registro Generale`: Elenco tabellare filtrabile per tipo, gruppo, evento e anno con badge di gravità e soft-delete.
    2. `🏛️ Riepilogo per Gruppo`: Tabella aggregata per gruppo storico con conteggio atleti, totale richiami e totale encomi, dotata di accordion espandibile con i dettagli dei provvedimenti.
    3. `🥋 Staff Tecnico SCAB`: Tabella aggregata per Validatori, Allenatori e Allievi Allenatori con conteggio atleti assegnati e relativi provvedimenti disciplinari/onorifici, dotata di accordion espandibile.
- **Logica Frontend (`portal/epika.js`)**:
  - Aggiornata la funzione `renderRichiamiEncomiDashboard()` per includere `allenatore_id` nella cache dei profili atleta.
  - Implementate le funzioni `switchReTab(subTab)`, `toggleReAccordion(rowId, btn)`, `renderReRiepilogoGruppi()` e `renderReRiepilogoScab()`.
  - Risoluzione gerarchica SCAB ad alte prestazioni in memoria (senza chiamate asincrone N+1 al DB) combinando `epika_opzioni`, `epika_scab_abbinamenti` e `epika_profili`.
- **Validazione**: Validata la sintassi tramite `node -c portal/epika.js` con esito positivo.

## [2026-08-26] feature | Allineamento Contabilità Generale & Prima Nota Unificata
- **Database (Supabase)**:
  - Applicata migrazione `supabase/migration_epika_contabilita_generale.sql` che rende `evento_id` NULLABLE nella tabella `public.epika_contabilita_eventi`.
  - In questo modo la tabella supporta sia i movimenti legati a singoli eventi, sia i movimenti di cassa/banca generali dell'associazione EPIKA (`evento_id IS NULL`).
- **Frontend UI (`portal/epika.html`)**:
  - Rimosso il vecchio modale legacy `#cnt-modal-dettaglio`.
  - Aggiornati i modali di inserimento fast-entry `#cnt-modal-incasso` e `#cnt-modal-spesa` per supportare sia la registrazione su eventi specifici che entrate/uscite Generali EPIKA.
  - Canali di pagamento standardizzati su `cassa` e `banca`.
- **Logica Frontend (`portal/epika.js`)**:
  - Refactoring completo di `renderContabilitaAdmin()`, `applicaFiltriContabilita()`, `salvaIncassoManuale()`, `salvaNuovaSpesa()` ed `esportaCSVContabilita()`.
  - Aggregazione diretta da `epika_contabilita_eventi` ed `epika_iscrizioni_eventi`, eliminando le query a tabelle legacy.
  - Il pulsante `DETTAGLIO` della tabella generale apre direttamente il nuovo pannello a drawer `mostraPannelloContabilita(eventoId, ...)` garantendo perfetta coerenza.
  - Aggiunta riga di riepilogo `SPESE & INCASSI GENERALI EPIKA` nella tabella e inclusione nei KPI globali.
- **Validazione**: Eseguito `node --check portal/epika.js` con 0 errori.

## [2026-08-26] feature | Modulo Contabilità Eventi & Prima Nota Finanziaria
- **Database (Supabase)**:
  - Creata la tabella `public.epika_contabilita_eventi` (`id`, `evento_id`, `tipo_movimento`, `voce`, `quantita`, `importo_unitario`, `metodo_pagamento`, `data_movimento`, `note`, `creato_da`, `attivo`, timestamps).
  - Configurate policy RLS blindate e protette sia con `USING` che con `WITH CHECK`, riservate esclusivamente ad Admin Epika o Presidente (nessun accesso pubblico o in sola lettura).
- **Frontend UI (`portal/epika.html`)**:
  - Inserito il pannello `#adm-contabilita-evento-panel` con 4 card KPI (Totale Incassato, Totale Spese, Utile Netto, Saldi Cassa/Banca).
  - Aggiunto form fast-entry per registrare spese ed entrate extra (Data, Tipo, Voce, Q.tà, Importo, Canale Cassa/Banca, Note).
  - Tabella della prima nota con riga fissa automatica per l'incasso aggregato degli iscritti e righe per i movimenti manuali con soft-delete.
- **Logica Frontend (`portal/epika.js`)**:
  - Aggiunto pulsante `💰 CONTABILITÀ` nella card evento per gli amministratori (`!isReadOnly()`).
  - Implementate le funzioni `mostraPannelloContabilita()`, `caricaDatiContabilita()`, `salvaMovimentoContabile()`, `eliminaMovimentoContabile()` ed `esportaContabilitaCSV()`.
  - Calcolo automatico della quota iscritti (`iscritti_count * costo_evento` su canale Banca) e riconciliazione automatica con saldi Cassa e Banca.
- **Test e Validazione**:
  - Eseguito `node -c portal/epika.js` con esito positivo (0 errori).
  - Validati i calcoli e le formule di bilancio tramite script di test sandbox `scratch/test_contabilita_aggregazione.js`.

## [2026-08-25] feature | Medagliere e Rango a Elenco Cronologico & Gestione Palmarès Storico Atleti
- **Database (Supabase)**:
  - Creata la tabella `public.epika_palmares_atleti` (id, atleta_id, anno, tipo, titolo_evento, posizione, dettagli, attivo, timestamps) con indici dedicati e policy RLS (SELECT pubblica ad authenticated, INSERT/UPDATE/DELETE protette con USING e WITH CHECK per Admin Epika / Presidente).
  - Inserito seed iniziale per i tornei storici SCAB di Valerio Mannocchi (MINOR).
- **Frontend UI (`portal/epika.html`)**:
  - Nel box "MEDAGLIERE E RANGO", sostituite le 3 card numeriche con l'elenco cronologico a scorrimento `#epk-medagliere-timeline-list`.
  - Aggiunto il sotto-tab "Palmarès & Tornei Storici" nel Tab SCAB dell'Admin (`#scab-panel-palmares` e pulsante `#scab-tab-btn-palmares`) con form fast-entry per l'inserimento e la gestione dei tornei passati e riconoscimenti di qualsiasi atleta.
- **Logica Frontend (`portal/epika.js`)**:
  - Implementata la funzione centralizzata `caricaMedagliereTimeline(atletaId)` che aggrega in parallelo le 4 fonti storiche (Primo Anno in Epika, Palmarès Tornei passati, Albo d'Oro Campioni SCAB, Storico Partecipazioni/Esiti Campo Marzio), ordinandole in sequenza cronologica crescente con icone e badge tematici.
  - Implementate le funzioni di amministrazione rapida: `caricaPalmaresAdmin()`, `renderListaPalmaresAdmin()`, `filtraPalmaresAdmin()`, `salvaPalmaresAtleta()`, `rimuoviPalmaresAtleta()`.
  - Applicato HTML escaping rigoroso (`escapeHtml`) a tutela da attacchi XSS (SECURITY.md).
- **Test e Validazione**: Eseguito test automatizzato in sandbox `scratch/test_palmares_timeline.js` con riscontro perfetto dell'ordine e della formattazione.

## [2026-08-25] feature | Propagazione Esiti, Partecipazioni e Palmarès Campo Marzio
- **Frontend UI (`portal/epika.html`)**:
  - Nel box "MEDAGLIERE E RANGO", estesa la griglia a 3 colonne inserendo il contatore `🏆 CAMPI MARZIO VINTI` (`#epk-stat-cm-vinti`).
  - Aggiunta la card `#epk-atleta-palmares-card` ("🏆 PALMARÈS & STORICO CAMPI MARZIO") nella Scheda Personaggio dell'atleta.
  - Aggiunta la sezione `#epk-eventi-passati-card` ("⚔️ CAMPI MARZIO CONCLUSI") nella lista eventi con badge dei trionfatori.
  - Riconvertito il segnaposto nei modali Dettaglio Gruppo Admin e Area Capogruppo con `#det-cm-storico-lista` e `#capo-cm-storico-lista`.
- **Logica Frontend & Sicurezza (`portal/epika.js`)**:
  - Implementata la funzione centralizzata `caricaStoricoCampoMarzio(filtroTipo, filtroId)` per aggregare e calcolare reattivamente partecipazioni, vittorie, sconfitte e pareggi per gruppi storici e per atleti (gestendo sia membri di gruppo congelati in `epika_iscrizioni_eventi.gruppo_storico_id` che mercenari in `assegnazione_mercenari`).
  - Implementata `renderTabellaStoricoCampoMarzio(lista, tipo)` con sanificazione XSS sicura preventiva.
  - Integrato il rendering dinamico dello storico in `apriDettaglioGruppoAdmin()`, `caricaDettagliCapogruppo()`, `caricaStatistiche()` e `caricaEventiDisponibili()` (tramite `caricaEventiPassatiConclusi()`).
- **Fix PostgREST Embed**: Corretta la sintassi del join su `epika_profili` in `renderRichiamiEncomiDashboard()` specificando l'hint foreign key `!gruppo_storico_id` per disambiguare le 2 FK verso `epika_gruppi_storici`. Aggiunto blocco di gestione errore esplicito `if (reRes.error) throw reRes.error;`.
- **Frontend HTML (`portal/epika.html`)**: Inserito il pannello `#adm-richiami-evento-panel` integrato nell'architettura dei sotto-pannelli di gestione eventi (con KPI Encomi/Richiami evento, pulsante di registrazione e tabella con azioni).
- **Frontend JS (`portal/epika.js`)**:
  - Aggiunto `'adm-richiami-evento-panel'` all'array `PANNELLI_EVENTO` di `apriPannelloEsclusivoAdmin()`.
  - Implementata `mostraPannelloRichiamiEvento(eventoId, eventoTitolo)` e `renderTabellaRichiamiEvento(records)` per caricare e visualizzare i provvedimenti specifici dell'evento.
  - Implementate `apriModaleProvvedimentoEvento()` e `archiviaRichiamoEncomioEvento(id)`.
  - Aggiornata `salvaRichiamoEncomio()` e `chiudiModaleRichiamoEncomio()` per ripristinare il form e fare refresh contestuale adattivo (sul pannello evento se aperto e/o sulla dashboard generale).
  - Aggiornato il pulsante `⚠️🎖️ PROVVEDIMENTI` in `renderEventiAdmin()` per aprire `mostraPannelloRichiamiEvento()`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.88` tramite `npm run bump`.

## [2026-08-24] feature | Registro Generale Richiami ed Encomi & Integrazione Dashboard Eventi (v1.04.86)
- **Database (Supabase)**:
  - Creata la tabella `public.epika_richiami_encomi` con FK su `epika_profili` ed `epika_eventi`, CHECK constraints per `tipo`, `categoria`, `gravita`, e soft-delete `attivo = TRUE`.
  - Create le funzioni helper `SECURITY DEFINER` stateless: `public.is_direttivo_epika`, `public.is_capogruppo_of`, `public.is_coach_of`.
  - Definite policy RLS rigide: `SELECT` limitata ad Atleta (self), Direttivo, Capogruppo e Allenatori/Validatori di riferimento; `INSERT`/`UPDATE` consentite esclusivamente al Direttivo/Admin Epika.
- **Frontend HTML/CSS (`portal/epika.html`, `portal/epika.css`)**:
  - Aggiunto il pulsante `RICHIAMI & ENCOMI` nella sidebar amministrativa (`#epk-adm-btn-richiami-encomi`).
  - Creato il pannello tab `#epk-adm-tab-richiami-encomi` con 4 card KPI (Totale Encomi, Richiami Attivi, Atleti Coinvolti, Gruppo Top), toolbar con filtri multipli reattivi e tabella registri con badge stilizzati.
  - Aggiunto il modale `#re-modale` per l'inserimento/registrazione rapida sia globale che da singolo evento.
  - Aggiunta la sezione `#epk-atleta-onorificenze` nella Scheda Personale Atleta (`#epk-main`).
- **Frontend JS (`portal/epika.js`)**:
  - Implementato routing in `switchAdminTab('richiami-encomi')` con `renderRichiamiEncomiDashboard()`.
  - Aggiunto pulsante `⚠️🎖️ PROVVEDIMENTI` nelle card dinamiche degli eventi in `renderEventiAdmin()`.
  - Implementate funzioni di filtraggio client-side `filtraRichiamiEncomi()`, salvataggio `salvaRichiamoEncomio()` e archiviazione soft-delete `archiviaRichiamoEncomio()`.
  - Integrata la funzione `renderOnorificenzeAtleta()` per la visualizzazione protetta (escluse le note interne) nel profilo dell'atleta.
  - Aggiunta la colonna `Condotta` nella tabella `renderAllenatoreDashboard()`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.86` tramite `npm run bump`.


## [2026-08-24] feature | Modifica e Cancellazione Universale Cronologia Stati Gruppi Storici (v1.04.83)
- **Frontend UI & Logica (`portal/epika.js`)**:
  - In `caricaStoricoStatiGruppo`: resi disponibili i pulsanti `✏️` (Modifica) e `🗑️` (Elimina) su ciascun evento registrato nella cronologia (incluso lo stato iniziale di creazione).
  - Implementata la funzione `abilitaModificaStatoGruppo` per la modifica inline di stato (`<select>`), data (`<input type="date">`) e note (`<input type="text">`).
  - Implementata la funzione `salvaModificaStatoGruppo` con validazione rigida dei campi e sincronizzazione automatica dello stato del gruppo master.
  - Implementata la funzione `eliminaVariazioneStatoGruppo` con protezione anti-orphan (impedisce l'eliminazione dell'ultimo stato rimasto per preservare l'integrità relazionale).
  - In `sincronizzaStatoAttualeGruppo`: aggiunto fallback di sicurezza nel caso limite di storico stati vuoto.
- **Versione**: Incrementata la versione globale a `v1.04.83`.

---

## [2026-08-24] feature | Gestione Protetta e Modificabile Anno Iscrizione Epika in Lista Generale (v1.04.90)
- **Frontend UI (`portal/epika.html`)**:
  - Rimosso dal modulo First Access l'input vulnerabile `#fa-primo-anno` per prevenire qualsiasi falsificazione di anzianità lato client.
  - Aggiunta la colonna `ANNO ISCRIZIONE` (`<th>Anno Iscrizione</th>`) nella tabella `#epk-adm-tab-generale` tra il Tesserato e i selettori 2026.
- **Logica Frontend & Database (`portal/epika.js`)**:
  - In `handleFirstAccessSubmit`: assegnazione rigida e programmatica dell'anno corrente (`new Date().getFullYear()`) in fase di creazione profilo.
  - In `disegnaTabellaListaGenerale`: renderizzato l'input numerico `.gen-primo-anno` con attributo `data-original` e range min 1980.
  - In `salvaTuttaLaListaGenerale`: implementato l'aggiornamento massivo e differenziale su `epika_profili.primo_anno_partecipazione` tramite `Promise.all` solo per i record effettivamente modificati dall'Admin.
- **Versione**: Incrementata la versione globale a `v1.04.90`.

---

## [2026-08-24] feature | Riprogettazione Assegnazione Mercenari a 3 Colonne in Gestione Eserciti
- **Frontend UI (`portal/epika.html`)**:
  - Ristrutturata la sezione dei mercenari singoli in un layout a 3 colonne (`#adm-esercito-a-mercenari-list`, `#adm-eserciti-pool-mercenari-list`, `#adm-esercito-b-mercenari-list`) speculare a quello dei gruppi storici.
- **Logica Frontend & Sicurezza (`portal/epika.js`)**:
  - In `renderTatticaEserciti()`: implementata la funzione sicura `renderCardMercenario()` con sanificazione XSS preventiva tramite `escapeHtml()` e omisssione completa dei bottoni di azione in modalità `isReadOnly()`.
  - In `aggiornaCalcoliEserciti()`: aggiunta sincronizzazione dinamica dei titoli delle colonne mercenari (`${nomeA} (MERCENARI)` e `${nomeB} (MERCENARI)`).

## [2026-08-24] feature | Campi Descrittivi Richiami, Encomi e Bilanciamenti Gestione Eserciti
- **Database (`supabase/migration_epika_eserciti_annotazioni.sql`)**:
  - Aggiunta colonna `annotazioni_schieramento JSONB` alla tabella `public.epika_eserciti_eventi` con payload strutturato (`{"esercito_a": {"richiami": "", "encomi": ""}, "esercito_b": {"richiami": "", "encomi": ""}, "bilanciamenti": ""}`).
  - Applicata migrazione DDL su Supabase `zpategmkelqmexetpaot`.
- **Frontend UI (`portal/epika.html`)**:
  - Aggiunti due campi multiriga `RICHIAMI` ed `ENCOMI` posizionati sotto i generali all'interno dei box dedicati a Esercito A ed Esercito B.
  - Aggiunto un campo multiriga a tutta larghezza `BILANCIAMENTI (ACCESSORI SIBIS)` per registrare gli adeguamenti tattici stabiliti dal Sibis.
- **Logica Frontend (`portal/epika.js`)**:
  - In `mostraPannelloEserciti()`: estrazione sicura e popolamento dei valori da `savedEserciti.annotazioni_schieramento`.
  - Inclusi i 5 ID dei controlli nella whitelist `inputIds` governata dallo stato `isReadOnly()`.
  - In `salvaSchieramentiEserciti()`: serializzazione sanitizzata (tramite `.trim()`) delle annotazioni e inclusione nel payload inviato a Supabase.

## [2026-08-24] bugfix/security | Fix RBAC e Salvataggio Consensi Profilo Membri Direttivo (v1.04.78)
- **Database (Supabase Remoto `zpategmkelqmexetpaot`)**:
  - **Riscrittura Trigger `public.proteggi_ruolo_utente` (`trigger_proteggi_ruolo` su `public.utenti`)**:
    - **Risoluzione Blocco Profilo**: Il trigger originale controllava indiscriminatamente la presenza di ruoli direttivi (`NEW.ruolo && ARRAY['presidente', ...]`), bloccando qualsiasi aggiornamento anagrafico e di consensi GDPR tentato da membri del direttivo (es. Presidente).
    - **Adozione Strict Immutability**: Su operazione `UPDATE` (`NEW.id = auth.uid()`), il trigger ora verifica la stretta immutabilità del campo ruolo (`NEW.ruolo IS DISTINCT FROM OLD.ruolo`). Se il campo non viene alterato dall'utente, l'aggiornamento dei consensi privacy (`consenso_audiovisivi`, `consenso_marketing`), contatti, residenza e recapiti di emergenza ha esito positivo.
    - **Chiusura Falle RBAC Laterali**: Bloccata qualsiasi auto-modifica e privilege escalation sia per ruoli amministrativi che operativi da client.
  - **File Migrazione**: Creato `supabase/migration_fix_immutabilita_ruolo.sql` e applicato con successo.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.78` via `npm run bump`.

---

## [2026-08-24] feature | Ordinamento Gruppi Assegnati agli Eserciti per Ordine di Scelta (Draft Order)
- **Frontend (`portal/epika.js`)**:
  - **Tracciamento Cronologico Scelte**: Aggiunta la proprietà `ordineGruppi: []` in `esercitiCacheData` per registrare l'ordine esatto di assegnazione e spostamento dei gruppi tra gli schieramenti.
  - **Aggiornamento Tattico Dinamico (`impostaGruppoSchieramento`)**: All'assegnazione o spostamento di un gruppo ad Esercito A o B, il gruppo viene posizionato in coda al draft order (`ordineGruppi.push(gNome)`), mentre alla rimozione viene sfilato dall'array.
  - **Rendering Schieramenti (`renderTatticaEserciti`)**: Nelle colonne Esercito A ed Esercito B, i gruppi vengono visualizzati in base all'ordine cronologico di scelta effettuato dall'amministratore (sotto il rispettivo Capo Fazione fisso in cima), sostituendo il precedente ordinamento forzato per numero di combattenti. Il Pool dei gruppi non assegnati mantiene invece l'ordinamento decrescente per combattenti per facilitare la selezione.
  - **Persistenza Stato (`salvaSchieramentiEserciti` & `mostraPannelloEserciti`)**: L'array `_ordine_gruppi` viene memorizzato in `coefficienti_forza` su Supabase e ripristinato automaticamente ad ogni caricamento dell'evento.

---

## [2026-08-24] feature | EPIKA Direttivo Marketing Read-Only & Consensi Privacy GDPR
- **Accesso Multisezione Direttivo Marketing (`portal/epika.js`)**:
  - In `configureAdminTabs()`: abilitate le tab `['scab', 'gruppi', 'popoli', 'eventi', 'generale', 'marketing']` per la vista `direttivo_marketing`.
  - Applicata la modalità `isReadOnly()` a tutte le sezioni per garantire la sola visione dei menu e relative dashboard, impedendo modifiche, aggiunte, binding o cancellazioni dal DOM.
  - Applicate guardie di sicurezza su tutte le funzioni mutanti JS (`creaStrutturaSCAB`, `toggleStatoStrutturaSCAB`, `salvaAbbinamentoSCAB`, `pulisciAbbinamentoSCAB`, `creaSoggettoRuolo`, `toggleStatoSoggettoRuolo`, `cancellaStrutturaSCAB`, `cancellaSoggettoRuolo`, `cancellaGruppoStorico`, `creaPopolo`, `toggleStatoPopolo`, `cancellaPopolo`, `salvaRuoliGruppo`, `aggiungiVariazioneStatoGruppo`, `eliminaUltimaVariazioneStato`, `salvaModificaMandato`, `eliminaMandatoStorico`, `salvaTuttaLaListaGenerale`).
- **Visualizzazione e Filtro Consenso Audio/Video GDPR (`portal/epika.html` & `portal/epika.js`)**:
  - In `renderListaGeneraleAdmin()`: estesa la query verso Supabase (`.select('*, utenti(nome, cognome, consenso_audiovisivi)')`).
  - In `epika.html`: aggiunto il dropdown di filtro `#gen-filter-consenso` con opzioni `TUTTI I CONSENSI A/V`, `CON CONSENSO SÌ`, `SENZA CONSENSO (NO)`.
  - In `disegnaTabellaListaGenerale()`: implementata la logica di filtraggio per consenso e inserito per ogni tesserato il badge semaforico `📹 RIPRESE A/V: SÌ` (verde) o `🚫 RIPRESE A/V: NO` (rosso).
  - Introdotto helper `escapeHtml()` per prevenire XSS su tutti i campi renderizzati.

## [2026-08-20] fix | Gestione Manuale Certificati Medici, Override Data Scadenza, Coda Approvazioni e Sblocco Tesserati (v1.04.75)
- **Backend API (`api/validate.js`):**
  - Esteso il ramo `is_manual: true` per accettare e validare `data_scadenza` (formato YYYY-MM-DD), `data_rilascio` e `tipologia`.
  - Mantenuto l'isolamento di dominio: salvataggio diretto dei campi temporali su `certificati_medici` e riattivazione automatica di `registro_tesserati.stato_tesseramento = 'ATTIVO'` per gli atleti sospesi.
- **Frontend Dashboard (`portal/dashboard.js` & `portal/dashboard.html`):**
  - **Registro Approvazioni (`loadCertificatiGialli`)**: Ottimizzata la query PostgREST per includere sia i certificati in `GIALLO` e `IN_ATTESA` che i certificati `ROSSO` recenti (ultimi 7 giorni con file digitale valido), escludendo i record legacy storici con `file_url: 'fittizio'`. Aggiornati i badge di stato (`RIFIUTATO AI`, `DUBBIO AI`, `IN ATTESA`) e il titolo della sezione.
  - **Approvazione Manuale con Prompt Data (`validaCertificatoManual`)**: Introdotto prompt interattivo durante l'approvazione a `VERDE` per confermare o inserire la data di scadenza reale (default +1 anno), evitando che date errate estratte dall'AI mantengano il certificato come "scaduto".
  - **Azioni Rapide in Registro Tesserati (`renderTesseratiTable` e mobile cards)**: Aggiunto il pulsante `✓ FORZA / APPROVA` nella colonna Certificato e l'azione `SBLOCCA CERT.` nella colonna Azioni per tesserati con stato `SOSPESO`.
- **Versionamento:** Eseguito `npm run bump` (versione `v1.04.75`).

## [2026-08-20] fix | Fix Certificato Medico Upload, Storage Path Relativo, Auth Webhook AI & Sanatoria Matera (v1.04.74)
- **Frontend Dashboard (`portal/dashboard.js`):**
  - **Widget Home (`uploadCertificatoDashboard`)**: Sostituita la logica di `UPDATE` distruttiva con `INSERT` atomico in `certificati_medici` preservando lo storico delle visite (regola Epika).
  - **Storage Path Relativo**: Salvato il percorso relativo permanente (`${userId}/certificato_${Date.now()}.${fileExt}`) nel campo `file_url` anziché un Signed URL effimero a scadenza, sfruttando la risoluzione on-demand già presente in `openSignedFile()`.
  - **Compressione Immagini Client-Side**: Integrata compressione automatica client-side con `compressImageSandbox` (max 1600x1600 @ 82% qualità) sia per l'upload dalla Home che per il tab Certificato.
  - **Trigger Diretto AI**: Aggiunta chiamata client-side diretta e deterministica a `/api/validate` con Bearer token utente dopo ogni `INSERT`, garantendo l'elaborazione immediata senza dipendenza esclusiva da webhook.
  - **UI/UX Modernizzata**: Rimossi tutti i `window.alert` bloccanti e `window.location.reload()`, sostituiti con aggiornamento reattivo delle sezioni (`loadUserCertificato()`, `populateUserPanoramicaSummary()`) e toast feedback (`showToastNotification`).
- **Backend API (`api/validate.js`):**
  - Aggiunto supporto per autenticazione via `x-webhook-secret` (`SUPABASE_WEBHOOK_SECRET`) per garantire la corretta autorizzazione dei Webhook HTTP inviati da Supabase.
  - Abilitata autorizzazione per utenti tesserati ordinari (non direttivo) a triggerare la validazione AI automatica esclusivamente sui propri documenti/certificati.
  - Risoluzione automatica di `targetFileUrl` da `cert_id` e `doc_id` in assenza di passaggio esplicito del parametro.
- **Sanatoria Dati & Esecuzione AI:**
  - Creato ed eseguito lo script `scripts/sanatoria_matera.js` per Michael Matera, inserendo il record per il file caricato (`certificato_1787215104903.jpg`) e verificando l'elaborazione AI (stato `ROSSO` per certificato antecedente al 2026).
- **Versionamento:** Eseguito `npm run bump` (versione `v1.04.74`).
- **Frontend Registrazione (`portal/registrazione.html`, `portal/registrazione.js`):**
  - Esteso l'override di sicurezza `window.alert` per intercettare e tradurre in italiano chiaro e fruibile i messaggi nativi tecnici del browser come `Failed to fetch`, `NetworkError` e `Load failed`.
  - Aggiunta la funzione helper `translateUploadError(err)` che mappa errori di connessione, payload size (413) e formati immagine invalidi, arricchendo l'alert con la fase operativa esatta.
  - Inserito banner statico esplicito sui requisiti del certificato medico (dicitura AGONISTICO / NON AGONISTICO, validità < 12 mesi, formati ammessi).
  - Resi visibili i selettori di Tipologia e Data di Emissione con listener reattivo per calcolo scadenza e avviso visivo in tempo reale (`#cert-data-warning`) in caso di data futura o scaduta (> 1 anno).
- **Frontend Pagamento (`portal/pagamento.html`, `portal/pagamento.js`):**
  - Riorganizzato il blocco `#error-box` con container `#error-actions` dinamico, eliminando il link statico che produceva un loop al login per utenti già autenticati.
  - Refattorizzata `showError(msg, errorType)` per generare pulsanti di azione contestuali in base alla motivazione: link diretto alla sezione documenti della Dashboard (`#user_documento` per certificati, `#user_profile` per documenti identità), pulsante ricarica per validazioni in corso (`IN_ATTESA`), e avviso per revisione manuale (`GIALLO`).
- **Versionamento:** Eseguito `npm run bump` (versione `v1.04.73`).

## [2026-08-19] fix | Hardening Pre-Upload Registrazione, Gestione Errori e Allineamento RLS Storage (v1.04.72)
- **Database & Storage (Supabase):**
  - Allineate le policy RLS su `storage.objects` per il bucket `documenti_identita`: rimossa la policy INSERT permissiva non confinata, introdotte policy con path-guard rigoroso su `(auth.uid())::text = (storage.foldername(name))[1]` per `INSERT`, `UPDATE` e `SELECT` (con accesso consentito anche al Consiglio Direttivo).
  - Sbloccato e rimosso il record fantasma incompleto di Marco Giordani (`auth.users`, `public.utenti`, `public.atti_adesione`).
- **Frontend JS (`portal/registrazione.js`):**
  - Isolato e protetto il merge PDF fronte/retro con `try/catch` dedicato e fallback automatico al caricamento del solo fronte in caso di file JPEG da smartphone con codifiche non supportate da pdf-lib, notificando l'utente e consentendo la prosecuzione.
  - Aggiunto null-guard preventivo su `uploadedDocumentoIdentitaFile` per evitare `TypeError` prima dell'upload.
  - Sostituito `upsert: true` con `upsert: false` per gli upload su `certificati_medici`, `documenti_identita`, `documenti_adesione` e `documenti_tutori` sfruttando i path univoci con timestamp.
  - Arricchito il messaggio di errore finale nel catch con l'indicazione contestuale dello step di avanzamento.
- **Versionamento:** Eseguito `npm run bump` (versione `v1.04.72`).

## [2026-08-18] fix | Risoluzione Gerarchica SCAB Allievi Allenatori & Integrità RPC (v1.04.70)
- **Database (Supabase RPC):**
  - Corretta `public.crea_richiesta_abilitazione`: introdotta la risoluzione gerarchica a 2 step per gli allievi allenatori (`scab_allievo_allenatore`), risolvendo prima l'allenatore di riferimento e poi il validatore dalla palestra principale.
  - Corretta `public.inizializza_abilitazioni_mancanti` applicando la medesima risoluzione a 2 step per prevenire regressioni durante le sanatorie massive.
  - Irrobustita `public.aggiorna_stato_allenatore`: introdotta la verifica su `v_rec_id` reale (evitando falsi errori di record non trovato quando un campo era nullo) e blocco per record corrotti.
- **Data Patch:**
  - Eseguita bonifica procedurale su `epika_scab_abilitazioni`, sanando il record di Chiara Traglia (id: 54) e collegando correttamente Tito (allenatore_opzione_id = 8) e Beleno (validatore_opzione_id = 33).
- **Versionamento:** Eseguito `npm run bump` (versione `v1.04.70`).

## [2026-08-18] fix | Inclusione Atleti Allievi Allenatori nella Vista Allenatore SCAB (v1.04.69)
- **Frontend JS (`portal/epika.js`)**:
  - In `getAllenatoreAllieviIds(opzioneId)`: esteso il filtro di query su `epika_profili` sostituendo `.eq('allenatore_id', opzioneId)` con `.in('allenatore_id', tuttiCoachIds)` dove `tuttiCoachIds` include sia il coach principale sia tutti gli ID degli allievi allenatori (`opzioniAllieviIds`) abbinati alle relative strutture SCAB (`epika_scab_abbinamenti`).
  - In `fetchIscrittiEventoDettagli(eventoId)`: ampliata la query di recupero delle opzioni per `allenatoriMappa` includendo sia `'allenatore'` sia `'scab_allievo_allenatore'`, assicurando che i nomi degli allievi allenatori vengano risolti correttamente nei dettagli dei partecipanti.
  - La correzione si propaga automaticamente a `getAllievoCoachAllieviIds`, `getValidatoreAllieviIds`, `renderAllenatoreDashboard` e `mostraIscrittiEventoAllenatore`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.69` tramite `npm run bump`.


## [2026-08-17] fix | Mobile UI Redesign EPIKA, Griglia Azioni Eventi & Sanitizzazione Mermaid (v1.04.67)
- **Frontend CSS (`portal/epika.css`)**:
  - Implementate media queries per l'Header su due livelli (`.epk-header-top`, `.epk-header-bottom`).
  - Ottimizzata la navigazione orizzontale a chip scorrevoli touch per la sidebar admin (`.epk-admin-sidebar`) con scrollbar sottile e protezione dal troncamento dei testi.
  - Creata la griglia di azioni responsive per le card evento (`.epk-event-actions-grid`) con layout 2x2/2x3 touch su mobile e pulsante presenze espanso.
  - Aggiunto il wrapper elastico `.epk-mermaid-wrapper` con scroll orizzontale fluido per l'organigramma.
- **Frontend HTML (`portal/epika.html`)**:
  - Riorganizzato l'header semantico nei container `.epk-header-top` (Logo, Titolo, Versione, Chiudi) ed `.epk-header-bottom` (Selettore Vista, Nome Utente).
  - Avvolto l'organigramma Mermaid nel wrapper responsive `.epk-mermaid-wrapper`.
- **Frontend JS (`portal/epika.js`)**:
  - In `renderEventiAdmin()`: applicate le classi semantiche `.epk-event-card`, `.epk-event-header`, `.epk-event-info`, `.epk-event-actions-grid` eliminando layout inline rigidi.
  - In `renderOrganigrammaMermaid()`: implementata la funzione `sanitizeMermaidText()` per sanificare i caratteri che rompevano il parser Mermaid o esponevano a injection/XSS; sanificati i doppi apici interni e le parentesi.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.67` tramite `npm run bump`.

---

## [2026-08-17] fix | Esclusione Mercenari Non Combattenti da Gestione Eserciti & Sanitizzazione Assegnazioni
- **Frontend (`portal/epika.js`)**:
  - **Whitelisting Ingestione**: Nella funzione `mostraPannelloEserciti()`, aggiunta la condizione `ruolo === 'combattente'` per l'inclusione dei mercenari in `esercitiCacheData.mercenari`. I profili non combattenti mercenari vengono esclusi alla radice dalla pipeline tattica.
  - **Sanitizzazione dello Stato (Garbage Collection)**: Implementata pulizia automatica dell'oggetto `esercitiCacheData.assegnazioniMercenari` eliminando eventuali ID pregressi non appartenenti alla whitelist dei mercenari combattenti validi (prevenzione ghost assignments nel DB).
  - **UI Empty State**: Aggiornato il messaggio testuale in `renderTatticaEserciti()` quando non vi sono mercenari: `"Nessun mercenario combattente iscritto a questo evento."`.

---

## [2026-08-17] feature | Filtro Checkbox Certificati Scaduti (🔴) e Layout Compatto Presenze
- **Frontend (`portal/epika.html`)**:
  - Ridotta e resa fluida la barra di ricerca `#adm-presenze-search` (`flex: 1 1 180px; max-width: 260px`).
  - Aggiunta casella di spunta `#adm-presenze-filter-red` ("🔴 Solo Scaduti / Mancanti") allineata a destra nella toolbar sopra la colonna dei pallini/azioni.
- **Frontend (`portal/epika.js`)**:
  - In `mostraPannelloPresenze()`: forzato il reset sincrono del checkbox (`checked = false`) all'apertura del pannello per evitare stati fantasma.
  - In `filtraPresenzeUtenti()`: integrata la valutazione logica combinata tra la ricerca testuale e il flag booleano `onlyRed` (filtraggio per `!item.isCertValido`).
  - In `togglePresenzaAtleta()`: mantenuta la re-invocazione automatica di `filtraPresenzeUtenti()` per conservare lo stato dei filtri attivi.

---

## [2026-08-17] feature | Quadro Conferma Presenze: Ordinamento A-Z, Filtro Ricerca e Semaforo Medico (v1.04.63)
- **Frontend (`portal/epika.html`)**:
  - Aggiunta barra di ricerca real-time (`#adm-presenze-search`) con relativo badge contatore dinamico (`#adm-presenze-count`) all'interno del pannello `#adm-presenze-panel`.
- **Frontend (`portal/epika.js`)**:
  - **Refactoring Query**: Implementata parallelizzazione con `Promise.all` per il recupero simultaneo di date evento (`epika_eventi`), iscrizioni (`epika_iscrizioni_eventi`) e presenze (`epika_presenze_eventi`).
  - **Deep Fetching Certificati**: Eseguita query unificata su `utenti` con relazione innestata `anagrafiche(certificati_medici(data_scadenza))` per estrarre la data di scadenza più recente senza N+1 query né esposizione di PII superflue (piena conformità a `SECURITY.md`).
  - **Semaforo Validità Medico**: Aggiunto indicatore visivo (🟢 / 🔴) sul lato destro di ogni atleta calcolato rispetto all'ultimo giorno dell'evento (`data_fine` o `data_inizio`), corredato di tooltip descrittivo (`title`) con data esatta.
  - **Ordinamento Alfabetico**: Lista iscritti ordinata A-Z per nome storico di battaglia (`nome_di_battaglia`), con fallback su nome reale in caso di assenza.
  - **Filtro Client-Side Reattivo**: Implementata funzione `filtraPresenzeUtenti()` su cache locale e aggiornato `togglePresenzaAtleta()` per preservare lo stato della ricerca attiva e velocizzare i rendering.
- **Global Bump**: Versionamento globale aggiornato tramite `npm run bump`.

---

## [2026-08-13] feature | Monitoraggio e Caselle Rate Mensili Stripe per Corsi ASD (v1.04.61)
- **Database (Supabase `zpategmkelqmexetpaot`)**:
  - Aggiunte colonne `totale_rate`, `rate_pagate` e `stato_rate` alla tabella `public.iscrizioni_eventi`.
  - Eseguito backfill per gli abbonamenti rateali esistenti (Fabio Morganti: 6 rate / 1 pagata; Giulio De Vecchis: 12 rate / 1 pagata).
  - Aggiornata la vista `public.vw_stato_atleta_corso` per esporre i dati di rateizzazione.
- **Backend Webhook (`api/stripe-webhook.js`)**:
  - Aggiunto il salvataggio dei campi di rateizzazione su `checkout.session.completed` per gli abbonamenti a rate.
  - Aggiunto handler per `invoice.paid` (`billing_reason === 'subscription_cycle'`): incrementa `rate_pagate`, imposta `stato_rate = 'IN_REGOLA'`, genera la ricevuta fiscale progressiva e registra l'audit log.
  - Aggiunto handler per `invoice.payment_failed`: imposta `stato_rate = 'INSOLUTO'` sull'iscrizione e scrive l'audit log.
  - Aggiunto handler per `customer.subscription.deleted`: imposta `stato_rate = 'ANNULLATO'` in caso di revoca/cancellazione anticipata dell'abbonamento Stripe.
- **Frontend (`portal/dashboard.js`)**:
  - Nella card del tesserato (gestione corsi), per `tipo_pagamento === 'A RATE'` viene renderizzata una griglia visiva interattiva di caselle mensili:
    - 🟩 **Verde (`✓`)**: Rata saldata con successo tramite Stripe.
    - 🟥 **Rosso lampeggiante (`✗`)**: Rata con prelievo fallito / insoluto.
    - ⬜ **Grigio numerato**: Rata futura in attesa di addebito.
  - Alert ⚠ dinamico nell'header della card se il tesserato ha una rata insoluta.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.60` tramite `npm run bump`.

---

## [2026-08-13] refactor | Pulizia e Rimozione Scheda Battaglie Legacy da Gestione Eserciti (v1.04.59)
- **Frontend (`portal/epika.html`)**:
  - **Eliminazione Blocco Duplicato**: Rimosso il vecchio container HTML `<!-- Sezione Scheda Battaglie -->` annidato all'interno del pannello `#adm-eserciti-panel`.
- **Frontend (`portal/epika.js`)**:
  - **Eliminazione Debito Tecnico e Funzioni Legacy**: Rimosse le funzioni `caricaBattaglie()`, `aggiornaRiepilogoBattaglie()`, `aggiungiBattaglia()`, `aggiornaBattaglia()`, `aggiornaNoteBattaglia()`, `rimuoviBattaglia()`.
  - **Aggiornamento Proclamazione Vincitore**: Consolidata la funzione `dichiaraVincitoreEserciti()` affinché interagisca esclusivamente con il pannello autonomo `#adm-battaglie-panel` (`caricaBattaglieEvento()`).
  - **Separazione delle Responsabilità (SoC)**: Il pannello *Gestione Eserciti* è ora dedicato esclusivamente alla preparazione tattica e schieramento, mentre il pannello *Registro Battaglie* gestisce in modo centralizzato e privo di ridondanze l'arbitraggio dei round e la proclamazione del vincitore.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.59` tramite `npm run bump`.

---

## [2026-08-13] refactor | UI/UX Redesign Tasti Schieramento Gruppi con Frecce Compatte (v1.04.58)
- **Frontend (`portal/epika.js`)**:
  - **Redesign Compatto Tasti di Schieramento**: Rimossi i pulsanti ingombranti e testuali (`AD ESERCITO A` / `AD ESERCITO B` / `RIMUOVI`) che soffocavano le card dei gruppi storici.
  - **Controlli Direzionali a Freccia**: Sostituiti con pulsanti iconici direzionali ultra-compatti (`←` in blu per Esercito A, `→` in rosso per Esercito B e `✕` per rimozione).
  - **Ottimizzazione Tipografia e Spazio**: Incrementata la dimensione e leggibilità del nome del gruppo storico (`12px`, bold gold, uppercase con text-overflow protetto). Il layout orizzontale a riga singola riduce l'altezza di ogni card del ~45%, massimizzando la densità visiva e la leggibilità complessiva delle 3 colonne tattiche.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.58` tramite `npm run bump`.

---

## [2026-08-13] feature | Capi Fazione per Potenza & Ordinamento Gerarchico Combattenti (v1.04.57)
- **Frontend (`portal/epika.js`)**:
  - **Capi Fazione Automatici per Potenza**: Implementato il calcolo automatico della Potenza dei gruppi all'apertura del pannello Gestione Eserciti. Il 1° gruppo per Potenza (es. *DRUKOS LIGURI*) viene pre-assegnato a **Esercito A** (in cima come *Capo Fazione Sfidante*) e il 2° gruppo per Potenza (es. *LEGIO MALASORTE*) a **Esercito B** (in cima come *Capo Fazione Sfidato*).
  - **Esclusione e Ordinamento Non Assegnati**: I Capi Fazione vengono esclusi dalla colonna dei non assegnati. La colonna dei gruppi non assegnati è ora ordinata rigorosamente dall'alto in basso per numero decrescente di combattenti ($\text{Combattenti} \downarrow$).
  - **Ordinamento Eserciti A e B**: In ciascun esercito il rispettivo Capo Fazione risiede fisso in cima con badge distintivo dorato (`👑 CAPO FAZIONE`), mentre gli altri gruppi assegnati a quello schieramento sono posizionati sotto ordinati per numero di combattenti decrescenti.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.57` tramite `npm run bump`.

---

## [2026-08-13] refactor | Reorder Gloria and Historical War Columns in Classifica Potenza (v1.04.56)
- **Frontend (`portal/epika.html` & `portal/epika.js`)**:
  - **Spostamento Colonna Gloria**: Posizionata la colonna `GLORIA` subito dopo `FORZA`.
  - **Inversione Anni Guerra**: Invertito l'ordine delle guerre storiche da sinistra a destra (dal più recente al più vecchio: `ULTIMA GUERRA (2025)` -> `2 GUERRE FA (2024)` -> `3 GUERRE FA (2023)`).
- **Global Bump**: Versionamento globale aggiornato a `v1.04.56` tramite `npm run bump`.

---

## [2026-08-13] refactor | Reorder POTENZA column in Classifica Potenza Table (v1.04.55)
- **Frontend (`portal/epika.html` & `portal/epika.js`)**:
  - **Spostamento Colonna Potenza**: Riposizionata la colonna `⚡ POTENZA` subito dopo la colonna `GRUPPO STORICO` per un colpo d'occhio immediato sulla classifica generale.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.55` tramite `npm run bump`.

---

## [2026-08-13] fix | Fix ReferenceError statusStyle in renderEventiAdmin (v1.04.53)
- **Frontend (`portal/epika.js`)**: Ripristinata la definizione della variabile `statusStyle` all'interno del loop di rendering `renderEventiAdmin()`, risolvendo l'errore `ReferenceError` che bloccava il caricamento e la visualizzazione degli eventi admin.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.53` tramite `npm run bump`.

---

## [2026-08-13] refactor | UI Redesign Admin Eventi & Registri Indipendenti (v1.04.51)
- **Frontend (`portal/epika.html` & `portal/epika.js`)**:
  - **Scrollbar Fix**: Rimosso `min-width: 900px` e il wrapper `overflow-x` dalla tabella Potenza per permetterne l'adattamento fluido a 100% dello schermo.
  - **Pannello Battaglie Autonomo**: Separato il blocco Registro Battaglie dal pannello Potenza. Creato il nuovo pannello indipendente `#adm-battaglie-panel` con header proprio (titolo, sottotitolo e tasto CHIUDI).
  - **Pannelli Esclusivi Engine**: Inseriti `adm-potenza-panel` e `adm-battaglie-panel` nell'array `PANNELLI_EVENTO` di `apriPannelloEsclusivoAdmin()` per garantire la chiusura automatica dei pannelli concorrenti.
  - **Isolamento Stato JS**: Introdotta la variabile `currentBattaglieEventoId` per isolare il salvataggio e la cancellazione delle battaglie dallo stato del pannello potenza.
  - **Riordino e Redesign Tasti Card**: Riordinati i pulsanti della card evento nell'ordine esatto richiesto (`DASHBOARD`, `POTENZA`, `GESTIONE ESERCITI`, `REGISTRO BATTAGLIE`, `GESTISCI PRESENZE`). Convertiti i tasti `DISATTIVA/ATTIVA` e `CANCELLA` in pulsanti iconici compatti (⏸️ / ▶️ e 🗑️).
- **Global Bump**: Versionamento globale aggiornato a `v1.04.51` tramite `npm run bump`.

---

## [2026-08-13] fix | ASD Corsi Deduplicazione Tesserati e Fix Accordion Card (v1.04.50)
- **Database (`vw_stato_atleta_corso` - Supabase `zpategmkelqmexetpaot`)**:
  - Corretto la vista SQL `vw_stato_atleta_corso` che utilizzava `LEFT JOIN public.anagrafiche a ON a.utente_id = u.id`. Per gli utenti con più schede anagrafiche collegate (come Giulio De Vecchis), la query SQL moltiplicava la riga d'iscrizione producendo tesserati duplicati nella lista dei corsi. Sostituita la JOIN con una `LEFT JOIN LATERAL (SELECT id FROM anagrafiche WHERE utente_id = u.id ORDER BY created_at DESC LIMIT 1)` per garantire la presenza di massimo 1 record anagrafica per utente.
- **Frontend (`portal/dashboard.js`)**:
  - Risolto il problema dell'accordion bloccato per le card dei tesserati. Gli ID del DOM e l'evento `onclick` utilizzavano `atl.utente_id` (`id="details-card-${atl.utente_id}"`), provocando collisione di ID in caso di card duplicate e facendo sì che `document.getElementById` targettizzasse sempre la prima card in pagina. Sostituito con un identificatore unico `uniqueCardId` per card (`atl.iscrizione_id + '_' + index`).
- **Global Bump**: Versionamento globale aggiornato a `v1.04.50` tramite `npm run bump`.

---

## [2026-08-13] fix | Fix GloriaMap Case-Sensitivity, SCAB profilo_id, btn-danger e dichiaraVincitore (v1.04.49)
- **Database (Supabase Remoto `zpategmkelqmexetpaot`)**:
  - Normalizzati in UPPERCASE i `nome_gruppo` nella tabella `epika_cm_gruppi_vincenti` per allinearli ai nomi ufficiali dei gruppi storici.
  - Collegati i `profilo_id` dei campioni SCAB (ARGOS e MINOR) dai profili `epika_profili`.
- **Frontend (`portal/epika.html` & `portal/epika.js`)**:
  - **GloriaMap**: Normalizzato il lookup in JS per essere insensibile a maiuscole/minuscole (`gloriaMap[nomeKey]`).
  - **CSS Fix**: Sostituita la classe inesistente `epk-btn-danger` con `epk-btn-secondary` con bordo e testo rossi per il pulsante elimina battaglia.
  - **Integrazione Dichiara Vincitore**: Inserito l'innesco `🏆 DICHIARA VINCITORE & REGISTRA GLORIA` direttamente dentro il tab Battaglie della dashboard Potenza e aggiunto il fallback `currentPotenzaEventoId` in `dichiaraVincitoreEserciti()`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.49` tramite `npm run bump`.

---

## [2026-08-13] fix | Esecuzione Migrazione DB, Fix Mercenari, Stima Forza Numerica e UI Battaglie (v1.04.48)
- **Database (Supabase Remoto `zpategmkelqmexetpaot`)**:
  - Eseguita la DDL del file `supabase/migration_epika_potenza_battaglie.sql` tramite MCP `apply_migration`.
  - Create tabelle `epika_battaglie_eventi`, `epika_campioni_scab`, `epika_cm_gruppi_vincenti` e colonna `esercito_vincente` in `epika_eserciti_eventi`. Popolati dati seed.
- **Frontend (`portal/epika.html` & `portal/epika.js`)**:
  - **Fix 404 & MERCENARI**: Applicato filtro `.not('nome', 'ilike', 'mercenari')` a livello DB e filtro JS case-insensitive per escludere totalmente i Mercenari dalla classifica Potenza.
  - **Forza Numerica**: Implementata la logica di fallback: se l'evento non ha ancora presenze confermate, il calcolo della Forza Numerica utilizza gli iscritti combattenti come stima preliminare ed espone un badge informativo.
  - **Gestione Battaglie**: Aggiunta la navigazione sub-tab ("CLASSIFICA POTENZA" e "REGISTRO BATTAGLIE") nel pannello Potenza. La scheda battaglie permette di registrare il vincitore di ciascuno scontro (A/B/Pareggio), inserire note, cancellare battaglie ed esporre il conteggio in tempo reale del vincitore di Campo Martio.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.48` tramite `npm run bump`.

---

## [2026-08-13] feature | Dashboard POTENZA Gruppi, Scheda Battaglie & Campioni SCAB (v1.04.45)
- **Database (`supabase/migration_epika_potenza_battaglie.sql`)**:
  - Aggiunta colonna `esercito_vincente` (`A`, `B`, `PAREGGIO`) a `public.epika_eserciti_eventi`.
  - Nuova tabella `public.epika_battaglie_eventi` per registrare le battaglie individuali (venerdì/sabato) con esito, note e RLS.
  - Nuova tabella `public.epika_campioni_scab` per la gestione dell'Albo d'Oro dei Campioni SCAB annuali. Seed: 2024: MORS, 2025: ARGOS, 2026: MINOR.
  - Nuova tabella `public.epika_cm_gruppi_vincenti` per lo storico vittorie gruppi negli ultimi 3 anni. Seed: 2023, 2024, 2025 dagli allegati.
- **Frontend (`portal/epika.html` & `portal/epika.js`)**:
  - **Campioni SCAB**: Aggiunta sub-tab "Campioni" nella sezione SCAB admin per visualizzare, inserire e rimuovere campioni SCAB annuali collegati ai profili atleti.
  - **Scheda Battaglie**: Inserita la scheda battaglie in `GESTIONE ESERCITI` per aggiungere battaglie, registrare vincitori e note, con il pulsante `🏆 DICHIARA VINCITORE` che calcola in automatico l'esercito vincente e sincronizza lo storico vittorie.
  - **Dashboard POTENZA**: Aggiunto il pulsante `⚡ POTENZA` sui card degli eventi Campo Martio che apre la finestra modal con la classifica di Potenza Gruppi (`Forza Numerica` + `Gloria 3 Anni` + `Bonus SCAB +2 pt`).
- **Global Bump**: Versionamento globale aggiornato a `v1.04.45` tramite `npm run bump`.

---

## [2026-08-13] fix | Fix Gestione Eserciti Vuota — ReferenceError genB (v1.04.44)
- **Frontend (`portal/epika.js`)**:
  - Risolto l'errore fatale `ReferenceError: genB is not defined` nella funzione `mostraPannelloEserciti()` scatenato all'apertura del pannello Eserciti per gli eventi con configurazione salvata.
  - Inserita la dichiarazione mancante `const genB = savedEserciti.generali_esercito_b || [];` prima della compilazione degli input per i generali dell'Esercito B.
  - Ripristinata la corretta esecuzione di `renderTatticaEserciti()`, consentendo il popolamento immediato dei gruppi storici, dei mercenari e delle statistiche di forza.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.44` via `npm run bump`.

---

## [2026-08-13] fix | Risoluzione Caricamento Infinito e Visibilità Form Documenti d'Identità (v1.04.43)
- **Frontend (`portal/dashboard.js`)**:
  - **Fix Visibilità Form**: Aggiornata la logica `renderDocInfo` per nascondere esplicitamente (`uploadEl.classList.add('hidden')`) il form di caricamento quando lo stato del documento è `VERDE` o `IN_ATTESA`. Prevenuta la persistenza del form sullo schermo dopo un caricamento andato a buon fine.
  - **Fix DOM Detachment**: Sostituito il clonaggio dei bottoni (`btnPersonale.replaceWith(btnPersonale.cloneNode(true))`) in `loadUserDocumento()` con l'assegnazione diretta della proprietà `.onclick`. Risolto il bug dell'elemento orfano che bloccava il pulsante sullo stato "CARICAMENTO IN CORSO...".
  - **Hardening `finally`**: Aggiornata la funzione `handleDocUploadWidget` per ricalcolare dinamicamente il nodo del pulsante tramite `document.getElementById(btnId)` all'interno del blocco `finally`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.43` via `npm run bump`.

---

## [2026-08-13] fix | Blocco Portale Epika Giuseppe Di Giuseppe — DB Fix + Bug Assistenza Admin (v1.04.42)
- **Database (Supabase)**:
  - Inserito record di approvazione mancante in `registro_approvazioni` per l'anagrafica `9fcb2311-148b-4d3f-942b-1f657d57d08d` (Giuseppe Di Giuseppe).
  - `tipo = TESSERATO`, `stato = APPROVATO`, `livello_copertura = INTEGRATIVA_A`, `data_richiesta = 2026-06-20`, `data_decisione = 2026-06-20`.
- **Frontend (`portal/dashboard.js`)**:
  - Corretto bug in `apriAssistenzaTesserato()`: `renderContextUI()` ricalcolava `isApproved = false` basandosi sul profilo dell'utente assistito, sovrascrivendo l'handler del pulsante Epika con uno che bloccava l'accesso per l'Admin.
  - Aggiunto override esplicito `epikaBtn.onclick` in `apriAssistenzaTesserato()` dopo l'inizializzazione del contesto, che chiama direttamente `openEpika(false)` con `impersonate_id`.
  - Rimosso dead code: `.href` su `<button id="tab-btn-user-epika">` in `apriAssistenzaTesserato()` e `chiudiAssistenzaTesserato()`.
- **Global Bump**: Versionamento aggiornato a v1.04.42.

---

## [2026-08-12] bugfix | Fix Bug UI CSEN ERROR Nascosto + Hardening Sync Bot + Allineamento Codici Fantasma IT...
- **Problema Risolto**: Identificato e corretto un bug critico in `portal/dashboard.js` (vista desktop righe ~2705–2739, vista mobile righe ~2870–2901): la struttura `if/else` dava priorità assoluta al campo `numero_tessera_csen` rispetto a `sync_csen_status`. Di conseguenza, se un atleta aveva un codice temporaneo `IT...` nel campo ma lo stato `ERROR`, la UI mostrava la label cyan (codice richiesta) nascondendo silenziosamente l'errore di sincronizzazione.
- **Fix UI**: `ERROR` ora ha priorità assoluta. Se `sync_csen_status === 'ERROR'`, la colonna CSEN mostra sempre l'etichetta rossa **ERRORE SYNC**, indipendentemente dal valore in `numero_tessera_csen`.
- **Fix Backend** (`scripts/csen_sync_active.js`): Hardening del blocco `catch` del loop atleti: se la registrazione CSEN fallisce su un atleta con codice `IT...` nel campo, il codice viene azzerato a `null` contestualmente alla scrittura dello stato `ERROR`. Questo previene la persistenza di codici fantasma.
- **Allineamento DB**: Azzerati tutti i codici `IT...` fantasma (mai registrati su CSEN) per 4 atleti in stato `PENDING`: Giulia Rughetti (T_104_2026), Francesco Stuffer (T_119_2026), Simone Gravina (T_121_2026), Sofia Fidati (T_120_2026). Tutti ora hanno `numero_tessera_csen = NULL` e sono pronti per la prossima run del bot CSEN.
- **Correzione Livelli Copertura**: Giulia Rughetti: `BASE` → `INTEGRATIVA_B` (comunicazione CSEN deve avvenire con Silver B). Paolo Alesi (T_058_2026): `BASE` → `INTEGRATIVA_B` (allineamento con dato reale CSEN portale).
- **Script Creati**: `scripts/fix_csen_coverage_and_ghost_codes.js` (idempotente per i 3 atleti target), `scripts/fix_all_it_ghost_codes.js` (generico per tutti i PENDING con IT...).
- **Global Bump**: Versionamento aggiornato tramite `npm run bump`.

## [2026-08-11] bugfix | Fix Ordinamento Documenti d'Identità in Registro Approvazioni (v1.04.40)
- **`portal/dashboard.js`**:
  - **Inclusione `created_at` e `data_caricamento`**: Inseriti i campi `created_at` e `data_caricamento` nella query `.select()` dei `documenti_identita` dentro `loadApprovazioni()`. Precedentemente erano omessi, azzerando l'ordinamento in `getIdDocInfo(anag)` e facendo mostrare per errore il vecchio documento rifiutato (`ROSSO`) invece del nuovo documento approvato (`VERDE`).
  - **Miglioramento `getIdDocInfo()`**: Aggiornato il comparatore con ordinamento timestamp numerico `getTime()` e fallback di sicurezza che priorita lo stato `VERDE` ed `IN_ATTESA` a parità di data.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.40` (22 file aggiornati).

## [2026-08-11] feature_ui_bugfix | Visibilità Documenti in Attesa Pagamento e Guardrail Sicurezza Pagamento (v1.04.37)
- **`portal/dashboard.html` e `portal/dashboard.js`**:
  - **Trasparenza Documenti in Attesa Pagamento**: Aggiunta la colonna "Documenti" ed i badge semaforici per `Documento d'Identità` e `Certificato Medico` nella tabella *TESSERATI E SOCI IN ATTESA DI PAGAMENTO* del Registro Approvazioni.
  - **Badge Avviso Direttivo**: Inserito l'avviso lampeggiante `⚠ DOC/CERT RIFIUTATO` o `⏳ NUOVO DOC DA VALIDARE` per evidenziare immediatamente all'amministratore gli utenti bloccati con documenti rifiutati o nuovi caricamenti in attesa.
  - **Pulsanti di Ispezione**: Abilitata l'apertura e visualizzazione dei file direttamente dalla riga dei pagamenti in sospeso (`approvazioni-view-cert-btn`, `approvazioni-view-id-btn`).
- **`portal/pagamento.js`**:
  - **Hardening Blocco Pagamento**: Integrata l'interrogazione relazionale a `documenti_identita(*)` nel recupero del profilo in `init()`.
  - **Guardrail Tassativo Documento Identità**: Imposto il blocco irrevocabile del checkout se il Documento d'Identità è **mancante, scaduto, in stato ROSSO (rifiutato), IN_ATTESA o GIALLO**, mostrando la relativa modale esplicativa e impedendo qualsiasi bypass via URL.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.37` (22 file aggiornati).

## [2026-08-11] admin_override | Rettifica Allenatore e Validatore Epika per Simone Avallone (v1.04.36)
- **Database (`Supabase`)**:
  - Eseguita rettifica atomica delle tabelle `epika_profili` e `epika_scab_abilitazioni` per l'atleta Simone Avallone (`4161d503-f53d-4f0a-bacc-7b0f8a9ff6c2`).
  - Aggiornato l'allenatore a **Garid / Ascanio** (`allenatore_id = 4`) e il validatore a **Cunagato / Kuna** (`validatore_opzione_id = 34`).
  - Resettati cautelativamente gli stati di approvazione della pratica 2026 a `'in_attesa'` e `'giallo'` per consentire una nuova valutazione pulita da parte del nuovo team.
  - Storicizzata la modifica nel registro audit `epika_registro_modifiche_profilo`.

## [2026-08-11] feature_ui_bugfix | Semplificazione UI Certificati (Rimozione Input Manuali), Autocalcolo Scadenza AI e Sanatoria Monterosso (v1.04.35)
- **`portal/dashboard.html` e `portal/registrazione.html`**:
  - **Rimozione Input Manuali**: Nascosti gli input della tipologia e data di emissione del certificato medico sia nel form di registrazione sia nelle varie sezioni di upload della Dashboard. L'utente carica esclusivamente il file del certificato senza compilazioni manuali ridondanti.
- **`portal/registrazione.js` e `portal/dashboard.js`**:
  - **Validazione Client Semplificata**: Eliminati i vincoli di compilazione manuale prima di inviare. Impostati valori di fallback trasparenti (`NON_AGONISTICO` e data odierna) al momento dell'insert iniziale in `IN_ATTESA` per consentire l'avvio della validazione AI.
- **`api/validate.js`**:
  - **Autocalcolo Scadenza**: Quando l'AI restituisce `data_scadenza: null` (tipico nei certificati cartacei con sola indicazione di validità annuale), il backend calcola automaticamente `data_scadenza = data_rilascio + 1 anno`, garantendo l'assenza di violazioni del vincolo `NOT NULL` PostgreSQL (SQL `23502`).
  - **Documenti d'Identità**: Dinamizzata la costruzione di `updatePayload` per `documenti_identita` includendo `data_scadenza` solo se presente, evitando inserimenti accidentali di valori nulli.
  - **Messaggio Fallback Chiarito**: Aggiornata la nota di emergenza nel `catch` globale a `"Errore tecnico di sistema durante l'elaborazione AI (Crash Backend). Richiesta revisione manuale."` per distinguere gli errori server dalle decisioni dell'AI.
- **Database (`Supabase`)**:
  - Validato con successo ed aggiornato a `VERDE` il certificato di Lorenzo Monterosso (`16eabf11-de95-45ab-a27d-2c56e5251508`) con scadenza `2027-08-11` e nota esplicativa AI.
- **Git**: Push del commit `e17789b` su `main` completato con successo.

## [2026-08-11] bugfix | Raffinamento Prompt AI, Fix Contraddizione todayStr e Push GitHub (v1.04.34)
- **`api/validate.js`**:
  - **Prompt certificati medici**: eliminata la riga `IMPORTANTE: NON verificare se la data di scadenza è passata...` che contraddiceva la presenza di `todayStr`. La data è ora introdotta con: *"fornita come riferimento contestuale per il formato delle date — NON usarla per calcolare se il certificato è scaduto, la verifica temporale è delegata a un sistema separato."*
  - **Prompt documenti d'identità**: stessa correzione applicata — rimossa la doppia istruzione contraddittoria e riformulata la direttiva `todayStr` come contesto di formato, non di calcolo.
- **Database (`Supabase`)**:
  - Completata manualmente la sanatoria di Sofia Fidati: aggiornata `note_ai` del certificato medico `8f40f7d6` da messaggio generico di crash a `"File PDF senza miniatura. Richiesta revisione manuale."`. (Lo script `sanatoria_sofia.js` aveva usato un `anagrafica_id` errato e non aveva aggiornato il certificato.)
- **Git**: Push a `main` su GitHub completato con successo (`40290a3`). Incluده anche tutte le modifiche v1.04.32 che erano rimaste non pushate.

## [2026-08-11] ui_fix | Ottimizzazione Mobile Header, Ripristino Versione e Fix Registro Tesserati (v1.04.33)
- **`portal/dashboard.html` e `portal/dashboard.js`**:
  - **Header Navigazione Mobile**: Rimosso l'override CSS che nascondeva la versione della piattaforma (`Vs. 1.04.33`), rendendola permanentemente visibile su mobile. Spostato il blocco ruoli utente nell'overlay del menu mobile per liberare spazio nell'header. Convertito il pulsante LOGOUT in un'icona compatta su mobile (`<span class="material-symbols-outlined">logout</span>`).
  - **Registro Tesserati Mobile**: Nascosti i pulsanti "ESPORTA CSV CSEN", "SINCRONIZZA CSEN" e il pannello di log "CSEN Sync Status" su schermi mobile con classi responsive Tailwind (`hidden lg:flex` / `hidden lg:block`). Sostituita la direttiva `space-y-6` con `flex flex-col gap-6` su `#panel-tesserati` per eliminare doppi margini.
  - **Fix Matrice Tessere CSEN**: Assegnato l'ID univoco `tesserati-desktop-table-wrapper` al contenitore della tabella desktop e aggiornate le chiamate JS da `querySelector('#panel-tesserati .overflow-x-auto')` a `getElementById('tesserati-desktop-table-wrapper')`. Risolto il bug per cui la Matrice Tessere CSEN veniva nascosta per errore al posto della tabella desktop su mobile.

---

## [2026-08-11] bugfix | Fix Fallback Miniature PDF, Iniezione Data Prompt Mistral e Colonna Contatti Registro Approvazioni (v1.04.32)
- **`api/validate.js`**:
  - Corretti i bug SQL nei blocchi di fallback per miniatura PDF mancante: aggiornata la colonna `note_ai` in `certificati_medici` e `documenti_identita` al posto di campi inesistenti.
  - Iniettata la stringa della data odierna `"Oggi è il ${todayStr}. "` nei prompt per Mistral AI per certificati e documenti d'identità per migliorare il contesto temporale dell'analisi.
- **`portal/dashboard.html` e `portal/dashboard.js`**:
  - Estesa la visualizzazione della colonna `CONTATTI` (Email, Telefono e WhatsApp) a tutti i riquadri delle tabelle del registro approvazioni ("Soci in Attesa Delibera", "TESSERATI IN ATTESA DI ATTIVAZIONE", "Cronologia Recente Decisioni / Storico").
- **Database (`Supabase`)**:
  - Eseguito script di sanatoria `scripts/sanatoria_sofia.js` che ha aggiornato le note di Sofia Fidati distinguendo l'errato caricamento nello slot documento di identità dal PDF del certificato medico senza miniatura.

---

## [2026-08-10] admin_override | Modifica Allenatore Epika per Umberto Palatroni (Minor) (v1.04.31)
- **Database (`Supabase`)**:
  - Aggiornata la scelta dell'allenatore per l'atleta Umberto Palatroni (`d8e6db60-7bb2-4837-85b4-0a5f4a51db95`), variando l'assegnazione da Kratos (`ID 15`) a **Minor** (`ID 7`).
  - Sincronizzate le tabelle `epika_profili` (`allenatore_id = 7`) e `epika_scab_abilitazioni` (`allenatore_opzione_id = 7`).
  - Storicizzata la modifica nel registro audit `epika_registro_modifiche_profilo`.

---


## [2026-08-10] fix | RLS Iscrizioni Evento — Capogruppo / Vice Capogruppo (v1.04.30)
- **Database (`Supabase`)**:
  - Risolta la limitazione della policy RLS `select_epika_iscrizioni_eventi` (in v3) per cui utenti autenticati con ruolo Capogruppo o Vice Capogruppo (come Abunos) potevano visualizzare solo il proprio record di iscrizione agli eventi.
  - Creata ed eseguita la migrazione `supabase/migration_fix_rls_capogruppo_iscrizioni.sql` che estende la policy SELECT includendo una clausola `OR EXISTS` su `epika_gruppi_storici` con doppio percorso (`g.id = ie.gruppo_storico_id` e fallback via `epika_profili.gruppo_storico_id`).
  - Verificato sul database che tutti i membri iscritti del gruppo (es. Pando e Pietro per Torc Na Moire) risultino ora trasparentemente accessibili a Capogruppo e Vice Capogruppo.

---

## [2026-08-10] bugfix | Fix Modale Epika con Messaggio Contestuale per Blocco Documento/Certificato (v1.04.29)
- **`portal/dashboard.js`**:
  - Risolto il difetto per cui la modale di blocco del pulsante Epika mostrava sempre genericamente "CERTIFICATO MEDICO RICHIESTO" anche quando la causa reale era il Documento d'Identità (scaduto o rifiutato).
  - Implementata diagnosi contestuale puntuale: la modale esplicita ora il motivo esatto (Documento d'Identità Rifiutato / Scaduto / Certificato Medico Rifiutato / Scaduto / Mancante) e reindirizza con il pulsante CTA direttamente alla sezione di rettifica appropriata (`user_documento` o `user_certificato`).
- **Database (`Supabase`)**:
  - Rettificata la data di scadenza del documento d'identità dell'atleta Umberto Palatroni (`2034-06-18`), sbloccando nativamente l'accesso diretto ad Epika.

---


## [2026-08-10] admin_override | Forzatura Tessera Integrativa A per atleta Mauro Corrente
- **Database (`Supabase`)**:
  - Eseguito aggiornamento atomico delle tabelle `registro_tesserati`, `registro_approvazioni` e `utenti` per l'atleta Mauro Corrente (`45ce82bc-1512-47ef-ad6b-dd1143ad9950`), impostando il livello copertura a `INTEGRATIVA_A` (`tessera_integrativa_a`).
  - Verificato con l'RPC `get_user_tessera_livello()` che l'atleta sia ora abilitato nativamente all'iscrizione come **COMBATTENTE** nel Portale Epika, mantenendo intatto lo storico contabile delle ricevute.

---


## [2026-08-10] feature | UX Generali Extra Collassabili su Richiesta (v1.04.27)
- **`portal/epika.html`**:
  - Di default viene esposta la sola casella per il **Generale 1 (Comandante)**.
  - Inserito il pulsante interattivo in stile Stitch/Epika (`+ AGGIUNGI GENERALE`) in alto a destra nella sezione dei generali per Esercito A e B.
  - Raggruppate le caselle per **Generale 2** e **Generale 3** all'interno di un contenitore flessibile collassato (`display: none`).
- **`portal/epika.js`**:
  - Implementate le funzioni `toggleExtraGenerali(esercito)` e `aggiornaVisibilitaExtraGenerali(esercito)`.
  - In fase di caricamento degli schieramenti salvati dall'evento, se Generale 2 o 3 contengono dati, il contenitore viene espanso automaticamente per consentire l'ispezione ed il salvataggio immediato.
- **Versione**: Incrementata la versione globale a `v1.04.27`.

---

## [2026-08-10] feature | Redesign Card Statistiche Tattiche Avanzate Dashboard Eserciti (v1.04.26)
- **`portal/epika.html`**:
  - Rimossa la riga della Forza Totale incorporata nelle card identitarie dei Nomi Esercito A e B per decongestionare l'header.
  - Creata la nuova **Card Statistiche Tattiche Avanzate** (`#adm-eserciti-stats-card`) posizionata direttamente sotto l'header dei Nomi/Generali e prima del layout a colonne dei gruppi.
  - Centralizzato l'indicatore `VS Delta` (`#adm-eserciti-vs-delta`) all'interno della card delle statistiche per una perfetta simmetria visiva.
  - Esposti per ciascun esercito i contatori distinti per: Forza Totale (pts), Combattenti Totali, Non Combattenti, Armature Leggere, Armature Pesanti, Arcieri Puri e Arcieri Ibridi.
- **`portal/epika.js`**:
  - Rifattorizzata `aggiornaCalcoliEserciti()` con accumulo in strutture dati ordinate (`statsA`, `statsB`) in singolo passaggio `O(N)`.
  - Inserito l'aggiornamento in tempo reale di tutte le 14 metriche tattiche al variare degli schieramenti dei gruppi o dei mercenari.
- **Versione**: Incrementata la versione globale a `v1.04.26`.

---

## [2026-08-10] fix | Offloading calcolo scadenze da Mistral a Javascript Guardrail e Visualizzazione note_ai in Dashboard
- **`api/validate.js`**:
  - Modificati i prompt di Mistral AI per certificati medici e documenti d'identità sollevando l'LLM dal calcolo matematico della scadenza temporale.
  - Riformulata la logica del Guardrail Javascript: JS valuta autonomamente e con precisione deterministica la scadenza temporale. Se il documento è scaduto viene forzato a `ROSSO`, altrimenti conserva il giudizio formale/visivo formulato dall'AI (`VERDE`, `GIALLO` o `ROSSO`).
- **`portal/dashboard.js`**:
  - Inclusi i campi `note_ai` e `data_scadenza` nella select della funzione `loadCertificatiGialli()`.
  - Aggiunta la visualizzazione delle note stilizzate di Mistral AI (`note_ai`) sia per i certificati in stato `GIALLO` che per i documenti d'identità in attesa di revisione manuale.
- **Database (Supabase)**:
  - Applicata sanatoria sui record bloccati di Guglielmo Vaccaro e Arianna Gentili ripristinando i loro documenti validi in stato `VERDE`.

---

## [2026-08-10] fix | Inserimento Approvazione Mancante per Fabio Tritapepe — Accesso Epika Ripristinato
- **Database (Supabase)**:
  - Inserito il record mancante in `registro_approvazioni` per l'anagrafica `aa2ba36d-adfd-46c9-aba7-06eb6432c653` (Fabio Tritapepe).
  - Parametri inseriti: `tipo = TESSERATO`, `stato = APPROVATO`, `livello_copertura = INTEGRATIVA_A`, `data_richiesta = 2025-03-26`, `data_decisione = 2025-03-26`.
- **Esito Verifiche**:
  - Il 100% dei tesserati attivi (104 su 104) possiede ora un record di approvazione valido con `stato = 'APPROVATO'`.
  - Ripristinato l'accesso immediato ed automatico al Portale Epika per l'utente sia da Dashboard Desktop che da Mobile.
- **Nessuna modifica al codice sorgente / Nessun bump di versione necessario.**

---

## [2026-08-07] fix | Ripristino Apertura Portale Epika nella Stessa Scheda Browser (v1.04.22)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Modificata la funzione centralizzata `openEpika()` sostituendo `window.open(epikaUrl, 'portale_epika')` con `window.location.href = epikaUrl`.
  - Risolti i problemi di stabilità, bug cross-tab e blocco dei pop-up browser garantendo l'apertura diretta di Epika nella stessa finestra.
- **Versione**: Incrementata la versione globale a `v1.04.22`.

---

## [2026-08-07] feat | Supporto Modalità Assistenza Admin (Impersonazione Utente) nel Portale Epika (v1.04.21)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Aggiornato `apriAssistenzaTesserato()` per impostare dinamicamente `href = "epika.html?impersonate_id=${utenteId}"` sul link `#tab-btn-user-epika` quando l'Admin entra nella vista tesserato.
  - Aggiornato `chiudiAssistenzaTesserato()` per ripristinare il link originale `href = "epika.html"` alla chiusura della simulazione.
- **Frontend Epika (`portal/epika.js`)**:
  - Inserita in `initPortal()` la logica di impersonazione sicura: legge `impersonate_id` dai parametri URL e ne valida l'accesso verificando che l'utente loggato Auth sia un Presidente, Vice Presidente o Admin Epika.
  - In caso di esito positivo, `currentUser.id` viene sostituito con `impersonate_id` e vengono ricaricati i record `userData`, `epikaProfile` e `currentUserTessera` dell'atleta impersonato, garantendo la visualizzazione istantanea della scheda personaggio, statistiche e abilitazioni dell'atleta.
  - Attivato il banner d'avviso `#epk-simulation-banner` ("⚠️ MODALITÀ ASSISTENZA ADMIN: Stai visualizzando il Portale Epika di [Nome Atleta]") con tasto rapido "CHIUDI SCHEDA".
  - In caso di tentativo non autorizzato (utente non admin), il parametro viene ignorato in totale sicurezza fall-backando sul profilo reale.
- **Versione**: Incrementata la versione globale a `v1.04.21`.

---

## [2026-08-06] feature | Tasto e Vista Gestione Eserciti Read-Only per Direttivo (v1.04.18)
- **`portal/epika.html`**:
  - Assegnati gli ID `adm-eserciti-btn-salva` e `adm-eserciti-btn-coeff-salva` ai bottoni di salvataggio per la gestione dello stato Read-Only.
- **`portal/epika.js`**:
  - Rimosso il vincolo `isReadOnly()` sulla generazione del pulsante viola `GESTIONE ESERCITI` nell'elenco eventi, rendendolo accessibile sia all'Amministratore che al Direttivo.
  - Aggiornata `mostraPannelloEserciti()` per rilevare lo stato Read-Only: disabilita tutti gli input testuali (nomi eserciti, gridi, generali) e nasconde il tasto `SALVA SCHIERAMENTI`.
  - Aggiornata `apriModalCofficientiEserciti()` per disabilitare gli input dei coefficienti e nascondere il tasto `CONFERMA` se aperto da un Direttivo.
  - Aggiornata `renderTatticaEserciti()` per omettere i bottoni di modifica/spostamento gruppi e mercenari in modalità Read-Only, mostrando uno stato pulito e informativo.
  - Aggiunti controlli di sicurezza `if (isReadOnly()) return;` all'inizio delle funzioni JS di modifica (`salvaSchieramentiEserciti`, `confermaCoefficientiEserciti`, `impostaGruppoSchieramento`, `impostaMercenarioSchieramento`).

---

## [2026-08-06] style | Redesign Grafico e Funzionale Dashboard Capogruppo tramite Stitch (v1.04.17)
- **`portal/epika.css`**:
  - Aggiunti i componenti stilistici del design system Stitch (`.epk-stats-grid`, `.epk-stat-card`, `.epk-filter-box`, `.epk-dark-input`, `.epk-dark-select`, `.epk-status-badge`, `.epk-role-badge`, `.epk-tag`, `.epk-pay-badge`, `.epk-days-badge`, `.epk-table-card`).
- **`portal/epika.html`**:
  - Ristrutturata l'interfaccia inserendo le KPI Stats Cards (Membri Totali, Iscritti, Non Iscritti, Tasso Adesione), i controlli filtro scuri integrati ed il contenitore tabella lithic card.
- **`portal/epika.js`**:
  - Implementate le funzioni formatattatrici `formattaGiorniStitch`, `formattaArrivoPartenzaStitch` ed `formattaEquipaggiamentoStitch` per convertire stringhe grezze in tag/micro-badge ordinati ed eleganti.
  - Aggiornato il rendering di `disegnaTabellaCapoEventoPartecipanti()` con aggiornamento in tempo reale delle KPI Cards e dello stato degli atleti.

---

## [2026-08-06] feature | Vista Completa Partecipazione Gruppo ed Eventi per Capigruppo (v1.04.16)
- **`portal/epika.html`**:
  - Inserito il badge di sintesi iscrizioni gruppo (`#epk-capo-evento-stats-badge`).
  - Aggiunta la barra di ricerca/filtraggio avanzata `#epk-capo-evento-filtri-bar` (ricerca testuale per nome/cognome/nome di battaglia, stato iscrizione, ruolo, armatura, stato pagamento) con pulsante di reset.
  - Aggiornate le colonne della tabella aggiungendo l'esplicita colonna `STATO EVENTO`.
- **`portal/epika.js`**:
  - Rifattorizzata `mostraIscrittiEventoCapo(eventoId, eventoTitolo)`: ora carica l'intera anagrafica profili del gruppo gestito e fonde *in-memory* i dati con le iscrizioni dell'evento.
  - Creata la funzione `disegnaTabellaCapoEventoPartecipanti()`: esegue il filtraggio in tempo reale, ordina ponendo i non iscritti in fondo ed ordinando per nome di battaglia, e renderizza visivamente gli atleti eliminando i testi "N/D".
  - Creata la funzione `resetFiltriCapoEvento()`.

---

## [2026-08-06] bugfix | Sincronizzazione Automatica Allenatore da Lista Generale (v1.04.15)
- **Database (Data Patch)**:
  - Eseguito l'allineamento dei dati per LESLAN, impostando l'allenatore su MINOR (`allenatore_id = 7`) nelle tabelle `epika_profili`, `epika_scab_abilitazioni` e nelle iscrizioni agli eventi `epika_iscrizioni_eventi`.
- **`portal/epika.js`**:
  - Aggiornata la funzione `salvaTuttaLaListaGenerale()`: salvando le modifiche per l'anno corrente, il sistema sincronizza in tempo reale anche `epika_profili.allenatore_id`, `epika_scab_abilitazioni.allenatore_opzione_id` per il 2026 ed il campo JSONB `dettagli.allenatore_id` nelle iscrizioni agli eventi dell'anno.
  - Aggiornata `mostraDashboardEvento()` per ricavare l'allenatore risolvendo in tempo reale il profilo aggiornato (`profilo.allenatore_id || dett.allenatore_id`).

---


## [2026-08-06] refactor | Semplificazione Navigazione Portale Epika (Navigazione Diretta Universale) (v1.04.14)
- **`portal/dashboard.js`**:
  - Rimossa completamente la logica `window.open` e il relativo fallback dalla funzione `openEpika`.
  - Impostata la navigazione diretta (`window.location.href`) come unico standard universale per tutti gli utenti (Atleti e Admin), su tutte le piattaforme (Mobile e Desktop), garantendo la massima robustezza (100% immune ai Popup Blocker) e totale coerenza UX.

---


## [2026-08-06] bugfix | Implementazione Fallback Antiblocco Popup per Navigazione Portale Epika (v1.04.13)
- **`portal/dashboard.js`**:
  - Risolto il bug critico che impediva l'accesso ad Epika sui browser Desktop con Blocco Pop-up (Popup Blocker) attivo.
  - Aggiornata la funzione `openEpika` per includere una navigazione ibrida: tenta l'apertura in nuova scheda (`_blank`) e, in caso di soppressione o errore del popup (`win === null` / `win.closed`), esegue il fallback istantaneo con navigazione nella stessa finestra (`window.location.href`).

---


## [2026-08-06] bugfix | Risoluzione falso allarme documenti identità senza data e sanatoria scadenze AI (v1.04.12)
- **`portal/dashboard.js`**:
  - Creata ed integrata la funzione helper `isDocumentoIdentitaScaduto(idDoc)`.
  - Risolto il falso allarme di "Documento d'identità scaduto" nella Panoramica (Home) per tutti gli utenti il cui documento d'identità è approvato come `VERDE` ma privo di una data di scadenza registrata (`data_scadenza` IS NULL), eliminando la discrepanza tra la Home ed il tab Documento d'Identità.
- **`scripts/fix-doc-dates.js`**:
  - Eseguita la sanatoria automatizzata via Mistral AI Vision sui documenti approvati, recuperando ed aggiornando le date di scadenza reali nel database.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.12`.

---

## [2026-08-06] fix | Fix Validazione AI PDF (Certificati e Documenti) & Inclusione pdf.js (v1.04.11)
- **`index.html`**:
  - Inserite le librerie `pdf.js` e `pdf-lib` nell'header della pagina pubblica per abilitare la generazione lato client delle miniature `_thumb.jpg` in fase di registrazione utente.
- **`api/validate.js`**:
  - Risolto il bug di firma token HMAC per le miniature Supabase Storage in `certificati_medici` e `documenti_identita`. L'API ora estrae il percorso relativo puro, richiede una firma nativa a Supabase con `createSignedUrl` ed applica un fallback controllato a `GIALLO` senza crashare se la miniatura non esiste.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.11`.

---

## [2026-08-06] refactor | Riposizionamento e Refactoring Certificati Medici GIALLO nel Registro Approvazioni (v1.04.10)
- **`portal/dashboard.html`**:
  - Spostato il contenitore `<div id="giallo-certificati-container">` dal tab `#panel-tesserati` (Registro Tesserati) al tab `#panel-approvazioni` (Registro Approvazioni), posizionandolo sotto la sezione dei Documenti d'Identità in Attesa di Verifica.
- **`portal/dashboard.js`**:
  - Sostituita la funzione in-memory `renderGialloCertificati()` con la funzione asincrona `loadCertificatiGialli()` basata su query diretta alla tabella `certificati_medici` (con join su `anagrafiche`), eliminando race condition e dipendenze da `tesseratiData`.
  - Integrato l'innesco di `loadCertificatiGialli()` sia all'avvio in `loadApprovazioni()` sia al click sul pulsante `#tab-btn-approvazioni`.
  - Rimosso l'invocazione ridondante da `loadTesserati()`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.10`.

---

## [2026-08-06] fix | Risoluzione Crash OTP 500 & Hardening Upsert Silente (v1.04.09)
- **Database (Supabase)**:
  - Eseguita sanatoria SQL eliminando il record corrotto/incompleto di `frstuffer@gmail.com` da `auth.users`, `public.utenti` e `public.atti_adesione`.
- **`api/otp-verify.js`**:
  - Inserito un null-guard sui campi anagrafici critici (`codice_fiscale`, `nome`, `cognome`, `indirizzo`) per restituire un errore HTTP 400 controllato in caso di dati mancanti anziché sollevare un crash 500 (`TypeError: Cannot read properties of null`).
- **`portal/registrazione.js`**:
  - Aggiunto un controllo di verifica post-upsert (`.select('codice_fiscale, nome').maybeSingle()`) prima dell'invio dell'OTP. Questo rileva e blocca all'istante eventuali fallimenti silenti dell'upsert (causati da sessioni non ancora propagate o RLS) senza incorrere nei falsi negativi di `.select().single()`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.09`.

---

## [2026-08-05] feature | Legenda Stati Tessera CSEN per Account Admin nella Sidebar Dashboard (v1.04.07)
- **`portal/dashboard.html`**:
  - Inserito il riquadro `#sidebar-csen-legend` nella sidebar sinistra subito sotto la carta `LIVELLO AUTORIZZAZIONE`, contenente la legenda dettagliata dei 6 stati della colonna Tessera CSEN (Tessera Ufficiale Verde, Codice Richiesta Cyan, Rinnovo Inviato Arancione, In Attesa N. CSEN Blu, Da Comunicare Giallo, Errore Sync Rosso).
- **`portal/dashboard.js`**:
  - Integrata la visibilità condizionale del box legenda per gli account Admin/Board nel contesto direttivo.
  - Implementata la funzione `toggleCsenLegend()` per l'apertura/chiusura della fisarmonica.
  - Aggiunto l'hook in `switchTab('tesserati')` che espande automaticamente la legenda quando l'amministratore apre il Registro Tesserati.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.07`.

---

## [2026-08-05] fix | Risoluzione Automatica Allenatore di Riferimento da Allievi SCAB & Fix Modale Iscrizione
- **Database (Supabase)**:
  - Aggiornata la RPC `crea_richiesta_abilitazione`: quando l'utente seleziona un Allievo Allenatore, la procedura ora assegna nel profilo utente `epika_profili.allenatore_id` l'Allenatore di Riferimento risolto (`v_allenatore_id`) anziché l'ID dell'allievo.
  - Eseguito Data-Fix retroattivo su `epika_profili`: riallineati tutti i profili utente collegati ad allievi allenatori (incluso il profilo di Chiara Traglia - MAKHAIRA) impostando l'Allenatore di Riferimento corretto (es. Tito per la palestra Itinerante).
- **`portal/epika.js`**:
  - Estesa la query di caricamento della modale di iscrizione evento per supportare sia `allenatore` che `scab_allievo_allenatore` organizzati in due distinti `<optgroup>`.
  - Verificato il salvataggio senza blocchi del form d'iscrizione.

---

## [2026-08-05] fix | Risoluzione Errore Duplicate Key Caricamento Documenti & Hardening Validate AI (v1.04.05)
- **Database (Supabase)**:
  - Eliminato l'indice `UNIQUE` errato `documenti_identita_anagrafica_id_idx` su `public.documenti_identita(anagrafica_id)`.
  - Ricreato l'indice come standard `INDEX` non-unico. Questo sblocca il caricamento dei documenti per Robert Miroslav e per tutti gli utenti esistenti, consentendo lo storico documenti e i doppi documenti per minorenni (personale + tutore).
- **`api/validate.js`**:
  - Applicato l'hardening al ramo di UPDATE per `targetType === 'doc'`: se `doc_id` non è specificato, aggiorna solo l'ultimo documento con `stato_validazione = 'IN_ATTESA'` anziché rischiare un UPDATE indiscriminato su tutti i documenti dell'anagrafica.
- **`portal/dashboard.js`**:
  - Sostituiti gli `alert()` bloccanti nel gestore di upload `handleDocUploadWidget` con le notifiche toast moderne `showToastNotification()`.
- **Global Bump**: Versionamento globale aggiornato a `v1.04.05`.

---

## [2026-08-05] fix | Allineamento registro_approvazioni per 4 Tesserati Attivi (v1.04.05)
- **Database (Supabase)**: Inseriti i record mancanti in `public.registro_approvazioni` (stato = `APPROVATO`) per i 4 tesserati con `registro_tesserati.stato_tesseramento = 'ATTIVO'` ma privi di record approvazione: **Arianna Pagnotta**, **Giulio De Vecchis**, **Paolo Paolantoni**, **Chiara Traglia**. Il record mancante bloccava l'accesso al portale Epika nonostante tessera CSEN e certificato medico fossero regolari. Script eseguito idempotente via `INSERT ... SELECT ... LEFT JOIN ... WHERE ra.id IS NULL`.

---


## [2026-08-05] bugfix | Correzione Icona Material Symbols e Query Relazionale Supabase in Modalità Assistenza (v1.04.04)
- **`portal/dashboard.js`**:
  - Sostituito l'SVG grezzo inline nei pulsanti della vista Assistenza (sia per la tabella Desktop che per le Card Mobile) con l'icona ufficiale Google Material Symbols `<span class="material-symbols-outlined">visibility</span>`, risolvendo il problema del rendering a riquadro vuoto.
  - Risolto l'errore Postgres `column anagrafiche_1.indirizzo does not exist` nella funzione `apriAssistenzaTesserato` correggendo la stringa relazionale Supabase `.select()` ed allineandola all'interrogazione nativa di `checkSession()`.
- **Global Bump**: Bumped application version to `v1.04.04` across 22 files.

---

## [2026-08-05] feature | Implementazione Modalità Assistenza Tesserato (pulsante Occhio Admin nel Registro Tesserati) (v1.04.03)
- **`portal/dashboard.html`**:
  - Inserito il banner fisso `#banner-assistenza-admin` (con gradiente viola/indaco e pulsante di chiusura rapida) in cima al `body`.
- **`portal/dashboard.js`**:
  - Inserito il pulsante con l'icona dell'Occhio 👁️ nella colonna Azioni del **Registro Tesserati** (sia per la tabella Desktop che per le Card Mobile), ad uso esclusivo dei ruoli `presidente` e `vice_presidente`.
  - Implementate le funzioni `apriAssistenzaTesserato(utenteId, nomeCompleto)` e `chiudiAssistenzaTesserato()`: la prima effettua lo swap temporaneo di `currentUser` e `currentUserProfile` col profilo dell'atleta selezionato e attiva il contesto `'athlete'`, permettendo all'Admin di esplorare e verificare esattamente ciò che il tesserato vede sul suo schermo; la seconda ripristina la sessione Admin e torna al Registro Tesserati.
- **Global Bump**: Bumped application version to `v1.04.03` across 22 files.

---

## [2026-08-05] bugfix | Inclusione tabella documenti_identita nel Dossier Tesserato dell'Admin (v1.04.02)
- **`portal/dashboard.js`**:
  - Aggiornata la funzione `openDossierModal` per interrogare la tabella relazionale `documenti_identita` anziché affidarsi al campo deprecato `ut.documento_identita_url`.
  - Risolto l'avviso errato "Nessun documento caricato" nel modale Dossier dell'Admin, mostrando ora lo stato di validazione reale (VERDE/ROSSO/IN_ATTESA), la data di scadenza ed il pulsante per visualizzare il file.
- **Global Bump**: Bumped application version to `v1.04.02` across 22 files.

---

## [2026-08-05] bugfix | Implementazione guardrail deterministici date scadenze in api/validate.js, sanatoria record e correzione rollover minor (v1.04.01)
- **`api/validate.js`**:
  - Inserita la comparazione temporale deterministica in Javascript (`expiryDate >= today`) sia per i certificati medici che per i documenti d'identità.
  - Risolto il fenomeno di allucinazione probabilistica del modello AI Vision (`pixtral-12b-2409`) sulle comparazioni delle date di scadenza, applicando l'override automatico a `VERDE` quando una data futura viene scambiata per passata dall'LLM.
- **Supabase Database (`documenti_identita`)**:
  - Applicata sanatoria SQL sul record di Arianna Pagnotta (`id: 9e34fa9b-30dc-42ea-8d86-6be26cd12df8`), correggendo lo stato da `ROSSO` a `VERDE` (scadenza 14/01/2029) e ripristinando immediatamente la sua utenza.
- **`scripts/bump-version.js`**:
  - Inserito il rollover automatico della versione minor (da `1.03.99` a `1.04.00`) al superamento della patch 99.
- **Global Bump**: Corrected application version to `v1.04.01` across 22 files.

---

## [2026-08-05] bugfix | Inserimento hook loadUserDocumento in switchTab per sblocco caricamento documento d'identità (v1.04.00)
- **`portal/dashboard.js`**:
  - Inserita la chiamata automatica a `loadUserDocumento()` all'interno dell'event handler universale `switchTab('user_documento')`.
  - Risolto il blocco su "Caricamento in corso..." che si verificava quando l'utente (specialmente da smartphone o da banner Panoramica) apriva la sezione Documento d'Identità, sbloccando immediatamente il rendering della scheda ed il form di upload per caricare il file.
- **Global Bump**: Bumped application version to `v1.04.00` across 22 files.

---

## [2026-08-05] bugfix | Inclusione documenti_identita nella query di sessione utente e risoluzione falso allarme Panoramica (v1.03.99)
- **`portal/dashboard.js`**:
  - Inclusa la relazione `documenti_identita(*)` all'interno della `.select()` della funzione `checkSession()` (linea 325) durante il recupero relazionale dell'anagrafica utente.
  - Risolto lo sfasamento di stato (State Desync) per cui `anag.documenti_identita` risultava `undefined` nella Panoramica producendo l'avviso errato "DOCUMENTO D'IDENTITÀ MANCANTE", a fronte di un documento regolarmente approvato e valido.
- **Global Bump**: Bumped application version to `v1.03.99` across 22 files.

---

## [2026-08-05] docs | Aggiornamento GDPR Privacy Policy - Provider Mistral AI SAS (v1.03.98)
- **`privacy.html`**:
  - Integrazione esplicita di **Mistral AI (Mistral AI SAS)** all'interno del paragrafo *Destinatari dei Dati e Responsabili del Trattamento* (Art. 28 GDPR) come provider europeo per la validazione automatizzata e l'analisi dei certificati medici e dei documenti di riconoscimento.
- **Global Bump**: Bumped application version to `v1.03.98` across 22 files.

---

## [2026-08-05] bugfix | Correzione RPC elimina_utente_completo e Guardrail Sicurezza (v1.03.97)
- **Supabase Database RPC (`public.elimina_utente_completo`)**:
  - Risolto il bug di *Type Mismatch* in Postgres convertendo la variabile `caller_role` in array `v_caller_roles public.ruolo_utente[]` e applicando la ricerca `ANY()` per supportare correttamente l'assegnazione da `get_user_role()`.
  - Aggiunto il **Guardrail di Sicurezza** (`v_has_history`) in linea con la regola EPIKA di storicizzazione: impedisce l'eliminazione fisica distruttiva se l'utente possiede verbali legali, spese o registro audit, suggerendo la disattivazione.
  - Estesa la cancellazione a cascata bottom-up per includere tabelle satellite dell'ecosistema Epika (`registro_consensi`, `epika_profili`, `epika_iscrizioni_eventi`, `epika_presenze_eventi`, `presenze_eventi`, `iscrizioni_eventi`), azzerando il rischio di Foreign Key Constraint Error (HTTP 400).
- **Global Bump**: Bumped application version to `v1.03.97` across 22 files.

---

## [2026-08-05] feature | Wording Documenti, Nuova Frase Scadenza e Pulsante ELIMINA Universale Admin (v1.03.96)
- **`portal/dashboard.js`**:
  - Dinamicizzato il titolo del box `#user-cert-title` nella Panoramica Utente per alternare correttamente l'icona ed il testo "DOCUMENTO D'IDENTITÀ" vs "CERTIFICATO MEDICO" vs "DOCUMENTAZIONE UTENTE".
  - Aggiornato il wording dei documenti respinti/mancanti introducendo la dicitura "ERRATO O MANCANTE" per massima chiarezza verso l'utente.
  - Abilitato il pulsante **ELIMINA** (richiamando `eliminaUtente` / RPC `elimina_utente_completo`) in tutte le tabelle dell'area Admin (*Pending Soci*, *Pending Tesserati*, *Pending Pagamenti*, *Storico*) per i ruoli direttivi (`presidente`, `vice_presidente`, `segretario`, `tesoriere`).
- **`api/cron-scadenze.js` & `scripts/send-suspended-emails-cli.js`**:
  - Aggiornata la dicitura della mail di sospensione tesseramento includendo *"Dal giorno successivo alla scadenza e fino al caricamento e alla successiva approvazione..."*.
- **`portal/dashboard.html`**:
  - Aggiornata la colonna dello storico delibere in "Dettaglio / Azioni".
- **Global Bump**: Bumped application version to `v1.03.96` across 22 files.

---

## [2026-08-05] feature | Gestione Unificata Stati Documenti di Identità e Certificati Medici (v1.03.95)
- **`portal/dashboard.js`**:
  - Estesa la logica di valutazione della Panoramica Utente (`renderContextUI`) e del Banner Alert Superiore (`legacy-cert-alert-banner`) per interrogare in modo combinato sia `getCertInfo(anag)` che `getIdDocInfo(anag)`.
  - Applicata una rigorosa gerarchia di blocco/priorità degli avvisi (ROSSO/SCADUTO > MANCANTE > GIALLO > VERDE) che garantisce la corretta priorità visiva agli avvisi di rifiuto del documento d'identità rispetto a certificati in attesa.
  - Aggiunti pulsanti d'azione dedicati che reindirizzano direttamente alla sezione "DOCUMENTO D'IDENTITÀ" per facilitare il ricaricamento del documento respinto.
- **Global Bump**: Bumped application version to `v1.03.95` across 22 files.

---

## [2026-08-05] feature | Architettura Zero-Server-Load per Validazione AI e Rendering PDF (v1.03.94)
- **`portal/registrazione.html` & `portal/dashboard.html`**:
  - Incluso il tag CDN `pdf.js` per abilitare la generazione di thumbnail JPEG lato client.
- **`portal/registrazione.js` & `portal/dashboard.js`**:
  - Creata la funzione `generatePdfThumbnail(fileOrBlob)` basata su HTML5 Canvas e Mozilla `pdf.js`.
  - Integrato il caricamento automatico delle thumbnail JPEG (`_thumb.jpg`) per tutti i PDF caricati dagli utenti per certificati medici e documenti d'identità.
- **`api/validate.js`**:
  - Implementata la risoluzione automatica delle thumbnail `_thumb.jpg` per tutti i file PDF inviati a Mistral Pixtral AI.
  - Racchiuso il flusso AI in blocchi `try-catch` resilienti per evitare crash backend e forzare il fallback pulito a `GIALLO`.
  - Sanitizzati i messaggi di note salvati nel DB (`note_ai`) per eliminare dump JSON / API error grezzi dalla dashboard direttiva.
- **Global Bump**: Bumped application version to `v1.03.94` across 22 files.

---

## [2026-08-05] hotfix | Fix ReferenceError apiBase in registrazione.js (v1.03.93)
- **`portal/registrazione.js`**:
  - Risolto bug critico `ReferenceError: apiBase is not defined` durante la validazione finale OTP (`btnValidaOtp`).
  - Dichiarata la costante unificata `API_BASE` nello scope globale di `DOMContentLoaded` (subito dopo l'auto-configurazione Dev Mode).
  - Effettuato refactoring DRY rimuovendo le dichiarazioni ridondanti locali di `apiBase` e sostituendo l'interpolazione con `API_BASE`.
- **Global Bump**: Bumped application version to `v1.03.93` across 22 files.

---

## [2026-08-03] feature | Disabilitazione Rateizzazione Interna per il Trimestrale e Validazione Backend (v1.03.89)
- **`api/create-checkout-session.js`**: Implementata validazione deterministica lato server per `isInstallment` e `numRate` basata sul nome del piano. Per i piani Trimestrali (`trimest`/`3 mes`), la rateizzazione viene forzata a `false` nel backend prevenendo qualsiasi elusione via API.
- **`portal/dashboard.js`**: Disabilitata la rateizzazione interna nell'interfaccia della `openCheckoutModal` per i piani Trimestrali (mantenendo il codice commentato per eventuale ripristino futuro).

---

## [2026-08-03] fix | Aggiornamento Dicitura Promemoria Scadenza Certificato Medico (v1.03.88)
- **`api/cron-scadenze.js`**:
  - Aggiornata la dicitura evidenziata in rosso per i promemoria di scadenza a 30 e 15 giorni.
  - Testo variato in: *"Dal giorno successivo alla scadenza e fino al caricamento e alla successiva approvazione del nuovo certificato medico, l'accesso ai corsi, agli eventi e alle attività sportive sarà sospeso. Il portale sarà limitato esclusivamente al caricamento della documentazione."*

---

## [2026-08-03] fix | Fix Epika Access su iPhone, Smart Navigation (Mobile vs Desktop) & Hamburger Menu Fix (v1.03.87)
- **`portal/dashboard.html`**:
  - Trasformato `#tab-btn-epika-presidente` da tag `<a>` a `<button>` uniformandolo a `#tab-btn-user-epika`.
  - Corretta la funzione `populateMobileMenu()` per supportare pulsanti con gestori di eventi `.onclick` programmatici Javascript (`typeof btn.onclick === 'function'`), risolvendo il bug critico per cui il tocco su "Portale Epika" nel menu hamburger mobile di iPhone veniva ignorato.
- **`portal/dashboard.js`**:
  - Creata la funzione centralizzata `openEpika(isAdmin)` che rileva il dispositivo.
  - **Su Mobile/iPhone**: Navigazione nella stessa finestra (`window.location.href = targetUrl`), evitando il blocco pop-up di Safari iOS ed il partizionamento della sessione Supabase in `localStorage`.
  - **Su Desktop**: Navigazione in nuova scheda (`window.open(targetUrl, 'portale_epika')`), mantenendo aperta la dashboard principale.
  - Collegati sia `#tab-btn-user-epika` che `#tab-btn-epika-presidente` alla funzione `openEpika`.

---

## [2026-08-01] fix | Gating Epika: query semplificata, errore con return, redirect silenzioso (v1.03.86)
- **`portal/epika.js`**:
  - Rimossi i nested select `registro_tesserati(stato_tesseramento)` e `registro_soci(stato_socio)` dalla query di gating (potevano causare errori RLS con anon key, portando a `userData=null` → redirect silenzioso).
  - Aggiunto `return` dopo `userError` per evitare prosecuzione con dati null.
  - Eliminato l'`alert()` bloccante nel gating check; redirect cambiato in `dashboard.html?epika_blocked=1`.
- **`portal/dashboard.js`**:
  - Aggiunta gestione del parametro `epika_blocked=1` in `renderContextUI()`: mostra il modal informativo senza alert bloccanti su iOS Safari.

---

## [2026-08-01] fix | Definizione showEpikaAccessModal, Navigazione Stesso Tab su iOS e Tolleranza Epika (v1.03.85)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Risolto il bug critico `TypeError: showEpikaAccessModal is not a function` definendo esplicitamente la funzione globale in `dashboard.js`.
  - Sostituito `window.open('epika.html', 'portale_epika')` con `window.location.href = 'epika.html'` per evitare il blocco Pop-Up di iOS Safari su iPhone e garantire la conservazione della sessione Supabase.
- **Frontend Epika (`portal/epika.js`)**:
  - Aggiornata la select query e la logica `isApprovedAndPaid` per considerare sia `registro_approvazioni`, sia `registro_tesserati` attivi e `registro_soci` attivi per la massima resilienza.

---

## [2026-08-01] feat | Tasto Epika Sempre Visibile, Modal Intercept & Allineamento 42 Atleti Storici (v1.03.84)
- **Database & Script (`scripts/align_legacy_active_tesserati.js`)**:
  - Eseguito l'allineamento automatico dei registri di approvazione per tutti i 42 tesserati/soci storici attivi (inclusa Michelle Scibelli `michellescibelli@icloud.com`).
- **Frontend Dashboard (`portal/dashboard.html` & `portal/dashboard.js`)**:
  - Reso il pulsante **PORTALE EPIKA** (`#tab-btn-user-epika`) sempre visibile per tutti gli utenti sia su Desktop che su Mobile/iPhone.
  - Implementata la gestione avanzata dell'intercettazione click: se l'utente è in regola entra direttamente, altrimenti viene mostrato un modal popup moderno con spiegazione dettagliata e pulsante d'azione rapida (CTA).
  - Inserito il messaggio personalizzato dedicato agli atleti della vecchia piattaforma per l'aggiornamento del certificato medico.
- **Frontend Epika (`portal/epika.js`)**:
  - Aggiornato l'alert di blocco per tentativi di accesso diretto via URL con messaggio chiaro e comprensibile.

---

## [2026-08-01] fix | Sanatoria Quota Nicolò Rottura & Fallback Quota Dinamico Checkout (v1.03.83)
- **Database & Sanatoria (`scripts/fix_nicolo_rottura.js`)**:
  - Sanato l'account dell'utente Nicolò Rottura (`nicolorottura@gmail.com`), impostando `quota_totale = 20.00` € su DB in base alla sua `tessera_integrativa_a`.
- **Frontend Checkout (`portal/pagamento.js`)**:
  - Implementata la logica di fallback di sicurezza: se un utente in stato `IN_ATTESA_PAGAMENTO` accede alla pagina di pagamento con `quota_totale = 0`, il sistema non mostra più un errore bloccante, ma calcola automaticamente la quota spettante da `configurazioni_tariffe` in base a `tipo_adesione` e `tipo_tessera`, aggiornando la voce su DB in background.

---

## [2026-08-01] feat | Navigazione Sequenziale Rapida Gruppi Storici Admin (v1.03.82)
- **Frontend Epika (`portal/epika.html` & `portal/epika.js`)**:
  - Aggiunti i pulsanti di navigazione `◀ PRECEDENTE` (`#epk-btn-prev-gruppo`) e `SUCCESSIVO ▶` (`#epk-btn-next-gruppo`) nella barra superiore del pannello `GESTIONE GRUPPO`.
  - Creata la variabile di cache `adminGruppiListCache` mantenuta sincronizzata in ordine alfabetico con l'elenco della vista principale.
  - Implementata la funzione `navigaGruppoDettaglio(direzione)` e la gestione dinamica degli stati abilitato/disabilitato per i tasti ai margini della lista.
- **Versione**: Incrementata la versione globale a `v1.03.82`.

---

## [2026-08-01] feat | Apertura Portale Epika in Nuova Tab Browser & Smart Tab (v1.03.81)
- **Frontend Dashboard (`portal/dashboard.html`)**:
  - Convertiti i pulsanti della sidebar laterale "PORTALE EPIKA" (`#tab-btn-user-epika`) e "GESTIONE EPIKA" (`#tab-btn-epika-presidente`) da elementi `<button>` con `window.location.href` a tag ancora nativi `<a>` con `target="portale_epika"`.
  - Attivato il comportamento **Smart Tab**: il primo click apre Epika in un nuovo tab; i click successivi riportano in primo piano la scheda Epika già aperta evitando la duplicazione di schede browser.
  - Aggiornato il selettore JS del generatore del menu mobile overlay (`const sidebarButtons = document.querySelectorAll('aside [id^="tab-btn-"]')`) e integrato l'invocazione sincrona diretta di `window.open(href, target)` per aggirare i pop-up blocker dei browser mobile (iOS Safari).
- **Versione**: Incrementata la versione globale a `v1.03.81`.

---

## [2026-07-31] data | Allineamento Integrale Soci Storici e Direttivo fino al 31/12/2026
- **Database & Script (`scripts/align_historic_soci.js`)**:
  - Eseguito l'allineamento completo del database per tutti i 7 account storici con ruolo `socio_approvato` o ruoli di Direttivo (incluso l'account del Presidente `nexglg@gmail.com`).
  - Per ciascun account è stata garantita la piena regolarità fino al **31/12/2026**:
    - **Registro Approvazioni**: Inserito record con `stato = 'APPROVATO'` e `livello_copertura = 'BASE'`.
    - **Certificati Medici**: Impostato certificato con `stato_validazione = 'VERDE'` e `data_scadenza = '2026-12-31'`.
    - **Registro Soci**: Impostato `stato_socio = 'ATTIVO'` e `quota_scadenza = '2026-12-31'`.
    - **Utenti**: Azzerato eventuale saldo insoluto (`quota_totale = 0.00`).
  - Mantenute inalterate e trasparenti le regole di sicurezza del frontend su `epika.js` e `dashboard.js`.

---

## [2026-07-31] fix | Bugfix Quota Totale Registrazione, Guarding Portale Epika & Sanatoria Valeria Bosco (v1.03.80)
- **Frontend Registrazione (`portal/registrazione.js`)**:
  - Corretto il bug critico per cui la `quota_totale` calcolata a schermo non veniva inserita nel payload della funzione `utenti.upsert()`. Ora l'importo corretto (es. €25.00) viene salvato su DB al momento dell'iscrizione.
- **Frontend Dashboard & Epika (`portal/dashboard.js`, `portal/epika.js`)**:
  - Implementata la regola tassativa di visibilità del pulsante **Epika** (`#tab-btn-user-epika`): il pulsante viene nascosto se l'utente non ha la registrazione E il pagamento completati (`registro_approvazioni.stato === 'APPROVATO'`).
  - Integrata in `epika.js` la verifica di approvazione e saldo quota: l'accesso diretto via URL ad `epika.html` viene bloccato se l'utente ha pagamenti o approvazioni in sospeso, reindirizzando a `dashboard.html`.
- **Database & Backend Script (`scripts/fix_valeria_bosto.js`)**:
  - Eseguita la sanatoria per Valeria Bosco (`vale1211bosco@gmail.com`): certificato medico approvato a `VERDE`, stato approvazione impostato a `IN_ATTESA_PAGAMENTO` e `quota_totale` impostata a 25.00 €.

---

## [2026-07-31] feature | Abilitazione Checkout Quota Tesseramento & Banner Dashboard Atleti (v1.03.79)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Abilitata la visibilità del tab "Pagamenti e Ricevute" (`#tab-btn-user_pagamenti`) anche per gli utenti con ruolo atleta/tesserato (`tesserato_esterno`).
  - Integrato nella select relazionale di `checkSession()` il recupero della tabella `registro_approvazioni(*)`.
  - Inserito nella Panoramica (Home Page Atleta) un banner visivo di colore blu ("AZIONI RICHIESTA: SALDO QUOTA TESSERAMENTO ADRENALINA") per gli utenti in stato `IN_ATTESA_PAGAMENTO`, contenente il pulsante diretto "PAGA ORA LA QUOTA TESSERAMENTO" collegato a Stripe (`pagamento.html`).
- **Database / Backend Script (`scripts/fix_martina_quota.js`)**:
  - Sanata la posizione dell'utente Martina Baratta (`martinabara02@gmail.com`), impostando `quota_totale = 25.00` € in `utenti` per sbloccare la validazione di sicurezza in `pagamento.js`.

---

## [2026-07-31] fix | Allineamento Ordinamento Certificati Medici Atleta vs Admin (v1.03.78)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Modificato il criterio della clausola `.order()` in `loadUserCertificato()` da `data_rilascio` a `created_at` decrescente (`.order('created_at', { ascending: false })`).
  - Risolta l'anomalia per cui in presenza di più record con la stessa `data_rilascio` (es. record fittizio di migrazione vs nuovo certificato reale), il sistema atleta mostrava lo stato del vecchio record `IN_ATTESA` anziché l'ultimo certificato `VERDE` approvato.

---

## [2026-07-31] fix | Isolation & Lockout Navigazione Utenti con Registrazione Incompleta (v1.03.77)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Implementato il controllo `isRegistrazioneIncompleta = !anag` derivato direttamente in RAM dalla query relazionale del profilo (`currentUserProfile.anagrafiche`).
  - Se l'utente ha una registrazione incompleta, vengono nascosti categoricamente il pulsante **EPIKA** (`#tab-btn-user-epika`) e tutti i tab di navigazione secondaria (Corsi, Eventi, Pagamenti, Documenti).
  - Viene mostrato un banner arancione di avviso bloccante con link diretto al completamento della registrazione (`registrazione.html`). L'esecuzione si interrompe con un `return` prevenendo la normale inizializzazione dell'atleta.
- **Frontend Epika (`portal/epika.js`)**:
  - Estesa la query iniziale di profilo con `anagrafiche(id)`.
  - Se un utente incompleto tenta l'accesso diretto via URL a `epika.html`, il sistema rileva l'assenza di anagrafica, lancia un alert ed esegue il reindirizzamento forzato immediato a `dashboard.html`.

---

## [2026-07-31] fix | Sanatoria Martina Baratta & Blocco Preventivo Checkout Epika (v1.03.76)
- **Database & Sanatoria (`scripts/fix_martina_baratta.js`)**:
  - Eseguita la sanatoria dell'utente Martina Baratta (`e4c0ceda-9d31-49d2-a2a9-ce5fe52d6347`), completando l'anagrafica, l'indirizzo, i contatti e l'iscrizione in `registro_approvazioni` (stato `IN_ATTESA`, tipo `TESSERATO`, livello `BASE`).
  - Rimossa l'anomalia dallo stato `vw_registrazioni_incomplete`, mantenendo intatto il biglietto Epika già pagato su Stripe (`pi_3TzEFP7wrOk84bdx1qwquwXf`).
- **Backend Checkout API (`api/create-checkout-session.js`)**:
  - Integrato un controllo preventivo di blocco che impedisce agli utenti con registrazione Adrenalina incompleta (`vw_registrazioni_incomplete`) di procedere all'acquisto di eventi Epika o corsi prima di aver completato il tesseramento base.

---

## [2026-07-31] feat | Banner Universale Certificato Medico in Home Atleta & Landing Panoramica (v1.03.75)
- **Frontend Dashboard (`portal/dashboard.js`)**:
  - Modificato l'atterraggio degli atleti (`currentViewContext === 'athlete'`): ora tutti gli atleti al login atterrano direttamente sulla propria Home (`panoramica`) invece di essere forzati sul tab certificato.
  - Implementata la generazione universale dell'Alert Banner nel pannello `#panel-panoramica` per **tutti i tesserati Adrenalina** con anomalie sul certificato medico:
    - *Certificato Mancante*: Banner rosso con avviso di caricamento iniziale.
    - *Certificato Scaduto*: Banner rosso con data esplicita di scadenza ed invito al rinnovo.
    - *Certificato Rifiutato*: Banner rosso di notifica rigetto ed invito a caricare un documento conforme.
    - *Dato Storico senza File*: Banner giallo per utenti iscritti prima della nascita del portale.
  - Integrato il pulsante di Call-To-Action `VAI ALLA SEZIONE CERTIFICATO MEDICO` in ciascun banner per il reindirizzamento immediato al tab `user_certificato`.
- **Versione**: Incrementata la versione globale a `v1.03.75`.

---

## [2026-07-31] feat | Ordinamento Naturale Tesserati e Gestione Atleti Legacy (v1.03.74)
- **Frontend Admin (`portal/dashboard.js`, `portal/dashboard.html`)**:
  - Implementata la funzione `parseNumeroRegistro(numRegStr)` per estrarre Anno e Numero progressivo da numeri di registro alfanumerici (es. `T_057_2026`). Aggiornata `sortArray` per ordinare matematicamente e cronologicamente la colonna `N.`.
  - Aggiornato l'ordinamento della colonna `Tessera CSEN` in `sortArray` usando `localeCompare` con opzione `{ numeric: true }` e spingendo in fondo alla lista i valori vuoti o `DA COMUNICARE`.
  - Aggiornata `updateSortIcon` per supportare gli alias `numero_registro` e `id_tesserato`.
  - Rilevamento dei **Soci Legacy**: Identificati gli atleti iscritti prima della creazione del portale (`stato_validazione === 'IN_ATTESA'` e assenza di un `file_url` valido).
  - Aggiornato `renderTesseratiTable` e `renderTesseratiMobileCards` per mostrare il badge ed il tooltip esplicativo `STORICO (MANCA FILE)` per i record senza scansione digitale.
  - Inserito un banner informativo dinamico (Alert Giallo) nella Home dell'Area Tesserato (`dashboard.html` lato Atleta) invitando gli utenti storici a ricaricare il proprio certificato medico via "IL MIO PROFILO".
- **Versione**: Incrementata la versione globale a `v1.03.74`.

---

## [2026-07-31] refactor | Rimozione Allenatore dal Modale Modifica Scheda Personaggio (v1.03.73)
- **Frontend Epika (`portal/epika.html`, `portal/epika.js`)**:
  - Rimossa la selezione e la gestione del campo "Allenatore di Riferimento" dal modale "MODIFICA SCHEDA PERSONAGGIO".
  - Applicata la rigida separazione dei domini (Separation of Concerns): la Scheda Personaggio gestisce esclusivamente l'identità dell'atleta (Gruppo Storico, Popolo / Cultura e Ruolo Combattimento), mentre la gestione dell'Allenatore/Allievo Allenatore avviene unicamente nella sezione "Abilitazione al Combattimento" (SCAB).
  - Eliminata la chiamata ridondante a `syncAbilitazioneScab()` dal salvataggio del profilo per evitare side-effect indesiderati sulla pratica marziale attiva.

---

## [2026-07-31] fix | Layout Responsivo Widget CSEN & Batch Limit 25 (v1.03.72)
- **Frontend Admin (`portal/dashboard.html`)**:
  - Estratto il widget matrice Tessere CSEN dal container dell'header e riposizionato in una riga dedicata a larghezza piena con container scrollabile orizzontalmente (`overflow-x-auto`). Garantita visibilità su tutti gli schermi (desktop, laptop 13"/15" e schermi mobili).
- **Backend & Script (`scripts/csen_sync_active.js`)**:
  - Incrementato il limite di processamento atleti in coda da 10 a 25 per singola esecuzione per smaltire l'intera coda senza rimanenze tra i run.

---

## [2026-07-31] feat | Matrice Contatori Tessere CSEN (Residue, Da Comunicare, Da Richiedere) (v1.03.71)
- **Frontend Admin (`portal/dashboard.html`, `portal/dashboard.js`)**:
  - Riprogettato il widget contatore del Registro Tesserati in una tabella/matrice analitica 3 righe x 4 colonne (Base Silver, Base Gold, Integ. A, Integ. B).
  - Implementato il conteggio dinamico senza limiti client-side per **Tessere da Comunicare** (atleti attivi in coda `PENDING` / `RENEWAL_SUBMITTED`).
  - Implementato il calcolo automatico di **Tessere da Richiedere** (`Residue - Da Comunicare`): mostra `0` (grigio) se la giacenza è sufficiente, oppure il valore negativo (es. `-2` in rosso pulsante) se occorre ordinare nuove tessere a CSEN.

---

## [2026-07-31] fix | Risoluzione Blocco Sincronizzazione CSEN & Codici IT (v1.03.70)
- **Backend & Script (`scripts/csen_sync_active.js`, `scripts/csen_reconciliation.js`, `api/csen-status.js`)**:
  - Aggiornato lo STEP 1 di `csen_sync_active.js` per escludere i codici temporanei locali (`IT...`) dalla promozione automatica a `SYNCED`.
  - Inclusi i codici `IT...` nei filtri di ricerca Playwright di STEP 2 (`.or('numero_tessera_csen.is.null,numero_tessera_csen.ilike.IT%')`) per consentire al bot di completare tesseramenti e rinnovi su CSEN.
  - Aggiornati i filtri equivalenti in `csen_reconciliation.js` e `api/csen-status.js`.
- **Manutenzione Dati (`scripts/fix_csen_pending_records.js`)**:
  - Creato lo script per azzerare i codici `IT...` e ripristinare a `PENDING` i record erroneamente marcati come `SYNCED` dal 28/07/26 ad oggi.

---

## [2026-07-31] feat | Rinnovo Dinamico SCAB, Sync Profilo & Audit Log Nativo (v1.03.69)
- **Database (Supabase RPC):**
  - Aggiornata la stored procedure `public.crea_richiesta_abilitazione`: se l'allenatore scelto per la richiesta è diverso da quello salvato nel profilo utente, esegue un `UPDATE` su `epika_profili.allenatore_id`.
  - Questo aggiornamento attiva automaticamente il trigger `trg_log_epika_profilo_updates` che registra la variazione nello **STORICO MODIFICHE** (`epika_registro_modifiche_profilo`).
- **Frontend (`portal/epika.js`):**
  - Ristrutturata `renderAbilitazioneAtleta()` per effettuare la query sulla pratica più recente dell'atleta (`order by anno_abilitativo desc limit 1`) e calcolare in modo dinamico l'anno di rinnovo (target 2027 se l'abilitazione 2026 è scaduta ad agosto).
  - Pre-selezionato l'allenatore corrente nel select in fase di rinnovo, consentendo la modifica da parte dell'atleta.
  - Aggiornato il testo di validità: `"abilitazione valida fino al 31/08/XX . per i partecipanti a CM XXXX l'abilitazione è valida fino al 31/12/XX"`.
- **Versionamento:** Eseguito `npm run bump` (versione `v1.03.69`).

## [2026-07-31] fix | Hotfix Sintassi JS in epika.js (v1.03.68)
- Corretta la parentesi graffa di chiusura mancante per `renderAthleteDashboard()` in `portal/epika.js`.
- Verificata la validità della sintassi tramite `node -c portal/epika.js`.
- Versionamento portato a `v1.03.68`.

## [2026-07-31] feat | Sanatoria & Automazione Abilitazioni SCAB dal Primo Accesso (v1.03.67)
- **Database (Supabase DML & Stored Procedure):**
  - Creata ed eseguita la funzione `public.inizializza_abilitazioni_mancanti(2026)` che ha sanato massivamente **44 combattenti** (creati/allineati 33 record mancanti o difformi).
  - La procedura garantisce che l'allenatore dell'abilitazione coincida sempre con l'allenatore selezionato in fase di iscrizione/profilo.
- **Frontend (`portal/epika.js`):**
  - Creata la funzione `syncAbilitazioneScab(ruolo, allenatoreId)` richiamata automaticamente dopo `handleFirstAccessSubmit` e `salvaModificheProfilo`.
  - Integrato l'**Auto-Healing trasparente** in `renderAbilitazioneAtleta`: se un combattente ha un allenatore nel profilo ma la pratica non è aperta, il sistema la crea silenziosamente in background caricando direttamente lo stato avanzamento.
- **Versionamento:** Eseguito `npm run bump` portando la versione globale a `v1.03.67`.

## [2026-07-30] feature | Modifica Date ed Eliminazione Mandati nella Cronologia Gruppi Storici (v1.03.47)
- **Frontend (`portal/epika.html` & `portal/epika.js`):**
  - Aggiunta la colonna `Azioni` nella tabella `CRONOLOGIA STORICA MANDATI` dei dettagli del Gruppo Storico.
  - Implementata la funzione `eliminaMandatoStorico()` con icona Cestino 🗑️ (disabilitata sui mandati attivi per prevenire disallineamenti anagrafici con `epika_gruppi_storici`).
  - Implementata la modifica inline `abilitaModificaMandato()` e `salvaModificaMandato()` con icona Matita ✏️, consentendo l'editing e la retrodatazione di `data_inizio` e `data_fine`.

---

## [2026-07-30] feat | Colonne Abilitazione SCAB in Vista Capogruppo (v1.03.64)
- **Frontend (`portal/epika.html` & `portal/epika.js`):**
  - Integrate le colonne `Stato Abilitazione` e `Risposta Validatore` nella tabella degli iscritti al gruppo della Vista Capogruppo (`#epk-capo-tab-iscritti`).
  - Ottimizzato il caricamento dati con lookup in memoria $O(1)$ (`capoAbilitazioniMap` e `capoOpzioniNomiMap`) durante la funzione `renderCapoIscrittiGruppo()`.
  - Formattazione avanzata con supporto ai semafori colorati (🟢/🟡/🔴) e visualizzazione dinamica dei referenti (Allenatore e Validatore).
  - Aggiornati i `colspan` delle tabelle dinamiche a 8 per prevenire disallineamenti di layout.
- **Versionamento:** Eseguito `npm run bump` portando la versione globale a `v1.03.64`.

## [2026-07-30] fix | Bypass Autorizzazioni Admin nelle RPC SCAB (v1.03.61)
- **Database (Supabase RPCs):**
  - Modificate le RPC `public.aggiorna_stato_validatore` e `public.aggiorna_stato_allenatore` introducendo il controllo `v_is_admin`: gli utenti con `is_admin_epika = TRUE` oppure ruolo `'presidente'` beneficiano dell'override automatico delle autorizzazioni di identità.
  - Questo consente agli amministratori (come Tito Admin) di utilizzare liberamente le funzionalità di simulazione o gestione per conto di qualsiasi validatore/allenatore senza incorrere in errori di autorizzazione.
- **Versionamento:** Eseguito `npm run bump` portando la versione globale a `v1.03.61`.

## [2026-07-30] fix | Hotfix Validatori NULL & Auto-Healing RPC SCAB (v1.03.60)
- **Database (Supabase DML & RPCs):**
  - Eseguita la patch dati universale per associare i validatori mancanti ai record `epika_scab_abilitazioni` con `validatore_opzione_id = NULL`.
  - Aggiornata la RPC `public.crea_richiesta_abilitazione` aggiungendo il filtro `validatore_id IS NOT NULL` ed `ORDER BY id ASC` per evitare l'assegnazione di validatori nulli in caso di abbinamenti multipli.
  - Aggiornata la RPC `public.aggiorna_stato_validatore` implementando il meccanismo di **Auto-Healing**: se la richiesta ha validatore NULL, l'RPC lo risolve al volo e lo corregge nel DB prima della verifica autorizzativa.
- **Frontend (`portal/epika.js`):**
  - Aggiornato il blocco `catch` di `aggiornaStatoValidatore` per forzare il re-render della dashboard su eccezione, impedendo blocchi visivi spuri dell'interfaccia.
- **Versionamento:** Eseguito `npm run bump` portando la versione globale a `v1.03.60`.

## [2026-07-30] fix | Macchina a Stati Abilitazione SCAB — Lock Verde & Auto-Reset (v1.03.59)
- **Database (Supabase RPCs):**
  - Aggiornata la RPC `public.aggiorna_stato_validatore` per consentire la modifica del semaforo SOLO se `stato_allenatore = 'video_in_valutazione'` oppure se si sta revocando un semaforo `verde` preesistente.
  - Implementato l'auto-reset dello `stato_allenatore` a `'in_valutazione'` se il Validatore imposta il semaforo a `'rosso'`.
  - Aggiornata la RPC `public.aggiorna_stato_allenatore` per **bloccare** qualsiasi tentativo di modifica dello stato dell'allenatore se il semaforo è già `'verde'` (ciclo chiuso).
  - Implementato l'auto-reset del semaforo Validatore a `'giallo'` se l'Allenatore imposta nuovamente `'video_fatto'` a seguito di un precedente esito `'rosso'`.
- **Frontend (`portal/epika.js`):**
  - Disabilitato visivamente (`disabled`, `opacity: 0.35`, `cursor: not-allowed`) il menu a tendina del Semaforo Validatore per gli atleti la cui valutazione non è ancora stata sbloccata dall'allenatore.
  - Disabilitato visivamente il menu a tendina dell'Allenatore quando l'atleta è già stato approvato dal Validatore con semaforo verde.
  - Aggiunto il re-rendering automatico delle dashboard Allenatore e Validatore a seguito di ogni aggiornamento stato per riflettere istantaneamente in UI i side-effect e gli auto-reset del DB.
- **Versionamento:** Eseguito `npm run bump` portando la versione di sistema a `v1.03.59`.

## [2026-07-30] ingest | Abilitazioni Combattimento SCAB v1.03.57
- Creata tabella `epika_scab_abilitazioni` e 3 RPC PostgreSQL `crea_richiesta_abilitazione`, `aggiorna_stato_allenatore`, `aggiorna_stato_validatore`.
- Integrata la card abilitazione nella dashboard Atleta (#epk-main).
- Estesa la dashboard Allenatore (#epk-allenatore) con la tabella atleti (diretti e via allievi) per la modifica degli stati.
- Estesa la dashboard Validatore (#epk-validatore) con la tabella atleti e semafori interattivi.
- Estesa la dashboard Allievo Allenatore (#epk-allievo) con la tabella atleti in sola lettura.
- Aggiornate le tendine di selezione allenatore per includere anche gli Allievi Allenatori.

---

## [2026-07-30] fix | Risoluzione Visualizzazione Moduli Firmati OTP nel Dossier Socio e Approvazioni (v1.03.56)
- **Frontend (`portal/dashboard.js`)**:
  - Riscritto il rendering del box MODULISTICA in `apriDossierSocio` per estrarre analiticamente i tre documenti della tabella `atti_adesione` (`url_pdf_generato`, `url_pdf_csen_informativa`, `url_pdf_csen_iscrizione`).
  - Implementata la strategia ibrida: rigenerazione dinamica via `openSignedFile('documenti_adesione', ...)` per il Modulo Adesione (URL con validità 1 ora), ed apertura diretta via link per l'Informativa ed il Modulo Iscrizione CSEN (URL con validità 10 anni).
  - Corretta la select ed il rendering nel Pannello Approvazioni per includere il Modulo Adesione tra i pulsanti d'azione del Direttivo.

---

## [2026-07-30] feature | Generali d'Esercito (1-3) & Fix Esclusività Pannelli Admin (v1.03.54)
- **Database (`supabase/migration_epika_eserciti_generali.sql`)**: Aggiunte le colonne `generali_esercito_a` e `generali_esercito_b` (JSONB) alla tabella `epika_eserciti_eventi`.
- **Frontend Admin (`portal/epika.html`, `portal/epika.js`)**:
  - Implementato il gestore atomico `apriPannelloEsclusivoAdmin(panelId)` per garantire che un solo pannello evento alla volta sia visibile, eliminando l'accavallamento visivo delle schermate.
  - Aggiunti 3 campi input per Esercito A e 3 per Esercito B per la registrazione dei Generali (Comandante + 2 Opzionali).
  - Integrato `<datalist id="adm-eserciti-atleti-datalist">` per suggerire l'autocompletamento dei Nomi di Battaglia reali degli atleti iscritti.
  - Evidenziati i Generali registrati nelle intestazioni delle colonne di schieramento tattico.

---

## [2026-07-29] feature | Dashboard Gestione Eserciti & Bilanciamento Tattico (v1.03.53)
- **Database (`supabase/migration_epika_eserciti.sql`)**: Creata la tabella `epika_eserciti_eventi` con politiche RLS per storicizzare nomi eserciti, gridi di battaglia, coefficienti di forza e assegnazioni JSONB dei gruppi e dei mercenari.
- **Frontend Admin (`portal/epika.html`, `portal/epika.js`)**:
  - Inserito il pulsante imperiale `⚔️ GESTIONE ESERCITI` nella lista eventi tra "Gestisci Presenze" e "Disattiva".
  - Implementata la dashboard tattica `#adm-eserciti-panel` a 3 colonne (Esercito A, Pool Non Assegnati, Esercito B).
  - Implementata l'assegnazione in blocco per i Gruppi Storici e l'assegnazione individuale per i membri del gruppo **MERCENARI**.
  - Implementato l'algoritmo di calcolo automatico della forza totale e dei combattenti con indicatore di sbilanciamento centrale (VS Delta Gauge).
  - Creato il popover `#adm-eserciti-coeff-modal` per la personalizzazione dinamica dei 6 coefficienti di forza.

---

## [2026-07-29] feature | Distinzione Visiva Codice Richiesta CSEN vs Tessera Ufficiale (v1.03.52)
- **Frontend (`portal/dashboard.js`)**:
  - Distinti i codici richiesta temporanei (prefisso `IT...`, es. `IT26149086`) dalle tessere CSEN ufficiali definitive.
  - Applicato il colore azzurro elettrico (`text-cyan-400` / `#22d3ee`) ed il sottotitolo `CODICE RICHIESTA` per le pratiche temporanee sia nella vista Tabella, nella vista Card Mobile, che nel Modale Dossier Socio.
  - Mantenuto il colore verde (`text-green-500` / `#22c55e`) esclusivamente per i numeri di tessera CSEN ufficiali ed effettivi.

---

## [2026-07-29] feature | Caricamento Documento d'Identità Modulare e Uniformato in Dashboard (v1.03.51)
- **HTML (`portal/dashboard.html`)**: Ristrutturate le sezioni di caricamento del documento d'identità (personale e tutore per minorenni) per includere la selezione della modalità (File Unico vs Due File Separati Fronte/Retro), doppia dropzone dedicata e avvisi dinamici di stato.
- **JavaScript (`portal/dashboard.js`)**: Implementata la factory function `setupIdentityDocumentWidget` per gestire in modo isolato ed incapsulato le istanze dei form, e la funzione `mergeIdentityDocuments` per la fusione client-side con `pdf-lib` delle immagini/PDF Fronte+Retro prima dell'upload su Supabase.
- **Versione**: Incrementata la versione globale del progetto a `1.03.51`.

---

## [2026-07-29] ingest | Registrazione decisioni architetturali OTP e Validazione Documenti (v1.03.50)
- **Wiki Updates**:
  - [`wiki/registration_flow.md`](file:///d:/Antigravity_Projects/ADR_SITO/wiki/registration_flow.md): Registrato il nuovo flusso Pre-Upload per la registrazione, l'impostazione di default del layout a due file per i documenti di identità, e formalizzato il chiarimento sulla *EPIKA CORE RULE* (la storicizzazione distruttiva si applica esclusivamente agli utenti con iscrizione completata; per gli utenti non registrati/incompleti è ammessa l'eliminazione fisica diretta).
  - [`wiki/otp_signature_system.md`](file:///d:/Antigravity_Projects/ADR_SITO/wiki/otp_signature_system.md): Documentate le nuove pratiche di sicurezza e performance (Signed URL a 3600s, refresh sessione JWT preventivo e audit trail con l'hash SHA-256 dell'OTP nel PDF contratto finale).

---

## [2026-07-29] fix | Risoluzione Critica Signed URL 3600s, Layout Avviso Single Mode e Ripristino OTP Hash PDF (v1.03.50)
- **Frontend (`portal/registrazione.js`)**:
  - Estesa la durata di tutti i Signed URL generati in pre-upload (`documenti_identita`, `certificati_medici`, `documenti_adesione`, `documenti_tutori`) da 300 secondi (5 minuti) a **3600 secondi (1 ora)** per prevenire scadenze durante l'inserimento dell'OTP.
  - Aggiunto il reset esplicito delle variabili `preUploaded*` ad ogni nuovo invio OTP.
  - Ripristinata la generazione istantanea dell'hash SHA-256 dell'OTP sul PDF contratto finale al momento della conferma OTP.
- **Frontend (`portal/registrazione.html`)**:
  - Spostato l'elemento `#avviso-single-mode` all'esterno del container grid dei radio button per prevenire qualsiasi distorsione del layout visivo.

---

## [2026-07-29] feature | Ottimizzazione Flusso OTP Mobile e Validazione Documenti d'Identità (v1.03.49)
- **Frontend (`portal/registrazione.html`, `portal/registrazione.js`)**:
  - Spostata l'esecuzione delle operazioni pesanti (compressione immagini fotocamera, merge PDFLib fronte/retro, upload Supabase Storage `documenti_identita`, `certificati_medici`, `documenti_adesione`) all'interno di `btnInviaOtp.click` in fase di Pre-Upload.
  - Semplificato il listener `btnValidaOtp.click` per eseguire immediatamente la sanitizzazione dell'OTP, il refresh preventivo della sessione JWT (`auth.refreshSession()`) e la chiamata alla verifica server-side `/api/otp-verify.js` in meno di 2 secondi.
  - Impostata l'opzione layout documento `"HO DUE FILE SEPARATI"` come predefinita e resa visibile di default la casella del retro.
  - Aggiunto l'avviso visivo per la modalità file unico `#avviso-single-mode` e gli attributi HTML5 `inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code"` per attivare la tastiera numerica ed il rilevamento automatico del codice OTP da SMS/email su smartphone (iOS e Android).

---
- **Database & Patch Dati**:
  - Eseguito update su `iscrizioni_eventi` per Fabio Piciacchia (`abbonamento_scelto = 'Trimestre'`) e per Fabio Morganti (`data_scadenza_corso = '2027-01-28'`).
  - Arricchito il campo JSONB `piani_abbonamento` della tabella `eventi` inserendo esplicitamente `durata_mesi` (1, 3, 6, 12) per tutti i corsi attivi.
- **Frontend (`portal/dashboard.js`)**:
  - Aggiornata la modale di creazione/modifica corso per richiedere ed estrarre la `durata_mesi` in ogni piano abbonamento.
  - Implementata la funzione `modificaPianoCorso()` nell'interfaccia istruttore/direttivo per consentire l'editing diretto dell'etichetta `abbonamento_scelto`.
- **Backend (`api/stripe-webhook.js`)**:
  - Aggiunta una doppia protezione di fallback sulla durata in mesi basata sulle parole chiave del piano (`Trimestre` -> 3, `Semestre` -> 6, `Annuale` -> 12).

---

## [2026-07-28] fix | Data Backfill Allenatore nello Storico Organico 2026 (v1.03.46)
- **Database (`supabase/migration_epika_storico_allenatore_backfill.sql`)**: Eseguita migrazione di popolamento dati che ha sincronizzato gli `allenatore_id` per l'anno 2026 in `epika_storico_organico` dall'anagrafica `epika_profili` per tutti i record pregressi. Nessuna modifica al codice JS necessaria per preservare la corretta gestione dei valori `NULL` intenzionali.

---

## [2026-07-28] feature | Gestione Allenatore nel Planning Lista Generale (v1.03.45)
- **Database (`supabase/migration_epika_storico_allenatore.sql`)**: Aggiunta la colonna `allenatore_id` alla tabella `epika_storico_organico` con vincolo di integrità nativo (`CHECK constraint`) che impedisce l'assegnazione di un allenatore per i soggetti con ruolo `non_combattente`.
- **Frontend (`portal/epika.html`, `portal/epika.js`)**:
  - Inserito il 4° dropdown `.gen-allenatore` in ciascuna riga della tabella della Lista Generale (Planning Anni Futuri).
  - Aggiunto il filtro `gen-filter-allenatore` (`TUTTI GLI ALLENATORI 2026`) nella Control Bar della Lista Generale.
  - Implementata la funzione reattiva `handleGenRuoloChange()` che azzera e disabilita in tempo reale la select dell'Allenatore quando un utente viene impostato come `non_combattente`.
  - Aggiornata la funzione `salvaTuttaLaListaGenerale()` per includere `allenatore_id` nell'upsert atomico verso `epika_storico_organico`.

---

## [2026-07-28] feature | Ordinamento Decrescente & Control Bar Filtri Avanzati Dashboard Eventi (v1.03.44)
- **Ordinamento Iscritti (`portal/epika.js`)**: Aggiunto `.order('data_iscrizione', { ascending: false })` con fallback su `.order('id', { ascending: false })` nella query Supabase su `epika_iscrizioni_eventi`, garantendo che gli ultimi iscritti compaiano sempre in alto.
- **Control Bar Filtri (`portal/epika.html`, `portal/epika.js`)**:
  - Creata la control bar a 6 elementi in `epika.html` (Ricerca Nome, Gruppo, Ruolo, Date Presenza, Allenatore, Arciere Sì/No).
  - Implementata la generazione dinamica *data-driven* dei dropdown in `popolaFiltriDinamiciDashboard()` basata unicamente sui partecipanti reali dell'evento.
  - Implementata la logica di filtraggio cumulativo in `filtraPartecipantiDashboard()` con badge di conteggio `MOSTRATI: X / Y`.
  - Aggiunta la funzione `resetFiltriDashboardEvento()` per azzerare i filtri con 1 click.

---

## [2026-07-28] fix | Ripristino Formato Sequenziale Numero Registro Tesserati T_XXX_YYYY (v1.03.43)
- **Database & Funzioni PL/pgSQL (`supabase/migration_fix_numero_registro_tesserati.sql`)**:
  - Eliminata la generazione di prefissi casuali `REG-YYYY-XXXX` dalla funzione `public.approva_tesserato()`.
  - Implementata la funzione di calcolo sequenziale automatico nel formato standard `T_LPAD(N, 3, '0')_YYYY` (es. `T_088_2026`).
  - Eseguita sanatoria atomica nel DB: il record dell'atleta Daniele Oronzo Stefanelli è stato corretto da `REG-2026-5822` al numero registro sequenziale ufficiale `T_088_2026`.

---

## [2026-07-28] feature | Layout Dinamico & Slot Da Assegnare nei Direttivi Auto-Compilati (v1.03.40)
- **Frontend (`portal/epika.js`)**:
  - Eliminata la barra di scorrimento (`max-height: 220px`) per i 3 quadri direttivi auto-compilati (*Capi Gruppo*, *Vice Capi Gruppo*, *Responsabili Iscrizioni*), impostando un'altezza fluida che si adatta a tutti i nominativi.
  - Implementata l'identificazione automatica dei gruppi storici attivi sprovvisti di referente.
  - Aggiunti gli slot visuali tratteggiati "DA ASSEGNARE" per ciascun gruppo sprovvisto di responsabile e integrati con la ricerca globale in tempo reale.
  - Inserito il badge di allerta sintetico nell'header dei quadri direttivi auto-compilati con il conteggio degli slot mancanti.

---

## [2026-07-28] fix | Bonifica CSS max-height, Layout Modale Nomine e Ricerca Globale Direttivi (v1.03.39)
- **Frontend (`portal/epika.html`, `portal/epika.js`)**:
  - Eseguita bonifica sistemica della proprietà CSS `max-h:` (invalida inline) convertendola in `max-height:` su tutte le liste (SCAB, Popoli, Gruppi Storici, Modale Nomine).
  - Blindato il layout del modale `#adm-nomina-modal` con `max-height: 85vh`, pulsante di chiusura `"✖"` nella testata, e chiusura al click sul backdrop oscurato esterno.
  - Creata la casella di ricerca globale nei Direttivi (`#adm-direttivi-global-search`) con filtraggio live `filtraDirettiviInverso()` in O(N) sul DOM per Nome di Battaglia, Nome Reale e Gruppo Direttivo.

---

## [2026-07-27] feature | Contatti Utente e Tasto Eliminazione in Attesa di Pagamento (v1.03.38)
- **Frontend (`portal/dashboard.js`, `portal/dashboard.html`)**:
  - Estesa la query `loadApprovazioni()` per recuperare i contatti (`email`, `telefono`) relazionati alle anagrafiche.
  - Aggiornata la tabella **TESSERATI E SOCI IN ATTESA DI PAGAMENTO** per visualizzare i recapiti diretti con link rapido `mailto:`, collegamento `tel:` e pulsante `💬 WA` (WhatsApp).
  - Inserito il pulsante **`ELIMINA`** per i ruoli direttivi (Presidente, Vice Presidente, Segretario, Tesoriere) con conferme severe e avviso di controllo pagamenti Stripe, permettendo la cancellazione totale e lo sblocco dell'anagrafica per ri-registrarsi da capo.
  - Aggiornato l'indicatore delle tabelle e la notifica toast per la rimozione con successo dell'utente.

---

## [2026-07-27] feature | Feedback Visivo Immediato su Click Pulsanti e Toast System (v1.03.37)
- **UI & UX (`portal/dashboard.js`, `portal/dashboard.html`)**:
  - Implementata la funzione globale `showToastNotification(message, type)` per mostrare notifiche toast fluttuanti in alto a destra all'esecuzione delle azioni.
  - Aggiornate le funzioni `openSignedFile`, `handleDocManualValidation` e `validaCertificatoManual`: al click del pulsante viene disabilitato l'elemento, mostrato uno spinner animato ed un testo di stato istantaneo (es. `🔄 APERTURA...`, `🔄 RINVIO ALL'AI...`), seguito da un indicatore di successo `✓ FATTO!`.
  - Aggiunta la regola CSS micro-interattiva globale `button:active` (effetto pressione fisica a -6% di scala e scurimento al click) su tutti i pulsanti della dashboard.

---

## [2026-07-27] fix | Aggiunta Pulsante Visualizzazione Documenti Identità in Registro Approvazioni (v1.03.36)
- **Frontend (`portal/dashboard.js`)**:
  - Aggiunto il pulsante `👁 VEDI DOCUMENTO` nella funzione `loadDocsAttesa()` all'interno del pannello "Documenti d'Identità in Attesa di Verifica" (Registro Approvazioni).
  - Il pulsante richiama `openSignedFile` sul bucket appropriato (`documenti_identita` o `documenti_tutori`), permettendo agli amministratori di visionare il file caricato dall'atleta anche in caso di errore 503 dell'AI per approvazione o rifiuto manuale.

---

## [2026-07-26] feature | Contatori Visivi Abbinamenti SCAB (v1.03.33)
- **Frontend (`portal/epika.js`)**:
  - Introdotta la variabile globale `scabAbbinamentiMap` per memorizzare gli abbinamenti delle strutture SCAB caricate.
  - Creata la funzione `calcolaContatoriAbbinamentiSCAB` per calcolare in O(N) le ricorrenze dei ruoli nelle strutture attive (`validatore_id`, `allenatore_ref_id`, `allenatori_co_ids`, `allievo_ref_id`, `allievi_ids`).
  - Aggiornata la funzione `renderRuoliAdmin()` per mostrare un badge visivo oro/verde `🔗 N` accanto a ciascun ruolo abbinato almeno una volta nelle strutture attive.

---

## [2026-07-26] ingest | Integrazione e Configurazione Tool KNIP (v1.03.32)
- **Tool KNIP (Open Source)**:
  - Installato `knip` come devDependency ed aggiunto lo script `"knip": "knip"` in `package.json`.
  - Creato il file di configurazione `knip.json` per mappare correttamente gli entrypoint serverless (`api/*.js`), frontend (`portal/*.js`), script di manutenzione (`scripts/*.js`), Supabase Edge Functions (`supabase/functions/*/index.ts`) e Vitest (`tests/*.js`).
  - Eliminati tutti i falsi positivi di scansione: rilevati 0 file inutilizzati e 0 dipendenze di produzione inutilizzate.
  - Verificato che sia `npm run knip` che `npm test` vengano eseguiti con successo garantendo massima sicurezza del codebase.

---

## [2026-07-26] fix | Gestione Certificati Ludico-Ricreativi e Sospensione Tesseramento (v1.03.32)
- **Backend (`api/validate.js`)**:
  - Aggiornato il prompt AI Gemini con vincolo positivo stringente: il certificato DEVE contenere esplicitamente almeno uno dei termini "AGONISTICO", "AGONISTICI", "NON AGONISTICO", "NON AGONISTICI". Documenti con diciture "ludico-motoria" o "ludico-ricreativa" vengono ora marcati come `ROSSO`.
  - Alla transizione dello stato certificato a `ROSSO`, l'API aggiorna automaticamente `registro_tesserati.stato_tesseramento = 'SOSPESO'` per gli utenti in stato `ATTIVO` o `IN_ELABORAZIONE` e invia un'email di avviso di sospensione.
- **Frontend (`portal/dashboard.js`)**:
  - Aggiunta l'azione rapida `ANNULLA / RIFIUTA` nel Registro Tesserati per permettere al Direttivo di annullare un certificato approvato o in uso.
  - Aggiunti i pulsanti di gestione manuale `APPROVA` / `RIFIUTA` nel modale Dossier Tesserato per ciascun certificato.
- **Versione**: Incrementata la versione globale a `v1.03.32`.

## [2026-07-26] fix | Ripristino Sintassi e Inizializzazione Dashboard (v1.03.35)
- **Frontend Dashboard (`portal/dashboard.js`)**: Corretto errore di sintassi (`Unexpected token '}'`) causato dal raggruppamento residuo di codice del vecchio storico presenze. Ripristinata la corretta esecuzione del file e dell'inizializzazione del ruolo/permessi dell'utente.
- **Versione:** Incrementata la versione globale a `v1.03.35`.

---

## [2026-07-26] refactor | Dashboard Istruttori Card UI & Rimozione Presenze (v1.03.34)
- **Database (`iscrizioni_eventi` & `vw_stato_atleta_corso`)**: Aggiunte colonne `abbonamento_scelto` e `tipo_pagamento` per tracciare il piano scelto e la modalità di pagamento (a rate / unica rata). Aggiornata la vista atleta/corso per esporli.
- **Webhook Stripe (`api/stripe-webhook.js`) & Checkout (`api/create-checkout-session.js`)**: Aggiornata la scrittura del database per salvare automaticamente il piano e la modalità di pagamento.
- **UI Istruttori (`portal/dashboard.html` & `portal/dashboard.js`)**: Eliminato l'intero vecchio sistema di presenze (appello, date, storico lezioni, pulsante salva presenze). Trasformato l'elenco tesserati del corso in una lista a Card Espandibili pensata per mobile/tablet che mostra con massima chiarezza: Tesserato, Stato CSEN (Badge), Stato Certificato Medico (Semaforo con barra temporale a 12 step), Piano Abbonamento, Tipo Pagamento, Data Iscrizione e Data Scadenza Corso.
- **Versione:** Incrementata la versione globale a `v1.03.34`.

---

## [2026-07-26] feat | Icona Copia negli Appunti per i Campi del Dossier Socio (v1.03.31)
- **UI Dossier Socio**: Aggiunta un'icona non invasiva `content_copy` affianco a ogni campo di Allegato 1 (Nome Cognome, Email, Cellulare, Residenza, Contatto Emergenza, Codice Fiscale, Sesso, Data di Nascita, Luogo di Nascita, Dati Tutore Legale, Numero Tessera CSEN).
- **Clipboard Helper (`copyDossierText`)**: Creata funzione JS per la copia istantanea negli appunti con feedback visivo temporaneo (l'icona cambia in una spunta verde `check` per 1.5 secondi) e fallback automatico per i browser che non supportano l'API `navigator.clipboard`.
- **Versione:** Incrementata la versione globale a `v1.03.31`.

---

## [2026-07-26] fix | Inversione Numerazione Lista Generale Componenti (v1.03.30)
- **Frontend Epika (`portal/epika.js`)**: Modificata la colonna numerica `N.` nella tabella "LISTA GENERALE COMPONENTI - PLANNING ANNI FUTURI" affinché il numero più piccolo (1) compaia in fondo alla tabella e il numero più grande in alto (`filtrati.length - idx`).
- **Versione:** Incrementata la versione globale a `v1.03.30`.

---

## [2026-07-26] fix | Dossier Socio Residence & Contact Buttons Fix (v1.03.29)
- **Dossier Socio**: Risolto il problema di mancata visualizzazione dell'indirizzo di residenza (mostrava solo `-`): estrazione migliorata dai dati di `utenti` e `anagrafiche` insieme alla tabella relazionale `indirizzi_residenza`.
- **UI**: Rimossi i pulsanti "SMS" e "CHIAMA" dalla sezione HUB CONTATTI del Dossier Socio.
- **Database RLS**: Risolto 'infinite recursion detected' error in `epika_profili` RLS rimuovendo policy ridondanti e riscrivendo le policy admin come `SECURITY DEFINER` per interrompere il ciclo di dipendenza tra `epika_profili`, `epika_gruppi_storici` e `utenti`.
- **Versione:** Incrementata la versione globale a `v1.03.29`.

---

## [2026-07-26] feature | Automazione System-Wide Versioning & Regola Agenti (v1.03.28)
- **Scripting (`scripts/bump-version.js`)**: Aggiornato lo script per supportare l'auto-incremento zero-arguments (`npm run bump`) e la scansione/sostituzione su tutti i file del progetto (HTML query params `?v=`, badge UI `Vs.`, costanti JS `VERSION:` e `package.json`). Eliminato lo script ridondante `bump.js`.
- **Regole Agenti (`AGENTS.md`)**: Aggiornata la regola #5 per rendere obbligatoria l'esecuzione di `npm run bump` per tutti gli agenti AI prima di qualsiasi `git push`.
- **Allineamento Codebase**: Livellati tutti i 21 file del repository alla versione unica `v1.03.28`.

---

## [2026-07-23] fix | Rimozione dicitura Klarna (3 rate) per chiarezza UX (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.html`)**: Rimossa la dicitura "(3 rate)" dalla descrizione dell'opzione "Pagamento in Unica Soluzione". Questa scritta generava estrema confusione negli utenti, che la scambiavano per l'abbonamento rateale interno, portandoli a selezionare il pagamento unico (che poi su Stripe delegava la rateizzazione a Klarna) anziché il nostro Abbonamento Rateale Ricorrente.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Miglioramento Pattern Matching Piani Rateizzabili (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.js`)**: Modificata la logica di `openCheckoutModal` che determinava se un piano fosse rateizzabile. Prima esigeva il match esatto della parola "trimestrale" o "semestrale", causando la mancata visualizzazione dell'opzione rateale se nel database il piano si chiamava "Trimestre" o "3 mesi". Ora il controllo è più permissivo (`trimest`, `semest`, `annu`, `3 mes`, `6 mes`, `12 mes`).
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Ripristino Syntax HTML e rendering Checkout Modal (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.html`)**: Risolto un bug critico in cui il blocco `<script>` di inizializzazione mobile menu non veniva chiuso correttamente prima dell'iniezione del markup della `checkout-modal`. Questo causava un errore di parsing HTML che impediva il rendering della finestra modale nel DOM, col risultato che i bottoni "Iscriviti" fallivano silenziosamente per TypeError.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Esposizione Globale window.iscrivitiEvento ed Invocazione HTML Onclick (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.js`)**: Esplicitata l'assegnazione globale `window.iscrivitiEvento = async function...` e `window.disiscriviCorso = async function...`. Questo risolve la mancata risposta al clic sul pulsante *"ISCRIVITI"* causata dallo scope isolato dell'IIFE in cui risiedeva la funzione.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Risoluzione SyntaxError e Ripristino Caricamento Profilo Dashboard (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.js`)**: Rimosse due graffe di chiusura superflue presenti a riga 6132 che causavano un `Uncaught SyntaxError` bloccando l'esecuzione dell'intero script `dashboard.js` e lasciando la pagina nello stato di caricamento bloccato (*"CARICAMENTO... RUOLO: -"*).
- **Verifica**: Validata la sintassi di `dashboard.js` tramite `node -c` (superato con 0 errori) ripristinando il corretto login ed il riconoscimento dell'utente nel portale.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] feature | Adrenalina Checkout Modal Custom & Security Rate Limit per Utente (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.html` & `dashboard.js`)**: Sostituiti tutti i vecchi popup `confirm()` nativi del browser con la nuova **Adrenalina Checkout Modal** integrata nel layout dark/brutalista. La modal si apre all'iscrizione di qualsiasi corso/evento mostrando un riepilogo grafico, e per gli abbonamenti rateizzabili (Trimestrale, Semestrale, Annuale) permette di selezionare in modo chiaro tra *Pagamento in Unica Soluzione* ed *Abbonamento Rateale Ricorrente*.
- **Backend Rate Limit (`api/create-checkout-session.js`)**: Modificata l'architettura del rate limit spostando la chiave da `clientIp` ad `utenteId` (`p_key: event_checkout:${utenteId}`) ed elevando la soglia a 20 richieste/ora per utente. Questo previene falsi positivi 429 durante test frequenti o reti condivise mantenendo l'infrastruttura sicura.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] feature | Prompt Scelta Rateale/Unica Soluzione al Checkout dei Corsi (v1.03.26)
- **Frontend Dashboard (`portal/dashboard.js`)**: All'iscrizione a un corso/evento con prezzo >= 90€, il sistema ora mostra una finestra di dialogo interattiva per far scegliere all'atleta se saldare con *Abbonamento Rateale* (3, 6 o 12 rate mensili addebito automatico su Carta o SEPA) oppure *Pagamento in Unica Soluzione*.
- **Backend (`api/create-checkout-session.js`)**: Esteso il supporto delle sessioni Stripe in modalità `subscription` (`is_installment: true`) anche per la rotta dell'iscrizione corsi/eventi.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Allineamento Preciso Tagli Quota e Rate (Trimestrale, Semestrale, Annuale) (v1.03.26)
- **Allineamento Tariffe**: Perfezionata la classificazione dei tagli di quota e rate mensili in `portal/pagamento.js`:
  - **Trimestrale (180€)**: 3 rate da 60,00€/mese (+ 1,20€ spese = 61,20€/mese per 3 mesi).
  - **Semestrale (330€)**: 6 rate da 55,00€/mese (+ 1,10€ spese = 56,10€/mese per 6 mesi).
  - **Annuale (600€)**: 12 rate da 50,00€/mese (+ 1,00€ spese = 51,00€/mese per 12 mesi).
- **Frontend (`portal/pagamento.js` & `pagamento.html`)**: Aggiornata la dicitura dinamica del selettore per indicare chiaramente il tipo di abbonamento (es. *Abbonamento Rateale Trimestrale (3 Rate)*, *Abbonamento Rateale Semestrale (6 Rate)*, *Abbonamento Rateale Annuale (12 Rate)*) con il dettaglio esatto dell'addebito mensile.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] feature | Vincolo Dinamico Rate in base alla Durata Abbonamento (3, 6, 12 Mesi) (v1.03.26)
- **Logica Limite Rate**: Implementato il controllo per garantire che il numero di rate mensili non superi la durata in mesi dell'abbonamento/quota. (Trimestrale -> max 3 rate, Semestrale -> max 6 rate, Annuale -> max 12 rate).
- **Backend (`api/create-checkout-session.js`)**: Il parametro `num_rate` viene validato dinamicamente contro la durata del piano o la quota. Se viene richiesto un numero superiore ai mesi dell'abbonamento, il valore viene limitato a `maxRate`.
- **Webhook (`api/stripe-webhook.js`)**: Aggiornato il calcolo di `cancel_at` che ora somma esattamente `installments_total` mesi (3, 6 o 12) dalla creazione dell'abbonamento, eseguendo la cancellazione automatica su Stripe al termine dell'ultimo mese previsto.
- **Frontend (`portal/pagamento.js` & `pagamento.html`)**: Riconfigurato il selettore del portale pagamenti per calcolare ed evidenziare in tempo reale il numero massimo di rate consentite (es. Abbonamento Rateale 3 Mesi, 6 Mesi, 12 Mesi).
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] feature | Abbonamento Ricorrente Rateale 12 Mesi via Stripe Subscriptions (v1.03.26)
- **Backend (`api/create-checkout-session.js`)**: Aggiunto supporto per le sessioni Stripe in modalità `subscription` (`is_installment: true`). Per le quote annuali (es. 600€), il backend calcola l'importo mensile (50€/mese + 2% spese di gestione = 51€/mese) ed avvia il checkout abbonamento ricorrente.
- **Webhook (`api/stripe-webhook.js`)**: Aggiornata la gestione di `checkout.session.completed` per gli abbonamenti: quando l'atleta sottoscrive la prima rata, il webhook imposta automaticamente la proprietà `cancel_at` della subscription Stripe a 12 mesi dalla data di inizio, garantendo l'auto-cancellazione del contratto dopo la 12ª rata senza interventi manuali.
- **Frontend (`portal/pagamento.html` & `portal/pagamento.js`)**: Inserito il selettore "Scegli la modalità di versamento" per le quote pari o superiori a 100€, permettendo all'atleta di scegliere tra *Pagamento in Unica Soluzione* (Carte, Apple Pay, PayPal, Klarna in 3 rate) ed *Abbonamento Rateale 12 Mesi* (Carte o SEPA Direct Debit).
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] feature | Architettura Ledger Registro Variazioni Stato Gruppi Storici (v1.03.26)
- **Frontend Admin (`portal/epika.html`)**: Sostituita la vecchia sezione "Stato Attività" del dettaglio gruppo con un modulo di registrazione variazioni di stato (Stato, Data Inizio `DAL`, Note) ed una tabella **Registro Storico Variazioni**. La prima riga del registro in alto è contrassegnata con il badge `STATO ATTUALE`.
- **Logica JS (`portal/epika.js`)**: Sviluppate le funzioni `aggiungiVariazioneStatoGruppo()`, `eliminaUltimaVariazioneStato()` e `sincronizzaStatoAttualeGruppo()`. Il motore legge la riga in cima al registro per aggiornare dinamicamente il badge di stato, lo stato in cache ed il flag `attivo` (`false` se *cancellato* per nasconderlo dalle registrazioni dei nuovi tesserati).
- **Rollback Variazioni**: Aggiunto un pulsante di eliminazione (`🗑️ ELIMINA`) riservato alla prima riga in alto per consentire la cancellazione immediata dell'ultima variazione inserita per errore, ripristinando automaticamente lo stato cronologico precedente.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Aggiornamento Nome di Battaglia Allenatore Mirco in BATUODAMOS (v1.03.26)
- **Database (Supabase)**: Aggiornato il campo `valore` della riga con `id = 10` (tipo `allenatore`) nella tabella `epika_opzioni` impostandolo da `'Mirco'` a `'BATUODAMOS'`. Il cambio del nome sulla chiave primaria preesistente preserva l'integrità referenziale di tutte le relazioni (account legati, atleti che hanno scelto l'allenatore e viste capogruppo) senza alterare gli ID o spezzare i legami degli utenti.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-23] fix | Restrizione Accesso Sezione Contabilità ad Admin Tito Fabio (v1.03.26)
- **Frontend (`portal/epika.html` & `portal/epika.js`)**: Aggiunta classe `epk-hidden` al pulsante sidebar `#epk-adm-btn-contabilita` e registrato il controllo di visibilità in `configureAdminTabs()` per nasconderlo in tutte le viste Direttivo (`direttivo_epika`, `direttivo_scab`, `direttivo_logistica`, `direttivo_marketing`). Inserita guardia runtime in `switchAdminTab('contabilita')` per bloccare l'accesso diretto via JS ai non-admin.
- **Dashboard (`portal/dashboard.js`)**: Modificata la configurazione dell'Area Direttivo (`currentViewContext === 'board'`) e della funzione `switchTab('contabilita')` per garantire che la tab `#tab-btn-contabilita` sia visibile ed accessibile esclusivamente all'account Admin / Presidente Tito Fabio.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.

## [2026-07-22] fix | Risoluzione SyntaxError JS & Script Versionamento Centralizzato (v1.03.26)
- **Frontend (`portal/epika.js`)**: Eliminata la riga duplicata `.from('epika_profili')` a riga 731 che causava `Uncaught SyntaxError: Unexpected token '.'` e bloccava il portale Epika sulla schermata "IN ATTESA DEL TEMPIO...".
- **Architettura Versionamento (`scripts/bump-version.js`)**: Realizzato uno script Node.js permanente per il versionamento dell'intero progetto. Lo script scansiona tutti i file `.html` e `.js` aggiornando sia le query string di cache asset (`?v=1.03.26`) che le etichette di testo stampate a schermo (`Vs. 1.03.26`).
- **Allineamento Globale**: Eseguito lo script su tutti i moduli (`index.html`, `legal.html`, `privacy.html`, `epika.html`, `dashboard.html`, ecc.) allineando il 100% dei badge visibili del sito a `v1.03.26`.

## [2026-07-22] fix | Blindatura Modale Modifica Profilo & Ripristino Dati Saccomandi (v1.03.26)
- **Database (Supabase):** Ripristinati sul profilo di Andrea Saccomandi i dati corretti (`gruppo_storico_id = 6` - Lega Italica, `popolo = 'Sanniti'`, `ruolo_combattimento = 'combattente'`). Rimossi i log di audit errati generati dal salvataggio vuoto del modale.
- **Frontend (`portal/epika.js`):**
  - **Inizializzazione Modale**: Corretta la funzione `apriModaleModificaProfilo()` per forzare il caricamento preventivo delle lookup se non ancora popolate (`caricaLookupDati()`), prevenendo la perdita dei valori selezionati.
  - **Placeholder & Tipi**: Aggiunte opzioni placeholder trasparenti nelle select del modale e garantito il casting stringa per i matching dei valori preesistenti (`String(prof.gruppo_storico_id)`).
  - **Validazione Severa in Salvataggio**: In `salvaModificheProfilo()`, inseriti controlli severi su `isNaN(gruppoStoricoId)`, stringa vuota su `popolo` e mancata selezione dell'allenatore prima di effettuare l'UPDATE. Impedita l'impostazione accidentale a `null` del gruppo storico.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.

## [2026-07-22] fix | Single Source of Truth RPC Tessera per Epika Combattenti (v1.03.26)
- **Database (Supabase):** Creata la funzione RPC centralizzata `public.get_user_tessera_livello(p_utente_id UUID)` che interroga in primis `public.registro_tesserati` (con `stato_tesseramento = 'ATTIVO'`) via `public.anagrafiche`, e fa fallback su `public.utenti.tipo_tessera`.
- **Database Trigger:** Aggiornata la funzione `check_epika_tessera_ruolo` per invocare `get_user_tessera_livello(NEW.id)`, risolvendo definitivamente il problema di blocco sui tesserati attivi il cui campo `utenti.tipo_tessera` era `NULL`.
- **Frontend (`portal/epika.js`):** In `checkAuthAndLoad`, integrata la chiamata `supabaseClient.rpc('get_user_tessera_livello', ...)` per garantire il 100% di allineamento tra Frontend e Backend (Single Source of Truth). Aggiornata la whitelist di `applicaRestrizioneTessera()`.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.

## [2026-07-22] fix | Restrizione Ruolo Combattente Epika basata su Tessera (v1.03.26)
- **Database (Supabase):** Aggiornato il trigger `trg_check_epika_tessera_ruolo` e la funzione `check_epika_tessera_ruolo` per utilizzare una logica a whitelist (`TESSERE_COMBATTENTI`) al posto di `ILIKE`. Solo chi ha una tessera integrativa può iscriversi come combattente. I tesserati base_silver o base_gold possono iscriversi solo come non_combattente. Gli utenti senza tessera registrata non vengono bloccati.
- **Sanitizzazione DB:** Eseguito update sui dati pregressi per azzerare `allenatore_id` ai record con `ruolo_combattimento = 'non_combattente'` ed `allenatore_id IS NOT NULL` (1 record corretto).
- **Frontend (`portal/epika.js`):** Aggiornata la funzione `applicaRestrizioneTessera()` per usare la whitelist corrispondente a quella del DB, bloccando preventivamente la selezione del ruolo lato UI.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.

## [2026-07-22] ui | Stile Dorato Tasto Portale Epika in Area Tesserato (v1.03.26)
- **CSS & HTML (`portal/dashboard.html`):** Applicato lo stile oro/bordeaux (`#tab-btn-user-epika`) con bordo `rgba(201, 168, 76, 0.4)`, testo oro `#C9A84C` e sfumatura di sfondo anche al pulsante "PORTALE EPIKA" visibile nella vista tesserato (atleta), rendendolo visivamente identico e coerente con il pulsante "GESTIONE EPIKA" dell'area direttivo. Aggiornato anche lo stile nel menu mobile overlay.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.

## [2026-07-22] refactor | Ottimizzazione Robustezza Auto-Fill Mappe & Validazione HTML (v1.03.26)
- **Auto-Fill Asincrono (`portal/epika.js`):** Sostituito l'uso dello stato globale `window.eventiStorici` con una query asincrona diretta e mirata a Supabase (`.ilike('luogo', ...)` con `.limit(1)`). L'auto-completamento del link Google Maps ora funziona in modo del tutto indipendente dallo stato di caricamento della pagina e dalla nav-bar.
- **Validazione Form (`portal/epika.js`):** Aggiunta l'intercettazione esplicita del tag `<iframe` nell'input del link mappa per avvisare chiaramente l'utente di incollare il link di condivisione e non il codice di incorporamento HTML.
- **Pulizia Codice:** Rimosso il popolamento dello stato globale `window.eventiStorici`.
- **Versione:** Incrementata la versione globale a `v1.03.26`.

## [2026-07-22] fix | Isolamento Contabilità Epika dagli Incassi Generali Adrenalina (v1.03.26)
- **Filtro Contabilità EPIKA (`portal/epika.js`):** Isolati i calcoli dei KPI (Incasso Lordo Totale, Spese Totali, Utile Netto e Conteggio Ricevute) nella dashboard contabile Epika per considerare esclusivamente entrate ed uscite pertinenti ad Epika (tramite `evento_id` di `epika_eventi`, `ricevuta_id` di `epika_iscrizioni_eventi` o causale contenente 'Evento Storico'). I movimenti contabili generali di Adrenalina (quote tesseramento, corsi SCAB, ecc.) rimangono rendicontati nella Prima Nota generale e non contaminano più il bilancio Epika.
- **Webhook Stripe (`api/stripe-webhook.js`):** Aggiunto l'aggiornamento automatico della colonna `evento_id` sulla tabella `ricevute_pagamenti` al completamento di un pagamento per iscrizione ad un evento Epika.
- **Database (Supabase):** Aggiornata la ricevuta #43 (€35.70 per Campo Martio 2026) associando direttamente l'ID dell'evento Epika.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.

## [2026-07-22] feature | Integrazione Link Google Maps & Smart Auto-Fill (v1.03.26)
- **Database (Supabase):** Applicata la migrazione DDL per aggiungere la colonna `link_mappa` (TEXT, DEFAULT NULL) alla tabella `epika_eventi`.
- **Admin Event Form (`epika.html`, `epika.js`):**
  - Aggiunto il campo di input per il link Google Maps nel form di creazione/modifica evento.
  - Implementata la funzione `autoFillLinkMappaDaStorico()` che pre-compila automaticamente il link di Google Maps basandosi sull'ultimo evento registrato nello storico con lo stesso luogo (es. Campo Marzio).
  - Aggiunta la validazione severa del link (`google` / `goo.gl` HTTPS) in `salvaEventoStorico()`.
- **Frontend & Navigation (`epika.js`):**
  - Creata la funzione centralizzata `ottieniUrlMappa(evt)` con fallback intelligente alla ricerca Google Maps se il link diretto non è specificato.
  - Per gli utenti **iscritti**: aggiunto il pulsante prominente `📍 NAVIGA / MAPPA 🗺️` direttamente nella scheda dell'evento.
  - Per gli utenti **non iscritti**: reso il testo del luogo un link cliccabile verso la mappa.
  - Per le viste ruolo SCAB (Capogruppo, Allenatore, Allievo, Validatore): reso il luogo dell'evento cliccabile verso la mappa per un rapido orientamento del personale.
- **Versione:** Incrementata la versione a `v1.03.26`.



## [2026-07-21] fix | Risoluzione SyntaxError in epika.js (v1.03.26)
- **JS (portal/epika.js):** Ripristinato la parentesi di chiusura mancante `});` alla riga 4970 del blocco `iscrittiValidatore.forEach`, risolvendo il blocco in fase di parsing script `SyntaxError: missing ) after argument list` e ripristinando il corretto accesso al portale EPIKA.
- **Versione:** Incrementata la versione globale dell'applicazione a `v1.03.26`.


## [2026-07-21] ingest | Tasto Collegamento Regolamento SCAB in Vista Atleta (v1.03.26)
- **HTML (epika.html):** Aggiunto il pulsante di collegamento esterno "📜 REGOLAMENTO SCAB" a fianco di "STORICO MODIFICHE" nella scheda del personaggio dell'atleta (`SCHEDA PERSONAGGIO`), puntando al documento Google Docs del regolamento SCAB.
- **Versione:** Incrementata la versione dell'applicazione a `v1.03.26`.

## [2026-07-21] ingest | Nuova Dashboard Contabilità & Bilancio Eventi (v1.03.26)
- **Database (Supabase):** Eseguita la DDL per aggiungere la colonna `evento_id` a `registro_spese` e `ricevute_pagamenti` consentendo l'imputazione contabile diretta di entrate ed uscite agli eventi EPIKA.
- **HTML (epika.html):** Aggiunto il pulsante `CONTABILITÀ` nel menu Admin, il tab panel `#epk-adm-tab-contabilita` con card KPI (*Incasso Lordo*, *Spese Totali*, *Utile Netto*, *Ricevute*), la barra dei filtri di periodo, la tabella di bilancio per evento, e i modali *Registra Spesa*, *Registra Incasso Manuale* e *Dettaglio Bilancio Evento*.
- **JS (epika.js):** Estesa la navigazione `switchAdminTab('contabilita')`, implementata la funzione `renderContabilitaAdmin()`, la gestione dei modali di inserimento incassi/spese, il calcolo in tempo reale del margine di ciascun evento e l'esportazione in formato CSV.


## [2026-07-21] feature | Presenza Ininterrotta tra Arrivo e Ripartenza (v1.03.26)
- **Modale Iscrizione Utente (`epika.js`):** 
  - Implementata la regola di presenza continuativa tra la prima e l'ultima data selezionate.
  - Quando l'utente spunta la data di arrivo e di ripartenza, tutte le checkbox dei giorni intermedi vengono automaticamente forzate su `checked = true`.
  - Aggiunta la validazione formale in `salvaIscrizioneDettagliata` per impedire l'invio in caso di giorni intermedi spezzettati o buchi nel soggiorno.
- **File aggiornati:** `portal/epika.js`, `bump.js`, `wiki/log.md`.

---

## [2026-07-21] feature | Orari Inline Arrivo/Ripartenza e Limiti Inizio/Fine Evento Admin (v1.03.26)
- **Database (Supabase DDL):** Applicata migrazione `supabase/migration_epika_eventi_orari.sql` che aggiunge le colonne `ora_arrivo_min` e `ora_ripartenza_max` alla tabella `epika_eventi`.
- **Pannello Admin (`epika.html` & `epika.js`):** Aggiunti i due campi d'orario nel form di creazione evento ("Ora Inizio Evento" e "Ora Fine Evento") e aggiornata la scheda dell'evento admin per mostrare la finestra oraria consentita.
- **Modale Iscrizione Utente (`epika.html` & `epika.js`):** 
  - Eliminati i vecchi riquadri `datetime-local` separati.
  - Implementati gli input di orario `<input type="time">` inline direttamente affiancati al primo e all'ultimo giorno selezionato nell'elenco delle presenze.
  - Applicati vincoli `min` e `max` dinamici quando l'utente si iscrive al primo o all'ultimo giorno ufficiale dell'evento.
  - Sviluppata la logica di **Smart Retention** che preserva l'orario già digitato traslandolo automaticamente quando l'utente spunta o despunta i giorni di presenza.
- **File aggiornati:** `supabase/migration_epika_eventi_orari.sql`, `portal/epika.html`, `portal/epika.js`, `bump.js`, `wiki/log.md`.

---

## [2026-07-21] fix | Risoluzione Ricorsione RLS su Tabella Utenti (v1.03.26)
- **Risoluzione Bug Blocco Portale:** Identificato e risolto un errore di ricorsione infinita (`infinite recursion detected in policy for relation "utenti"`) introdotto dalla policy di selezione di `epika_iscrizioni_eventi` che a sua volta interrogava `epika_profili` e poi `utenti`.
- **Implementazione Funzioni Helper (Security Definer):** Create due funzioni con privilegi elevati `public.has_epika_event_registration(uuid)` e `public.is_epika_staff(uuid)` per eseguire interrogazioni cross-tabella bypassando RLS.
- **Aggiornamento Policy:** Modificata la policy RLS `select_consiglio_utenti` sulla tabella `utenti` per utilizzare i nuovi helper ed evitare il loop ricorsivo.
- **File aggiornati:** `supabase/migration_epika_rls_recursion_fix.sql`.

## [2026-07-21] fix | Unificazione Checkout e Risoluzione Limite Serverless Hobby Vercel (v1.03.26)
- **Consolidamento API (Unificazione Checkout):** Uniti i tre file `/api/create-checkout-session.js`, `/api/create-event-checkout-session.js` e `/api/create-epika-event-checkout.js` in un unico file `/api/create-checkout-session.js` intelligente, eliminando i due file ridondanti.
- **Risoluzione Limite Vercel Hobby:** Ridotto il numero di Serverless Functions a 11 (limite Hobby plan: 12), sbloccando la build e i deployment automatici del portale su Vercel.
- **Aggiornamento Frontend:** Aggiornate le chiamate fetch in `portal/epika.js` e `portal/dashboard.js` per puntare all'endpoint unico `/api/create-checkout-session.js`.
- **File aggiornati:** `portal/epika.js`, `portal/dashboard.js`, `api/create-checkout-session.js` (riscritta), `api/create-epika-event-checkout.js` (eliminata), `api/create-event-checkout-session.js` (eliminata).

## [2026-07-21] fix | Hotfix post-review: scope urlParams, check scadenza bozza (v1.03.26)
- **Fix critico (Bug nel Fix 2):** `urlParams` era dichiarata inside `if (haQualcheRuoloSpeciale)` ma usata fuori da quel blocco — per utenti senza ruoli speciali causava ReferenceError. Sostituita con `allUrlParams = new URLSearchParams(window.location.search)` dichiarata sempre nel blocco corretto.
- **Fix robustezza webhook (Problema 5):** Aggiunto filtro `.gt('expires_at', now())` al recupero bozza in `stripe-webhook.js` per impedire la promozione di bozze scadute in edge case (pagamenti tardivi oltre 30 minuti dal checkout).
- **Verifica Capogruppo (Bug 3 — OK):** Il filtro `Number(i.gruppo_storico_id) === Number(currentManagedGroupId)` è confermato corretto: `currentManagedGroupId` è l'ID di `epika_gruppi_storici` e `epika_profili.gruppo_storico_id` è FK verso la stessa tabella. Nessun mismatch di tabella. Aggiunto commento esplicativo.
- **File aggiornati:** `portal/epika.js`, `api/stripe-webhook.js`.

## [2026-07-21] fix | Risoluzione Bug Critici Flusso Iscrizioni e Viste SCAB (v1.03.26)
- **Fix 1 (Simulazione Admin):** Corretto `mostraSimulationBanner` in `epika.js` per richiamare i nuovi tab switcher (`switchAllenatoreTab`, `switchAllievoTab`, `switchValidatoreTab`) anziché le render function dirette, risolvendo la visualizzazione vuota delle schede simulate.
- **Fix 2 (Ritorno da Stripe):** Aggiunta gestione query param `event_payment` (success/cancel) in `initPortal` con feedback alert per confermare visivamente all'utente il completamento del pagamento ed evitare disorientamento.
- **Fix 4 (Ottimizzazione Query):** Aggiunti filtri server-side PostgREST (`.or(...)` con operatore `.cs.`) in `getAllenatoreAllieviIds` e `getAllievoCoachAllieviIds` per scaricare solo gli abbinamenti del coach/allievo interessato anziché l'intera tabella, migliorando performance e sicurezza.
- **File aggiornati:** `portal/epika.js`.

## [2026-07-21] ingest | Iscrizioni Avanzate, Flusso Stripe e Viste SCAB Eventi (v1.03.26)
- **Database (Supabase DDL):** Creata migrazione `supabase/migration_epika_eventi_v3.sql` per aggiungere il `costo` degli eventi, la tabella bozze temporanee `epika_iscrizioni_bozza` e aggiornare le policy RLS per abilitare la lettura ai ruoli SCAB e la scrittura agli admin Epika.
- **API Endpoints:** Creata API serverless `/api/create-epika-event-checkout.js` per gestire il checkout degli eventi con quote e il salvataggio in bozza, ed esteso `/api/stripe-webhook.js` per promuovere le bozze a iscrizioni definitive post-pagamento Stripe ed emettere ricevute con causale dedicata.
- **Frontend HTML/JS:** 
  - Aggiunti i campi orario di arrivo/ripartenza e la logica di sola lettura per il coach abilitante nel modale di iscrizione.
  - Implementato il redirect automatico al pagamento Stripe per gli eventi a pagamento.
  - Aggiunto il campo costo nel form di creazione eventi admin.
  - Riorganizzate le viste di Capogruppo, Allenatore, Allievo e Validatore con layout a sidebar a schede e aggiunto il tab EVENTI con filtraggio pertinenza iscritti per ciascun ruolo.
- **File aggiornati:** `supabase/migration_epika_eventi_v3.sql`, `api/create-epika-event-checkout.js`, `api/stripe-webhook.js`, `portal/epika.html`, `portal/epika.js`.

## [2026-07-21] fix | Hardening Trigger Tessera e Sanitizzazione DB (v1.03.26)
- **Audit Finding (Fix 1 — Dati Pregressi):** Rilevato 1 record in `epika_profili` con `ruolo_combattimento = 'non_combattente'` e `allenatore_id IS NOT NULL` (dato anomalo pre-trigger). Eseguito `UPDATE` di sanitizzazione che ha azzerato il campo. Risultato: 0 anomalie residue.
- **Audit Finding (Fix 2 — Robustezza Trigger DB):** Riscritta la funzione `check_epika_tessera_ruolo()` sostituendo la logica `ILIKE '%base%'` fragile con una **whitelist esplicita** `TESSERE_COMBATTENTI = ARRAY['tessera_integrativa_a', 'tessera_integrativa_b']`. Il messaggio di errore ora include il valore della tessera attuale per facilitare il debug. Verificato con test diretto su DB.
- **Audit Finding (Fix 2 — Robustezza Frontend):** Aggiornata la funzione `applicaRestrizioneTessera()` in `epika.js` con la costante `TESSERE_COMBATTENTI` allineata al trigger DB. Utenti con `currentUserTessera === null` sono ora correttamente bloccati dall'opzione combattente anche lato frontend.
- **File aggiornati:** `supabase/migration_epika_validazione_tessera.sql`, `portal/epika.js`, `portal/epika.html`.

## [2026-07-21] ingest | Validazione Tessera Base e Visibilità Allenatore Epika (v1.03.26)
- **Database (Supabase DDL):** Creata migrazione `supabase/migration_epika_validazione_tessera.sql` con la funzione trigger `check_epika_tessera_ruolo()` ed il trigger `BEFORE INSERT OR UPDATE` su `epika_profili`. Impedisce ai possessori di tessera base di registrarsi/modificarsi come `combattente` ed azzera `allenatore_id` per `non_combattente`.
- **Frontend HTML (`portal/epika.html`):** Aggiunti gli ID contenitore `container-fa-allenatore` e `container-edit-allenatore` per consentire il toggling dinamico del blocco allenatore.
- **Frontend JS (`portal/epika.js`):** 
  - Inclusione di `tipo_tessera` nella query `checkAuthAndLoad`.
  - Creazione funzioni `applicaRestrizioneTessera()`, `gestisciVisibilitaAllenatore()`, `onFaRuoloChange()`, `onEditRuoloChange()`.
  - Risolto bug critico in `handleFirstAccessSubmit` per sbloccare l'iscrizione dei non combattenti.
  - Sincronizzazione visibilità e nullificazione esplicita di `allenatore_id` sia nel Primo Accesso che nel modale Modifica Profilo.

## [2026-07-21] ingest | Validazione Centralizzata Complessità Password e Checklist UX
- **JS (portal/password-validator.js):** Creato modulo centralizzato per la validazione della password (min 8 caratteri, maiuscola, minuscola, numero, carattere speciale) e la gestione dinamica della checklist UI con feedback in tempo reale.
- **Frontend (registrazione, reset-password, dashboard):** Integrate le funzioni del validatore in tutti i moduli del portale dove si crea o modifica una password:
  - `registrazione.html` / `registrazione.js`: Blocco immediato al passaggio dallo Step 1 allo Step 2 e validazione pre-submit.
  - `reset-password.html` / `reset-password.js`: Checklist dinamica e blocco al submit del form di recupero password.
  - `dashboard.html` / `dashboard.js`: Corretto `minlength` da 6 a 8, aggiunta checklist dinamica e blocco prima di `updateUserPassword`.

## [2026-07-20] ingest | Sblocco Selezione Popolo per Gruppo Mercenari (v1.03.26)
- **Database (Supabase):** Aggiornato il campo `popolo` del gruppo `MERCENARI` nella tabella `epika_gruppi_storici` a `NULL` (prima conteneva la stringa `'MERCENARI'`), in modo che il sistema riconosca correttamente che i membri di questo gruppo possono scegliere liberamente la propria cultura.
- **JS (portal/epika.js):** Aggiornate le funzioni `onGruppoStoricoChange()` e `onEditGruppoStoricoChange()` per gestire il caso in cui il popolo del gruppo scelto sia nullo o esplicitamente `'MERCENARI'`, sbloccando la scelta del popolo e svuotando la selezione in modo che l'utente debba selezionare una cultura valida e attiva.


## [2026-07-20] ingest | Correzione ed Allineamento Popoli Atleti (v1.03.26)
- **Database (Supabase):** Aggiornati i record delle tabelle `epika_profili` ed `epika_storico_organico` (2026) per gli atleti specificati:
  - TITO MANLIO TORQUATO IL LUPO BIANCO (Tito) -> **Piceni**
  - ARENTES (Ines) -> **Italici**
  - TÅLAMOD (Manuel Marozzi) -> **Germani**
  - Rimosso inoltre l'elemento redundante "Mercenari" dalle opzioni dei popoli.


## [2026-07-20] ingest | Risolto query di join in renderAthleteDashboard (v1.03.26)
- **JS (epika.js):** Aggiornata la query `renderAthleteDashboard` sostituendo i join espliciti su `epika_gruppi_storici` ed `epika_opzioni` con i join PostgREST basati sulle colonne FK `gruppo_storico_id` e `allenatore_id` per risolvere il blocco dovuto alla presenza di chiavi esterne multiple e ripristinare il corretto caricamento dei dati dell'atleta.
- Incrementata la versione globale a `1.03.26`.

## [2026-07-20] ingest | Popolo nel Registro Generale Componenti (v1.03.26)
- **Database (Supabase):** Aggiunta la colonna `popolo TEXT` a `epika_storico_organico` per consentire il tracciamento storico dell'appartenenza culturale dei mercenari per ciascun anno sociale.
- **HTML (epika.html):** Aggiunto il selettore `#gen-filter-popolo` nella barra filtri della Lista Generale e aggiornato l'intestazione di colonna in `2026 (Ruolo / Gruppo / Popolo)`.
- **JS (epika.js):** Aggiornato `renderListaGeneraleAdmin()` per popolare il filtro dei popoli, `disegnaTabellaListaGenerale()` per visualizzare e filtrare per popolo per l'anno 2026 tramite select a discesa, e `salvaTuttaLaListaGenerale()` per persistere il valore modificato nel database tramite upsert massivo.


## [2026-07-20] ingest | Supporto registrazioni atleti nati all'estero (EE)
- **Database (Supabase):** Eseguita la migrazione `migration_foreign_birth.sql` impostando il default a `'EE'` per `provincia_nascita` nella tabella `public.anagrafiche` per supportare record esteri.
- **Frontend (portal/registrazione.js):** Aggiornato il caricamento dei database in parallelo (`comuni.json` e `stati.json`). Aggiunta la provincia fittizia `EE` (Estero) e popolati i comuni con gli stati esteri quando selezionata. Aggiornato il controllo di coerenza del Codice Fiscale per mappare codici Belfiore esteri (`Z...`) cercando in `statiData`.
- **Backend (api/otp-verify.js):** Aggiornato l'upsert di completamento registrazione per popolare la colonna `stato_nascita` della tabella `anagrafiche` valorizzandola con lo stato estero (o `'Italia'` per le province normali).
- **Dati (portal/stati.json):** Generato il file di decodifica dei 226 stati esteri associati ai codici catastali fiscali italiani.

## [2026-07-20] ingest | Aggiunta delle viste Allenatori, Allievi, Validatori e Binding Account (v1.03.26)
- **DB (migration):** Aggiunta `utente_id` e `profilo_epika_id` su `epika_opzioni` per legare soggetti SCAB ad account reali.
- **HTML (epika.html):** Aggiunti modale di binding account, banner di simulazione admin e i tre container per le nuove dashboard.
- **JS (epika.js):** Logica di binding account nel tab Ruoli SCAB, rilevamento ruolo SCAB in `initPortal`, switcher di simulazione admin con banner, e funzioni di rendering per le tre nuove dashboard.

## [2026-07-20] ingest | Fix Ordinamento Certificato Medico in Dashboard (v1.03.26)
- **JS (dashboard.js):** Aggiunto il campo `created_at` nelle query relazionali per `certificati_medici` nelle funzioni `loadTesserati` e `loadApprovazioni`.
- **JS (dashboard.js):** Riscritta la logica di ordinamento in `getCertInfo` per renderla robusta e basata solo sui campi auto-generati dal database (`created_at` e `id`), rimuovendo il fallback su `data_scadenza` (campo di input dell'utente) e risolvendo il bug in cui un certificato rifiutato con un refuso sull'anno (es. 2028) veniva mostrato sopra un certificato valido più recente (es. 2027).

## [2026-07-17] ingest | Separazione Pannelli Event Dashboard e Gestione Presenze (v1.03.26)
- **HTML (epika.html):** Corretta la nidificazione del modale `#adm-presenze-panel` chiudendolo prima dell'apertura del blocco `#adm-dashboard-evento-panel` (che prima causava la sovrapposizione e impediva il corretto funzionamento del pulsante "Dashboard").
- **JS (epika.js):** Aggiornate le funzioni `mostraPannelloPresenze()` e `mostraDashboardEvento()` per garantire che l'apertura di un pannello nasconda esplicitamente l'altro (`epk-hidden`), assicurando che i due strumenti rimangano separati e operativi indipendentemente.


## [2026-07-17] ingest | Fix RLS select_consiglio_anagrafiche Policy (v1.03.26)
- **Database (Supabase):** Applicata la patch `migration_fix_rls_anagrafiche_utente.sql` che corregge tre riferimenti errati a `anagrafiche.id` sostituendoli con `anagrafiche.utente_id` nella policy `select_consiglio_anagrafiche` della tabella `anagrafiche`. Questo ripristina la possibilità per gli utenti ordinari di leggere il proprio record di anagrafica e di conseguenza caricare nuovi certificati medici.
- **Versione:** Incrementata la versione a v1.03.26.

## [2026-07-16] ingest | Fix Tag Nidificazione Tab Lista Generale (v1.03.26)
- **HTML (epika.html):** Aggiunto il tag di chiusura `</div>` mancante per il tab panel degli Eventi (`#epk-adm-tab-eventi`), che causava la nidificazione errata dei tab successivi (inclusa la Lista Generale) e ne impediva la visualizzazione quando venivano nascosti i pannelli degli eventi.


## [2026-07-16] ingest | Modifica Profilo Atleta e Registro delle Modifiche (v1.03.26)
- **Database (Supabase DDL):** Applicata la migrazione `migration_epika_registro_modifiche.sql`. Creata la tabella `epika_registro_modifiche_profilo` con politiche RLS di sola lettura proprietario/admin. Definito un trigger `trg_log_epika_profilo_updates` che registra in automatico i cambi di Gruppo Storico, Popolo, Ruolo Combattimento e Allenatore, risolvendo gli ID nei corrispettivi valori testuali per garantire immutabilità dello storico.
- **HTML (epika.html):** Aggiunti i pulsanti "MODIFICA" e "STORICO MODIFICHE" nella scheda del personaggio dell'atleta. Creati i modali `#epk-edit-profile-modal` per la modifica dei campi e `#epk-modifiche-registro-modal` con la tabella per visualizzare il log modifiche.
- **JS (epika.js):** Spostata la lista degli allenatori `allenatoriLista` a livello globale. Implementate le funzioni `apriModaleModificaProfilo()`, `onEditGruppoStoricoChange()`, `salvaModificheProfilo()` e `apriModaleRegistroModifiche()` con caricamento asincrono on-demand (lazy-load) dei log dal database.

## [2026-07-16] ingest | Date Eventi Range, Iscrizione Dettagliata JSONB e Viste Direttivi Condizionali (v1.03.26)
- **Database (Supabase DDL):** Applicata la migrazione `migration_epika_eventi_v2.sql` che introduce `data_inizio` e `data_fine` per gli eventi, e aggiunge le colonne `giorni_presenza` (array di date) e `dettagli` (JSONB) alle iscrizioni. Aggiornate le policy RLS per consentire la lettura dei profili, degli utenti e delle anagrafiche ai membri dei direttivi.
- **HTML (epika.html):** Sostituito l'input data singolo del form di creazione con i campi `Data Inizio` e `Data Fine`. Aggiunto il modale `#epk-iscrizione-modal` con il questionario per i combattenti e la selezione dei giorni di presenza. Aggiunti i tab e sidebar button per Logistica e Marketing.
- **JS (epika.js):** Configurato lo switcher a 7 viste per caricare dinamicamente i tab sidebar corretti. Implementata la logica di visualizzazione read-only (disabilitazione pulsanti, checkbox e select) per tutti i direttivi in tutte le tabelle. Sviluppata la logica di iscrizione strutturata JSONB e la dashboard statistiche dell'evento con filtro/ricerca.

## [2026-07-16] ingest | Ripristino Visibilità Pulsante Epika e Documenti su Mobile (v1.03.26)
- **HTML (dashboard.html):** Aggiunta la mappatura dei tab `user_documento`, `user-epika` e `epika-presidente` all'interno dell'oggetto `tabConfig` usato dalla funzione `populateMobileMenu()` per generare dinamicamente il menu a comparsa (hamburger menu) su dispositivi mobili.
- **HTML (dashboard.html):** Implementato il supporto per il reindirizzamento dei click ai gestori di eventi `onclick` definiti inline sui pulsanti desktop (es. per il Portale Epika che apre una nuova finestra con `window.open`) anche sui corrispondenti pulsanti generati per il menu mobile.
- Incrementata la versione globale a `1.03.26`.

## [2026-07-16] ingest | Filtri, Ordinamento e Popolo in Soggetti Iscritti Capogruppo (v1.03.26)
- **HTML/JS (epika.html & epika.js):**
  - Aggiunta una barra di controllo nel tab "Iscritti al Gruppo" (Vista Capogruppo) con ricerca testuale, filtro ruolo combattimento, filtro popolo (generato dinamicamente con i popoli degli iscritti correnti) e ordinamento A-Z / Z-A.
  - Aggiunta la colonna con la numerazione dinamica **N.** a sinistra nella tabella iscritti capogruppo.
  - Aggiunta la colonna **Popolo** nella tabella, rendendo visibile l'appartenenza etnica di ciascun iscritto (fondamentale per mappare i mercenari).
  - Ottimizzato il rendering con aggiornamento in-memory.


## [2026-07-16] ingest | Ottimizzazione Lista Generale (Solo 2026, Filtri e Numerazione) (v1.03.26)
- **HTML/JS (epika.html & epika.js):**
  - Rimosse le colonne e i selettori per gli anni 2027 e 2028 nella Lista Generale, lasciando visibile solo il 2026.
  - Aggiunta una barra di controllo con input di ricerca testuale (nome di battaglia/reale) e filtri a tendina (per ruolo e gruppo storico).
  - Aggiunto il pulsante per ordinare i tesserati in ordine alfabetico A-Z / Z-A.
  - Aggiunta la colonna con la numerazione sequenziale automatica delle righe visualizzate.
  - Ottimizzato il rendering con caricamento in-memory e aggiornamento UI reattivo all'input dei filtri.


## [2026-07-16] ingest | Stato Gruppi Storici e Lista Generale Componenti (v1.03.26)
- **Database (Supabase DDL):**
  - Eseguita la migrazione `migration_epika_gruppi_stato_e_lista.sql`.
  - Aggiunti i campi `stato` ('in_formazione', 'ufficiale', 'sospeso') e `data_stato` (gestito manualmente) a `epika_gruppi_storici`.
  - Creata la tabella `epika_storico_organico` per tracciare il ruolo e il gruppo storico per gli anni futuri 2026-2028, con RLS attiva.
- **HTML (epika.html):**
  - Aggiunti selettori e input data nel tab Dettaglio Gruppo per modificare lo stato e la data del cambio stato.
  - Aggiunto il pulsante "LISTA GENERALE" nella barra laterale di amministrazione.
  - Creata la struttura della tabella di planning nel nuovo tab `epk-adm-tab-generale`.
- **JS (epika.js):**
  - Implementata la funzione `salvaTuttaLaListaGenerale` per effettuare il salvataggio batch (upsert singolo) di tutte le modifiche pianificate.
- Reordered the components of the `<header>` element in `portal/epika.html` from left to right: Epika Logo, Title, Version Badge, Admin view switcher on the left; User full name (uppercase) with Battle Name below it, Close Button on the right.
- Incremented global version tag to `v1.03.26`.

## [2026-07-16] ingest | Implementazione Vista Capogruppo (v1.03.26)
- **HTML (epika.html):** Aggiunta la sezione `#epk-capogruppo` comprendente la sidebar e i pannelli "Dati Gruppo" (summary card in sola lettura) e "Iscritti al gruppo".
- **JS (epika.js):**
  - Aggiunti controlli all'inizializzazione (`initPortal`) per determinare se l'utente gestisce gruppi storici come Capogruppo o Vice Capogruppo.
  - Implementata la generazione e popolazione dinamica dello switcher viste per gli utenti abilitati.
  - Creata la funzione `switchCapoTab` per la navigazione dei tab del Capogruppo.
  - Implementate le funzioni di rendering `renderCapoDatiGruppo`, `renderCapoStoricoRuoli` e `renderCapoIscrittiGruppo` per visualizzare i membri del gruppo e la cronologia mandati con RLS.
- **Database (Supabase DDL):** Creata ed eseguita la migrazione SQL (`migration_epika_capogruppo_rls.sql`) per le policy RLS di lettura (`epika_profili` e `utenti`) a favore dei capigruppo e vice capigruppo.

## [2026-07-16] ingest | Risolve ambiguità Join PostgREST epika_gruppi_storici (v1.03.26)
- **JS (epika.js):** Aggiunto il modificatore di relazione `!gruppo_storico_id` al select di embedding di `epika_gruppi_storici` in `renderAthleteDashboard()`. Questo risolve l'errore `PGRST201` generato a causa dei molteplici vincoli di chiave esterna tra `epika_profili` e `epika_gruppi_storici`.


## [2026-07-16] ingest | Fix Syntax Error in creaGruppoStorico (v1.03.26)
- **JS (epika.js):** Risolto errore sintattico `Unexpected end of input` dovuto a una parentesi graffa di chiusura mancante alla fine della funzione `creaGruppoStorico`.

## [2026-07-16] ingest | Gestione Gruppi Avanzata e Storicizzazione Ruoli (v1.03.26)
- **HTML (epika.html):**
  - Aggiunti i campi select per Popolo, Capogruppo, Vice Capogruppo e Responsabile Iscrizioni nel form di creazione gruppo.
  - Aggiunto il bottone "Gestione" per ogni gruppo storico nella tabella amministrativa.
  - Creato il pannello di dettaglio `#epk-adm-tab-gruppo-dettaglio` con date di attività, ruoli attuali e tabella dello storico mandati.
- **JS (epika.js):**
  - Modificata `caricaLookupDati` per caricare anche la cache dei tesserati completati e pre-popolare le select del form.
  - Aggiornata `creaGruppoStorico` per salvare i ruoli ed effettuare il primo inserimento nella tabella storica.
  - Implementate le funzioni `apriDettaglioGruppo`, `chiudiDettaglioGruppo`, `salvaRuoliGruppo` e `salvaDateGruppo`.
  - Aggiornato `renderTesseratiNomineInverso` per calcolare ed auto-compilare i quadri Capi Gruppo, Vice Capi Gruppo e Responsabili Iscrizioni, disabilitando la modifica manuale per questi tre quadri.
- **Database (Supabase DDL):**
  - Aggiunti campi FK e date di validità a `epika_gruppi_storici`.
  - Creata la tabella `epika_storico_ruoli_gruppi` con politiche RLS.
  - Aggiunto il gruppo di lavoro "Gruppo Vice Capi Gruppo" a `epika_gruppi_lavoro`.
- **Regole Agenti:** Creata la regola base in `.agents/AGENTS.md` per promuovere la storicizzazione dei dati in Epika.

## [2026-07-16] ingest | Dashboard Popoli, Bottone Cancella e Fix Tendine Nomine (v1.03.26)
- **HTML (epika.html):**
  - Aggiunto il pulsante "POPOLI" nella sidebar amministrativa.
  - Creato il pannello `#epk-adm-tab-popoli` per la gestione dei Popoli.
  - Rimosse le opzioni hardcoded nei select di primo accesso e creazione gruppo, predisposte per il popolamento dinamico.
- **JS (epika.js):**
  - Modificata `caricaLookupDati` per proteggerla da crash in assenza di nodi DOM e per caricare dinamicamente la lista dei Popoli da `epika_popoli`.
  - Iniettata la chiamata a `caricaLookupDati` in testa a `renderAdminDashboard` per risolvere il bug della tendina vuota nelle nomine capi gruppo.
  - Implementate le funzioni CRUD per i Popoli (`renderPopoliAdmin`, `creaPopolo`, `toggleStatoPopolo`, `cancellaPopolo`).
  - Aggiornato il rendering di SCAB, Ruoli, Gruppi Storici e Popoli con bottoni compatti "Dis" (orange) e "Canc" (red).
  - Implementata la cancellazione fisica con gestione dell'eccezione di ForeignKey (Postgres 23503) per guidare l'utente alla disattivazione sicura.
- **Database (Supabase DDL):** Creata la tabella `epika_popoli` con politiche RLS per la lettura autenticata e scrittura admin.

## [2026-07-16] ingest | Pannello Gruppi Storici e Raffinamento Nomine Direttivi (v1.03.26)
- **HTML (epika.html):**
  - Aggiunto il pulsante "GRUPPI STORICI" nella sidebar amministrativa.
  - Creato il pannello `#epk-adm-tab-gruppi` per la gestione CRUD dei gruppi storici.
  - Aggiunta la sezione `#adm-nomina-modal-represent-container` nel modale di nomina per la selezione del gruppo storico rappresentato per ciascuna riga (per-row selection).
- **JS (epika.js):**
  - Implementate le funzioni CRUD per i gruppi storici (`renderGruppiStoriciAdmin`, `creaGruppoStorico`, `toggleStatoGruppoStorico`).
  - Restretta la visibilità del flag `ADMIN` all'interno della board dei Direttivi esclusivamente per il "Direttivo Epika" (ID 1).
  - Aggiunto il rendering del gruppo rappresentato accanto al nome di battaglia per "Capi Gruppo" (5) e "Responsabili Iscrizioni" (6).
  - Implementata la logica per salvare `rappresentante_gruppo_storico_id` all'aggiunta di nomine e cancellarlo all'eliminazione del ruolo solo se l'utente non ricopre più nessun altro ruolo di rappresentanza.
- **Database (Supabase DDL):** Aggiunta colonna `rappresentante_gruppo_storico_id` a `epika_profili` che punta a `epika_gruppi_storici(id)`.

## [2026-07-16] ingest | Correzioni SCAB e Nomine Multi-Ruolo Direttivi (v1.03.26)
- **JS (epika.js):**
  - Corretto bug `switchScabSubTab` per mappare correttamente gli ID dei bottoni tab modificati (`scab-tab-btn-palestre-centri` e `scab-tab-btn-ruoli`).
  - Rinominata la funzione `renderAllenatoriAdmin` a `renderRuoliAdmin` per risolvere il ReferenceError nel rendering SCAB.
  - Modificato il sistema di nomine direttivi/gruppi di lavoro in `epika_profili` migrando la colonna `gruppo_lavoro_id` (singola) alla colonna array `gruppo_lavoro_ids` (`bigint[]`).
  - Aggiornate le funzioni `renderTesseratiNomineInverso`, `filtraTesseratiNomina`, `salvaNominaLavoroInverso` e `rimuoviNominaLavoroInverso` per supportare l'assegnazione multipla di ruoli.
  - Aggiornata la dashboard dell'atleta e il diagramma Mermaid per gestire e mostrare gruppi multipli associati all'utente.
- **Database (Supabase DDL):** Eseguita migrazione per convertire `gruppo_lavoro_id` in array ed eliminati i gruppi non più desiderati ("Gruppo Validatori" e "Coordinamento Allenatori Validatori", disattivati impostando `attivo = false`).


## [2026-07-15] ingest | Spostamento Gestione Allenatori dentro SCAB (v1.03.26)
- **HTML (epika.html):** Rimosso il bottone "ALLENATORI" dal menu laterale primario e rimosso il pannello di tab dedicato. Inserito il sotto-tab "Allenatori" all'interno del pannello SCAB e la corrispondente sezione di gestione dell'anagrafica allenatori.
- **JS (epika.js):** Aggiornata la funzione `switchScabSubTab` per gestire il sotto-tab allenatori. Modificata `renderSCABTab` affinché inizializzi ed esegua la renderizzazione della lista allenatori all'avvio della sezione SCAB.



## [2026-07-15] ingest | Patches e Correzioni Sezione Amministratore (v1.03.26)
- **JS (epika.js):**
  - Risolto bug ricerca modale nomine: aggiunto `nome_reale` (nome e cognome dall'anagrafica utenti) all'oggetto cache in modo che la ricerca filtri sia sul nome di battaglia che sul nome reale.
  - Implementata protezione contro i crash SCAB dovuti a array nulli dal database (`allenatori_co_ids` e `allievi_ids` ora beneficiano di un fallback automatico a `[]`).
- **CSS (epika.css):**
  - Risolto bug visualizzazione sidebar mobile: aggiunto `flex-shrink: 0` ai pulsanti della sidebar amministratore per evitarne il restringimento illecito su dispositivi touch.



## [2026-07-15] ingest | Sezione Amministratore EPIKA & Sistema SCAB (Fase 1-4) (v1.03.26)
- **DB (Supabase):** Creazione delle tabelle `epika_scab_strutture` e `epika_scab_abbinamenti` con campi Array (`BIGINT[]`) per allievi e co-allenatori. Configurate policy RLS (lettura per tutti gli autenticati, scrittura solo admin/presidente). Seeded soggetti SCAB in `epika_opzioni` (tipo `soggetto_scab`) e strutture iniziali (10 palestre, 4 centri).
- **CSS (epika.css):** Aggiunte classi per la sidebar responsiva `.epk-admin-layout`, `.epk-admin-sidebar`, `.epk-admin-content`, `.epk-sidebar-btn` con supporto mobile-first (scroll orizzontale sotto i 768px).
- **HTML (epika.html):** Ristrutturato il blocco `#epk-admin` per supportare la navigazione a schede (sidebar sinistra + contenuti a destra). Inseriti i blocchi per Dash Generale, Direttivi, SCAB (Abbinamenti + Anagrafica), Allenatori ed Eventi. Aggiunto modale centralizzato `#adm-nomina-modal` per l'inserimento dei tesserati.
- **JS (epika.js):**
  - Implementata la funzione di routing `switchAdminTab(tab)` con caricamento dati on-demand.
  - Sviluppata la logica per la gestione inversa dei Direttivi (`renderTesseratiNomineInverso`) con quadri dedicati, checkbox admin e autocompletamento in modale.
  - Sviluppato l'intero modulo SCAB (`renderSCABTab`) con gestione tabellare Excel-like, select dinamiche, CRUD strutture/soggetti e salvataggio array in formato Postgres.

## [2026-07-15] ingest | Area Documento Identità + Validazione AI + Fix Dashboard Board Member (v1.03.26)
- **DB (Supabase):** `ALTER TABLE documenti_identita` — aggiunte colonne `data_scadenza DATE`, `stato_validazione VARCHAR(20)`, `note_ai TEXT`, `confidence_score INTEGER`, `tipo_documento VARCHAR(20)`. Aggiornati 20 record legacy a `stato_validazione = 'GIALLO'`. Aggiunte policy RLS `INSERT` e `UPDATE` per l'utente autenticato.
- **DB (Supabase):** Aggiunte colonne `documento_identita_scadenza DATE` e `tutore_documento_scadenza DATE` alla tabella `utenti` (staging temporaneo per il flusso di registrazione).
- **DB (Supabase):** Creato DB trigger `AI_Validate_Document` su `INSERT` in `documenti_identita` che chiama automaticamente `POST /api/validate-doc` (pattern identico a `AI_Validate_Certificate`).
- **Nuovo file `api/validate-doc.js`:** Endpoint API per validazione documenti identità via Gemini AI. Supporta sia webhook automatici (DB trigger) sia validazione manuale dal Direttivo. Prompt AI specializzato per CI/Passaporto/Patente con estrazione di `data_scadenza` e stato semaforo VERDE/GIALLO/ROSSO. Email automatiche in caso di ROSSO o GIALLO.
- **`api/otp-verify.js`:** Fix INSERT C3 in `documenti_identita`: aggiunto `data_scadenza`, `tipo_documento = 'PERSONALE'`, `stato_validazione = 'IN_ATTESA'`. Aggiunto blocco C4 per il documento del tutore/genitore dei minorenni (`tipo_documento = 'TUTORE'` dal bucket `documenti_tutori`). Aggiornata SELECT del profilo per includere i nuovi campi.
- **`portal/registrazione.html`:** Aggiunto campo `<input type="date" id="documento_identita_scadenza">` obbligatorio nella sezione documento d'identità. Aggiunto campo analogo `tutore_documento_scadenza` nella sezione minorenni.
- **`portal/registrazione.js`:** `updatePayload` ora include `documento_identita_scadenza` e `tutore_documento_scadenza` nel salvataggio in `utenti`.
- **`portal/dashboard.js`:** Fix bug board member: `loadUserDashboard` ora mostra i widget anche quando `isBoardMember && currentViewContext !== 'board'`. Fix bug anno hardcoded: due occorrenze di `'31/12/2026'` sostituite con `'31/12/' + new Date().getFullYear()`. `switchContext()` aggiornato per mostrare/nascondere `user-panoramica-widgets` al cambio di contesto.
- **`portal/dashboard.js`:** Aggiunta funzione `loadUserDocumento()` con rendering semaforo, storico documenti (PERSONALE + TUTORE), e upload aggiornamento con validazione AI automatica. Aggiunta funzione `loadDocsAttesa()` per il Direttivo con bottoni APPROVA/RIFIUTA/RINVIA. `tab-btn-user_documento` aggiunto a `hideAllTabs()` e a tutti i contesti non-board. `loadDocsAttesa()` viene chiamata all'apertura del tab Approvazioni.
- **`portal/dashboard.html`:** Aggiunto `tab-btn-user_documento` nel menu laterale. Aggiunto `panel-user_documento` con sezione documento personale e tutore. Aggiunta sezione "Documenti in attesa di verifica" nel pannello Registro Approvazioni. Estesa join `documenti_identita` nella query `loadApprovazioni` per includere `stato_validazione`, `note_ai`, `data_scadenza`, `tipo_documento`.
- Incrementato global version tag a `v1.03.26`.

## [2026-07-15] ingest | Remove Epika Banner from Athlete Overview, Fix package.json bumping (v1.03.26)
- Removed the `#epika-banner-container` yellow panel element and its inline CSS styles from the athlete's Panoramica dashboard view in `portal/dashboard.html`.
- Updated `portal/dashboard.js` to remove show/hide triggers related to the obsolete `epikaBanner`.
- Fixed a bug in `bump.js` where running the script would corrupt library versions in `package.json` and `package-lock.json`, excluding them from the replacement.
- Incremented global version tag to `v1.03.26`.

## [2026-07-14] ingest | Add Piceni to Peoples List, Remove Debug Panel and Adrenalina Logo, and Add Version Badge (v1.03.26)
- Removed the Adrenalina logo icon from `portal/epika.html` header as requested.
- Added a stylized version badge (e.g. `Vs. 1.03.26`) next to the "EPIKA" header title using a new CSS class `.epk-version-badge` defined in `portal/epika.css`.
- Added the "Piceni" option to the static peoples/cultures dropdown select.
- Removed the troubleshooting `#epk-debug-box` and debug log code statements from `portal/epika.html` and `portal/epika.js`.
- Incremented global version tag to `v1.03.26`.

## [2026-07-14] ingest | Resolve Infinite Recursion in epika_profili RLS Policy (v1.03.26)
- Fixed an `infinite recursion detected` (error `42P17`) inside the PostgreSQL RLS policy of the `epika_profili` table. Semplified SELECT policies by removing recursive cross-checks on the table itself and using simple `auth.uid() IS NOT NULL` evaluations, restricting modifications (UPDATE) strictly to owners and the President.
- Incremented global version tag to `v1.03.26`.

## [2026-07-14] ingest | Solve PostgreSQL RLS Incompatibility and SyntaxError in epika.js (v1.03.26)
- Patched the Row Level Security (RLS) policies on all `epika_*` tables to directly query `public.utenti` instead of using the custom function `get_user_role(auth.uid())`, which generated PostgreSQL schema cast errors (HTTP 500) when executed within the EPIKA context.
- Fixed an `Uncaught SyntaxError` in `portal/epika.js` by removing a duplicate variable declaration of `gruppoScelto`.
- Incremented global version tag to `v1.03.26`.

## [2026-07-14] ingest | Add Debug Logger Panel for EPIKA First Access Dropdowns Troubleshooting (v1.03.26)
- Added an on-page `#epk-debug-box` display panel in `portal/epika.html` to output real-time initialization steps, query results lengths, and runtime errors.
- Updated `portal/epika.js` to log events (session validation, lookup table queries) and catch statements directly onto the debug panel.
- Incremented global version tag to `v1.03.26`.

## [2026-07-14] ingest | Classical Antiquity Historical Portal (EPIKA) Portals & Logics (Fase 2-5) (v1.03.26)
- Created and styled the classical antiquity-themed portal UI `portal/epika.html`, `portal/epika.css` (parchment, terracotta, and gold color scheme with Cinzel serif typography) and its script `portal/epika.js`.
- Implemented robust Supabase session checks and automatic login redirect (`login.html?redirect=epika`) inside `epika.js`.
- Added the Athlete's EPIKA overview entry banner (`#epika-banner-container`) and the President's admin button (`#tab-btn-epika-presidente`) inside `portal/dashboard.html` and `portal/dashboard.js`, dynamically showing/hiding elements depending on the context.
- Implemented a Named Window tab system (`window.open(..., 'portale_epika')`) to prevent duplicate page instances and handle window focusing.
- Created the First Access setup form in `epika.html` to populate the `epika_profili` table, dynamically linking selected groups to cultures (auto-populating and disabling choices except for Mercenari).
- Built character profile cards, dynamic years-of-service computation, and count-only statistics (`COUNT()` on confirmed presenze in `epika_presenze_eventi`) inside `epika.js`.
- Developed President administrative panels including dynamic Working Groups assignment dropdown selectors, Coaches CRUD actions, and past event registrations attendance toggle checkers.
- Integrated dynamic structural organigram drawing powered by Mermaid.js, initializing rendering post-visibility container insertion (`mermaid.run`) to resolve dimensions computations bugs.
- Incremented global version tag to `v1.03.26`.

## [2026-07-14] ingest | Classical Antiquity Historical Portal (EPIKA) Database Migration (Fase 1)
- Created the 7 isolated database tables (`epika_gruppi_storici`, `epika_gruppi_lavoro`, `epika_opzioni`, `epika_profili`, `epika_eventi`, `epika_iscrizioni_eventi`, `epika_presenze_eventi`) to build the classical antiquity historical re-enactment environment without corrupting the existing Adrenalina database.
- Executed the DDL migration query successfully on Supabase, establishing Row Level Security (RLS) rules on all tables to prevent cross-profile data leakage and restrict administrative writes to `is_admin_epika` accounts or the Adrenalina `presidente` role.
- Seeded lookup tables with the 9 historical groups mapped to their respective cultures (e.g. Celti, Romani, Greci), the 8 event-organizing working groups, and the 10 reference coaches.
- Setup an automatic trigger `trg_epika_profili_updated_at` to update `updated_at` timestamps on profile modifications.
- Documented the entire schema structure in the new wiki page [epika_portal.md](epika_portal.md).

## [2026-07-14] ingest | Fix Resend API Key Rotation and Email Script Error Reporting (v1.03.26)
- Diagnosticato il mancato recapito delle email di sospensione a causa della chiave `RESEND_API_KEY` scaduta/revocata (risposta `401 API key is invalid`). La chiave è stata rigenerata sul pannello Resend e aggiornata nel file `.env` locale.
- Migliorato lo script `scripts/send-suspended-emails-cli.js` aggiungendo un contatore di errori e un riepilogo finale. Il processo ora termina con `exit code 1` se almeno un'email fallisce, rendendo il job di GitHub Actions ❌ rosso e immediatamente visibile.
- Eseguito l'invio riuscito delle 15 email di notifica sospensione a tutti gli atleti con stato SOSPESO in produzione (15/15 consegnate senza errori).
- Incrementata la versione globale a v1.03.26.

## [2026-07-13] ingest | Remove send-suspended-emails.js Serverless Function to comply with Hobby Limit (v1.03.26)
- Rimosso l'endpoint `api/send-suspended-emails.js` per rientrare nel limite massimo di 12 Serverless Functions imposto dal piano Vercel Hobby, risolvendo l'errore di build fallita ("Build Failed: No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan").
- Mantenuto lo script CLI e il workflow GitHub Actions per l'invio manuale in sicurezza.
- Incrementata la versione globale a v1.03.26.

## [2026-07-13] ingest | GitHub Actions Workflow for Sending Suspended Emails (v1.03.26)
- Aggiunto lo script CLI `scripts/send-suspended-emails-cli.js` e il relativo workflow GitHub Actions `.github/workflows/send_suspended_emails.yml` per consentire l'invio manuale delle mail a tutti i tesserati attualmente sospesi utilizzando le chiavi di produzione registrate nei secrets del repository.
- Incrementata la versione globale a v1.03.26.

## [2026-07-13] ingest | Send Out Emails to Suspended Members Endpoint (v1.03.26)
- Creato l'endpoint temporaneo `api/send-suspended-emails.js` per scorrere tutti i tesserati attualmente in stato `SOSPESO` e inviare loro l'email ufficiale di notifica sospensione con le nuove indicazioni sulle restrizioni del portale.
- Incrementata la versione globale a v1.03.26.

## [2026-07-13] ingest | Unified Certificate Expiry Scan, Vercel Auth, Auto-Reactivation and Athlete UI Restriction (v1.03.26)
- Risolto l'errore di autenticazione del cron job su Vercel in `api/cron-scadenze.js` supportando l'header `Authorization: Bearer <token>` in aggiunta a `x-cron-secret`.
- Corretto il bug critico dello storico certificati: il cron job ora esegue una scansione unificata partendo dagli atleti e selezionando solo il certificato più recente (ordinato per `created_at DESC`), risolvendo falsi positivi a 30, 15 giorni e sospensioni errate.
- Introdotta la riattivazione automatica del tesseramento sportivo (da `SOSPESO` ad `ATTIVO`) sia a livello di cron giornaliero sia istantaneamente all'approvazione VERDE manuale/automatica in `api/validate-cert.js`.
- Riformulati i template email di pre-avviso (30 e 15 giorni) e sospensione per specificare chiaramente la limitazione temporanea del portale atleti alla sola consultazione e caricamento documenti.
- Implementata la restrizione UI nel portale atleti (`portal/dashboard.js`): per gli atleti con certificato scaduto, rifiutato (`ROSSO`) o mancante, i tab Corsi ed Eventi vengono nascosti e l'utente viene forzato sulla schermata di caricamento del certificato.
- Incrementata la versione globale a v1.03.26.

## [2026-07-13] ingest | Tuner Loading Reference Fix & Inline Sticky Preview UI (v1.03.26)
- Corretto il posizionamento sticky dell'anteprima PDF sul tuner applicando stile inline `position: sticky; top: 90px; align-self: start;` per evitare conflitti con la testata fissa e garantire il corretto funzionamento dello scorrimento.
- Definite le funzioni globali `showLoader` e `hideLoader` in `portal/dashboard.js` per risolvere il crash causato da ReferenceError all'atto del salvataggio, ripristinando il feedback visivo di successo all'utente.
- Verificato il corretto salvataggio delle coordinate di logo e intestazione nel database.
- Incrementata la versione globale a v1.03.26.

## [2026-07-13] ingest | PDF ESM, CSEN Sync Fixes, Association Logo Header & Sticky Preview UI (v1.03.26)
- Corretto l'uso di `__dirname` in ambiente ES Modules (`api/otp-verify.js` e script di utilità) sostituendolo con `fileURLToPath` per evitare crash silenti a runtime su Vercel.
- Sistemata la formattazione della data di nascita nel portale CSEN (richiesto formato nativo `YYYY-MM-DD` da Playwright per input tipo data) e introdotta la validazione di fallimento se l'atleta non compare sul portale dopo il submit.
- Aggiunta logica di auto-healing in `scripts/csen_reconciliation.js` per resettare a `PENDING` gli atleti non trovati su CSEN.
- Integrata la stampa del logo dell'associazione (`assets/logo_icon.png` in scala 40x40 pt) e dei testi dell'intestazione dell'associazione nel riquadro in alto a sinistra del Modulo CSEN, con coordinate posizionali configurabili.
- Ottimizzato il Tuner PDF della dashboard presidenziale (`portal/dashboard.html` e `portal/dashboard.js`) rendendo l'anteprima PDF `sticky` (lg:sticky lg:top-4 self-start) e rimuovendo i limiti di altezza sui controlli per permettere uno scorrimento agevole senza perdere di vista il modello compilato. Aggiunto il caching in memoria del logo buffer per ottimizzare le prestazioni.
- Eseguita la migrazione SQL delle coordinate predefinite ed eseguita la rigenerazione retroattiva dei PDF storici.
- Incrementata la versione globale a v1.03.26.

## [2026-07-10] ingest | Medical Certificate Overwrite and AI Validation Optimization (v1.03.26)
- Modificato `api/validate-cert.js` per utilizzare la chiave primaria `id`/`cert_id` nelle operazioni di aggiornamento database anziché `anagrafica_id`, isolando l'operazione sul singolo certificato.
- Ottimizzato il prompt di Gemini 2.5 Flash rimuovendo le regole complesse di anti-contraffazione digitale e focalizzandolo sull'estrazione accurata delle date per sovrascrivere l'input originario dell'utente.
- Corretto l'aggiornamento nel blocco di errore per applicare lo stato `GIALLO` solo al record del certificato specifico.
- Incrementata la versione globale del portale a v1.03.26.

## [2026-07-09] ingest | Registration Reorganization & Layout Choice (v1.03.26)
- Riorganizzato il wizard di registrazione a 5 passi (maggiorenni) / 6 passi (minorenni) in `portal/registrazione.html` e `portal/registrazione.js` per ridurre il carico cognitivo dell'utente.
- Inserita una domanda preliminare a scelta radio sul tipo di layout (File Unico o Due File) al passo 3.
- Modificata la logica di `updateNavigationUI` e `validateStep` per gestire dinamicamente lo step condizionale del tutore ed evitare errori di navigazione o loop.
- Rimosso il testo fuorviante per i PDF caricati in modalità file singolo.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Document Front/Back UI Clarifications (v1.03.26)
- Riformulate le etichette del caricamento documenti in `portal/registrazione.html`: `FRONTE (O DOC. COMPLETO)` e `RETRO (SE FILE SEPARATO)`, con sottotitolo `⚠️ RICHIESTO FRONTE E RETRO` per chiarire l'obbligatorietà di fornire entrambe le facciate.
- Aggiunta la funzione `updateDocumentoIdentitaHelper()` in `portal/registrazione.js` che mostra messaggi di aiuto contestuali e animati (pulse) in base al tipo di file caricato (PDF o immagini) per guidare l'utente nel completamento del retro se necessario.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Document Front/Back Merging & Compression Release (v1.03.26)
- Rilasciata in produzione la funzionalità di caricamento separato per Fronte e Retro del documento d'identità in `portal/registrazione.html`.
- Integrata la libreria `pdf-lib` via CDN in `portal/registrazione.html` per l'unione universale dei file lato client.
- Implementata la logica di compressione e unione automatica asincrona in `portal/registrazione.js` durante la fase di convalida OTP, con gestione difensiva degli errori (try/catch), controllo di disponibilità di `PDFLib` e feedback visivo all'utente ("ELABORAZIONE DOCUMENTI...").
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Sandbox Canvas CSP Fetch Fix (v1.03.26)
- Sostituito il meccanismo di conversione delle immagini compresse in `portal/dashboard.js` per evitare l'uso di `fetch('data:...')` che viene bloccato dalle politiche CSP del browser. La funzione `compressImageSandbox` restituisce ora un oggetto `Blob` nativo tramite `canvas.toBlob()`, e i byte vengono estratti direttamente offline con il metodo standard `blob.arrayBuffer()`, garantendo compatibilità universale e offline.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Document Sandbox for Merging and Compression (v1.03.26)
- Creata la scheda "SANDBOX DOCUMENTI" (`tab-btn-sandbox` e `panel-sandbox`) nella Dashboard amministrativa (riservata a Presidente e Vice Presidente).
- Implementata la logica di test in `portal/dashboard.js` per testare in tempo reale l'unione e la compressione del fronte e retro dei documenti d'identità tramite la combinazione universale di `pdf-lib` (per unire PDF e immagini) e Canvas (per comprimere immagini riducendo il peso a poche centinaia di KB).
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | CSEN Sync RENEWAL_SUBMITTED Fallback Fix (v1.03.26)
- Aggiunto lo scenario B1.5 in `scripts/csen_sync_active.js` per verificare se un tesserato era già in stato `RENEWAL_SUBMITTED` e il portale CSEN non ha ancora assegnato il nuovo numero (mostrando ancora numero provvisorio `0` o scadenza `null`). Questo impedisce che l'atleta venga erroneamente marcato in stato `ERROR` per "stato non classificabile", mantenendo correttamente lo stato di attesa e aggiornando il log descrittivo.
- Ripristinati manualmente i record di Giorgio Cardinelli, Giulia Lautanio, Giulia Clerici, Niccolò Verre, Alessandro Lori e Giordano Guerrieri a `RENEWAL_SUBMITTED` in Supabase per consentire la corretta ripresa automatica del sync.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Registration Step Crash and Duplicate CF Fixes (v1.03.26)
- Aggiunta barriera di sicurezza al pulsante "AVANTI" (`btnNext`) e sanitizzazione dell'indice di navigazione `currentStep` per impedire l'innalzamento accidentale oltre il passo 4, risolvendo il crash di rendering (schermata nera/vuota) causato da double-click e race condition in `portal/registrazione.js`.
- Esteso il controllo preventivo del codice fiscale in `portal/registrazione.js` affinché verifichi simultaneamente la presenza del CF sia nella tabella `anagrafiche` che nella tabella `utenti` (dove risiedono i profili di registrazioni non completate), intercettando e bloccando tempestivamente i tentativi sdoppiati con diversi indirizzi email.
- Eliminato manualmente l'account incompleto di Umberto Palatroni (`hotmail.it`) liberando il codice fiscale `PLTMRT93H18A462S` per il suo nuovo account (`gmail.com`).
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | CSEN PDF Path Resolution on Vercel and Retroactive Recovery (v1.03.26)
- Risolto il problema di risoluzione dei percorsi per i modelli PDF in `api/otp-verify.js` implementando una strategia di fallback multi-percorso (`process.cwd()`, `__dirname/..`, `__dirname`) per individuare stabilmente la cartella `CSEN_moduli` su Vercel.
- Eseguito localmente lo script `scratch/regenerate_recent_pdfs.js` per rigenerare e caricare i PDF firmati mancanti per Giulia Lautanio e Giorgio Cardinelli, ripristinando la visualizzazione nel loro Dossier.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Medical Certificate Expiration Validation in CSEN Sync (v1.03.26)
- Aggiunto controllo preventivo di validità e scadenza del certificato medico in `scripts/csen_sync_active.js` prima di procedere con Playwright sul portale CSEN. Gli utenti con certificati scaduti o non validati (stato non VERDE) vengono ora saltati e contrassegnati con stato `ERROR` e log descrittivo.
- Aggiornata la query Supabase iniziale nello script per recuperare anche `data_scadenza` e `created_at` dei certificati medici.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | CSEN Provisional Card Number Fix (v1.03.26)
- Risolto il bug per cui le tessere temporanee con numero "0" venivano marcate come `SYNCED` salvando "0" come numero di tessera definitivo. Escluso esplicitamente il valore "0" come numero tessera valido in `analizzaStatoTessera` e `estraiNumeraTesseraDopoOperazione`.
- Formattata la data di richiesta tesseramento come GG/MM/AA nella visualizzazione del pannello di sincronizzazione e nella tabella dei tesserati del portale.
- Ripristinati manualmente i record affetti a `RENEWAL_SUBMITTED` e `numero_tessera_csen = null` in Supabase per permettere il recupero automatico del vero numero tessera non appena disponibile su CSEN.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | CSEN Sync Debug Diagnostics (v1.03.26)
- Modificato `.github/workflows/csen_sync.yml` per caricare gli screenshot e i sorgenti HTML d'errore come Artifact in caso di fallimento del workflow.
- Modificato `scripts/csen_sync_active.js` per scattare uno screenshot (`csen_error_[timestamp].png`) e salvare il codice sorgente della pagina (`csen_page_source.html`) non appena si verifica un errore nel blocco `catch` principale.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] fix | Dossier Certificates Ordering and Format (v1.03.26)
- Modificato il caricamento dei certificati medici all'interno del Dossier Tesserato per ordinare cronologicamente per `created_at` decrescente, assicurando che l'ultimo inserito sia in alto.
- Formattate le date di scadenza all'interno del dossier nel formato italiano GG/MM/AA tramite la funzione helper `formatToItalianDate()`.
- Eliminato manualmente il vecchio record fittizio ("fittizio") del certificato di Valerio Mannocchi dal database.
- Incrementata la versione globale a v1.03.26.

## [2026-07-09] ingest | Document Retention and History Management (v1.03.26)
- Aggiunta la colonna `created_at` alla tabella `certificati_medici` in Supabase per ordinamento temporale.
- Disabilitata l'eliminazione fisica (`.delete()`) dei vecchi certificati e documenti d'identità in `api/otp-verify.js` per garantire la conservazione di 5 anni dello storico.
- Modificati `portal/dashboard.js` e `portal/pagamento.js` per estrarre e utilizzare sempre l'ultimo documento caricato (tramite ordinamento decrescente sul timestamp di inserimento) anziché affidarsi all'indice `[0]` dell'array.
- Corretti gli script di sincronizzazione CSEN `csen_sync_active.js` e `test_runner_csen.js` affinché verifichino lo stato agonistico del tesserato basandosi esclusivamente sul suo ultimo certificato.

## [2026-07-08] ingest | Medical Certificate Expiration Edge-case Fix (v1.03.26)
- Centralizzata la logica di controllo scadenza certificato in `dashboard.js` tramite la funzione helper `isCertificatoScaduto()`.
- Sostituito il confronto di oggetti Date inline che creava falsi positivi nel giorno di scadenza stesso con un confronto di stringhe locale in formato ISO YYYY-MM-DD.
- Aggiornato allo stesso modo il controllo di scadenza in `pagamento.js` per sbloccare l'utente Diego Pigliapoco e prevenire loop di pagamento/scadenza.
- Incrementata la versione globale del portale e del sito a v1.03.26.

## [2026-07-08] ingest | CSEN PDF Compilation & Vercel Bundle Fix (v1.03.26)
- Configurato `vercel.json` per includere esplicitamente la cartella `CSEN_moduli/**` nella build dell'endpoint `/api/otp-verify.js`, risolvendo l'esclusione del modulo dal bundle in produzione.
- Creato ed eseguito con successo lo script `scratch/regenerate_recent_pdfs.js` per rigenerare retroattivamente i PDF CSEN compilati e firmati digitalmente per i 5 utenti registrati di recente affetti dal problema (Niccolò Verre, Diego Pigliapoco, Giordano Guerrieri, Alessandro Lori, Giulia Clerici).
- Incrementata la versione globale a v1.03.26.

## [2026-07-08] fix | Hide sensitive tabs for athlete view context (v1.03.26)
- Rimosso l'accesso alla sezione "Pagamenti e Ricevute" (`tab-btn-user_pagamenti`), al "Registro Istruttori" (`tab-btn-registro_istruttori`) e al "Registro Volontari" (`tab-btn-registro_volontari`) per la vista atleta ("AREA TESSERATO") in `portal/dashboard.js`.
- Aggiunti i relativi ID dei pulsanti dei tab nel metodo `hideAllTabs` per evitare che rimangano visibili quando si cambia contesto di visualizzazione.
- Incrementata la versione globale del portale e del sito a v1.03.26.

## [2026-07-07] fix | Align all website and portal version badges (v1.03.26)
- Allineate tutte le versioni dei file principali del sito (index.html, privacy.html, legal.html) e del portale (dashboard.html, login.html, registrazione.html, pagamento.html, forgot-password.html, reset-password.html e relativi JS) alla versione Vs. 1.03.26.
- Risolto il disallineamento per cui la home e le pagine istituzionali mostravano ancora una versione precedente rispetto al portale.

## [2026-07-07] fix | Support Confirm Signup and Invite tokens for first-time password resets (v1.03.26)
- Estesa la validazione dei token in portal/reset-password.js e nell'intercettore di portal/login.js per includere i tipi invite e signup.
- Questo risolve il problema per cui i nuovi utenti (creati da admin) che richiedevano il reset password per la prima volta ricevevano un'email di 'Confirm Signup' invece di 'Reset Password', finendo reindirizzati al Site URL (login.html) a causa del diverso template email. Ora possono completare l'attivazione impostando direttamente la password.
- Allineate le versioni del portale a Vs. 1.03.26.

## [2026-07-07] fix | Add 60s cooldown to prevent OTP token invalidation on double requests (v1.03.26)
- Modificato portal/forgot-password.js aggiungendo un cooldown di 60 secondi sul bottone di invio dopo una richiesta andata a buon fine. Questo risolve il problema lato UX dove gli utenti, non ricevendo l'email istantaneamente, cliccavano di nuovo su Invia Link, causando l'invalidazione immediata del primo token OTP generato (rendendo la prima email ricevuta inservibile) e il funzionamento esclusivo della seconda.
- Allineate le versioni del portale a Vs. 1.03.26.

## [2026-07-07] fix | Fix Free Event Registration price validation error (v1.03.26)
- Gestito il valore `null` nel prezzo di eventi/corsi in `api/create-event-checkout-session.js`. Se il prezzo dell'evento non è definito o è `null` nel database, viene impostato di default a `0` (evento gratuito), evitando che `parseFloat()` ritorni `NaN` e causi l'errore "Prezzo dell'evento non valido".
- Allineate tutte le versioni del portale a Vs. 1.03.26.

## [2026-07-07] fix | Robust Fallback for Password Recovery Redirect (v1.03.26)
- Aggiunto un intercettore nel DOMContentLoaded di portal/login.js. Qualora Supabase Auth fallisca la validazione del parametro redirectTo e riporti erroneamente l'utente alla schermata di login, il nuovo script intercetta immediatamente i parametri token_hash e type=recovery e reindirizza in modo invisibile e automatico l'utente a reset-password.html.
- Forzato il path assoluto nel template email di Supabase per eliminare le dipendenze dalle configurazioni Site URL di backend, rendendo il recupero 100% fail-safe per ogni dispositivo o connessione.
- Rimossa la variabile duplicata const params introdotta erroneamente in login.js.
- Allineate le versioni del portale a Vs. 1.03.26.


## [2026-07-06] feature | Fix RLS policy on public.atti_adesione to allow board/council members to view all files (v1.03.26)
- Added RLS Select Policy "Consiglio può visualizzare tutti gli atti" on `public.atti_adesione` to grant select privileges to users holding board/council roles (`presidente`, `vice_presidente`, `segretario`, `tesoriere`, `consigliere`).
- Created version-controlled SQL patch `supabase/migration_atti_adesione_rls_patch.sql`.
- Bumped application version to Vs. 1.03.26.

## [2026-07-06] feature | Regenerate Debora De Gaetano CSEN PDFs and rename Dossier Socio to Dossier Tesserato (v1.03.26)
- Wrote and executed a script `scratch/regenerate_debora_pdfs.js` to compile the signed CSEN informative and subscription PDFs for Debora De Gaetano using her profile registration metadata, uploaded them to the Supabase Storage bucket, and linked the signed URLs to her `public.atti_adesione` record.
- Renamed the "Dossier Socio" UI heading, labels, comments, and JavaScript functions (`apriDossierSocio` -> `apriDossierTesserato`) to "Dossier Tesserato" across `portal/dashboard.html` and `portal/dashboard.js`.
- Bumped application version to Vs. 1.03.26.

## [2026-07-06] fix | Deferred OTP token verification to prevent email scanner consumption (v1.03.26)
- Modificato `portal/reset-password.js` per posticipare la chiamata a `verifyOtp` al momento dell'invio del modulo (submit). Questo impedisce agli scanner antivirus avanzati che caricano ed eseguono JavaScript di consumare prematuramente il token OTP monouso al solo caricamento della pagina.
- Allineate tutte le versioni del portale a Vs. 1.03.26.

## [2026-07-06] fix | Cross-device password reset and Email Scanner immunity (v1.03.26)
- Aggiornato `portal/reset-password.js` per supportare il caricamento del `token_hash` direttamente dall'URL al fine di evitare il fallimento della validazione PKCE `code_verifier` su browser/dispositivi diversi da quelli in cui è stata fatta la richiesta.
- Risolto il problema causato dagli scanner di sicurezza delle email e dalle anteprime mobile che consumavano il token monouso inviando richieste GET in background all'API di verifica di Supabase, causando redirect a `login.html`.
- Nota per il gestore: È necessario modificare il template email "Reset Password" sulla Dashboard di Supabase in modo che punti al frontend (es. `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>`) aggirando così l'endpoint GET dell'API.
- Tutte le versioni del portale allineate a Vs. 1.03.26.
## [2026-07-06] fix | Robust password reset redirect build and link expiration feedback (v1.03.26)
- Refactored `portal/forgot-password.js` to build `resetUrl` dynamically and robustly, handling clean paths without `.html` extensions (typical in Vercel production environments) to prevent redirect mismatches that cause Supabase to fallback to the Site URL.
- Added query parameter verification on `portal/login.js` DOMContentLoaded to intercept and display clear error messages when Supabase Auth redirects because of expired or already consumed tokens (`otp_expired`).
- Aligned version badges to Vs. 1.03.26.

## [2026-07-06] fix | Fix password reset authentication check (v1.03.26)
- Refactored `portal/reset-password.js` to support query string codes (`?code=`) and existing sessions alongside hash parameters (`#access_token=`).
- This fixes the bug where users clicking the password recovery link on a mobile device were redirected to the normal login page because the email client or browser used the PKCE flow or established the session prior to DOM content load.
- Aligned version badges to Vs. 1.03.26 across all portal files and `package.json`.

## [2026-07-03] feature | Add debounced auto-save with live status feedback to PDF coordinates tuner (v1.03.26)
- Implemented real-time debounced auto-saving inside `updateFieldCoord` in `portal/dashboard.js`.
- Added a visual save indicator next to the panel title showing "Salvataggio automatico...", "Coordinate Salvate ✓", or "Errore di salvataggio ❌".
- Bumped application version to Vs. 1.03.26.

## [2026-07-03] feature | Relocate informative PDF details to page 4 and duplicate signature on all pages (v1.03.26)
- Moved default target page for `nome_cognome`, `codice_fiscale`, and `nascita` from page 1 to page 4 (index 3) on the "Informativa Singoli Tesserati" PDF in both database schema and code files.
- Refactored `api/otp-verify.js` and `portal/dashboard.js` to draw the personal details dynamically on page 4 (target index 3) and replicate the digital signature stamp on every single page of the document.
- Bumped application version to Vs. 1.03.26.

## [2026-07-03] fix | Enforce explicit block styling and 950px height on PDF iframe (v1.03.26)
- Removed `flex` wrapping from the PDF preview container to prevent browsers from squishing the iframe height.
- Styled the iframe with explicit `display: block; height: 950px; min-height: 950px;` to ensure full height page visualization.
- Bumped application version to Vs. 1.03.26.

## [2026-07-03] fix | Enlarge PDF tuner iframe and disable native toolbar margins (v1.03.26)
- Increased PDF tuner preview iframe height from 580px to 850px in `portal/dashboard.html` for better visibility.
- Appended PDF viewer options hash (`#toolbar=0&navpanes=0&scrollbar=1&view=FitH`) to the Blob URL in `portal/dashboard.js` to strip native margins and maximize page width rendering.
- Bumped application version to Vs. 1.03.26.

## [2026-07-03] fix | Adjust CSP for Blob PDF rendering and add iframe debugging (v1.03.26)
- Modified `vercel.json` Content-Security-Policy header to allow `blob:` and `data:` schemes in `frame-src` directive, allowing the PDF Blob preview in the dashboard iframe.
- Added structured try/catch logic to both `getPdfBuffer` and `aggiornaAnteprimaPdf` in `portal/dashboard.js`, printing clear error alerts inside the iframe if resource fetching or compilation fails.
- Bumped version string to Vs. 1.03.26.

## [2026-07-03] feature | Live PDF Tuner & Configurable PDF Coordinates (v1.03.26)
- Implemented `public.configurazioni_pdf` table in database to dynamically store coordinate values for PDF template text drawing.
- Updated `api/otp-verify.js` to load coordinates from the database and compile PDFs dynamically based on these settings.
- Formatted `data_nascita` and translated text values to uppercase for correct rendering.
- Created interactive **Taratura Moduli PDF** panel in the President's Dashboard displaying inputs for X, Y, and Size alongside a live-updating iframe preview of the compiled PDF.
- Integrated `pdf-lib` script directly on the frontend for instant browser-side compilation.
- Aligned version badges to Vs. 1.03.26 across all application files.

## [2026-07-04] fix | Fix CSEN Sync Pipeline and Add Monitoring System (v1.03.26)
- **Bug critico risolto**: La stored procedure `approva_tesserato` era stata ripristinata a una versione precedente (bloccante per webhook/service role) da un file di migrazione SQL aggiornato. Risolto definitivamente.
- **Bug CSEN Sync risolto**: `csen_sync_active.js` processava ogni notte i 60 record in stato `PENDING` anche se avevano già il numero tessera CSEN assegnato (causando re-elaborazioni inutili e timeout). Aggiunta logica di skip per i record con `numero_tessera_csen` già valorizzato, e correzione automatica dei record legacy (PENDING+numero_tessera → SYNCED).
- **Sistema di allerta email**: Aggiunta funzione `sendAlertEmail` in `csen_sync_active.js` e `csen_reconciliation.js`. In caso di errori fatali (credenziali mancanti, login fallito, errore database, timeout) viene inviata una email di alert al presidente.
- **Nuovo endpoint API**: Creato `api/csen-status.js` per esporre lo stato del sync CSEN (contatori per stato, lista atleti in attesa, errori) alla dashboard del direttivo.
- **Pannello CSEN Status in Dashboard**: Aggiunto pannello visuale nel tab Registro Tesserati con contatori SYNCED/DA SYNC/ERRORI e tabelle dettagliate. Pulsante "Aggiorna" per refresh on demand.
- **Workflow GitHub Actions migliorato**: `csen_sync.yml` usa `if: always()` per eseguire riconciliazione e scraper anche se il sync attivo fallisce. Aggiunto `RESEND_API_KEY` e `CAPTCHA_API_KEY` come secrets.
- Versione allineata a **Vs. 1.03.26** su tutti i file del portale.


## [2026-07-03] fix | Fix Stored Procedure Overwrite and Activate Loris Benedetti (v1.03.26)
- Corretto il file `supabase/migration_patch_approva_tesserato.sql` per integrare stabilmente la logica di bypass dei controlli di sicurezza `auth.uid()` (necessaria per consentire le chiamate dal server tramite Stripe Webhook) e il corretto allineamento per lo stato `IN_ATTESA_PAGAMENTO`.
- Applicato l'aggiornamento SQL direttamente al database Supabase ed eseguito manualmente l'attivazione (`approva_tesserato`) per Loris Benedetti, inserendolo regolarmente nel Libro Tesserati come attivo.
- Incrementata la versione globale dell'applicazione a Vs. 1.03.26.


## [2026-07-03] feature | Custom Causale for Tesseramenti (v1.03.26)
- Changed payment description/causale for users under tesseramento/tesserato_esterno from "Quota associativa annuale - tesserato" to "Quota tesseramento annuale - [ livello_copertura ]" (e.g. "Quota tesseramento annuale - INTEGRATIVA B").
- Applied custom causale dynamically in both api/create-checkout-session.js and portal/dashboard.js.
- Aligned version badges to Vs. 1.03.26 across index.html, legal.html, privacy.html, dashboard.html, and other portal pages.

## [2026-07-03] feature | Registri visibility, Logiche context and Foto Profilo block (v1.03.26)
- Enabled "Registro Istruttori" and "Registro Tesserati" in Member context (Area Socio) while keeping them hidden from Athlete context (Tesserati).
- Made "Logiche di Sistema" tab visible to the entire Board (Direttivo) rather than just President/VP.
- Disabled "Foto Profilo" file uploads with an amber alert notice "SERVIZIO NON ANCORA ATTIVO" to avoid cluttering database.
- Aligned version badges to Vs. 1.03.26 across index.html, legal.html, privacy.html, dashboard.html, and other portal pages.

## [2026-07-02] fix | Spostamento Logiche, Rimozione Quota Ann. e Bypass Presidente (v1.03.26)
- Rimossa la colonna "Quota Ann." dalla tabella e dai cicli di rendering dei corsi sia in dashboard.html che in dashboard.js per semplificare la vista.
- Risolto il problema del clic inerte sul tab "Logiche di Sistema" aggiungendo l'event listener DOM mancante e spostando il pulsante a fondo barra di navigazione (dopo i bilanci).
- Risolto il bug di lettura dell'anagrafica (struttura array di Supabase) sul controllo tesserati e introdotto il bypass per i membri del direttivo (Presidente, VP, Segretario, Tesoriere) consentendo loro l'iscrizione a corsi ed eventi anche in assenza di tesseramento attivo.
- Aligned version badges to Vs. 1.03.26 across index.html, dashboard.html, login.html, pagamento.html, and registrazione.html.

## [2026-07-02] feature | System Logics Dashboard & Course Expiry Controls (v1.03.26)
- Implemented "Logiche" tab section in President/VP dashboard rendering Mermaid system diagrams of Member (Socio) vs Cardholder (Tesserato) workflows.
- Removed redundant "Tessera" status column from instructor courses view.
- Implemented manual and automated "Scadenza Corso" (Course Expiry) controls in database (`public.iscrizioni_eventi`), frontend checkout flows (supporting calendar start date selector), and Stripe webhook.
- Added visual hand indicator `✋` for manual overrides of course expiration dates by instructors.
- Aligned version badges to Vs. 1.03.26 across index.html, dashboard.html, login.html, pagamento.html, and registrazione.html.

## [2026-07-01] feature | Add csen scraper to nightly workflow (v1.03.26)
- Added `scripts/scraper_csen.js` execution to the scheduled nightly GitHub Actions workflow `.github/workflows/csen_sync.yml` to automatically refresh the remaining card credits database.
- Aligned version badges to Vs. 1.03.26 across index.html, dashboard.html, login.html, pagamento.html, and registrazione.html.

## [2026-07-01] feature | Add reconciliation script to nightly workflow (v1.03.26)
- Added `scripts/csen_reconciliation.js` execution to the scheduled GitHub Actions nightly workflow `.github/workflows/csen_sync.yml`.
- Aligned version badges to Vs. 1.03.26 across index.html, dashboard.html, login.html, pagamento.html, and registrazione.html.

## [2026-07-01] feature | Ordinamento di default Quote e Cassa (v1.03.26)
- Set default sort order for "Quote e Cassa" table to sort by Receipt Number descending (highest receipt number first).

## [2026-07-01] feature | Ordinamento di default Contabilità (v1.03.26)
- Set default sort order for Prima Nota/Contabilità to be by Receipt Details (dettagli) descending (highest receipt number first).

## [2026-07-01] feature | Ordinamento colonna Dettagli Ricevuta (v1.03.26)
- Made the "Dettagli Ricevuta/Audit" column sortable in Prima Nota.
- Configured sorting by parsed numerical receipt number (from lowest to highest and vice versa).

## [2026-07-01] fix | Layout contabilità (v1.03.26)
- Fixed missing closing `</div>` in panel-contabilita header causing layout breaking.

## [2026-07-01] fix | UI e formattazione PDF Ricevute (v1.03.26)
- Fixed CSEN badge correctly handling '0' as invalid code.
- Fixed correct bucket names in Dossier Socio (documenti_identita and documenti_adesione).
- Fixed styling for the medical certificate button in Dossier Socio.
- Updated receipt PDF template with the official association details and logo.

## [2026-07-01] feature | Stampa Ricevute e Dossier Socio (v1.03.26)
- Added clickable receipt numbers in `Prima Nota` to view and print single receipts using a dynamically generated HTML template.
- Added `ESPORTA RICEVUTE` modal for bulk exporting receipts by Date or Number.
- Added `Dossier Socio` modal in `Registro Tesserati` to view identity documents, medical certificates, signed forms, and individual receipts for a specific user.
- Bumped version to 1.03.26.

## [2026-07-01] feature | Visual Indicators for CSEN Sync Status (v1.03.26)
- Added color-coded feedback to the "Tessera CSEN" column in the dashboard (both desktop and mobile views).
- Green: Code is present. Yellow: `sync_csen_status` is 'SYNCED' (in waiting). Red: Code is missing and not synced.
- Version bumped to 1.03.26.

## [2026-06-30] feature | Integrated 2Captcha Solver for CSEN Sync (v1.03.26)
- Integrated 2Captcha API to solve the Agenzia delle Entrate CAPTCHA dynamically in `csen_sync_active.js` and `test_runner_csen.js`.
- Fixed the HTML parser regex in `csen_reconciliation.js` to correctly match alphanumeric CSEN membership numbers (e.g., `26B3268874`).
- Updated the `.env` configuration file to support the `CAPTCHA_API_KEY` parameter.
- Corrected the birthplace drop-down selector mapping logic to dynamically resolve case-insensitive option values.

## [2026-06-30] feature | CSEN Active Sync (v1.03.26)
- Added `sync_csen_status` and `sync_csen_log` columns to `registro_tesserati` in Supabase.
- Modified `approva_tesserato` RPC to stop generating fake CSEN codes and set sync status to PENDING.
- Created `scripts/csen_sync_active.js` (Playwright) to perform headless authentication and auto-fill athlete data on the CSEN portal.
- Implemented a JS bypass to overcome the CSEN Captcha requirement on the client-side.
- Created GitHub Workflow (`.github/workflows/csen_sync.yml`) and Vercel API endpoint (`api/trigger-csen-sync.js`) for on-demand execution.
- Added "Sincronizza CSEN" button and pending counter in `portal/dashboard.html`.

## [2026-06-30] fix | Persist Switcher View Context and Default Sort Members Registry (v1.03.26)
- Implementata la persistenza del contesto della vista nel selettore di ruolo del portale (`currentViewContext` salvato in `localStorage`), in modo che aggiornando la pagina (F5) l'utente non venga riportato alla vista Tesserato ma rimanga in quella attiva (es. Direttivo).
- Modificato l'ordinamento predefinito del Registro Tesserati in modalità decrescente (`direction: 'desc'` su `id_tesserato`), in modo da mostrare per primi gli ultimi tesserati inseriti.

## [2026-06-30] fix | Fix Stored Procedure Permissions and Improve Payment UX (v1.03.26)
- Risolto un problema di autorizzazione e corrispondenza dello stato nella stored procedure `public.approva_tesserato` che ne impediva l'esecuzione automatica da parte dello Stripe webhook (poiché la transazione del webhook non ha una sessione client `auth.uid()` attiva, e lo stato nel database era già passato a `IN_ATTESA_PAGAMENTO`).
- Aggiornato manualmente il profilo di Andrea Alessandrini sul database pubblico portandolo in stato `APPROVATO` nel registro approvazioni e attivando correttamente la sua iscrizione in `registro_tesserati`.
- Semplificato il testo della schermata di login per i pagamenti in `portal/pagamento.html` e `portal/pagamento.js` rimuovendo diciture allarmanti come "errore caricamento" e "sessione scaduta".
- Incrementata versione a Vs. 1.03.26.


## [2026-06-30] fix | Use Absolute Paths for Payment Login Links (v1.03.26)
- Modificato il file `portal/pagamento.html` per utilizzare percorsi assoluti (`/portal/...`) per il link di login e la query di reindirizzamento. Questo risolve possibili problemi di risoluzione relativi dei percorsi all'interno delle Webview dei dispositivi mobili (es. client email come Gmail, Mail iOS, ecc.) che impedivano il corretto caricamento della schermata di login.
- Incrementata versione a Vs. 1.03.26.


## [2026-06-30] fix | Add Login Redirect Parameter for Payments (v1.03.26)
- Aggiunto il parametro di query `redirect` al link di login in `portal/pagamento.html` e implementato il relativo reindirizzamento in `portal/login.js`. Questo permette agli utenti non autenticati che cliccano sul link di pagamento via email di effettuare il login e poi essere rimandati automaticamente e direttamente alla schermata di checkout.
- Incrementata versione a Vs. 1.03.26.


## [2026-06-30] fix | Fix Validate Cert Imports and Add Dashboard Reject Button (v1.03.26)
- Ripristinati gli import di `createClient` e `GoogleGenAI` rimossi erroneamente in `api/validate-cert.js`, risolvendo l'errore 500 durante la validazione manuale/AI.
- Aggiunto il bottone "RIFIUTA CERT." all'interno della tabella "Tesserati in Attesa di Attivazione" in `portal/dashboard.js`, permettendo al Presidente di respingere direttamente i certificati medici non validi.
- Incrementata versione a Vs. 1.03.26.


## [2026-06-30] ingest | Flusso Email e Nuova Dashboard Pagamenti (v1.03.26)
- Implementato flusso a 3 step per le email di tesseramento e verifica certificati medici.
- Spostato il link di pagamento dall'email di prima registrazione a una mail dedicata inviata solo a validazione avvenuta.
- Creato trigger nel DB Supabase per aggiornare lo stato di `registro_approvazioni` a `IN_ATTESA_PAGAMENTO` al superamento dei controlli.
- Modificato Stripe webhook per attivare automaticamente il tesseramento/iscrizione al saldo della quota.
- Aggiunta sezione "Tesserati e Soci in attesa di pagamento" tra i tesserati pendenti e le registrazioni incomplete nella dashboard.
- Risolto e corretto disallineamento della stored procedure `salva_verbale_relazionale` ripristinando la firma a 18 parametri sicura.
- Incrementata versione del portale a Vs. 1.03.26.


## [2026-06-30] feature | Add Password Requirements Label to Registration (v1.03.26)
- Added visual helper text under the password field in `portal/registrazione.html` detailing requirements: minimum 8 characters, one uppercase, one lowercase, and one number.


## [2026-06-30] fix | Refine Security Alert Interception on Client Side (v1.03.26)
- Updated `window.alert` override in `portal/registrazione.js` and `portal/dashboard.js` to only intercept technical/database related keywords (e.g., supabase, postgres, exception, database) instead of the common word "errore", resolving a bad UX where password requirements or validation errors were masked as general system errors.


## [2026-06-30] fix | Authorize Document Buckets and Fix Manual Certificate Approval (v1.03.26)
- Authorized `documenti_identita`, `documenti_tutori`, and `documenti_adesione` buckets in `openSignedFile` dashboard function to resolve permission alert.
- Updated `renderApprovazioniTables` in `dashboard.js` to allow the President to manually approve certificates in all states that are not yet green (e.g. `IN_ATTESA` or `ROSSO`), preventing bottlenecks.

## [2026-06-30] fix | Correct OTP Expiration Text (v1.03.26)
- Updated the OTP email template text in `api/otp.js` to state "15 minuti" instead of "5 minuti", aligning it with the actual system expiration.
- Updated local `.env` with the new Resend API key and fixed API error handling for Resend to prevent silent failures.

## [2026-06-29] feature | ID Document and CSEN PDFs (v1.03.26)
- Added ID Document upload logic to registration step 1 (mandatory).
- Created `documenti_identita` table and secured storage bucket.
- Integrated `pdf-lib` in `api/otp-verify.js` to automatically fill and sign official CSEN PDF forms upon OTP validation.
- Attached signed CSEN PDFs to the user's confirmation email.
- Updated dashboard approvals list to allow Board members to view the ID document and the signed CSEN forms.

## [2026-06-29] fix | Eventi Columns Database Sync (v1.03.26)
- Eseguita migrazione DDL su Supabase per inserire le colonne mancanti `giornate` (jsonb), `link_sito` (text) e `contatti` (text) nella tabella `eventi`.
- Questo risolve l'errore "Could not find the 'contatti' column of 'eventi' in the schema cache" in fase di inserimento e aggiornamento degli eventi.
- Allineato il numero di versione a `1.03.26` su `dashboard.html`.

## [2026-06-29] fix | Redesign version styling, event titles, and cookie banner logic (v1.03.26)
- Allineato il badge della versione nella testata della home page allo stile degli altri badge del portale (testo bianco/70, bordo bianco/20, sfondo bianco/5).
- Risolto l'errore del titolo "undefined" negli eventi in Homepage, mappando la colonna corretta `titolo` (e mantenendo fallback intelligenti).
- Reso effettivo il banner dei cookie: ora imposta un cookie reale `cookie-consent-choice` ed elimina preventivamente tutti i cookie non essenziali (marketing/analytics) se l'utente sceglie "Solo Necessari".

## [2026-06-29] fix | Homepage events, registration CSP & GDPR compliance (v1.03.26)
- Risolto l'errore di caricamento dei comuni nella registrazione: scaricato il dataset `comuni.json` in locale per rispettare la Content Security Policy ed evitare blocchi della rete.
- Corretto l'endpoint `/api/events` per utilizzare la chiave corretta `SUPABASE_SERVICE_ROLE_KEY` e abilitato il supporto CORS.
- Aggiunto il badge della versione anche nel footer della Home per garantirne la massima visibilità in ogni scenario di caching.
- Create le pagine `privacy.html` e `legal.html` precompilate con i dati legali corretti dell'Associazione (CSEN, CF/P.IVA, ecc.).
- Implementato un banner conforme per la gestione del consenso dei Cookie sulla Homepage, con persistenza in LocalStorage.

## [2026-06-29] feat | Redesign Home Page (v1.03.26)
- Ottimizzata l'esperienza utente nella landing page `index.html` portando l'Accesso e Registrazione in evidenza nella Hero Section per migliorare la fruibilità da mobile.
- Rivista la sezione Discipline (Palestra/Functional Training, Strongman, Allenamento Ibrido, SCAB) con stili premium ispirati alle eccellenze del settore.
- Aggiunta la sezione Eventi imminenti prima dei contatti, con fetch dinamico degli eventi via API pubblica (`/api/events`).
- Spostata e ridisegnata la sezione Contatti a fondo pagina per renderla più elegante.
- Aggiunto un semplice endpoint serverless `/api/events` per esporre gli eventi correnti dalla tabella `eventi`.

## [2026-06-29] feat | UI/UX Redesign Landing & Mobile Portal (v1.03.26)
- Riprogettata la landing page (`index.html`) per desktop: introdotta la Hero a due colonne con pannello grafico, spostate le discipline su griglia a 4 colonne, e allineato l'About su 2 colonne.
- Ottimizzato il portale mobile (`portal/dashboard.html`): introdotta veste grafica glassmorphism per widget statistiche, card tesserati, e form di input.
- Perfezionata la barra di navigazione mobile (`mobile-bottom-nav`) con indicatore animato della tab attiva (linea colorata) e sfocatura dello sfondo.
- Ricompilato `output.css` con Tailwind v4.

## [2026-06-29] feat | Responsabili Dinamici (v1.03.26)
- Sostituito il dropdown a selezione multipla `<select multiple>` con un sistema a righe dinamiche (simile alle giornate dell'evento).
- Consente l'aggiunta di molteplici responsabili in modo intuitivo tramite pulsante "+ AGGIUNGI RESPONSABILE" e comodi singoli dropdown, eliminando la necessità di premere CTRL.
- Mantenuto l'autocompilamento in tempo reale del box "Contatti" all'aggiunta o variazione dei singoli responsabili.
- Bumped application version to `1.03.26`.

## [2026-06-29] fix | Responsabili Load and Save Fixes (v1.03.26)
- Corretto il recupero dei soci nel dropdown multi-selezione responsabili: modificato il recupero del numero telefonico (colonna `cellulare` anziché `telefono` non esistente nella tabella `utenti`) e allineati i filtri al ruolo `socio_approvato` anziché `tipo_adesione`.
- Corretto il salvataggio dei responsabili associati all'evento: mappato `utente_id` anziché `socio_id` nella chiamata insert a `responsabili_eventi`.

## [2026-06-28] feat | Corsi & Eventi Redesign (v1.03.26)
- Rinominata la voce del menu da "GESTIONE CORSI" a "CORSI & EVENTI".
- Supporto per giornate multiple negli eventi: rimosso il singolo input data/ora e inserita gestione ad array JSON in `dashboard.js`. Modificato schema DB consigliato con nuova colonna `giornate` di tipo JSONB in `eventi`.
- Aggiunta colonna `link_sito` per gli eventi.
- Integrata selezione "Responsabili" in fase di creazione dell'evento (prima andava assegnata dopo la creazione). Autosalvataggio su tabella relazionale `responsabili_eventi`.
- Aggiunta colonna e campo testo `contatti` (Telefono/Email) con autocompilazione JS in tempo reale quando si seleziona uno o più soci responsabili.
- Aggiornata tabella `renderCorsiTable` per mostrare le nuove date multiple.

## [2026-06-28] feat | Mobile UX Redesign (v1.03.26)
- Complete mobile responsive redesign of the dashboard portal.
- Added bottom navigation bar with 5 tabs (Home, Profilo, Certificato, Corsi, Pagamenti) for athlete users.
- Added hamburger menu overlay for board members to access all panels on mobile.
- Hidden desktop sidebar on mobile, content takes full width.
- Converted tesserati table to touch-friendly card view on mobile screens.
- Full-screen modals on mobile for better interaction.
- Enlarged form inputs to 48px, font sizes to readable levels, 44px minimum touch targets.
- Compact header hiding version badge on mobile.
- Pure CSS-only approach using `@media (max-width: 1023px)` — desktop layout completely untouched.
- Consulted Stitch for UI/UX design system reference.
- Files modified: `dashboard.html`, `dashboard.js`, `output.css`, version files.

## [2026-06-28] fix | Eventi e Responsabili (v1.03.26)
- Risolto errore 'not-null constraint' in fase di creazione di un nuovo evento su `data_evento` aggiungendo i campi mancanti Data/Ora nella UI `dashboard.html`.
- Creata la tabella `responsabili_eventi` in Supabase per assegnare i soci come responsabili degli eventi.
- Modificato `dashboard.js` per gestire l'assegnazione dei responsabili e visualizzarli in tabella qualora si scelga la sub-tab 'Eventi In Programma'.
- Bumped application version to `1.03.26`.

## [2026-06-28] fix | Stripe checkout automatic_payment_methods error (v1.03.26)
- Removed `automatic_payment_methods` parameter from `checkout.sessions.create` which was throwing a Stripe validation error (unknown parameter).
- Enabled automatic payment methods natively by omitting `payment_method_types` entirely per Stripe documentation.
- Bumped application version to `1.03.26` across config files and HTML headers.

## [2026-06-28] ingest | Stripe Multi-Method & Management Fee (v1.03.26)
- Configured dynamic payment methods (`automatic_payment_methods`) to support Klarna (BNPL), PayPal, and SEPA.
- Added automatic 2% administrative/management fee calculation and line item to all Stripe Checkout API sessions.
- Bumped application version to `1.03.26` across config files and HTML headers.

## [2026-06-28] fix | Apple Touch Icons, CSP allowed domains, and Local CSS Compilation (v1.03.26)
- Added Apple Touch Icons (`apple-touch-icon`) and high-res shortcut icons for clean home screen shortcut branding.
- Allowed `lh3.googleusercontent.com` in `vercel.json` Content-Security-Policy `img-src` to fix broken images in production.
- Stripped Tailwind CDN scripts from `index.html` via `remove_tailwind.js` and linked it directly to local `./output.css` to respect strict production CSP.
- Compiled and minified local styles to `./output.css` using Tailwind CLI.
- Bumped application version to `1.03.26` across config files and HTML headers.

## [2026-06-28] feat | Mobile Speed & Usability Optimization (v1.03.26)
- Replaced main landing page `index.html` with a fully responsive, simplified, and high-performance design.
- Built via Stitch mockups, focusing on quick mobile loading, vertical swipe layout for disciplines, and touch-optimized bottom navigation.
- Bumped application version to `1.03.26` across config files and HTML headers.

## [2026-06-28] update | Adjust Silver and Gold License Tariffs (v1.03.26)
- Adjusted Base Silver license fee to €14.00 and Base Gold license fee to €18.00 in database.
- Updated hardcoded visual labels to match adjusted tariffs in `portal/registrazione.html`.
- Unified application versioning settings across all files to version `1.03.26`.
- Bumped application version to `1.03.26`.

## [2026-06-28] update | Update Membership and Card Tariffs (v1.03.26)
- Updated membership fee `quota_socio` to €50.00 and sports license fees (Base Silver €15, Base Gold €19, Integrativa B €30) in database.
- Updated hardcoded visual labels to match new tariffs in `portal/registrazione.html`.
- Unified application versioning settings across all files to version `1.03.26`.
- Bumped application version to `1.03.26`.

## [2026-06-28] ingest | Search Bar in Registro Tesserati
- Implemented real-time search bar (Proposta 1: Minimalist Brutalist Inline Bar) in the "Registro Tesserati" panel.
- Added live client-side filtering logic for names, tax codes, registry numbers, and CSEN card numbers in `portal/dashboard.js`.
- Added interactive result count updates.
- Modified files: `portal/dashboard.html` and `portal/dashboard.js`.

## [2026-06-26] security | Security Hardening v3 — Short-term fixes (v1.03.26)
- Exported missing SQL schemas and database function definitions (`check_rate_limit()`, `prossimo_numero_ricevuta()`, and 12 custom tables) from production DB into repository (`supabase/schema_exported.sql`).
- Resolved `SELECT *` security violations in `api/otp-verify.js` (utenti table) and `api/create-event-checkout-session.js` (eventi table) by specifying exact columns.
- Added rate limiting validation using `check_rate_limit()` RPC check inside the Deno Supabase Edge Function for OTP.
- Implemented RLS UPDATE and DELETE policies for the four board meeting tables (`riunioni_consiglio`, `presenze_riunione`, `punti_odg`, `votazioni_odg`) restricting modifications to board members.
- Configured weekly Dependabot updates (`.github/dependabot.yml`) for the npm package ecosystem.
- Created Semgrep SAST workflow (`.github/workflows/semgrep.yml`) running static scans on pushes to main, pull requests, and a weekly cron.
- Extracted inline JavaScript from `forgot-password.html`, `login.html`, and `reset-password.html` to separate external `.js` files, eliminating inline click/submit handlers.
- Bumped application version to `1.03.26` across all configuration files and HTML headers.

## [2026-06-26] security | Security Hardening v3 — Immediate priority fixes (v1.03.26)
- Dropped 2 unsafe overloads of `salva_verbale_relazionale()` (17-param and 18-param versions without auth checks) from production DB.
- Removed tracked utility scripts (`check.js`, `check_users.cjs`, `check_users.js`) from git and updated `.gitignore` to exclude `*.cjs`, utility scripts, and ENV files.
- Added `Content-Security-Policy-Report-Only` header to `vercel.json` to map legitimate sources before enforcing CSP.
- Created migration file `migration_drop_unsafe_overloads.sql` for version control.
- Verified RLS policies in production: all role-based policies already use `&&` array overlap operator (fixed in prior migration).
- Bumped version to `1.03.26`.

## [2026-06-25] fix | Merge duplicate Tito Fabio Paoletti accounts and set correct Codice Fiscale (v1.03.26)
- Merged the duplicate athlete (\`titofabiopaoletti@gmail.com\`) and president (\`nexglg@gmail.com\`) profiles in the database.
- Transferred the correct tesseramento (\`T_001_2026\` / \`INTEGRATIVA_B\`) and medical certificate of the athlete to the president's \`anagrafiche\` record.
- Deleted duplicate records, updated the president's Codice Fiscale to \`PLTTFB77B11H769H\` and birth date to \`1977-02-11\`, and deleted the redundant athlete auth account.
- Verified automatic syncing to the \`utenti\` table via the \`sync_anagrafica_to_utente\` trigger.
- Bumped application version to \`1.03.26\`.

## [2026-06-25] fix | Sync 'utenti' table with 'anagrafiche' and set up bidirectional database triggers (v1.03.26)
- Aligned existing web profiles (\`utenti\` table) with the corrected personal details (such as \`data_nascita\`) in \`anagrafiche\` to resolve the mismatch in Valerio Mannocchi's personal dashboard details.
- Created \`sync_anagrafica_to_utente\` and \`sync_utente_to_anagrafica\` PostgreSQL triggers and functions to automatically synchronize profile data (names, dates, emails, contacts, and residence addresses) bidirectionally between the tables.
- Saved SQL definitions in \`supabase/migration_sync_triggers.sql\`.
- Bumped application version to \`1.03.26\`.

## [2026-06-25] fix | Correct SRI Integrity Hashes & Bump (v1.03.26)
- Corrected the SRI (Subresource Integrity) hashes for `ScrollTrigger.min.js` and `lenis.min.js` in `index.html` which were preventing the landing page from loading completely.
- Bumped application version to `1.03.26` across all configuration files and HTML headers.

## [2026-06-25] security | Security Hardening v2 — Post-Verifica (v1.03.26)
- Verifica post-implementazione del piano di sicurezza originale: analizzati tutti i 10 file API, 7 file frontend, 13 file SQL/DB, 1 Edge Function.
- **4 vulnerabilità CRITICHE** scoperte e risolte:
  - `salva_verbale_relazionale()`: aggiunto auth check (era senza NESSUN controllo)
  - `elimina_utente_fantasma()`: corretto bug tipo scalare/array nella verifica ruoli
  - `otp.js`: sanitizzati 3 messaggi errore che esponevano dettagli interni
  - `dashboard.html`: corrette 4 vulnerabilità XSS (err.message in innerHTML)
- **4 vulnerabilità ALTE** risolte: checkout API tech names, login.html interceptor, validate-cert medical log, otp-verify URL validation.
- **6 vulnerabilità MEDIE** risolte: stripe-webhook sanitizzazione, RLS verbali tipo array, next_registro_number auth, cron-scadenze env validation, versione allineata, SRI su CDN.
- Creata migrazione `supabase/migration_security_hardening_v2.sql` (4 fix DB).
- Versione aggiornata a `1.03.26` su tutti i file (16 file modificati totali).

## [2026-06-23] fix | Policy Recursion Fix (v1.03.26)
- Creata ed applicata la migrazione `supabase/migration_patch_istruttori_v3.sql` per risolvere un problema di ricorsione infinita (errore 500 / 42P17) sulle policy RLS di `utenti` e `iscrizioni_eventi`.
- Sostituite sistematicamente le query dirette a `public.utenti` con la chiamata alla funzione `security definer` `public.get_user_role(auth.uid())` per le tabelle eventi, iscrizioni, istruttori e presenze.
- Allineato il numero di versione a `1.03.26` su `login.html` e `dashboard.html`.
- Bumped application version to `1.03.26`.

## [2026-06-23] fix | Patch Istruttori v2 (v1.03.26)
- Creata ed applicata la migrazione `supabase/migration_patch_istruttori_v2.sql` per aggiornare le policy RLS su `utenti`, `anagrafiche`, `registro_soci`, `registro_tesserati`, `certificati_medici` e `iscrizioni_eventi`.
- Risolti 13 bug e gap funzionali dell'area istruttori/corsi (BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07, GAP-01, GAP-03, RLS-01, RLS-03).
- Aggiunto toggle "Orario Libero" nell'area atleta per consentire agli atleti di dichiarare lo svolgimento del programma fuori orario.
- Disabilitato il pulsante di salvataggio presenze per prevenire doppi click.
- Ottimizzate le query con filtri server-side e rimosse ambiguità sulle FK dello storico presenze.
- Bumped application version to `1.03.26`.

## [2026-06-23] ingest | Istruttori Corsi e Presenze (v1.03.26)
- Creata la migrazione `supabase/migration_istruttori_corsi.sql` e configurato il database (tabelle `istruttori_eventi`, `presenze_eventi`, RLS, e view `vw_stato_atleta_corso`).
- Aggiunta interfaccia CRUD Gestione Corsi nel pannello Direttivo (Presidente/Vice Presidente) con orari e piani JSONB.
- Aggiunta interfaccia Assegnazione Istruttori ai Corsi con calcolo automatico dei differenziali nel pannello Direttivo.
- Sviluppata l'Area Istruttore con elenco dei corsi assegnati, visualizzazione presenze, widget storico lezioni, e warning visivi per certificati scaduti.
- Aggiornata la documentazione wiki (`database_schema.md`, `portal_dashboard.md`).
- Bumped application version to `1.03.26`.

## [2026-06-23] fix | Align birth dates and sexes to Codice Fiscale (v1.03.26)
- Created and executed a database update script to decode Italian Codice Fiscale values for all members.
- Aligned birth dates and gender fields in the `anagrafiche` table with their official Codice Fiscale data (fixing errors for Valerio Mannocchi, Manuel La Commare, Tito Fabio Paoletti, and Michelle Scibelli).
- Bumped application version to `1.03.26`.

## [2026-06-20] fix | CSEN Scraper Manual Trigger & Vercel API (v1.03.26)
- Modified `portal/dashboard.html` to make "Tessere residue" widget clickable, triggering manual CSEN scraping.
- Created Vercel serverless function `api/trigger-csen.js` to securely trigger the GitHub Actions workflow via API.
- Removed cron schedule from `.github/workflows/csen.yml` to rely solely on manual triggers.
- Bumped application version to `1.03.26`.


- Created Playwright scraper script `scripts/scraper_csen.js` to automate reading residual membership cards from the CSEN portal.
- Configured GitHub Actions workflow `.github/workflows/csen.yml` to run the scraper on a schedule and manually.
- Integrated tessere status display widget into `portal/dashboard.html` with real-time Supabase integration.
- Created `csen_status` database table in Supabase.
- Bumped application version to `1.03.26`.

## [2026-06-20] fix | Fix Board Members display, Soci & Tesserati numbering, and Medical Certificate dates (v1.03.26)
- Added `select_consiglio_utenti` and `update_admin_utenti` RLS policies to the `utenti` table on Supabase, resolving the issue where the "Gestione consiglio direttivo" list was empty for the logged-in administrator.
- Corrected the progressive numbers and status of the 7 board members/soci in `registro_soci` to format `S_XX_2026` and set their status as approved (`data_delibera_direttivo` set to '2026-01-01').
- Fixed the sequential numbers of tesserati in `registro_tesserati` to format `T_XXX_2026` using their CSV row sequence.
- Accurately parsed and updated all medical certificate release dates (`data_rilascio` and `data_scadenza`) in the `certificati_medici` table using the values directly from the CSV file.
- Bumped application version to `1.03.26`.

## [2026-06-24] feat | Add Course Cancellation and Renewal Buttons (v1.03.26)
- Added "Cancellati" and "Rinnova" buttons to user's active course cards in `portal/dashboard.html`.
- Defined a new RLS policy `delete_own_iscrizioni` on `public.iscrizioni_eventi` to allow users to delete their own registrations when canceling.
- Updated `/api/create-event-checkout-session` to accept a `renew` flag and bypass existing enrollment checks when renewing.
- Updated `/api/stripe-webhook` to perform an `UPDATE` on existing registration rows when processing a Stripe payment completion for course renewals instead of throwing a unique constraint violation.
- Bumped application version to `1.03.26`.

## [2026-06-20] fix | Fix Registry Refresh After Tesserato Activation (v1.03.26)
- Added `loadTesserati()` and `loadStats()` to the callback of `attivaTesseramentoApprovazioni()` in `portal/dashboard.html` to ensure that when a tesserato is approved/activated, their profile immediately loads into the Registro Tesserati table and the stats update without requiring a manual page refresh.
- Bumped application version to `1.03.26`.

## [2026-06-20] fix | SQL Functions Multi-role Array Support (v1.03.26)
- Redefined SQL stored procedures `approva_tesserato`, `get_user_role`, `elimina_utente_completo`, `elimina_utente_fantasma`, and `salva_verbale_relazionale` on Supabase to support checks against the migrated array type `ruolo_utente[]` instead of the old scalar type `ruolo_utente`.
- Bumped application version to `1.03.26`.

## [2026-06-20] fix | Fix Dashboard Tesserati Activation RPC & Align Versions (v1.03.26)
- Fixed error in `portal/dashboard.html` when activating tesserati; corrected RPC function call from `attiva_tesserato` to database-level `approva_tesserato` and populated the missing `p_deciso_da` administrator field.
- Unified application versioning settings across all config, landing, and dashboard files to version `1.03.26`.
- Bumped application version to `1.03.26`.

## [2026-06-20] fix | Array Support for RLS Policies
- Updated all Row Level Security (RLS) policies in the database to correctly support the array structure of `ruolo_utente[]` returned by `get_user_role()`. Previously, policies used the `IN` operator which caused them to fail silently and return empty results (e.g., in `registro_tesserati`). They now use the array overlap `&&` or `ANY()` operators.
- Updated `elimina_utente_incompleto` stored procedure to correctly typecast and compare array roles.

## [2026-06-18] fix | Rename dashboard area and enforce single board role (v1.03.26)
- Renamed "Board Dashboard" option in context switcher to "Area Direttivo".
- Updated dashboard welcome title dynamically: shows "AREA DIRETTIVO | INCARICO: [RUOLO]" instead of static welcome string.
- Enforced single board role (exclusivity) in the nomination/role modification modal, unchecking other board roles automatically upon check, and validated on submit.
- Bumped application version to `1.03.26`.

## [2026-06-18] fix | Exclude board and staff from incomplete registrations (v1.03.26)
- Updated the SQL view `public.vw_registrazioni_incomplete` to explicitly exclude users who have any administrative/board roles (`presidente`, `vice_presidente`, `segretario`, `tesoriere`, `consigliere`) or staff roles (`istruttore`, `volontario`). This prevents manually setup or seeded administrators (like `nexglg@gmail.com`) who don't have records in `registro_approvazioni`, `registro_soci`, or `registro_tesserati` from incorrectly appearing as incomplete ghost registrations.
- Bumped application version to `1.03.26`.

## [2026-06-18] fix | Athlete Context Theme Override (v1.03.26)
- Fixed theme color matching for the Athlete dashboard context. Previously, having the "istruttore" or "volontario" role would override the athlete theme to blue or green, even when switching specifically to the athlete dashboard. It is now correctly forced to the athlete theme (red).
- Bumped application version to `1.03.26`.

## [2026-06-18] ingest | Multi-role implementation & Dashboard Fixes (v1.03.26)
- Migrated database `utenti.ruolo` column from text to `ruolo_utente[]` array type.
- Updated `dashboard.html` and `registrazione.html` to support array-based role checking (using `.includes()` and `.some()`).
- Added multi-role context switcher in the dashboard navigation header.
- Added blue-themed Instructor dashboard and green-themed Volunteer dashboard.
- Fixed duplicate variable declaration `isBoardMember` that caused the dashboard to hang on load.
- Bumped application version to `1.03.26`.

## [2026-06-18] update | Separate Corsi & Eventi Dashboard Tabs (v1.03.26)
- Split "CORSI ED EVENTI" sidebar link in `portal/dashboard.html` into two separate links: "CORSI" and "EVENTI".
- Separated HTML tab panels into `panel-user_corsi` and `panel-user_eventi` to isolate course listings and event listings.
- Segmented user's active bookings into "I miei corsi" (`#user-corsi-iscrizioni`) and "I miei eventi" (`#user-eventi-iscrizioni`).
- Bumped application version to `1.03.26`.

## [2026-06-18] update | Member Portal Certificate Fixes & Segmented Events (v1.03.26)
- Removed doctor name fields from standard user certificate uploads.
- Fixed certificate table "VISUALIZZA" link to open signed document URLs via `openSignedFile()`.
- Hided the green valid certificate status block on Home (Panoramica) to minimize UI clutter.
- Segmented Corsi (courses) and Eventi (events) into separate, distinct visual grids in `portal/dashboard.html`.
- Migrated database schema to add a `tipo` column to `public.eventi` and inserted new events: *Campo marzio 2026* and *Ludi piceni 2026*.
- Bumped application version to `1.03.26`.

## [2026-06-18] update | Course Subscriptions UI & Version Bump (v1.03.26)
- Added subscription selection dropdown controls for the catalog courses (*Strongman e Powerlifting*, *Ibrido*, *SCAB*) inside `portal/dashboard.html`.
- Implemented visual dynamic price updating when choosing different subscription tiers (Mese, Trimestre, Semestre, Annuale).
- Linked selected plan values to the checkout API call (`/api/create-event-checkout-session`).
- Bumped application version to `1.03.26`.

## [2026-06-18] update | Member Dashboard Implementation (v1.03.26)
- Implemented the complete user dashboard for standard members in `portal/dashboard.html`.
- Extended the database schema with new tables `public.eventi`, `public.iscrizioni_eventi`, `public.comunicazioni`, and profile-related columns in `public.utenti`.
- Created `api/create-event-checkout-session.js` and updated `api/stripe-webhook.js` to automate event booking and payments.
- Bumped application version to `1.03.26`.

## [2026-06-18] update | Animated OTP Loading Indicator & Version Bump (v1.03.26)
- Implemented CSS animated spinners for the OTP confirmation button status updates in `portal/registrazione.html`.
- Updated test user Alessandro Bianchi status to paid and inserted receipt in database.
- Bumped application version to `1.03.26`.

## [2026-06-17] update | Admin Alert Banner Role Isolation (v1.03.26)
- Restricted the dynamic pending approvals alert banner to Board Members only in `portal/dashboard.html`.
- Filtered dashboard data loaders to prevent query overhead and console RLS warnings for non-board member profiles.
- Bumped application version to `1.03.26`.

## [2026-06-17] update | Subdomain Portal Migration, CORS & Stripe Hardening (v1.03.26)
- Configured dynamic CORS whitelist across APIs (`api/otp.js`, `api/otp-verify.js`, `api/create-checkout-session.js`) to support `portal.adrenalinaclub.it` and temporary `nex-777.github.io` origins.
- Resolved AI certificate validation loop bug by setting the API base url to use request headers host dynamically in `api/otp-verify.js`.
- Implemented Stripe webhook idempotency check on `codice_transazione` in `api/stripe-webhook.js`.
- Replaced hardcoded relative checkout redirect path in `portal/pagamento.html` with dynamic configured `API_BASE_URL`.
- Centralized fallback configuration values pointing to `https://portal.adrenalinaclub.it` across all frontend portal pages.
- Bumped application version to `1.03.26`.

## [2026-06-17] update | Fixed GitHub Pages config loading & Vercel API Base URL
- Removed `portal/config.js` and `config.js` from `.gitignore` to ensure configurations are pushed to GitHub Pages.
- Updated `portal/config.js` to set `API_BASE_URL` to the production Vercel deployment (`https://adr-sito.vercel.app`) instead of empty/relative paths.
- Bumped application version to `1.03.26` across all pages and configurations.

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
- Bumped application version to `1.03.26`.

## [2026-06-02] fix | Registration Retry Crash & Storage RLS Update Policies (v1.03.26)
- Fixed crash in `api/otp-verify.js`: changed `insert()` to `upsert(onConflict)` for `anagrafiche`, `indirizzi_residenza`, and `contatti` tables. This prevents a duplicate-key crash when OTP validation is retried after a partial failure.
- Fixed storage RLS bug: `upsert: true` on file uploads requires both INSERT and UPDATE policies. Only INSERT policies existed. Added missing UPDATE policies for all three buckets: `certificati_medici`, `documenti_adesione`, `documenti_tutori`.
- Verified and confirmed `elimina_utente_completo()` stored function covers full cascade cleanup including `auth.users`, `utenti`, `atti_adesione`, `ricevute_pagamenti`, `anagrafiche` (+ its cascade children). Recreated with added robustness.
- Manually cleaned all residual records for test user Alessandro Bianchi (`nexmny@gmail.com`) to allow fresh registration.
- Bumped application version to `1.03.26`.

## [2026-06-02] update | Registry Restructuring & Dashboard UI (v1.03.26)
- Designed and created new database staging table `registro_approvazioni` to queue socio/tesserato applications.
- Altered tables `registro_soci` and `registro_tesserati` to add progressives `numero_registro` for gapless numbering (`S-N/ANNO` and `T-N/ANNO`).
- Built DB stored function `next_registro_number` to dynamically fetch the next gapless index.
- Replaced database trigger `sync_utente_to_normalized_tables()` and stored procedure `salva_verbale_relazionale()` to write to `registro_approvazioni` and handle progressive numbering.
- Defined RPC `approva_tesserato` to safely move approved tesserati into the official ledger once medical certificates are validated VERDE.
- Patched API endpoint `api/otp-verify.js` to land pending signups into `registro_approvazioni` staging.
- Redesigned `portal/dashboard.html` adding the **REGISTRO APPROVAZIONI** tab, separating pending Soci and Tesserati, displaying `numero_registro` instead of DB serial IDs, adding a dynamic pending count alert banner, and securing `openSignedFile` against URL injection vectors.
- Bumped application version to `1.03.26`.

## [2026-06-02] release | Gapless Registry & Dashboard Fixes (v1.03.26)
- Finalized registry restructure, dashboard UI, and security fixes.
- Bumped application version to `1.03.26`.

## [2026-06-02] fix | Registration ON CONFLICT trigger error (v1.03.26)
- Fixed a bug in `sync_utente_to_normalized_tables()` trigger function where `ON CONFLICT (utente_id)` failed on `anagrafiche` insert because `utente_id` is not uniquely constrained. Changed it to `ON CONFLICT (codice_fiscale)` which is correctly indexed as unique.
- Bumped application version to `1.03.26`.

## [2026-06-02] fix | Registration redundant trigger & Date Validation (v1.03.26)
- Dropped the redundant DB trigger `tr_sync_utente_to_normalized` on `utenti` table. The trigger was conflicting with the OTP registration flow which already handles the exact same inserts via `api/otp-verify.js`, resolving the `record "new" has no field "step_registrazione"` error.
- Added frontend JS validation in `portal/registrazione.html` to prevent users from selecting a medical certificate issue date in the future.
- Bumped application version to `1.03.26`.

## [2026-06-02] fix | OTP Verify API Upsert Error (v1.03.26)
- Fixed a 500 Internal Server Error in `api/otp-verify.js` caused by `supabase.upsert()` failing against a partial unique index (`anagrafica_id, tipo WHERE stato = 'IN_ATTESA'`) in `registro_approvazioni`. Replaced the unsupported `upsert` with a safe `delete` + `insert` pattern for all 3 registration cases (Socio, Tesserato, Socio+Tesserato).
- Bumped application version to `1.03.26`.

## [2026-06-02] feature | Ghost Users Cleanup (v1.03.26)
- Added SQL view `vw_registrazioni_incomplete` to identify users who created an account in `auth.users` but failed to complete the OTP verification (resulting in missing `anagrafiche` records).
- Created a new SQL RPC `elimina_utente_fantasma(p_utente_id)` with `SECURITY DEFINER` allowing the President to delete these ghost users, securely cascading the deletion to `auth.users` to free up the email.
- Updated `portal/dashboard.html` to include a new "REGISTRAZIONI INCOMPLETE" section within the "Registro Approvazioni" panel, allowing the President to delete stuck registrations with one click.
- Bumped application version to `1.03.26`.

## [2026-06-02] fix | Dashboard JS Syntax Error (v1.03.26)
- Fixed an `Uncaught SyntaxError` in `portal/dashboard.html` caused by using `await` inside the synchronous `renderApprovazioniTables` function. Converted the function to `async`.
- Bumped application version to `1.03.26`.

## [2026-06-02] fix | Registrazione Browser Autofill Bug (v1.03.26)
- Added `autocomplete="off"` to the email field and `autocomplete="new-password"` to the password field in `portal/registrazione.html` to prevent browsers from automatically injecting the President's saved credentials during new registrations.
- Bumped application version to `1.03.26`.

## [2026-06-02] feature | AI Certificate Validation & Missing Cert Bugfix (v1.03.26)
- Fixed the "MANCANTE" certificate bug by migrating the certificate data from the old `utenti` schema to the new `certificati_medici` table during OTP verification in `api/otp-verify.js`.
- Integrated Google Gemini 1.5 Flash Vision API (`@google/genai`) to automatically process and validate uploaded medical certificates.
- Created `api/validate-cert.js` endpoint which downloads the certificate image from Supabase Storage and prompts Gemini to extract issue dates, expiry dates, and the certificate type (agonistico/non agonistico).
- The system now automatically assigns a status (`VERDE`, `GIALLO`, `ROSSO`) to the certificate based on the AI's analysis and logs it in `certificati_medici`.
- Added the `GEMINI_API_KEY` to the Vercel environment variables.
- Bumped application version to `1.03.26`.

## [2026-06-02] hotfix | Fix certificati_medici insertion crash (v1.03.26)
- Fixed a backend crash in `api/otp-verify.js` where the insertion into `certificati_medici` failed silently due to Postgres `NOT NULL` constraints on `data_scadenza` and `medico_rilascio`. Added fallback dummy values that will be immediately overwritten by the AI validation step.
- Bumped application version to `1.03.26`.

## [2026-06-02] hotfix | Fix Gemini SDK parsing & Dashboard manual approval (v1.03.26)
- Fixed a backend crash in `api/validate-cert.js` caused by `response.text()` being used instead of `response.text` for the new `@google/genai` SDK.
- Modified the Dashboard's "Registro Approvazioni" panel to display a clickable "APPROVA CERT." button for certificates in `GIALLO` (Revisione) state, allowing the President to manually force a green status without leaving the tab.
- Bumped application version to `1.03.26`.

## [2026-06-02] update | Dashboard UI improvement (v1.03.26)
- Added the "ELIMINA" button for pending Tesserati in the "REGISTRO APPROVAZIONI" panel, allowing the President to completely clean up failed or duplicate registrations using the deep-clean `elimina_utente_completo` RPC function.
- Bumped application version to `1.03.26`.

## [2026-06-02] update | Ingest Portal Pages & Ghost User Management
- Created documentation for `portal/dashboard.html` in [portal_dashboard.md](portal_dashboard.md).
- Created documentation for `portal/login.html` and `portal/pagamento.html` in [auth_and_payments.md](auth_and_payments.md).
- Updated [registration_flow.md](registration_flow.md) with browser autofill prevention and medical certificate validation details.
- Updated [database_schema.md](database_schema.md) with details of the new `vw_registrazioni_incomplete` view, the `elimina_utente_fantasma` RPC, trigger cleanup, and the upsert fix.

## [2026-06-17] hotfix | Fix dashboard registration approvals list refresh after deletion (v1.03.26)
- Added `loadApprovazioni()` call to `eliminaUtente` inside `portal/dashboard.html` to ensure that when an admin deletes a pending user, the "Registro Approvazioni" panel refreshes instantly.
- Bumped application version to `1.03.26`.

## [2026-06-18] edit | Role-based CSS Theme (v1.03.26)
- Implemented role-based color theming in `portal/dashboard.html` using CSS Custom Properties (Variables).
- Defined `.theme-tesserato`, `.theme-direttivo`, `.theme-istruttore`, and `.theme-volontario` classes injected dynamically into the `<body>` element based on `userRole` within `applyRolePermissions()`.
- Bumped application version to `1.03.26`.

## [2026-06-18] edit | Context Switcher (v1.03.26)
- Added a `context-switcher` dropdown in `portal/dashboard.html` for Board members to toggle between "BOARD DASHBOARD" (Admin view) and "AREA TESSERATO" (Athlete view).
- Extracted UI rendering logic into `renderContextUI()` and `switchContext(view)`, allowing dynamic toggling of both the CSS theme and the sidebar menus without reloading the page.
- Added "AREA ISTRUTTORE" (Blue Theme) and "AREA VOLONTARIO" (Green Theme) demo views to the context switcher for the President to preview.
- Bumped application version to `1.03.26`.




## [2026-06-24] fix | Webhook Database and RLS Fix (v1.03.26)
- Corrected database function prossimo_numero_ricevuta to avoid FOR UPDATE with aggregate functions causing 500 error in webhook.
- Added missing RLS policies for ricevute_pagamenti and registro_spese.
- Bumped application version to 1.03.26.

## [2026-06-24] edit | Medical Certificate Display (v1.03.26)
- Replaced textual color strings ('VERDE', 'GIALLO', 'ROSSO') with expiration date in instructor view for medical certificates.
- Bumped application version to 1.03.26.

## [2026-06-24] fix | Critical Security Remediation & Key Rotation (v1.03.26)
- Implemented core security fixes for the 7 critical vulnerabilities identified in the audit (C-01 to C-07).
- Secured `/api/validate-cert` and `/api/trigger-csen` endpoints with authorization checks, rate limiting, and sanitized error responses.
- Hardened CORS allowed origins verification in OTP endpoints to prevent host header spoofing.
- Fixed Stripe webhook fail-closed logic when configuration variables are missing.
- Added authorization validation in the `salva_verbale_relazionale` stored procedure on Supabase.
- Removed sensitive files (`portal/config.js` and `scratch/test-fetch.js`) from Git tracking and added them to `.gitignore`.
- Coordinated the rotation of Supabase JWT Signing keys, disabling of legacy API keys, and revocation of the leaked symmetric HS256 secret.
- Bumped application version to 1.03.26.

## [2026-06-25] fix | High and Medium Security Hardening (v1.03.26)
- Enabled RLS on the `rate_limits` table with no public policies to block unauthorized client access.
- Implemented RLS SELECT policies for `bilanci` and `verbali_assemblea` restricting access to approved members and board members, and write permissions to authorized board members.
- Updated `ricevute_pagamenti` RLS policies to grant select permissions to all board members.
- Created `/api/get-ip` endpoint to fetch client IP from Vercel headers, replacing third-party `api.ipify.org` calls in the dashboard for GDPR compliance.
- Overrode `window.alert` in the portal (dashboard, registration, and payment pages) with a security interceptor to hide technical database and runtime errors from end-users.
- Removed sensitive UUID and signed URL print statements in `registrazione.html`.
- Secured `pagamento.html` against IDOR by retrieving user identity directly from the verified Supabase session instead of URL parameters.
- Sanitized raw database error returns with generic error messages in `api/cron-scadenze.js`, `api/otp-verify.js`, `api/create-checkout-session.js`, `api/create-event-checkout-session.js`, and the Deno Edge Function `supabase/functions/otp/index.ts`.
- Rewrote the `approva_tesserato` stored procedure to generate CSEN numbers securely using cryptographically secure random bytes.
- Bumped application version to 1.03.26.


## [2026-06-26] update | Medium-Term Security & UI Tasks (v1.03.26)
- Initialized Supabase configuration for local CLI and prepared pgTAP testing directory.
- Extracted inline JavaScript from \index.html\ and \portal/pagamento.html\ into external \index.js\ and \pagamento.js\ scripts to reduce inline scripts.
- Migrated Tailwind CSS from CDN to a local build via the new Tailwind CSS v4 CLI (\@tailwindcss/cli\), replacing inline configuration in HTML with a proper \input.css\ and \package.json\ build step.
- Bumped application version to 1.03.26 across the codebase.


## [2026-06-26] update | Security Refactoring (Long Term)
- Extracted JS from registrazione.html and dashboard.html into separate JS files.
- Replaced inline event handlers with standard EventListeners to support Strict CSP.
- Enabled Strict CSP in vercel.json.
- Configured Vitest for API testing and added basic tests for get-ip.js.

## [2026-06-28] fix | Security Refactoring (Long Term)
- Removed leftover inline scripts from dashboard.html and registrazione.html that were blocked by Strict CSP.
- Removed portal/config.js from .gitignore so it deploys properly to Vercel and fixes 404 errors.
- Bumped version to 1.03.26.

## [2026-06-28] fix | Allow unsafe-inline scripts in CSP
- Added 'unsafe-inline' to script-src in vercel.json Content-Security-Policy to unbreak inline onclick event handlers used across the dashboard.

## [2026-06-28] style | Improve Version Badge Legibility (v1.03.26)
- Changed the color scheme of the version badge in the header across all HTML files to neutral white/gray (	ext-white/70, g-white/5) for better readability against dark backgrounds, avoiding conflicts with theme-specific primary colors like the dark blue of the instructor role.
- Bumped application version to 1.03.26.

## [2026-06-28] style | Fix Version Badge Legibility & Cache-Control (v1.03.26)
- Fixed a regex replacement error that skipped HTML files in the previous version bump.
- Bumped application version to 1.03.26 across all HTML and JS files.

## [2026-07-02] feat | Expiration Progress Bars for Instructor Dashboard (v1.03.26)
- Implemented a 12-segment progress bar representing months remaining for course and medical certificate expirations in the instructor attendance register.
- Bumped application version to 1.03.26 across all files.

## [2026-07-02] fix | Mermaid diagram syntax (v1.03.26)
- Wrapped node labels containing special characters in quotes to fix the syntax error in the System Logics diagram.
- Bumped application version to 1.03.26.

## [2026-07-02] fix | Expiration progress bar inline styling (v1.03.26)
- Changed progress bar indicators to use inline style background-colors to fix missing CSS classes due to Tailwind CDN compilation limitations.
- Bumped application version to 1.03.26.

## [2026-07-02] feat | Tasto Partecipanti per Amministratori (v1.03.26)
- Aggiunto il tasto "Partecipanti" nella lista dei corsi attivi per consentire al direttivo di visualizzare il registro iscritti e presenze con la stessa visualizzazione dell'istruttore.
- Gestito il cambio di contesto dinamico con ritorno automatico alla schermata di gestione amministrativa.
- Bumped application version to 1.03.26.

## [2026-07-02] feat | Expiration progress bar in Registro Tesserati (v1.03.26)
- Spostata la funzione di generazione barra di progresso a livello globale.
- Rimossa la dicitura 'Med.: ...' dal Registro Tesserati e sostituita con la barra colorata di scadenza del certificato medico.
- Bumped application version to 1.03.26.

## [2026-07-02] feat | Registri CSEN Istruttori e Volontari (v1.03.26)
- Creati i pannelli "Registro Istruttori" e "Registro Volontari" visibili a tutto il direttivo (in sola lettura per i non-admin).
- Implementata la possibilità per presidente e vicepresidente di aggiungere o rimuovere istruttori/volontari, autocompilando i dettagli dei tesserati interni o inserendo soggetti esterni.
- Configurato l'aggiornamento automatico dei ruoli utente in `utenti` quando vengono nominati o rimossi.
- Prepopolati nel database i tre istruttori esistenti (Paoletti, Ciaralli, Mannocchi).
- Bumped application version to 1.03.26.

## [2026-07-02] fix | Resolve CSP Block on Domain Change (v1.03.26)
- Risolto il blocco di sicurezza CSP (Content Security Policy) causato dal passaggio al dominio principale: modificati tutti i file javascript in `portal/` per utilizzare `window.location.origin` come base dell'API invece dell'indirizzo assoluto hardcoded `https://portal.adrenalinaclub.it`.
- Questo permette di fare chiamate API relative che rispettano la direttiva `connect-src 'self'` del CSP su qualsiasi dominio/sottodominio attivo.
- Bumped application version to 1.03.26.
# #   [ 2 0 2 6 - 0 7 - 1 6 ]   i n g e s t   |   F i x   I n f i n i t e   R e c u r s i o n   R L S  
 -   R e s o l v e d   ' i n f i n i t e   r e c u r s i o n   d e t e c t e d '   e r r o r   i n   e p i k a _ p r o f i l i   R L S   b y   r e m o v i n g   r e d u n d a n t   p o l i c i e s   a n d   r e w r i t i n g   a d m i n   p o l i c i e s   a s   S E C U R I T Y   D E F I N E R   t o   b r e a k   t h e   d e p e n d e n c y   c y c l e   b e t w e e n   e p i k a _ p r o f i l i ,   e p i k a _ g r u p p i _ s t o r i c i ,   a n d   u t e n t i .  
 

## [2026-08-05] refactor | GDPR Compliance & Mistral AI Migration (v1.03.92)
- Replaced Google Gemini API (@google/genai) with Mistral AI Vision (@mistralai/mistralai, model pixtral-12b-2409) in api/validate.js for scanning medical certificates and identity documents.
- Ensured 100% GDPR compliance (Art. 9 health data & Art. 28 DPA with EU-hosted infrastructure in Paris, France).
- Updated environment variable requirement from GEMINI_API_KEY to MISTRAL_API_KEY.
- Updated documentation in wiki/api_endpoints.md.
- Bumped application version to v1.03.92.

## [2026-08-07] fix | Rejection button for auto-validated medical certificates (v1.04.20)
- Added `RIFIUTA CERT.` button alongside `ATTIVA` in `portal/dashboard.js` (`renderApprovazioni` and `renderTesseratiTable`) when a medical certificate is in `VERDE` status for pending tesserati (`IN_ELABORAZIONE`).
- Allows admins to override AI validation during manual supervision and reject blurry, incomplete, or invalid documents directly from pending activation tables.
- Bumped application version to v1.04.20.


## [2026-08-27] patch | epika.js
- Fix: Rimosso prefisso window. da supabaseClient che causava TypeError e bloccava il caricamento del grafo (v1.05.05).

## [2026-08-27] patch | epika.js
- Fix: Rimosse colonne inesistenti (es. attivo, ordine) e filtri errati (.eq('attivo', true)) dalle query Supabase del grafo, introdotte per errore precedentemente, ripristinando il caricamento corretto (v1.05.06).

## [2026-09-08] ingest | Accesso Nestore Direttivo/Istruttori
- Aggiunta policy RLS su registro_istruttori per lettura personale.
- Modificati portal/dashboard.js e portal/nestore.js per permettere l'accesso incondizionato a Nestore per Direttivo e Istruttori.
# #   [ 2 0 2 6 - 0 9 - 0 9 ]   i n g e s t   |   N e s t o r e   U I   R e f a c t o r i n g   S P A 
 -   I m p l e m e n t a t o   m e n u   d i   n a v i g a z i o n e   l a t e r a l e   d e s k t o p   c o n   p a n n e l l i   d e d i c a t i   p e r   P e s o ,   A l l e n a m e n t i   e   D i e t a . 
 -   A g g i u n t e   T a b e l l e   C r o n o l o g i c h e   ( S t o r i c o   R i l e v a z i o n i )   d i n a m i c h e   s o t t o   a i   g r a f i c i . 
 -   A g g i o r n a t a   M o b i l e   T a b   B a r   c o n   s c o r r i m e n t o   o r i z z o n t a l e   a   4   v o c i .  
 
## [2026-09-23] ingest | Storico Allenamenti: Unificazione Modale Modifica & Fix Database Invictus
- **Unificazione UX Storico (Opzioni 1B & 2A)**: Rimossa la modale statica di sola lettura (`#nst-modal-dettaglio-allenamento`) e l'Action Sheet mobile (`#nst-modal-allenamento-actions`). Il click/tap sulla riga apre direttamente l'editor completo della seduta (`#nst-modal-edit-allenamento`).
- **Pulsante Elimina Sessione in Modifica**: Aggiunto il pulsante rosso *"Elimina Sessione"* nel footer della modale di modifica, collegato alla doppia conferma di cancellazione soft-delete (`attivo: false`).
- **Colonna Azioni Desktop Semplificata**: Rimossa l'icona Matita; lasciata solo l'icona Cestino per la cancellazione diretta.
- **Correzione Database Storico Invictus (Opzione 3A)**: Aggiornata la sessione Invictus del 22/09/2026 (`c02b3922-ee2a-440b-afa2-72f7add94ee4`) ripartendo il tempo totale di 39 minuti su 20 lap calcolati (01:57 a giro) e ricostruendo i 20 set di 5 pull-up, 10 push-up e 20 air squat in `scheda_dati` e nel report dettagliato in `note`.
