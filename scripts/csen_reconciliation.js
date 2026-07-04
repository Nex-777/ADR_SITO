import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const CSEN_USER = process.env.CSEN_USER;
const CSEN_PASS = process.env.CSEN_PASS;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendAlertEmail(subject, htmlBody) {
    if (!RESEND_API_KEY) return;
    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'Adrenalina Club <noreply@adrenalinaclub.it>',
                to: ['fabio.paoletti@adrenalinaclub.it'],
                subject,
                html: htmlBody,
            }),
        });
    } catch (e) { console.warn('[ALERT] Invio email fallito:', e.message); }
}


async function runReconciliation() {
    console.log("Avvio Riconciliazione e Auto-Healing CSEN...");

    if (!CSEN_USER || !CSEN_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("ERRORE: Variabili d'ambiente mancanti.");
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pulisci mismatch precedenti (opzionale, ma mantiene la tabella pulita)
    await supabase.from('csen_mismatches').delete().neq('id', 0);

    // Trova tutti i tesserati che hanno numero_tessera_csen = NULL e NON sono in stato PENDING
    // (quelli in PENDING vengono gestiti da csen_sync_active.js)
    const { data: atleti, error: fetchErr } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            numero_tessera_csen,
            sync_csen_status,
            anagrafiche (
                nome,
                cognome,
                codice_fiscale
            )
        `)
        .is('numero_tessera_csen', null)
        .neq('sync_csen_status', 'PENDING');

    if (fetchErr) {
        console.error("Errore fetch da Supabase:", fetchErr);
        process.exit(1);
    }

    if (!atleti || atleti.length === 0) {
        console.log("Nessun atleta con numero tessera mancante/0 da sanare.");
        process.exit(0);
    }

    console.log(`Trovati ${atleti.length} atleti da verificare su CSEN.`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("1. Login sul portale CSEN...");
        await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/');
        await page.fill('input[name="affiliazionecsen"]', CSEN_USER);
        await page.fill('input[name="password"]', CSEN_PASS);
        await page.click('input[type="submit"]');
        await page.waitForLoadState('networkidle');

        let sanati = 0;
        let mancanti = 0;

        for (const tess of atleti) {
            const anag = tess.anagrafiche;
            if (!anag || !anag.codice_fiscale) continue;

            const cf = anag.codice_fiscale;
            const nomeCompleto = `${anag.nome} ${anag.cognome}`;
            console.log(`\n>>> Controllo: ${nomeCompleto} (${cf})`);

            await page.goto('https://www.conceptstudio.it/website/csenascolipiceno/tesserati.asp?what=show');
            await page.waitForLoadState('networkidle');
            
            const searchInput = await page.$('input[name="q"]');
            if (searchInput) {
                await searchInput.fill(cf);
                await page.click("input[type='submit'][value='Cerca']");
                await page.waitForLoadState('networkidle');
            }

            const html = await page.content();
            
            if (html.includes("Nessun tesserato individuato")) {
                console.log(`   - ❌ NON TROVATO SU CSEN!`);
                mancanti++;
                // Registra in mismatches
                await supabase.from('csen_mismatches').insert({
                    mismatch_type: 'MISSING_IN_CSEN',
                    nominativo: nomeCompleto,
                    codice_fiscale: cf,
                    dettagli: { id_tesserato: tess.id_tesserato }
                });
            } else {
                // Estrarre il numero tessera
                const match = html.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                if (match && match[1]) {
                    const numeroEstratto = match[1];
                    console.log(`   - ✅ Trovato su CSEN! Numero Tessera: ${numeroEstratto}`);
                    
                    if (numeroEstratto !== '0') {
                        // AUTO-HEALING!
                        await supabase
                            .from('registro_tesserati')
                            .update({ numero_tessera_csen: numeroEstratto })
                            .eq('id_tesserato', tess.id_tesserato);
                        console.log(`   - 🏥 Auto-healing effettuato. Database aggiornato.`);
                        sanati++;
                    } else {
                        console.log(`   - ⚠️ Su CSEN il numero tessera è ancora 0!`);
                    }
                } else {
                    console.log(`   - ⚠️ Trovato su CSEN ma impossibile estrarre il numero tessera.`);
                }
            }
        }

        console.log(`\n✅ Riconciliazione completata.`);
        console.log(`   - Atleti sanati (Auto-Healed): ${sanati}`);
        console.log(`   - Atleti non trovati su CSEN: ${mancanti}`);

        if (mancanti > 0) {
            await sendAlertEmail(
                `⚠️ CSEN Riconciliazione: ${mancanti} atleti non trovati su CSEN`,
                `<div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:20px;border-left:5px solid #eab308">
                    <h2 style="color:#eab308">CSEN - ATLETI MANCANTI</h2>
                    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                    <p>${mancanti} atleti con numero tessera NULL sono risultati MANCANTI sul portale CSEN.</p>
                    <p>Verificare i dettagli nella tabella <code>csen_mismatches</code> su Supabase o nella dashboard portale.</p>
                </div>`
            );
        }

    } catch (err) {
        console.error("❌ Errore generale script:", err);
    } finally {
        await browser.close();
    }
}

runReconciliation();
