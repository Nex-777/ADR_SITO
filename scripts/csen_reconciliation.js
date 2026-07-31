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

    // Trova tutti i tesserati con numero_tessera_csen = NULL oppure codice temporaneo IT... e stato:
    // - SYNCED_NO_NUM: registrati ma numero non ancora assegnato
    // - RENEWAL_SUBMITTED: rinnovo inviato, in attesa nuovo numero CSEN
    // - ERROR: tentativo di auto-recovery
    // NON include PENDING (gestiti da csen_sync_active.js)
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
        .or('numero_tessera_csen.is.null,numero_tessera_csen.ilike.IT%')
        .in('sync_csen_status', ['SYNCED_NO_NUM', 'RENEWAL_SUBMITTED', 'ERROR']);

    if (fetchErr) {
        console.error("Errore fetch da Supabase:", fetchErr);
        process.exit(1);
    }

    if (!atleti || atleti.length === 0) {
        console.log("Nessun atleta con numero tessera mancante/0 da sanare.");
        process.exit(0);
    }

    console.log(`Trovati ${atleti.length} atleti da verificare su CSEN.`);

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
                // Reset a PENDING per consentire il retry automatico nel sync attivo
                await supabase.from('registro_tesserati').update({
                    sync_csen_status: 'PENDING',
                    sync_csen_log: `Riconciliazione: utente mancante su CSEN (era ${tess.sync_csen_status}). Rimesso in PENDING per retry.`
                }).eq('id_tesserato', tess.id_tesserato);
                console.log(`   - 🔄 Reset a PENDING per retry automatico.`);
            } else {
                // Controlla stato tessera: deve essere attiva (non scaduta) per l'anno corrente
                const annoCorrente = new Date().getFullYear();
                const scadMatch = html.match(/Scade\s+il:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
                const annoScadenza = scadMatch ? parseInt(scadMatch[3], 10) : null;
                const tesseraScaduta = html.includes('TESSERA SCADUTA') || html.includes('Clicca per rinnovare');
                const esseraAttiva = annoScadenza !== null ? annoScadenza >= annoCorrente : !tesseraScaduta;

                // Estrarre il numero tessera
                const match = html.match(/N\.\s*Tessera:\s*(?:<[^>]+>)*([a-zA-Z0-9]+)/i);
                if (match && match[1] && match[1] !== '0') {
                    const numeroEstratto = match[1];

                    if (!esseraAttiva) {
                        // Tessera scaduta: non aggiornare numero, ma segnala che va rinnovata
                        console.log(`   - ⚠️ Trovato su CSEN ma tessera SCADUTA (anno ${annoScadenza}). Rimetto in PENDING per rinnovo.`);
                        await supabase
                            .from('registro_tesserati')
                            .update({
                                sync_csen_status: 'PENDING',
                                sync_csen_log: `Riconciliazione: tessera trovata ma scaduta (anno ${annoScadenza}). Rimesso in PENDING per rinnovo.`
                            })
                            .eq('id_tesserato', tess.id_tesserato);
                    } else {
                        // TESSERA ATTIVA — AUTO-HEALING!
                        console.log(`   - ✅ Trovato su CSEN! Tessera attiva: ${numeroEstratto} (scad. ${annoScadenza})`);
                        await supabase
                            .from('registro_tesserati')
                            .update({
                                numero_tessera_csen: numeroEstratto,
                                sync_csen_status: 'SYNCED',
                                sync_csen_log: `Auto-healing: tessera attiva ${numeroEstratto} (scad. ${annoScadenza}) recuperata da portale CSEN`
                            })
                            .eq('id_tesserato', tess.id_tesserato);
                        console.log(`   - 🏥 Auto-healing effettuato. Stato: SYNCED.`);
                        sanati++;
                    }
                } else {
                    console.log(`   - ⚠️ Trovato su CSEN ma numero tessera non estraibile o ancora 0. Riproverò al prossimo run.`);
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
