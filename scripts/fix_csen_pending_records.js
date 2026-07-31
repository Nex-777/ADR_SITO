import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wuxdlnmoxztslyevrybd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERRORE: SUPABASE_SERVICE_ROLE_KEY mancante nel file .env!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function repairData() {
    console.log("=========================================");
    console.log("Avvio Ripristino Pratiche CSEN Bloccate...");
    console.log("=========================================");

    // 1. Cerca pratiche impattate (stato SYNCED con codice IT...)
    const { data: records, error: fetchErr } = await supabase
        .from('registro_tesserati')
        .select(`
            id_tesserato,
            numero_tessera_csen,
            sync_csen_status,
            data_richiesta_tesseramento,
            anagrafiche ( nome, cognome, codice_fiscale )
        `)
        .eq('sync_csen_status', 'SYNCED')
        .ilike('numero_tessera_csen', 'IT%');

    if (fetchErr) {
        console.error("Errore recupero record:", fetchErr);
        process.exit(1);
    }

    if (!records || records.length === 0) {
        console.log("Nessun record bloccato in stato SYNCED con codice IT... trovato.");
        process.exit(0);
    }

    console.log(`Trovati ${records.length} record bloccati:`);
    records.forEach(r => {
        console.log(` - ID ${r.id_tesserato}: ${r.anagrafiche?.nome} ${r.anagrafiche?.cognome} (Codice: ${r.numero_tessera_csen}, Richiesta: ${r.data_richiesta_tesseramento})`);
    });

    // 2. Esegui reset a PENDING con numero_tessera_csen = null
    const idsToUpdate = records.map(r => r.id_tesserato);
    const { error: updateErr } = await supabase
        .from('registro_tesserati')
        .update({
            sync_csen_status: 'PENDING',
            numero_tessera_csen: null,
            sync_csen_log: 'Reset automatico da SYNCED a PENDING: codice temporaneo IT rimosso per sincronizzazione CSEN reale (fix v1.03.57)'
        })
        .in('id_tesserato', idsToUpdate);

    if (updateErr) {
        console.error("Errore durante l'aggiornamento dei record:", updateErr);
        process.exit(1);
    }

    console.log(`\n✅ Ripristinati con successo ${records.length} record a PENDING!`);
    console.log("Tutte le pratiche verranno sincronizzate ed aggiornate al prossimo run di CSEN Sync.");
}

repairData();
