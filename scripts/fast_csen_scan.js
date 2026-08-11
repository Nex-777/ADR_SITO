import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runFastScan() {
    console.log("=== FAST CSEN PORTAL RECONCILIATION SCAN ===");

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

    console.log(`Caricati ${dbAthletes.length} tesserati da Supabase.`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("Login sul portale CSEN...");
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('domcontentloaded');
        console.log("✓ Login effettuato.");

        // 1. Specifica verifica Giulia Rughetti
        console.log("\n--- VERIFICA GIULIA RUGHETTI ---");
        const rughettiLocal = dbAthletes.find(a => a.anagrafiche && a.anagrafiche.codice_fiscale === 'RGHGLI04E43H501Q');
        if (rughettiLocal) {
            console.log(`Local DB Giulia Rughetti: reg=${rughettiLocal.numero_registro}, csen=${rughettiLocal.numero_tessera_csen}, sync=${rughettiLocal.sync_csen_status}, coverage=${rughettiLocal.livello_copertura}`);
        }

        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
        await page.waitForLoadState('domcontentloaded');
        await page.fill('input[name="q"]', 'RGHGLI04E43H501Q');
        await page.click("input[type='submit'][value='Cerca']");
        await page.waitForLoadState('domcontentloaded');
        const htmlRughetti = await page.content();
        const rughettiOnCsen = !htmlRughetti.includes('Nessun tesserato individuato');
        console.log(`Presente su CSEN Portal: ${rughettiOnCsen ? 'SÌ' : 'NO (MAI COMUNICATA)'}`);

        // 2. Controllo batch su tutti i tesserati
        console.log("\n--- AVVIO CONTROLLO BATCH TESSERATI ---");
        const report = {
            mancantiSuCsen: [],
            discrepanzeTessera: [],
            discrepanzeCopertura: [],
            ok: 0
        };

        let count = 0;
        for (const tess of dbAthletes) {
            count++;
            const anag = tess.anagrafiche;
            if (!anag || !anag.codice_fiscale) continue;

            const cf = anag.codice_fiscale;
            const name = `${anag.nome} ${anag.cognome}`;

            await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
            await page.waitForLoadState('domcontentloaded');
            
            const q = await page.$('input[name="q"]');
            if (q) {
                await q.fill(cf);
                await page.click("input[type='submit'][value='Cerca']");
                await page.waitForLoadState('domcontentloaded');
            }

            const html = await page.content();
            const found = !html.includes('Nessun tesserato individuato');

            if (!found) {
                report.mancantiSuCsen.push({
                    id: tess.id_tesserato,
                    reg: tess.numero_registro,
                    name,
                    cf,
                    dbTessera: tess.numero_tessera_csen,
                    dbCoverage: tess.livello_copertura,
                    syncStatus: tess.sync_csen_status
                });
                console.log(`[${count}/${dbAthletes.length}] ❌ ${name.padEnd(25)} | NON TROVATO SU CSEN (DB Tessera: ${tess.numero_tessera_csen || '-'})`);
            } else {
                // Estrarre tessera CSEN da HTML
                const numMatch = html.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                const csenNum = numMatch ? numMatch[1] : null;

                // Estrarre copertura da HTML CSEN
                let csenCov = 'UNKNOWN';
                if (html.includes('INTEGRATIVA B') || html.includes('SILVER B') || html.includes('TIPO B')) csenCov = 'INTEGRATIVA_B';
                else if (html.includes('INTEGRATIVA A') || html.includes('TIPO A')) csenCov = 'INTEGRATIVA_A';
                else if (html.includes('BASE') || html.includes('SILVER')) csenCov = 'BASE';

                const tesseraIncongruente = csenNum && tess.numero_tessera_csen !== csenNum && !String(tess.numero_tessera_csen).startsWith('IT');
                const coperturaIncongruente = csenCov !== 'UNKNOWN' && tess.livello_copertura !== csenCov;

                if (tesseraIncongruente) {
                    report.discrepanzeTessera.push({ name, cf, dbTessera: tess.numero_tessera_csen, csenTessera: csenNum });
                }
                if (coperturaIncongruente) {
                    report.discrepanzeCopertura.push({ name, cf, dbCoverage: tess.livello_copertura, csenCoverage: csenCov });
                }

                if (!tesseraIncongruente && !coperturaIncongruente) {
                    report.ok++;
                }

                console.log(`[${count}/${dbAthletes.length}] ✅ ${name.padEnd(25)} | CSEN: ${csenNum || 'n/a'} | DB Cov: ${tess.livello_copertura} | CSEN Cov: ${csenCov}`);
            }
        }

        console.log("\n=========================================");
        console.log("=== REPORT FINALE DISCREPANZE CSEN ===");
        console.log("=========================================");
        console.log(`Atleti allineati OK: ${report.ok}`);
        console.log(`Atleti MANCANTI su CSEN: ${report.mancantiSuCsen.length}`);
        console.log(`Discrepanze Numero Tessera: ${report.discrepanzeTessera.length}`);
        console.log(`Discrepanze Livello Copertura: ${report.discrepanzeCopertura.length}`);

        console.log("\n--- ELENCO MANCANTI SU CSEN ---");
        console.table(report.mancantiSuCsen);

        console.log("\n--- ELENCO DISCREPANZE COPERTURA ---");
        console.table(report.discrepanzeCopertura);

        console.log("\n--- ELENCO DISCREPANZE TESSERA ---");
        console.table(report.discrepanzeTessera);

    } catch (err) {
        console.error("Errore fast scan:", err);
    } finally {
        await browser.close();
    }
}

runFastScan();
