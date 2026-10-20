import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { escapeTelegramHtml, sendTelegramFeedbackAlert } from '../api/_utils/telegram-bot.js';
import { handleFeedback } from '../api/_utils/feedback-handler.js';
import { formatForAntigravity } from '../portal/dashboard-feedback.js';

// Mock Supabase per test di integrazione backend
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: {
            getUser: (...args) => mockGetUser(...args)
        },
        from: (...args) => mockFrom(...args)
    }))
}));

describe('Feedback Telegram Notifications & Escape Helpers', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('sanitizza correttamente i caratteri speciali HTML per Telegram', () => {
        const input = 'Errore in <script>alert("XSS & crash")</script>';
        const escaped = escapeTelegramHtml(input);
        expect(escaped).toBe('Errore in &lt;script&gt;alert("XSS &amp; crash")&lt;/script&gt;');
    });

    it('invia messaggio testuale via sendPhoto quando base64Image è presente', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
        process.env.TELEGRAM_CHAT_ID = '987654321';

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 1234 } })
        });
        globalThis.fetch = mockFetch;

        const fakeBase64 = 'data:image/jpeg;base64,' + Buffer.from('fake-image-bytes').toString('base64');
        const res = await sendTelegramFeedbackAlert({
            htmlText: '<b>Nuovo Bug</b>',
            base64Image: fakeBase64,
            attachmentName: 'screenshot.jpg'
        });

        expect(res.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0][0]).toBe('https://api.telegram.org/botmock-token/sendPhoto');
    });

    it('effettua fallback a fail-open se Telegram restituisce errore HTTP', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
        process.env.TELEGRAM_CHAT_ID = '987654321';

        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error'
        });
        globalThis.fetch = mockFetch;

        const res = await sendTelegramFeedbackAlert({
            htmlText: 'Test errore',
            base64Image: null
        });

        expect(res.success).toBe(false);
        expect(res.error).toBe('Internal Server Error');
    });

    it('rifiuta richieste non autenticate o senza Bearer token', async () => {
        const mockReq = {
            method: 'POST',
            headers: {},
            socket: { remoteAddress: '127.0.0.1' },
            body: {}
        };
        const resData = {};
        const mockRes = {
            setHeader: vi.fn(),
            status: vi.fn().mockImplementation((code) => {
                resData.status = code;
                return {
                    json: vi.fn().mockImplementation((payload) => {
                        resData.body = payload;
                        return payload;
                    })
                };
            })
        };

        process.env.SUPABASE_URL = 'https://fake.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

        await handleFeedback(mockReq, mockRes);

        expect(resData.status).toBe(401);
        expect(resData.body.error).toContain('Non autorizzato');
    });

    it('gestisce con successo inserimento report e notifica Telegram con telegram_sent: true', async () => {
        process.env.SUPABASE_URL = 'https://fake.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
        process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
        process.env.TELEGRAM_CHAT_ID = '987654321';

        mockGetUser.mockResolvedValue({
            data: { user: { id: 'user-guid-001', email: 'atleta@adrenalinaclub.it' } },
            error: null
        });

        mockFrom.mockImplementation((tableName) => {
            if (tableName === 'utenti') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: {
                                    nome: 'Mario',
                                    cognome: 'Rossi',
                                    email: 'mario@rossi.it',
                                    ruolo: ['socio']
                                },
                                error: null
                            })
                        })
                    })
                };
            }
            if (tableName === 'feedback_reports') {
                return {
                    insert: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    id: 'report-guid-123',
                                    status: 'DA_LEGGERE',
                                    created_at: '2026-10-20T21:00:00Z'
                                },
                                error: null
                            })
                        })
                    })
                };
            }
            return {};
        });

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 777 } })
        });
        globalThis.fetch = mockFetch;

        const mockReq = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-jwt-token',
                origin: 'https://portal.adrenalinaclub.it'
            },
            socket: { remoteAddress: '127.0.0.1' },
            body: {
                category: 'BUG',
                title: 'Crash su scheda allenamento',
                message: 'La pagina si blocca dopo aver salvato il massimale',
                page_url: '/portal/dashboard.html?tab=forza',
                app_version: '1.06.16',
                diagnostic_data: {
                    browser: 'Chrome 120.0',
                    os: 'Windows 11',
                    viewport: '1920x1080',
                    errors: [{ message: 'TypeError: undefined', lineno: 42 }]
                }
            }
        };

        const resData = {};
        const mockRes = {
            setHeader: vi.fn(),
            status: vi.fn().mockImplementation((code) => {
                resData.status = code;
                return {
                    json: vi.fn().mockImplementation((payload) => {
                        resData.body = payload;
                        return payload;
                    })
                };
            })
        };

        await handleFeedback(mockReq, mockRes);

        expect(resData.status).toBe(200);
        expect(resData.body.success).toBe(true);
        expect(resData.body.id).toBe('report-guid-123');
        expect(resData.body.telegram_sent).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('garantisce architettura fail-open: restituisce 200 e telegram_sent: false se Telegram fallisce', async () => {
        process.env.SUPABASE_URL = 'https://fake.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
        // Telegram senza credenziali
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;

        mockGetUser.mockResolvedValue({
            data: { user: { id: 'user-guid-002', email: 'test@adrenalinaclub.it' } },
            error: null
        });

        mockFrom.mockImplementation((tableName) => {
            if (tableName === 'utenti') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: { nome: 'Luigi', cognome: 'Verdi', email: 'luigi@verdi.it', ruolo: 'socio' },
                                error: null
                            })
                        })
                    })
                };
            }
            if (tableName === 'feedback_reports') {
                return {
                    insert: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    id: 'report-guid-999',
                                    status: 'DA_LEGGERE',
                                    created_at: '2026-10-20T21:05:00Z'
                                },
                                error: null
                            })
                        })
                    })
                };
            }
            return {};
        });

        const mockReq = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-jwt-token-2'
            },
            socket: { remoteAddress: '127.0.0.1' },
            body: {
                category: 'SUGGERIMENTO',
                title: 'Nuova opzione per il cronometro',
                message: 'Aggiungere suono al minuto finale'
            }
        };

        const resData = {};
        const mockRes = {
            setHeader: vi.fn(),
            status: vi.fn().mockImplementation((code) => {
                resData.status = code;
                return {
                    json: vi.fn().mockImplementation((payload) => {
                        resData.body = payload;
                        return payload;
                    })
                };
            })
        };

        await handleFeedback(mockReq, mockRes);

        expect(resData.status).toBe(200);
        expect(resData.body.success).toBe(true);
        expect(resData.body.id).toBe('report-guid-999');
        expect(resData.body.telegram_sent).toBe(false);
    });
});

