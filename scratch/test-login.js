import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zpategmkelqmexetpaot.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYXRlZ21rZWxxbWV4ZXRwYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjk0NDAsImV4cCI6MjA5NTMwNTQ0MH0.jeRMwUwK5GQXKiiZNIJlag3oeWej_rTg8EaYZi4QhpM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
    console.log("Attempting sign in for nexglg@gmail.com...");
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'nexglg@gmail.com',
        password: '11021977'
    });

    if (error) {
        console.error("LOGIN ERROR:", error.status, error.message);
    } else {
        console.log("LOGIN SUCCESS! User ID:", data.user?.id);
    }
}

testLogin();
