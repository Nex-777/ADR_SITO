# Backup System — ADR_SITO

Documentazione del sistema di backup automatico per il progetto Adrenalina Club, comprensivo di EPIKA e NESTORE.

---

## 1. Panoramica Architetturale

Il sistema di backup si articola su **due layer distinti**:

| Layer | Cosa copre | Frequenza | Formato | Retention |
|:---|:---|:---:|:---:|:---:|
| **Database** | Schema `public` intero (Core + EPIKA + NESTORE) + Schema `auth` | Ogni notte 02:00 IT | `.dump.enc` AES-256 | 60 giorni |
| **Storage** | PDF certificati medici, ricevute, documenti | 1° di ogni mese | `.zip.enc` AES-256 | 12 mesi |
| **Storage locale** | Stessi file (download differenziale sul PC) | On-demand manuale | File raw | Illimitata |

> **Nota importante**: I database di Adrenalina Core, EPIKA e NESTORE NON sono istanze separate. Risiedono tutti nello stesso schema `public` della stessa istanza PostgreSQL Supabase. Un singolo `pg_dump` cattura l'intero ecosistema in modo atomico.

---

## 2. Database Backup — Workflow Notturno

**File**: [`.github/workflows/backup_db.yml`](../.github/workflows/backup_db.yml)

### 2.1 Trigger
- **Automatico**: ogni notte alle `00:00 UTC` (= `02:00 ora italiana CEST`)
- **Manuale**: Actions → `🛡️ Backup Database Notturno` → `Run workflow`

### 2.2 Flusso di esecuzione
```
1. ubuntu-latest runner
2. Installa postgresql-client-16 (pg_dump)
3. pg_dump su Session Pooler Supabase (porta 5432)
   → backup_YYYY-MM-DD.dump (formato custom, compresso)
4. openssl enc -aes-256-cbc -pbkdf2 -iter 100000
   → backup_YYYY-MM-DD.dump.enc (cifrato con BACKUP_PASSPHRASE)
5. Elimina dump in chiaro dalla memoria del runner
6. Crea GitHub Release: tag backup/YYYY-MM-DD
7. Allega .dump.enc come release asset
8. Elimina release backup/ più vecchie di 60 giorni
```

### 2.3 GitHub Secrets richiesti
| Secret | Descrizione |
|:---|:---|
| `SUPABASE_DB_URL` | Connection string Session Pooler (porta 5432): `postgresql://postgres.[ref]:[pwd]@aws-0-[region].pooler.supabase.com:5432/postgres` |
| `BACKUP_PASSPHRASE` | Passphrase AES-256 per la cifratura (min 32 caratteri) |

> ⚠️ **CRITICO**: Se perdi `BACKUP_PASSPHRASE`, i backup esistenti sono matematicamente irrecuperabili. Conserva la passphrase offline su carta o in un password manager fisico separato dal PC.

### 2.4 Dove trovare i backup
GitHub → Repo `ADR_SITO` → **Releases** → Filtra per tag `backup/`

---

## 3. Storage Backup — Workflow Mensile

**File**: [`.github/workflows/backup_storage_monthly.yml`](../.github/workflows/backup_storage_monthly.yml)

### 3.1 Trigger
- **Automatico**: il 1° di ogni mese alle `02:00 UTC`
- **Manuale**: Actions → `🗄️ Backup Storage Mensile` → `Run workflow`

### 3.2 Flusso di esecuzione
```
1. ubuntu-latest runner + Node.js 22
2. npm ci
3. Lista tutti i bucket Supabase Storage
4. Scarica file nuovi/modificati nell'ultimo mese (filtro updated_at)
5. Crea storage_backup_YYYY-MM.zip
6. Cifra con AES-256-CBC → storage_backup_YYYY-MM.zip.enc
7. GitHub Release: tag storage-backup/YYYY-MM
8. Elimina release storage-backup/ più vecchie di 12 mesi
```

