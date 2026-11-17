import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock Stripe and Supabase before importing handlers
const mockStripeCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' });
const mockConstructEvent = vi.fn();

vi.mock('stripe', () => {
    return {
        default: class MockStripe {
            constructor() {
                this.checkout = { sessions: { create: mockStripeCreate } };
                this.webhooks = { constructEvent: mockConstructEvent };
                this.subscriptions = { retrieve: vi.fn(), update: vi.fn() };
                this.paymentIntents = { update: vi.fn() };
            }
        }
    };
});

let mockSupabaseState = {};

function createChain(table) {
    const state = { table, filters: {}, op: 'select', payload: null };
    const chain = {
        select: () => chain,
        eq: (k, v) => { state.filters[k] = v; return chain; },
        in: () => chain,
        lt: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        update: (data) => { state.op = 'update'; state.payload = data; return chain; },
        insert: (data) => { state.op = 'insert'; state.payload = data; return chain; },
        maybeSingle: async () => {
            if (table === 'utenti') return { data: mockSupabaseState.profile, error: null };
            if (table === 'ricevute_pagamenti') return { data: null, error: null };
            if (table === 'anagrafiche') return { data: { id: 'anag-1' }, error: null };
            return { data: null, error: null };
        },
        single: async () => {
            if (table === 'ricevute_pagamenti' && state.op === 'insert') {
                mockSupabaseState.insertedReceipt = state.payload;
                return { data: { id: 'rec-99' }, error: null };
            }
            return { data: null, error: null };
        },
        then: (resolve) => {
            if (table === 'configurazioni_tariffe') {
                return resolve({ data: mockSupabaseState.tariffe || [], error: null });
            }
            if (state.op === 'update') {
                mockSupabaseState.updates.push({ table, payload: state.payload, filters: state.filters });
                return resolve({ data: null, error: null });
            }
            if (state.op === 'insert') {
                mockSupabaseState.inserts.push({ table, payload: state.payload });
                return resolve({ data: null, error: null });
            }
            return resolve({ data: null, error: null });
        }
    };
    return chain;
}

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        auth: {
            getUser: async (token) => token === 'valid-token'
                ? { data: { user: { id: 'user-123' } }, error: null }
                : { data: { user: null }, error: new Error('Invalid token') }
        },
        rpc: async (fn) => {
            if (fn === 'check_rate_limit') return { data: true, error: null };
            if (fn === 'prossimo_numero_ricevuta') return { data: 42, error: null };
            return { data: null, error: null };
        },
        from: (table) => createChain(table)
    })
}));

