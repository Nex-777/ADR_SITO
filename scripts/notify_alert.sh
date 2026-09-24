#!/usr/bin/env bash
# scripts/notify_alert.sh
# Notifica allerta fallimento workflow GitHub Actions su Telegram e via Email (Resend)

WORKFLOW_NAME="${1:-Workflow Sconosciuto}"
STATUS="${2:-failure}"
RUN_URL="${3:-https://github.com/Nex-777/ADR_SITO/actions}"
TIMESTAMP=$(date -u "+%Y-%m-%d %H:%M:%S UTC")

echo "📢 [ALERT] Avvio procedura di notifica allerta: ${WORKFLOW_NAME} (${STATUS})"

# ==============================================================================
# 1. NOTIFICA TELEGRAM
# ==============================================================================
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  echo "📱 Invio messaggio Telegram..."
  TG_TEXT="🚨 *ALLERTA SISTEMA ADR_SITO* 🚨%0A%0A"
  TG_TEXT+="*Workflow:* ${WORKFLOW_NAME}%0A"
  TG_TEXT+="*Stato:* FALLITO ❌%0A"
  TG_TEXT+="*Data/Ora:* ${TIMESTAMP}%0A"
  TG_TEXT+="*Log:* [Apri esecuzione GitHub Actions](${RUN_URL})%0A%0A"
  TG_TEXT+="⚠️ Verificare i log per prevenire disallineamenti di dati o coperture mancanti."

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "text=${TG_TEXT}" \
    -d "parse_mode=Markdown" \
    -d "disable_web_page_preview=true" > /dev/null 2>&1
  echo "✅ Richiesta Telegram inviata."
else
  echo "ℹ️ Notifica Telegram saltata: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID non definiti nei secrets."
fi

# ==============================================================================
# 2. NOTIFICA EMAIL RESEND
# ==============================================================================
if [ -n "$RESEND_API_KEY" ] && [ -n "$ALERT_EMAIL_TO" ]; then
  echo "📧 Invio email di allerta a ${ALERT_EMAIL_TO}..."
  EMAIL_SUBJECT="🚨 [ALLERTA] Fallimento: ${WORKFLOW_NAME}"
  
  EMAIL_HTML="<div style=\"font-family: Arial, sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; border-radius: 8px;\">"
  EMAIL_HTML+="<h2 style=\"color: #df293e; margin-top: 0;\">🚨 Allerta Sistema Adrenalina Club</h2>"
  EMAIL_HTML+="<p style=\"font-size: 15px; color: #eeeeee;\">Il seguente processo notturno automatico è <strong>FALLITO</strong>:</p>"
  EMAIL_HTML+="<div style=\"background-color: #1a1a1a; padding: 18px; border-left: 4px solid #df293e; margin: 20px 0; border-radius: 4px;\">"
  EMAIL_HTML+="<p style=\"margin: 6px 0;\"><strong>Workflow:</strong> ${WORKFLOW_NAME}</p>"
  EMAIL_HTML+="<p style=\"margin: 6px 0;\"><strong>Stato:</strong> Fallito (Exit code non-zero o timeout)</p>"
  EMAIL_HTML+="<p style=\"margin: 6px 0;\"><strong>Data/Ora:</strong> ${TIMESTAMP}</p>"
  EMAIL_HTML+="<p style=\"margin: 6px 0;\"><strong>Log GitHub:</strong> <a href=\"${RUN_URL}\" style=\"color: #58a6ff;\">Visualizza Log Run</a></p>"
  EMAIL_HTML+="</div>"
  EMAIL_HTML+="<p style=\"color: #adaaaa; font-size: 13px;\">Si prega di verificare i log per garantire la tempestiva riconciliazione dei tesserati e la validità dei backup.</p>"
  EMAIL_HTML+="</div>"

  JSON_PAYLOAD=$(node -e "
    const to = process.env.ALERT_EMAIL_TO;
    const sub = process.argv[1];
    const html = process.argv[2];
    console.log(JSON.stringify({
      from: 'Adrenalina Club Ops <noreply@adrenalinaclub.it>',
      to: [to],
      subject: sub,
      html: html
    }));
  " "${EMAIL_SUBJECT}" "${EMAIL_HTML}")

  curl -s -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${JSON_PAYLOAD}" > /dev/null 2>&1
  echo "✅ Richiesta Email inviata."
else
  echo "ℹ️ Notifica Email saltata: RESEND_API_KEY o ALERT_EMAIL_TO non definiti nei secrets."
fi

echo "📢 Procedura di notifica completata."
exit 0
