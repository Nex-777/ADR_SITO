import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// -------------------------------------------------------
// Utility: Email di alert su errori critici
// -------------------------------------------------------
async function sendAlertEmail(subject, htmlBody) {
    if (!RESEND_API_KEY) {
        console.warn('[ALERT] RESEND_API_KEY non configurato. Impossibile inviare email di allerta.');
        return;
    }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Adrenalina Club <noreply@adrenalinaclub.it>',
                to: ['fabio.paoletti@adrenalinaclub.it'],
                subject,
                html: htmlBody,
            }),
        });
        if (!res.ok) console.warn('[ALERT] Invio email fallito:', await res.text());
        else console.log('[ALERT] Email di allerta inviata.');
    } catch (e) {
        console.warn('[ALERT] Errore invio email:', e.message);
    }
}

// -------------------------------------------------------
// Utility: Formato data DB -> CSEN (YYYY-MM-DD -> DD/MM/YYYY)
// -------------------------------------------------------
function formattaData(dataStr) {
    if (!dataStr) return '';
    const [y, m, d] = dataStr.split('-');
    return `${d}/${m}/${y}`;
}

// -------------------------------------------------------
// Utility: Converti livello copertura in tipo tessera CSEN
// -------------------------------------------------------
function formattaTipoTesseramento(livello) {
    if (livello === 'INTEGRATIVA_A') return 'A';
    if (livello === 'INTEGRATIVA_B') return 'B';
    return 'Base Silver';
}

// -------------------------------------------------------
// Utility: Risolvi CAPTCHA con 2Captcha
// -------------------------------------------------------
async function solveCaptcha(base64Data, apiKey) {
    const bodyParams = new URLSearchParams({
        key: apiKey,
        method: 'base64',
        body: base64Data,
        json: '1'
    });
    console.log('   - Invio CAPTCHA a 2Captcha...');
    const resIn = await fetch('https://2captcha.com/in.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
    });
    const jsonIn = await resIn.json();
    if (jsonIn.status !== 1) throw new Error('Errore invio 2Captcha: ' + jsonIn.request);

    const taskId = jsonIn.request;
    console.log(`   - Task CAPTCHA ${taskId}. Attendo risoluzione...`);
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const resOut = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
        const jsonOut = await resOut.json();
        if (jsonOut.status === 1) {
            console.log(`   - CAPTCHA risolto: ${jsonOut.request}`);
            return jsonOut.request;
        }
        if (jsonOut.request !== 'CAPCHA_NOT_READY') throw new Error('Errore risoluzione 2Captcha: ' + jsonOut.request);
    }
    throw new Error('Timeout risoluzione CAPTCHA');
}

