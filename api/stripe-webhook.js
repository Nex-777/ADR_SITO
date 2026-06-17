import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Disabilita il body parser automatico di Vercel per poter validare la firma con il raw body
export const config = {
    api: {
        bodyParser: false,
    },
};

async function getRawBody(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!stripeSecretKey || !webhookSecret) {
        console.error('Configurazione webhook di Stripe mancante su Vercel.');
        return res.status(500).send('Webhook Error: Stripe is not configured properly');
    }

    let event;

    try {
        const stripe = new Stripe(stripeSecretKey);
        const rawBody = await getRawBody(req);
        const sig = req.headers['stripe-signature'];

        if (!sig) {
            return res.status(400).send('Webhook Error: Missing signature');
        }

        // Valida la firma del webhook
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        console.error(`❌ Errore di validazione firma webhook: ${err.message}`);
        return res.status(400).send('Webhook signature verification failed.');
    }

    console.log(`🔔 Ricevuto evento Stripe: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const utenteId = session.metadata?.utenteId;
        const importoStr = session.metadata?.importo;
        const causale = session.metadata?.causale || 'Quota associativa annuale';
        const stripePaymentId = session.payment_intent;

        if (!utenteId) {
            console.error('Errore: Manca utenteId nei metadati della sessione Stripe.');
            return res.status(400).send('Missing utenteId in session metadata');
        }

        try {
            console.log(`Elaborazione saldo per utente: ${utenteId}, importo: €${importoStr}`);
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            // Idempotency check: check if receipt with same stripePaymentId already exists
            if (stripePaymentId) {
                const { data: existingReceipt, error: searchError } = await supabase
                    .from('ricevute_pagamenti')
                    .select('id, numero_ricevuta, anno_fiscale')
                    .eq('codice_transazione', stripePaymentId)
                    .maybeSingle();

                if (existingReceipt) {
                    console.log(`⚠️ Ricevuta già presente per codice_transazione (stripePaymentId): ${stripePaymentId}. (Ricevuta n. ${existingReceipt.numero_ricevuta}/${existingReceipt.anno_fiscale})`);
                    return res.status(200).json({ received: true, message: 'Payment already processed.' });
                }
            }

            // 1. Recupera dati utente per conferma causale
            const { data: userProfile, error: userError } = await supabase
                .from('utenti')
                .select('nome, cognome, quota_totale, tipo_adesione')
                .eq('id', utenteId)
                .maybeSingle();

            if (userError || !userProfile) {
                throw new Error(userError?.message || "Profilo utente non trovato su database.");
            }

            const importo = parseFloat(importoStr || userProfile.quota_totale || 0);
            const annoFiscale = new Date().getFullYear();

            // 2. Calcola il numero progressivo di ricevuta per l'anno corrente (tramite stored procedure con FOR UPDATE)
            const { data: nextNumData, error: nextNumError } = await supabase
                .rpc('prossimo_numero_ricevuta', { p_anno: annoFiscale });
            if (nextNumError) {
                throw new Error("Errore nel calcolo del prossimo numero di ricevuta: " + nextNumError.message);
            }
            const nextNum = nextNumData;

            // 3. Inserisci la ricevuta nel database
            const { data: recData, error: recError } = await supabase
                .from('ricevute_pagamenti')
                .insert({
                    numero_ricevuta: nextNum,
                    anno_fiscale: annoFiscale,
                    utente_id: utenteId,
                    importo: importo,
                    causale: causale,
                    metodo_pagamento: 'STRIPE',
                    codice_transazione: stripePaymentId
                })
                .select()
                .single();

            if (recError) {
                throw new Error("Errore inserimento ricevuta: " + recError.message);
            }

            // 4. Salda la quota impostando a 0.00
            const { error: updateError } = await supabase
                .from('utenti')
                .update({
                    quota_totale: 0.00
                })
                .eq('id', utenteId);

            if (updateError) {
                throw new Error("Errore azzeramento quota utente: " + updateError.message);
            }

            // 5. Scrivi l'audit log
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Stripe Webhook';
            await supabase
                .from('registro_audit_operazioni')
                .insert({
                    operatore_id: utenteId, // L'utente stesso ha effettuato l'azione pagando
                    azione: 'EMISSIONE_RICEVUTA_PAGAMENTO',
                    tabella_target: 'ricevute_pagamenti',
                    record_target_id: String(recData.id),
                    dettagli: {
                        numero_ricevuta: nextNum,
                        anno_fiscale: annoFiscale,
                        utente_id: utenteId,
                        importo: importo,
                        stripe_payment_id: stripePaymentId
                    },
                    ip_address: typeof ip === 'string' ? ip.split(',')[0].trim() : 'Stripe Webhook'
                });

            console.log(`✅ Pagamento registrato con successo! Generata Ricevuta n. ${nextNum}/${annoFiscale} per utente ${utenteId}`);

        } catch (err) {
            console.error('❌ Errore durante l\'aggiornamento del database post-pagamento:', err);
            return res.status(500).json({ error: 'Errore interno del server.' });
        }
    }

    return res.status(200).json({ received: true });
}
