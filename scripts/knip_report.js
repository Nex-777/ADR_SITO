#!/usr/bin/env node
/**
 * scripts/knip_report.js
 *
 * Elabora il report JSON generato da KNIP (knip --reporter json),
 * genera il GitHub Step Summary e (se presenti anomalie) invia
 * una notifica formattata ad ADR_BOT su Telegram.
 *
 * Exit code sempre 0 (non bloccante per la pipeline).
 */

import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendTelegramNotification({ token, chatId, text }) {
  if (!token || !chatId) {
    console.log('ℹ️ Notifica Telegram saltata: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID non configurati.');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      console.log('✅ Notifica Telegram recapitata con successo su ADR_BOT.');
    } else {
      console.warn(`⚠️ Invio Telegram non riuscito (HTTP ${res.status}):`, body.description || JSON.stringify(body));
    }
  } catch (err) {
    console.warn('⚠️ Errore di connessione durante l\'invio Telegram:', err.message);
  }
}

function writeStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      fs.appendFileSync(summaryPath, markdown + '\n', 'utf8');
      console.log('✅ GitHub Step Summary aggiornato con successo.');
    } catch (err) {
      console.warn('⚠️ Impossibile scrivere su GITHUB_STEP_SUMMARY:', err.message);
    }
  }
}

