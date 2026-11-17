import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildRegistrationTelegramMessage } from '../api/otp-verify.js';
import { handleNotifyRecoveryRequest } from '../api/admin-recovery-link.js';
import { buildDailyApprovalDigestMessage } from '../api/cron-scadenze.js';

describe('Registro Approvazioni — Messaggio Riepilogativo & Notifiche Telegram', () => {
    const originalEnv = { ...process.env };
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.TELEGRAM_BOT_TOKEN = 'test-token';
        process.env.TELEGRAM_CHAT_ID = '999999';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        globalThis.fetch = originalFetch;
    });

    describe('buildRegistrationTelegramMessage (api/otp-verify.js)', () => {
        it('genera un unico messaggio riepilogativo quando vengono compilate piu card (Doc + Cert + Socio)', () => {
            const msg = buildRegistrationTelegramMessage({
                profile: {
                    nome: 'Mario',
                    cognome: 'Rossi',
                    documento_identita_url: 'doc.pdf',
                    certificato_medico_url: 'cert.pdf'
                },
                cf: 'RSSMRA90A01H501X',
                adesione: 'socio_tesserato',
                docStato: 'GIALLO',
                docNote: 'Indirizzo modificato',
                tutoreStato: 'VERDE',
                tutoreNote: null,
                certStato: 'GIALLO',
                certNote: 'Scadenza poco leggibile',
                anagraficaMismatch: false,
                docModificatoManualmente: false,
                docEvaluation: { formattedDiffLines: ['Indirizzo: Via Roma 1'] },
                initialStato: 'IN_ATTESA'
            });

            expect(msg).toContain('NUOVA PRATICA NEL REGISTRO APPROVAZIONI');
            expect(msg).toContain("Documenti d'Identità in Attesa di Verifica");
            expect(msg).toContain('Certificati Medici in Revisione');
            expect(msg).toContain('Soci in Attesa Delibera');
            expect(msg).toContain('Tesserati in Attesa di Attivazione');
            expect(msg).toContain('Mario Rossi');
            expect(msg).toContain('RSSMRA90A01H501X');
        });

        it('notifica Card 4 se tesserato ha certificato VERDE ma documento in revisione', () => {
            const msg = buildRegistrationTelegramMessage({
                profile: {
                    nome: 'Luca',
                    cognome: 'Bianchi',
                    documento_identita_url: 'doc.pdf',
                    certificato_medico_url: 'cert.pdf'
                },
                cf: 'BNCLCU95B02A462K',
                adesione: 'tesserato',
                docStato: 'GIALLO',
                docNote: 'Revisione richiesta',
                tutoreStato: 'VERDE',
                tutoreNote: null,
                certStato: 'VERDE',
                certNote: 'OK',
                anagraficaMismatch: false,
                docModificatoManualmente: false,
                docEvaluation: null,
                initialStato: 'IN_ATTESA'
            });

            expect(msg).toContain("Documenti d'Identità in Attesa di Verifica");
            expect(msg).toContain('Certificato VERDE — pronto per ATTIVA');
            expect(msg).not.toContain('Certificati Medici in Revisione');
        });

        it('restituisce null per tesserato tutto VERDE inviato direttamente in attesa pagamento (coperto dal digest)', () => {
            const msg = buildRegistrationTelegramMessage({
                profile: {
                    nome: 'Giulia',
                    cognome: 'Verdi',
                    documento_identita_url: 'doc.pdf',
                    certificato_medico_url: 'cert.pdf'
                },
                cf: 'VRDGLI98C45H501Z',
                adesione: 'tesserato',
                docStato: 'VERDE',
                docNote: 'OK',
                tutoreStato: 'VERDE',
                tutoreNote: null,
                certStato: 'VERDE',
                certNote: 'OK',
                anagraficaMismatch: false,
                docModificatoManualmente: false,
                docEvaluation: null,
                initialStato: 'IN_ATTESA_PAGAMENTO'
            });

            expect(msg).toBeNull();
        });

        it('esegue escape HTML contro injection nei campi utente', () => {
            const msg = buildRegistrationTelegramMessage({
                profile: {
                    nome: '<script>alert(1)</script>',
                    cognome: 'A&B',
                    documento_identita_url: 'doc.pdf'
                },
                cf: 'RSSMRA90A01H501X',
                adesione: 'socio',
                docStato: 'GIALLO',
                docNote: 'Nota <unsafe>',
                tutoreStato: 'VERDE',
                tutoreNote: null,
                certStato: 'VERDE',
                certNote: null,
                anagraficaMismatch: false,
                docModificatoManualmente: false,
                docEvaluation: null,
                initialStato: 'IN_ATTESA'
            });

            expect(msg).not.toContain('<script>');
            expect(msg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(msg).toContain('A&amp;B');
        });
    });

    describe('handleNotifyRecoveryRequest (api/admin-recovery-link.js)', () => {
        function createMockRes() {
            const res = {
                statusCode: 200,
                body: null,
                status: vi.fn((code) => { res.statusCode = code; return res; }),
                json: vi.fn((payload) => { res.body = payload; return res; })
            };
            return res;
        }

        it('ritorna 429 se rate limit superato', async () => {
            const supabase = {
                rpc: vi.fn().mockResolvedValue({ data: false })
            };
            const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, body: { action: 'notify_request', email: 'test@example.com' } };
            const res = createMockRes();

            await handleNotifyRecoveryRequest(req, res, supabase);
            expect(res.statusCode).toBe(429);
        });

        it('non inserisce ne invia Telegram per email non censite (anti-enumerazione)', async () => {
            const mockFetch = vi.fn();
            globalThis.fetch = mockFetch;

            const insertMock = vi.fn();
            const supabase = {
                rpc: vi.fn().mockResolvedValue({ data: true }),
                from: vi.fn((tbl) => {
                    if (tbl === 'utenti') {
                        return {
                            select: () => ({
                                ilike: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: null, error: null })
                                    })
                                })
                            })
                        };
                    }
                    return { insert: insertMock };
                })
            };

            const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, body: { action: 'notify_request', email: 'sconosciuto@libero.it' } };
            const res = createMockRes();

            await handleNotifyRecoveryRequest(req, res, supabase);
            expect(res.statusCode).toBe(200);
            expect(res.body.tracked).toBe(false);
            expect(insertMock).not.toHaveBeenCalled();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('inserisce richiesta e invia alert Telegram per utente reale censito', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ ok: true, result: { message_id: 42 } })
            });
            globalThis.fetch = mockFetch;

            const insertMock = vi.fn().mockResolvedValue({ error: null });
            const supabase = {
                rpc: vi.fn().mockResolvedValue({ data: true }),
                from: vi.fn((tbl) => {
                    if (tbl === 'utenti') {
                        return {
                            select: () => ({
                                ilike: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({
                                            data: {
                                                id: 'u-1',
                                                email: 'aflaiani@libero.it',
                                                nome: 'Andrea',
                                                cognome: 'Flaiani',
                                                cellulare: '3407852945',
                                                anagrafiche: []
                                            },
                                            error: null
                                        })
                                    })
                                })
                            })
                        };
                    }
                    if (tbl === 'richieste_recupero_password') {
                        return {
                            select: () => ({
                                ilike: () => ({
                                    eq: () => ({
                                        order: () => ({
                                            limit: () => ({
                                                maybeSingle: async () => ({ data: null, error: null })
                                            })
                                        })
                                    })
                                })
                            }),
                            insert: insertMock
                        };
                    }
                    return {};
                })
            };

            const req = { headers: { 'x-forwarded-for': '5.6.7.8' }, body: { action: 'notify_request', email: 'aflaiani@libero.it' } };
            const res = createMockRes();

            await handleNotifyRecoveryRequest(req, res, supabase);
            expect(res.statusCode).toBe(200);
            expect(res.body.tracked).toBe(true);
            expect(insertMock).toHaveBeenCalledWith({
                email: 'aflaiani@libero.it',
                ip_address: '5.6.7.8',
                stato: 'in_attesa'
            });
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(payload.text).toContain('Andrea Flaiani');
            expect(payload.text).toContain('3407852945');
            expect(payload.text).toContain('aflaiani@libero.it');
        });
    });

    describe('buildDailyApprovalDigestMessage (api/cron-scadenze.js)', () => {
        it('ritorna null se non ci sono elementi pendenti in nessuna card', () => {
            const msg = buildDailyApprovalDigestMessage({
                pendingPayments: [],
                incompleteRegistrations: [],
                counts: { docsAttesa: 0, certGialli: 0, sociAttesa: 0, tessAttesa: 0, recuperoPwd: 0 }
            });
            expect(msg).toBeNull();
        });

        it('genera digest unificato per Attesa Pagamento, Registrazioni Incomplete >1h e altre code aperte', () => {
            const msg = buildDailyApprovalDigestMessage({
                pendingPayments: [
                    { tipo: 'TESSERATO', anagrafiche: { nome: 'Elena', cognome: 'Neri', utenti: { quota_totale: 45 } } }
                ],
                incompleteRegistrations: [
                    { nome: 'Marco', cognome: 'Blu', email: 'marco@blu.it', data_creazione: '2026-11-16T10:00:00Z' }
                ],
                counts: { docsAttesa: 2, certGialli: 1, sociAttesa: 3, tessAttesa: 0, recuperoPwd: 1 }
            });

            expect(msg).toContain('PROMEMORIA GIORNALIERO — REGISTRO APPROVAZIONI');
            expect(msg).toContain('In Attesa di Pagamento (1)');
            expect(msg).toContain('Elena Neri (TESSERATO — €45.00)');
            expect(msg).toContain('Registrazioni Incomplete / OTP Sospeso (&gt;1h) (1)');
            expect(msg).toContain('Marco Blu (marco@blu.it');
            expect(msg).toContain('Documenti Identità da Verificare: <b>2</b>');
            expect(msg).toContain('Richieste Recupero Password: <b>1</b>');
        });
    });

    describe('Guardia statica query PostgREST in portal/dashboard.js', () => {
        it('usa contatti(email, telefono) invece della colonna inesistente contatti', () => {
            const dashboardJs = fs.readFileSync(path.resolve(process.cwd(), 'portal/dashboard.js'), 'utf-8');
            expect(dashboardJs).toContain('anagrafiche(id, nome, cognome, contatti(email, telefono))');
            expect(dashboardJs).not.toContain('anagrafiche(id, nome, cognome, contatti)');
        });
    });
});
