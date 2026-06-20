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
    console.log("Esportazione direttivo...");
    
    // Auth users
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) throw authErr;
    
    // Utenti table
    const { data: utenti, error: utErr } = await supabase.from('utenti').select('*');
    if (utErr) throw utErr;
    
    // Anagrafiche
    const { data: anagrafiche, error: anagErr } = await supabase.from('anagrafiche').select('*');
    if (anagErr) throw anagErr;

    // Indirizzi
    const { data: indirizzi, error: indErr } = await supabase.from('indirizzi_residenza').select('*');
    if (indErr) throw indErr;

    // Contatti
    const { data: contatti, error: contErr } = await supabase.from('contatti').select('*');
    if (contErr) throw contErr;

    // Combine data
    const direttivo = authUsers.users.map(authUser => {
        const utente = utenti.find(u => u.id === authUser.id);
        const anagrafica = anagrafiche.find(a => a.utente_id === authUser.id) || {};
        const indirizzo = indirizzi.find(i => i.anagrafica_id === anagrafica.id) || {};
        const contatto = contatti.find(c => c.anagrafica_id === anagrafica.id) || {};

        return {
            auth: {
                id: authUser.id,
                email: authUser.email
            },
            utente: utente,
            anagrafica: anagrafica,
            indirizzo: indirizzo,
            contatto: contatto
        };
    });

    fs.writeFileSync('D:\\Antigravity_Projects\\ADR_SITO\\scratch\\direttivo_backup.json', JSON.stringify(direttivo, null, 2));
    console.log(`Esportati ${direttivo.length} membri in direttivo_backup.json`);
}

main().catch(console.error);
