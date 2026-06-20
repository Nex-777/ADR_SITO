import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
        env[key] = val;
    }
});
const url = env.SUPABASE_URL + '/rest/v1/utenti?select=id,email,ruolo';
const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
};
const res = await fetch(url, { headers });
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
