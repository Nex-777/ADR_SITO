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

    try {
        const utenteId = user.id;
        const { eventId, giorni_presenza, data_ora_arrivo, data_ora_ripartenza, dettagli } = req.body;

        if (!eventId) {
            return res.status(400).json({ error: 'Identificativo evento mancante.' });
        }

        // Rate limiting check
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
        const { data: allowed } = await supabase.rpc('check_rate_limit', {
            p_key: `epika_event_checkout:${clientIp}`,
            p_max_requests: 5,
            p_window_seconds: 3600
        });
        if (allowed === false) {
            return res.status(429).json({ error: 'Troppe richieste di checkout. Riprova più tardi.' });
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

        const stripe = new Stripe(stripeSecretKey);

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

        const reqOrigin = req.headers.origin || 'https://portal.adrenalinaclub.it';

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

    } catch (err) {
        console.error('Errore checkout evento Epika:', err);
        return res.status(500).json({ error: 'Errore interno del server. Riprova più tardi.' });
    }
}
