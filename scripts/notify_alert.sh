#!/usr/bin/env bash
# scripts/notify_alert.sh
# Notifica allerta fallimento workflow GitHub Actions su Telegram e via Email (Resend)

WORKFLOW_NAME="${1:-Workflow Sconosciuto}"
STATUS="${2:-failure}"
RUN_URL="${3:-https://github.com/Nex-777/ADR_SITO/actions}"
TIMESTAMP=$(date -u "+%Y-%m-%d %H:%M:%S UTC")

echo "📢 [ALERT] Avvio procedura di notifica allerta: ${WORKFLOW_NAME} (${STATUS})"

# ==============================================================================
# 1. NOTIFICA TELEGRAM (JSON sicuro via environment)
# ==============================================================================
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  echo "📱 Invio messaggio Telegram..."
  
  TG_JSON=$(WORKFLOW_NAME="$WORKFLOW_NAME" RUN_URL="$RUN_URL" TIMESTAMP="$TIMESTAMP" TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" node -e '
    const text = `🚨 *ALLERTA SISTEMA ADR_SITO* 🚨\n\n` +
      `*Workflow:* ${process.env.WORKFLOW_NAME}\n` +
      `*Stato:* FALLITO ❌\n` +
      `*Data/Ora:* ${process.env.TIMESTAMP}\n` +
      `*Log:* [Apri esecuzione GitHub Actions](${process.env.RUN_URL})\n\n` +
      `⚠️ Verificare i log per prevenire disallineamenti di dati o coperture mancanti.`;
    console.log(JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    }));
  ')

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "${TG_JSON}" > /dev/null 2>&1
  echo "✅ Richiesta Telegram inviata."
else
  echo "ℹ️ Notifica Telegram saltata: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID non definiti nei secrets."
fi

# ==============================================================================
# 2. NOTIFICA EMAIL RESEND (JSON sicuro via environment)
# ==============================================================================
if [ -n "$RESEND_API_KEY" ] && [ -n "$ALERT_EMAIL_TO" ]; then
  echo "📧 Invio email di allerta a ${ALERT_EMAIL_TO}..."

  EMAIL_JSON=$(WORKFLOW_NAME="$WORKFLOW_NAME" RUN_URL="$RUN_URL" TIMESTAMP="$TIMESTAMP" ALERT_EMAIL_TO="$ALERT_EMAIL_TO" node -e '
    const subject = `🚨 [ALLERTA] Fallimento: ${process.env.WORKFLOW_NAME}`;
    const html = `
      <div style="font-family: Arial, sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; border-radius: 8px;">
        <h2 style="color: #df293e; margin-top: 0;">🚨 Allerta Sistema Adrenalina Club</h2>
        <p style="font-size: 15px; color: #eeeeee;">Il seguente processo notturno automatico è <strong>FALLITO</strong>:</p>
        <div style="background-color: #1a1a1a; padding: 18px; border-left: 4px solid #df293e; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 6px 0;"><strong>Workflow:</strong> ${process.env.WORKFLOW_NAME}</p>
          <p style="margin: 6px 0;"><strong>Stato:</strong> Fallito (Exit code non-zero o timeout)</p>
          <p style="margin: 6px 0;"><strong>Data/Ora:</strong> ${process.env.TIMESTAMP}</p>
          <p style="margin: 6px 0;"><strong>Log GitHub:</strong> <a href="${process.env.RUN_URL}" style="color: #58a6ff;">Visualizza Log Run</a></p>
        </div>
        <p style="color: #adaaaa; font-size: 13px;">Si prega di verificare i log per garantire la tempestiva riconciliazione dei tesserati e la validità dei backup.</p>
      </div>
    `.trim();
    console.log(JSON.stringify({
      from: "Adrenalina Club Ops <noreply@adrenalinaclub.it>",
      to: [process.env.ALERT_EMAIL_TO],
      subject: subject,
      html: html
    }));
  ')

  curl -s -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${EMAIL_JSON}" > /dev/null 2>&1
  echo "✅ Richiesta Email inviata."
else
  echo "ℹ️ Notifica Email saltata: RESEND_API_KEY o ALERT_EMAIL_TO non definiti nei secrets."
fi

echo "📢 Procedura di notifica completata."
exit 0
