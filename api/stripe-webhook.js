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
        const stripePaymentId = session.payment_intent || session.subscription || session.id;

        if (!utenteId) {
            console.error('Errore: Manca utenteId nei metadati della sessione Stripe.');
            return res.status(400).send('Missing utenteId in session metadata');
        }

        // Se si tratta di un abbonamento in modalità rateale, imposta la cancellazione automatica a 12 mesi
        if (session.mode === 'subscription' && session.subscription) {
            try {
                const stripe = new Stripe(stripeSecretKey);
                const subId = session.subscription;
                const subscription = await stripe.subscriptions.retrieve(subId);

                const isInstallment = session.metadata?.is_installment === 'true' || subscription.metadata?.is_installment === 'true';
                if (isInstallment) {
                    const numMesi = parseInt(session.metadata?.installments_total || subscription.metadata?.installments_total || '12');
                    const startDate = new Date(subscription.created * 1000);
                    const endDate = new Date(startDate);
                    endDate.setMonth(endDate.getMonth() + (isNaN(numMesi) ? 12 : numMesi));
                    const cancelAtSeconds = Math.floor(endDate.getTime() / 1000);

                    await stripe.subscriptions.update(subId, {
                        cancel_at: cancelAtSeconds
                    });
                    console.log(`[SUBSCRIPTION WEBHOOK] Impostata cancellazione automatica per subscription ${subId} dopo ${numMesi} mesi (data: ${endDate.toISOString()})`);
                }
            } catch (subErr) {
                console.error('❌ Errore impostazione cancel_at per abbonamento Stripe:', subErr);
            }
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
                    evento_id: eventId || null,
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

                // Recupera la bozza di iscrizione (solo se non ancora scaduta)
                const { data: bozza, error: bozzaError } = await supabase
                    .from('epika_iscrizioni_bozza')
                    .select('*')
                    .eq('id', bozzaId)
                    .gt('expires_at', new Date().toISOString())
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

                // Aggiorna la ricevuta inserita precedentemente con l'evento_id dell'evento Epika
                await supabase
                    .from('ricevute_pagamenti')
                    .update({ evento_id: bozza.evento_id })
                    .eq('id', recData.id);

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
                const tipoPiano = session.metadata?.tipo_piano;
                const ingressiStr = session.metadata?.ingressi;
                let dataScadenzaCorso = null;
                let ingressiTotaliVal = null;
                let ingressiUsatiVal = null;
                let tipoIscrizioneVal = null;

                if (tipoPiano === 'carnet' || ingressiStr) {
                    const ingNum = parseInt(ingressiStr || '8');
                    ingressiTotaliVal = isNaN(ingNum) ? 8 : ingNum;
                    ingressiUsatiVal = 0;
                    tipoIscrizioneVal = ingressiTotaliVal === 4 ? 'CARNET_4' : (ingressiTotaliVal === 8 ? 'CARNET_8' : 'CARNET');

                    // Scadenza fissa per carnet al 31 Luglio dell'anno sportivo
                    const start = new Date(dataInizioCorso);
                    const currentMonth = start.getMonth() + 1; // 1-12
                    const currentYear = start.getFullYear();
                    const refYear = currentMonth >= 8 ? currentYear + 1 : currentYear;
                    dataScadenzaCorso = `${refYear}-07-31`;
                } else if (nomePiano) {
                    const { data: ev } = await supabase
                        .from('eventi')
                        .select('piani_abbonamento')
                        .eq('id', eventId)
                        .maybeSingle();

                    if (ev && Array.isArray(ev.piani_abbonamento)) {
                        const piano = ev.piani_abbonamento.find(p => p.nome.toLowerCase() === nomePiano.toLowerCase());
                        let durataMesi = piano && piano.durata_mesi ? parseInt(piano.durata_mesi) : null;
                        if (!durataMesi || isNaN(durataMesi)) {
                            const lower = (nomePiano || '').toLowerCase();
                            if (lower.includes('trimest')) durataMesi = 3;
                            else if (lower.includes('semest')) durataMesi = 6;
                            else if (lower.includes('annual')) durataMesi = 12;
                            else durataMesi = 1;
                        }
                        const start = new Date(dataInizioCorso);
                        const end = new Date(start);
                        end.setMonth(start.getMonth() + durataMesi);
                        end.setDate(end.getDate() - 1);
                        dataScadenzaCorso = end.toISOString().split('T')[0];
                    }
                }

                const isInstallment = session.metadata?.is_installment === 'true';
                const abbonamentoScelto = nomePiano || 'Mese';
                const tipoPagamento = isInstallment ? 'A RATE' : 'UNICA RATA';
                const totaleRateVal = isInstallment ? parseInt(session.metadata?.installments_total || '12') : null;
                const ratePagateVal = isInstallment ? 1 : null;
                const statoRateVal = isInstallment ? 'IN_REGOLA' : null;
                let primaryIscrizioneId = null;

                if (renew) {
                    // Aggiorna l'iscrizione esistente per rinnovo
                    const { data: updatedIscr, error: eventRegError } = await supabase
                        .from('iscrizioni_eventi')
                        .update({
                            stato_pagamento: 'PAGATO',
                            codice_transazione: stripePaymentId,
                            data_iscrizione: new Date().toISOString(),
                            data_inizio_corso: dataInizioCorso,
                            data_scadenza_corso: dataScadenzaCorso,
                            scadenza_modificata_a_mano: false,
                            abbonamento_scelto: abbonamentoScelto,
                            tipo_pagamento: tipoPagamento,
                            totale_rate: totaleRateVal,
                            rate_pagate: ratePagateVal,
                            stato_rate: statoRateVal,
                            ingressi_totali: ingressiTotaliVal,
                            ingressi_usati: ingressiUsatiVal,
                            tipo_iscrizione: tipoIscrizioneVal
                        })
                        .eq('evento_id', eventId)
                        .eq('utente_id', utenteId)
                        .select('id')
                        .single();
                    
                    if (eventRegError) {
                        throw new Error("Errore aggiornamento iscrizione evento per rinnovo: " + eventRegError.message);
                    }
                    primaryIscrizioneId = updatedIscr?.id;
                    console.log(`Rinnovato corso/evento ${eventId} per utente ${utenteId} (Inizio: ${dataInizioCorso}, Scadenza: ${dataScadenzaCorso})`);
                } else {
                    // Iscrizione Corso/Evento: inserisci l'iscrizione
                    const { data: insertedIscr, error: eventRegError } = await supabase
                        .from('iscrizioni_eventi')
                        .insert({
                            evento_id: eventId,
                            utente_id: utenteId,
                            stato_pagamento: 'PAGATO',
                            codice_transazione: stripePaymentId,
                            data_inizio_corso: dataInizioCorso,
                            data_scadenza_corso: dataScadenzaCorso,
                            abbonamento_scelto: abbonamentoScelto,
                            tipo_pagamento: tipoPagamento,
                            totale_rate: totaleRateVal,
                            rate_pagate: ratePagateVal,
                            stato_rate: statoRateVal,
                            ingressi_totali: ingressiTotaliVal,
                            ingressi_usati: ingressiUsatiVal,
                            tipo_iscrizione: tipoIscrizioneVal
                        })
                        .select('id')
                        .single();
                    
                    if (eventRegError) {
                        throw new Error("Errore inserimento iscrizione evento: " + eventRegError.message);
                    }
                    primaryIscrizioneId = insertedIscr?.id;
                    console.log(`Iscritto utente ${utenteId} all'evento ${eventId} (Inizio: ${dataInizioCorso}, Scadenza: ${dataScadenzaCorso})`);
                }

                // ==========================================
                // BUNDLE PROMOZIONALE: IBRIDO + SCAB
                // ==========================================
                if (session.metadata?.is_promo_bundle === 'true' && primaryIscrizioneId) {
                    const scabEventoId = session.metadata?.scab_evento_id || '3854f25c-db1c-4c6a-b62a-70398643239a';
                    try {
                        const { data: existingScab } = await supabase
                            .from('iscrizioni_eventi')
                            .select('id')
                            .eq('evento_id', scabEventoId)
                            .eq('utente_id', utenteId)
                            .maybeSingle();

                        if (existingScab) {
                            await supabase
                                .from('iscrizioni_eventi')
                                .update({
                                    stato_pagamento: 'PAGATO',
                                    tipo_pagamento: 'GRATUITO',
                                    tipo_iscrizione: 'PROMO_BUNDLE',
                                    data_iscrizione: new Date().toISOString(),
                                    data_inizio_corso: dataInizioCorso,
                                    data_scadenza_corso: dataScadenzaCorso,
                                    scadenza_modificata_a_mano: false,
                                    abbonamento_scelto: `${abbonamentoScelto} (Promo Ibrido)`,
                                    iscrizione_promo_padre_id: primaryIscrizioneId
                                })
                                .eq('id', existingScab.id);
                        } else {
                            await supabase
                                .from('iscrizioni_eventi')
                                .insert({
                                    evento_id: scabEventoId,
                                    utente_id: utenteId,
                                    stato_pagamento: 'PAGATO',
                                    tipo_pagamento: 'GRATUITO',
                                    tipo_iscrizione: 'PROMO_BUNDLE',
                                    data_inizio_corso: dataInizioCorso,
                                    data_scadenza_corso: dataScadenzaCorso,
                                    abbonamento_scelto: `${abbonamentoScelto} (Promo Ibrido)`,
                                    iscrizione_promo_padre_id: primaryIscrizioneId
                                });
                        }

                        // Audit log per attivazione bundle
                        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Stripe Webhook';
                        await supabase
                            .from('registro_audit_operazioni')
                            .insert({
                                operatore_id: utenteId,
                                azione: 'ISCRIZIONE_SCAB_PROMO_BUNDLE',
                                tabella_target: 'iscrizioni_eventi',
                                record_target_id: String(primaryIscrizioneId),
                                dettagli: {
                                    evento_padre_id: eventId,
                                    evento_omaggio_id: scabEventoId,
                                    scadenza: dataScadenzaCorso,
                                    piano: abbonamentoScelto
                                },
                                ip_address: typeof ip === 'string' ? ip.split(',')[0].trim() : 'Stripe Webhook'
                            });

                        console.log(`🎁 [PROMO BUNDLE] Iscrizione SCAB attivata con successo per utente ${utenteId} (Inizio: ${dataInizioCorso}, Scadenza: ${dataScadenzaCorso})`);
                    } catch (promoErr) {
                        console.error('❌ Errore attivazione corso SCAB promozionale:', promoErr);
                    }
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

    // ==========================================
    // CASO B: PRELIEVO RATA MENSILE RIUSCITO (invoice.paid)
    // ==========================================
    else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        const subId = invoice.subscription;

        // Processa solo le rate periodiche mensili successive (subscription_cycle)
        if (subId && invoice.billing_reason === 'subscription_cycle') {
            try {
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                const stripePaymentId = invoice.payment_intent || invoice.id;

                // Trova l'iscrizione collegata a questa sottoscrizione
                const { data: iscrizione, error: iscError } = await supabase
                    .from('iscrizioni_eventi')
                    .select('id, utente_id, evento_id, rate_pagate, totale_rate, abbonamento_scelto')
                    .eq('codice_transazione', subId)
                    .maybeSingle();

                if (iscError || !iscrizione) {
                    console.log(`[INVOICE PAID] Nessuna iscrizione trovata per subscription ${subId}`);
                    return res.status(200).json({ received: true });
                }

                // Idempotenza ricevuta
                const { data: existingReceipt } = await supabase
                    .from('ricevute_pagamenti')
                    .select('id')
                    .eq('codice_transazione', stripePaymentId)
                    .maybeSingle();

                if (!existingReceipt) {
                    const importo = parseFloat((invoice.amount_paid / 100).toFixed(2));
                    const annoFiscale = new Date().getFullYear();

                    const { data: nextNum } = await supabase.rpc('prossimo_numero_ricevuta', { p_anno: annoFiscale });
                    const nextNumVal = nextNum || 1;

                    const newRatePagate = Math.min((iscrizione.rate_pagate || 1) + 1, iscrizione.totale_rate || 12);
                    const causale = `Rata ${newRatePagate}/${iscrizione.totale_rate || 12} - Abbonamento ${iscrizione.abbonamento_scelto || 'Corso'}`;

                    const { data: recData } = await supabase
                        .from('ricevute_pagamenti')
                        .insert({
                            numero_ricevuta: nextNumVal,
                            anno_fiscale: annoFiscale,
                            utente_id: iscrizione.utente_id,
                            evento_id: iscrizione.evento_id,
                            importo: importo,
                            causale: causale,
                            metodo_pagamento: 'STRIPE',
                            codice_transazione: stripePaymentId
                        })
                        .select()
                        .single();

                    // Aggiorna contatore rate e stato
                    await supabase
                        .from('iscrizioni_eventi')
                        .update({
                            rate_pagate: newRatePagate,
                            stato_rate: 'IN_REGOLA'
                        })
                        .eq('id', iscrizione.id);

                    // Sincronizza eventuale iscrizione omaggio collegata (es. SCAB con Ibrido)
                    await supabase
                        .from('iscrizioni_eventi')
                        .update({
                            stato_pagamento: 'PAGATO',
                            stato_rate: 'IN_REGOLA'
                        })
                        .eq('iscrizione_promo_padre_id', iscrizione.id);

                    // Audit log
                    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Stripe Webhook';
                    await supabase
                        .from('registro_audit_operazioni')
                        .insert({
                            operatore_id: iscrizione.utente_id,
                            azione: 'EMISSIONE_RICEVUTA_RATA',
                            tabella_target: 'ricevute_pagamenti',
                            record_target_id: String(recData?.id || iscrizione.id),
                            dettagli: {
                                numero_ricevuta: nextNumVal,
                                anno_fiscale: annoFiscale,
                                utente_id: iscrizione.utente_id,
                                importo: importo,
                                rate_pagate: newRatePagate,
                                stripe_payment_id: stripePaymentId
                            },
                            ip_address: typeof ip === 'string' ? ip.split(',')[0].trim() : 'Stripe Webhook'
                        });

                    console.log(`✅ Rata ${newRatePagate}/${iscrizione.totale_rate} registrata con successo per iscrizione ${iscrizione.id}!`);
                }
            } catch (invErr) {
                console.error("❌ Errore elaborazione invoice.paid:", invErr);
                return res.status(500).json({ error: invErr.message });
            }
        }
    }

    // ==========================================
    // CASO C: PRELIEVO RATA FALLITO (invoice.payment_failed)
    // ==========================================
    else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const subId = invoice.subscription;

        if (subId) {
            try {
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                const { data: iscrizione } = await supabase
                    .from('iscrizioni_eventi')
                    .select('id, utente_id, rate_pagate, totale_rate')
                    .eq('codice_transazione', subId)
                    .maybeSingle();

                if (iscrizione) {
                    await supabase
                        .from('iscrizioni_eventi')
                        .update({
                            stato_rate: 'INSOLUTO'
                        })
                        .eq('id', iscrizione.id);

                    // Sospendi eventuale corso omaggio collegato (es. SCAB con Ibrido)
                    await supabase
                        .from('iscrizioni_eventi')
                        .update({
                            stato_pagamento: 'SOSPESO',
                            stato_rate: 'INSOLUTO'
                        })
                        .eq('iscrizione_promo_padre_id', iscrizione.id);

                    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Stripe Webhook';
                    await supabase
                        .from('registro_audit_operazioni')
                        .insert({
                            operatore_id: iscrizione.utente_id,
                            azione: 'RATA_FALLITA_STRIPE',
                            tabella_target: 'iscrizioni_eventi',
                            record_target_id: String(iscrizione.id),
                            dettagli: {
                                subscription_id: subId,
                                invoice_id: invoice.id,
                                motivo: invoice.last_finalization_error?.message || 'Prelievo fallito'
                            },
                            ip_address: typeof ip === 'string' ? ip.split(',')[0].trim() : 'Stripe Webhook'
                        });

                    console.log(`⚠️ Segnalato stato INSOLUTO per iscrizione ${iscrizione.id} e corsi promozionali collegati`);
                }
            } catch (failErr) {
                console.error("❌ Errore elaborazione invoice.payment_failed:", failErr);
            }
        }
    }

    // ==========================================
    // CASO D: SOTTOSCRIZIONE CANCELLATA (customer.subscription.deleted)
    // ==========================================
    else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const subId = subscription.id;

        try {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const { data: iscrizione } = await supabase
                .from('iscrizioni_eventi')
                .select('id, rate_pagate, totale_rate')
                .eq('codice_transazione', subId)
                .maybeSingle();

            if (iscrizione && iscrizione.totale_rate && (iscrizione.rate_pagate || 0) < iscrizione.totale_rate) {
                await supabase
                    .from('iscrizioni_eventi')
                    .update({
                        stato_rate: 'ANNULLATO'
                    })
                    .eq('id', iscrizione.id);

                // Annulla eventuale corso omaggio collegato
                await supabase
                    .from('iscrizioni_eventi')
                    .update({
                        stato_pagamento: 'ANNULLATO',
                        stato_rate: 'ANNULLATO'
                    })
                    .eq('iscrizione_promo_padre_id', iscrizione.id);

                console.log(`ℹ️ Sottoscrizione terminata/annullata anticipatamente per iscrizione ${iscrizione.id} e corsi promo collegati`);
            }
        } catch (delErr) {
            console.error("❌ Errore elaborazione subscription.deleted:", delErr);
        }
    }

    return res.status(200).json({ received: true });
}
