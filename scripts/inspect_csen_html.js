import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;

async function inspectHtml() {
    console.log("=== INSPECT CSEN HTML FOR ATHLETE ===");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
    await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
    await page.fill('input[name="password"]', CSEN_PASS);
    await page.click('input[type="submit"]');
    await page.waitForLoadState('domcontentloaded');

    // Cerca Robert Miroslav
    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
    await page.waitForLoadState('domcontentloaded');
    await page.fill('input[name="q"]', 'MRSRRT01E21Z129W');
    await page.click("input[type='submit'][value='Cerca']");
    await page.waitForLoadState('domcontentloaded');

    const html = await page.content();
    console.log("--- HTML COMPLETO RISULTATO CERCA ---");
    console.log(html);

    await browser.close();
}

inspectHtml();
