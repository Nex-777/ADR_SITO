import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!stripeSecretKey) {
        return res.status(500).json({ error: 'Configurazione incompleta: manca STRIPE_SECRET_KEY su Vercel.' });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Configurazione incompleta: mancano le credenziali Supabase su Vercel.' });
    }

    try {
        const { utenteId } = req.body;
        if (!utenteId) {
            return res.status(400).json({ error: 'ID utente obbligatorio.' });
        }

        // Inizializza Stripe e Supabase all'interno del blocco try
        const stripe = new Stripe(stripeSecretKey);
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Recupera le informazioni del profilo utente da Supabase
        const { data: profile, error: profileError } = await supabase
            .from('utenti')
            .select('nome, cognome, email, quota_totale, tipo_adesione')
            .eq('id', utenteId)
            .maybeSingle();

        if (profileError) {
            return res.status(500).json({ error: 'Errore query Supabase: ' + profileError.message });
        }

        if (!profile) {
            return res.status(404).json({ error: 'Profilo utente non trovato su Supabase.' });
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

        // 2. Crea la Sessione di Stripe Checkout
        const origin = req.headers.origin || 'https://adrenalinaclub.it';
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: `Quota Associativa / Tesseramento`,
                            description: description,
                        },
                        unit_amount: Math.round(quota * 100), // importo in centesimi
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            customer_email: profile.email,
            metadata: {
                utenteId: utenteId,
                importo: quota.toString(),
                causale: description
            },
            success_url: `${origin}/portal/dashboard.html?payment=success`,
            cancel_url: `${origin}/portal/pagamento.html?id=${utenteId}&payment=cancel`,
        });

        return res.status(200).json({ url: session.url });

    } catch (err) {
        console.error('Errore creazione checkout session:', err);
        return res.status(500).json({ error: 'Errore interno: ' + err.message });
    }
}
