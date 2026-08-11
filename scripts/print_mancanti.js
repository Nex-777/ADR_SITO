import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function printMancantiOnly() {
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
                nome,
                cognome,
                codice_fiscale
            )
        `)
        .or('numero_tessera_csen.is.null,numero_tessera_csen.ilike.IT%')
        .order('id_tesserato', { ascending: false });

    console.log(`=== ELENCO ATLETI CON TESSERA IT... O NULL (${dbAthletes.length} ATLETI) ===\n`);
    dbAthletes.forEach(a => {
        const name = a.anagrafiche ? `${a.anagrafiche.nome} ${a.anagrafiche.cognome}` : 'N/D';
        const cf = a.anagrafiche ? a.anagrafiche.codice_fiscale : 'N/D';
        console.log(`- Reg: [${a.numero_registro}] | ${name.padEnd(25)} | CF: ${cf} | DB Tessera: ${(a.numero_tessera_csen || 'NULL').padEnd(12)} | Copertura: ${a.livello_copertura} | SyncStatus: ${a.sync_csen_status}`);
        console.log(`  └─ Log: ${a.sync_csen_log || 'N/D'}`);
    });
}

printMancantiOnly();
