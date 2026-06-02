import { createClient } from '@supabase/supabase-js';

import fs from 'fs';
const configContent = fs.readFileSync('portal/config.js', 'utf8');
const urlMatch = configContent.match(/SUPABASE_URL: "(.*?)"/);
const keyMatch = configContent.match(/SUPABASE_KEY: "(.*?)"/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function runTest() {
    console.log("Testing signup for nexmny@gmail.com...");
    const { data, error } = await supabase.auth.signUp({
        email: 'nexmny@gmail.com',
        password: 'TestPassword123!',
        options: {
            data: {
                nome: 'Test',
                cognome: 'User'
            }
        }
    });

    if (error) {
        console.error("SIGNUP ERROR:", error.status, error.message);
    } else {
        console.log("SIGNUP SUCCESS:", data.user?.id);
    }
}

runTest();
