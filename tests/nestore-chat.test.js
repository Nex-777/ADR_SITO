import { describe, it, expect, vi, beforeEach } from 'vitest';
import nestoreChatHandler, { calcolaSchedaAtleta } from '../api/nestore-chat.js';

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
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    nome: 'Atleta',
                    cognome: 'Test',
                    data_nascita: '1995-05-20',
                    codice_fiscale: 'RSSMRA95E20H501Z',
                    altezza_cm: 180,
                    calorie_target: 2300,
                    proteine_target_g: 160
                }
            }),
            insert: vi.fn().mockResolvedValue({ data: [{ id: 'msg-1' }] }),
            upsert: vi.fn().mockResolvedValue({ data: [{ id: 'test-id' }] })
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

    it('handles action: save_height and validates valid range', async () => {
        req = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-token',
                origin: 'https://adrenalinaclub.it'
            },
            body: { action: 'save_height', altezza_cm: 182.5 }
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(responseData.success).toBe(true);
        expect(responseData.altezza_cm).toBe(182.5);
    });

    it('rejects invalid height in save_height with 400', async () => {
        req = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-token',
                origin: 'https://adrenalinaclub.it'
            },
            body: { action: 'save_height', altezza_cm: 320 }
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(responseData.error).toContain('Altezza non valida');
    });

    it('handles action: recalculate_wiki', async () => {
        req = {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-token',
                origin: 'https://adrenalinaclub.it'
            },
            body: { action: 'recalculate_wiki' }
        };

        await nestoreChatHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(responseData.success).toBe(true);
        expect(responseData.scheda).toBeDefined();
    });
});

describe('calcolaSchedaAtleta()', () => {
    it('calcola biometria, BMI, BMR, TDEE e produce markdown privo di dati anagrafici sensibili', async () => {
        const mockSupabase = {
            from: vi.fn((table) => {
                if (table === 'utenti') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                data_nascita: '1990-06-15',
                                codice_fiscale: 'RSSMRA90H15H501Z' // Uomo, giorno 15
                            }
                        })
                    };
                }
                if (table === 'nestore_preferenze') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                altezza_cm: 180,
                                calorie_target: 2200,
                                proteine_target_g: 150,
                                peso_target_kg: 78
                            }
                        })
                    };
                }
                if (table === 'nestore_pesi_misure') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        order: vi.fn().mockReturnThis(),
                        limit: vi.fn().mockResolvedValue({
                            data: [
                                { data_rilevazione: '2026-09-10', peso_kg: 80.0, altezza_cm: 180, vita_cm: 82 },
                                { data_rilevazione: '2026-08-20', peso_kg: 81.5, altezza_cm: 180, vita_cm: 83 }
                            ]
                        })
                    };
                }
                if (table === 'nestore_allenamenti') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        order: vi.fn().mockReturnThis(),
                        limit: vi.fn().mockResolvedValue({
                            data: [
                                { data_allenamento: '2026-09-14', corso_disciplina: 'Ibrido', durata_minuti: 60, rpe_fatica: 8 },
                                { data_allenamento: '2026-09-12', corso_disciplina: 'Ibrido', durata_minuti: 60, rpe_fatica: 7 },
                                { data_allenamento: '2026-09-08', corso_disciplina: 'Strongman', durata_minuti: 75, rpe_fatica: 8 }
                            ]
                        })
                    };
                }
                if (table === 'nestore_pasti') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        order: vi.fn().mockReturnThis(),
                        limit: vi.fn().mockResolvedValue({
                            data: [
                                { data_pasto: '2026-09-15', calorie_stimate: 2100, proteine_g: 150, carboidrati_g: 220, grassi_g: 65 }
                            ]
                        })
                    };
                }
                if (table === 'nestore_scheda_atleta') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({ data: { versione: 3 } }),
                        upsert: vi.fn().mockResolvedValue({ data: [{ utente_id: 'test-user-id' }] })
                    };
                }
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null })
                };
            })
        };

        const result = await calcolaSchedaAtleta(mockSupabase, 'test-user-id');

        expect(result).not.toBeNull();
        expect(result.biometria.altezza_cm).toBe(180);
        expect(result.biometria.peso_kg).toBe(80.0);
        expect(result.biometria.bmi).toBe(24.7); // 80 / (1.8^2) = 24.69
        expect(result.biometria.bmi_categoria).toBe('Normopeso');
        expect(result.biometria.sesso).toBe('Uomo');
        expect(result.biometria.bmr).toBeGreaterThan(1600);
        expect(result.biometria.tdee_stimato).toBeGreaterThan(result.biometria.bmr);
        expect(result.allenamento.disciplina_principale).toBe('Ibrido');
        expect(result.versione).toBe(4);

        // Verifica ZERO PII: Non deve contenere nome, cognome o codice fiscale
        expect(result.scheda_markdown).not.toContain('Mario');
        expect(result.scheda_markdown).not.toContain('Rossi');
        expect(result.scheda_markdown).not.toContain('RSSMRA90H15H501Z');
        expect(result.scheda_markdown).toContain('SCHEDA WIKI ATLETA');
        expect(result.scheda_markdown).toContain('BMI');
        expect(result.scheda_markdown).toContain('BMR');
    });
});
