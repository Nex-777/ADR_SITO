import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== SANATORIA MICHAEL MATERA ===");
    
    const anagId = '1e1446c8-d9c2-45a3-8dc8-f22f3997c888';
    const filePath = '9d521006-f7a3-4213-8700-c890dff21660/certificato_1787215104903.jpg';

    // 1. Verifica anagrafica
    const { data: anag, error: anagErr } = await supabase
        .from('anagrafiche')
        .select('id, nome, cognome, codice_fiscale')
        .eq('id', anagId)
        .single();

    if (anagErr || !anag) {
        console.error("Errore verifica anagrafica:", anagErr);
        process.exit(1);
    }
    console.log(`✓ Anagrafica trovata: ${anag.nome} ${anag.cognome} (${anag.codice_fiscale})`);

    // 2. Verifica presenza file in storage
    const { data: files, error: storageErr } = await supabase
        .storage
        .from('certificati_medici')
        .list('9d521006-f7a3-4213-8700-c890dff21660');

    if (storageErr) {
        console.error("Errore verifica storage:", storageErr);
        process.exit(1);
    }

    const fileFound = files.find(f => f.name === 'certificato_1787215104903.jpg');
    if (!fileFound) {
        console.error("File non trovato nel bucket certificati_medici:", filePath);
        process.exit(1);
    }
    console.log(`✓ File verificato in storage: ${filePath} (${(fileFound.metadata?.size / 1024 / 1024).toFixed(2)} MB)`);

    // 3. Controlla se il record per questo file_url esiste già
    const { data: existingCerts } = await supabase
        .from('certificati_medici')
        .select('id, file_url, stato_validazione, created_at')
        .eq('anagrafica_id', anagId)
        .eq('file_url', filePath);

    if (existingCerts && existingCerts.length > 0) {
        console.log(`Record certificato già esistente per questo file: ID ${existingCerts[0].id}, stato: ${existingCerts[0].stato_validazione}`);
        return existingCerts[0].id;
    }

    // 4. Inserimento record certificato
    const { data: newCert, error: insertErr } = await supabase
        .from('certificati_medici')
        .insert({
            anagrafica_id: anagId,
            tipologia: 'NON_AGONISTICO',
            data_rilascio: '2026-08-20',
            data_scadenza: '2027-08-20',
            medico_rilascio: 'In elaborazione AI...',
            file_url: filePath,
            stato_validazione: 'IN_ATTESA',
            note_ai: 'Sanatoria: file caricato da utente il 20/08/2026, record DB assente per bug UPDATE. Inserito manualmente.'
        })
        .select()
        .single();

    if (insertErr) {
        console.error("Errore inserimento certificato:", insertErr);
        process.exit(1);
    }

    console.log(`✓ Nuovo record certificato inserito con successo! ID: ${newCert.id}`);
    return newCert.id;
}

main().then(certId => {
    console.log("Sanatoria completata con successo. Cert ID:", certId);
    process.exit(0);
}).catch(err => {
    console.error("Errore sanatoria:", err);
    process.exit(1);
});