vi.mock('../api/_utils/resend-mail.js', () => ({
    sendEmail: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('../api/_utils/telegram-bot.js', () => ({
    sendTelegramAlert: vi.fn().mockResolvedValue({ ok: true }),
    escapeTelegramHtml: (s) => String(s || '')
}));

function makeRes() {
    const res = {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        end() { return this; },
        send(msg) { this.body = msg; return this; }
    };
    return res;
}

describe('Politiche CSEN & Sistema Rinnovi 2027', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));

        process.env.STRIPE_SECRET_KEY = 'sk_test_123';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv_test_123';

        mockSupabaseState = {
            tariffe: [
                { chiave: 'quota_socio', valore: 50 },
                { chiave: 'tessera_base_silver', valore: 14 },
                { chiave: 'tessera_base_gold', valore: 18 },
                { chiave: 'tessera_integrativa_a', valore: 20 },
                { chiave: 'tessera_integrativa_b', valore: 30 }
            ],
            updates: [],
            inserts: [],
            insertedReceipt: null,
            profile: null
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        process.env = { ...originalEnv };
    });

    describe('Checkout Rinnovo Annuale (create-checkout-session)', () => {
        it('permette al Socio+Tesserato con Base post-01/09/2026 (scad. 31/12/2027) di rinnovare la sola Quota Socio 2027 dal 01/11/2026', async () => {
            mockSupabaseState.profile = {
                id: 'user-123',
                nome: 'Mario',
                cognome: 'Rossi',
                email: 'mario@example.com',
                tipo_adesione: 'socio_tesserato',
                tipo_tessera: 'tessera_base_silver',
                anagrafiche: [{
                    id: 'anag-1',
                    registro_soci: [{ id_socio: 1, stato_socio: 'ATTIVO', quota_scadenza: '2026-12-31' }],
                    registro_tesserati: [{ id_tesserato: 10, stato_tesseramento: 'ATTIVO', livello_copertura: 'BASE', data_richiesta_tesseramento: '2026-09-15', data_scadenza_tessera: '2027-12-31' }],
                    certificati_medici: [{ id: 'c1', stato_validazione: 'VERDE', data_scadenza: '2027-06-01', created_at: '2026-06-01T10:00:00Z' }],
                    documenti_identita: [{ id: 'd1', tipo_documento: 'PERSONALE', stato_validazione: 'VERDE', data_scadenza: '2030-01-01', created_at: '2026-06-01T10:00:00Z' }]
                }]
            };

            const { default: handler } = await import('../api/create-checkout-session.js');
            const req = {
                method: 'POST',
                headers: { authorization: 'Bearer valid-token', origin: 'https://portal.adrenalinaclub.it' },
                body: { type: 'rinnovo_annuale', rinnova_socio: true, rinnova_tessera: false }
            };
            const res = makeRes();
            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(mockStripeCreate).toHaveBeenCalledTimes(1);
            const args = mockStripeCreate.mock.calls[0][0];
            expect(args.metadata.is_membership_renewal).toBe('true');
            expect(args.metadata.rinnova_socio).toBe('true');
            expect(args.metadata.nuova_scadenza_socio).toBe('2027-12-31');
            expect(args.metadata.rinnova_tessera).toBe('false');
            expect(args.metadata.importo).toBe('50.00'); // Servizio incluso nella quota (no +2%)
            expect(args.line_items.some(li => li.price_data?.product_data?.name?.includes('Spese di gestione'))).toBe(false);
        });

        it('blocca il rinnovo della Tessera Base fatta dopo 01/09/2026 (scad. 31/12/2027) a Novembre 2026', async () => {
            mockSupabaseState.profile = {
                id: 'user-123',
                nome: 'Giulia',
                cognome: 'Bianchi',
                email: 'giulia@example.com',
                tipo_adesione: 'tesserato',
                tipo_tessera: 'tessera_base_silver',
                anagrafiche: [{
                    id: 'anag-1',
                    registro_soci: [],
                    registro_tesserati: [{ id_tesserato: 11, stato_tesseramento: 'ATTIVO', livello_copertura: 'BASE', data_richiesta_tesseramento: '2026-10-05', data_scadenza_tessera: '2027-12-31' }],
                    certificati_medici: [{ id: 'c1', stato_validazione: 'VERDE', data_scadenza: '2027-06-01', created_at: '2026-10-05T10:00:00Z' }],
                    documenti_identita: [{ id: 'd1', tipo_documento: 'PERSONALE', stato_validazione: 'VERDE', data_scadenza: '2030-01-01', created_at: '2026-10-05T10:00:00Z' }]
                }]
            };

            const { default: handler } = await import('../api/create-checkout-session.js');
            const req = {
                method: 'POST',
                headers: { authorization: 'Bearer valid-token', origin: 'https://portal.adrenalinaclub.it' },
                body: { type: 'rinnovo_annuale', rinnova_socio: false, rinnova_tessera: true, tipo_tessera: 'tessera_base_silver' }
            };
            const res = makeRes();
            await handler(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('60 giorni prima');
            expect(mockStripeCreate).not.toHaveBeenCalled();
        });

        it('permette al tesserato in finestra di passare da Silver a Integrativa B calcolando 365 giorni e tariffa aggiornata', async () => {
            mockSupabaseState.profile = {
                id: 'user-123',
                nome: 'Luca',
                cognome: 'Verdi',
                email: 'luca@example.com',
                tipo_adesione: 'tesserato',
                tipo_tessera: 'tessera_base_silver',
                anagrafiche: [{
                    id: 'anag-1',
                    registro_soci: [],
                    registro_tesserati: [{ id_tesserato: 12, stato_tesseramento: 'ATTIVO', livello_copertura: 'BASE', data_richiesta_tesseramento: '2026-03-10', data_scadenza_tessera: '2026-12-31' }],
                    certificati_medici: [{ id: 'c1', stato_validazione: 'VERDE', data_scadenza: '2027-08-01', created_at: '2026-08-01T10:00:00Z' }],
                    documenti_identita: [{ id: 'd1', tipo_documento: 'PERSONALE', stato_validazione: 'VERDE', data_scadenza: '2030-01-01', created_at: '2026-03-10T10:00:00Z' }]
                }]
            };

            const { default: handler } = await import('../api/create-checkout-session.js');
            const req = {
                method: 'POST',
                headers: { authorization: 'Bearer valid-token', origin: 'https://portal.adrenalinaclub.it' },
                body: { type: 'rinnovo_annuale', rinnova_socio: false, rinnova_tessera: true, tipo_tessera: 'tessera_integrativa_b' }
            };
            const res = makeRes();
            await handler(req, res);

            expect(res.statusCode).toBe(200);
            const args = mockStripeCreate.mock.calls[0][0];
            expect(args.metadata.nuovo_tipo_tessera).toBe('tessera_integrativa_b');
            expect(args.metadata.nuovo_livello_copertura).toBe('INTEGRATIVA_B');
            expect(args.metadata.nuova_scadenza_tessera).toBe('2027-12-31'); // 2026-12-31 + 365 giorni (nessun giorno perso)
            expect(args.metadata.importo).toBe('30.00'); // Servizio incluso nella quota (no +2%)
            expect(args.line_items.some(li => li.price_data?.product_data?.name?.includes('Spese di gestione'))).toBe(false);
        });

        it('blocca il rinnovo tessera se il certificato medico è scaduto', async () => {
            mockSupabaseState.profile = {
                id: 'user-123',
                nome: 'Luca',
                cognome: 'Verdi',
                email: 'luca@example.com',
                tipo_adesione: 'tesserato',
                tipo_tessera: 'tessera_base_silver',
                anagrafiche: [{
                    id: 'anag-1',
                    registro_soci: [],
                    registro_tesserati: [{ id_tesserato: 12, stato_tesseramento: 'ATTIVO', livello_copertura: 'BASE', data_richiesta_tesseramento: '2026-03-10', data_scadenza_tessera: '2026-12-31' }],
                    certificati_medici: [{ id: 'c1', stato_validazione: 'VERDE', data_scadenza: '2026-10-01', created_at: '2025-10-01T10:00:00Z' }],
                    documenti_identita: [{ id: 'd1', tipo_documento: 'PERSONALE', stato_validazione: 'VERDE', data_scadenza: '2030-01-01', created_at: '2026-03-10T10:00:00Z' }]
                }]
            };

            const { default: handler } = await import('../api/create-checkout-session.js');
            const req = {
                method: 'POST',
                headers: { authorization: 'Bearer valid-token', origin: 'https://portal.adrenalinaclub.it' },
                body: { type: 'rinnovo_annuale', rinnova_socio: false, rinnova_tessera: true, tipo_tessera: 'tessera_base_silver' }
            };
            const res = makeRes();
            await handler(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('Certificato medico');
        });

        it('preserva i giorni residui quando un tesserato INTEGRATIVA_B rinnova in anticipo nei -60 giorni', async () => {
            mockSupabaseState.profile = {
                id: 'user-123',
                nome: 'Elena',
                cognome: 'Neri',
                email: 'elena@example.com',
                tipo_adesione: 'tesserato',
                tipo_tessera: 'tessera_integrativa_b',
                anagrafiche: [{
                    id: 'anag-1',
                    registro_soci: [],
                    registro_tesserati: [{ id_tesserato: 15, stato_tesseramento: 'ATTIVO', livello_copertura: 'INTEGRATIVA_B', data_richiesta_tesseramento: '2025-12-20', data_scadenza_tessera: '2026-12-20' }],
                    certificati_medici: [{ id: 'c1', stato_validazione: 'VERDE', data_scadenza: '2027-08-01', created_at: '2026-08-01T10:00:00Z' }],
                    documenti_identita: [{ id: 'd1', tipo_documento: 'PERSONALE', stato_validazione: 'VERDE', data_scadenza: '2030-01-01', created_at: '2025-12-20T10:00:00Z' }]
                }]
            };

            const { default: handler } = await import('../api/create-checkout-session.js');
            const req = {
                method: 'POST',
                headers: { authorization: 'Bearer valid-token', origin: 'https://portal.adrenalinaclub.it' },
                body: { type: 'rinnovo_annuale', rinnova_socio: false, rinnova_tessera: true, tipo_tessera: 'tessera_integrativa_b' }
            };
            const res = makeRes();
            await handler(req, res);

            expect(res.statusCode).toBe(200);
            const args = mockStripeCreate.mock.calls[0][0];
            expect(args.metadata.nuova_scadenza_tessera).toBe('2027-12-20');
        });
    });

    describe('Webhook Rinnovo Annuale (stripe-webhook)', () => {
        it('aggiorna separatamente registro_soci e registro_tesserati senza alterare quota_totale', async () => {
            mockConstructEvent.mockReturnValue({
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_1',
                        payment_intent: 'pi_test_1',
                        mode: 'payment',
                        metadata: {
                            is_membership_renewal: 'true',
                            utenteId: 'user-123',
                            anagraficaId: 'anag-1',
                            rinnova_socio: 'true',
                            nuova_scadenza_socio: '2027-12-31',
                            rinnova_tessera: 'true',
                            nuovo_tipo_tessera: 'tessera_integrativa_b',
                            nuovo_livello_copertura: 'INTEGRATIVA_B',
                            nuova_scadenza_tessera: '2027-11-17',
                            importo: '80.00',
                            causale: 'Rinnovo Quota Socio 2027 + Rinnovo Tessera CSEN Integrativa B - Mario Rossi'
                        }
                    }
                }
            });

            const { default: webhookHandler } = await import('../api/stripe-webhook.js');
            const rawChunk = Buffer.from('{}');
            const req = {
                method: 'POST',
                headers: { 'stripe-signature': 'sig_ok' },
                [Symbol.asyncIterator]: async function* () { yield rawChunk; }
            };
            const res = makeRes();
            await webhookHandler(req, res);

            expect(res.statusCode).toBe(200);
            expect(mockSupabaseState.insertedReceipt?.importo).toBe(80);

            const socioUpd = mockSupabaseState.updates.find(u => u.table === 'registro_soci');
            expect(socioUpd?.payload.quota_scadenza).toBe('2027-12-31');

            const tessUpd = mockSupabaseState.updates.find(u => u.table === 'registro_tesserati');
            expect(tessUpd?.payload.livello_copertura).toBe('INTEGRATIVA_B');
            expect(tessUpd?.payload.data_scadenza_tessera).toBe('2027-11-17');
            expect(tessUpd?.payload.stato_tesseramento).toBe('ATTIVO');
            expect(tessUpd?.payload.sync_csen_status).toBe('PENDING');

            // Verifica che utenti.quota_totale NON venga toccata (solo tipo_tessera aggiornato)
            const utenteUpd = mockSupabaseState.updates.find(u => u.table === 'utenti');
            expect(utenteUpd?.payload).toEqual({ tipo_tessera: 'tessera_integrativa_b' });
        });
    });

    describe('Coerenza UI Dashboard & Sync CSEN', () => {
        it('verifica presenza widget rinnovo 2027, badge MOROSO / SCADUTO e decadenza storicizzata', () => {
            const root = path.resolve(process.cwd());
            const dashHtml = fs.readFileSync(path.join(root, 'portal/dashboard.html'), 'utf8');
            const dashJs = fs.readFileSync(path.join(root, 'portal/dashboard.js'), 'utf8');
            const cronJs = fs.readFileSync(path.join(root, 'api/cron-scadenze.js'), 'utf8');
            const syncJs = fs.readFileSync(path.join(root, 'scripts/csen_sync_active.js'), 'utf8');
            const checkoutJs = fs.readFileSync(path.join(root, 'api/create-checkout-session.js'), 'utf8');

            expect(dashHtml).toContain('id="user-renewal-container"');
            expect(dashHtml).toContain('id="renew-tessera-select"');
            expect(dashHtml).toContain('id="row-user-scadenza-socio"');
            expect(dashHtml).toContain('id="btn-avvia-rinnovo-stripe" onclick="avviaCheckoutRinnovo()" class="bg-white text-black');
            expect(dashHtml).not.toContain('spese di gestione su Stripe');

            expect(checkoutJs).not.toContain('Spese di gestione transazione');
            expect(dashJs).toContain('MOROSO / SCADUTO');
            expect(dashJs).toContain('window.dichiaraSocioDecaduto');
            expect(dashJs).toContain('window.avviaCheckoutRinnovo');
            expect(dashJs).toContain('data_scadenza_tessera');
            expect(dashJs).toContain('non perderai alcun giorno di validità residua');

            expect(cronJs).toContain('currentMonth === 11 && currentDay === 1');
            expect(cronJs).toContain('target60Tess');
            expect(syncJs).toContain('dataScadenzaIso');
        });
    });
});
