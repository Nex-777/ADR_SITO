import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
        
        // 3. Get OTP from request body
        const { otp } = req.body;
        if (!otp || otp.length !== 6) {
            return res.status(400).json({ error: 'Valid 6-digit OTP code required' });
        }
        
        // 4. Hash submitted OTP
        const submittedHash = crypto.createHash('sha256').update(otp).digest('hex');
        
        // 5. Query matching pending sign request in public.atti_adesione
        const { data: atti, error: queryError } = await supabase
            .from('atti_adesione')
            .select('id, data_firma')
            .eq('utente_id', utenteId)
            .eq('otp_codice_hash', submittedHash)
            .eq('stato', 'in_attesa_otp')
            .maybeSingle();
            
        if (queryError) {
            return res.status(500).json({ error: 'Database query error: ' + queryError.message });
        }
        
        if (!atti) {
            return res.status(400).json({ error: 'Invalid or expired OTP code' });
        }
        
        // OTP is valid!
        return res.status(200).json({ success: true, message: 'OTP verified successfully' });
        
    } catch (error) {
        console.error('API Verify OTP Handler Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
