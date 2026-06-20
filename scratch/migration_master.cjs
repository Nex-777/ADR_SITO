const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// === CONFIGURAZIONE ===
const ENV_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\.env';
const CSV_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\ADR_File\\Tesseramenti ed iscrizioni Adrenalina - Sheet1.csv';
const BACKUP_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\scratch\\direttivo_backup.json';

function loadEnv() {
    try {
        const envContent = fs.readFileSync(ENV_FILE, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) process.env[match[1].trim()] = match[2].trim();
        });
    } catch (e) {
        console.error("Errore caricamento .env:", e.message);
    }
}
loadEnv();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// === UTILITIES ===
function parseCSV(content) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            if (inQuotes && content[i+1] === '"') { currentField += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
            currentLine.push(currentField); currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && content[i+1] === '\n') i++; 
            currentLine.push(currentField); lines.push(currentLine); currentLine = []; currentField = '';
        } else {
            currentField += char;
        }
    }
    if (currentField !== '' || currentLine.length > 0) { currentLine.push(currentField); lines.push(currentLine); }
    return lines;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

const provinceMap = {
    'ascoli piceno': 'AP', 'milano': 'MI', 'ancona': 'AN', 'napoli': 'NA',
    'chieti': 'CH', 'pescara': 'PE', 'modena': 'MO', 'roma': 'RM',
    'l\'aquila': 'AQ', 'teramo': 'TE', 'taranto': 'TA', 'macerata': 'MC',
    'lecco': 'LC', 'imperia': 'IM'
};

function getProvinciaSigla(prov) {
    if (!prov) return null;
    const p = prov.toLowerCase().trim();
    if (p.length === 2) return p.toUpperCase();
    if (provinceMap[p]) return provinceMap[p];
    if (p === 'estero') return null;
    return null;
}

