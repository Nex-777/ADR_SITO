import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCerts() {
    const { data: athletes } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato, numero_registro, sync_csen_status, sync_csen_log,
            anagrafiche (
                nome, cognome, codice_fiscale, data_nascita,
                certificati_medici (
                    tipologia, stato_validazione, data_scadenza
                )
            )
        `)
        .in('numero_registro', ['T_104_2026', 'T_119_2026']);

    console.log(JSON.stringify(athletes, null, 2));
}

checkCerts();
