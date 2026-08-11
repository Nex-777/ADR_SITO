import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function printFullReport() {
    const { data: dbAthletes } = await supabase
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

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
    await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
    await page.fill('input[name="password"]', CSEN_PASS);
    await page.click('input[type="submit"]');
    await page.waitForLoadState('domcontentloaded');

    const csenAthletesMap = new Map();
    let pageNum = 1;
    while (true) {
        await page.goto(`https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show&p=${pageNum}`);
        await page.waitForLoadState('domcontentloaded');
        const content = await page.content();
        if (content.includes('Nessun tesserato individuato') || content.includes('Nessun risultato')) break;

        const blocks = await page.$$('table[id^="tess"]');
        if (blocks.length === 0) break;

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
                csenAthletesMap.set(cf, { cf, tessera, tipo });
            }
        }
        if (!content.includes(`p=${pageNum + 1}`)) break;
        pageNum++;
    }

    await browser.close();

    const mancanti = [];
    const presenti = [];

    dbAthletes.forEach(t => {
        const anag = t.anagrafiche;
        if (!anag || !anag.codice_fiscale) return;
        const cf = anag.codice_fiscale.trim().toUpperCase();
        const name = `${anag.nome} ${anag.cognome}`.trim();
        const csenData = csenAthletesMap.get(cf);

        if (!csenData) {
            mancanti.push({
                reg: t.numero_registro,
                nome: name,
                cf,
                dbTessera: t.numero_tessera_csen || 'ASSENTE',
                dbCopertura: t.livello_copertura,
                syncStatus: t.sync_csen_status,
                log: t.sync_csen_log || ''
            });
        } else {
            presenti.push({
                reg: t.numero_registro,
                nome: name,
                cf,
                dbTessera: t.numero_tessera_csen || 'ASSENTE',
                csenTessera: csenData.tessera || 'N/D',
                dbCopertura: t.livello_copertura,
                csenTipoRaw: csenData.tipo
            });
        }
    });

    console.log("=== MANCANTI SU CSEN PORTAL ===");
    console.log(JSON.stringify(mancanti, null, 2));

    console.log("\n=== PRESENTI SU CSEN PORTAL CON COPERTURA ===");
    console.log(JSON.stringify(presenti, null, 2));
}

printFullReport();