function downloadComuni() {
    return new Promise((resolve, reject) => {
        https.get('https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function generateRandomPassword() {
    return Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10) + "A1!";
}

// === MAIN SCRIPT ===
async function main() {
    console.log("=== INIZIO MIGRAZIONE MASTER ===\n");
    
    // 1. Lettura Backup Direttivo
    let direttivo = [];
    try {
        direttivo = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
        console.log(`Caricati ${direttivo.length} membri del direttivo dal backup.`);
    } catch (e) {
        console.error("Errore lettura backup direttivo:", e.message);
        process.exit(1);
    }

    // 2. Lettura CSV e Comuni
    console.log("Scaricamento elenco comuni...");
    const comuniList = await downloadComuni();
    const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
    const rows = parseCSV(csvContent);
    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1).filter(r => r.length > 1 && r[0].trim() !== '');
    console.log(`Lette ${dataRows.length} righe dal CSV.`);

    // --- FASE 1: RIPRISTINO DIRETTIVO ---
    console.log("\n--- RIPRISTINO DIRETTIVO ---");
    for (const dirMember of direttivo) {
        const originalEmail = dirMember.auth.email;
        const password = "Adrenalina2026!";
        const cf = dirMember.anagrafica.codice_fiscale;

        console.log(`Ricreazione Auth per: ${originalEmail}`);
        // Crea o Aggiorna utente Auth
        let newUserId = null;
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email: originalEmail,
            password: password,
            email_confirm: true
        });

        if (authErr) {
            // Se esiste già, aggiorniamo la password
            console.log(`  Utente già esistente. Aggiorno password per: ${originalEmail}`);
            const { data: updateData, error: updateErr } = await supabase.auth.admin.updateUserById(
                dirMember.auth.id,
                { password: password }
            );
            if (updateErr) {
                console.error(`  Errore Update Auth (${originalEmail}):`, updateErr.message);
                continue;
            }
            newUserId = dirMember.auth.id;
        } else {
            newUserId = authData.user.id;
        }

        // Cerca se esiste nel CSV per aggiornare i dati
        const csvRow = dataRows.find(r => {
            const rowCf = r[headers.indexOf('Codice fiscale')] || '';
            return rowCf.trim().toUpperCase() === cf;
        });

        let anagraficaToInsert = { ...dirMember.anagrafica, utente_id: newUserId };
        delete anagraficaToInsert.id;
        delete anagraficaToInsert.created_at;
        let indirizzoToInsert = { ...dirMember.indirizzo };
        delete indirizzoToInsert.anagrafica_id;
        delete indirizzoToInsert.id;
        delete indirizzoToInsert.created_at;
        let contattiToInsert = { ...dirMember.contatto };
        delete contattiToInsert.anagrafica_id;
        delete contattiToInsert.id;
        delete contattiToInsert.created_at;

        if (csvRow) {
            // Aggiorna da CSV se presente
            const getCol = (colName) => { const idx = headers.indexOf(colName); return idx >= 0 ? csvRow[idx].trim() : ''; };
            
            anagraficaToInsert.nome = getCol('Nome') || anagraficaToInsert.nome;
            anagraficaToInsert.cognome = getCol('Cognome') || anagraficaToInsert.cognome;
            
            indirizzoToInsert.via_piazza = getCol('indirizzo residenza') || indirizzoToInsert.via_piazza;
            indirizzoToInsert.civico = getCol('civico') || indirizzoToInsert.civico;
            indirizzoToInsert.comune = getCol('Comune residenza') || indirizzoToInsert.comune;
            indirizzoToInsert.provincia = getProvinciaSigla(getCol('Provincia residenza')) || indirizzoToInsert.provincia;
            
            contattiToInsert.telefono = getCol('telefono') || contattiToInsert.telefono;
            contattiToInsert.email = getCol('email') || contattiToInsert.email;

            // Ricalcola CAP
            if (indirizzoToInsert.comune) {
                const comuneDati = comuniList.find(c => c.nome.toLowerCase() === indirizzoToInsert.comune.toLowerCase());
                if (comuneDati && comuneDati.cap && comuneDati.cap.length > 0) indirizzoToInsert.cap = comuneDati.cap[0];
            }
        }

        // Inserimento Anagrafica
        const { data: anagData, error: anagErr } = await supabase.from('anagrafiche').insert([anagraficaToInsert]).select('id').single();
        if (anagErr) { console.error("  Errore Anagrafica:", anagErr.message); continue; }
        const anagraficaId = anagData.id;

        // Inserimento Utente Ruolo
        if (dirMember.utente && dirMember.utente.ruolo) {
            const { error: utErr } = await supabase.from('utenti').upsert({ 
                id: newUserId, 
                ruolo: dirMember.utente.ruolo 
            });
            if (utErr) console.error("  Errore Upsert Utenti:", utErr.message);
        }

        // Inserimento Indirizzi e Contatti
        await supabase.from('indirizzi_residenza').insert([{ ...indirizzoToInsert, anagrafica_id: anagraficaId }]);
        await supabase.from('contatti').insert([{ ...contattiToInsert, anagrafica_id: anagraficaId }]);

        // Inserimento Registro Soci (Tutti e 7)
        await supabase.from('registro_soci').insert([{ 
            anagrafica_id: anagraficaId, 
            stato_socio: 'ATTIVO', 
            data_domanda: '2026-01-01', 
            quota_scadenza: '2026-12-31' 
        }]);

        // Inserimento Registro Tesserati (Escludi Alessia Farina)
        if (anagraficaToInsert.nome.toUpperCase() !== 'ALESSIA' || anagraficaToInsert.cognome.toUpperCase() !== 'FARINA') {
            let liv_copertura = 'BASE';
            if (csvRow) {
                const tesseraRaw = csvRow[headers.indexOf('tessera')] || '';
                if (tesseraRaw.toLowerCase().includes('tabella a')) liv_copertura = 'INTEGRATIVA_A';
                else if (tesseraRaw.toLowerCase().includes('tabella b')) liv_copertura = 'INTEGRATIVA_B';
            }
            await supabase.from('registro_tesserati').insert([{ 
                anagrafica_id: anagraficaId, 
                stato_tesseramento: 'ATTIVO', 
                data_richiesta_tesseramento: '2026-01-01', 
                livello_copertura: liv_copertura 
            }]);
        }
        console.log(`  Completato.`);
    }

    // --- FASE 2: IMPORTAZIONE TESSERATI (CSV) ---
    console.log("\n--- IMPORTAZIONE TESSERATI ---");
    for (const row of dataRows) {
        const getCol = (colName) => { const idx = headers.indexOf(colName); return idx >= 0 ? row[idx].trim() : ''; };
        
        const cf = getCol('Codice fiscale').toUpperCase();
        // Salta se è già nel direttivo
        if (direttivo.some(d => d.anagrafica.codice_fiscale === cf)) continue;

        let email = getCol('email');
        if (!email) email = `${cf.toLowerCase()}@adrenalinaclub.it`; // Fallback fittizio

        console.log(`Creazione Auth per: ${email} (${getCol('Nome')} ${getCol('Cognome')})`);
        
        let newUserId = null;
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email: email,
            password: generateRandomPassword(),
            email_confirm: true
        });

        if (authErr) {
            console.log(`  Auth esistente. Provo a recuperare ID utente per: ${email}`);
            const { data: existingUser, error: findErr } = await supabase.auth.admin.listUsers();
            const found = existingUser?.users?.find(u => u.email === email);
            if (found) {
                newUserId = found.id;
            } else {
                console.error(`  Errore Auth Critico (${email}):`, authErr.message);
                continue;
            }
        } else {
            newUserId = authData.user.id;
        }

        // Upsert su Utenti per sicurezza (se pre-esistente ma cancellato dal reset)
        await supabase.from('utenti').upsert({ id: newUserId, ruolo: ['tesserato_esterno'] });

        const dataNascitaRaw = getCol('data di nascita');
        let sesso = getCol('sesso').toUpperCase().startsWith('M') ? 'M' : 'F';
        let stato_nascita = getCol('prov nascita').toLowerCase() === 'estero' ? 'Estero' : 'Italia';
        let prov_nascita = stato_nascita === 'Italia' ? getProvinciaSigla(getCol('prov nascita')) : 'EE';

        const anagrafica = {
            utente_id: newUserId,
            nome: getCol('Nome'),
            cognome: getCol('Cognome'),
            codice_fiscale: cf,
            sesso: sesso,
            data_nascita: parseDate(dataNascitaRaw),
            stato_nascita: stato_nascita,
            provincia_nascita: prov_nascita,
            comune_nascita: getCol('città nascita')
        };

        const { data: anagData, error: anagErr } = await supabase.from('anagrafiche').insert([anagrafica]).select('id').single();
        if (anagErr) { console.error("  Errore Anagrafica:", anagErr.message); continue; }
        const anagraficaId = anagData.id;

        const comuneRes = getCol('Comune residenza');
        let cap = '00000';
        if (comuneRes) {
            const comuneDati = comuniList.find(c => c.nome.toLowerCase() === comuneRes.toLowerCase());
            if (comuneDati && comuneDati.cap && comuneDati.cap.length > 0) cap = comuneDati.cap[0];
        }

        const indirizzo = {
            anagrafica_id: anagraficaId,
            via_piazza: getCol('indirizzo residenza'),
            civico: getCol('civico') || 'SNC',
            comune: comuneRes,
            provincia: getProvinciaSigla(getCol('Provincia residenza')),
            cap: cap
        };
        await supabase.from('indirizzi_residenza').insert([indirizzo]);

        const contatti = {
            anagrafica_id: anagraficaId,
            telefono: getCol('telefono') || '000000',
            email: email
        };
        await supabase.from('contatti').insert([contatti]);

        let liv_copertura = 'BASE';
        const tesseraRaw = getCol('tessera');
        if (tesseraRaw.toLowerCase().includes('tabella a')) liv_copertura = 'INTEGRATIVA_A';
        else if (tesseraRaw.toLowerCase().includes('tabella b')) liv_copertura = 'INTEGRATIVA_B';

        await supabase.from('registro_tesserati').insert([{
            anagrafica_id: anagraficaId,
            stato_tesseramento: 'ATTIVO',
            data_richiesta_tesseramento: parseDate(getCol('data rilascio certificato medico')) || '2026-01-01',
            livello_copertura: liv_copertura
        }]);

        const data_rilascio = parseDate(getCol('data rilascio certificato medico'));
        if (data_rilascio) {
            const d = new Date(data_rilascio);
            d.setFullYear(d.getFullYear() + 1);
            const data_scadenza = d.toISOString().split('T')[0];
            await supabase.from('certificati_medici').insert([{
                anagrafica_id: anagraficaId,
                data_rilascio: data_rilascio,
                data_scadenza: data_scadenza,
                file_url: getCol('certificato medico')
            }]);
        }
        
        console.log(`  Completato.`);
    }

    console.log("\n=== MIGRAZIONE COMPLETATA CON SUCCESSO ===");
}

main();
