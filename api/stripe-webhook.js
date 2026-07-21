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
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !webhookSecret) {
        console.error('Configurazione webhook di Stripe mancante su Vercel.');
        return res.status(500).send('Errore di configurazione del server.');
    }
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Configurazione Supabase mancante su Vercel (SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).');
        return res.status(500).send('Errore di configurazione del server.');
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
        const eventId = session.metadata?.eventId;
        const importoStr = session.metadata?.importo;
        const causale = session.metadata?.causale || 'Quota associativa annuale';
        const stripePaymentId = session.payment_intent;

        if (!utenteId) {
            console.error('Errore: Manca utenteId nei metadati della sessione Stripe.');
            return res.status(400).send('Missing utenteId in session metadata');
        }

        try {
            console.log(`Elaborazione saldo per utente: ${utenteId}, importo: €${importoStr}, eventId: ${eventId || 'nessuno'}`);
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

            const importo = parseFloat(importoStr || 0);
            const annoFiscale = new Date().getFullYear();

            // 1. Calcola il numero progressivo di ricevuta per l'anno corrente (tramite stored procedure)
            const { data: nextNumData, error: nextNumError } = await supabase
                .rpc('prossimo_numero_ricevuta', { p_anno: annoFiscale });
            if (nextNumError) {
                throw new Error("Errore nel calcolo del prossimo numero di ricevuta: " + nextNumError.message);
            }
            const nextNum = nextNumData;

            // 2. Inserisci la ricevuta nel database
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

            // 3. Gestisci logica specifica in base all'oggetto del pagamento
            if (session.metadata?.tipo === 'epika_evento') {
                const bozzaId = session.metadata?.bozza_id;
                if (!bozzaId) {
                    throw new Error("Manca bozza_id per pagamento evento Epika");
                }

                // Recupera la bozza di iscrizione
                const { data: bozza, error: bozzaError } = await supabase
                    .from('epika_iscrizioni_bozza')
                    .select('*')
                    .eq('id', bozzaId)
                    .maybeSingle();

                if (bozzaError || !bozza) {
                    throw new Error("Bozza di iscrizione non trovata o scaduta per id: " + bozzaId);
                }

                // Inserisci l'iscrizione definitiva
                const { error: insertError } = await supabase
                    .from('epika_iscrizioni_eventi')
                    .insert({
                        evento_id: bozza.evento_id,
                        utente_id: bozza.utente_id,
                        giorni_presenza: bozza.giorni_presenza,
                        data_ora_arrivo: bozza.data_ora_arrivo,
                        data_ora_ripartenza: bozza.data_ora_ripartenza,
                        dettagli: bozza.dettagli,
                        codice_transazione: stripePaymentId,
                        ricevuta_id: recData.id
                    });

                if (insertError) {
                    throw new Error("Errore inserimento iscrizione definitiva Epika: " + insertError.message);
                }

                // Elimina la bozza temporanea
                await supabase
                    .from('epika_iscrizioni_bozza')
                    .delete()
                    .eq('id', bozzaId);

                console.log(`Iscritto utente Epika ${bozza.utente_id} all'evento ${bozza.evento_id} tramite bozza.`);

            } else if (eventId) {
                const renew = session.metadata?.renew === 'true';
                const nomePiano = session.metadata?.nomePiano;
                const dataInizioCorso = session.metadata?.dataInizioCorso || new Date().toISOString().split('T')[0];
                let dataScadenzaCorso = null;

                if (nomePiano) {
                    const { data: ev } = await supabase
                        .from('eventi')
                        .select('piani_abbonamento')
                        .eq('id', eventId)
                        .maybeSingle();

                    if (ev && Array.isArray(ev.piani_abbonamento)) {
                        const piano = ev.piani_abbonamento.find(p => p.nome.toLowerCase() === nomePiano.toLowerCase());
                        // fallback to 1 month if duration is missing
                        const durataMesi = piano && piano.durata_mesi ? parseInt(piano.durata_mesi) : 1; 
                        const start = new Date(dataInizioCorso);
                        const end = new Date(start);
                        end.setMonth(start.getMonth() + durataMesi);
                        end.setDate(end.getDate() - 1);
                        dataScadenzaCorso = end.toISOString().split('T')[0];
                    }
                }

                if (renew) {
                    // Aggiorna l'iscrizione esistente per rinnovo
                    const { error: eventRegError } = await supabase
                        .from('iscrizioni_eventi')
                        .update({
                            stato_pagamento: 'PAGATO',
                            codice_transazione: stripePaymentId,
                            data_iscrizione: new Date().toISOString(),
                            data_inizio_corso: dataInizioCorso,
                            data_scadenza_corso: dataScadenzaCorso,
                            scadenza_modificata_a_mano: false
                        })
                        .eq('evento_id', eventId)
                        .eq('utente_id', utenteId);
                    
                    if (eventRegError) {
                        throw new Error("Errore aggiornamento iscrizione evento per rinnovo: " + eventRegError.message);
                    }
                    console.log(`Rinnovato corso/evento ${eventId} per utente ${utenteId} (Inizio: ${dataInizioCorso}, Scadenza: ${dataScadenzaCorso})`);
                } else {
                    // Iscrizione Corso/Evento: inserisci l'iscrizione
                    const { error: eventRegError } = await supabase
                        .from('iscrizioni_eventi')
                        .insert({
                            evento_id: eventId,
                            utente_id: utenteId,
                            stato_pagamento: 'PAGATO',
                            codice_transazione: stripePaymentId,
                            data_inizio_corso: dataInizioCorso,
                            data_scadenza_corso: dataScadenzaCorso
                        });
                    
                    if (eventRegError) {
                        throw new Error("Errore inserimento iscrizione evento: " + eventRegError.message);
                    }
                    console.log(`Iscritto utente ${utenteId} all'evento ${eventId} (Inizio: ${dataInizioCorso}, Scadenza: ${dataScadenzaCorso})`);
                }
            } else {
                // Quota Associativa: Salda la quota impostando a 0.00
                const { error: updateError } = await supabase
                    .from('utenti')
                    .update({
                        quota_totale: 0.00
                    })
                    .eq('id', utenteId);

                if (updateError) {
                    throw new Error("Errore azzeramento quota utente: " + updateError.message);
                }

                // --- Automatic activation on payment completion ---
                try {
                    const { data: anag, error: anagErr } = await supabase
                        .from('anagrafiche')
                        .select('id')
                        .eq('utente_id', utenteId)
                        .maybeSingle();

                    if (!anagErr && anag) {
                        const anagraficaId = anag.id;

                        // Fetch the pending registration that is in 'IN_ATTESA_PAGAMENTO'
                        const { data: appRecord } = await supabase
                            .from('registro_approvazioni')
                            .select('*')
                            .eq('anagrafica_id', anagraficaId)
                            .eq('stato', 'IN_ATTESA_PAGAMENTO')
                            .maybeSingle();

                        if (appRecord) {
                            console.log(`[PAYMENT WEBHOOK] Trovata richiesta in attesa pagamento di tipo: ${appRecord.tipo}`);
                            if (appRecord.tipo === 'TESSERATO' || appRecord.tipo === 'SOCIO_TESSERATO') {
                                const { error: rpcErr } = await supabase.rpc('approva_tesserato', {
                                    p_anagrafica_id: anagraficaId,
                                    p_deciso_da: utenteId
                                });
                                if (rpcErr) {
                                    console.error("[PAYMENT WEBHOOK] Errore rpc approva_tesserato:", rpcErr);
                                } else {
                                    console.log(`[PAYMENT WEBHOOK] Tesseramento attivato automaticamente per anagrafica ${anagraficaId}`);
                                }
                            } else if (appRecord.tipo === 'SOCIO') {
                                const { error: updErr } = await supabase
                                    .from('registro_approvazioni')
                                    .update({
                                        stato: 'APPROVATO',
                                        data_decisione: new Date().toISOString().split('T')[0]
                                    })
                                    .eq('id', appRecord.id);
                                if (updErr) {
                                    console.error("[PAYMENT WEBHOOK] Errore aggiornamento stato approvazione SOCIO:", updErr);
                                } else {
                                    console.log(`[PAYMENT WEBHOOK] Richiesta SOCIO marcata come APPROVATO per anagrafica ${anagraficaId}`);
                                }
                            }
                        }
                    }
                } catch (actErr) {
                    console.error("[PAYMENT WEBHOOK] Errore durante l'attivazione automatica:", actErr);
                }
            }

            // 4. Scrivi l'audit log
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Stripe Webhook';
            await supabase
                .from('registro_audit_operazioni')
                .insert({
                    operatore_id: utenteId,
                    azione: 'EMISSIONE_RICEVUTA_PAGAMENTO',
                    tabella_target: 'ricevute_pagamenti',
                    record_target_id: String(recData.id),
                    dettagli: {
                        numero_ricevuta: nextNum,
                        anno_fiscale: annoFiscale,
                        utente_id: utenteId,
                        importo: importo,
                        stripe_payment_id: stripePaymentId,
                        evento_id: eventId || null
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
