/**
 * fix_csen_coverage_and_ghost_codes.js
 * 
 * Script idempotente che:
 * 1. Azzera il codice IT... fantasma per Giulia Rughetti (id=165) e imposta livello INTEGRATIVA_B
 * 2. Azzera il codice IT... fantasma per Francesco Stuffer (id=180)
 * 3. Allinea il livello copertura di Paolo Alesi (CF: LSAPLA82R25H769H) a INTEGRATIVA_B
 * 
 * NON modifica stato_tesseramento, NON tocca atleti non citati.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERRORE: Variabili d\'ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY mancanti.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runFix() {
    console.log('=================================================');
    console.log('FIX CSEN COVERAGE & GHOST CODES');
    console.log(`Data esecuzione: ${new Date().toISOString()}`);
    console.log('=================================================\n');

    let errori = 0;

    // --------------------------------------------------
    // FIX 1: Giulia Rughetti (id_tesserato = 165)
    // - Azzera IT26463393 (codice fantasma mai registrato su CSEN)
    // - Corregge livello_copertura da BASE a INTEGRATIVA_B
    // - sync_csen_status rimane PENDING (già corretto da riconciliazione)
    // --------------------------------------------------
    console.log('[1/3] Fix Giulia Rughetti (id_tesserato=165)...');
    {
        // Prima leggiamo lo stato attuale per verifica
        const { data: before } = await supabase
            .from('registro_tesserati')
            .select('id_tesserato, numero_registro, numero_tessera_csen, livello_copertura, sync_csen_status')
            .eq('id_tesserato', 165)
            .single();

        if (!before) {
            console.error('   ❌ Record id_tesserato=165 non trovato! Verificare l\'ID.');
            errori++;
        } else {
            console.log(`   Stato prima: tessera=${before.numero_tessera_csen}, livello=${before.livello_copertura}, sync=${before.sync_csen_status}`);

            const { error } = await supabase
                .from('registro_tesserati')
                .update({
                    numero_tessera_csen: null,
                    livello_copertura: 'INTEGRATIVA_B',
                    sync_csen_status: 'PENDING',
                    sync_csen_log: 'MANUALE 2026-08-12: Codice fantasma IT26463393 azzerato. Livello corretto a INTEGRATIVA_B. Pronto per nuova iscrizione CSEN.'
                })
                .eq('id_tesserato', 165);

            if (error) {
                console.error('   ❌ Errore aggiornamento:', error.message);
                errori++;
            } else {
                // Rileggi per verifica
                const { data: after } = await supabase
                    .from('registro_tesserati')
                    .select('numero_tessera_csen, livello_copertura, sync_csen_status')
                    .eq('id_tesserato', 165)
                    .single();
                console.log(`   ✅ Stato dopo: tessera=${after.numero_tessera_csen}, livello=${after.livello_copertura}, sync=${after.sync_csen_status}`);
            }
        }
    }

    // --------------------------------------------------
    // FIX 2: Francesco Stuffer (id_tesserato = 180)
    // - Azzera IT26184624 (codice fantasma mai registrato su CSEN)
    // - livello_copertura rimane INTEGRATIVA_A (già corretto)
    // - sync_csen_status rimane PENDING (già corretto da riconciliazione)
    // --------------------------------------------------
    console.log('\n[2/3] Fix Francesco Stuffer (id_tesserato=180)...');
    {
        const { data: before } = await supabase
            .from('registro_tesserati')
            .select('id_tesserato, numero_registro, numero_tessera_csen, livello_copertura, sync_csen_status')
            .eq('id_tesserato', 180)
            .single();

        if (!before) {
            console.error('   ❌ Record id_tesserato=180 non trovato! Verificare l\'ID.');
            errori++;
        } else {
            console.log(`   Stato prima: tessera=${before.numero_tessera_csen}, livello=${before.livello_copertura}, sync=${before.sync_csen_status}`);

            const { error } = await supabase
                .from('registro_tesserati')
                .update({
                    numero_tessera_csen: null,
                    sync_csen_status: 'PENDING',
                    sync_csen_log: 'MANUALE 2026-08-12: Codice fantasma IT26184624 azzerato. Pronto per nuova iscrizione CSEN.'
                })
                .eq('id_tesserato', 180);

            if (error) {
                console.error('   ❌ Errore aggiornamento:', error.message);
                errori++;
            } else {
                const { data: after } = await supabase
                    .from('registro_tesserati')
                    .select('numero_tessera_csen, livello_copertura, sync_csen_status')
                    .eq('id_tesserato', 180)
                    .single();
                console.log(`   ✅ Stato dopo: tessera=${after.numero_tessera_csen}, livello=${after.livello_copertura}, sync=${after.sync_csen_status}`);
            }
        }
    }

    // --------------------------------------------------
    // FIX 3: Paolo Alesi (CF: LSAPLA82R25H769H, numero_registro: T_058_2026)
    // - livello_copertura BASE → INTEGRATIVA_B (allineamento con CSEN reale)
    // - sync_csen_status rimane SYNCED (tessera 1306502 reale, valida)
    // - numero_tessera_csen NON si tocca (1306502 è un numero reale CSEN)
    // --------------------------------------------------
    console.log('\n[3/3] Fix Paolo Alesi (CF: LSAPLA82R25H769H)...');
    {
        // Cerchiamo per CF tramite join anagrafiche per sicurezza
        const { data: tessRec } = await supabase
            .from('registro_tesserati')
            .select('id_tesserato, numero_registro, numero_tessera_csen, livello_copertura, sync_csen_status, anagrafiche!inner(codice_fiscale)')
            .eq('anagrafiche.codice_fiscale', 'LSAPLA82R25H769H')
            .single();

        if (!tessRec) {
            console.error('   ❌ Record per Paolo Alesi non trovato tramite CF LSAPLA82R25H769H!');
            errori++;
        } else {
            console.log(`   Trovato: id_tesserato=${tessRec.id_tesserato}, reg=${tessRec.numero_registro}`);
            console.log(`   Stato prima: tessera=${tessRec.numero_tessera_csen}, livello=${tessRec.livello_copertura}, sync=${tessRec.sync_csen_status}`);

            const { error } = await supabase
                .from('registro_tesserati')
                .update({
                    livello_copertura: 'INTEGRATIVA_B',
                    sync_csen_log: 'MANUALE 2026-08-12: Livello copertura allineato a INTEGRATIVA_B (conforme al tipo B registrato su CSEN).'
                })
                .eq('id_tesserato', tessRec.id_tesserato);

            if (error) {
                console.error('   ❌ Errore aggiornamento:', error.message);
                errori++;
            } else {
                const { data: after } = await supabase
                    .from('registro_tesserati')
                    .select('numero_tessera_csen, livello_copertura, sync_csen_status')
                    .eq('id_tesserato', tessRec.id_tesserato)
                    .single();
                console.log(`   ✅ Stato dopo: tessera=${after.numero_tessera_csen}, livello=${after.livello_copertura}, sync=${after.sync_csen_status}`);
            }
        }
    }

    console.log('\n=================================================');
    if (errori === 0) {
        console.log('✅ FIX COMPLETATO CON SUCCESSO — 0 errori');
    } else {
        console.log(`⚠️  FIX COMPLETATO CON ${errori} ERRORI — Verificare i log sopra`);
    }
    console.log('=================================================\n');
}

runFix();
