import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail } from './resend-mail.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        
        // OTP IS VALID! Proceed to populate polymorphic database structure.
        
        // Fetch user data from public.utenti
        const { data: profile, error: profileError } = await supabase
            .from('utenti')
            .select('*')
            .eq('id', utenteId)
            .maybeSingle();
            
        if (profileError || !profile) {
            return res.status(500).json({ error: 'Failed to retrieve user profile data: ' + (profileError?.message || 'Profile not found') });
        }

        // Parse sex and address parts
        const cf = profile.codice_fiscale.toUpperCase();
        const dayPart = parseInt(cf.substring(9, 11), 10);
        const sesso = dayPart > 40 ? 'F' : 'M';

        // Extract street name and number
        let streetName = profile.indirizzo;
        let streetNumber = 'snc';
        const matchStreet = profile.indirizzo.match(/(.*)\s+(\d+[a-zA-Z]*)$/);
        if (matchStreet) {
            streetName = matchStreet[1].trim();
            streetNumber = matchStreet[2].trim();
        }

        // 6. Polymorphic Inserts
        
        // A. Insert into public.anagrafiche
        const { data: anagData, error: anagError } = await supabase
            .from('anagrafiche')
            .insert({
                utente_id: utenteId,
                nome: profile.nome,
                cognome: profile.cognome,
                codice_fiscale: cf,
                sesso: sesso,
                data_nascita: profile.data_nascita,
                provincia_nascita: profile.luogo_nascita_provincia,
                comune_nascita: profile.luogo_nascita_comune
            })
            .select('id')
            .single();

        if (anagError) {
            return res.status(500).json({ error: 'Errore inserimento anagrafica: ' + anagError.message });
        }
        const anagraficaId = anagData.id;

        // B. Insert into public.indirizzi_residenza
        const { error: indError } = await supabase
            .from('indirizzi_residenza')
            .insert({
                anagrafica_id: anagraficaId,
                via_piazza: streetName,
                civico: streetNumber,
                provincia: profile.provincia,
                comune: profile.comune,
                cap: profile.cap
            });
        if (indError) console.error("Errore inserimento indirizzo:", indError);

        // C. Insert into public.contatti
        const { error: contError } = await supabase
            .from('contatti')
            .insert({
                anagrafica_id: anagraficaId,
                telefono: profile.cellulare || 'N/D',
                email: profile.email
            });
        if (contError) console.error("Errore inserimento contatti:", contError);

        // D. Split Flow Decision Logic (Casistica 1, 2, 3)
        const adesione = profile.tipo_adesione; // socio, tesserato, socio_tesserato
        const tType = profile.tipo_tessera; // tessera_base_silver, tessera_base_gold, tessera_integrativa_a, tessera_integrativa_b
        
        let csenCoverage = 'BASE';
        if (tType === 'tessera_integrativa_a') csenCoverage = 'INTEGRATIVA_A';
        if (tType === 'tessera_integrativa_b') csenCoverage = 'INTEGRATIVA_B';

        let emailSubject = '';
        let emailHtml = '';

        if (adesione === 'socio') {
            // Casistica 1: Solo Socio (Ammissione a Delibera)
            const { error: socioError } = await supabase
                .from('registro_soci')
                .insert({
                    anagrafica_id: anagraficaId,
                    stato_socio: 'IN_ATTESA_DELIBERA'
                });
            if (socioError) throw socioError;

            emailSubject = 'Domanda di Ammissione Socio Ricevuta - Adrenalina Club';
            emailHtml = `
                <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                    <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                    <p style="color: #ccc;">Ciao ${profile.nome}, la tua richiesta di adesione in qualità di <strong>Socio</strong> è stata firmata digitalmente con successo.</p>
                    <p style="color: #aaa; font-size: 13px;">Il record è temporaneamente congelato in conformità con l'Art. 21 CTS ed è in attesa di delibera da parte del Consiglio Direttivo. Riceverai un'e-mail contenente il link di pagamento non appena la domanda verrà approvata dal Presidente.</p>
                </div>
            `;

        } else if (adesione === 'socio_tesserato') {
            // Casistica 2: Socio + Tesserato
            const { error: socioError } = await supabase
                .from('registro_soci')
                .insert({
                    anagrafica_id: anagraficaId,
                    stato_socio: 'IN_ATTESA_DELIBERA'
                });
            if (socioError) throw socioError;

            const { error: tessError } = await supabase
                .from('registro_tesserati')
                .insert({
                    anagrafica_id: anagraficaId,
                    stato_tesseramento: 'IN_ELABORAZIONE',
                    livello_copertura: csenCoverage
                });
            if (tessError) throw tessError;

            emailSubject = 'Domanda di Ammissione Socio + Tesserato Ricevuta - Adrenalina Club';
            emailHtml = `
                <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                    <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                    <p style="color: #ccc;">Ciao ${profile.nome}, la tua richiesta di ammissione a <strong>Socio + Tesseramento Sportivo</strong> è stata registrata con successo.</p>
                    <p style="color: #aaa; font-size: 13px;">Il tuo tesseramento è ora in stato <em>IN ELABORAZIONE</em> e la domanda di ammissione socio è in attesa di delibera. Riceverai il link di pagamento non appena l'ammissione sarà ratificata dal Consiglio Direttivo.</p>
                </div>
            `;

        } else if (adesione === 'tesserato') {
            // Casistica 3: Solo Tesserato (No delibera - Iter Diretto)
            const { error: tessError } = await supabase
                .from('registro_tesserati')
                .insert({
                    anagrafica_id: anagraficaId,
                    stato_tesseramento: 'IN_ELABORAZIONE',
                    livello_copertura: csenCoverage
                });
            if (tessError) throw tessError;

            const pagamentoLink = `https://adrenalinaclub.it/portal/pagamento.html?id=${utenteId}`;
            emailSubject = 'Tesseramento Sportivo Registrato - Verifica Certificato in corso';
            emailHtml = `
                <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                    <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                    <p style="color: #ccc;">Ciao ${profile.nome}, il tuo tesseramento sportivo CSEN è stato registrato.</p>
                    <p style="color: #aaa; font-size: 13px;">Prima di poter procedere al pagamento della quota, i nostri sistemi verificheranno la validità del certificato medico da te caricato (scansione AI). Potrai verificare lo stato della validazione ed effettuare il saldo cliccando sul link sottostante non appena il certificato risulterà approvato:</p>
                    <a href="${pagamentoLink}" style="background-color: #df293e; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 15px;">PROSEGUI AL PORTALE PAGAMENTI</a>
                </div>
            `;
        }

        // Send confirmation email
        await sendEmail({
            to: profile.email,
            subject: emailSubject,
            html: emailHtml
        });

        // 7. Update pending sign document state
        await supabase
            .from('atti_adesione')
            .update({
                stato: 'firmato_validato',
                data_firma: new Date().toISOString()
            })
            .eq('utente_id', utenteId);

        return res.status(200).json({ success: true, message: 'OTP verified and registration records created successfully' });
        
    } catch (error) {
        console.error('API Verify OTP Handler Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
