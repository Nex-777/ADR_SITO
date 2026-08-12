/**
 * fix_all_it_ghost_codes.js
 * 
 * Script generico che azzera TUTTI i codici IT... fantasma per atleti in stato PENDING.
 * Questi codici sono stati generati dalla funzione DB approva_tesserato() come ID temporanei
 * e non corrispondono a tessere reali sul portale CSEN.
 * 
 * Atleti con PENDING + IT... = mai comunicati a CSEN, ma la UI mostra codice cyan
 * impedendo all'amministratore di vedere lo stato "DA COMUNICARE" giallo corretto.
 * 
 * NON modifica stato_tesseramento, NON modifica livello_copertura, NON tocca atleti SYNCED.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixAllGhostCodes() {
    console.log('=================================================');
    console.log('FIX GENERICO: Azzera TUTTI i codici IT... fantasma');
    console.log(`Data: ${new Date().toISOString()}`);
    console.log('=================================================\n');

    // Trova tutti gli atleti PENDING con codice IT... ancora nel campo
    const { data: victims, error: fetchErr } = await supabase
        .from('registro_tesserati')
        .select('id_tesserato, numero_registro, numero_tessera_csen, livello_copertura, sync_csen_status, anagrafiche(nome, cognome)')
        .eq('sync_csen_status', 'PENDING')
        .ilike('numero_tessera_csen', 'IT%');

    if (fetchErr) {
        console.error('Errore fetch:', fetchErr.message);
        process.exit(1);
    }

    if (!victims || victims.length === 0) {
        console.log('✅ Nessun codice IT... fantasma da azzerare. Tutto pulito.');
        process.exit(0);
    }

    console.log(`Trovati ${victims.length} record con codice IT... fantasma in stato PENDING:\n`);
    victims.forEach(v => {
        const name = v.anagrafiche ? `${v.anagrafiche.nome} ${v.anagrafiche.cognome}` : 'N/D';
        console.log(`  - ${v.numero_registro} | ${name} | codice: ${v.numero_tessera_csen} | livello: ${v.livello_copertura}`);
    });
    console.log('');

    let successi = 0;
    let errori = 0;

    for (const v of victims) {
        const name = v.anagrafiche ? `${v.anagrafiche.nome} ${v.anagrafiche.cognome}` : 'N/D';
        const { error } = await supabase
            .from('registro_tesserati')
            .update({
                numero_tessera_csen: null,
                sync_csen_log: `MANUALE ${new Date().toISOString().split('T')[0]}: Codice fantasma ${v.numero_tessera_csen} azzerato. Pronto per nuova iscrizione CSEN.`
            })
            .eq('id_tesserato', v.id_tesserato);

        if (error) {
            console.error(`  ❌ Errore su ${v.numero_registro} (${name}): ${error.message}`);
            errori++;
        } else {
            console.log(`  ✅ ${v.numero_registro} | ${name} — azzerato`);
            successi++;
        }
    }

    console.log('\n=================================================');
    console.log(`Completato: ${successi} azzerati, ${errori} errori`);
    console.log('=================================================\n');
}

fixAllGhostCodes();