describe('Dashboard Script & Browser Compatibility', () => {
    it('non include export ESM a livello top-level per evitare SyntaxError nei browser standard', () => {
        const filePath = path.resolve(__dirname, '../portal/dashboard-feedback.js');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toMatch(/^export\s+/m);
        expect(content).not.toMatch(/^import\s+/m);
    });
});

describe('Antigravity LLM Format Generator', () => {
    it('genera il blocco [BUG] ultra-compatto con env, err e file quando presenti', () => {
        const report = {
            category: 'BUG',
            app_version: '1.06.15',
            page_url: '/portal/dashboard.html?tab=soci',
            company_name: 'Adrenalina Club ASD - Mario Rossi',
            user_email: 'mario@rossi.it',
            title: 'Errore durante il caricamento del registro soci',
            message: 'Cliccando sul registro soci la tabella resta vuota',
            diagnostic_data: {
                browser: 'Chrome (Google Chrome)',
                os: 'Windows',
                viewport: '1920x1080',
                errors: [
                    { time: '22:15:04', message: 'TypeError: Cannot read property map', source: 'dashboard.js', lineno: 412, colno: 18 }
                ]
            },
            attachment_name: 'screenshot.jpg'
        };

        const result = formatForAntigravity(report);

        // Verifica formato esatto
        expect(result).toBe(
            `[BUG] v1.06.15 route:/portal/dashboard.html?tab=soci\n` +
            `client:Adrenalina Club ASD - Mario Rossi (mario@rossi.it)\n` +
            `title:Errore durante il caricamento del registro soci\n` +
            `desc:Cliccando sul registro soci la tabella resta vuota\n` +
            `env:Chrome/Windows 1920x1080\n` +
            `err:-[22:15:04] TypeError: Cannot read property map (dashboard.js:412:18)\n` +
            `file:screenshot.jpg`
        );

        // Zero emoticon o divisori decorativi
        expect(result).not.toContain('===');
        expect(result).not.toContain('---');
        expect(result).not.toContain('🚨');
        expect(result).not.toContain('💡');
    });

    it('omette automaticamente env, err e file quando non presenti (es. suggerimento)', () => {
        const report = {
            category: 'SUGGERIMENTO',
            app_version: '1.06.15',
            page_url: '/portal/dashboard.html',
            company_name: 'Adrenalina Club ASD - Laura Bianchi',
            user_email: 'laura@bianchi.it',
            title: 'Filtro rapido soci per data iscrizione',
            message: 'Sarebbe comodo avere un filtro per vedere i nuovi iscritti del mese',
            diagnostic_data: {},
            attachment_name: null
        };

        const result = formatForAntigravity(report);

        expect(result).toBe(
            `[SUGGERIMENTO] v1.06.15 route:/portal/dashboard.html\n` +
            `client:Adrenalina Club ASD - Laura Bianchi (laura@bianchi.it)\n` +
            `title:Filtro rapido soci per data iscrizione\n` +
            `desc:Sarebbe comodo avere un filtro per vedere i nuovi iscritti del mese`
        );

        expect(result).not.toContain('env:');
        expect(result).not.toContain('err:');
        expect(result).not.toContain('file:');
    });
});
