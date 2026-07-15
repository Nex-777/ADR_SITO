import fs from 'fs';
import path from 'path';

// ============================================================
// ISTRUZIONI: aggiorna SOLO il valore di `newVersion` qui sotto,
// poi esegui: node bump.js
// Lo script aggiornerà automaticamente tutte le versioni nel
// codice (JS, HTML badge, ?v= nei tag script/link) in una volta.
// ============================================================
const newVersion = '1.01.90';

const root = 'd:/Antigravity_Projects/ADR_SITO';
const portalDir = path.join(root, 'portal');

// --- 1. Aggiorna tutti i file .js e .md (ricorsivo) ---
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (file.includes('node_modules') || file.includes('.git') || file.includes('.gemini')) return;
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if ((file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.md')) && !file.endsWith('package.json') && !file.endsWith('package-lock.json')) {
                results.push(file);
            }
        }
    });
    return results;
}

const versionRegex = /1\.\d{2}\.\d+/g;
const files = walk(root);
let count = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (versionRegex.test(content)) {
        const updated = content.replace(/1\.\d{2}\.\d+/g, newVersion);
        if (updated !== content) {
            fs.writeFileSync(file, updated);
            console.log('Updated:', file);
            count++;
        }
    }
});

// --- 2. Aggiorna i file HTML del portale ---
// - Badge versione nel testo (Vs. X.XX.XX)
// - Tag ?v= nei <script src> e <link href> locali
const htmlFiles = fs.readdirSync(portalDir).filter(f => f.endsWith('.html'));
htmlFiles.forEach(filename => {
    const filepath = path.join(portalDir, filename);
    let content = fs.readFileSync(filepath, 'utf8');

    // Aggiorna badge versione
    content = content.replace(/Vs\. 1\.\d{2}\.\d+/g, `Vs. ${newVersion}`);
    content = content.replace(/VERSION: "1\.\d{2}\.\d+"/g, `VERSION: "${newVersion}"`);

    // Aggiorna ?v= nei tag <script src="local.js?v=...">
    content = content.replace(/<script src="(?!http)([^"?]+)(?:\?v=[^"]+)?">/g,
        (match, src) => `<script src="${src}?v=${newVersion}">`);

    // Aggiorna ?v= nei tag <link rel="stylesheet" href="local.css?v=...">
    content = content.replace(/<link rel="stylesheet" href="(?!http)([^"?]+)(?:\?v=[^"]+)?">/g,
        (match, href) => `<link rel="stylesheet" href="${href}?v=${newVersion}">`);

    fs.writeFileSync(filepath, content);
    console.log('Updated HTML:', filename);
    count++;
});

console.log(`\nTotal files updated: ${count}`);
console.log(`Version bumped to: ${newVersion}`);
