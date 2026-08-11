import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== PATCH MANUALE DOC IDENTITA SOFIA ===");
    
    // 1. Get anagrafica per Sofia Fidati
    const { data: anagrafiche, error: anagErr } = await supabase
        .from('anagrafiche')
        .select('*')
        .ilike('nome', 'Sofia')
        .ilike('cognome', 'Fidati');

    if (anagErr || !anagrafiche || anagrafiche.length === 0) {
        console.error("Errore fetch anagrafica Sofia:", anagErr);
        return;
    }
    
    const sofia = anagrafiche[0];
    console.log("Trovata anagrafica Sofia:", sofia.id, "utente_id:", sofia.utente_id);

    // 2. Upload del file in Storage
    // Prendo l'ultimo media allegato (Allegato 2 dovrebbe essere uno degli ultimi png)
    const filePath = 'C:/Users/argen/.gemini/antigravity/brain/81b472a8-d98b-4dc4-9b32-4df00e91ac9d/.user_uploaded/media_1786459300429.png';
    const fileBuffer = fs.readFileSync(filePath);

    const storagePath = `${sofia.utente_id}/personale_${Date.now()}.png`;
    
    console.log("Uploading a storage_path:", storagePath);
    const { error: uploadErr } = await supabase.storage
        .from('documenti_identita')
        .upload(storagePath, fileBuffer, {
            contentType: 'image/png',
            upsert: true
        });

    if (uploadErr) {
        console.error("Errore caricamento in storage:", uploadErr);
        return;
    }
    console.log("File caricato in Storage con successo.");

    // 3. Inserimento record in documenti_identita
    const record = {
        anagrafica_id: sofia.id,
        file_url: storagePath,
        tipologia: 'FRONTE_RETRO',
        tipo_documento: 'PERSONALE',
        data_scadenza: '2028-12-31',
        stato_validazione: 'IN_ATTESA'
    };

    const { error: insertErr } = await supabase
        .from('documenti_identita')
        .insert(record);

    if (insertErr) {
        console.error("Errore inserimento in documenti_identita:", insertErr);
    } else {
        console.log("Record inserito con successo in documenti_identita.");
    }
}

main();
