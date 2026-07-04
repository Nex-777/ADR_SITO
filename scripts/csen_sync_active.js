import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// -------------------------------------------------------
// Utility: Invia email di alert tramite Resend
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
        if (!res.ok) {
            console.warn('[ALERT] Invio email fallito:', await res.text());
        } else {
            console.log('[ALERT] Email di allerta inviata con successo.');
        }
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
    return 'Base Silver'; // Fallback per BASE e altri
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

    if (jsonIn.status !== 1) {
        throw new Error('Errore invio 2Captcha: ' + jsonIn.request);
    }

    const taskId = jsonIn.request;
    console.log(`   - Task CAPTCHA creato: ${taskId}. Attendo risoluzione...`);

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const resOut = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
        const jsonOut = await resOut.json();

        if (jsonOut.status === 1) {
            console.log(`   - CAPTCHA risolto: ${jsonOut.request}`);
            return jsonOut.request;
        }

        if (jsonOut.request !== 'CAPCHA_NOT_READY') {
            throw new Error('Errore risoluzione 2Captcha: ' + jsonOut.request);
        }
    }
    throw new Error('Timeout risoluzione CAPTCHA');
}

// -------------------------------------------------------
// Funzione principale di sincronizzazione
// -------------------------------------------------------
async function syncCsen() {
    console.log('========================================');
    console.log(`Avvio Sincronizzazione CSEN (Active Sync) - ${new Date().toISOString()}`);
    console.log('========================================');

    // Validazione variabili ambiente
    if (!CSEN_USER || !CSEN_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        const errMsg = "ERRORE FATALE: Variabili d'ambiente mancanti. Verifica i Secrets su GitHub (CSEN_USER, CSEN_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).";
        console.error(errMsg);
        await sendAlertEmail(
            '🔴 CSEN SYNC FALLITO: Configurazione mancante',
            `<div style="font-family:monospace;background:#111;color:#fff;padding:20px;border-left:5px solid #df293e">
                <h2 style="color:#df293e">CSEN SYNC - ERRORE CRITICO</h2>
                <p><strong>Errore:</strong> ${errMsg}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p>Il sistema di sincronizzazione automatica CSEN non è partito.<br>
                Verificare i Secrets su GitHub Actions.</p>
            </div>`
        );
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // -------------------------------------------------------
    // STEP 1: Preleva SOLO i tesserati realmente PENDING
    // (senza numero tessera CSEN già valorizzato e con stato PENDING)
    // Limite: 10 per run per evitare timeout (max 15min su GitHub Actions)
    // -------------------------------------------------------
    const { data: tesserati, error: fetchErr } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            livello_copertura,
            anagrafica_id,
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
        .eq('sync_csen_status', 'PENDING')
        .is('numero_tessera_csen', null)  // ← FIX: solo quelli senza numero tessera già assegnato
        .limit(10);  // ← Aumentato da 5 a 10

    if (fetchErr) {
        const errMsg = `Errore nel recupero dati da Supabase: ${fetchErr.message}`;
        console.error(errMsg);
        await sendAlertEmail(
            '🔴 CSEN SYNC FALLITO: Errore database',
            `<div style="font-family:monospace;background:#111;color:#fff;padding:20px;border-left:5px solid #df293e">
                <h2 style="color:#df293e">CSEN SYNC - ERRORE DATABASE</h2>
                <p><strong>Errore:</strong> ${errMsg}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            </div>`
        );
        process.exit(1);
    }

    // -------------------------------------------------------
    // STEP 2: Correggi i PENDING che hanno già il numero tessera
    // (residuo del bug precedente: stati non aggiornati)
    // -------------------------------------------------------
    const { data: pendingConTessera, error: ptErr } = await supabase
        .from('registro_tesserati')
        .select('id_tesserato, numero_tessera_csen')
        .eq('sync_csen_status', 'PENDING')
        .not('numero_tessera_csen', 'is', null);

    if (!ptErr && pendingConTessera && pendingConTessera.length > 0) {
        console.log(`\n[FIX] Correzione ${pendingConTessera.length} record con numero tessera già valorizzato ma stato ancora PENDING...`);
        for (const rec of pendingConTessera) {
            await supabase
                .from('registro_tesserati')
                .update({ sync_csen_status: 'SYNCED', sync_csen_log: 'Stato corretto automaticamente: numero tessera già presente' })
                .eq('id_tesserato', rec.id_tesserato);
            console.log(`   - Corretto id_tesserato=${rec.id_tesserato} (tessera: ${rec.numero_tessera_csen})`);
        }
    }

    if (!tesserati || tesserati.length === 0) {
        console.log('\n✅ Nessun tesserato in attesa di sincronizzazione CSEN. Uscita.');
        process.exit(0);
    }

    console.log(`\nTrovati ${tesserati.length} atleti da sincronizzare su CSEN.`);

    // -------------------------------------------------------
    // STEP 3: Avvia browser Playwright e processa ogni atleta
    // -------------------------------------------------------
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Gestisci dialog automaticamente
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

        // Verifica che il login sia riuscito
        const afterLoginContent = await page.content();
        if (afterLoginContent.includes('affiliazionecsen') || afterLoginContent.toLowerCase().includes('errore') || afterLoginContent.toLowerCase().includes('password errata')) {
            throw new Error('Login CSEN fallito: credenziali non accettate o pagina di login ancora presente.');
        }
        console.log('   ✅ Login CSEN riuscito.');

        await page.click("input[value='GESTIONE SOCI TESSERATI']").catch(() => {
            console.log('   - (Pulsante GESTIONE SOCI TESSERATI non trovato, proseguo comunque)');
        });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });

        // -------------------------------------------------------
        // Loop per ogni atleta
        // -------------------------------------------------------
        for (const tess of tesserati) {
            const anag = tess.anagrafiche;
            if (!anag) {
                console.log(`\n>>> SKIP: id_tesserato ${tess.id_tesserato} - anagrafica mancante`);
                continue;
            }

            const cf = anag.codice_fiscale;
            const nomeCompleto = `${anag.nome} ${anag.cognome}`;
            console.log(`\n>>> Elaboro: ${nomeCompleto} (${cf})`);

            try {
                // Vai alla ricerca
                await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show', { timeout: 20000 });
                await page.waitForLoadState('networkidle', { timeout: 20000 });

                // Cerca per CF
                const searchInput = await page.$('input[name="q"]');
                if (searchInput) {
                    await searchInput.fill(cf);
                    await page.click("input[type='submit'][value='Cerca']");
                    await page.waitForLoadState('networkidle', { timeout: 20000 });
                }

                const pageSource = await page.content();
                let isRegistered = false;

                if (pageSource.includes('Nessun tesserato individuato')) {
                    // ---- SCENARIO: NUOVA REGISTRAZIONE ----
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

                    // Inserimento C.F. via JS (bypass calcolo e AdE)
                    await page.evaluate((val) => { document.getElementById('cf').value = val; }, cf);

                    // Qualifica
                    const certs = Array.isArray(anag.certificati_medici) ? anag.certificati_medici : [];
                    const haCertAgonistico = certs.some(c => c.tipologia === 'AGONISTICO' && c.stato_validazione === 'VERDE');
                    const qualifica = haCertAgonistico ? 'Atleta Agonista' : 'Atleta Praticante';
                    await page.selectOption('select[name="qualifica"]', { label: qualifica }).catch(() => console.log('   - Option qualifica non trovata'));

                    // Seleziona tutte le discipline (obbligatorio)
                    await page.evaluate(() => {
                        const cbs = document.querySelectorAll('input[type="checkbox"]');
                        cbs.forEach(cb => cb.checked = true);
                    });

                    // Tipo Tesseramento
                    const tipo = formattaTipoTesseramento(tess.livello_copertura);
                    await page.evaluate((t) => {
                        if (typeof Assegna === 'function') Assegna(t);
                    }, tipo).catch(() => { });

                    // Captcha se disponibile
                    await page.click('#Controlla').catch(() => { });
                    await page.waitForTimeout(2000);

                    if (process.env.CAPTCHA_API_KEY) {
                        try {
                            const captchaFrame = page.frameLocator('iframe[src*="cf_check.php"]');
                            const imgElement = captchaFrame.locator('#adeImg');
                            const imgSrc = await imgElement.getAttribute('src');
                            const base64Data = imgSrc.split(',')[1];
                            if (base64Data) {
                                const solvedText = await solveCaptcha(base64Data, process.env.CAPTCHA_API_KEY);
                                await captchaFrame.locator('#inCaptchaChars').fill(solvedText);
                                await captchaFrame.locator('button').click();
                                console.log('   - Validazione CF inviata. Attendo...');
                                await page.waitForTimeout(4000);
                            }
                        } catch (err) {
                            console.error('   - Errore risoluzione CAPTCHA:', err.message);
                        }
                    }

                    // Sblocca e invia form
                    await page.evaluate(() => {
                        const submitBtn = document.getElementById('mySubmit');
                        if (submitBtn) submitBtn.disabled = false;
                    });

                    await page.click('#mySubmit', { force: true });
                    await page.waitForLoadState('networkidle', { timeout: 20000 });

                    // Possibile tasto CONFERMA
                    try {
                        await page.click("input[value='CONFERMA']");
                        await page.waitForLoadState('networkidle', { timeout: 15000 });
                    } catch (e) { }

                    isRegistered = true;

                } else if (pageSource.includes('what=RESET')) {
                    // ---- SCENARIO: RINNOVO ----
                    console.log('   - Scenario: RINNOVO TESSERA');

                    await page.click("a[href*='what=RESET']");
                    await page.waitForLoadState('networkidle', { timeout: 20000 });

                    const tipo = formattaTipoTesseramento(tess.livello_copertura);
                    await page.evaluate((t) => {
                        if (typeof Assegna === 'function') Assegna(t);
                    }, tipo).catch(() => { });

                    await page.waitForTimeout(500);

                    await page.evaluate(() => {
                        const submitBtn = document.getElementById('mySubmit');
                        if (submitBtn) submitBtn.disabled = false;
                    });

                    await page.click('#mySubmit', { force: true });
                    await page.waitForLoadState('networkidle', { timeout: 20000 });

                    try {
                        await page.click("input[value='CONFERMA']");
                        await page.waitForLoadState('networkidle', { timeout: 15000 });
                    } catch (e) { }

                    isRegistered = true;

                } else {
                    // ---- SCENARIO: GIÀ REGISTRATO E ATTIVO ----
                    console.log('   - Scenario: GIÀ PRESENTE E ATTIVO su CSEN.');
                    isRegistered = true;
                }

                // -------------------------------------------------------
                // RECUPERO NUMERO TESSERA (per tutti gli scenari)
                // -------------------------------------------------------
                if (isRegistered) {
                    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show', { timeout: 20000 });
                    await page.waitForLoadState('networkidle', { timeout: 20000 });

                    const searchInputFinal = await page.$('input[name="q"]');
                    if (searchInputFinal) {
                        await searchInputFinal.fill(cf);
                        await page.click("input[type='submit'][value='Cerca']");
                        await page.waitForLoadState('networkidle', { timeout: 20000 });
                    }

                    const finalHtml = await page.content();
                    const match = finalHtml.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                    let nuovoNumero = null;

                    if (match && match[1]) {
                        nuovoNumero = match[1];
                        console.log(`   ✅ Tessera CSEN: ${nuovoNumero}`);
                    } else {
                        console.log(`   ⚠️ Numero tessera non estratto dall'HTML.`);
                    }

                    // Aggiorna DB: sempre SYNCED se isRegistered è true
                    const updatePayload = {
                        sync_csen_status: nuovoNumero ? 'SYNCED' : 'SYNCED_NO_NUM',
                        sync_csen_log: nuovoNumero
                            ? 'Sincronizzazione completata con successo'
                            : 'Registrato su CSEN ma numero tessera non estratto - verificare manualmente'
                    };
                    if (nuovoNumero) {
                        updatePayload.numero_tessera_csen = nuovoNumero;
                    }

                    await supabase
                        .from('registro_tesserati')
                        .update(updatePayload)
                        .eq('id_tesserato', tess.id_tesserato);

                    risultati.successi++;
                }

            } catch (err) {
                console.error(`   ❌ ERRORE durante elaborazione di ${nomeCompleto} (${cf}):`, err.message);

                await supabase
                    .from('registro_tesserati')
                    .update({
                        sync_csen_status: 'ERROR',
                        sync_csen_log: err.message.substring(0, 500)
                    })
                    .eq('id_tesserato', tess.id_tesserato);

                risultati.errori++;
                risultati.falliti.push({ nome: nomeCompleto, cf, errore: err.message.substring(0, 200) });
            }
        }

        // -------------------------------------------------------
        // Report finale
        // -------------------------------------------------------
        console.log('\n========================================');
        console.log('✅ Sincronizzazione massiva completata.');
        console.log(`   Successi: ${risultati.successi} / ${tesserati.length}`);
        console.log(`   Errori:   ${risultati.errori} / ${tesserati.length}`);
        console.log('========================================');

        // Invia alert se ci sono stati errori
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
                        <thead>
                            <tr>
                                <th style="padding:6px;border:1px solid #333;text-align:left">Nome</th>
                                <th style="padding:6px;border:1px solid #333;text-align:left">CF</th>
                                <th style="padding:6px;border:1px solid #333;text-align:left">Errore</th>
                            </tr>
                        </thead>
                        <tbody>${fallitiHtml}</tbody>
                    </table>
                    <p style="margin-top:15px;color:#9ca3af;font-size:12px">
                        Accedi al portale e controlla il tab "Logiche di Sistema" per i dettagli.
                    </p>
                </div>`
            );
        }

    } catch (err) {
        // Errore generale (es. login fallito, browser crash)
        console.error('\n❌ ERRORE GENERALE SCRIPT:', err.message);

        await sendAlertEmail(
            '🔴 CSEN SYNC FALLITO: Errore critico nel workflow',
            `<div style="font-family:monospace;background:#111;color:#fff;padding:20px;border-left:5px solid #df293e">
                <h2 style="color:#df293e">CSEN SYNC - ERRORE CRITICO</h2>
                <p><strong>Errore:</strong> ${err.message}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p>Il workflow di sincronizzazione CSEN è terminato prematuramente.<br>
                Possibili cause: credenziali CSEN errate, portale CSEN irraggiungibile, timeout Playwright.</p>
                <p>Verificare lo stato del portale CSEN e rilanciare manualmente dalla dashboard.</p>
            </div>`
        );

        process.exit(1);
    } finally {
        await browser.close();
    }
}

syncCsen();
