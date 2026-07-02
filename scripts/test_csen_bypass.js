import { chromium } from 'playwright';

const CSEN_USER = "17959";
const CSEN_PASS = "N3xAi2Csen";

async function extractJs() {
    console.log("Avvio estrazione JS CSEN...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('networkidle');

        await page.click("input[value='GESTIONE SOCI TESSERATI']");
        await page.waitForLoadState('networkidle');

        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
        await page.waitForLoadState('networkidle');
        
        await page.click("img[src='pics/admin_add.jpg']");
        await page.waitForLoadState('networkidle');

        const jsContent = await page.evaluate(() => {
            let result = "";
            if (typeof checkcf === 'function') result += "checkcf = " + checkcf.toString() + "\n\n";
            if (typeof PopUp === 'function') result += "PopUp = " + PopUp.toString() + "\n\n";
            if (typeof Trasferisci === 'function') result += "Trasferisci = " + Trasferisci.toString() + "\n\n";
            return result;
        });

        console.log("--- JAVASCRIPT FUNCTIONS ---");
        console.log(jsContent);
        
    } catch (err) {
        console.error("Errore:", err);
    } finally {
        await browser.close();
    }
}

extractJs();
