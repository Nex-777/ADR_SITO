import { describe, it, expect, vi, beforeEach } from 'vitest';
import nestoreChatHandler from '../api/nestore-chat.js';

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
});
