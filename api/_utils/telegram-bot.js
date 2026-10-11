/**
 * api/_utils/telegram-bot.js
 * 
 * Helper per l'invio di notifiche push ad ADR_BOT su Telegram.
 * Utilizzato per allertare il Consiglio Direttivo quando una registrazione
 * richiede approvazione manuale (nuovi soci, documenti con dubbio AI, dati modificati a mano).
 * 
 * Non blocca mai l'esecuzione: in caso di timeout o errore Telegram,
 * logga l'anomalia e restituisce { success: false }.
 */

export async function sendTelegramAlert(messageHtml) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.warn('[TELEGRAM] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID non configurati. Notifica saltata.');
        return { success: false, reason: 'unconfigured' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6 secondi timeout

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: messageHtml,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[TELEGRAM] Errore HTTP ${response.status} da Telegram:`, errText);
            return { success: false, error: errText };
        }

        const data = await response.json();
        return { success: true, messageId: data.result?.message_id };
    } catch (err) {
        clearTimeout(timeout);
        console.error('[TELEGRAM] Eccezione invio notifica Telegram:', err.message);
        return { success: false, error: err.message };
    }
}
