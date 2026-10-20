/**
 * api/_utils/telegram-bot.js
 * 
 * Helper per l'invio di notifiche push ad ADR_BOT su Telegram.
 * Utilizzato per allertare il Consiglio Direttivo / Presidenza per registrazioni
 * e nuove segnalazioni/feedback utenti.
 * 
 * Non blocca mai l'esecuzione: in caso di timeout o errore Telegram,
 * logga l'anomalia e restituisce { success: false } in modalità fail-open.
 */

export function escapeTelegramHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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

/**
 * Invia notifica di feedback/bug con eventuale allegato screenshot compresso (sendPhoto).
 * Se il testo HTML supera 1024 caratteri (limite caption Telegram), invia sendMessage + sendPhoto.
 */
export async function sendTelegramFeedbackAlert({ htmlText, base64Image, attachmentName }) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.warn('[TELEGRAM] Token o Chat ID non configurati. Notifica saltata.');
        return { success: false, reason: 'unconfigured' };
    }

    if (!base64Image) {
        return await sendTelegramAlert(htmlText);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
        // Estrai dati base64 e mimetype
        const match = base64Image.match(/^data:([^;]+);base64,(.+)$/);
        let mimeType = 'image/jpeg';
        let rawBase64 = base64Image;

        if (match) {
            mimeType = match[1];
            rawBase64 = match[2];
        }

        const buffer = Buffer.from(rawBase64, 'base64');
        const filename = attachmentName || 'screenshot.jpg';
        const fileBlob = new Blob([buffer], { type: mimeType });

        // Telegram sendPhoto ha un limite rigido di 1024 caratteri per la caption
        if (htmlText.length <= 1020) {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('photo', fileBlob, filename);
            formData.append('caption', htmlText);
            formData.append('parse_mode', 'HTML');

            const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!res.ok) {
                const errText = await res.text();
                console.error(`[TELEGRAM] Errore sendPhoto (${res.status}):`, errText);
                // Fallback di salvataggio: prova a inviare solo testo
                return await sendTelegramAlert(htmlText);
            }

            const data = await res.json();
            return { success: true, messageId: data.result?.message_id };
        } else {
            // Testo lungo: invia prima il messaggio testuale completo, poi la foto
            clearTimeout(timeout);
            const textResult = await sendTelegramAlert(htmlText);

            try {
                const photoController = new AbortController();
                const photoTimeout = setTimeout(() => photoController.abort(), 6000);

                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('photo', fileBlob, filename);
                formData.append('caption', `📷 Allegato diagnostico: <b>${escapeTelegramHtml(filename)}</b>`,);
                formData.append('parse_mode', 'HTML');

                await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
                    method: 'POST',
                    body: formData,
                    signal: photoController.signal
                });
                clearTimeout(photoTimeout);
            } catch (pErr) {
                console.warn('[TELEGRAM] Errore invio foto secondaria:', pErr.message);
            }

            return textResult;
        }
    } catch (err) {
        clearTimeout(timeout);
        console.error('[TELEGRAM] Eccezione invio feedback alert:', err.message);
        // Fallback di emergenza
        return await sendTelegramAlert(htmlText);
    }
}
