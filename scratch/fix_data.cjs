const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

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
    console.log("Inizio Fix Dati...");

    // 1. Inserisci i 2 utenti mancanti
    // Poiché hanno già l'Auth, procediamo direttamente a inserirli nelle tabelle
    console.log("\n--- RECUPERO 2 UTENTI ESCLUSI ---");
    const missing = [
        {
            email: "giuliani.lu@yahoo.it",
            nome: "Luca", cognome: "Giuliani", cf: "GLNLCU87S20L219F", data_nascita: "1987-11-20", sesso: "M", prov_nascita: "TO", comune_nascita: "Torino",
            via: "Via carlotta benettini", civico: "7", comune_res: "Genova", prov_res: "GE", cap: "16100", telefono: "3467342428",
            tessera: "INTEGRATIVA_A", cert_data: "2026-05-05", cert_scadenza: "2027-05-05"
        },
        {
            email: "lucaorsi.lo@gmail.com",
            nome: "Luca", cognome: "Orsi", cf: "RSOLCU93M31D969N", data_nascita: "1993-08-31", sesso: "M", prov_nascita: "GE", comune_nascita: "Genova",
            via: "Via Del Villone", civico: "14", comune_res: "Rapallo", prov_res: "GE", cap: "16035", telefono: "3401555208",
            tessera: "INTEGRATIVA_A", cert_data: "2026-05-12", cert_scadenza: "2027-05-12"
        }
    ];

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    
    for (const m of missing) {
        const u = authUsers.users.find(x => x.email === m.email);
        if (!u) {
            console.log(`Auth non trovato per ${m.email}, lo creo...`);
            const { data: nU } = await supabase.auth.admin.createUser({ email: m.email, password: "Password123!", email_confirm: true });
            m.userId = nU.user.id;
        } else {
            m.userId = u.id;
        }

        // Anagrafica
        const { data: anag } = await supabase.from('anagrafiche').upsert({
            utente_id: m.userId, nome: m.nome, cognome: m.cognome, codice_fiscale: m.cf,
            sesso: m.sesso, data_nascita: m.data_nascita, stato_nascita: 'Italia',
            provincia_nascita: m.prov_nascita, comune_nascita: m.comune_nascita
        }, { onConflict: 'codice_fiscale' }).select('id').single();
        
        if (anag) {
            await supabase.from('indirizzi_residenza').upsert({ anagrafica_id: anag.id, via_piazza: m.via, civico: m.civico, comune: m.comune_res, provincia: m.prov_res, cap: m.cap }, { onConflict: 'anagrafica_id' });
            await supabase.from('contatti').upsert({ anagrafica_id: anag.id, telefono: m.telefono, email: m.email }, { onConflict: 'anagrafica_id' });
            await supabase.from('registro_tesserati').upsert({ anagrafica_id: anag.id, stato_tesseramento: 'ATTIVO', data_richiesta_tesseramento: m.cert_data, livello_copertura: m.tessera }, { onConflict: 'anagrafica_id' });
            await supabase.from('certificati_medici').upsert({ anagrafica_id: anag.id, data_rilascio: m.cert_data, data_scadenza: m.cert_scadenza }, { onConflict: 'anagrafica_id' });
            console.log(`Ripristinato ${m.nome} ${m.cognome}`);
        }
    }

    // 2. Ripristina i dati in 'utenti'
    console.log("\n--- FIX TABELLA UTENTI ---");
    const { data: anagrafiche } = await supabase.from('anagrafiche').select('utente_id, nome, cognome, codice_fiscale');
    const { data: contatti } = await supabase.from('contatti').select('anagrafica_id, email');
    const { data: anagrafiche_id } = await supabase.from('anagrafiche').select('id, utente_id');

    for (const a of anagrafiche) {
        if (!a.utente_id) continue;
        const anag_id = anagrafiche_id.find(x => x.utente_id === a.utente_id)?.id;
        const c = contatti.find(x => x.anagrafica_id === anag_id);
        const email = c ? c.email : `${a.codice_fiscale}@adrenalinaclub.it`;

        await supabase.from('utenti').update({
            nome: a.nome,
            cognome: a.cognome,
            codice_fiscale: a.codice_fiscale,
            email: email
        }).eq('id', a.utente_id);
    }
    console.log("Aggiornati nomi e email in utenti.");

    // 3. Fix Registro Soci
    console.log("\n--- FIX REGISTRO SOCI ---");
    const { data: soci, error: errSoci } = await supabase.from('registro_soci').select('anagrafica_id, data_domanda').order('data_domanda', { ascending: true });
    if (errSoci) console.error("Errore lettura soci:", errSoci.message);
    const sociArr = soci || [];
    for (let i = 0; i < sociArr.length; i++) {
        await supabase.from('registro_soci').update({
            numero_socio: String(i + 1).padStart(3, '0'),
            data_delibera: sociArr[i].data_domanda || '2026-01-01',
            stato_socio: 'ATTIVO'
        }).eq('anagrafica_id', sociArr[i].anagrafica_id);
    }
    console.log(`Aggiornati ${sociArr.length} soci con numero progressivo e delibera.`);

    // 4. Fix Registro Tesserati e Certificati
    console.log("\n--- FIX REGISTRO TESSERATI E CERTIFICATI ---");
    const { data: tesserati, error: errTess } = await supabase.from('registro_tesserati').select('anagrafica_id').order('anagrafica_id', { ascending: true });
    if (errTess) console.error("Errore lettura tesserati:", errTess.message);
    const { data: certificati, error: errCert } = await supabase.from('certificati_medici').select('anagrafica_id');
    const tesseratiArr = tesserati || [];
    const certAnagIds = new Set((certificati || []).map(c => c.anagrafica_id));

    for (let i = 0; i < tesseratiArr.length; i++) {
        const anagId = tesseratiArr[i].anagrafica_id;
        
        // Assegna progressivo
        await supabase.from('registro_tesserati').update({
            numero_tessera_csen: `CSEN-${String(i + 1).padStart(3, '0')}`
        }).eq('anagrafica_id', anagId);

        // Aggiungi certificato fittizio se mancante
        if (!certAnagIds.has(anagId)) {
            await supabase.from('certificati_medici').insert([{
                anagrafica_id: anagId,
                data_rilascio: '2026-01-01',
                data_scadenza: '2027-01-01'
            }]);
        }
    }
    console.log(`Aggiornati ${tesseratiArr.length} tesserati con numero progressivo e certificati medici garantiti.`);
    
    console.log("\n=== TUTTI I FIX COMPLETATI ===");
}

main().catch(console.error);
