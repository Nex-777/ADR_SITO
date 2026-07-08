import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail } from './resend-mail.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

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
        console.error('OTP-verify Config Error:', envError);
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    const allowedOrigins = [
        'https://adrenalinaclub.it',
        'https://www.adrenalinaclub.it',
        'https://portal.adrenalinaclub.it',
        'https://nex-777.github.io',
        'https://adr-sito.vercel.app',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
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
            if (authError) console.error('Auth error in otp-verify:', authError);
            return res.status(401).json({ error: 'Token non valido o sessione scaduta.' });
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
            console.error('Database query error in otp-verify:', queryError);
            return res.status(500).json({ error: 'Errore interno del server durante la verifica.' });
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
            .select('id, codice_fiscale, indirizzo, nome, cognome, data_nascita, luogo_nascita_provincia, luogo_nascita_comune, provincia, comune, cap, cellulare, email, certificato_medico_url, certificato_data_emissione, certificato_tipologia, tipo_adesione, tipo_tessera, documento_identita_url')
            .eq('id', utenteId)
            .maybeSingle();
            
        if (profileError || !profile) {
            if (profileError) console.error('Failed to retrieve user profile data in otp-verify:', profileError);
            return res.status(500).json({ error: 'Profilo utente non trovato o non accessibile.' });
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
            console.error('Errore inserimento anagrafica in otp-verify:', anagError);
            return res.status(500).json({ error: 'Errore interno del server durante la firma.' });
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
                // La validazione AI ora viene lanciata automaticamente tramite Webhook di Supabase
                // all'inserimento del record in 'certificati_medici', svincolando la registrazione.
                console.log(`[OTP] Certificato salvato in IN_ATTESA. Webhook AI triggerato da Supabase.`);
            }
        }

        // C3. Insert into public.documenti_identita if present
        if (profile.documento_identita_url) {
            await supabase.from('documenti_identita').delete().eq('anagrafica_id', anagraficaId);
            const { error: idDocError } = await supabase
                .from('documenti_identita')
                .insert({
                    anagrafica_id: anagraficaId,
                    file_url: profile.documento_identita_url,
                    tipologia: 'FRONTE_RETRO'
                });
            if (idDocError) console.error("Errore inserimento documento identita:", idDocError);
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

            emailSubject = 'Tesseramento Sportivo Registrato - Adrenalina Club';
            emailHtml = `
                <div style="font-family: sans-serif; background-color: #0e0e0e; color: #ffffff; padding: 30px; text-align: center;">
                    <h1 style="color: #df293e; font-size: 22px;">ADRENALINA CLUB</h1>
                    <p style="color: #ccc;">Ciao ${profile.nome}, la tua richiesta di tesseramento sportivo CSEN è stata registrata con successo.</p>
                    <p style="color: #aaa; font-size: 13px;">I nostri sistemi stanno attualmente verificando la validità del certificato medico da te caricato. Riceverai un'e-mail di conferma contenente il link per procedere al pagamento non appena il certificato sarà approvato.</p>
                </div>
            `;
        }

        let emailAttachments = [];
        let urlPdfInformativa = null;
        let urlPdfIscrizione = null;

        try {
            // Setup coordinates and fonts
            const csenPath1 = path.join(process.cwd(), 'CSEN_moduli', 'INFORMATIVA PER SINGOLI TESSERATI (1).pdf');
            const csenPath2 = path.join(process.cwd(), 'CSEN_moduli', 'Modulo_Iscrizione_2024(1)(1) - aggiornato silver e gold (2).pdf');

            if (fs.existsSync(csenPath1) && fs.existsSync(csenPath2)) {
                const supabase = createClient(supabaseUrl, supabaseServiceKey);
                
                // Query dynamic coordinates from database
                const { data: configRows } = await supabase
                    .from('configurazioni_pdf')
                    .select('modulo, campo, x, y, font_size, pagina');

                const coords = {};
                if (configRows) {
                    configRows.forEach(row => {
                        if (!coords[row.modulo]) coords[row.modulo] = {};
                        coords[row.modulo][row.campo] = { x: row.x, y: row.y, font_size: row.font_size, pagina: row.pagina };
                    });
                }

                const defaults = {
                    informativa: {
                        nome_cognome:        { x: 110, y: 634, font_size: 11, pagina: 3 },
                        codice_fiscale:      { x: 110, y: 320, font_size: 10, pagina: 3 },
                        firma:               { x: 40,  y: 86,  font_size: 12, pagina: 0 },
                        crocetta_acconsento: { x: 151, y: 520, font_size: 15, pagina: 3 }
                    },
                    iscrizione: {
                        cognome:                    { x: 120, y: 635, font_size: 10, pagina: 0 },
                        nome:                       { x: 365, y: 635, font_size: 10, pagina: 0 },
                        nato_a:                     { x: 120, y: 610, font_size: 10, pagina: 0 },
                        prov_nascita:               { x: 345, y: 610, font_size: 10, pagina: 0 },
                        data_nascita:               { x: 405, y: 610, font_size: 10, pagina: 0 },
                        residente_via:              { x: 120, y: 585, font_size: 10, pagina: 0 },
                        civico:                     { x: 290, y: 585, font_size: 10, pagina: 0 },
                        comune:                     { x: 365, y: 585, font_size: 10, pagina: 0 },
                        provincia:                  { x: 365, y: 565, font_size: 10, pagina: 0 },
                        cap:                        { x: 120, y: 565, font_size: 10, pagina: 0 },
                        telefono:                   { x: 120, y: 545, font_size: 10, pagina: 0 },
                        cellulare:                  { x: 365, y: 545, font_size: 10, pagina: 0 },
                        email:                      { x: 120, y: 520, font_size: 10, pagina: 0 },
                        firma_1:                    { x: 40,  y: 86,  font_size: 12, pagina: 0 },
                        firma_2:                    { x: 40,  y: 86,  font_size: 12, pagina: 1 },
                        crocetta_iscritto_dichiara: { x: 61,  y: 233, font_size: 12, pagina: 0 }
                    }
                };

                const getVal = (m, c) => coords[m]?.[c] || defaults[m]?.[c];

                const pdfInformativaBytes = fs.readFileSync(csenPath1);
                const pdfIscrizioneBytes = fs.readFileSync(csenPath2);

                const doc1 = await PDFDocument.load(pdfInformativaBytes);
                const doc2 = await PDFDocument.load(pdfIscrizioneBytes);
                
                const pages1 = doc1.getPages();
                const pages2 = doc2.getPages();

                const signTimestamp = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
                const signatureText = `Firmato Digitalmente (OTP: ${otp} | IP: ${clientIp} | Data: ${signTimestamp})`;
                const signatureColor = rgb(0.8, 0, 0); 

                // ── FILL INFORMATIVA (doc1) ─────────────────────────────────
                const infNome = getVal('informativa', 'nome_cognome');
                const infCF   = getVal('informativa', 'codice_fiscale');
                const infFirma= getVal('informativa', 'firma');
                const infCons = getVal('informativa', 'crocetta_acconsento');

                // Dati anagrafici sulla pagina configurata (default: pagina 4, indice 3)
                const pgNome = pages1[infNome.pagina] ?? pages1[pages1.length - 1];
                pgNome.drawText(
                    `${profile.nome.toUpperCase()} ${profile.cognome.toUpperCase()}`,
                    { x: infNome.x, y: infNome.y, size: infNome.font_size }
                );

                const pgCF = pages1[infCF.pagina] ?? pages1[pages1.length - 1];
                pgCF.drawText(cf, { x: infCF.x, y: infCF.y, size: infCF.font_size });

                // X nella casella "Acconsento" (consenso marketing)
                const pgCons = pages1[infCons.pagina] ?? pages1[pages1.length - 1];
                pgCons.drawText('X', { x: infCons.x, y: infCons.y, size: infCons.font_size, color: rgb(0,0,0) });

                // Font corsivo per il nome nella sezione firma
                const italicFont1 = await doc1.embedFont(StandardFonts.HelveticaOblique);

                // Timbro digitale su tutte le pagine + nome corsivo sotto la firma
                pages1.forEach(p => {
                    p.drawText(signatureText, { x: infFirma.x, y: infFirma.y, size: infFirma.font_size, color: signatureColor });
                    p.drawText(
                        `${profile.nome} ${profile.cognome}`,
                        { x: infFirma.x, y: infFirma.y - 14, size: infFirma.font_size + 2, font: italicFont1, color: signatureColor }
                    );
                });

                // ── FILL ISCRIZIONE (doc2) ─────────────────────────────────
                const cIscrCognome = getVal('iscrizione', 'cognome');
                const cIscrNome    = getVal('iscrizione', 'nome');
                const cIscrNatoA   = getVal('iscrizione', 'nato_a');
                const cIscrProvNasc= getVal('iscrizione', 'prov_nascita');
                const cIscrDataNasc= getVal('iscrizione', 'data_nascita');
                const cIscrVia     = getVal('iscrizione', 'residente_via');
                const cIscrCivico  = getVal('iscrizione', 'civico');
                const cIscrComune  = getVal('iscrizione', 'comune');
                const cIscrProv    = getVal('iscrizione', 'provincia');
                const cIscrCap     = getVal('iscrizione', 'cap');
                const cIscrTel     = getVal('iscrizione', 'telefono');
                const cIscrCell    = getVal('iscrizione', 'cellulare');
                const cIscrEmail   = getVal('iscrizione', 'email');
                const cIscrFirma1  = getVal('iscrizione', 'firma_1');
                const cIscrFirma2  = getVal('iscrizione', 'firma_2');
                const cIscrDich    = getVal('iscrizione', 'crocetta_iscritto_dichiara');

                const page2  = pages2[0];
                const page2b = pages2[1];

                let dataNascitaFormatted = profile.data_nascita || '';
                if (profile.data_nascita && profile.data_nascita.includes('-')) {
                    const p = profile.data_nascita.split('-');
                    if (p.length === 3) dataNascitaFormatted = `${p[2]}/${p[1]}/${p[0]}`;
                }

                page2.drawText(profile.cognome.toUpperCase(), { x: cIscrCognome.x, y: cIscrCognome.y, size: cIscrCognome.font_size });
                page2.drawText(profile.nome.toUpperCase(),    { x: cIscrNome.x,    y: cIscrNome.y,    size: cIscrNome.font_size });
                page2.drawText(profile.luogo_nascita_comune.toUpperCase(),    { x: cIscrNatoA.x,    y: cIscrNatoA.y,    size: cIscrNatoA.font_size });
                page2.drawText(profile.luogo_nascita_provincia.toUpperCase(), { x: cIscrProvNasc.x,  y: cIscrProvNasc.y,  size: cIscrProvNasc.font_size });
                page2.drawText(dataNascitaFormatted, { x: cIscrDataNasc.x, y: cIscrDataNasc.y, size: cIscrDataNasc.font_size });
                page2.drawText(streetName.toUpperCase(), { x: cIscrVia.x,    y: cIscrVia.y,    size: cIscrVia.font_size });
                page2.drawText(streetNumber.toUpperCase(),{ x: cIscrCivico.x, y: cIscrCivico.y, size: cIscrCivico.font_size });
                page2.drawText(profile.comune.toUpperCase(),    { x: cIscrComune.x,  y: cIscrComune.y,  size: cIscrComune.font_size });
                page2.drawText(profile.provincia.toUpperCase(), { x: cIscrProv.x,    y: cIscrProv.y,    size: cIscrProv.font_size });
                page2.drawText(profile.cap,                     { x: cIscrCap.x,     y: cIscrCap.y,     size: cIscrCap.font_size });
                page2.drawText(profile.telefono  || '', { x: cIscrTel.x,   y: cIscrTel.y,   size: cIscrTel.font_size });
                page2.drawText(profile.cellulare || '', { x: cIscrCell.x,  y: cIscrCell.y,  size: cIscrCell.font_size });
                page2.drawText(profile.email     || '', { x: cIscrEmail.x, y: cIscrEmail.y, size: cIscrEmail.font_size });

                // X nella casella "L'iscritto dichiara"
                if (cIscrDich) {
                    page2.drawText('X', { x: cIscrDich.x, y: cIscrDich.y, size: cIscrDich.font_size, color: rgb(0,0,0) });
                }

                // Firme digitali
                page2.drawText(signatureText, { x: cIscrFirma1.x, y: cIscrFirma1.y, size: cIscrFirma1.font_size, color: signatureColor });
                if (page2b) {
                    page2b.drawText(signatureText, { x: cIscrFirma2.x, y: cIscrFirma2.y, size: cIscrFirma2.font_size, color: signatureColor });
                }

                const out1Bytes = await doc1.save();
                const out2Bytes = await doc2.save();

                // Upload to Supabase Storage
                const pathInformativa = `${utenteId}/csen_informativa_${Date.now()}.pdf`;
                const pathIscrizione = `${utenteId}/csen_iscrizione_${Date.now()}.pdf`;

                await supabase.storage.from('documenti_adesione').upload(pathInformativa, out1Bytes, { contentType: 'application/pdf', upsert: true });
                await supabase.storage.from('documenti_adesione').upload(pathIscrizione, out2Bytes, { contentType: 'application/pdf', upsert: true });

                const { data: url1 } = await supabase.storage.from('documenti_adesione').createSignedUrl(pathInformativa, 315360000); // 10 years valid for admin view
                const { data: url2 } = await supabase.storage.from('documenti_adesione').createSignedUrl(pathIscrizione, 315360000);

                if (url1) urlPdfInformativa = url1.signedUrl;
                if (url2) urlPdfIscrizione = url2.signedUrl;

                // Attach to email
                emailAttachments.push(
                    { filename: 'Informativa_CSEN.pdf', content: Buffer.from(out1Bytes) },
                    { filename: 'Iscrizione_CSEN.pdf', content: Buffer.from(out2Bytes) }
                );
            } else {
                console.warn('CSEN forms not found in the filesystem for compilation.');
            }
        } catch (pdfErr) {
            console.error('Error generating CSEN PDFs:', pdfErr);
        }

        // Send confirmation email
        await sendEmail({
            to: profile.email,
            subject: emailSubject,
            html: emailHtml,
            attachments: emailAttachments
        });

        // 7. Update pending sign document state
        const updateData = {
            stato: 'firmato_validato',
            data_firma: new Date().toISOString()
        };
        if (req.body.url_pdf_generato) {
            const supabaseUrlPrefix = process.env.SUPABASE_URL + '/storage/v1/';
            if (req.body.url_pdf_generato.startsWith(supabaseUrlPrefix)) {
                updateData.url_pdf_generato = req.body.url_pdf_generato;
            }
        }
        if (urlPdfInformativa) updateData.url_pdf_csen_informativa = urlPdfInformativa;
        if (urlPdfIscrizione) updateData.url_pdf_csen_iscrizione = urlPdfIscrizione;
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
