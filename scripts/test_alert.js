// scripts/test_alert.js
// Script di test locale per verificare la corretta configurazione di Telegram e Resend Email

import dotenv from 'dotenv';
dotenv.config();

async function testTelegram(token, chatId) {
    console.log("\n========================================================");
    console.log("📱 TEST TELEGRAM BOT");
    console.log("========================================================");

    if (!token || !chatId) {
        console.warn("⚠️ Parametri Telegram mancanti.");
        console.log("   Assicurati di definire nel file .env oppure come variabili:");
        console.log("   TELEGRAM_BOT_TOKEN=...");
        console.log("   TELEGRAM_CHAT_ID=...");
        return false;
    }

    try {
        // 1. Verifica token con getMe
        console.log("🔍 Verifica del Bot Token con Telegram API...");
        const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const meData = await meRes.json();

        if (!meData.ok) {
            console.error(`❌ Token non valido! Risposta Telegram:`, meData);
            return false;
        }

        console.log(`✅ Bot riconosciuto: @${meData.result.username} (${meData.result.first_name})`);

        // 2. Invio messaggio di test
        console.log(`✉️ Invio messaggio di test alla chat ID: ${chatId}...`);
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        const text = `🟢 *TEST COLLEGAMENTO ADR_SITO* 🟢\n\n` +
            `Il bot Telegram è configurato correttamente!\n` +
            `*Data/Ora:* ${timestamp}\n\n` +
            `Riceverai qui le notifiche automatiche dei workflow di Adrenalina Club.`;

        const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });

        const sendData = await sendRes.json();
        if (sendData.ok) {
            console.log("🎉 SUCCESS: Messaggio di prova inviato e recapitato con successo su Telegram!");
            return true;
        } else {
            console.error("❌ Errore nell'invio del messaggio:", sendData);
            if (sendData.description && sendData.description.includes('chat not found')) {
                console.log("\n💡 SUGGERIMENTO FONDAMENTALE:");
                console.log(`   Hai già aperto la chat con il bot (@${meData.result.username}) e premuto 'AVVIA' o inviato '/start'?`);
                console.log(`   Telegram impedisce ai bot di inviare messaggi se l'utente non ha prima avviato la conversazione.`);
            }
            return false;
        }
    } catch (err) {
        console.error("❌ Errore di rete o chiamata fallita:", err.message);
        return false;
    }
}

async function testEmail(resendKey, emailTo) {
    console.log("\n========================================================");
    console.log("📧 TEST EMAIL RESEND");
    console.log("========================================================");

    if (!resendKey || !emailTo) {
        console.warn("⚠️ Parametri Resend mancanti.");
        console.log("   Assicurati di definire nel file .env oppure come variabili:");
        console.log("   RESEND_API_KEY=...");
        console.log("   ALERT_EMAIL_TO=...");
        return false;
    }

    try {
        console.log(`✉️ Invio email di test a: ${emailTo}...`);
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

        const payload = {
            from: 'Adrenalina Club Ops <noreply@adrenalinaclub.it>',
            to: [emailTo],
            subject: '🟢 [TEST] Verifica Canale Notifiche Adrenalina Club',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; border-radius: 8px;">
                    <h2 style="color: #22c55e; margin-top: 0;">🟢 Test Canale Notifiche Riuscito</h2>
                    <p style="font-size: 15px; color: #eeeeee;">Il sistema di invio allarmi email via Resend è operativo al 100%.</p>
                    <p style="color: #adaaaa; font-size: 13px;">Data invio: ${timestamp}</p>
                </div>
            `
        };

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            console.log(`🎉 SUCCESS: Email inviata con successo! ID: ${data.id}`);
            return true;
        } else {
            console.error("❌ Errore invio Resend:", data);
            return false;
        }
    } catch (err) {
        console.error("❌ Errore chiamata Resend:", err.message);
        return false;
    }
}

async function main() {
    console.log("🛡️ === VERIFICA CANALI DI NOTIFICA ADR_SITO ===");

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const resendKey = process.env.RESEND_API_KEY;
    const alertEmail = process.env.ALERT_EMAIL_TO;

    await testTelegram(botToken, chatId);
    await testEmail(resendKey, alertEmail);

    console.log("\n========================================================");
    console.log("🏁 Verifica completata.");
    console.log("========================================================\n");
}

main().catch(console.error);
