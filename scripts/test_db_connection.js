// scripts/test_db_connection.js
// Script diagnostico per validare la stringa SUPABASE_DB_URL

import net from 'net';
import dotenv from 'dotenv';
dotenv.config();

const EXPECTED_PROJECT_REF = 'zpategmkelqmexetpaot';

function parsePostgresUri(uriString) {
    try {
        const url = new URL(uriString);
        return {
            protocol: url.protocol,
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            host: url.hostname,
            port: url.port || '5432',
            pathname: url.pathname,
            searchParams: url.searchParams
        };
    } catch (e) {
        return null;
    }
}

async function testTcp(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.on('connect', () => {
            socket.destroy();
            resolve({ ok: true });
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve({ ok: false, error: 'Timeout connessione (5s)' });
        });
        socket.on('error', (err) => {
            socket.destroy();
            resolve({ ok: false, error: err.message });
        });
        socket.connect(parseInt(port, 10), host);
    });
}

async function main() {
    console.log("\n========================================================");
    console.log("🔍 ANALISI & DIAGNOSTICA SUPABASE_DB_URL");
    console.log("========================================================");

    const dbUrl = process.env.SUPABASE_DB_URL || process.argv[2];

    if (!dbUrl) {
        console.error("❌ SUPABASE_DB_URL non trovata nel file .env né passata come argomento.");
        console.log("Uso:");
        console.log("  node scripts/test_db_connection.js");
        console.log("  oppure");
        console.log("  node scripts/test_db_connection.js \"postgresql://...\"");
        process.exit(1);
    }

    const parsed = parsePostgresUri(dbUrl);
    if (!parsed) {
        console.error("❌ La stringa fornita non è un URL URI PostgreSQL valido.");
        console.log("Formato atteso:");
        console.log(`postgresql://postgres.${EXPECTED_PROJECT_REF}:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`);
        process.exit(1);
    }

    console.log(`Host:     ${parsed.host}`);
    console.log(`Porta:    ${parsed.port}`);
    console.log(`Utente:   ${parsed.username}`);
    console.log(`Database: ${parsed.pathname.replace('/', '')}`);
    console.log(`Password: ${parsed.password ? '•••••••• (' + parsed.password.length + ' caratteri)' : 'MANCANTE'}`);

    let hasErrors = false;

    // 1. Controllo Utente Pooler
    if (parsed.username === 'postgres') {
        console.error("\n❌ ERRORE CRITICO NEL NOME UTENTE:");
        console.error(`   L'utente è configurato come 'postgres'.`);
        console.error(`   Quando ti connetti tramite il Connection Pooler di Supabase (${parsed.host}),`);
        console.error(`   il nome utente DEVE includere il Reference ID del progetto:`);
        console.error(`   👉 'postgres.${EXPECTED_PROJECT_REF}'`);
        console.error(`   Senza il reference ID, Supabase rifiuta la connessione con:`);
        console.error(`   'FATAL: password authentication failed for user \"postgres\"'`);
        hasErrors = true;
    } else if (parsed.username.startsWith('postgres.')) {
        console.log(`\n✅ Nome utente formattato correttamente per Connection Pooler (${parsed.username})`);
    }

    // 2. Controllo Porta Pooler
    if (parsed.port === '6543') {
        console.warn("\n⚠️ ATTENZIONE PORTA:");
        console.warn("   La porta 6543 è la modalità Transaction Pooler.");
        console.warn("   Per i dump con 'pg_dump', DEVI usare la modalità SESSION POOLER sulla porta 5432.");
    } else if (parsed.port === '5432') {
        console.log("✅ Porta corretta per Session Pooler (5432)");
    }

    // 3. Test raggiungibilità TCP
    console.log(`\n🌐 Test raggiungibilità host ${parsed.host}:${parsed.port}...`);
    const tcpResult = await testTcp(parsed.host, parsed.port);
    if (tcpResult.ok) {
        console.log(`✅ Connessione TCP al server Supabase riuscita!`);
    } else {
        console.error(`❌ Impossibile stabilire una connessione TCP: ${tcpResult.error}`);
        hasErrors = true;
    }

    console.log("\n========================================================");
    if (hasErrors) {
        console.error("🚨 CORREZIONI NECESSARIE:");
        console.log(`1. Vai su Supabase Dashboard -> Settings -> Database -> Connection Pooler`);
        console.log(`2. Seleziona modalità 'Session' (Porta 5432)`);
        console.log(`3. Copia la Connection String URI:`);
        console.log(`   postgresql://postgres.${EXPECTED_PROJECT_REF}:[TUA_PASSWORD]@${parsed.host}:5432/postgres`);
        console.log(`4. Incolla la stringa corretta nel Secret GitHub 'SUPABASE_DB_URL'.`);
    } else {
        console.log("🎉 La stringa rispetta la sintassi del Connection Pooler di Supabase!");
    }
    console.log("========================================================\n");
}

main().catch(console.error);
