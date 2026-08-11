import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!CSEN_USER || !CSEN_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing credentials in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function scanCsenPortal() {
    console.log("=== START CSEN PORTAL RECONCILIATION SCAN ===");

    const { data: dbAthletes, error: dbErr } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            numero_registro,
            livello_copertura,
            numero_tessera_csen,
            stato_tesseramento,
            sync_csen_status,
            sync_csen_log,
            anagrafiche (
                id,
                nome,
                cognome,
                codice_fiscale
            )
        `)
        .order('id_tesserato', { ascending: false });

    if (dbErr) {
        console.error("Errore fetch Supabase:", dbErr);
        return;
    }

    console.log(`Caricati ${dbAthletes.length} tesserati dal database locale.`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("1. Login sul portale CSEN...");
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('networkidle');
        console.log("   ✓ Login effettuato con successo.");

        // Particolare focus su Giulia Rughetti
        console.log("\n2. Verifica Specifica per Giulia Rughetti (CF: RGHGLI04E43H501Q)...");
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
        await page.waitForLoadState('networkidle');
        
        const qInput = await page.$('input[name="q"]');
        if (qInput) {
            await qInput.fill('RGHGLI04E43H501Q');
            await page.click("input[type='submit'][value='Cerca']");
            await page.waitForLoadState('networkidle');
        }
        const rughettiContent = await page.content();
        const rughettiExistsOnCsen = !rughettiContent.includes('Nessun tesserato individuato');
        console.log(`   └─ Giulia Rughetti presente su CSEN: ${rughettiExistsOnCsen ? 'SÌ ✅' : 'NO ❌ (Mai comunicata)'}`);
        if (rughettiExistsOnCsen) {
            console.log("   └─ Dettagli HTML CSEN per Rughetti:\n", rughettiContent.substring(0, 1000));
        }

        console.log("\n3. Controllo Tesserati per Discrepanze Copertura e Numeri Tessera...");
        const mismatches = [];

        for (const tess of dbAthletes) {
            const anag = tess.anagrafiche;
            if (!anag || !anag.codice_fiscale) continue;

            const cf = anag.codice_fiscale;
            const nomeCompleto = `${anag.nome} ${anag.cognome}`;

            await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
            await page.waitForLoadState('networkidle');

            const sInput = await page.$('input[name="q"]');
            if (sInput) {
                await sInput.fill(cf);
                await page.click("input[type='submit'][value='Cerca']");
                await page.waitForLoadState('networkidle');
            }

            const pageText = await page.content();
            const exists = !pageText.includes('Nessun tesserato individuato');

            if (!exists) {
                mismatches.push({
                    name: nomeCompleto,
                    cf,
                    type: 'MANCANTE_SU_CSEN',
                    dbCoverage: tess.livello_copertura,
                    dbTessera: tess.numero_tessera_csen,
                    dbSyncStatus: tess.sync_csen_status,
                    csenInfo: 'Non trovato sul portale CSEN'
                });
            } else {
                // Estrarre tessera CSEN da HTML
                const numMatch = pageText.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                const numCsenPortal = numMatch ? numMatch[1] : null;

                // Estrarre tipo tesseramento / copertura da HTML
                let csenCoverage = 'N/D';
                if (pageText.includes('INTEGRATIVA B') || pageText.includes('TIPO B') || pageText.includes('SILVER B')) csenCoverage = 'INTEGRATIVA_B';
                else if (pageText.includes('INTEGRATIVA A') || pageText.includes('TIPO A')) csenCoverage = 'INTEGRATIVA_A';
                else if (pageText.includes('BASE') || pageText.includes('SILVER')) csenCoverage = 'BASE';

                const tesseraMismatch = numCsenPortal && tess.numero_tessera_csen !== numCsenPortal && !String(tess.numero_tessera_csen).startsWith('IT');
                const coverageMismatch = csenCoverage !== 'N/D' && tess.livello_copertura !== csenCoverage;

                if (tesseraMismatch || coverageMismatch || String(tess.numero_tessera_csen).startsWith('IT')) {
                    mismatches.push({
                        name: nomeCompleto,
                        cf,
                        type: 'DISCREPANZA_DATI',
                        dbCoverage: tess.livello_copertura,
                        csenCoverage,
                        dbTessera: tess.numero_tessera_csen,
                        csenTessera: numCsenPortal || 'Assente',
                        dbSyncStatus: tess.sync_csen_status,
                        tesseraMismatch,
                        coverageMismatch
                    });
                }
            }
        }

        console.log("\n=========================================");
        console.log("=== RISULTATO SCANSIONE DISCREPANZE ===");
        console.log("=========================================");
        console.log(JSON.stringify(mismatches, null, 2));

    } catch (err) {
        console.error("Errore durante la scansione:", err);
    } finally {
        await browser.close();
    }
}

scanCsenPortal();
