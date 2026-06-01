import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
    'https://zpategmkelqmexetpaot.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYXRlZ21rZWxxbWV4ZXRwYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjk0NDAsImV4cCI6MjA5NTMwNTQ0MH0.jeRMwUwK5GQXKiiZNIJlag3oeWej_rTg8EaYZi4QhpM'
);

async function test() {
    const { data, error } = await supabaseClient
        .from('utenti')
        .select('*, anagrafiche(id, certificati_medici(*))')
        .eq('id', 'afb93c7b-a75d-42fb-b005-13d09fb6834d')
        .maybeSingle();

    console.log("Error:", error);
    console.log("Data:", JSON.stringify(data, null, 2));
}

test();