### 3.3 GitHub Secrets richiesti
| Secret | Descrizione |
|:---|:---|
| `SUPABASE_URL` | URL API Supabase (già esistente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (già esistente) |
| `BACKUP_PASSPHRASE` | Stessa usata per il backup DB |

---

## 4. Storage Backup — Script Locale On-Demand

**File**: [`scripts/backup_storage.js`](../scripts/backup_storage.js)

### 4.1 Utilizzo
```bash
npm run backup:storage
```

### 4.2 Prerequisiti
- File `.env` con `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

### 4.3 Comportamento
- Primo avvio: scarica **tutti** i file presenti nei bucket
- Avvii successivi: scarica solo file **nuovi o modificati** (backup differenziale)
- I file vengono salvati in `./local_backup/storage/[bucket]/[path]`
- Il manifest `backup_storage_manifest.json` tiene traccia di ciò che è già stato scaricato
- Entrambi `local_backup/` e `backup_storage_manifest.json` sono in `.gitignore` — non vengono mai committati

---

## 5. Procedura di Ripristino Database (Disaster Recovery)

In caso di perdita totale o corruzione del database:

### 5.1 Prerequisiti locali
```bash
# Su Ubuntu/Debian:
sudo apt-get install postgresql-client openssl

# Su macOS (Homebrew):
brew install postgresql openssl
```

### 5.2 Step di ripristino
```bash
# 1. Scarica il file .dump.enc dall'ultima GitHub Release backup/YYYY-MM-DD
#    (GitHub → Repo → Releases → filtra per tag backup/)

# 2. Decifra il dump:
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d \
  -in backup_2026-09-24.dump.enc \
  -out backup_2026-09-24.dump \
  -pass pass:"LA_TUA_BACKUP_PASSPHRASE"

# 3. Verifica che il dump sia valido:
pg_restore --list backup_2026-09-24.dump | head -30

# 4. Ripristina sul nuovo progetto Supabase:
#    (usa la Session Pooler connection string del NUOVO progetto)
pg_restore \
  --no-owner \
  --no-privileges \
  --schema=public \
  -d "postgresql://postgres.[new-ref]:[new-pwd]@aws-0-[region].pooler.supabase.com:5432/postgres" \
  backup_2026-09-24.dump

# 5. Ripristina anche auth (utenti autenticati):
pg_restore \
  --no-owner \
  --no-privileges \
  --schema=auth \
  -d "postgresql://postgres.[new-ref]:[new-pwd]@aws-0-[region].pooler.supabase.com:5432/postgres" \
  backup_2026-09-24.dump

# 6. Pulisci i file locali temporanei:
rm -f backup_2026-09-24.dump
```

### 5.3 Ripristino file Storage
```bash
# 1. Scarica storage_backup_YYYY-MM.zip.enc dalla GitHub Release storage-backup/YYYY-MM
# 2. Decifra:
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d \
  -in storage_backup_2026-09.zip.enc \
  -out storage_backup_2026-09.zip \
  -pass pass:"LA_TUA_BACKUP_PASSPHRASE"

# 3. Estrai e ri-carica manualmente i file nel nuovo bucket Storage Supabase
unzip storage_backup_2026-09.zip
```

---

## 6. GitHub Releases — Struttura dei Tag

| Tipo | Pattern tag | Esempio |
|:---|:---|:---|
| Backup DB giornaliero | `backup/YYYY-MM-DD` | `backup/2026-09-24` |
| Backup Storage mensile | `storage-backup/YYYY-MM` | `storage-backup/2026-09` |

Tutti i backup sono creati come **pre-release** (non interferiscono con le release di codice).

---

## 7. Sicurezza e GDPR

Il sistema è conforme alle direttive [SECURITY.md](../SECURITY.md) e al GDPR (Art. 6 & 9):

- ✅ **Crittografia AES-256-CBC** con PBKDF2 (100.000 iterazioni) — standard NIST/FIPS
- ✅ **Nessun dato in chiaro** su GitHub — il dump viene eliminato dal runner immediatamente dopo la cifratura
- ✅ **Secrets esclusivamente in GitHub Secrets** — mai nel codice sorgente
- ✅ **Repository privato** — i release assets non sono accessibili pubblicamente
- ✅ **Backup locale escluso da git** — `local_backup/` e manifest in `.gitignore`
