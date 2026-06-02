import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
    'https://zpategmkelqmexetpaot.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYXRlZ21rZWxxbWV4ZXRwYW90Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcyOTQ0MCwiZXhwIjoyMDk1MzA1NDQwfQ.fx2Mj-0xanzOzYfEWjRMMFDP-aAVmFYMkxiWq-WvCNI'
);

async function test() {
    const { data, error } = await supabaseClient
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            numero_tessera_csen,
            stato_tesseramento,
            livello_copertura,
            data_richiesta_tesseramento,
            anagrafiche (
                id,
                utente_id,
                nome,
                cognome,
                codice_fiscale,
                data_nascita,
                comune_nascita,
                provincia_nascita,
                sesso,
                indirizzi_residenza (
                    via_piazza,
                    civico,
                    comune,
                    provincia,
                    cap
                ),
                contatti (
                    telefono,
                    email
                ),
                certificati_medici (
                    id,
                    tipologia,
                    data_rilascio,
                    data_scadenza,
                    medico_rilascio,
                    file_url,
                    stato_validazione,
                    note_ai,
                    confidence_score
                )
            )
        `);

    console.log("Error:", error);
    console.log("Data size:", data ? data.length : 0);
    if (data && data.length > 0) {
        console.log("Sample row:", JSON.stringify(data[data.length - 1], null, 2));
    }
}

test();
