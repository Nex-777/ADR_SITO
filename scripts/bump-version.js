/**
 * Script di Versionamento Globale per Adrenalina (ESM)
 * Uso: node scripts/bump-version.js 1.03.24
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetVersion = process.argv[2];

if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
    console.error("ERRORE: Specifica una versione valida nel formato X.Y.Z (es: node scripts/bump-version.js 1.03.24)");
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

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
            if (file.endsWith('.html') || file.endsWith('.js')) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

const filesToProcess = getFiles(rootDir);
let modifiedCount = 0;

filesToProcess.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Aggiorna querystring degli asset: ?v=1.XX.XX -> ?v=TARGET_VERSION
    content = content.replace(/(\?v=)\d+\.\d+\.\d+/gi, `$1${targetVersion}`);

    // 2. Aggiorna badge visibili nei file HTML: Vs. 1.XX.XX / VS. 1.XX.XX / vs. 1.XX.XX -> Vs. TARGET_VERSION / VS. TARGET_VERSION
    content = content.replace(/(Vs\.\s*)\d+\.\d+\.\d+/g, `$1${targetVersion}`);
    content = content.replace(/(VS\.\s*)\d+\.\d+\.\d+/g, `$1${targetVersion}`);
    content = content.replace(/(vs\.\s*)\d+\.\d+\.\d+/g, `$1${targetVersion}`);

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[UPDATED] ${path.relative(rootDir, filePath)}`);
        modifiedCount++;
    }
});

console.log(`\n✅ Versionamento a v${targetVersion} completato con successo! ${modifiedCount} file aggiornati.`);
