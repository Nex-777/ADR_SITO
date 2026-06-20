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
    console.log("Recupero utenti dal DB...");
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
        console.error("Errore Auth:", authErr);
        return;
    }
    
    const { data: anagrafiche, error: anagErr } = await supabase.from('anagrafiche').select('*');
    const { data: utenti, error: utentiErr } = await supabase.from('utenti').select('*');
    
    console.log("--- UTENTI AUTH ---");
    authUsers.users.forEach(u => console.log(u.email));
    
    console.log("\n--- TABELLA UTENTI (Ruoli) ---");
    console.log(utenti);
    
    console.log("\n--- ANAGRAFICHE ---");
    console.log(anagrafiche);
}
main();
