import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './resend-mail.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables.');
    throw new Error('Server configuration error');
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    // Basic verification (e.g. check secret token to prevent unauthorized execution)
    const authHeader = req.headers['authorization'];
    const bearerSecret = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const internalSecret = req.headers['x-cron-secret'];
    const cronSecret = bearerSecret || internalSecret;
    if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
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
        const { data: athletes, error: athletesErr } = await supabase
            .from('registro_tesserati')
            .select(`
                anagrafica_id,
                stato_tesseramento,
                anagrafiche (
                    nome,
                    cognome,
                    contatti ( email ),
                    certificati_medici (
                        id,
                        data_scadenza,
                        stato_validazione,
                        created_at
                    )
                )
            `)
            .in('stato_tesseramento', ['ATTIVO', 'SOSPESO']);

        if (athletesErr) {
            console.error("Error fetching athletes for cron scan:", athletesErr);
            throw athletesErr;
        }

        if (athletes) {
            for (const athlete of athletes) {
                const anag = athlete.anagrafiche;
                if (!anag) continue;
                
                const certs = anag.certificati_medici || [];
                if (certs.length === 0) {
                    continue;
                }
                
                // Ordina per created_at decrescente per trovare il certificato più recente
                const sortedCerts = [...certs].sort((a, b) => {
                    const valA = a.created_at || '1970-01-01';
                    const valB = b.created_at || '1970-01-01';
                    return new Date(valB) - new Date(valA);
                });
                const latestCert = sortedCerts[0];
                const dataScadenza = latestCert.data_scadenza;
                
                if (!dataScadenza) continue;
                
                // A. Riattivazione Automatica
                if (athlete.stato_tesseramento === 'SOSPESO') {
                    if (latestCert.stato_validazione === 'VERDE' && dataScadenza > todayStr) {
                        const { data: updateData, error: updateError } = await supabase
                            .from('registro_tesserati')
                            .update({ stato_tesseramento: 'ATTIVO' })
                            .eq('anagrafica_id', athlete.anagrafica_id)
                            .select();
                        
                        if (updateError) {
                            console.error(`Error reactivating athlete ${athlete.anagrafica_id}:`, updateError);
                        } else if (updateData && updateData.length > 0) {
                            console.log(`Athlete ${anag.nome} ${anag.cognome} reactivated automatically.`);
                            const email = anag.contatti?.email;
                            if (email) {
                                await sendEmail({
                                    to: email,
                                    subject: 'Tesseramento Riattivato - Adrenalina Club',
                                    html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #22c55e;">
                                            <h2 style="color: #22c55e;">ADRENALINA CLUB - TESSERAMENTO RIATTIVATO</h2>
                                            <p>Ciao ${anag.nome}, ti confermiamo che a seguito della convalida del tuo nuovo certificato medico sportivo, il tuo tesseramento è stato <strong>RIATTIVATO</strong>.</p>
                                            <p>Da ora puoi accedere nuovamente ai corsi, prenotare eventi e usufruire di tutte le funzionalità del portale.</p>
                                           </div>`
                                });
                            }
                        }
                    }
                }
                
                // B. Notifica a 30 giorni (solo per atleti ATTIVI)
                if (athlete.stato_tesseramento === 'ATTIVO' && dataScadenza === thirtyDaysOut) {
                    const email = anag.contatti?.email;
                    if (email) {
                        await sendEmail({
                            to: email,
                            subject: 'Scadenza Certificato Medico - 30 Giorni - Adrenalina Club',
                            html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px;">
                                    <h2 style="color: #df293e;">ADRENALINA CLUB</h2>
                                    <p>Ciao ${anag.nome}, ti ricordiamo che il tuo certificato medico scadrà il <strong>${dataScadenza}</strong> (tra 30 giorni).</p>
                                    <p>Ti invitiamo a rinnovarlo al più presto ed effettuare l'upload nel portale per evitare la sospensione delle attività sportive.</p>
                                    <p style="color: #df293e; font-weight: bold;">
                                      Fino al caricamento e alla successiva approvazione del nuovo certificato medico, l'accesso ai corsi, agli eventi e alle attività sportive sarà sospeso. Il portale sarà limitato esclusivamente al caricamento della documentazione.
                                    </p>
                                   </div>`
                        });
                    }
                }
                
                // C. Notifica a 15 giorni (solo per atleti ATTIVI)
                if (athlete.stato_tesseramento === 'ATTIVO' && dataScadenza === fifteenDaysOut) {
                    const email = anag.contatti?.email;
                    if (email) {
                        await sendEmail({
                            to: email,
                            subject: 'URGENTE: Scadenza Certificato Medico - 15 Giorni',
                            html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px;">
                                    <h2 style="color: #df293e;">ADRENALINA CLUB - AVVISO URGENTE</h2>
                                    <p>Ciao ${anag.nome}, il tuo certificato medico scadrà il <strong>${dataScadenza}</strong> (tra 15 giorni).</p>
                                    <p>Se non effettuerai l'upload del nuovo certificato medico, il tuo tesseramento verrà sospeso automaticamente il giorno della scadenza.</p>
                                    <p style="color: #df293e; font-weight: bold;">
                                      Fino al caricamento e alla successiva approvazione del nuovo certificato medico, l'accesso ai corsi, agli eventi e alle attività sportive sarà sospeso. Il portale sarà limitato esclusivamente al caricamento della documentazione.
                                    </p>
                                   </div>`
                        });
                    }
                }
                
                // D. Scaduto (oggi o prima) e ancora ATTIVO -> SOSPESO
                if (athlete.stato_tesseramento === 'ATTIVO' && dataScadenza <= todayStr) {
                    const { data: updateData, error: updateError } = await supabase
                        .from('registro_tesserati')
                        .update({ stato_tesseramento: 'SOSPESO' })
                        .eq('anagrafica_id', athlete.anagrafica_id)
                        .select();
                        
                    if (updateError) {
                        console.error(`Error suspending athlete ${athlete.anagrafica_id}:`, updateError);
                    } else if (updateData && updateData.length > 0) {
                        console.log(`Athlete ${anag.nome} ${anag.cognome} suspended because certificate expired on ${dataScadenza}.`);
                        const email = anag.contatti?.email;
                        if (email) {
                            await sendEmail({
                                to: email,
                                subject: 'Tesseramento Sospeso - Certificato Medico Scaduto',
                                html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #df293e;">
                                        <h2 style="color: #df293e;">ADRENALINA CLUB - TESSERAMENTO SOSPESO</h2>
                                        <p>Ciao ${anag.nome}, il tuo certificato medico è scaduto in data <strong>${dataScadenza}</strong>.</p>
                                        <p>Il tuo tesseramento sportivo è stato <strong>SOSPESO</strong> in conformità alle norme sulla tutela sanitaria RASD. Non potrai accedere ai corsi o prenotare eventi fino all'upload del nuovo certificato in corso di validità.</p>
                                        <p style="color: #df293e; font-weight: bold;">
                                          Fino al caricamento e alla successiva approvazione del nuovo certificato medico, la tua operatività sul portale sarà limitata esclusivamente al caricamento dei documenti e non potrai partecipare ad alcun corso o prenotare eventi.
                                        </p>
                                       </div>`
                            });
                        }
                        
                        // Alert President/VP
                        const { data: boardAdmins } = await supabase
                            .from('utenti')
                            .select('email')
                            .overlaps('ruolo', ['presidente', 'vice_presidente']);
                            
                        if (boardAdmins) {
                            for (const admin of boardAdmins) {
                                await sendEmail({
                                    to: admin.email,
                                    subject: `ALERT TUTELA SANITARIA: Sospensione Atleta ${anag.nome} ${anag.cognome}`,
                                    html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 20px;">
                                            <p style="color: #df293e; font-weight: bold;">ALERT BLOCCO SPORTIVO</p>
                                            <p>L'atleta <strong>${anag.nome} ${anag.cognome}</strong> è stato sospeso automaticamente in data odierna a causa della scadenza del certificato medico (${dataScadenza}).</p>
                                           </div>`
                                });
                            }
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
                .overlaps('ruolo', ['presidente', 'vice_presidente', 'segretario', 'tesoriere']);

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
                .overlaps('ruolo', ['presidente', 'vice_presidente', 'segretario']);

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
        return res.status(500).json({ error: 'Errore interno del server.' });
    }
}
