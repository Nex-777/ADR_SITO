import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function exportAndReconcile() {
    console.log("=== BULK EXPORT & RECONCILIATION SCAN ===");

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

    console.log(`Caricati ${dbAthletes.length} tesserati da Supabase.\n`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("1. Login sul portale CSEN...");
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('domcontentloaded');

        // Scansione di tutte le pagine dell'elenco CSEN
        console.log("2. Recupero elenco completo tesserati da CSEN...");
        const csenAthletesMap = new Map(); // cf -> { tessera, tipo, nome, cognome }

        let pageNum = 1;
        let hasNextPage = true;

        while (hasNextPage) {
            console.log(`   - Pagina ${pageNum}...`);
            await page.goto(`https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show&p=${pageNum}`);
            await page.waitForLoadState('domcontentloaded');

            const content = await page.content();
            if (content.includes('Nessun tesserato individuato') || content.includes('Nessun risultato')) {
                break;
            }

            // Estrarre tutti i blocchi tesserato nella pagina
            // Ciascun tesserato ha id tipo "tessXXXXX"
            const blocks = await page.$$('table[id^="tess"]');
            if (blocks.length === 0) {
                break;
            }

            for (const block of blocks) {
                const text = await block.innerText();
                const html = await block.innerHTML();

                const cfMatch = text.match(/C\.F\.\s*:\s*([A-Z0-9]{16})/i);
                const tessMatch = html.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                const tipoMatch = html.match(/Tipo\s*(?:<[^>]+>)*\s*([a-zA-Z0-9\s]+?)(?:<\/b>|<|\n|$)/i);

                if (cfMatch) {
                    const cf = cfMatch[1].trim().toUpperCase();
                    const tessera = tessMatch ? tessMatch[1].trim() : null;
                    const tipo = tipoMatch ? tipoMatch[1].trim() : 'N/D';

                    let mappedCoverage = tipo;
                    if (/Silver\s*A|Integrativa\s*A/i.test(tipo)) mappedCoverage = 'INTEGRATIVA_A';
                    else if (/Silver\s*B|Integrativa\s*B/i.test(tipo)) mappedCoverage = 'INTEGRATIVA_B';
                    else if (/Base\s*Silver|Base/i.test(tipo)) mappedCoverage = 'BASE';

                    csenAthletesMap.set(cf, {
                        cf,
                        tessera,
                        tipoRaw: tipo,
                        mappedCoverage
                    });
                }
            }

            // Verifica se esiste la pagina successiva
            const pageMatches = content.match(/<b>(\d+)<\/b>/g);
            if (!content.includes(`p=${pageNum + 1}`)) {
                hasNextPage = false;
            } else {
                pageNum++;
            }
        }

        console.log(`\n✓ Estratti ${csenAthletesMap.size} tesserati totali dal portale CSEN.\n`);

        // 3. Confronto con i tesserati locali
        console.log("=======================================================");
        console.log("=== RISULTATO RICONCILIAZIONE (DB LOCALE vs CSEN) ===");
        console.log("=======================================================");

        const mancantiSuCsen = [];
        const discrepanzeCopertura = [];
        const discrepanzeTessera = [];
        const okList = [];

        dbAthletes.forEach(tess => {
            const anag = tess.anagrafiche;
            if (!anag || !anag.codice_fiscale) return;

            const cf = anag.codice_fiscale.trim().toUpperCase();
            const name = `${anag.nome} ${anag.cognome}`.trim();
            const dbCov = tess.livello_copertura;
            const dbTess = tess.numero_tessera_csen;

            const csenData = csenAthletesMap.get(cf);

            if (!csenData) {
                mancantiSuCsen.push({
                    id: tess.id_tesserato,
                    reg: tess.numero_registro,
                    name,
                    cf,
                    dbTessera: dbTess,
                    dbCoverage: dbCov,
                    syncStatus: tess.sync_csen_status,
                    log: tess.sync_csen_log
                });
            } else {
                const tesseraIncongruente = csenData.tessera && dbTess !== csenData.tessera && !String(dbTess).startsWith('IT');
                const coperturaIncongruente = csenData.mappedCoverage !== 'N/D' && dbCov !== csenData.mappedCoverage;

                const info = {
                    id: tess.id_tesserato,
                    reg: tess.numero_registro,
                    name,
                    cf,
                    dbTessera: dbTess,
                    csenTessera: csenData.tessera,
                    dbCoverage: dbCov,
                    csenTipoRaw: csenData.tipoRaw,
                    csenMappedCoverage: csenData.mappedCoverage
                };

                if (coperturaIncongruente) {
                    discrepanzeCopertura.push(info);
                }
                if (tesseraIncongruente) {
                    discrepanzeTessera.push(info);
                }
                if (!coperturaIncongruente && !tesseraIncongruente) {
                    okList.push(info);
                }
            }
        });

        console.log(`Totale Tesserati Adrenalina: ${dbAthletes.length}`);
        console.log(`Totale Tesserati Trovati su CSEN: ${csenAthletesMap.size}`);
        console.log(`Tesserati Allineati OK: ${okList.length}`);
        console.log(`Tesserati MANCANTI su CSEN: ${mancantiSuCsen.length}`);
        console.log(`Discrepanze Copertura Assicurativa (DB vs CSEN): ${discrepanzeCopertura.length}`);
        console.log(`Discrepanze Numero Tessera: ${discrepanzeTessera.length}\n`);

        console.log("-------------------------------------------------------");
        console.log("1. ELENCO ATLETI MANCANTI SU CSEN (MAI COMUNICATI O IN ATTESA)");
        console.log("-------------------------------------------------------");
        console.table(mancantiSuCsen);

        console.log("\n-------------------------------------------------------");
        console.log("2. ELENCO DISCREPANZE COPERTURA ASSICURATIVA (DB vs CSEN)");
        console.log("-------------------------------------------------------");
        console.table(discrepanzeCopertura);

        console.log("\n-------------------------------------------------------");
        console.log("3. ELENCO DISCREPANZE NUMERO TESSERA");
        console.log("-------------------------------------------------------");
        console.table(discrepanzeTessera);

    } catch (err) {
        console.error("Errore export bulk:", err);
    } finally {
        await browser.close();
    }
}

exportAndReconcile();
