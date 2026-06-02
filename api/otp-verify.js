import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail } from './resend-mail.js';

let supabase;

export default async function handler(req, res) {
    try {
        if (!supabase) {
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!supabaseUrl || !supabaseServiceKey) {
                throw new Error("Mancano le variabili d'ambiente di Supabase su Vercel.");
            }
            supabase = createClient(supabaseUrl, supabaseServiceKey);
        }
    } catch (envError) {
        return res.status(500).json({ error: envError.message });
    }
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    const allowedOrigins = [
        'https://adrenalinaclub.it',
        'https://www.adrenalinaclub.it',
        'https://adr-sito.vercel.app',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(o => origin.startsWith(o) || o.includes(origin))) {
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

        // Rate limiting check
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
        const { data: allowed } = await supabase.rpc('check_rate_limit', {
            p_key: `otp-verify:${clientIp}`,
            p_max_requests: 5,
            p_window_seconds: 300
        });
        if (allowed === false) {
            return res.status(429).json({ error: 'Troppe richieste di verifica OTP. Riprova più tardi.' });
        }
        
        // 3. Get OTP from request body
        const { otp } = req.body;
        if (!otp || otp.length !== 6) {
            return res.status(400).json({ error: 'Valid 6-digit OTP code required' });
        }
        
        // 4. Hash submitted OTP
        const submittedHash = crypto.createHash('sha256').update(otp).digest('hex');
        
        // 5. Query matching pending sign request in public.atti_adesione (within 15 minutes)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: atti, error: queryError } = await supabase
            .from('atti_adesione')
            .select('id, data_firma, tentativi_falliti')
            .eq('utente_id', utenteId)
            .eq('otp_codice_hash', submittedHash)
            .eq('stato', 'in_attesa_otp')
            .gte('created_at', fifteenMinutesAgo)
            .maybeSingle();
            
        if (queryError) {
            return res.status(500).json({ error: 'Database query error: ' + queryError.message });
        }
        
        if (!atti) {
            // Contatore tentativi falliti
            const { data: pendingRecord } = await supabase
                .from('atti_adesione')
                .select('id, tentativi_falliti')
                .eq('utente_id', utenteId)
                .eq('stato', 'in_attesa_otp')
                .maybeSingle();

            if (pendingRecord) {
                const newAttempts = (pendingRecord.tentativi_falliti || 0) + 1;
                if (newAttempts >= 3) {
                    await supabase
                        .from('atti_adesione')
                        .delete()
                        .eq('id', pendingRecord.id);
                    return res.status(400).json({ error: 'Codice OTP invalidato dopo 3 tentativi falliti. Riapri il wizard per inviare un nuovo codice.' });
                } else {
                    await supabase
                        .from('atti_adesione')
                        .update({ tentativi_falliti: newAttempts })
                        .eq('id', pendingRecord.id);
                    return res.status(400).json({ error: `Codice OTP errato. Tentativo ${newAttempts} di 3.` });
                }
            }
            return res.status(400).json({ error: 'Codice OTP non valido o scaduto.' });
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
        
        // A. Insert (or update on retry) into public.anagrafiche
        // Using upsert on codice_fiscale to handle cases where a previous attempt
        // partially completed (OTP crash mid-insert leaves an orphan anagrafica row).
        const { data: anagData, error: anagError } = await supabase
            .from('anagrafiche')
            .upsert({
                utente_id: utenteId,
                nome: profile.nome,
                cognome: profile.cognome,
                codice_fiscale: cf,
                sesso: sesso,
                data_nascita: profile.data_nascita,
                provincia_nascita: profile.luogo_nascita_provincia,
                comune_nascita: profile.luogo_nascita_comune
            }, { onConflict: 'codice_fiscale' })
            .select('id')
            .single();

        if (anagError) {
            return res.status(500).json({ error: 'Errore inserimento anagrafica: ' + anagError.message });
        }
        const anagraficaId = anagData.id;

        // B. Insert into public.indirizzi_residenza
        // anagrafica_id is the PK here so we delete first to handle retries safely
        await supabase.from('indirizzi_residenza').delete().eq('anagrafica_id', anagraficaId);
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
        // Same pattern: anagrafica_id is the PK so delete first to handle retries
        await supabase.from('contatti').delete().eq('anagrafica_id', anagraficaId);
        const { error: contError } = await supabase
            .from('contatti')
            .insert({
                anagrafica_id: anagraficaId,
                telefono: profile.cellulare || 'N/D',
                email: profile.email
            });
        if (contError) console.error("Errore inserimento contatti:", contError);

        // C2. Insert into public.certificati_medici if present
        if (profile.certificato_medico_url) {
            await supabase.from('certificati_medici').delete().eq('anagrafica_id', anagraficaId);
            
            // Calcola una data di scadenza fittizia (1 anno) per bypassare il constraint NOT NULL,
            // verrà sovrascritta dall'AI fra pochi secondi.
            let fallbackScadenza = '2099-12-31';
            if (profile.certificato_data_emissione) {
                const emDate = new Date(profile.certificato_data_emissione);
                emDate.setFullYear(emDate.getFullYear() + 1);
                fallbackScadenza = emDate.toISOString().split('T')[0];
            }

            const { error: certError } = await supabase
                .from('certificati_medici')
                .insert({
                    anagrafica_id: anagraficaId,
                    file_url: profile.certificato_medico_url,
                    tipologia: profile.certificato_tipologia || 'NON_SPECIFICATO',
                    data_rilascio: profile.certificato_data_emissione || new Date().toISOString().split('T')[0],
                    data_scadenza: fallbackScadenza,
                    medico_rilascio: 'In elaborazione AI...',
                    stato_validazione: 'IN_ATTESA'
                });
            if (certError) {
                console.error("Errore inserimento certificati medici:", certError);
            } else {
                // Call AI validation synchronously so it's ready immediately
                try {
                    const apiBase = req.headers.origin || `https://${req.headers.host}`;
                    console.log(`Triggering AI Validation at ${apiBase}/api/validate-cert`);
                    await fetch(`${apiBase}/api/validate-cert`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            anagrafica_id: anagraficaId,
                            file_url: profile.certificato_medico_url
                        })
                    });
                } catch (aiErr) {
                    console.error("Failed to execute AI validation:", aiErr);
                }
            }
        }

        // D. Split Flow Decision Logic (Casistica 1, 2, 3)
        const adesione = profile.tipo_adesione; // socio, tesserato, socio_tesserato
        const tType = profile.tipo_tessera; // tessera_base_silver, tessera_base_gold, tessera_integrativa_a, tessera_integrativa_b
        
        let csenCoverage = 'BASE';
        if (tType === 'tessera_integrativa_a') csenCoverage = 'INTEGRATIVA_A';
        if (tType === 'tessera_integrativa_b') csenCoverage = 'INTEGRATIVA_B';

        let emailSubject = '';
        let emailHtml = '';
        if (adesione === 'socio') {
            // Casistica 1: Solo Socio (Ammissione a Delibera) Land in registro_approvazioni
            await supabase.from('registro_approvazioni').delete().eq('anagrafica_id', anagraficaId).eq('stato', 'IN_ATTESA');
            const { error: socioError } = await supabase
                .from('registro_approvazioni')
                .insert({
                    anagrafica_id: anagraficaId,
                    tipo: 'SOCIO',
                    stato: 'IN_ATTESA'
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
            await supabase.from('registro_approvazioni').delete().eq('anagrafica_id', anagraficaId).eq('stato', 'IN_ATTESA');
            const { error: socioError } = await supabase
                .from('registro_approvazioni')
                .insert({
                    anagrafica_id: anagraficaId,
                    tipo: 'SOCIO_TESSERATO',
                    stato: 'IN_ATTESA',
                    livello_copertura: csenCoverage
                });
            if (socioError) throw socioError;

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
            await supabase.from('registro_approvazioni').delete().eq('anagrafica_id', anagraficaId).eq('stato', 'IN_ATTESA');
            const { error: tessError } = await supabase
                .from('registro_approvazioni')
                .insert({
                    anagrafica_id: anagraficaId,
                    tipo: 'TESSERATO',
                    stato: 'IN_ATTESA',
                    livello_copertura: csenCoverage
                });
            if (tessError) throw tessError;

            const pagamentoLink = `https://adrenalinaclub.it/portal/pagamento.html?id=${utenteId}`;
            emailSubject = 'Tesseramento Sportivo Registrato - Verifica Certificato in corso';
            emailHtml = `
                <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                    <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                    <p style="color: #ccc;">Ciao ${profile.nome}, il tuo tesseramento sportivo CSEN è stato registrato.</p>
                    <p style="color: #aaa; font-size: 13px;">Prima di poter procedere al pagamento della quota, i nostri sistemi verificheranno la validità del certificato medico da te caricato (scansione AI). Potrai verificar lo stato della validazione ed effettuare il saldo cliccando sul link sottostante non appena il certificato risulterà approvato:</p>
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
        const updateData = {
            stato: 'firmato_validato',
            data_firma: new Date().toISOString()
        };
        if (req.body.url_pdf_generato) {
            updateData.url_pdf_generato = req.body.url_pdf_generato;
        }
        await supabase
            .from('atti_adesione')
            .update(updateData)
            .eq('utente_id', utenteId);

        return res.status(200).json({ success: true, message: 'OTP verified and registration records created successfully' });
        
    } catch (error) {
        console.error('API Verify OTP Handler Error:', error);
        return res.status(500).json({ error: 'Si è verificato un errore interno. Riprova più tardi.' });
    }
}
