import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTelegramAlert } from '../api/_utils/telegram-bot.js';

describe('Telegram Bot Alert Helper', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('salta l invio se i token non sono configurati', async () => {
        const res = await sendTelegramAlert('Test alert');
        expect(res.success).toBe(false);
        expect(res.reason).toBe('unconfigured');
    });

    it('invia correttamente il messaggio quando le variabili sono configurate e API risponde 200', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
        process.env.TELEGRAM_CHAT_ID = '123456789';

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 999 } })
        });
        globalThis.fetch = mockFetch;

        const res = await sendTelegramAlert('<b>Nuova registrazione</b>');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.telegram.org/botmock-bot-token/sendMessage',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: '123456789',
                    text: '<b>Nuova registrazione</b>',
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                })
            })
        );
        expect(res.success).toBe(true);
        expect(res.messageId).toBe(999);
    });

    it('gestisce con grazia risposte di errore da Telegram senza lanciare eccezioni', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
        process.env.TELEGRAM_CHAT_ID = '123456789';

        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => 'Bad Request: chat not found'
        });
        globalThis.fetch = mockFetch;

        const res = await sendTelegramAlert('Test alert');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Bad Request');
    });

    it('gestisce eccezioni o timeout di rete senza bloccare il flusso', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
        process.env.TELEGRAM_CHAT_ID = '123456789';

        const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
        globalThis.fetch = mockFetch;

        const res = await sendTelegramAlert('Test alert');
        expect(res.success).toBe(false);
        expect(res.error).toBe('Network timeout');
    });
});
