const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configurazione
const ENV_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\.env';
const REPORT_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\scratch\\migration_report.json';

// Funzione rudimentale per leggere il file .env se dotenv non è installato
function loadEnv() {
    try {
        const envContent = fs.readFileSync(ENV_FILE, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                process.env[match[1].trim()] = match[2].trim();
            }
        });
    } catch (e) {
        console.error("Errore caricamento .env:", e.message);
    }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Variabili d'ambiente SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti.");
    process.exit(1);
}

// Inizializza Supabase con la Service Role Key per bypassare la RLS
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
    let reportData;
    try {
        reportData = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
    } catch (e) {
        console.error("Errore lettura report:", e.message);
        process.exit(1);
    }

    const records = reportData.valid_records;
    console.log(`Inizio importazione di ${records.length} record in Supabase...`);

    let successCount = 0;
    let errorCount = 0;

    for (const record of records) {
        const data = record.parsed_data;
        const rowNum = record.original_row;
        
        console.log(`\nImportazione riga ${rowNum}: ${data.anagrafica.nome} ${data.anagrafica.cognome}`);

        try {
            // 1. INSERISCI ANAGRAFICA
            const { data: anagData, error: anagError } = await supabase
                .from('anagrafiche')
                .insert([data.anagrafica])
                .select('id')
                .single();

            if (anagError) {
                // Se c'è già il CF, magari ignoriamo e andiamo avanti
                if (anagError.code === '23505') { 
                    console.log(`  - SALTA: Codice fiscale ${data.anagrafica.codice_fiscale} già presente.`);
                    errorCount++;
                    continue; 
                }
                throw new Error(`Errore Anagrafiche: ${anagError.message}`);
            }

            const anagraficaId = anagData.id;
            console.log(`  - Anagrafica creata (ID: ${anagraficaId})`);

            // 2. INSERISCI INDIRIZZO
            const indirizzo = { ...data.indirizzo, anagrafica_id: anagraficaId };
            const { error: indError } = await supabase.from('indirizzi_residenza').insert([indirizzo]);
            if (indError) throw new Error(`Errore Indirizzo: ${indError.message}`);

            // 3. INSERISCI CONTATTI
            const contatti = { ...data.contatti, anagrafica_id: anagraficaId };
            const { error: contError } = await supabase.from('contatti').insert([contatti]);
            // Ignoriamo gli errori di email check regexp per procedere con gli altri
            if (contError) {
                console.warn(`  - Avviso Contatti: ${contError.message} (Skipped)`);
            } else {
                console.log(`  - Indirizzo e Contatti inseriti.`);
            }

            // 4. INSERISCI REGISTRO TESSERATI (Salta Registro Soci)
            const tesserato = { ...data.registro_tesserati, anagrafica_id: anagraficaId };
            const { error: tessError } = await supabase.from('registro_tesserati').insert([tesserato]);
            if (tessError) throw new Error(`Errore Tesserato: ${tessError.message}`);
            console.log(`  - Registro Tesserati aggiornato.`);

            // 5. INSERISCI CERTIFICATO MEDICO (se presente)
            if (data.certificato) {
                const cert = { ...data.certificato, anagrafica_id: anagraficaId };
                const { error: certError } = await supabase.from('certificati_medici').insert([cert]);
                if (certError) throw new Error(`Errore Certificato: ${certError.message}`);
                console.log(`  - Certificato Medico inserito.`);
            }

            successCount++;
        } catch (e) {
            console.error(`  - ❌ ERRORE CRITICO alla riga ${rowNum}:`, e.message);
            // Idealmente bisognerebbe fare il rollback manuale cancellando l'anagrafica
            errorCount++;
        }
    }

    console.log(`\n=== IMPORTAZIONE COMPLETATA ===`);
    console.log(`✅ Successo: ${successCount}`);
    console.log(`❌ Errori: ${errorCount}`);
}

main();
