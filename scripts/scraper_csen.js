import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Configurazione da variabili d'ambiente (GitHub Secrets)
const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function scrapeCsen() {
    console.log("Avvio scraper CSEN...");
    
    if (!CSEN_USER || !CSEN_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("ERRORE: Variabili d'ambiente mancanti. Verifica i Secrets su GitHub.");
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("1. Navigazione alla pagina di login...");
        // Andiamo direttamente all'indirizzo principale del portale
        await page.goto('https://conceptstudio.it/website/csenascolipiceno/');
        
        console.log("2. Inserimento credenziali...");
        // Seleziona specificamente i campi del form CSEN
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        
        // Clicca sul pulsante "Entra"
        await page.click('input[type="submit"]');

        // Aspetta che la pagina si carichi completamente
        await page.waitForLoadState('networkidle');

        console.log("3. Accesso alla pagina tesserati...");
        await page.goto('https://conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
        await page.waitForTimeout(2000); // Pausa di sicurezza

        console.log("4. Estrazione dati tessere...");
        const htmlContent = await page.content();

        // Funzione per cercare nel codice HTML
        const extractResiduo = (html, type) => {
            const regex = new RegExp(`Ultimo accredito ${type}.*?Residuo:\\s*<b[^>]*>(\\d+)</b>`, 'i');
            const match = html.match(regex);
            return match ? parseInt(match[1], 10) : 0;
        };

        const silver = extractResiduo(htmlContent, 'Base Silver');
        const gold = extractResiduo(htmlContent, 'Base Gold');
        const intA = extractResiduo(htmlContent, 'Integrativa A');
        const intB = extractResiduo(htmlContent, 'Integrativa B');

        console.log(`Risultati: Silver=${silver}, Gold=${gold}, IntA=${intA}, IntB=${intB}`);

        console.log("5. Salvataggio su Supabase...");
        const { error } = await supabase
            .from('csen_status')
            .update({ 
                base_silver: silver, 
                base_gold: gold, 
                integrativa_a: intA, 
                integrativa_b: intB,
                last_updated: new Date().toISOString()
            })
            .eq('id', 1);

        if (error) throw error;

        console.log("✅ Scraping completato con successo!");

    } catch (err) {
        console.error("❌ Errore durante lo scraping:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapeCsen();