async function main() {
  const jsonArg = process.argv[2] || 'knip-report.json';
  const reportPath = path.resolve(process.cwd(), jsonArg);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const eventName = process.env.GITHUB_EVENT_NAME || 'manual';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY || 'Nex-777/ADR_SITO';
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl = process.env.RUN_URL || (runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : `${serverUrl}/${repo}/actions`);

  console.log(`🔍 [KNIP Report] Lettura report da: ${reportPath}`);

  let reportData = null;
  let readError = null;

  if (!fs.existsSync(reportPath)) {
    readError = `Il file di report "${jsonArg}" non esiste.`;
  } else {
    try {
      const buffer = fs.readFileSync(reportPath);
      let raw = '';
      if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        raw = buffer.toString('utf16le');
      } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        raw = buffer.toString('utf16be');
      } else {
        raw = buffer.toString('utf8');
      }
      // Rimuovi eventuale BOM
      if (raw.charCodeAt(0) === 0xfeff) {
        raw = raw.slice(1);
      }
      raw = raw.trim();
      if (!raw) {
        readError = 'Il file di report è vuoto.';
      } else {
        reportData = JSON.parse(raw);
      }
    } catch (err) {
      readError = `Errore di parsing JSON: ${err.message}`;
    }
  }

  // Gestione caso di errore critico/mancanza report
  if (readError) {
    console.error(`❌ [KNIP Report] ${readError}`);
    const summaryMd = [
      '## ❌ KNIP Code Quality: Report non valido o mancante',
      '',
      `> **Errore:** ${readError}`,
      '',
      `- **Data/Ora:** ${new Date().toISOString()}`,
      `- **Workflow Run:** [Visualizza Log](${runUrl})`,
      ''
    ].join('\n');

    writeStepSummary(summaryMd);

    if (eventName !== 'pull_request') {
      const tgMsg = [
        '⚠️ <b>ADR_SITO — KNIP Code Quality Scan Fallito</b> ⚠️\n',
        `<b>Stato:</b> Il report KNIP non è stato generato correttamente.`,
        `<b>Dettaglio:</b> <code>${escapeHtml(readError)}</code>\n`,
        `🔗 <a href="${runUrl}">Visualizza Log GitHub Actions</a>`
      ].join('\n');
      await sendTelegramNotification({ token: botToken, chatId, text: tgMsg });
    }
    process.exit(0);
  }

  // Estrazione dati dal report KNIP
  const unusedFiles = Array.isArray(reportData.files) ? reportData.files : [];
  const issuesList = Array.isArray(reportData.issues) ? reportData.issues : [];

  let countDeps = 0;
  let countDevDeps = 0;
  let countUnlisted = 0;
  let countBinaries = 0;
  let countUnresolved = 0;
  let countExports = 0;
  let countTypes = 0;
  let countDuplicates = 0;

  const detailItems = [];

  // 1. File orfani
  for (const f of unusedFiles) {
    detailItems.push({ category: 'File orfano', file: f, name: '' });
  }

  // 2. Issues catalogate per file
  for (const item of issuesList) {
    const file = item.file || 'sconosciuto';

    if (Array.isArray(item.dependencies)) {
      countDeps += item.dependencies.length;
      item.dependencies.forEach(d => detailItems.push({ category: 'Dipendenza non usata', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.devDependencies)) {
      countDevDeps += item.devDependencies.length;
      item.devDependencies.forEach(d => detailItems.push({ category: 'DevDependency non usata', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.unlisted)) {
      countUnlisted += item.unlisted.length;
      item.unlisted.forEach(d => detailItems.push({ category: 'Dipendenza non tracciata', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.binaries)) {
      countBinaries += item.binaries.length;
      item.binaries.forEach(d => detailItems.push({ category: 'Binario non tracciato', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.unresolved)) {
      countUnresolved += item.unresolved.length;
      item.unresolved.forEach(d => detailItems.push({ category: 'Import irrisolto', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.exports)) {
      countExports += item.exports.length;
      item.exports.forEach(d => detailItems.push({ category: 'Export orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.nsExports)) {
      countExports += item.nsExports.length;
      item.nsExports.forEach(d => detailItems.push({ category: 'Export orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.types)) {
      countTypes += item.types.length;
      item.types.forEach(d => detailItems.push({ category: 'Tipo orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.nsTypes)) {
      countTypes += item.nsTypes.length;
      item.nsTypes.forEach(d => detailItems.push({ category: 'Tipo orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.duplicates)) {
      countDuplicates += item.duplicates.length;
      item.duplicates.forEach(d => detailItems.push({ category: 'Export duplicato', file, name: d.name || d.symbol || '' }));
    }
  }

  const totalIssues = unusedFiles.length + countDeps + countDevDeps + countUnlisted +
                      countBinaries + countUnresolved + countExports + countTypes + countDuplicates;

  console.log(`📊 [KNIP Report] Totale anomalie rilevate: ${totalIssues}`);

  // Generazione Markdown per GitHub Step Summary
  const nowIso = new Date().toISOString();
  let summaryMd = '';

  if (totalIssues === 0) {
    summaryMd = [
      '## 🧹 KNIP Code Quality: Tutto Pulito (0 anomalie)',
      '',
      '> Il codebase di **Adrenalina / Epika** non presenta file orfani, dipendenze non utilizzate o export morti.',
      '',
      '| Categoria | Conteggio | Stato |',
      '|---|---|---|',
      '| File non utilizzati | `0` | ✅ Pulito |',
      '| Dipendenze inutilizzate | `0` | ✅ Pulito |',
      '| DevDependencies inutilizzate | `0` | ✅ Pulito |',
      '| Dipendenze non tracciate / Binari | `0` | ✅ Pulito |',
      '| Export / Tipi non utilizzati | `0` | ✅ Pulito |',
      '',
      `- **Data/Ora Scansione:** \`${nowIso}\``,
      `- **Workflow:** \`${eventName}\``
    ].join('\n');
  } else {
    const rows = [
      '## ⚠️ KNIP Code Quality: Rilevate Anomalie',
      '',
      `> KNIP ha rilevato **${totalIssues}** potenziali elementi orfani o inutilizzati nel progetto.`,
      '',
      '| Categoria | Conteggio |',
      '|---|---|',
      `| File non utilizzati | \`${unusedFiles.length}\` |`,
      `| Dipendenze inutilizzate | \`${countDeps}\` |`,
      `| DevDependencies inutilizzate | \`${countDevDeps}\` |`,
      `| Dipendenze non tracciate / Binari | \`${countUnlisted + countBinaries}\` |`,
      `| Export e Tipi non utilizzati | \`${countExports + countTypes}\` |`,
      `| Altri problemi (duplicati, unresolved) | \`${countUnresolved + countDuplicates}\` |`,
      '',
      '### 📋 Dettaglio Prime Voci Rilevate',
      ''
    ];

    const maxListing = 30;
    const slice = detailItems.slice(0, maxListing);
    for (const item of slice) {
      const sym = item.name ? ` → \`${item.name}\`` : '';
      rows.push(`- **[${item.category}]** \`${item.file}\`${sym}`);
    }
    if (detailItems.length > maxListing) {
      rows.push(`- *... e altri ${detailItems.length - maxListing} elementi (vedi artifact ` + '`knip-report.json`)*');
    }

    rows.push('');
    rows.push(`- **Data/Ora Scansione:** \`${nowIso}\``);
    rows.push(`- **Workflow Run:** [Visualizza Log e Artifacts](${runUrl})`);
    summaryMd = rows.join('\n');
  }

  writeStepSummary(summaryMd);
  console.log('\n--- GITHUB STEP SUMMARY PREVIEW ---\n' + summaryMd + '\n-----------------------------------\n');

  // Invio notifica ad ADR_BOT solo se:
  // 1. Ci sono anomalie (totalIssues > 0)
  // 2. Non è un evento 'pull_request' (per non intasare Telegram sui test intermedi di branch)
  // 3. I token sono valorizzati
  if (totalIssues > 0 && eventName !== 'pull_request') {
    const tgLines = [
      '🧹 <b>ADR_SITO — Report KNIP Qualità Codice</b> ⚠️\n',
      `KNIP ha rilevato <b>${totalIssues}</b> elementi non utilizzati o orfani:\n`,
      `• File orfani: <b>${unusedFiles.length}</b>`,
      `• Dipendenze inutilizzate: <b>${countDeps}</b>`,
      `• DevDependencies inutilizzate: <b>${countDevDeps}</b>`,
      `• Export/Tipi orfani: <b>${countExports + countTypes}</b>`,
      `• Dipendenze non tracciate: <b>${countUnlisted + countBinaries}</b>\n`,
      '<b>Primi elementi riscontrati:</b>'
    ];

    const maxTgItems = 12;
    const tgSlice = detailItems.slice(0, maxTgItems);
    for (const it of tgSlice) {
      const sym = it.name ? ` (${escapeHtml(it.name)})` : '';
      tgLines.push(`• <i>${escapeHtml(it.category)}</i>: <code>${escapeHtml(it.file)}</code>${sym}`);
    }
    if (detailItems.length > maxTgItems) {
      tgLines.push(`• <i>... e altri ${detailItems.length - maxTgItems} elementi nel log completo.</i>`);
    }

    tgLines.push('');
    tgLines.push(`🔗 <a href="${runUrl}">Visualizza esecuzione su GitHub Actions</a>`);

    let fullTgText = tgLines.join('\n');
    if (fullTgText.length > 3500) {
      fullTgText = fullTgText.slice(0, 3400) + '\n\n... <i>[Messaggio troncato per limite caratteri]</i>\n' +
        `🔗 <a href="${runUrl}">Visualizza Log Completo</a>`;
    }

    await sendTelegramNotification({ token: botToken, chatId, text: fullTgText });
  } else if (totalIssues === 0) {
    console.log('ℹ️ Nessuna anomalia rilevata: notifica Telegram saltata per evitare rumore.');
  } else {
    console.log(`ℹ️ Notifica Telegram saltata (evento: ${eventName}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Errore imprevisto in knip_report.js:', err);
  process.exit(0); // non bloccare mai la pipeline
});
