import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function formattaData(dataStr) {
    if (!dataStr) return '';
    // DB format: YYYY-MM-DD -> CSEN format: DD/MM/YYYY
    const [y, m, d] = dataStr.split('-');
    return `${d}/${m}/${y}`;
}

function formattaTipoTesseramento(livello) {
    if (livello === 'INTEGRATIVA_A') return 'A';
    if (livello === 'INTEGRATIVA_B') return 'B';
    return 'Base Silver'; // Fallback per BASE e altri
}
async function solveCaptcha(base64Data, apiKey) {
    const bodyParams = new URLSearchParams({
        key: apiKey,
        method: 'base64',
        body: base64Data,
        json: '1'
    });
    
    console.log("   - Invio CAPTCHA a 2Captcha...");
    const resIn = await fetch('https://2captcha.com/in.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
    });
    const jsonIn = await resIn.json();
    
    if (jsonIn.status !== 1) {
        throw new Error("Errore invio 2Captcha: " + jsonIn.request);
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
            throw new Error("Errore risoluzione 2Captcha: " + jsonOut.request);
        }
    }
    throw new Error("Timeout risoluzione CAPTCHA");
}
async function syncCsen() {
    console.log("Avvio Sincronizzazione CSEN (Active Sync)...");

    if (!CSEN_USER || !CSEN_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("ERRORE: Variabili d'ambiente mancanti. Verifica i Secrets su GitHub.");
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch up to 5 pending athletes
    const { data: tesserati, error: fetchErr } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            livello_copertura,
            anagrafica_id,
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
        .in('numero_registro', ['T_059_2026', 'T_060_2026', 'T_061_2026'])
        .order('numero_registro', { ascending: true });

    const livelloMap = {
        'BASE': "'Base Silver'",
        'A': "'A'",
        'B': "'B'"
    };

    if (fetchErr) {
        console.error("Errore fetch da Supabase:", fetchErr);
        process.exit(1);
    }

    if (!tesserati || tesserati.length === 0) {
        console.log("Nessun tesserato in attesa di sincronizzazione. Uscita.");
        process.exit(0);
    }

    console.log(`Trovati ${tesserati.length} atleti da sincronizzare.`);

    const browser = await chromium.launch({ headless: false, slowMo: 500 });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Ascolta eventuali alert bloccanti
    page.on('dialog', async dialog => {
        console.log(`\n[ALERT BROWSER] ${dialog.type()}: ${dialog.message()}`);
        await dialog.accept();
    });

    try {
        console.log("1. Login sul portale CSEN...");
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('networkidle');
        
        await page.click("input[value='GESTIONE SOCI TESSERATI']");
        await page.waitForLoadState('networkidle');

        for (const tess of tesserati) {
            const anag = tess.anagrafiche;
            if (!anag) continue;
            const cf = anag.codice_fiscale;
            const nomeCompleto = `${anag.nome} ${anag.cognome}`;
            console.log(`\n>>> Elaboro: ${nomeCompleto} (${cf})`);

            try {
                // Vai alla ricerca
                await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
                await page.waitForLoadState('networkidle');
                
                // Cerca CF
                const searchInput = await page.$('input[name="q"]');
                if (searchInput) {
                    await searchInput.fill(cf);
                    await page.click("input[type='submit'][value='Cerca']");
                    await page.waitForLoadState('networkidle');
                }

                const pageSource = await page.content();
                let isRegistered = false;

                if (pageSource.includes("Nessun tesserato individuato")) {
                    // --- NUOVO TESSERAMENTO ---
                    console.log(`   - Scenario: NUOVA REGISTRAZIONE`);
                    await page.click("img[src='pics/admin_add.jpg']");
                    await page.waitForLoadState('networkidle');

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
                            else console.log("Provincia non esatta: " + anag.provincia_nascita);
                        } catch(e) { console.log("Errore selezione Provincia"); }
                    }

                    await page.waitForTimeout(1000); // Wait for AJAX to populate comuni

                    // Comune Nascita
                    if (anag.comune_nascita) {
                        try {
                            const cOpts = await page.$$eval('#birthplace option', opts => opts.map(o => o.text));
                            const matchC = cOpts.find(o => o.trim().toUpperCase() === anag.comune_nascita.trim().toUpperCase());
                            if (matchC) await page.selectOption('#birthplace', { label: matchC });
                            else console.log("Comune non esatto: " + anag.comune_nascita);
                        } catch(e) { console.log("Errore selezione Comune"); }
                    }

                    // Inserimento C.F. (Bypass calcolo e AdE)
                    await page.evaluate((val) => { document.getElementById('cf').value = val; }, cf);

                    // Qualifica Tesserato
                    const certs = Array.isArray(anag.certificati_medici) ? anag.certificati_medici : [];
                    const haCertAgonistico = certs.some(c => c.tipologia === 'AGONISTICO' && c.stato_validazione === 'VERDE');
                    const qualifica = haCertAgonistico ? 'Atleta Agonista' : 'Atleta Praticante';
                    await page.selectOption('select[name="qualifica"]', { label: qualifica }).catch(e => console.log("Option qualifica non trovata"));

                    // Seleziona Tutte le discipline (Obbligatorio per non farsi respingere la form!)
                    await page.evaluate(() => {
                        const cbs = document.querySelectorAll('input[type="checkbox"]');
                        cbs.forEach(cb => cb.checked = true);
                    });

                    // Tipo Tesseramento (Chiamiamo Assegna via JS per impostarlo e nascondere il div coprente assegnawin)
                    const tipo = formattaTipoTesseramento(tess.livello_copertura);
                    await page.evaluate((t) => {
                        if(typeof Assegna === 'function') Assegna(t);
                    }, tipo).catch(e=>{});

                    // Clicchiamo sul tasto per mostrare la finestra di controllo CF (che carica l'iframe)
                    await page.click('#Controlla').catch(e => {});
                    await page.waitForTimeout(2000); // aspettiamo che l'iframe si carichi
                    
                    // Selezioniamo il frame del captcha robustamente usando frameLocator
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
                                console.log("   - Validazione CF inviata. Attendo...");
                                await page.waitForTimeout(4000); // tempo di attesa della risposta dall'AdE
                            }
                        } catch (err) {
                            console.error("   - Errore risoluzione CAPTCHA:", err.message);
                        }
                    }

                    // Abilitiamo comunque il tasto submit per sicurezza
                    await page.evaluate(() => {
                        const submitBtn = document.getElementById('mySubmit');
                        if(submitBtn) submitBtn.disabled = false;
                    });
                    
                    console.log(`   - Tasto submit sbloccato. Inserimento form...`);
                    await page.click('#mySubmit', { force: true });
                    await page.waitForLoadState('networkidle');
                    // Potrebbe esserci un tasto conferma
                    try { await page.click("input[value='CONFERMA']"); await page.waitForLoadState('networkidle'); } catch(e){}

                    isRegistered = true;
                } else if (pageSource.includes("what=RESET")) {
                    // --- RINNOVO ---
                    console.log(`   - Scenario: RINNOVO`);
                    await page.click("a[href*='what=RESET']");
                    await page.waitForLoadState('networkidle');

                    const tipo = formattaTipoTesseramento(tess.livello_copertura);
                    
                    // Selezione del bottoncino tipo tessera tramite iniezione JS (come fa il python)
                    await page.evaluate((t) => {
                        if(typeof Assegna === 'function') Assegna(t);
                    }, tipo).catch(e=>{});

                    await page.waitForTimeout(500);

                    // (Rimosso il click su Rinnova! perché causa navigazione non voluta)
                    
                    // Bypass Captcha
                    await page.evaluate(() => {
                        const submitBtn = document.getElementById('mySubmit');
                        if(submitBtn) submitBtn.disabled = false;
                    });
                    await page.click('#mySubmit', { force: true });
                    await page.waitForLoadState('networkidle');
                    try { await page.click("input[value='CONFERMA']"); await page.waitForLoadState('networkidle'); } catch(e){}

                    isRegistered = true;
                } else {
                    console.log(`   - L'utente esiste già e non ha la tessera scaduta. Nessuna azione CSEN necessaria.`);
                    isRegistered = true;
                }


                // RECUPERO NUMERO TESSERA REALE
                if (isRegistered) {
                    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
                    await page.waitForLoadState('networkidle');
                    const searchInputFinal = await page.$('input[name="q"]');
                    if (searchInputFinal) {
                        await searchInputFinal.fill(cf);
                        await page.click("input[type='submit'][value='Cerca']");
                        await page.waitForLoadState('networkidle');
                    }
                    const finalHtml = await page.content();
                    const match = finalHtml.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                    let nuovoNumero = null;
                    if (match && match[1]) {
                        nuovoNumero = match[1];
                        console.log(`   - OK: Registrato con Tessera n. ${nuovoNumero}`);
                    } else {
                        console.log(`   - ATTENZIONE: Salvato su CSEN ma non riesco a estrarre il numero tessera dall'HTML.`);
                    }

                    // Aggiorna DB
                    await supabase
                        .from('registro_tesserati')
                        .update({
                            numero_tessera_csen: nuovoNumero,
                            sync_csen_status: 'SYNCED',
                            sync_csen_log: nuovoNumero ? 'Sincronizzazione completata con successo' : 'Inserito su CSEN ma numero non estratto'
                        })
                        .eq('id_tesserato', tess.id_tesserato);
                }

            } catch (err) {
                console.error(`   - ❌ ERRORE durante elaborazione di ${cf}:`, err.message);
                try { await page.screenshot({ path: path.join(process.cwd(), 'scratch', `error_${cf}.png`) }); } catch(e){}
                await supabase
                    .from('registro_tesserati')
                    .update({
                        sync_csen_status: 'ERROR',
                        sync_csen_log: err.message
                    })
                    .eq('id_tesserato', tess.id_tesserato);
            }
        }

        console.log("\n✅ Sincronizzazione massiva completata.");

    } catch (err) {
        console.error("❌ Errore generale script:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

syncCsen();
