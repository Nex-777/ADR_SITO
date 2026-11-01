import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeTelegramHtml, sendTelegramAlert } from '../api/_utils/telegram-bot.js';

describe('Payment Guardrail & Sollecito Notifications', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('Rilevamento Anomalia Quota Non Saldata', () => {
        it('rileva correttamente anomalia se tesserato ATTIVO ha quota_totale > 0 e nessuna ricevuta', () => {
            const tessAttivo = {
                stato_tesseramento: 'ATTIVO',
                anagrafiche: {
                    nome: 'Marco Giuseppe',
                    cognome: 'Balloni',
                    utenti: { quota_totale: 14.00 }
                }
            };

            const rawQuota = Array.isArray(tessAttivo.anagrafiche?.utenti)
                ? tessAttivo.anagrafiche?.utenti[0]?.quota_totale
                : tessAttivo.anagrafiche?.utenti?.quota_totale;
            const quotaInsoluta = (rawQuota !== undefined && rawQuota !== null && parseFloat(rawQuota) > 0)
                ? parseFloat(rawQuota)
                : 0;
            const hasQuotaInsoluta = (tessAttivo.stato_tesseramento === 'ATTIVO' && quotaInsoluta > 0);

            expect(hasQuotaInsoluta).toBe(true);
            expect(quotaInsoluta).toBe(14.00);
        });

        it('non segnala anomalia se la quota_totale è 0 (pagata o azzerata)', () => {
            const tessSaldato = {
                stato_tesseramento: 'ATTIVO',
                anagrafiche: {
                    nome: 'Mario',
                    cognome: 'Rossi',
                    utenti: { quota_totale: 0 }
                }
            };

            const rawQuota = Array.isArray(tessSaldato.anagrafiche?.utenti)
                ? tessSaldato.anagrafiche?.utenti[0]?.quota_totale
                : tessSaldato.anagrafiche?.utenti?.quota_totale;
            const quotaInsoluta = (rawQuota !== undefined && rawQuota !== null && parseFloat(rawQuota) > 0)
                ? parseFloat(rawQuota)
                : 0;
            const hasQuotaInsoluta = (tessSaldato.stato_tesseramento === 'ATTIVO' && quotaInsoluta > 0);

            expect(hasQuotaInsoluta).toBe(false);
            expect(quotaInsoluta).toBe(0);
        });

        it('non segnala anomalia per tesseramenti IN_ELABORAZIONE (normale attesa prima del saldo)', () => {
            const tessInAttesa = {
                stato_tesseramento: 'IN_ELABORAZIONE',
                anagrafiche: {
                    nome: 'Luigi',
                    cognome: 'Verdi',
                    utenti: { quota_totale: 14.00 }
                }
            };

            const rawQuota = tessInAttesa.anagrafiche?.utenti?.quota_totale;
            const quotaInsoluta = parseFloat(rawQuota) || 0;
            const hasQuotaInsoluta = (tessInAttesa.stato_tesseramento === 'ATTIVO' && quotaInsoluta > 0);

            expect(hasQuotaInsoluta).toBe(false);
        });
    });

    describe('Generazione Messaggio WhatsApp & Sollecito', () => {
        it('costruisce correttamente il messaggio WhatsApp pronto per la copia rapida', () => {
            const nome = 'Andrea';
            const quotaStr = '14.00';
            const paymentUrl = 'https://portal.adrenalinaclub.it/portal/pagamento.html';

            const waText = `Ciao ${nome}! Ti informiamo che la tua documentazione per il tesseramento ad Adrenalina Club è verificata. Per completare la regolarizzazione della tua tessera CSEN, puoi saldare la quota di ${quotaStr} € direttamente dal tuo smartphone a questo link sicuro:\n${paymentUrl}\nA presto!\nASD Adrenalina Club`;

            expect(waText).toContain('Ciao Andrea!');
            expect(waText).toContain('14.00 €');
            expect(waText).toContain(paymentUrl);
            expect(waText).toContain('ASD Adrenalina Club');
        });

        it('invia notifica Telegram ben formattata con tag <code> per copia WhatsApp su ADR_BOT', async () => {
            process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
            process.env.TELEGRAM_CHAT_ID = '123456789';

            let sentBody = null;
            const mockFetch = vi.fn().mockImplementation((url, opts) => {
                sentBody = JSON.parse(opts.body);
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ ok: true, result: { message_id: 101 } })
                });
            });
            globalThis.fetch = mockFetch;

            const nome = 'Marco & Giuseppe <Balloni>';
            const cognome = 'Balloni';
            const quotaStr = '14.00';
            const waText = `Ciao Marco!\nLink: https://portal.adrenalinaclub.it/portal/pagamento.html`;

            const tgMsg = `📲 <b>SOLLECITO PAGAMENTO QUOTA</b>\n\n` +
                `👤 <b>Atleta:</b> ${escapeTelegramHtml(nome)} ${escapeTelegramHtml(cognome)}\n` +
                `💶 <b>Quota Insoluta:</b> €${quotaStr}\n\n` +
                `<i>Copia il testo qui sotto per inviarlo via WhatsApp:</i>\n\n` +
                `<code>${escapeTelegramHtml(waText)}</code>`;

            const res = await sendTelegramAlert(tgMsg);

            expect(res.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(sentBody.parse_mode).toBe('HTML');
            expect(sentBody.text).toContain('&amp;');
            expect(sentBody.text).toContain('&lt;Balloni&gt;');
            expect(sentBody.text).toContain('<code>');
            expect(sentBody.text).toContain('</code>');
        });
    });

    describe('Stripe Webhook Alert Finanziario Tesseramento', () => {
        it('formatta correttamente l alert push per ADR_BOT al saldo della quota tesseramento', async () => {
            process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
            process.env.TELEGRAM_CHAT_ID = '123456789';

            let sentBody = null;
            globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
                sentBody = JSON.parse(opts.body);
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ ok: true, result: { message_id: 202 } })
                });
            });

            const nome = 'Andrea';
            const cognome = 'Gentili';
            const importo = 30.00;
            const numeroRicevuta = 42;
            const annoFiscale = 2026;
            const causale = 'Quota Tesseramento 2026/2027';

            const tgMsg = `💳 <b>PAGAMENTO TESSERAMENTO RICEVUTO</b>\n\n` +
                `👤 <b>Socio:</b> ${escapeTelegramHtml(nome)} ${escapeTelegramHtml(cognome)}\n` +
                `💶 <b>Importo:</b> €${importo.toFixed(2)}\n` +
                `🧾 <b>Ricevuta:</b> N. ${numeroRicevuta}/${annoFiscale}\n` +
                `📌 <b>Causale:</b> ${escapeTelegramHtml(causale)}\n\n` +
                `✅ <i>Quota registrata e saldata con successo.</i>`;

            const res = await sendTelegramAlert(tgMsg);

            expect(res.success).toBe(true);
            expect(sentBody.text).toContain('PAGAMENTO TESSERAMENTO RICEVUTO');
            expect(sentBody.text).toContain('Andrea Gentili');
            expect(sentBody.text).toContain('€30.00');
            expect(sentBody.text).toContain('N. 42/2026');
        });
    });
});
