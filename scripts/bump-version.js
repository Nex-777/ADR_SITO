/**
 * Script di Versionamento Globale per Adrenalina (ESM)
 * Uso: node scripts/bump-version.js [X.Y.Z]
 * Se non viene passata la versione, calcola ed incrementa automaticamente il numero di patch!
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Leggi package.json per identificare la versione corrente
const pkgPath = path.join(rootDir, 'package.json');
let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let currentVersion = pkg.version || '1.03.27';

let targetVersion = process.argv[2];

if (!targetVersion) {
    // Auto-incrementa la versione patch (es: 1.03.27 -> 1.03.28)
    const parts = currentVersion.split('.');
    if (parts.length === 3) {
        const major = parts[0];
        let minor = parseInt(parts[1], 10);
        let patch = parseInt(parts[2], 10);
        
        patch++;
        if (patch >= 100) {
            minor++;
            patch = patch % 100;
        }
        const minorStr = minor < 10 ? `0${minor}` : `${minor}`;
        const patchStr = patch < 10 ? `0${patch}` : `${patch}`;
        targetVersion = `${major}.${minorStr}.${patchStr}`;
    } else {
        console.error("ERRORE: Impossibile calcolare la versione automatica da:", currentVersion);
        process.exit(1);
    }
}

if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
    console.error("ERRORE: Specifica una versione valida nel formato X.Y.Z (es: node scripts/bump-version.js 1.03.28)");
    process.exit(1);
}

console.log(`🚀 Avvio Versionamento Globale da v${currentVersion} -> v${targetVersion}...\n`);

// 2. Aggiorna package.json
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`[UPDATED] package.json -> ${targetVersion}`);

// 3. Scansione Ricorsiva dei File
function getFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.gemini' && file !== 'dist') {
                getFiles(filePath, fileList);
            }
        } else {
            if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.json')) {
                if (filePath !== pkgPath && !filePath.includes('package-lock.json')) {
                    fileList.push(filePath);
                }
            }
        }
    }
    return fileList;
}

const filesToProcess = getFiles(rootDir);
let modifiedCount = 1; // package.json già contato

filesToProcess.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // A. Aggiorna querystring degli asset: ?v=1.XX.XX -> ?v=TARGET_VERSION
    content = content.replace(/(\?v=)\d+\.\d+\.\d+/gi, `$1${targetVersion}`);

    // B. Aggiorna badge visibili nei file HTML: Vs. 1.XX.XX / VS. 1.XX.XX / vs. 1.XX.XX
    content = content.replace(/(Vs\.\s*)\d+\.\d+\.\d+/g, `$1${targetVersion}`);
    content = content.replace(/(VS\.\s*)\d+\.\d+\.\d+/g, `$1${targetVersion}`);
    content = content.replace(/(vs\.\s*)\d+\.\d+\.\d+/g, `$1${targetVersion}`);

    // C. Aggiorna costanti JS: VERSION: "1.XX.XX" o VERSION = "1.XX.XX"
    content = content.replace(/(VERSION:\s*["'])\d+\.\d+\.\d+(["'])/g, `$1${targetVersion}$2`);
    content = content.replace(/(VERSION\s*=\s*["'])\d+\.\d+\.\d+(["'])/g, `$1${targetVersion}$2`);

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[UPDATED] ${path.relative(rootDir, filePath)}`);
        modifiedCount++;
    }
});

console.log(`\n✅ Versionamento a v${targetVersion} completato con successo! ${modifiedCount} file aggiornati.`);
