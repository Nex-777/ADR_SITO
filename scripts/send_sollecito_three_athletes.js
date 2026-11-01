import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../api/_utils/resend-mail.js';
import { sendTelegramAlert, escapeTelegramHtml } from '../api/_utils/telegram-bot.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const athletesToNotify = [
    {
        email: 'balunsmarco@gmail.com',
        anagraficaId: '3e9eeb88-ec75-433b-93e0-37f48e8301c5'
    },
    {
        email: 'andrea.disidoro93@gmail.com',
        anagraficaId: '398030a2-819c-4d00-b95d-13f59f6427b8'
    },
    {
        email: 'andrea.gentili1994@gmail.com',
        anagraficaId: 'ce2a0f82-8056-4675-bd06-69e9fd9913b7'
    }
];

async function run() {
    console.log('--- INIZIO INVIO SOLLECITI (EMAIL + TELEGRAM ADR_BOT) ---');

    for (const item of athletesToNotify) {
        console.log(`\nElaborazione ${item.email}...`);
        const { data: anag, error: anagErr } = await supabase
            .from('anagrafiche')
            .select('id, nome, cognome, utente_id, utenti(id, email, cellulare, quota_totale)')
            .eq('id', item.anagraficaId)
            .single();

        if (anagErr || !anag) {
            console.error(`Errore caricamento anagrafica ${item.anagraficaId}:`, anagErr);
            continue;
        }

        const nome = anag.nome;
        const cognome = anag.cognome;
        const utente = Array.isArray(anag.utenti) ? anag.utenti[0] : anag.utenti;
        const email = utente?.email || item.email;
        const cellulare = utente?.cellulare || 'Non indicato';
        const quota = parseFloat(utente?.quota_totale) || 14.00;
        const quotaStr = quota.toFixed(2);
        const paymentUrl = 'https://portal.adrenalinaclub.it/portal/pagamento.html';

        console.log(`Dati: ${nome} ${cognome} | Email: ${email} | Cell: ${cellulare} | Quota: €${quotaStr}`);

        // 1. Invio Email
        let emailRes = { success: false };
        try {
            emailRes = await sendEmail({
                to: email,
                subject: 'Sollecito Pagamento Quota Tesseramento - Adrenalina Club',
                html: `
                    <div style="font-family:sans-serif;background:#0e0e0e;color:#fff;padding:30px;text-align:center">
                        <h1 style="color:#df293e;font-size:22px">ADRENALINA CLUB</h1>
                        <p style="color:#ccc">Ciao ${escapeTelegramHtml(nome)}, ti ricordiamo che per regolarizzare e completare la tua posizione di tesseramento sportivo è necessario saldare la quota annuale di <strong>€${quotaStr}</strong>.</p>
                        <p style="color:#aaa;font-size:13px">Puoi effettuare il pagamento in tutta sicurezza tramite carta di credito, bancomat o prepagata cliccando sul pulsante sottostante:</p>
                        <a href="${paymentUrl}" style="background:#df293e;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:15px;border-radius:4px">PAGA ORA LA QUOTA (€${quotaStr})</a>
                        <p style="color:#666;font-size:11px;margin-top:20px">Se hai già effettuato il pagamento tramite bonifico o contanti in segreteria, ignora pure questo avviso.</p>
                    </div>
                `
            });
            console.log(`Esito Email Resend a ${email}:`, emailRes);
        } catch (err) {
            console.error(`Errore invio email a ${email}:`, err);
        }

        // 2. Invio Telegram push separato su ADR_BOT con testo WhatsApp
        let tgRes = { success: false };
        try {
            const waText = `Ciao ${nome}! Ti informiamo che la tua documentazione per il tesseramento ad Adrenalina Club è verificata. Per completare la regolarizzazione della tua tessera CSEN, puoi saldare la quota di ${quotaStr} € direttamente dal tuo smartphone a questo link sicuro:\n${paymentUrl}\nA presto!\nASD Adrenalina Club`;

            const tgMsg = `📲 <b>SOLLECITO PAGAMENTO QUOTA</b>\n\n` +
                `👤 <b>Atleta:</b> ${escapeTelegramHtml(nome)} ${escapeTelegramHtml(cognome)}\n` +
                `💶 <b>Quota Insoluta:</b> €${quotaStr}\n` +
                `✉️ <b>Email:</b> ${escapeTelegramHtml(email)} ${emailRes.success ? '✅ Inviata' : '❌ Errore'}\n` +
                `📞 <b>Cellulare:</b> ${escapeTelegramHtml(cellulare)}\n\n` +
                `<i>Copia il testo qui sotto per inviarlo via WhatsApp:</i>\n\n` +
                `<code>${escapeTelegramHtml(waText)}</code>`;

            tgRes = await sendTelegramAlert(tgMsg);
            console.log(`Esito Telegram ADR_BOT per ${nome} ${cognome}:`, tgRes);
        } catch (tgErr) {
            console.error(`Errore Telegram per ${nome} ${cognome}:`, tgErr);
        }
    }

    console.log('\n--- INVIO COMPLETATO CON SUCCESSO ---');
}

run().catch(console.error);
