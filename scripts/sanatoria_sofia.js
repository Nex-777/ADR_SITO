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
    console.log("=== SANATORIA SOFIA FIDATI ===");
    
    // 1. Aggiorna documento d'identità caricato erroneamente (certificato medico nello slot doc)
    const docId = 'a8815999-7c87-42dd-b441-40eed9b9f475';
    const { error: docErr } = await supabase
        .from('documenti_identita')
        .update({
            note_ai: "L'utente ha caricato per errore il certificato medico al posto del documento d'identità."
        })
        .eq('id', docId);

    if (docErr) console.error("Errore aggiornamento doc Sofia:", docErr);
    else console.log("Note documento d'identità Sofia aggiornate con successo.");

    // 2. Aggiorna certificato medico di Sofia (PDF senza miniatura)
    const sofiaAnagId = 'dc92e4ab-30c2-4809-be8b-b87c71f92e07';
    const { data: certs } = await supabase
        .from('certificati_medici')
        .select('*')
        .eq('anagrafica_id', sofiaAnagId);

    if (certs && certs.length > 0) {
        for (const cert of certs) {
            if (cert.stato_validazione === 'GIALLO') {
                const { error: certErr } = await supabase
                    .from('certificati_medici')
                    .update({
                        note_ai: 'File PDF senza miniatura. Richiesta revisione manuale.'
                    })
                    .eq('id', cert.id);
                if (certErr) console.error("Errore aggiornamento cert Sofia:", certErr);
                else console.log(`Note certificato medico ${cert.id} di Sofia aggiornate con successo.`);
            }
        }
    }

    console.log("Sanatoria completata!");
}

main();
