import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== SOSTITUZIONE DOCUMENTO IDENTITÀ SOFIA FIDATI ===");

    // 1. Recupera anagrafica Sofia
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
    console.log("Anagrafica trovata:", sofia.id, "Utente ID:", sofia.utente_id);

    // 2. Carica la vera foto della Carta d'Identità su Supabase Storage
    const imagePath = 'C:/Users/argen/.gemini/antigravity/brain/81b472a8-d98b-4dc4-9b32-4df00e91ac9d/.user_uploaded/media_1786461764173.png';
    const fileBuffer = fs.readFileSync(imagePath);
    const storagePath = `${sofia.utente_id}/personale_${Date.now()}.png`;

    console.log("Caricamento immagine in Storage:", storagePath);
    const { error: uploadErr } = await supabase.storage
        .from('documenti_identita')
        .upload(storagePath, fileBuffer, {
            contentType: 'image/png',
            upsert: true
        });

    if (uploadErr) {
        console.error("Errore upload storage:", uploadErr);
        return;
    }
    console.log("Immagine caricata in Storage con successo.");

    // 3. Cancella o aggiorna i vecchi record errati in documenti_identita per pulizia
    const { data: existingDocs } = await supabase
        .from('documenti_identita')
        .select('*')
        .eq('anagrafica_id', sofia.id);

    if (existingDocs && existingDocs.length > 0) {
        for (const doc of existingDocs) {
            await supabase
                .from('documenti_identita')
                .update({ stato_validazione: 'ROSSO', note_ai: 'Sostituito con nuovo documento caricato' })
                .eq('id', doc.id);
        }
    }

    // 4. Inserisce il record definitivo ed ufficiale con la data di scadenza reale (08-06-2030)
    const newDocRecord = {
        anagrafica_id: sofia.id,
        file_url: storagePath,
        tipologia: 'FRONTE_RETRO',
        tipo_documento: 'PERSONALE',
        data_scadenza: '2030-06-08',
        stato_validazione: 'VERDE',
        note_ai: 'Documento d\'identità cartaceo ufficiale (AY 8900499) approvato.'
    };

    const { error: insertErr } = await supabase
        .from('documenti_identita')
        .insert(newDocRecord);

    if (insertErr) {
        console.error("Errore inserimento nuovo documento:", insertErr);
    } else {
        console.log("✓ Nuovo documento di identità inserito ed approvato (VERDE) con successo!");
    }
}

main();
