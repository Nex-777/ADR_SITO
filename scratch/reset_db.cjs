const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
    const envContent = fs.readFileSync('D:\\Antigravity_Projects\\ADR_SITO\\.env', 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
}
loadEnv();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
    console.log("Inizio Hard Reset...");
    
    // 1. Truncate tabelle prima dell'Auth per evitare FK constraints
    const tables = [
        'certificati_medici',
        'registro_tesserati',
        'registro_soci',
        'contatti',
        'indirizzi_residenza',
        'anagrafiche',
        'utenti' 
    ];

    for (const table of tables) {
        console.log(`Cancellazione dati tabella: ${table}`);
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.log(`Errore table ${table}:`, error.message || error);
    }
    
    // 2. Cancella utenti Auth
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) throw authErr;
    
    for (const u of authUsers.users) {
        console.log(`Cancellazione Auth User: ${u.email}`);
        const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
        if (delErr) {
            console.error("Errore cancellazione:", delErr.message || delErr.status || JSON.stringify(delErr));
        } else {
            console.log("OK.");
        }
    }

    console.log("Reset completato.");
}

main().catch(console.error);
