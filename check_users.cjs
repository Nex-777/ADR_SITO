const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'd:/Antigravity_Projects/ADR_SITO/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
    const { data, error } = await supabaseClient.from('utenti').select('id, email, ruolo');
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

checkUsers();
