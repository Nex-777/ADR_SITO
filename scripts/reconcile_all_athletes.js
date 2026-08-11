import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runParallelReconciliation() {
    console.log("=== PARALLEL CSEN RECONCILIATION SCAN ===");

    const { data: dbAthletes, error } = await supabase
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

    if (error) {
        console.error("Errore Supabase:", error);
        return;
    }

    console.log(`Caricati ${dbAthletes.length} tesserati da Supabase.\n`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const report = {
        total: dbAthletes.length,
        mancantiSuCsen: [],
        discrepanzeTessera: [],
        discrepanzeCopertura: [],
        allineati: []
    };

    // Helper per controllare singolo atleta
    async function checkAthlete(page, tess, index) {
        const anag = tess.anagrafiche;
        if (!anag || !anag.codice_fiscale) return;

        const cf = anag.codice_fiscale.trim();
        const name = `${anag.nome} ${anag.cognome}`.trim();

        try {
            await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show', { waitUntil: 'commit' });
            await page.fill('input[name="q"]', cf);
            await page.click("input[type='submit'][value='Cerca']");
            await page.waitForLoadState('domcontentloaded');

            const html = await page.content();
            const exists = !html.includes('Nessun tesserato individuato');

            if (!exists) {
                report.mancantiSuCsen.push({
                    id: tess.id_tesserato,
                    reg: tess.numero_registro,
                    name,
                    cf,
                    dbTessera: tess.numero_tessera_csen,
                    dbCoverage: tess.livello_copertura,
                    syncStatus: tess.sync_csen_status,
                    log: tess.sync_csen_log
                });
                console.log(`[${index}/${dbAthletes.length}] ❌ ${name.padEnd(28)} | MANCANTE SU CSEN (DB Tessera: ${tess.numero_tessera_csen || '-'})`);
            } else {
                const tesseraMatch = html.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                const csenTesseraNum = tesseraMatch ? tesseraMatch[1] : null;

                const tipoMatch = html.match(/Tipo\s*(?:<[^>]+>)*\s*([a-zA-Z0-9\s]+?)(?:<\/b>|<|\n|$)/i);
                const csenTipoRaw = tipoMatch ? tipoMatch[1].trim() : 'N/D';

                const dbTessera = tess.numero_tessera_csen;
                const dbCoverage = tess.livello_copertura;

                const tesseraMismatch = csenTesseraNum && dbTessera !== csenTesseraNum && !String(dbTessera).startsWith('IT');
                
                let csenMappedCoverage = csenTipoRaw;
                if (/Silver\s*A|Integrativa\s*A/i.test(csenTipoRaw)) csenMappedCoverage = 'INTEGRATIVA_A';
                else if (/Silver\s*B|Integrativa\s*B/i.test(csenTipoRaw)) csenMappedCoverage = 'INTEGRATIVA_B';
                else if (/Base\s*Silver|Base/i.test(csenTipoRaw)) csenMappedCoverage = 'BASE';

                const coverageMismatch = csenMappedCoverage !== 'N/D' && dbCoverage !== csenMappedCoverage;

                const recordInfo = {
                    id: tess.id_tesserato,
                    reg: tess.numero_registro,
                    name,
                    cf,
                    dbTessera,
                    csenTessera: csenTesseraNum,
                    dbCoverage,
                    csenTipoRaw,
                    csenMappedCoverage
                };

                if (tesseraMismatch) {
                    report.discrepanzeTessera.push(recordInfo);
                }
                if (coverageMismatch) {
                    report.discrepanzeCopertura.push(recordInfo);
                }

                if (!tesseraMismatch && !coverageMismatch) {
                    report.allineati.push(recordInfo);
                }

                console.log(`[${index}/${dbAthletes.length}] ✅ ${name.padEnd(28)} | CSEN Tessera: ${csenTesseraNum || 'N/D'} | Tipo CSEN: ${csenTipoRaw} | DB Cov: ${dbCoverage}`);
            }
        } catch (err) {
            console.error(`Error checking ${name}:`, err.message);
        }
    }

    // Dividi gli atleti in chunk paralleli
    const CONCURRENCY = 5;
    const context = await browser.newContext();
    
    // Login in 1 page first to establish session cookies
    const loginPage = await context.newPage();
    await loginPage.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
    await loginPage.fill('input[name="affiliazionecsen"]', CSEN_USER);
    await loginPage.fill('input[name="password"]', CSEN_PASS);
    await loginPage.click('input[type="submit"]');
    await loginPage.waitForLoadState('domcontentloaded');
    console.log("✓ Login effettuato su CSEN.\n");

    const pages = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        pages.push(await context.newPage());
    }

    for (let i = 0; i < dbAthletes.length; i += CONCURRENCY) {
        const chunk = dbAthletes.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((tess, idxInChunk) => {
            const pageIndex = idxInChunk % CONCURRENCY;
            return checkAthlete(pages[pageIndex], tess, i + idxInChunk + 1);
        }));
    }

    console.log("\n=======================================================");
    console.log("=== RESOCONTO FINALE SCANSIONE RICONCILIAZIONE ===");
    console.log("=======================================================");
    console.log(`Totale Tesserati DB: ${report.total}`);
    console.log(`Tesserati Allineati OK: ${report.allineati.length}`);
    console.log(`Tesserati MANCANTI su CSEN: ${report.mancantiSuCsen.length}`);
    console.log(`Discrepanze Tessera: ${report.discrepanzeTessera.length}`);
    console.log(`Discrepanze Copertura Assicurativa: ${report.discrepanzeCopertura.length}`);

    console.log("\n-------------------------------------------------------");
    console.log("1. ATLETI MAI COMUNICATI O MANCANTI SU CSEN PORTAL");
    console.log("-------------------------------------------------------");
    console.table(report.mancantiSuCsen);

    console.log("\n-------------------------------------------------------");
    console.log("2. ATLETI CON DISCREPANZA COPERTURA (DB vs PORTALE CSEN)");
    console.log("-------------------------------------------------------");
    console.table(report.discrepanzeCopertura);

    console.log("\n-------------------------------------------------------");
    console.log("3. ATLETI CON DISCREPANZA NUMERO TESSERA (DB vs PORTALE CSEN)");
    console.log("-------------------------------------------------------");
    console.table(report.discrepanzeTessera);

    await browser.close();
}

runParallelReconciliation();
