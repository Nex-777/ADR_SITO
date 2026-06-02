import crypto from 'crypto';

const urls = [
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.4/dist/umd/supabase.js'
];

async function getHash(url) {
    const res = await fetch(url);
    const text = await res.text();
    const hash = crypto.createHash('sha384').update(text).digest('base64');
    console.log(`${url}\nintegrity="sha384-${hash}"\n`);
}

for (const url of urls) {
    await getHash(url);
}