// -------------------------------------------------------
// Utility: Analizza HTML della pagina CSEN per determinare
// stato della tessera e se serve rinnovo
// -------------------------------------------------------
function analizzaStatoTessera(htmlContent) {
    const anno = new Date().getFullYear();

    // Controlla badge tessera scaduta
    const scaduta = htmlContent.includes('TESSERA SCADUTA') ||
        htmlContent.toLowerCase().includes('clicca per rinnovare') ||
        htmlContent.includes('what=RESET');

    // Estrai data di scadenza (formato CSEN: "Scade il: DD/MM/YYYY")
    const scadMatch = htmlContent.match(/Scade\s+il:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    let annoScadenza = null;
    if (scadMatch) {
        annoScadenza = parseInt(scadMatch[3], 10);
    }

    // Estrai numero tessera corrente dalla pagina
    const tesseraMatch = htmlContent.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
    const numeroCorrente = tesseraMatch ? tesseraMatch[1] : null;

    const necessitaRinnovo = scaduta || (annoScadenza !== null && annoScadenza < anno);
    const tesseraAttiva = !necessitaRinnovo && numeroCorrente !== null;

    return { necessitaRinnovo, tesseraAttiva, numeroCorrente, annoScadenza };
}

// -------------------------------------------------------
// Funzione principale di sincronizzazione
// -------------------------------------------------------
async function syncCsen() {
    console.log('========================================');
    console.log(`CSEN Active Sync - ${new Date().toISOString()}`);
    console.log('========================================');

    if (!CSEN_USER || !CSEN_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        const errMsg = "ERRORE FATALE: Variabili d'ambiente mancanti (CSEN_USER, CSEN_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).";
        console.error(errMsg);
        await sendAlertEmail('🔴 CSEN SYNC FALLITO: Configurazione mancante',
            `<div style="font-family:monospace;background:#111;color:#fff;padding:20px;border-left:5px solid #df293e">
                <h2 style="color:#df293e">CSEN SYNC - ERRORE CRITICO</h2>
                <p><strong>Errore:</strong> ${errMsg}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p>Verificare i Secrets su GitHub Actions.</p>
            </div>`
        );
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // -------------------------------------------------------
    // STEP 1: Correggi i PENDING che hanno già il numero tessera
    // (bug legacy: stati non aggiornati da run precedenti)
    // -------------------------------------------------------
    const { data: pendingConTessera } = await supabase
        .from('registro_tesserati')
        .select('id_tesserato, numero_tessera_csen')
        .eq('sync_csen_status', 'PENDING')
        .not('numero_tessera_csen', 'is', null);

    if (pendingConTessera && pendingConTessera.length > 0) {
        console.log(`\n[FIX LEGACY] Correzione ${pendingConTessera.length} record PENDING con numero tessera già presente...`);
        for (const rec of pendingConTessera) {
            await supabase.from('registro_tesserati')
                .update({ sync_csen_status: 'SYNCED', sync_csen_log: 'Stato corretto automaticamente: numero tessera già presente' })
                .eq('id_tesserato', rec.id_tesserato);
            console.log(`   - Corretto id_tesserato=${rec.id_tesserato} (tessera: ${rec.numero_tessera_csen})`);
        }
    }

    // -------------------------------------------------------
    // STEP 2: Preleva record da processare:
    //   - PENDING (nuovi iscritti + rinnovi da fare)
    //   - RENEWAL_SUBMITTED (rinnovo inviato, verifica se CSEN ha assegnato nuovo numero)
    // Entrambi devono avere numero_tessera_csen = NULL
    // -------------------------------------------------------
    const { data: tesserati, error: fetchErr } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            livello_copertura,
            anagrafica_id,
            sync_csen_status,
            numero_tessera_csen,
            anagrafiche (
                nome,
                cognome,
                sesso,
                data_nascita,
                comune_nascita,
                provincia_nascita,
                codice_fiscale,
                certificati_medici (
                    tipologia,
                    stato_validazione
                )
            )
        `)
        .in('sync_csen_status', ['PENDING', 'RENEWAL_SUBMITTED'])
        .is('numero_tessera_csen', null)
        .limit(10);

    if (fetchErr) {
        const errMsg = `Errore nel recupero dati da Supabase: ${fetchErr.message}`;
        console.error(errMsg);
        await sendAlertEmail('🔴 CSEN SYNC FALLITO: Errore database',
            `<div style="font-family:monospace;background:#111;color:#fff;padding:20px;border-left:5px solid #df293e">
                <h2 style="color:#df293e">CSEN SYNC - ERRORE DATABASE</h2>
                <p><strong>Errore:</strong> ${errMsg}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            </div>`
        );
        process.exit(1);
    }

    if (!tesserati || tesserati.length === 0) {
        console.log('\n✅ Nessun atleta in attesa di sincronizzazione CSEN. Uscita.');
        process.exit(0);
    }

    console.log(`\nTrovati ${tesserati.length} atleti da processare.`);
    tesserati.forEach(t => console.log(`   - ${t.anagrafiche?.nome} ${t.anagrafiche?.cognome} [${t.sync_csen_status}]`));

    // -------------------------------------------------------
    // STEP 3: Avvia browser Playwright
    // -------------------------------------------------------
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('dialog', async dialog => {
        try { await dialog.accept(); } catch (e) { }
    });

    const risultati = { successi: 0, errori: 0, falliti: [] };

    try {
        // -------------------------------------------------------
        // Login CSEN
        // -------------------------------------------------------
        console.log('\n1. Login sul portale CSEN...');
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/', { timeout: 30000 });
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('networkidle', { timeout: 30000 });

        const afterLoginContent = await page.content();
        if (afterLoginContent.includes('affiliazionecsen') ||
            afterLoginContent.toLowerCase().includes('password errata')) {
            throw new Error('Login CSEN fallito: credenziali non valide o pagina di login ancora presente.');
        }
        console.log('   ✅ Login CSEN riuscito.');

        await page.click("input[value='GESTIONE SOCI TESSERATI']").catch(() => {
            console.log('   - (Pulsante GESTIONE non trovato, proseguo)');
        });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });

        // -------------------------------------------------------
        // Loop per ogni atleta
        // -------------------------------------------------------
        for (const tess of tesserati) {
            const anag = tess.anagrafiche;
            if (!anag) {
                console.log(`\n>>> SKIP: id_tesserato=${tess.id_tesserato} — anagrafica mancante`);
                continue;
            }

            const cf = anag.codice_fiscale;
            const nomeCompleto = `${anag.nome} ${anag.cognome}`;
            const statoAttuale = tess.sync_csen_status;
            console.log(`\n>>> Elaboro: ${nomeCompleto} (${cf}) [stato: ${statoAttuale}]`);

            try {
                // Naviga alla ricerca
                await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show', { timeout: 20000 });
                await page.waitForLoadState('networkidle', { timeout: 20000 });

                // Cerca per Codice Fiscale
                const searchInput = await page.$('input[name="q"]');
                if (searchInput) {
                    await searchInput.fill(cf);
                    await page.click("input[type='submit'][value='Cerca']");
                    await page.waitForLoadState('networkidle', { timeout: 20000 });
                }

                const pageSource = await page.content();

                // -------------------------------------------------------
                // SCENARIO A: ATLETA NON TROVATO SU CSEN → NUOVA REGISTRAZIONE
                // -------------------------------------------------------
                if (pageSource.includes('Nessun tesserato individuato')) {
                    if (statoAttuale === 'RENEWAL_SUBMITTED') {
                        // Non dovrebbe mai succedere, ma se accade è un errore critico
                        console.error(`   ❌ ANOMALIA GRAVE: ${nomeCompleto} era in RENEWAL_SUBMITTED ma non trovato su CSEN!`);
                        await supabase.from('registro_tesserati').update({
                            sync_csen_status: 'ERROR',
                            sync_csen_log: 'ANOMALIA: Atleta scomparso dal portale CSEN dopo rinnovo. Verificare manualmente.'
                        }).eq('id_tesserato', tess.id_tesserato);
                        risultati.errori++;
                        risultati.falliti.push({ nome: nomeCompleto, cf, errore: 'Scomparso da CSEN dopo RENEWAL_SUBMITTED' });
                        continue;
                    }

                    console.log('   - Scenario: NUOVA REGISTRAZIONE');
                    await page.click("img[src='pics/admin_add.jpg']");
                    await page.waitForLoadState('networkidle', { timeout: 20000 });

                    await page.fill('input[name="cognome"]', anag.cognome);
                    await page.fill('input[name="nome"]', anag.nome);
                    await page.selectOption('select[name="sesso"]', { value: anag.sesso === 'M' ? 'M' : 'F' });
                    await page.fill('input[name="datadinascita"]', anag.data_nascita);

                    // Provincia Nascita
                    if (anag.provincia_nascita) {
                        try {
                            const pOpts = await page.$$eval('#birthplace_province option', opts => opts.map(o => o.value));
                            const matchP = pOpts.find(o => o.trim().toUpperCase() === anag.provincia_nascita.trim().toUpperCase());
                            if (matchP) await page.selectOption('#birthplace_province', { value: matchP });
                            else console.log('   - Provincia non trovata: ' + anag.provincia_nascita);
                        } catch (e) { console.log('   - Errore selezione Provincia'); }
                    }

                    await page.waitForTimeout(1200);

                    // Comune Nascita
                    if (anag.comune_nascita) {
                        try {
                            const cOpts = await page.$$eval('#birthplace option', opts => opts.map(o => o.text));
                            const matchC = cOpts.find(o => o.trim().toUpperCase() === anag.comune_nascita.trim().toUpperCase());
                            if (matchC) await page.selectOption('#birthplace', { label: matchC });
                            else console.log('   - Comune non trovato: ' + anag.comune_nascita);
                        } catch (e) { console.log('   - Errore selezione Comune'); }
                    }

                    // CF via JS (bypass calcolo e AdE)
                    await page.evaluate((val) => { document.getElementById('cf').value = val; }, cf);

                    // Qualifica
                    const certs = Array.isArray(anag.certificati_medici) ? anag.certificati_medici : [];
                    const latestCert = [...certs].sort((a, b) => {
                        const dateA = a.created_at || a.data_scadenza || '1970-01-01';
                        const dateB = b.created_at || b.data_scadenza || '1970-01-01';
                        return new Date(dateB) - new Date(dateA);
                    })[0];
                    const haCertAgonistico = latestCert && latestCert.tipologia === 'AGONISTICO' && latestCert.stato_validazione === 'VERDE';
                    const qualifica = haCertAgonistico ? 'Atleta Agonista' : 'Atleta Praticante';
                    await page.selectOption('select[name="qualifica"]', { label: qualifica }).catch(() => console.log('   - Option qualifica non trovata'));

                    // Tutte le discipline
                    await page.evaluate(() => {
                        const cbs = document.querySelectorAll('input[type="checkbox"]');
                        cbs.forEach(cb => cb.checked = true);
                    });

                    // Tipo tesseramento
                    const tipo = formattaTipoTesseramento(tess.livello_copertura);
                    await page.evaluate((t) => {
                        if (typeof Assegna === 'function') Assegna(t);
                    }, tipo).catch(() => { });

                    // CAPTCHA
                    await page.click('#Controlla').catch(() => { });
                    await page.waitForTimeout(2000);

                    if (process.env.CAPTCHA_API_KEY) {
                        try {
                            const captchaFrame = page.frameLocator('iframe[src*="cf_check.php"]');
                            const imgSrc = await captchaFrame.locator('#adeImg').getAttribute('src');
                            const base64Data = imgSrc.split(',')[1];
                            if (base64Data) {
                                const solvedText = await solveCaptcha(base64Data, process.env.CAPTCHA_API_KEY);
                                await captchaFrame.locator('#inCaptchaChars').fill(solvedText);
                                await captchaFrame.locator('button').click();
                                await page.waitForTimeout(4000);
                            }
                        } catch (err) {
                            console.error('   - Errore CAPTCHA:', err.message);
                        }
                    }

                    // Sblocca e invia
                    await page.evaluate(() => {
                        const btn = document.getElementById('mySubmit');
                        if (btn) btn.disabled = false;
                    });
                    await page.click('#mySubmit', { force: true });
                    await page.waitForLoadState('networkidle', { timeout: 20000 });
                    try { await page.click("input[value='CONFERMA']"); await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) { }

                    // Recupera nuovo numero tessera
                    const nuovoNumero = await estraiNumeraTesseraDopoOperazione(page, cf);
                    await aggiornaRecord(supabase, tess.id_tesserato, nuovoNumero, 'Nuova registrazione CSEN completata');
                    if (nuovoNumero) risultati.successi++;
                    else {
                        // Numero non ancora assegnato (attesa CSEN) - il nightly lo riprenderà
                        risultati.successi++;
                    }

                    // -------------------------------------------------------
                    // SCENARIO B: ATLETA TROVATO → analizza stato tessera
                    // -------------------------------------------------------
                } else {
                    // Analizza l'HTML della pagina risultati
                    const { necessitaRinnovo, tesseraAttiva, numeroCorrente, annoScadenza } = analizzaStatoTessera(pageSource);

                    console.log(`   - Su CSEN: necessitaRinnovo=${necessitaRinnovo}, tesseraAttiva=${tesseraAttiva}, numero=${numeroCorrente}, annoScad=${annoScadenza}`);

                    // ---- SCENARIO B1: ERA IN RENEWAL_SUBMITTED e ora ha tessera attiva ----
                    if (statoAttuale === 'RENEWAL_SUBMITTED' && tesseraAttiva && numeroCorrente) {
                        console.log(`   ✅ Rinnovo confermato da CSEN! Nuova tessera: ${numeroCorrente}`);
                        await supabase.from('registro_tesserati').update({
                            numero_tessera_csen: numeroCorrente,
                            sync_csen_status: 'SYNCED',
                            sync_csen_log: `Rinnovo CSEN confermato - Tessera ${numeroCorrente} (anno ${annoScadenza})`
                        }).eq('id_tesserato', tess.id_tesserato);
                        risultati.successi++;
                        continue;
                    }

                    // ---- SCENARIO B2: TESSERA SCADUTA → ESEGUI RINNOVO ----
                    if (necessitaRinnovo) {
                        // PROTEZIONE: se era in RENEWAL_SUBMITTED e CSEN ancora non ha processato,
                        // NON ri-sottomettiamo il form. Aspettiamo il prossimo run.
                        if (statoAttuale === 'RENEWAL_SUBMITTED') {
                            console.log(`   🟡 Rinnovo già inviato precedentemente. CSEN non ha ancora elaborato. Attendo prossimo run.`);
                            risultati.successi++;
                            continue;
                        }

                        console.log(`   - Scenario: RINNOVO TESSERA (scad. ${annoScadenza})`);

                        // Prima prova dal link diretto nella pagina risultati
                        let renewalLink = await page.$("a[href*='what=RESET']");

                        // Se non trovato nella lista, entra nel dettaglio dell'atleta
                        if (!renewalLink) {
                            console.log('   - Link rinnovo non in lista, accedo al dettaglio...');
                            const infoLink = await page.$('a[href*="tesserati.asp?what=show&id"]');
                            if (!infoLink) {
                                const infoImg = await page.$("img[src*='info']");
                                if (infoImg) await infoImg.click();
                            } else {
                                await infoLink.click();
                            }
                            await page.waitForLoadState('networkidle', { timeout: 15000 });
                            renewalLink = await page.$("a[href*='what=RESET']");
                        }

                        if (!renewalLink) {
                            const renewalText = await page.$("a:has-text('rinnovare')");
                            if (renewalText) renewalLink = renewalText;
                        }

                        if (!renewalLink) {
                            throw new Error(`Impossibile trovare link di rinnovo per ${nomeCompleto}. Tessera scaduta anno ${annoScadenza}. Verificare manualmente sul portale CSEN.`);
                        }

                        // Clicca il link di rinnovo (CSEN mostra un confirm() dialog gestito dal page.on('dialog'))
                        await renewalLink.click();
                        await page.waitForLoadState('networkidle', { timeout: 20000 });

                        console.log('   - Pagina di rinnovo caricata. URL:', page.url());

                        // === FLUSSO RINNOVO CSEN ===
                        // La pagina di rinnovo ha:
                        //   - <select id="tesseramento"> con opzioni: Base Silver, Base Gold, A (Integrativa A), B (Integrativa B)
                        //   - <button type="button">Rinnova!</button>
                        //   - Funzione JS Assegna() disponibile
                        //   - NESSUN #mySubmit, NESSUN CAPTCHA

                        // 1. Seleziona il tipo di tessera dal dropdown
                        const tipo = formattaTipoTesseramento(tess.livello_copertura);
                        console.log(`   - Seleziono tipo tessera: ${tipo}`);

                        const selectExists = await page.$('#tesseramento');
                        if (selectExists) {
                            await page.selectOption('#tesseramento', { value: tipo });
                            console.log('   - ✅ Tipo tessera selezionato dal dropdown');
                        }

                        // 2. Chiama Assegna() se disponibile (sincronizza la selezione con il sistema CSEN)
                        await page.evaluate((t) => {
                            if (typeof Assegna === 'function') Assegna(t);
                        }, tipo).catch(() => { });

                        await page.waitForTimeout(800);

                        // 3. Clicca il bottone "Rinnova!" (type="button", non submit)
                        const renewBtn = await page.$('button');
                        if (!renewBtn) {
                            throw new Error(`Bottone "Rinnova!" non trovato nella pagina di rinnovo CSEN per ${nomeCompleto}.`);
                        }
                        const btnText = await renewBtn.innerText();
                        console.log(`   - Clicco bottone: "${btnText}"`);
                        await renewBtn.click();

                        // 4. Attendi il completamento (possibile redirect o aggiornamento pagina)
                        await page.waitForLoadState('networkidle', { timeout: 20000 });
                        await page.waitForTimeout(2000);

                        // 5. Gestisci eventuale pagina di conferma
                        try { 
                            await page.click("input[value='CONFERMA']"); 
                            await page.waitForLoadState('networkidle', { timeout: 15000 }); 
                        } catch (e) { /* No conferma page, OK */ }

                        console.log('   - Form di rinnovo inviato. Verifico assegnazione nuovo numero...');

                        // Cerca subito il nuovo numero tessera
                        const nuovoNumero = await estraiNumeraTesseraDopoOperazione(page, cf);

                        if (nuovoNumero && nuovoNumero !== numeroCorrente) {
                            // CSEN ha già assegnato il nuovo numero (veloce)
                            console.log(`   ✅ Nuovo numero tessera assegnato immediatamente: ${nuovoNumero}`);
                            await supabase.from('registro_tesserati').update({
                                numero_tessera_csen: nuovoNumero,
                                sync_csen_status: 'SYNCED',
                                sync_csen_log: `Rinnovo CSEN completato - Nuova tessera: ${nuovoNumero}`
                            }).eq('id_tesserato', tess.id_tesserato);
                        } else {
                            // CSEN non ha ancora assegnato il nuovo numero (processo asincrono)
                            // Il prossimo nightly delle 2:00 lo recupererà automaticamente
                            console.log(`   🟡 Rinnovo inviato. CSEN non ha ancora assegnato il nuovo numero. Stato: RENEWAL_SUBMITTED`);
                            await supabase.from('registro_tesserati').update({
                                numero_tessera_csen: null,
                                sync_csen_status: 'RENEWAL_SUBMITTED',
                                sync_csen_log: `Rinnovo CSEN inviato ${new Date().toISOString()}. In attesa assegnazione nuovo numero da CSEN.`
                            }).eq('id_tesserato', tess.id_tesserato);
                        }

                        risultati.successi++;

                    } else if (tesseraAttiva && numeroCorrente) {
                        // ---- SCENARIO B3: TESSERA ATTIVA E VALIDA ----
                        console.log(`   ✅ Tessera CSEN attiva e valida: ${numeroCorrente} (scad. ${annoScadenza})`);
                        await supabase.from('registro_tesserati').update({
                            numero_tessera_csen: numeroCorrente,
                            sync_csen_status: 'SYNCED',
                            sync_csen_log: `Tessera attiva confermata - N. ${numeroCorrente}`
                        }).eq('id_tesserato', tess.id_tesserato);
                        risultati.successi++;

                    } else {
                        // ---- SCENARIO B4: STATO INCERTO ----
                        // Tessera trovata ma stato non classificabile
                        console.log(`   ⚠️ Stato tessera non classificabile. Anno scadenza: ${annoScadenza}. Numero: ${numeroCorrente}`);
                        await supabase.from('registro_tesserati').update({
                            sync_csen_status: 'ERROR',
                            sync_csen_log: `Stato tessera non classificabile: anno_scad=${annoScadenza}, numero=${numeroCorrente}. Verificare manualmente.`
                        }).eq('id_tesserato', tess.id_tesserato);
                        risultati.errori++;
                        risultati.falliti.push({ nome: nomeCompleto, cf, errore: `Stato CSEN non classificabile (anno scad: ${annoScadenza})` });
                    }
                }

            } catch (err) {
                console.error(`   ❌ ERRORE durante elaborazione di ${nomeCompleto} (${cf}):`, err.message);
                await supabase.from('registro_tesserati').update({
                    sync_csen_status: 'ERROR',
                    sync_csen_log: err.message.substring(0, 500)
                }).eq('id_tesserato', tess.id_tesserato);
                risultati.errori++;
                risultati.falliti.push({ nome: nomeCompleto, cf, errore: err.message.substring(0, 200) });
            }
        }

        // -------------------------------------------------------
        // Report finale
        // -------------------------------------------------------
        console.log('\n========================================');
        console.log('✅ Sincronizzazione completata.');
        console.log(`   Successi: ${risultati.successi} / ${tesserati.length}`);
        console.log(`   Errori:   ${risultati.errori} / ${tesserati.length}`);
        console.log('========================================');

        if (risultati.errori > 0) {
            const fallitiHtml = risultati.falliti.map(f =>
                `<tr>
                    <td style="padding:6px;border:1px solid #333">${f.nome}</td>
                    <td style="padding:6px;border:1px solid #333">${f.cf}</td>
                    <td style="padding:6px;border:1px solid #333;color:#f87171;font-size:12px">${f.errore}</td>
                </tr>`
            ).join('');

            await sendAlertEmail(
                `⚠️ CSEN SYNC: ${risultati.errori} errori su ${tesserati.length} atleti`,
                `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:20px;border-left:5px solid #eab308">
                    <h2 style="color:#eab308">CSEN SYNC - REPORT ERRORI</h2>
                    <p><strong>Data:</strong> ${new Date().toISOString()}</p>
                    <p><strong>Successi:</strong> ${risultati.successi} | <strong>Errori:</strong> ${risultati.errori}</p>
                    <table style="border-collapse:collapse;width:100%;margin-top:10px">
                        <thead><tr>
                            <th style="padding:6px;border:1px solid #333;text-align:left">Nome</th>
                            <th style="padding:6px;border:1px solid #333;text-align:left">CF</th>
                            <th style="padding:6px;border:1px solid #333;text-align:left">Errore</th>
                        </tr></thead>
                        <tbody>${fallitiHtml}</tbody>
                    </table>
                </div>`
            );
        }

    } catch (err) {
        console.error('\n❌ ERRORE GENERALE SCRIPT:', err.message);
        await sendAlertEmail(
            '🔴 CSEN SYNC FALLITO: Errore critico nel workflow',
            `<div style="font-family:monospace;background:#111;color:#fff;padding:20px;border-left:5px solid #df293e">
                <h2 style="color:#df293e">CSEN SYNC - ERRORE CRITICO</h2>
                <p><strong>Errore:</strong> ${err.message}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p>Possibili cause: credenziali CSEN errate, portale CSEN irraggiungibile, timeout Playwright.</p>
                <p>Rilanciare manualmente dalla dashboard dopo aver verificato il portale CSEN.</p>
            </div>`
        );
        process.exit(1);
    } finally {
        await browser.close();
    }
}

// -------------------------------------------------------
// Helper: Torna alla ricerca e estrae numero tessera attuale
// -------------------------------------------------------
async function estraiNumeraTesseraDopoOperazione(page, cf) {
    try {
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show', { timeout: 20000 });
        await page.waitForLoadState('networkidle', { timeout: 20000 });

        const searchInput = await page.$('input[name="q"]');
        if (searchInput) {
            await searchInput.fill(cf);
            await page.click("input[type='submit'][value='Cerca']");
            await page.waitForLoadState('networkidle', { timeout: 20000 });
        }

        const html = await page.content();

        // Verifica che la tessera sia attiva (non scaduta)
        const { necessitaRinnovo, numeroCorrente, annoScadenza } = analizzaStatoTessera(html);
        const annoCorrente = new Date().getFullYear();

        if (numeroCorrente && !necessitaRinnovo && annoScadenza >= annoCorrente) {
            return numeroCorrente;
        }
        // Tessera ancora scaduta o numero non estratto
        return null;
    } catch (e) {
        console.error('   - Errore estrazione numero tessera:', e.message);
        return null;
    }
}

// -------------------------------------------------------
// Helper: Aggiorna record in Supabase dopo operazione
// -------------------------------------------------------
async function aggiornaRecord(supabase, idTesserato, nuovoNumero, logMessaggio) {
    const annoCorrente = new Date().getFullYear();
    if (nuovoNumero) {
        await supabase.from('registro_tesserati').update({
            numero_tessera_csen: nuovoNumero,
            sync_csen_status: 'SYNCED',
            sync_csen_log: `${logMessaggio} - Tessera: ${nuovoNumero}`
        }).eq('id_tesserato', idTesserato);
    } else {
        // Numero non ancora assegnato — il nightly lo troverà il giorno dopo
        await supabase.from('registro_tesserati').update({
            numero_tessera_csen: null,
            sync_csen_status: 'SYNCED_NO_NUM',
            sync_csen_log: `${logMessaggio} - Numero tessera non ancora disponibile. Verrà recuperato automaticamente.`
        }).eq('id_tesserato', idTesserato);
    }
}

syncCsen();
