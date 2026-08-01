import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runSanatoriaNicolo() {
    console.log('Avvio sanatoria quota per Nicolò Rottura...');

    const userId = 'fd82b37f-21e0-48d2-ad48-42a3e2e49f97';
    
    // Aggiornamento quota_totale utenti (20.00 € per tessera_integrativa_a)
    const { error: userErr } = await supabase
        .from('utenti')
        .update({
            quota_totale: 20.00
        })
        .eq('id', userId);

    if (userErr) {
        console.error('Errore aggiornamento quota_totale utente:', userErr);
    } else {
        console.log('✓ Quota totale per Nicolò Rottura impostata a €20.00 con successo!');
    }
}

runSanatoriaNicolo();
