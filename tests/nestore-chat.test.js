import { describe, it, expect, vi, beforeEach } from 'vitest';
import nestoreChatHandler from '../api/nestore-chat.js';

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: {
            getUser: vi.fn(async (token) => {
                if (token === 'valid-token') {
                    return { data: { user: { id: 'test-user-id' } }, error: null };
                }
                return { data: { user: null }, error: { message: 'Invalid token' } };
            })
        },
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 0 }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [] }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { nome: 'Atleta', cognome: 'Test' } }),
            insert: vi.fn().mockResolvedValue({ data: [{ id: 'msg-1' }] })
        }))
    }))
}));

describe('POST /api/nestore-chat', () => {
    let req, res, status, responseData, headers;

    beforeEach(() => {
        process.env.SUPABASE_URL = 'https://dummy.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key';
        process.env.GEMINI_API_KEY = 'dummy-gemini-key';
        headers = {};
        status = 200;
        responseData = null;
        res = {
            setHeader: vi.fn((k, v) => { headers[k] = v; }),
            status: vi.fn((s) => {
                status = s;
                return res;
            }),
            json: vi.fn((data) => {
                responseData = data;
                return res;
            }),
            end: vi.fn()
        };
    });

    it('handles OPTIONS preflight with 200', async () => {
        req = {
            method: 'OPTIONS',
            headers: { origin: 'https://adrenalinaclub.it' }
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.end).toHaveBeenCalled();
    });

    it('rejects non-POST methods with 405', async () => {
        req = {
            method: 'GET',
            headers: {}
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
        expect(responseData).toEqual({ error: 'Metodo non consentito.' });
    });

    it('rejects requests without Bearer token with 401', async () => {
        req = {
            method: 'POST',
            headers: {},
            body: { message: 'Ciao' }
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(responseData).toEqual({ error: 'Autenticazione richiesta.' });
    });

    it('rejects empty message and empty image with 400', async () => {
        req = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-token',
                origin: 'https://adrenalinaclub.it'
            },
            body: {}
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(responseData).toEqual({ error: 'Messaggio o immagine obbligatori.' });
    });

    it('rejects messages longer than 1500 characters with 400', async () => {
        const longMessage = 'A'.repeat(1501);
        req = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-token',
                origin: 'https://adrenalinaclub.it'
            },
            body: { message: longMessage }
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(responseData).toEqual({ error: 'Messaggio troppo lungo. Il limite massimo è di 1500 caratteri.' });
    });
});
