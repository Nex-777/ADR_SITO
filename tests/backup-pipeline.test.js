import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { verifyTocTables, CRITICAL_TABLES } from '../scripts/test_backup_restore.js';

describe('🛡️ Backup Pipeline & Smoke Test Guardrails', () => {
    describe('1. TOC Parser & Table Integrity (verifyTocTables)', () => {
        it('identifica correttamente tutte le tabelle critiche da un dump TOC valido', () => {
            const mockToc = `
;
; Archive created at 2026-10-25 01:00:00 UTC
;
2000; 2615 2200 SCHEMA - public postgres
2001; 2615 2201 SCHEMA - auth supabase_admin
${CRITICAL_TABLES.map((tbl, idx) => `
${3000 + idx}; 1259 ${4000 + idx} TABLE public ${tbl} postgres
${5000 + idx}; 0 ${4000 + idx} TABLE DATA public ${tbl} postgres
`).join('\n')}
`;
            const report = verifyTocTables(mockToc, CRITICAL_TABLES);
            expect(report.missing).toHaveLength(0);
            expect(report.verified).toHaveLength(CRITICAL_TABLES.length);
            expect(report.hasPublicSchema).toBe(true);
            expect(report.hasAuthSchema).toBe(true);
            expect(report.verified.every(v => v.hasData)).toBe(true);
        });

        it('segnala come mancante una tabella assente dal dump', () => {
            const incompleteToc = `
2000; 2615 2200 SCHEMA - public postgres
3001; 1259 4001 TABLE public utenti postgres
5001; 0 4001 TABLE DATA public utenti postgres
`;
            const report = verifyTocTables(incompleteToc, CRITICAL_TABLES);
            expect(report.missing).toContain('feedback_reports');
            expect(report.missing).toContain('atti_adesione');
            expect(report.missing.length).toBeGreaterThan(0);
        });

        it('previene falsi positivi da indici o prefissi parziali', () => {
            // Esempio: "nestore_pasti_archivio" o indice "idx_nestore_pasti" NON deve validare "nestore_pasti"
            const falsePositiveToc = `
2000; 2615 2200 SCHEMA - public postgres
3001; 1259 4001 TABLE public nestore_pasti_extra postgres
5001; 0 4001 TABLE DATA public nestore_pasti_extra postgres
6001; 1259 5001 INDEX public idx_nestore_pasti postgres
`;
            const report = verifyTocTables(falsePositiveToc, ['nestore_pasti']);
            expect(report.missing).toContain('nestore_pasti');
            expect(report.verified).toHaveLength(0);
        });

        it('include sempre la tabella feedback_reports nella lista delle tabelle critiche', () => {
            expect(CRITICAL_TABLES).toContain('feedback_reports');
            expect(CRITICAL_TABLES).toContain('utenti');
            expect(CRITICAL_TABLES).toContain('anagrafiche');
            expect(CRITICAL_TABLES).toContain('epika_profili');
            expect(CRITICAL_TABLES).toContain('nestore_allenamenti');
        });
    });

    describe('2. Verifiche Statiche di Sicurezza su scripts/test_backup_restore.js', () => {
        const scriptContent = fs.readFileSync(path.resolve('scripts/test_backup_restore.js'), 'utf8');

        it('NON deve utilizzare -k con interpolazione shell della passphrase (prevenzione shell-injection)', () => {
            expect(scriptContent).not.toMatch(/-k\s+["']?\$\{passphrase\}["']?/i);
            expect(scriptContent).not.toMatch(/-k\s+["']?\$BACKUP_PASSPHRASE["']?/i);
        });

        it('deve passare la passphrase in modo sicuro tramite env:BACKUP_PASSPHRASE', () => {
            expect(scriptContent).toMatch(/-pass\s+env:BACKUP_PASSPHRASE/);
        });

        it('deve specificare iterazioni PBKDF2 pari a 100000 conformemente a backup_db.yml', () => {
            expect(scriptContent).toMatch(/-iter\s+100000/);
        });

        it('deve forzare o supportare pg_restore versione 17 su Linux', () => {
            expect(scriptContent).toMatch(/\/usr\/lib\/postgresql\/17\/bin\/pg_restore/);
        });
    });

    describe('3. Verifiche Statiche sui Workflow GitHub Actions', () => {
        const backupDbYaml = fs.readFileSync(path.resolve('.github/workflows/backup_db.yml'), 'utf8');
        const smokeTestYaml = fs.readFileSync(path.resolve('.github/workflows/smoke_test_backup.yml'), 'utf8');
        const storageYaml = fs.readFileSync(path.resolve('.github/workflows/backup_storage_monthly.yml'), 'utf8');

        it('i workflow critici di backup devono avere runner con versione OS fissata (ubuntu-24.04)', () => {
            expect(backupDbYaml).toMatch(/runs-on:\s*ubuntu-24\.04/);
            expect(smokeTestYaml).toMatch(/runs-on:\s*ubuntu-24\.04/);
            expect(storageYaml).toMatch(/runs-on:\s*ubuntu-24\.04/);
        });

        it('backup_db.yml e smoke_test_backup.yml devono utilizzare la composite action setup-pg17', () => {
            expect(backupDbYaml).toMatch(/uses:\s*\.\/\.github\/actions\/setup-pg17/);
            expect(smokeTestYaml).toMatch(/uses:\s*\.\/\.github\/actions\/setup-pg17/);
        });

        it('backup_db.yml non deve interpolare secrets sensibili direttamente nel corpo run', () => {
            // Estrai tutti i blocchi run:
            const runBlocks = backupDbYaml.split(/run:\s*\|/);
            for (let i = 1; i < runBlocks.length; i++) {
                const block = runBlocks[i].split(/\n\s*-\s+name:/)[0];
                expect(block).not.toContain('${{ secrets.SUPABASE_DB_URL }}');
                expect(block).not.toContain('${{ secrets.BACKUP_PASSPHRASE }}');
            }
        });

        it('tutti i workflow che creano o gestiscono release devono avere permessi espliciti contents', () => {
            expect(backupDbYaml).toMatch(/permissions:\s*\n\s*contents:\s*write/);
            expect(storageYaml).toMatch(/permissions:\s*\n\s*contents:\s*write/);
            expect(smokeTestYaml).toMatch(/permissions:\s*\n\s*contents:\s*read/);
        });
    });
});
