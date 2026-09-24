// scripts/test_backup_restore.js
// Smoke Test per la validazione di integrità e decifratura dei backup di ADR_SITO

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CRITICAL_TABLES = [
    'utenti',
    'anagrafiche',
    'atti_adesione',
    'registro_approvazioni',
    'ricevute_pagamenti',
    'epika_profili',
    'epika_gruppi_storici',
    'nestore_pesi_misure',
    'nestore_allenamenti',
    'nestore_pasti'
];

async function getLatestReleaseAsset(repo, token) {
    console.log(`🔍 Ricerca dell'ultima release di backup su GitHub (${repo})...`);
    const headers = {
        'User-Agent': 'ADR-Backup-Smoke-Test',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/releases`, { headers });
    if (!res.ok) {
        throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }

    const releases = await res.json();
    const backupRelease = releases.find(r => r.tag_name && r.tag_name.startsWith('backup/'));
    if (!backupRelease) {
        throw new Error("Nessuna release con tag 'backup/' trovata nel repository.");
    }

    console.log(`📦 Release trovata: ${backupRelease.tag_name} (${backupRelease.name})`);
    const encAsset = backupRelease.assets.find(a => a.name.endsWith('.dump.enc'));
    if (!encAsset) {
        throw new Error(`Nessun asset .dump.enc trovato nella release ${backupRelease.tag_name}.`);
    }

    const downloadPath = path.join(process.cwd(), encAsset.name);
    console.log(`⬇️ Scaricamento asset: ${encAsset.name} (${(encAsset.size / 1024).toFixed(1)} KB)...`);

    const assetRes = await fetch(encAsset.browser_download_url, { headers });
    if (!assetRes.ok) {
        throw new Error(`Errore download asset (${assetRes.status}): ${await assetRes.text()}`);
    }

    const buffer = Buffer.from(await assetRes.arrayBuffer());
    fs.writeFileSync(downloadPath, buffer);
    console.log(`✅ File scaricato in: ${downloadPath}`);
    return { filePath: downloadPath, isTempDownload: true };
}

async function main() {
    console.log("🛡️ === SMOKE TEST BACKUP ADR_SITO ===");

    const passphrase = process.env.BACKUP_PASSPHRASE;
    if (!passphrase) {
        console.error("❌ ERRORE: BACKUP_PASSPHRASE non definita nelle variabili d'ambiente (.env o Secrets).");
        process.exit(1);
    }

    const args = process.argv.slice(2);
    let targetEncFile = null;
    let isTempDownload = false;

    if (args.includes('--latest')) {
        const repo = process.env.GITHUB_REPOSITORY || 'Nex-777/ADR_SITO';
        const token = process.env.GITHUB_TOKEN;
        const result = await getLatestReleaseAsset(repo, token);
        targetEncFile = result.filePath;
        isTempDownload = result.isTempDownload;
    } else if (args[0] && !args[0].startsWith('--')) {
        targetEncFile = path.resolve(args[0]);
    } else {
        // Cerca eventuale file .dump.enc nella cartella corrente
        const localFiles = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.dump.enc'));
        if (localFiles.length > 0) {
            targetEncFile = path.resolve(localFiles[0]);
            console.log(`ℹ️ Trovato dump locale: ${targetEncFile}`);
        } else {
            console.error("❌ Specificare il file .dump.enc oppure usare il flag --latest.");
            console.log("Uso: node scripts/test_backup_restore.js [<percorso_file.dump.enc> | --latest]");
            process.exit(1);
        }
    }

    if (!fs.existsSync(targetEncFile)) {
        console.error(`❌ File non trovato: ${targetEncFile}`);
        process.exit(1);
    }

    const fileSizeMb = (fs.statSync(targetEncFile).size / (1024 * 1024)).toFixed(2);
    console.log(`📁 Target: ${targetEncFile} (${fileSizeMb} MB)`);

    const decryptedFile = targetEncFile.replace(/\.enc$/, '');
    if (decryptedFile === targetEncFile) {
        console.error("❌ Il file specificato deve avere estensione .enc");
        process.exit(1);
    }

    try {
        // 1. Decifratura OpenSSL
        console.log("🔓 Decifratura AES-256-CBC (PBKDF2, 100k iter)...");
        execSync(
            `openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d -in "${targetEncFile}" -out "${decryptedFile}" -pass pass:"${passphrase}"`,
            { stdio: 'pipe' }
        );

        if (!fs.existsSync(decryptedFile) || fs.statSync(decryptedFile).size === 0) {
            throw new Error("Il file decifrato è vuoto o non è stato creato. Passphrase errata o dump corrotto.");
        }

        const decSizeMb = (fs.statSync(decryptedFile).size / (1024 * 1024)).toFixed(2);
        console.log(`✅ Decifratura riuscita. Dimensione dump: ${decSizeMb} MB`);

        // 2. Lettura catalogo pg_restore --list
        console.log("📋 Lettura catalogo PostgreSQL (pg_restore --list)...");
        const catalogOutput = execSync(`pg_restore --list "${decryptedFile}"`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });

        const lines = catalogOutput.split('\n');
        console.log(`📊 Record totali nel dump: ${lines.length}`);

        // 3. Verifica tabelle critiche
        console.log("\n🧪 Controllo presenza tabelle core:");
        const missing = [];
        for (const table of CRITICAL_TABLES) {
            // Cerca pattern TABLE DATA o TABLE nell'output del TOC
            const found = lines.some(line => line.includes(` ${table} `) || line.endsWith(` ${table}`));
            if (found) {
                console.log(`   ✅ [PRESENTE] ${table}`);
            } else {
                console.log(`   ❌ [MANCANTE] ${table}`);
                missing.push(table);
            }
        }

        console.log("\n-------------------------------------------");
        if (missing.length === 0) {
            console.log(`🎉 SMOKE TEST SUPERATO: Tutte le ${CRITICAL_TABLES.length} tabelle critiche sono integre!`);
        } else {
            console.error(`🚨 SMOKE TEST FALLITO: Mancano ${missing.length} tabelle critiche: ${missing.join(', ')}`);
        }
        console.log("-------------------------------------------\n");

        if (missing.length > 0) {
            process.exit(1);
        }

    } catch (err) {
        console.error(`❌ Errore durante lo smoke test: ${err.message}`);
        process.exit(1);
    } finally {
        // Pulisci file temporanei in chiaro per sicurezza
        if (fs.existsSync(decryptedFile)) {
            fs.unlinkSync(decryptedFile);
            console.log("🗑️ File dump in chiaro rimosso dal disco.");
        }
        if (isTempDownload && fs.existsSync(targetEncFile)) {
            fs.unlinkSync(targetEncFile);
            console.log("🗑️ Asset scaricato rimosso dal disco.");
        }
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
