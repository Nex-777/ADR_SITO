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
 
    if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Configurazione incompleta: manca STRIPE_SECRET_KEY su Vercel.' });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Configurazione incompleta: mancano le credenziali Supabase su Vercel.' });
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
 
    try {
        const utenteId = user.id;
        const { eventId, nomePiano, renew } = req.body;

        if (!eventId) {
            return res.status(400).json({ error: 'Identificativo evento mancante.' });
        }
 
        // Rate limiting check
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
        const { data: allowed } = await supabase.rpc('check_rate_limit', {
            p_key: `event_checkout:${clientIp}`,
            p_max_requests: 5,
            p_window_seconds: 3600
        });
        if (allowed === false) {
            return res.status(429).json({ error: 'Troppe richieste di checkout. Riprova più tardi.' });
        }
 
        const stripe = new Stripe(stripeSecretKey);
 
        // 1. Recupera le informazioni dell'evento da Supabase
        const { data: evento, error: eventError } = await supabase
            .from('eventi')
            .select('*')
            .eq('id', eventId)
            .maybeSingle();

        if (eventError) {
            return res.status(500).json({ error: 'Errore recupero evento: ' + eventError.message });
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
                    stato_pagamento: 'GRATUITO'
                });

            if (insertError) {
                return res.status(500).json({ error: 'Errore iscrizione evento gratuito: ' + insertError.message });
            }

            return res.status(200).json({ free: true });
        }

        const description = `Iscrizione Corso: ${evento.titolo}${causaleDettaglio} per ${profile?.nome || ''} ${profile?.cognome || ''}`;
 
        // 3. Crea la Sessione di Stripe Checkout
        const reqOrigin = req.headers.origin || 'https://portal.adrenalinaclub.it';
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: `Iscrizione Corso / Evento`,
                            description: description,
                        },
                        unit_amount: Math.round(prezzo * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            customer_email: userEmail,
            metadata: {
                utenteId: utenteId,
                eventId: eventId,
                importo: prezzo.toString(),
                causale: description,
                renew: renew ? 'true' : 'false'
            },
            success_url: `${reqOrigin}/portal/dashboard.html?event_payment=success&event_id=${eventId}`,
            cancel_url: `${reqOrigin}/portal/dashboard.html?event_payment=cancel`,
        });
 
        return res.status(200).json({ url: session.url });
 
    } catch (err) {
        console.error('Errore creazione checkout session per evento:', err);
        return res.status(500).json({ error: 'Si è verificato un errore interno. Riprova più tardi.' });
    }
}
