import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    const allowedOrigins = [
        'https://adrenalinaclub.it',
        'https://www.adrenalinaclub.it',
        'https://portal.adrenalinaclub.it',
        'https://nex-777.github.io',
        'https://adr-sito.vercel.app',
        'http://localhost:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Richiesta non autorizzata: token mancante.' });
    }
    const token = authHeader.split(' ')[1];
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Sessione non valida o scaduta.' });
    }

    const utenteId = user.id;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

    // Determina il tipo di richiesta dal body
    const { eventId, giorni_presenza, data_ora_arrivo, data_ora_ripartenza, dettagli, nomePiano, renew, dataInizioCorso } = req.body;

    try {
        const stripe = new Stripe(stripeSecretKey);
        const reqOrigin = req.headers.origin || 'https://portal.adrenalinaclub.it';

        // ==========================================
        // CASO A: CHECKOUT EVENTO EPIKA RIEVOCATIVO
        // ==========================================
        if (giorni_presenza || req.body.type === 'epika_evento') {
            // Rate limiting check per epika (max 20 tentativi/ora per utente)
            const { data: allowed } = await supabase.rpc('check_rate_limit', {
                p_key: `epika_event_checkout:${utenteId}`,
                p_max_requests: 20,
                p_window_seconds: 3600
            });
            if (allowed === false) {
                return res.status(429).json({ error: 'Troppe richieste di checkout dal tuo account. Riprova più tardi.' });
            }

            if (!eventId) {
                return res.status(400).json({ error: 'Identificativo evento mancante.' });
            }

            // 1. Recupera le info dell'evento Epika
            const { data: evento, error: eventError } = await supabase
                .from('epika_eventi')
                .select('id, titolo, costo')
                .eq('id', eventId)
                .maybeSingle();

            if (eventError || !evento) {
                return res.status(404).json({ error: 'Evento Epika non trovato.' });
            }

            // Verifica se l'utente è già iscritto a questo evento
            const { data: iscrizioneEsistente } = await supabase
                .from('epika_iscrizioni_eventi')
                .select('id')
                .eq('evento_id', eventId)
                .eq('utente_id', utenteId)
                .maybeSingle();

            if (iscrizioneEsistente) {
                return res.status(400).json({ error: 'Sei già iscritto a questo evento storico.' });
            }

            // Blocco preventivo: utenti con registrazione Adrenalina incompleta non possono acquistare eventi Epika
            const { data: isRegistrazioneIncompleta } = await supabase
                .from('vw_registrazioni_incomplete')
                .select('utente_id')
                .eq('utente_id', utenteId)
                .maybeSingle();

            if (isRegistrazioneIncompleta) {
                return res.status(403).json({
                    error: 'Per partecipare agli eventi Epika è necessario completare il tesseramento ad Adrenalina Club. Completa la registrazione dal portale e riprova.'
                });
            }

            const costo = parseFloat(evento.costo || 0);

            // Se l'evento è gratuito, lo iscriviamo direttamente senza Stripe
            if (costo === 0) {
                const { error: insertError } = await supabase
                    .from('epika_iscrizioni_eventi')
                    .insert({
                        evento_id: eventId,
                        utente_id: utenteId,
                        giorni_presenza: giorni_presenza || [],
                        data_ora_arrivo: data_ora_arrivo || null,
                        data_ora_ripartenza: data_ora_ripartenza || null,
                        dettagli: dettagli || {}
                    });

                if (insertError) {
                    console.error('Errore iscrizione evento gratuito:', insertError);
                    return res.status(500).json({ error: 'Errore durante la registrazione all\'evento gratuito.' });
                }

                return res.status(200).json({ free: true });
            }

            // Se l'evento è a pagamento, creiamo una bozza di iscrizione
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 30);

            // Usiamo upsert per sostituire eventuali bozze pendenti dello stesso utente per lo stesso evento
            const { data: bozza, error: bozzaError } = await supabase
                .from('epika_iscrizioni_bozza')
                .upsert({
                    utente_id: utenteId,
                    evento_id: eventId,
                    giorni_presenza: giorni_presenza || [],
                    data_ora_arrivo: data_ora_arrivo || null,
                    data_ora_ripartenza: data_ora_ripartenza || null,
                    dettagli: dettagli || {},
                    expires_at: expiresAt.toISOString()
                }, {
                    onConflict: 'utente_id,evento_id'
                })
                .select('id')
                .single();

            if (bozzaError || !bozza) {
                console.error('Errore salvataggio bozza:', bozzaError);
                return res.status(500).json({ error: 'Impossibile registrare la bozza di iscrizione.' });
            }

            const { data: profile } = await supabase
                .from('utenti')
                .select('email, nome, cognome')
                .eq('id', utenteId)
                .maybeSingle();

            const userEmail = profile?.email || user.email;
            const description = `Iscrizione Evento Storico: ${evento.titolo} per ${profile?.nome || ''} ${profile?.cognome || ''}`;

            // Calcolo prezzo e commissione del 2%
            const baseAmount = Math.round(costo * 100);
            const feeAmount = Math.round(costo * 0.02 * 100);
            const totalAmount = baseAmount + feeAmount;
            const totalPrezzo = (totalAmount / 100).toFixed(2);

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Quota Iscrizione Evento Storico: ${evento.titolo}`,
                                description: description,
                            },
                            unit_amount: baseAmount,
                        },
                        quantity: 1,
                    },
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Spese di gestione transazione e amministrative (2%)`,
                            },
                            unit_amount: feeAmount,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                customer_email: userEmail,
                metadata: {
                    tipo: 'epika_evento',
                    bozza_id: bozza.id,
                    utenteId: utenteId,
                    eventId: eventId,
                    importo: totalPrezzo,
                    causale: description
                },
                success_url: `${reqOrigin}/portal/epika.html?event_payment=success&event_id=${eventId}`,
                cancel_url: `${reqOrigin}/portal/epika.html?event_payment=cancel`,
            });

            // Aggiorna la bozza con l'id della sessione Stripe per tracciabilità
            await supabase
                .from('epika_iscrizioni_bozza')
                .update({ stripe_session_id: session.id })
                .eq('id', bozza.id);

            return res.status(200).json({ url: session.url });
        }

        // ==========================================
        // CASO B: CHECKOUT CORSO / EVENTO ADRENALINA
        // ==========================================
        else if (eventId) {
            // Validate dataInizioCorso against tesseramento date
            const { data: profileAnag, error: anagErr } = await supabase
                .from('utenti')
                .select('ruolo, anagrafiche(id, registro_tesserati(data_richiesta_tesseramento, stato_tesseramento))')
                .eq('id', utenteId)
                .maybeSingle();

            if (anagErr || !profileAnag) {
                return res.status(400).json({ error: 'Profilo utente non trovato.' });
            }

            const isBoard = profileAnag.ruolo && profileAnag.ruolo.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere'].includes(r));

            if (!isBoard) {
                const anag = Array.isArray(profileAnag.anagrafiche) ? profileAnag.anagrafiche[0] : profileAnag.anagrafiche;
                const rt = anag?.registro_tesserati;
                if (!rt || rt.stato_tesseramento !== 'ATTIVO') {
                    return res.status(400).json({ error: 'Devi avere un tesseramento attivo per iscriverti a questo corso.' });
                }

                if (dataInizioCorso && rt.data_richiesta_tesseramento) {
                    const startD = new Date(dataInizioCorso);
                    const tessD = new Date(rt.data_richiesta_tesseramento);
                    if (startD < tessD) {
                        return res.status(400).json({ error: `La data di inizio corso (${dataInizioCorso}) non può essere antecedente alla data del tesseramento (${rt.data_richiesta_tesseramento}).` });
                    }
                }
            }

            // Rate limiting check per utente (max 20 tentativi/ora)
            const { data: allowed } = await supabase.rpc('check_rate_limit', {
                p_key: `event_checkout:${utenteId}`,
                p_max_requests: 20,
                p_window_seconds: 3600
            });
            if (allowed === false) {
                return res.status(429).json({ error: 'Troppe richieste di checkout dal tuo account. Riprova più tardi.' });
            }

            // 1. Recupera le informazioni dell'evento da Supabase
            const { data: evento, error: eventError } = await supabase
                .from('eventi')
                .select('id, prezzo, piani_abbonamento, titolo')
                .eq('id', eventId)
                .maybeSingle();

            if (eventError) {
                console.error('Errore recupero evento in create-event-checkout-session:', eventError);
                return res.status(500).json({ error: 'Errore durante il recupero dei dati del corso.' });
            }

            if (!evento) {
                return res.status(404).json({ error: 'Evento non trovato.' });
            }

            // Verifica se l'utente è già iscritto
            const { data: iscrizioneEsistente } = await supabase
                .from('iscrizioni_eventi')
                .select('id, stato_pagamento')
                .eq('evento_id', eventId)
                .eq('utente_id', utenteId)
                .maybeSingle();

            if (iscrizioneEsistente && !renew) {
                return res.status(400).json({ error: 'Sei già iscritto a questo evento.' });
            }

            let prezzo = parseFloat(evento.prezzo);
            if (isNaN(prezzo)) {
                prezzo = 0;
            }
            let causaleDettaglio = '';

            if (evento.piani_abbonamento && Array.isArray(evento.piani_abbonamento) && evento.piani_abbonamento.length > 0) {
                let piano = null;
                if (nomePiano) {
                    piano = evento.piani_abbonamento.find(p => p.nome.toLowerCase() === nomePiano.toLowerCase());
                    if (!piano) {
                        return res.status(400).json({ error: 'Piano di abbonamento selezionato non valido.' });
                    }
                } else {
                    piano = evento.piani_abbonamento[0]; // fallback
                }
                prezzo = parseFloat(piano.prezzo);
                causaleDettaglio = ` - Abbonamento ${piano.nome}`;
            }

            if (isNaN(prezzo) || prezzo < 0) {
                return res.status(400).json({ error: 'Prezzo dell\'evento non valido.' });
            }

            // 2. Recupera dati profilo utente per email
            const { data: profile } = await supabase
                .from('utenti')
                .select('email, nome, cognome')
                .eq('id', utenteId)
                .maybeSingle();

            const userEmail = profile?.email || user.email;

            // Se l'evento è gratuito, iscrivi direttamente l'utente
            if (prezzo === 0) {
                const { error: insertError } = await supabase
                    .from('iscrizioni_eventi')
                    .insert({
                        evento_id: eventId,
                        utente_id: utenteId,
                        stato_pagamento: 'GRATUITO',
                        data_inizio_corso: dataInizioCorso || new Date().toISOString().split('T')[0],
                        abbonamento_scelto: nomePiano || 'Mese',
                        tipo_pagamento: 'GRATUITO'
                    });

                if (insertError) {
                    console.error('Errore iscrizione evento gratuito in create-event-checkout-session:', insertError);
                    return res.status(500).json({ error: 'Errore durante la registrazione al corso gratuito.' });
                }

                return res.status(200).json({ free: true });
            }

            const description = `Iscrizione Corso: ${evento.titolo}${causaleDettaglio} per ${profile?.nome || ''} ${profile?.cognome || ''}`;

            const isInstallment = req.body?.is_installment === true || req.body?.is_installment === 'true';

            if (isInstallment) {
                let numRate = parseInt(req.body?.num_rate || '12');
                if (isNaN(numRate) || numRate <= 0) numRate = 12;
                if (numRate > 12) numRate = 12;

                const monthlyBaseQuota = Math.round((prezzo / numRate) * 100);
                const monthlyFeeQuota = Math.round((prezzo / numRate) * 0.02 * 100);
                const monthlyTotalAmount = monthlyBaseQuota + monthlyFeeQuota;
                const monthlyTotalStr = (monthlyTotalAmount / 100).toFixed(2);

                const session = await stripe.checkout.sessions.create({
                    line_items: [
                        {
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: `Iscrizione Corso (${numRate} Rate Mensili)`,
                                    description: `${description} - Rateizzazione (${numRate} Mesi)`,
                                },
                                unit_amount: monthlyBaseQuota,
                                recurring: {
                                    interval: 'month',
                                    interval_count: 1
                                }
                            },
                            quantity: 1,
                        },
                        {
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: `Spese di gestione transazione e amministrative (2%)`,
                                },
                                unit_amount: monthlyFeeQuota,
                                recurring: {
                                    interval: 'month',
                                    interval_count: 1
                                }
                            },
                            quantity: 1,
                        },
                    ],
                    mode: 'subscription',
                    customer_email: userEmail,
                    subscription_data: {
                        metadata: {
                            utenteId: utenteId,
                            eventId: eventId,
                            is_installment: 'true',
                            installments_total: String(numRate),
                            importo_totale_quota: prezzo.toFixed(2),
                            importo_rata: monthlyTotalStr,
                            causale: description,
                            renew: renew ? 'true' : 'false',
                            nomePiano: nomePiano || '',
                            dataInizioCorso: dataInizioCorso || new Date().toISOString().split('T')[0]
                        }
                    },
                    metadata: {
                        utenteId: utenteId,
                        eventId: eventId,
                        is_installment: 'true',
                        installments_total: String(numRate),
                        importo: monthlyTotalStr,
                        causale: `${description} (Abbonamento ${numRate} Rate)`,
                        renew: renew ? 'true' : 'false',
                        nomePiano: nomePiano || '',
                        dataInizioCorso: dataInizioCorso || new Date().toISOString().split('T')[0]
                    },
                    success_url: `${reqOrigin}/portal/dashboard.html?event_payment=success&event_id=${eventId}&type=subscription`,
                    cancel_url: `${reqOrigin}/portal/dashboard.html?event_payment=cancel`,
                });

                return res.status(200).json({ url: session.url });
            }

            // Calcola il prezzo base e la commissione del 2% per le spese di gestione (Pagamento Unico)
            const baseAmount = Math.round(prezzo * 100);
            const feeAmount = Math.round(prezzo * 0.02 * 100);
            const totalAmount = baseAmount + feeAmount;
            const totalPrezzo = (totalAmount / 100).toFixed(2);

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Iscrizione Corso / Evento`,
                                description: description,
                            },
                            unit_amount: baseAmount,
                        },
                        quantity: 1,
                    },
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Spese di gestione transazione e amministrative (2%)`,
                            },
                            unit_amount: feeAmount,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                customer_email: userEmail,
                metadata: {
                    utenteId: utenteId,
                    eventId: eventId,
                    importo: totalPrezzo,
                    causale: description,
                    renew: renew ? 'true' : 'false',
                    nomePiano: nomePiano || '',
                    dataInizioCorso: dataInizioCorso || new Date().toISOString().split('T')[0]
                },
                success_url: `${reqOrigin}/portal/dashboard.html?event_payment=success&event_id=${eventId}`,
                cancel_url: `${reqOrigin}/portal/dashboard.html?event_payment=cancel`,
            });

            return res.status(200).json({ url: session.url });
        }

        // ==========================================
        // CASO C: CHECKOUT QUOTA ASSOCIATIVA / TESSERAMENTO
        // ==========================================
        else {
            // 1. Recupera le informazioni del profilo utente da Supabase
            const { data: profile, error: profileError } = await supabase
                .from('utenti')
                .select('nome, cognome, email, quota_totale, tipo_adesione, anagrafiche(id, registro_tesserati(livello_copertura), registro_approvazioni(livello_copertura))')
                .eq('id', utenteId)
                .maybeSingle();

            if (profileError) {
                console.error('Errore query Supabase in create-checkout-session:', profileError);
                return res.status(500).json({ error: 'Errore durante il caricamento del profilo utente.' });
            }

            if (!profile) {
                return res.status(404).json({ error: 'Profilo utente non trovato.' });
            }

            const quota = parseFloat(profile.quota_totale);
            if (isNaN(quota) || quota <= 0) {
                return res.status(400).json({ error: 'Nessun pagamento dovuto o quota già saldata.' });
            }

            // Determina la causale dinamica del tesseramento/adesione
            let description = '';
            if (profile.tipo_adesione === 'tesserato' || profile.tipo_adesione === 'tesserato_esterno') {
                let livelloCopertura = 'BASE';
                const anag = Array.isArray(profile.anagrafiche) ? profile.anagrafiche[0] : profile.anagrafiche;
                if (anag) {
                    const rt = Array.isArray(anag.registro_tesserati) ? anag.registro_tesserati[0] : anag.registro_tesserati;
                    const ra = Array.isArray(anag.registro_approvazioni) ? anag.registro_approvazioni : [anag.registro_approvazioni];
                    if (rt && rt.livello_copertura) {
                        livelloCopertura = rt.livello_copertura;
                    } else {
                        const pendingTess = ra?.find(r => r && r.livello_copertura);
                        if (pendingTess && pendingTess.livello_copertura) {
                            livelloCopertura = pendingTess.livello_copertura;
                        }
                    }
                }
                description = `Quota tesseramento annuale - ${livelloCopertura.replace(/_/g, ' ').toUpperCase()}`;
            } else {
                const tipoAdesioneLabel = profile.tipo_adesione 
                    ? profile.tipo_adesione.replace(/_/g, ' ').toUpperCase()
                    : 'SOCIO';
                description = `Quota annuale 2026 - ${tipoAdesioneLabel} per ${profile.nome} ${profile.cognome}`;
            }

            const isInstallment = req.body?.is_installment === true || req.body?.is_installment === 'true';

            if (isInstallment) {
                // Determina il numero di rate ammesse (massimo 12 per annuale, 6 per semestrale, 3 per trimestrale)
                let numRate = parseInt(req.body?.num_rate || '12');
                if (isNaN(numRate) || numRate <= 0) numRate = 12;
                if (numRate > 12) numRate = 12; // limite massimo annuale

                // Calcola la rata mensile e la commissione del 2%
                const monthlyBaseQuota = Math.round((quota / numRate) * 100);
                const monthlyFeeQuota = Math.round((quota / numRate) * 0.02 * 100);
                const monthlyTotalAmount = monthlyBaseQuota + monthlyFeeQuota;
                const monthlyTotalStr = (monthlyTotalAmount / 100).toFixed(2);

                const session = await stripe.checkout.sessions.create({
                    line_items: [
                        {
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: `Quota Associativa (${numRate} Rate Mensili)`,
                                    description: `${description} - Rateizzazione (${numRate} Mesi)`,
                                },
                                unit_amount: monthlyBaseQuota,
                                recurring: {
                                    interval: 'month',
                                    interval_count: 1
                                }
                            },
                            quantity: 1,
                        },
                        {
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: `Spese di gestione transazione e amministrative (2%)`,
                                },
                                unit_amount: monthlyFeeQuota,
                                recurring: {
                                    interval: 'month',
                                    interval_count: 1
                                }
                            },
                            quantity: 1,
                        },
                    ],
                    mode: 'subscription',
                    customer_email: profile.email,
                    subscription_data: {
                        metadata: {
                            utenteId: utenteId,
                            is_installment: 'true',
                            installments_total: String(numRate),
                            importo_totale_quota: quota.toFixed(2),
                            importo_rata: monthlyTotalStr,
                            causale: description
                        }
                    },
                    metadata: {
                        utenteId: utenteId,
                        is_installment: 'true',
                        installments_total: String(numRate),
                        importo: monthlyTotalStr,
                        causale: `${description} (Abbonamento ${numRate} Rate)`
                    },
                    success_url: `${reqOrigin}/portal/dashboard.html?payment=success&type=subscription`,
                    cancel_url: `${reqOrigin}/portal/pagamento.html?id=${utenteId}&payment=cancel`,
                });

                return res.status(200).json({ url: session.url });
            }

            // Calcola la quota e la commissione del 2% per le spese di gestione (Pagamento Unico)
            const baseAmount = Math.round(quota * 100);
            const feeAmount = Math.round(quota * 0.02 * 100);
            const totalAmount = baseAmount + feeAmount;
            const totalQuota = (totalAmount / 100).toFixed(2);

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Quota Associativa / Tesseramento`,
                                description: description,
                            },
                            unit_amount: baseAmount,
                        },
                        quantity: 1,
                    },
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Spese di gestione transazione e amministrative (2%)`,
                            },
                            unit_amount: feeAmount,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                customer_email: profile.email,
                metadata: {
                    utenteId: utenteId,
                    importo: totalQuota,
                    causale: description
                },
                success_url: `${reqOrigin}/portal/dashboard.html?payment=success`,
                cancel_url: `${reqOrigin}/portal/pagamento.html?id=${utenteId}&payment=cancel`,
            });

            return res.status(200).json({ url: session.url });
        }

    } catch (err) {
        console.error('Errore creazione checkout session unificata:', err);
        return res.status(500).json({ error: 'Si è verificato un errore interno. Riprova più tardi.' });
    }
}
