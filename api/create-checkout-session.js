import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export default async function handler(req, res) {
    // Enable CORS
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

    // Estrai le chiavi all'interno del handler per catturare eventuali errori di configurazione
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
 
    if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }
 
    // Autenticazione tramite Token Bearer
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
 
        // Rate limiting check
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
        const { data: allowed } = await supabase.rpc('check_rate_limit', {
            p_key: `checkout:${clientIp}`,
            p_max_requests: 5,
            p_window_seconds: 3600
        });
        if (allowed === false) {
            return res.status(429).json({ error: 'Troppe richieste di checkout. Riprova più tardi.' });
        }
 
        // Inizializza Stripe all'interno del blocco try
        const stripe = new Stripe(stripeSecretKey);

        // 1. Recupera le informazioni del profilo utente da Supabase
        const { data: profile, error: profileError } = await supabase
            .from('utenti')
            .select('nome, cognome, email, quota_totale, tipo_adesione')
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
        const tipoAdesioneLabel = profile.tipo_adesione 
            ? profile.tipo_adesione.replace(/_/g, ' ').toUpperCase()
            : 'SOCIO';
        const description = `Quota annuale 2026 - ${tipoAdesioneLabel} per ${profile.nome} ${profile.cognome}`;

        // Calcola la quota e la commissione del 2% per le spese di gestione
        const baseAmount = Math.round(quota * 100);
        const feeAmount = Math.round(quota * 0.02 * 100);
        const totalAmount = baseAmount + feeAmount;
        const totalQuota = (totalAmount / 100).toFixed(2);

        // 2. Crea la Sessione di Stripe Checkout
        const origin = req.headers.origin || 'https://portal.adrenalinaclub.it';
        
        const session = await stripe.checkout.sessions.create({
            automatic_payment_methods: {
                enabled: true,
            },
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
            success_url: `${origin}/portal/dashboard.html?payment=success`,
            cancel_url: `${origin}/portal/pagamento.html?id=${utenteId}&payment=cancel`,
        });

        return res.status(200).json({ url: session.url });

    } catch (err) {
        console.error('Errore creazione checkout session:', err);
        return res.status(500).json({ error: 'Si è verificato un errore interno. Riprova più tardi.' });
    }
}
