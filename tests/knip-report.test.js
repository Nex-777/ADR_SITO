import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  mdCode,
  isFirstMondayOfMonth,
  parseKnipReport,
  buildMarkdownSummary,
  buildTelegramAnomaliesMessage,
  buildTelegramHeartbeatMessage
} from '../scripts/knip_report.js';

describe('knip_report.js - Unit Tests', () => {
  describe('Sanitization Helpers', () => {
    it('escapeHtml deve sanitizzare entità HTML pericolose', () => {
      expect(escapeHtml('<script>alert("xss")&foo</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&amp;foo&lt;/script&gt;');
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
    });

    it('mdCode deve neutralizzare caratteri critici per le tabelle Markdown', () => {
      expect(mdCode('file`with`backticks|pipe')).toBe("file'with'backticks/pipe");
      expect(mdCode('')).toBe('');
      expect(mdCode(null)).toBe('');
    });
  });

  describe('isFirstMondayOfMonth', () => {
    it('deve riconoscere correttamente il primo lunedì del mese', () => {
      // 2026-10-05 è lunedì ed è il giorno 5 (<= 7) -> PRIMO LUNEDÌ
      const firstMonday = new Date(Date.UTC(2026, 9, 5, 2, 0, 0));
      expect(isFirstMondayOfMonth(firstMonday)).toBe(true);

      // 2026-10-12 è lunedì ma è il giorno 12 (> 7) -> SECONDO LUNEDÌ
      const secondMonday = new Date(Date.UTC(2026, 9, 12, 2, 0, 0));
      expect(isFirstMondayOfMonth(secondMonday)).toBe(false);

      // 2026-10-04 è domenica (giorno 4)
      const sunday = new Date(Date.UTC(2026, 9, 4, 2, 0, 0));
      expect(isFirstMondayOfMonth(sunday)).toBe(false);

      // 2026-11-02 è lunedì ed è il giorno 2 (<= 7) -> PRIMO LUNEDÌ
      const novFirstMonday = new Date(Date.UTC(2026, 10, 2, 2, 0, 0));
      expect(isFirstMondayOfMonth(novFirstMonday)).toBe(true);
    });
  });

  describe('parseKnipReport', () => {
    it('deve analizzare correttamente un report pulito (0 issues)', () => {
      const raw = JSON.stringify({ files: [], issues: [] });
      const res = parseKnipReport(raw);

      expect(res.totalIssues).toBe(0);
      expect(res.unusedFiles).toEqual([]);
      expect(res.counts.files).toBe(0);
      expect(res.counts.dependencies).toBe(0);
      expect(res.counts.devDependencies).toBe(0);
      expect(res.counts.exports).toBe(0);
      expect(res.detailItems).toEqual([]);
    });

    it('deve analizzare e categorizzare tutte le tipologie di anomalie', () => {
      const raw = JSON.stringify({
        files: ['scripts/orphan1.js', 'portal/orphan2.js'],
        issues: [
          {
            file: 'package.json',
            dependencies: [{ name: 'pkg-unused' }],
            devDependencies: [{ name: 'dev-unused' }],
            unlisted: [{ name: 'pkg-unlisted' }],
            binaries: [{ name: 'bin-unlisted' }]
          },
          {
            file: 'api/test.js',
            exports: [{ name: 'deadFunc' }],
            types: [{ name: 'DeadType' }],
            unresolved: [{ name: './missing.js' }],
            duplicates: [[{ name: 'dup1' }]]
          }
        ]
      });

      const res = parseKnipReport(raw);
      expect(res.counts.files).toBe(2);
      expect(res.counts.dependencies).toBe(1);
      expect(res.counts.devDependencies).toBe(1);
      expect(res.counts.unlisted).toBe(1);
      expect(res.counts.binaries).toBe(1);
      expect(res.counts.exports).toBe(1);
      expect(res.counts.types).toBe(1);
      expect(res.counts.unresolved).toBe(1);
      expect(res.counts.duplicates).toBe(1);
      expect(res.totalIssues).toBe(10);
      expect(res.detailItems.length).toBe(10);
    });

    it('deve lanciare eccezione con messaggio chiaro su JSON malformato', () => {
      expect(() => parseKnipReport('{ bad json')).toThrow(/Errore di parsing JSON/);
    });
  });

  describe('buildMarkdownSummary', () => {
    it('deve produrre la tabella pulita se totalIssues === 0', () => {
      const md = buildMarkdownSummary({
        totalIssues: 0,
        unusedFiles: [],
        counts: { files: 0, dependencies: 0, devDependencies: 0, unlisted: 0, binaries: 0, exports: 0, types: 0, unresolved: 0, duplicates: 0 },
        detailItems: [],
        nowIso: '2026-10-07T12:00:00Z',
        eventName: 'schedule',
        runUrl: 'https://github.com/Nex-777/ADR_SITO/actions/runs/123'
      });

      expect(md).toContain('Tutto Pulito (0 anomalie)');
      expect(md).toContain('✅ Pulito');
    });

    it('deve includere le categorie e i dettagli se ci sono anomalie', () => {
      const md = buildMarkdownSummary({
        totalIssues: 1,
        unusedFiles: ['scripts/old.js'],
        counts: { files: 1, dependencies: 0, devDependencies: 0, unlisted: 0, binaries: 0, exports: 0, types: 0, unresolved: 0, duplicates: 0 },
        detailItems: [{ category: 'File orfano', file: 'scripts/old.js', name: '' }],
        nowIso: '2026-10-07T12:00:00Z',
        eventName: 'schedule',
        runUrl: 'https://github.com/Nex-777/ADR_SITO/actions/runs/123'
      });

      expect(md).toContain('Rilevate Anomalie');
      expect(md).toContain('scripts/old.js');
    });
  });

  describe('Telegram Messages Formatting', () => {
    it('buildTelegramAnomaliesMessage deve quadrare i conteggi del riepilogo con totalIssues', () => {
      const counts = {
        files: 2,
        dependencies: 1,
        devDependencies: 1,
        exports: 1,
        types: 1,
        unlisted: 1,
        binaries: 1,
        unresolved: 1,
        duplicates: 1
      };
      const totalIssues = 10;
      const detailItems = [
        { category: 'File orfano', file: 'f1.js', name: '' },
        { category: 'File orfano', file: 'f2.js', name: '' },
        { category: 'Dipendenza non usata', file: 'package.json', name: 'dep1' }
      ];

      const msg = buildTelegramAnomaliesMessage({
        totalIssues,
        counts,
        detailItems,
        runUrl: 'https://github.com/test'
      });

      expect(msg).toContain('<b>10</b> elementi non utilizzati o orfani');
      expect(msg).toContain('File orfani: <b>2</b>');
      expect(msg).toContain('Dipendenze inutilizzate: <b>1</b>');
      expect(msg).toContain('DevDependencies inutilizzate: <b>1</b>');
      expect(msg).toContain('Export/Tipi orfani: <b>2</b>');
      expect(msg).toContain('Dipendenze non tracciate: <b>2</b>');
      expect(msg).toContain('Altro (irrisolti/duplicati): <b>2</b>');
    });

    it('buildTelegramAnomaliesMessage non deve mai spezzare tag HTML anche con centinaia di elementi', () => {
      const counts = { files: 150, dependencies: 0, devDependencies: 0, exports: 0, types: 0, unlisted: 0, binaries: 0, unresolved: 0, duplicates: 0 };
      const detailItems = [];
      for (let i = 0; i < 150; i++) {
        detailItems.push({
          category: 'File orfano',
          file: `very/long/nested/directory/path/to/some/deeply/nested/source/file_index_${i}.javascript`,
          name: ''
        });
      }

      const msg = buildTelegramAnomaliesMessage({
        totalIssues: 150,
        counts,
        detailItems,
        runUrl: 'https://github.com/Nex-777/ADR_SITO/actions/runs/999'
      });

      // Il messaggio deve essere ben entro i 4096 caratteri
      expect(msg.length).toBeLessThan(3600);
      expect(msg).toContain('elementi nel log completo');
      // Verifichiamo che i tag aperti siano chiusi
      const openCodes = (msg.match(/<code>/g) || []).length;
      const closeCodes = (msg.match(/<\/code>/g) || []).length;
      expect(openCodes).toBe(closeCodes);

      const openI = (msg.match(/<i>/g) || []).length;
      const closeI = (msg.match(/<\/i>/g) || []).length;
      expect(openI).toBe(closeI);

      const openB = (msg.match(/<b>/g) || []).length;
      const closeB = (msg.match(/<\/b>/g) || []).length;
      expect(openB).toBe(closeB);
    });

    it('buildTelegramHeartbeatMessage deve produrre il promemoria chiaro, descrittivo ed educativo', () => {
      const hb = buildTelegramHeartbeatMessage({ runUrl: 'https://github.com/run/123' });
      expect(hb).toContain('Manutenzione Mensile Codice (KNIP)');
      expect(hb).toContain("Cos'è questo controllo?");
      expect(hb).toContain('TUTTO PULITO — Nessun elemento orfano rilevato!');
      expect(hb).toContain('Prossimo promemoria tra un mese');
      expect(hb).toContain('Visualizza log di dettaglio su GitHub Actions');
    });
  });
});
