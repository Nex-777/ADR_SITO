import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Get CORS headers dynamically based on origin
function getCorsHeaders(req: Request) {
  const allowedOrigins = ['https://adrenalinaclub.it', 'https://www.adrenalinaclub.it', 'http://localhost:3000'];
  const origin = req.headers.get('origin') ?? "";
  const allowOrigin = allowedOrigins.includes(origin) ? origin : 'https://adrenalinaclub.it';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? "";
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Auth token
    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');

    // Get User
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: authError?.message ?? 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const utenteId = user.id;
    const email = user.email;

    // Generate OTP
    // Generate OTP cryptographically securely
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const otpCode = String(100000 + (array[0] % 900000));

    // Hash OTP using Web Crypto API
    const msgBuffer = new TextEncoder().encode(otpCode);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const ipAddress = req.headers.get('x-real-ip') || '127.0.0.1';

    // Delete existing pending OTPs
    await supabase
      .from('atti_adesione')
      .delete()
      .eq('utente_id', utenteId)
      .eq('stato', 'in_attesa_otp');

    // Insert new pending OTP
    const { error: insertError } = await supabase
      .from('atti_adesione')
      .insert({
        utente_id: utenteId,
        ip_address: ipAddress,
        otp_codice_hash: otpHash,
        stato: 'in_attesa_otp'
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send email using Resend HTTP API
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
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
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
