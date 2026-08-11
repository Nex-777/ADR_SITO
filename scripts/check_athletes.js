import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("=== 1. INFORMAZIONI SU GIULIA RUGHETTI ===");
    const { data: rughetti, error: rughettiErr } = await supabase
        .from('registro_tesserati')
        .select(`
            *,
            anagrafiche (
                id,
                utente_id,
                nome,
                cognome,
                codice_fiscale,
                utenti (*)
            )
        `);

    if (rughettiErr) {
        console.error("Errore fetch:", rughettiErr);
        return;
    }

    const targetRughetti = rughetti.filter(t => t.anagrafiche && (t.anagrafiche.cognome || '').toUpperCase().includes('RUGHETTI'));
    console.log("Record Giulia Rughetti nel DB:", JSON.stringify(targetRughetti, null, 2));

    console.log("\n=== 2. TUTTI I TESSERATI DIVISI PER LIVELLO COPERTURA ===");
    const summary = {};
    rughetti.forEach(t => {
        const cov = t.livello_copertura || 'NON_SPECIFICATO';
        if (!summary[cov]) summary[cov] = [];
        const name = t.anagrafiche ? `${t.anagrafiche.nome} ${t.anagrafiche.cognome}` : 'N/D';
        const cf = t.anagrafiche ? t.anagrafiche.codice_fiscale : 'N/D';
        summary[cov].push({
            id: t.id_tesserato,
            reg: t.numero_registro,
            name,
            cf,
            csen: t.numero_tessera_csen || '-',
            stato: t.stato_tesseramento,
            sync: t.sync_csen_status,
            log: t.sync_csen_log
        });
    });

    for (const [cov, list] of Object.entries(summary)) {
        console.log(`\n========================================`);
        console.log(`LIVELLO COPERTURA: [${cov}] (${list.length} atleti)`);
        console.log(`========================================`);
        list.forEach(a => {
            console.log(`[${a.reg || 'T_PND'}] ${a.name.padEnd(25)} | CF: ${a.cf} | CSEN: ${a.csen.padEnd(12)} | STATO: ${a.stato.padEnd(15)} | SYNC: ${a.sync || '-'}`);
            if (a.log) console.log(`   └─ LOG: ${a.log}`);
        });
    }
}

run();

