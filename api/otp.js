import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

// Setup environment keys
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const resend = new Resend(resendApiKey);

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    const allowedOrigins = ['https://adrenalinaclub.it', 'https://www.adrenalinaclub.it', 'http://localhost:3000'];
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

    try {
        // 1. Get authorization token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }
        
        const token = authHeader.split(' ')[1];
        
        // 2. Verify token securely using Supabase Auth
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token: ' + (authError?.message || 'User not found') });
        }
        
        const utenteId = user.id;
        const email = user.email;
        
        // 3. Generate 6-digit OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();
        
        // 4. Hash OTP using SHA-256
        const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
        
        // 5. Get client IP
        const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
        
        // 6. Insert into public.atti_adesione (using service role to bypass RLS write restrictions)
        // First delete any previous pending OTP for this user to keep table clean
        await supabase
            .from('atti_adesione')
            .delete()
            .eq('utente_id', utenteId)
            .eq('stato', 'in_attesa_otp');

        const { error: insertError } = await supabase
            .from('atti_adesione')
            .insert({
                utente_id: utenteId,
                ip_address: ipAddress,
                otp_codice_hash: otpHash,
                stato: 'in_attesa_otp'
            });
            
        if (insertError) {
            return res.status(500).json({ error: 'Failed to create sign request: ' + insertError.message });
        }
        
        // 7. Send email via Resend
        await resend.emails.send({
            from: 'Adrenalina Club <noreply@adrenalinaclub.it>',
            to: email,
            subject: 'Codice OTP Firma Elettronica - Neuroportal',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 40px; text-align: center;">
                    <h1 style="color: #df293e; font-size: 24px; font-weight: bold; margin-bottom: 20px; letter-spacing: 2px;">ADRENALINA CLUB</h1>
                    <h2 style="font-size: 18px; margin-bottom: 30px; text-transform: uppercase;">Codice OTP Firma Digitale</h2>
                    <p style="font-size: 14px; color: #adaaaa; margin-bottom: 30px;">Usa il seguente codice segreto a 6 cifre nel Neuroportal per validare la tua identità e firmare digitalmente il modulo di adesione:</p>
                    <div style="background-color: #1a1a1a; border-bottom: 4px solid #df293e; display: inline-block; padding: 15px 30px; font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #ffffff; margin-bottom: 30px; font-family: monospace;">
                        ${otpCode}
                    </div>
                    <p style="font-size: 12px; color: #666666;">Questo codice scadrà tra 5 minuti. Se non hai richiesto questo codice, ignora questa email.</p>
                </div>
            `
        });
        
        // Save the raw OTP in memory or db for mock validation (or return success and let verification run on matching hash)
        return res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('API OTP Handler Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
