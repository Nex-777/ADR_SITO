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
    'nestore_pasti',
    'feedback_reports'
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

    const assetApiUrl = `https://api.github.com/repos/${repo}/releases/assets/${encAsset.id}`;
    const assetHeaders = {
        'User-Agent': 'ADR-Backup-Smoke-Test',
        'Accept': 'application/octet-stream'
    };
    if (token) {
        assetHeaders['Authorization'] = `token ${token}`;
    }

    let downloadUrl = assetApiUrl;
    let finalHeaders = assetHeaders;

    const initialRes = await fetch(assetApiUrl, {
        headers: assetHeaders,
        redirect: 'manual'
    });

    if (initialRes.status === 302 || initialRes.status === 301) {
        downloadUrl = initialRes.headers.get('location');
        finalHeaders = { 'User-Agent': 'ADR-Backup-Smoke-Test' };
    } else if (!initialRes.ok) {
        throw new Error(`Errore API download asset (${initialRes.status}): ${await initialRes.text()}`);
    }

    const assetRes = (downloadUrl === assetApiUrl)
        ? initialRes
        : await fetch(downloadUrl, { headers: finalHeaders });

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

    let encDumpPath = null;
    let shouldCleanupEnc = false;

    // 1. Controlla se passato come argomento
    if (process.argv[2] && fs.existsSync(process.argv[2])) {
        encDumpPath = path.resolve(process.argv[2]);
        console.log(`📂 Utilizzo file specificato come argomento: ${encDumpPath}`);
    } else {
        // 2. Cerca file locale nel root dir
        const localFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('backup_') && f.endsWith('.dump.enc'));
        if (localFiles.length > 0) {
            localFiles.sort().reverse();
            encDumpPath = path.resolve(localFiles[0]);
            console.log(`📂 Utilizzo dump cifrato locale più recente: ${encDumpPath}`);
        } else {
            // 3. Scarica da GitHub Releases
            const repo = process.env.GITHUB_REPOSITORY || 'Nex-777/ADR_SITO';
            const token = process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN_REPO;
            const res = await getLatestReleaseAsset(repo, token);
            encDumpPath = res.filePath;
            shouldCleanupEnc = res.isTempDownload;
        }
    }

    const tempDir = path.join(process.cwd(), '.tmp_smoke_test');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const decDumpPath = path.join(tempDir, 'smoke_test.dump');

    try {
        console.log(`\n🔓 Decifratura AES-256-CBC (PBKDF2, 100k iter)...`);
        execSync(
            `openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d -in "${encDumpPath}" -out "${decDumpPath}" -pass env:BACKUP_PASSPHRASE`,
            {
                stdio: 'pipe',
                env: { ...process.env, BACKUP_PASSPHRASE: passphrase }
            }
        );

        const stat = fs.statSync(decDumpPath);
        if (stat.size === 0) {
            throw new Error("Il file decifrato ha dimensione 0 bytes (passphrase errata o file corrotto).");
        }
        console.log(`✅ Decifratura completata con successo! Dimensione dump: ${(stat.size / 1024).toFixed(1)} KB`);

        console.log(`\n📋 Verifica integrità formato pg_dump (TOC Table of Contents)...`);
        const pgRestoreCmd = process.platform === 'linux' ? '/usr/lib/postgresql/17/bin/pg_restore' : 'pg_restore';
        const tocOutput = execSync(`${pgRestoreCmd} --list "${decDumpPath}"`, {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
        });
        console.log(`✅ ${pgRestoreCmd} --list ha completato la scansione della TOC (${tocOutput.split('\n').length} elementi rilevati).`);

        console.log(`\n🔍 Controllo presenza tabelle critiche nella TOC del dump:`);
        const missingTables = [];
        for (const tbl of CRITICAL_TABLES) {
            // Cerca "TABLE DATA public <tbl>" o "TABLE public <tbl>"
            const regex = new RegExp(`TABLE (DATA )?public ${tbl}( |$)`, 'i');
            const found = regex.test(tocOutput) || tocOutput.split('\n').some(line => line.includes(` ${tbl} `) || line.endsWith(` ${tbl}`));
            if (found) {
                console.log(`  ✓ Tabella '${tbl}' presente`);
            } else {
                console.log(`  ❌ Tabella '${tbl}' ASSENTE`);
                missingTables.push(tbl);
            }
        }

        if (missingTables.length > 0) {
            throw new Error(`Controllo integrità fallito: ${missingTables.length} tabelle critiche mancanti (${missingTables.join(', ')}).`);
        }

        console.log("\n🎉 TUTTE LE TABELLE CRITICHE SONO STATE IDENTIFICATE CON SUCCESSO.");
        console.log("🛡️ SMOKE TEST COMPLETATO CON SUCCESSO — BACKUP VALIDO E RIPRISTINABILE.");

    } catch (err) {
        console.error("\n❌ SMOKE TEST FALLITO:", err.message);
        process.exitCode = 1;
    } finally {
        // Cleanup file temporanei
        if (fs.existsSync(decDumpPath)) {
            try { fs.unlinkSync(decDumpPath); } catch (_) {}
        }
        if (fs.existsSync(tempDir)) {
            try { fs.rmdirSync(tempDir); } catch (_) {}
        }
        if (shouldCleanupEnc && encDumpPath && fs.existsSync(encDumpPath)) {
            try { fs.unlinkSync(encDumpPath); } catch (_) {}
        }
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
