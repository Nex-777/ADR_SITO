import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            numero_registro,
            numero_tessera_csen,
            sync_csen_status,
            anagrafiche (nome, cognome, codice_fiscale)
        `)
        .order('id_tesserato', { ascending: false })
        .limit(10);

    console.log(JSON.stringify(data, null, 2));
}

run();
