# Wiki Transaction Log

Chronological append-only record of ingestions, lint passes, and updates to the LLM Wiki.

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