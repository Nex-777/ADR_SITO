#!/usr/bin/env node
/**
 * scripts/knip_report.js
 *
 * Elabora il report JSON generato da KNIP (knip --reporter json),
 * genera il GitHub Step Summary e invia notifiche ad ADR_BOT su Telegram:
 *  - Immediata in caso di anomalie riscontrate o crash del processo.
 *  - Mensile (heartbeat educativo al 1° lunedì del mese) a scopo di monitoraggio.
 *
 * Exit code sempre 0 (non bloccante per la pipeline).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mdCode(str) {
  if (!str) return '';
  return String(str)
    .replace(/`/g, "'")
    .replace(/\|/g, '/');
}

export function isFirstMondayOfMonth(date = new Date()) {
  // getUTCDay: 0=Domenica, 1=Lunedì, ..., 6=Sabato
  // Il primo lunedì del mese cade obbligatoriamente tra il giorno 1 e il 7
  return date.getUTCDay() === 1 && date.getUTCDate() <= 7;
}

export function parseKnipReport(rawString) {
  let reportData = null;
  try {
    reportData = JSON.parse(rawString);
  } catch (err) {
    throw new Error(`Errore di parsing JSON: ${err.message}`);
  }

  const unusedFiles = Array.isArray(reportData.files) ? reportData.files : [];
  const issuesList = Array.isArray(reportData.issues) ? reportData.issues : [];

  const counts = {
    files: unusedFiles.length,
    dependencies: 0,
    devDependencies: 0,
    unlisted: 0,
    binaries: 0,
    unresolved: 0,
    exports: 0,
    types: 0,
    duplicates: 0,
    total: 0
  };

  const detailItems = [];

  for (const f of unusedFiles) {
    detailItems.push({ category: 'File orfano', file: f, name: '' });
  }

  for (const item of issuesList) {
    const file = item.file || 'sconosciuto';

    if (Array.isArray(item.dependencies)) {
      counts.dependencies += item.dependencies.length;
      item.dependencies.forEach(d => detailItems.push({ category: 'Dipendenza non usata', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.devDependencies)) {
      counts.devDependencies += item.devDependencies.length;
      item.devDependencies.forEach(d => detailItems.push({ category: 'DevDependency non usata', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.unlisted)) {
      counts.unlisted += item.unlisted.length;
      item.unlisted.forEach(d => detailItems.push({ category: 'Dipendenza non tracciata', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.binaries)) {
      counts.binaries += item.binaries.length;
      item.binaries.forEach(d => detailItems.push({ category: 'Binario non tracciato', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.unresolved)) {
      counts.unresolved += item.unresolved.length;
      item.unresolved.forEach(d => detailItems.push({ category: 'Import irrisolto', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.exports)) {
      counts.exports += item.exports.length;
      item.exports.forEach(d => detailItems.push({ category: 'Export orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.nsExports)) {
      counts.exports += item.nsExports.length;
      item.nsExports.forEach(d => detailItems.push({ category: 'Export orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.types)) {
      counts.types += item.types.length;
      item.types.forEach(d => detailItems.push({ category: 'Tipo orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.nsTypes)) {
      counts.types += item.nsTypes.length;
      item.nsTypes.forEach(d => detailItems.push({ category: 'Tipo orfano', file, name: d.name || d.symbol || '' }));
    }
    if (Array.isArray(item.duplicates)) {
      counts.duplicates += item.duplicates.length;
      item.duplicates.forEach(d => detailItems.push({ category: 'Export duplicato', file, name: d.name || d.symbol || '' }));
    }
  }

  counts.total = counts.files + counts.dependencies + counts.devDependencies +
                 counts.unlisted + counts.binaries + counts.unresolved +
                 counts.exports + counts.types + counts.duplicates;

  return { unusedFiles, issuesList, counts, totalIssues: counts.total, detailItems };
}

export function buildMarkdownSummary({ totalIssues, unusedFiles, counts, detailItems, nowIso, eventName, runUrl }) {
  if (totalIssues === 0) {
    return [
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
      '| Altro (duplicati, unresolved) | `0` | ✅ Pulito |',
      '',
      `- **Data/Ora Scansione:** \`${nowIso}\``,
      `- **Workflow Event:** \`${eventName}\``,
      `- **Workflow Run:** [Visualizza Log e Artifacts](${runUrl})`
    ].join('\n');
  }

  const rows = [
    '## ⚠️ KNIP Code Quality: Rilevate Anomalie',
    '',
    `> KNIP ha rilevato **${totalIssues}** potenziali elementi orfani o inutilizzati nel progetto.`,
    '',
    '| Categoria | Conteggio |',
    '|---|---|',
    `| File non utilizzati | \`${unusedFiles.length}\` |`,
    `| Dipendenze inutilizzate | \`${counts.dependencies}\` |`,
    `| DevDependencies inutilizzate | \`${counts.devDependencies}\` |`,
    `| Dipendenze non tracciate / Binari | \`${counts.unlisted + counts.binaries}\` |`,
    `| Export e Tipi non utilizzati | \`${counts.exports + counts.types}\` |`,
    `| Altri problemi (duplicati, unresolved) | \`${counts.unresolved + counts.duplicates}\` |`,
    '',
    '### 📋 Dettaglio Prime Voci Rilevate',
    ''
  ];

  const maxListing = 30;
  const slice = detailItems.slice(0, maxListing);
  for (const item of slice) {
    const sym = item.name ? ` → \`${mdCode(item.name)}\`` : '';
    rows.push(`- **[${mdCode(item.category)}]** \`${mdCode(item.file)}\`${sym}`);
  }
  if (detailItems.length > maxListing) {
    rows.push(`- *... e altri ${detailItems.length - maxListing} elementi (vedi artifact ` + '`knip-report.json`)*');
  }

  rows.push('');
  rows.push(`- **Data/Ora Scansione:** \`${nowIso}\``);
  rows.push(`- **Workflow Run:** [Visualizza Log e Artifacts](${runUrl})`);
  return rows.join('\n');
}

export function buildTelegramAnomaliesMessage({ totalIssues, counts, detailItems, runUrl }) {
  const headerLines = [
    '🧹 <b>ADR_SITO — Report KNIP Qualità Codice</b> ⚠️\n',
    `KNIP ha rilevato <b>${totalIssues}</b> elementi non utilizzati o orfani:\n`,
    `• File orfani: <b>${counts.files}</b>`,
    `• Dipendenze inutilizzate: <b>${counts.dependencies}</b>`,
    `• DevDependencies inutilizzate: <b>${counts.devDependencies}</b>`,
    `• Export/Tipi orfani: <b>${counts.exports + counts.types}</b>`,
    `• Dipendenze non tracciate: <b>${counts.unlisted + counts.binaries}</b>`,
    `• Altro (irrisolti/duplicati): <b>${counts.unresolved + counts.duplicates}</b>\n`,
    '<b>Primi elementi riscontrati:</b>'
  ];

  let currentMsg = headerLines.join('\n') + '\n';
  const footer = `\n🔗 <a href="${runUrl}">Visualizza esecuzione su GitHub Actions</a>`;
  const maxSafeChars = 3400; // Riserva ampio margine rispetto al limite 4096 di Telegram

  let itemsAdded = 0;
  for (let i = 0; i < detailItems.length; i++) {
    const it = detailItems[i];
    const sym = it.name ? ` (${escapeHtml(it.name)})` : '';
    const line = `• <i>${escapeHtml(it.category)}</i>: <code>${escapeHtml(it.file)}</code>${sym}\n`;
    const remainingCount = detailItems.length - (i + 1);
    const overflowNote = remainingCount > 0 ? `• <i>... e altri ${remainingCount} elementi nel log completo.</i>\n` : '';

    // Verifica se aggiungere questa riga sfora il budget sicuro
    if (currentMsg.length + line.length + overflowNote.length + footer.length > maxSafeChars) {
      const pending = detailItems.length - itemsAdded;
      if (pending > 0) {
        currentMsg += `• <i>... e altri ${pending} elementi nel log completo.</i>\n`;
      }
      break;
    }

    currentMsg += line;
    itemsAdded++;
  }

  currentMsg += footer;
  return currentMsg;
}

export function buildTelegramHeartbeatMessage({ runUrl }) {
  return [
    '🧹 <b>ADR_SITO — Manutenzione Mensile Codice (KNIP)</b> ℹ️\n',
    'Promemoria automatico di controllo qualità del primo lunedì del mese.\n',
    '<b>Cos\'è questo controllo?</b>',
    'KNIP è lo strumento automatico che analizza l\'intero portale Adrenalina/Epika (API serverless, pagine del portale, script di sincronizzazione e funzioni database) per stanare:',
    '• File abbandonati o dimenticati nel repository',
    '• Librerie installate (package.json) ma non più utilizzate',
    '• Funzioni esportate ma mai richiamate altrove\n',
    '<b>Esito della scansione odierna:</b>',
    '✅ <b>TUTTO PULITO — Nessun elemento orfano rilevato!</b>',
    'Il codice è snello, non ci sono sprechi di dipendenze e tutte le rotte/script risultano attivi e referenziati.\n',
    '<i>Prossimo promemoria tra un mese. Riceverai notifiche prima solo se verranno rilevati file o pacchetti inutilizzati.</i>\n',
    `🔗 <a href="${runUrl}">Visualizza log di dettaglio su GitHub Actions</a>`
  ].join('\n');
}

export async function sendTelegramNotification({ token, chatId, text }) {
  if (!token || !chatId) {
    console.log('ℹ️ Notifica Telegram saltata: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID non configurati.');
    return false;
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
      return true;
    } else {
      console.warn(`⚠️ Invio Telegram non riuscito (HTTP ${res.status}):`, body.description || JSON.stringify(body));
      return false;
    }
  } catch (err) {
    console.warn('⚠️ Errore di connessione durante l\'invio Telegram:', err.message);
    return false;
  }
}

export function writeStepSummary(markdown) {
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

export async function main() {
  const jsonArg = process.argv[2] || 'knip-report.json';
  const reportPath = path.resolve(process.cwd(), jsonArg);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const eventName = process.env.GITHUB_EVENT_NAME || 'manual';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY || 'Nex-777/ADR_SITO';
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl = process.env.RUN_URL || (runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : `${serverUrl}/${repo}/actions`);
  const knipExitEnv = process.env.KNIP_EXIT;
  const knipExitCode = knipExitEnv !== undefined && knipExitEnv !== '' ? parseInt(knipExitEnv, 10) : 0;

  console.log(`🔍 [KNIP Report] Lettura report da: ${reportPath} (KNIP_EXIT=${knipExitCode})`);

  let reportData = null;
  let readError = null;

  // Rilevamento Crash KNIP (exit code > 1 indica crash / fatal error, non semplici issue trovate)
  if (knipExitCode > 1) {
    readError = `Il processo KNIP si è interrotto con codice di errore fatale: ${knipExitCode}`;
  } else if (!fs.existsSync(reportPath)) {
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
      if (raw.charCodeAt(0) === 0xfeff) {
        raw = raw.slice(1);
      }
      raw = raw.trim();
      if (!raw) {
        readError = 'Il file di report è vuoto.';
      } else {
        reportData = parseKnipReport(raw);
      }
    } catch (err) {
      readError = err.message;
    }
  }

  // Gestione Errore Critico / Crash
  if (readError) {
    console.error(`❌ [KNIP Report] ${readError}`);
    const summaryMd = [
      '## ❌ KNIP Code Quality: Report non valido o Scansione Fallita',
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
        `<b>Stato:</b> Il processo KNIP ha riscontrato un errore fatale o non ha generato il report.`,
        `<b>Dettaglio:</b> <code>${escapeHtml(readError)}</code>\n`,
        `🔗 <a href="${runUrl}">Visualizza Log GitHub Actions</a>`
      ].join('\n');
      await sendTelegramNotification({ token: botToken, chatId, text: tgMsg });
    }
    process.exit(0);
  }

  const { unusedFiles, counts, totalIssues, detailItems } = reportData;
  const nowIso = new Date().toISOString();

  console.log(`📊 [KNIP Report] Totale anomalie rilevate: ${totalIssues}`);

  // Generazione Markdown Step Summary
  const summaryMd = buildMarkdownSummary({
    totalIssues,
    unusedFiles,
    counts,
    detailItems,
    nowIso,
    eventName,
    runUrl
  });

  writeStepSummary(summaryMd);
  console.log('\n--- GITHUB STEP SUMMARY PREVIEW ---\n' + summaryMd + '\n-----------------------------------\n');

  // Gestione Notifiche Telegram su ADR_BOT
  if (eventName === 'pull_request') {
    console.log('ℹ️ Notifica Telegram saltata: evento pull_request.');
    process.exit(0);
  }

  if (totalIssues > 0) {
    // 1. Anomalie riscontrate -> Notifica Immediata con Dettaglio
    const tgMsg = buildTelegramAnomaliesMessage({
      totalIssues,
      counts,
      detailItems,
      runUrl
    });
    await sendTelegramNotification({ token: botToken, chatId, text: tgMsg });
  } else {
    // 2. Nessuna anomalia (Codebase pulito) -> Notifica solo se Heartbeat mensile
    const isHeartbeatScheduled = isFirstMondayOfMonth(new Date()) && eventName === 'schedule';
    const forceHeartbeat = process.env.FORCE_HEARTBEAT === 'true';

    if (isHeartbeatScheduled || forceHeartbeat) {
      console.log('💓 [KNIP Report] Trigger Heartbeat Mensile attivo: invio promemoria su ADR_BOT...');
      const hbMsg = buildTelegramHeartbeatMessage({ runUrl });
      await sendTelegramNotification({ token: botToken, chatId, text: hbMsg });
    } else {
      console.log('ℹ️ Nessuna anomalia rilevata: notifica Telegram saltata (non è la data dell\'heartbeat mensile).');
    }
  }

  process.exit(0);
}

// Esecuzione diretta via CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ Errore imprevisto in knip_report.js:', err);
    process.exit(0);
  });
}
