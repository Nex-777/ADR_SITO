import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './resend-mail.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    // Basic verification (e.g. check secret token to prevent unauthorized execution)
    const cronSecret = req.headers['x-cron-secret'];
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const today = new Date();
        const todayStr = today.toISOString().substring(0, 10);
        
        // Helper function for adding/subtracting days
        const getFutureDateStr = (days) => {
            const d = new Date();
            d.setDate(d.getDate() + days);
            return d.toISOString().substring(0, 10);
        };

        const thirtyDaysOut = getFutureDateStr(30);
        const fifteenDaysOut = getFutureDateStr(15);

        // 1. SCAN CERTIFICATI MEDICI
        
        // A. Scadenza a 30 giorni
        const { data: certs30, error: err30 } = await supabase
            .from('certificati_medici')
            .select(`
                id,
                data_scadenza,
                anagrafiche (
                    nome,
                    utente_id,
                    contatti ( email )
                )
            `)
            .eq('data_scadenza', thirtyDaysOut);

        if (err30) console.error("Error fetching 30d certificates:", err30);
        else if (certs30) {
            for (const cert of certs30) {
                const email = cert.anagrafiche?.contatti?.email;
                if (email) {
                    await sendEmail({
                        to: email,
                        subject: 'Scadenza Certificato Medico - 30 Giorni - Adrenalina Club',
                        html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px;">
                                <h2 style="color: #df293e;">ADRENALINA CLUB</h2>
                                <p>Ciao ${cert.anagrafiche.nome}, ti ricordiamo che il tuo certificato medico scadrà il <strong>${cert.data_scadenza}</strong> (tra 30 giorni).</p>
                                <p>Ti invitiamo a rinnovarlo al più presto ed effettuare l'upload nel portale per evitare la sospensione delle attività sportive.</p>
                               </div>`
                    });
                }
            }
        }

        // B. Scadenza a 15 giorni
        const { data: certs15, error: err15 } = await supabase
            .from('certificati_medici')
            .select(`
                id,
                data_scadenza,
                anagrafiche (
                    nome,
                    utente_id,
                    contatti ( email )
                )
            `)
            .eq('data_scadenza', fifteenDaysOut);

        if (err15) console.error("Error fetching 15d certificates:", err15);
        else if (certs15) {
            for (const cert of certs15) {
                const email = cert.anagrafiche?.contatti?.email;
                if (email) {
                    await sendEmail({
                        to: email,
                        subject: 'URGENTE: Scadenza Certificato Medico - 15 Giorni',
                        html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px;">
                                <h2 style="color: #df293e;">ADRENALINA CLUB - AVVISO URGENTE</h2>
                                <p>Ciao ${cert.anagrafiche.nome}, il tuo certificato medico scadrà il <strong>${cert.data_scadenza}</strong> (tra 15 giorni).</p>
                                <p>Se non effettuerai l'upload del nuovo certificato medico, il tuo tesseramento verrà sospeso automaticamente il giorno della scadenza.</p>
                               </div>`
                    });
                }
            }
        }

        // C. Scaduti oggi (o prima) e non ancora SOSPESI
        const { data: certsExpired, error: errExp } = await supabase
            .from('certificati_medici')
            .select(`
                id,
                anagrafica_id,
                data_scadenza,
                anagrafiche (
                    nome,
                    cognome,
                    contatti ( email )
                )
            `)
            .lte('data_scadenza', todayStr);

        if (errExp) console.error("Error fetching expired certificates:", errExp);
        else if (certsExpired) {
            for (const cert of certsExpired) {
                // Update registro_tesserati to SOSPESO
                const { data: updateData, error: updateError } = await supabase
                    .from('registro_tesserati')
                    .update({ stato_tesseramento: 'SOSPESO' })
                    .eq('anagrafica_id', cert.anagrafica_id)
                    .neq('stato_tesseramento', 'SOSPESO')
                    .select();

                if (updateError) console.error(`Error suspending athlete ${cert.anagrafica_id}:`, updateError);
                
                // If it updated (meaning it wasn't already suspended), send emails
                if (updateData && updateData.length > 0) {
                    const email = cert.anagrafiche?.contatti?.email;
                    if (email) {
                        await sendEmail({
                            to: email,
                            subject: 'Tesseramento Sospeso - Certificato Medico Scaduto',
                            html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #df293e;">
                                    <h2 style="color: #df293e;">ADRENALINA CLUB - TESSERAMENTO SOSPESO</h2>
                                    <p>Ciao ${cert.anagrafiche.nome}, il tuo certificato medico è scaduto in data <strong>${cert.data_scadenza}</strong>.</p>
                                    <p>Il tuo tesseramento sportivo è stato <strong>SOSPESO</strong> in conformità alle norme sulla tutela sanitaria RASD. Non potrai accedere ai corsi o prenotare eventi fino all'upload del nuovo certificato in corso di validità.</p>
                                   </div>`
                        });
                    }

                    // Alert President/VP (fetch all users with role 'presidente' or 'vice_presidente')
                    const { data: boardAdmins } = await supabase
                        .from('utenti')
                        .select('email')
                        .in('ruolo', ['presidente', 'vice_presidente']);

                    if (boardAdmins) {
                        for (const admin of boardAdmins) {
                            await sendEmail({
                                to: admin.email,
                                subject: `ALERT TUTELA SANITARIA: Sospensione Atleta ${cert.anagrafiche.nome} ${cert.anagrafiche.cognome}`,
                                html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 20px;">
                                        <p style="color: #df293e; font-weight: bold;">ALERT BLOCCO SPORTIVO</p>
                                        <p>L'atleta <strong>${cert.anagrafiche.nome} ${cert.anagrafiche.cognome}</strong> è stato sospeso automaticamente in data odierna a causa della scadenza del certificato medico (${cert.data_scadenza}).</p>
                                       </div>`
                            });
                        }
                    }
                }
            }
        }

        // 2. SOCIAL DUES RENEWAL (December 1st)
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentDay = today.getDate();
        
        if (currentMonth === 12 && currentDay === 1) {
            // Fetch all active members
            const { data: activeSoci } = await supabase
                .from('registro_soci')
                .select(`
                    id_socio,
                    anagrafiche (
                        nome,
                        contatti ( email )
                    )
                `)
                .eq('stato_socio', 'ATTIVO');

            if (activeSoci) {
                for (const socio of activeSoci) {
                    const email = socio.anagrafiche?.contatti?.email;
                    if (email) {
                        await sendEmail({
                            to: email,
                            subject: 'Rinnovo Quota Sociale Annuale 2027 - Adrenalina Club',
                            html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px;">
                                    <h2 style="color: #df293e;">ADRENALINA CLUB</h2>
                                    <p>Ciao ${socio.anagrafiche.nome}, ti comunichiamo che a partire dal 1° Dicembre sono aperti i rinnovi della quota sociale per il prossimo anno solare.</p>
                                    <p>Ti invitiamo a saldare la quota associativa entro il 31 Dicembre per mantenere il diritto di voto e di partecipazione all'assemblea dei soci.</p>
                                   </div>`
                        });
                    }
                }
            }
        }

        // 3. ADMIN RUNTS / BUDGET DEADLINE ALERTS (May 1st and June 1st)
        if (currentMonth === 5 && currentDay === 1) {
            // May 1st: Balance Sheet Deposit alert
            const { data: admins } = await supabase
                .from('utenti')
                .select('email')
                .in('ruolo', ['presidente', 'vice_presidente', 'segretario', 'tesoriere']);

            if (admins) {
                for (const adm of admins) {
                    await sendEmail({
                        to: adm.email,
                        subject: 'SCADENZA LEGALE: Deposito Bilancio d’Esercizio (Art. 48 CTS)',
                        html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #eab308;">
                                <h2 style="color: #eab308; font-size: 18px;">ADEMPIMENTO CTS - BILANCIO D'ESERCIZIO</h2>
                                <p>Avviso automatico di conformità DM 2/2026:</p>
                                <p>Si ricorda che entro il <strong>30 Giugno</strong> (180 giorni dalla chiusura d'esercizio al 31 Dicembre) è obbligatorio procedere con il deposito del Bilancio Consuntivo nel portale RUNTS.</p>
                               </div>`
                    });
                }
            }
        }

        if (currentMonth === 6 && currentDay === 1) {
            // June 1st: RUNTS annual details update alert
            const { data: admins } = await supabase
                .from('utenti')
                .select('email')
                .in('ruolo', ['presidente', 'vice_presidente', 'segretario']);

            if (admins) {
                for (const adm of admins) {
                    await sendEmail({
                        to: adm.email,
                        subject: 'SCADENZA LEGALE: Aggiornamento Annuale RUNTS',
                        html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #eab308;">
                                <h2 style="color: #eab308; font-size: 18px;">AGGIORNAMENTO ANNUALE REGISTRO UNICO</h2>
                                <p>Avviso automatico di conformità DM 2/2026:</p>
                                <p>Procedere con la verifica del numero di soci e lavoratori iscritti al 31 Dicembre dell'anno precedente e aggiornare le statistiche sul portale RUNTS entro il 30 Giugno.</p>
                               </div>`
                    });
                }
            }
        }

        return res.status(200).json({ success: true, processed: true });

    } catch (error) {
        console.error("Cron handler error:", error);
        return res.status(500).json({ error: error.message });
    }
}
