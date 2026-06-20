const fs = require('fs');
const https = require('https');

const CSV_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\ADR_File\\Tesseramenti ed iscrizioni Adrenalina - Sheet1.csv';
const REPORT_FILE = 'D:\\Antigravity_Projects\\ADR_SITO\\scratch\\migration_report.json';

// Utility per leggere CSV gestendo le virgolette
function parseCSV(content) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            if (inQuotes && content[i+1] === '"') {
                currentField += '"';
                i++; // Salta il prossimo
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentLine.push(currentField);
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && content[i+1] === '\n') i++; // Skip \n
            currentLine.push(currentField);
            lines.push(currentLine);
            currentLine = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    if (currentField !== '' || currentLine.length > 0) {
        currentLine.push(currentField);
        lines.push(currentLine);
    }
    return lines;
}

// Utility per parsare le date DD.MM.YYYY -> YYYY-MM-DD
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

// Mappa Province a Sigle (usato se il CSV non ha già la sigla 2 char corretta)
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
    if (p === 'estero') return null; // Gestione estero
    return null;
}

// Funzione per scaricare i comuni
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

async function main() {
    try {
        console.log("Scaricamento elenco comuni per CAP...");
        const comuniList = await downloadComuni();
        console.log(`Scaricati ${comuniList.length} comuni.`);

        const fileContent = fs.readFileSync(CSV_FILE, 'utf8');
        const rows = parseCSV(fileContent);
        
        const headers = rows[0].map(h => h.trim());
        const dataRows = rows.slice(1).filter(r => r.length > 1 && r[0].trim() !== '');

        const report = {
            total_rows: dataRows.length,
            valid_records: [],
            errors: []
        };

        dataRows.forEach((row, index) => {
            const rowIndex = index + 2; 
            
            const getCol = (colName) => {
                const idx = headers.indexOf(colName);
                return idx >= 0 && idx < row.length ? row[idx].trim() : '';
            };

            const record = { original_row: rowIndex, errors: [] };

            // 1. ANAGRAFICHE
            const nome = getCol('Nome');
            const cognome = getCol('Cognome');
            const cf = getCol('Codice fiscale').toUpperCase();
            
            if (!nome || !cognome || !cf) {
                record.errors.push("Dati anagrafici primari mancanti (Nome, Cognome o CF).");
            }
            if (cf.length !== 16) {
                record.errors.push(`Codice Fiscale non valido: ${cf} (lunghezza: ${cf.length})`);
            }

            const dataNascitaRaw = getCol('data di nascita');
            const data_nascita = parseDate(dataNascitaRaw);
            if (!data_nascita) record.errors.push(`Data di nascita non valida: ${dataNascitaRaw}`);

            let sesso = getCol('sesso').toUpperCase();
            sesso = sesso.startsWith('M') ? 'M' : (sesso.startsWith('F') ? 'F' : null);

            let stato_nascita = 'Italia';
            const provNascitaRaw = getCol('prov nascita');
            if (provNascitaRaw.toLowerCase() === 'estero') {
                stato_nascita = 'Estero';
            }
            const provincia_nascita = stato_nascita === 'Italia' ? getProvinciaSigla(provNascitaRaw) : 'EE';
            if (stato_nascita === 'Italia' && !provincia_nascita) {
                record.errors.push(`Provincia di nascita non valida: ${provNascitaRaw}`);
            }

            const comune_nascita = getCol('città nascita');

            // 2. INDIRIZZI
            const via = getCol('indirizzo residenza');
            const civico = getCol('civico'); // Nuova colonna Q
            
            const provResidenzaRaw = getCol('Provincia residenza');
            const provincia_residenza = getProvinciaSigla(provResidenzaRaw);
            if (!provincia_residenza) {
                record.errors.push(`Provincia di residenza non valida: ${provResidenzaRaw}`);
            }

            const comune = getCol('Comune residenza');
            
            // Calcolo CAP tramite comuni.json
            let cap = '00000';
            if (comune) {
                const comuneDati = comuniList.find(c => c.nome.toLowerCase() === comune.toLowerCase());
                if (comuneDati && comuneDati.cap && comuneDati.cap.length > 0) {
                    cap = comuneDati.cap[0]; // Prendi il primo CAP disponibile per il comune
                } else {
                    record.errors.push(`Impossibile trovare il CAP per il comune: ${comune}`);
                }
            } else {
                record.errors.push(`Comune mancante, impossibile calcolare il CAP.`);
            }

            // 3. CONTATTI
            const telefono = getCol('telefono');
            const email = getCol('email');

            // 4. REGISTRO TESSERATI (No Registro Soci)
            const tesseraRaw = getCol('tessera');
            let livello_copertura = null;
            if (tesseraRaw.toLowerCase().includes('base')) livello_copertura = 'BASE';
            else if (tesseraRaw.toLowerCase().includes('tabella a')) livello_copertura = 'INTEGRATIVA_A';
            else if (tesseraRaw.toLowerCase().includes('tabella b')) livello_copertura = 'INTEGRATIVA_B';

            // Data richiesta tesseramento
            const dataEsecuzioneRaw = getCol('Data esecuzione') || getCol('data rilascio certificato medico'); 
            const data_richiesta_tesseramento = parseDate(dataEsecuzioneRaw) || new Date().toISOString().split('T')[0];

            // 5. CERTIFICATI MEDICI
            const certDataRaw = getCol('data rilascio certificato medico');
            const data_rilascio_cert = parseDate(certDataRaw);
            let data_scadenza_cert = null;
            if (data_rilascio_cert) {
                const d = new Date(data_rilascio_cert);
                d.setFullYear(d.getFullYear() + 1);
                data_scadenza_cert = d.toISOString().split('T')[0];
            }

            // Assemblaggio Record Elaborato
            record.parsed_data = {
                anagrafica: { nome, cognome, codice_fiscale: cf, sesso, data_nascita, stato_nascita, provincia_nascita, comune_nascita },
                indirizzo: { via_piazza: via, civico, provincia: provincia_residenza, comune, cap },
                contatti: { telefono, email },
                registro_tesserati: { stato_tesseramento: 'ATTIVO', data_richiesta_tesseramento, livello_copertura, numero_tessera_csen: null },
                certificato: data_rilascio_cert ? { data_rilascio: data_rilascio_cert, data_scadenza: data_scadenza_cert, file_url: getCol('certificato medico') } : null
            };

            if (record.errors.length > 0) {
                report.errors.push(record);
            } else {
                report.valid_records.push(record);
            }
        });

        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
        console.log(`Report generato: ${REPORT_FILE}`);
        console.log(`Totali: ${report.total_rows}`);
        console.log(`Validi: ${report.valid_records.length}`);
        console.log(`Errori: ${report.errors.length}`);

    } catch (e) {
        console.error("Errore durante l'esecuzione:", e);
    }
}

main();
