/**
 * backup_storage.js — Download locale on-demand dei file Supabase Storage
 *
 * Uso: npm run backup:storage
 *
 * Funzionamento:
 *   - Legge un manifest locale (backup_storage_manifest.json) per sapere
 *     quali file sono già stati scaricati.
 *   - Scarica SOLO i file nuovi o modificati (backup differenziale).
 *   - Salva i file in ./local_backup/storage/[bucket]/[path]
 *   - Aggiorna il manifest al termine.
 *
 * Requisiti: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel file .env
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

config(); // Carica .env

// ─── Configurazione ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = './local_backup/storage';
const MANIFEST_PATH = './backup_storage_manifest.json';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERRORE: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devono essere presenti nel file .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Utility ───────────────────────────────────────────────────────────────
async function loadManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {}; // Primo avvio: manifest vuoto
  }
}

async function saveManifest(manifest) {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Lista ricorsivamente tutti i file in un bucket/cartella.
 * Supabase restituisce "cartelle" come oggetti con id=null — le attraversiamo.
 */
async function listFilesRecursive(bucket, folder = '') {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });

  if (error) {
    console.warn(`  ⚠️  Errore listing ${bucket}/${folder}: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) return [];

  const files = [];
  for (const item of data) {
    if (item.id === null) {
      // È una cartella — ricorri
      const subPath = folder ? `${folder}/${item.name}` : item.name;
      const subFiles = await listFilesRecursive(bucket, subPath);
      files.push(...subFiles);
    } else {
      // È un file
      const filePath = folder ? `${folder}/${item.name}` : item.name;
      files.push({
        path: filePath,
        id: item.id,
        updated_at: item.updated_at,
        size: item.metadata?.size ?? 0,
      });
    }
  }
  return files;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🛡️  Backup Storage Supabase — Avvio');
  console.log(`📂  Directory destinazione: ${path.resolve(BACKUP_DIR)}`);
  console.log(`📋  Manifest: ${path.resolve(MANIFEST_PATH)}\n`);

  // Statistiche
  let totalNew = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Carica manifest esistente
  const manifest = await loadManifest();

  // Lista tutti i bucket
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error(`❌ Impossibile listare i bucket: ${bucketsError.message}`);
    process.exit(1);
  }

  if (!buckets || buckets.length === 0) {
    console.log('ℹ️  Nessun bucket trovato nel progetto Supabase.');
    return;
  }

  console.log(`🪣  Trovati ${buckets.length} bucket(s): ${buckets.map(b => b.name).join(', ')}\n`);

  for (const bucket of buckets) {
    console.log(`\n📦  Bucket: ${bucket.name}`);
    console.log(`    Tipo: ${bucket.public ? 'pubblico' : 'privato'}`);

    const files = await listFilesRecursive(bucket.name);
    console.log(`    File trovati: ${files.length}`);

    for (const file of files) {
      const manifestKey = `${bucket.name}/${file.path}`;
      const existing = manifest[manifestKey];

      // Salta se già scaricato e non modificato
      if (existing && existing.updated_at === file.updated_at) {
        totalSkipped++;
        continue;
      }

      // Scarica il file
      const destPath = path.join(BACKUP_DIR, bucket.name, file.path);
      const destDir = path.dirname(destPath);
      ensureDir(destDir);

      try {
        const { data: blob, error: dlError } = await supabase.storage
          .from(bucket.name)
          .download(file.path);

        if (dlError) throw dlError;

        const buffer = Buffer.from(await blob.arrayBuffer());
        await fs.writeFile(destPath, buffer);

        // Aggiorna manifest
        manifest[manifestKey] = {
          updated_at: file.updated_at,
          size: file.size,
          downloaded_at: new Date().toISOString(),
          local_path: destPath,
        };

        totalNew++;
        const isUpdate = existing ? '♻️  aggiornato' : '✅ nuovo';
        console.log(`    ${isUpdate}: ${file.path} (${(file.size / 1024).toFixed(1)} KB)`);
      } catch (err) {
        totalErrors++;
        console.warn(`    ❌ Errore scaricando ${file.path}: ${err.message}`);
      }
    }
  }

  // Salva manifest aggiornato
  await saveManifest(manifest);

  // Report finale
  console.log('\n' + '─'.repeat(50));
  console.log('📊  REPORT BACKUP STORAGE');
  console.log('─'.repeat(50));
  console.log(`  ✅  Nuovi/aggiornati scaricati : ${totalNew}`);
  console.log(`  ⏭️   Già presenti (saltati)     : ${totalSkipped}`);
  console.log(`  ❌  Errori                      : ${totalErrors}`);
  console.log(`  📂  Destinazione                : ${path.resolve(BACKUP_DIR)}`);
  console.log('─'.repeat(50));

  if (totalErrors > 0) {
    console.warn('\n⚠️  Backup completato con errori. Verifica i file mancanti.');
    process.exit(1);
  } else {
    console.log('\n🎉  Backup Storage completato con successo!');
  }
}

main().catch(err => {
  console.error('❌ Errore fatale:', err.message);
  process.exit(1);
});
