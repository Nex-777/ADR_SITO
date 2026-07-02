import { chromium } from 'playwright';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
    await page.fill('input[name="affiliazionecsen"]', '17959');
    await page.fill('input[name="password"]', 'N3xAi2Csen');
    await page.click('input[type="submit"]');
    await page.waitForLoadState('networkidle');

    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
    await page.fill('input[name="q"]', 'MAIGLC95D23L219Z'); // Gianluca Aime
    await page.click("input[type='submit'][value='Cerca']");
    await page.waitForLoadState('networkidle');

    const html = await page.content();
    fs.writeFileSync('scratch/gianluca.html', html);
    
    // Also check new registration form
    await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=Inserisci');
    await page.waitForLoadState('networkidle');
    const newHtml = await page.content();
    fs.writeFileSync('scratch/new_registration.html', newHtml);

    await browser.close();
}

run();
