import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
    console.error("Missing environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendEmail({ to, subject, html }) {
    const payload = {
        from: 'Adrenalina Club <noreply@adrenalinaclub.it>',
        to,
        subject,
        html
    };

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend API returned status ${response.status}: ${errText}`);
    }

    return await response.json();
}

async function run() {
    try {
        console.log("Querying suspended athletes...");
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
                        data_scadenza,
                        stato_validazione,
                        created_at
                    )
                )
            `)
            .eq('stato_tesseramento', 'SOSPESO');

        if (athletesErr) throw athletesErr;

        console.log(`Found ${athletes ? athletes.length : 0} suspended athletes.`);

        if (athletes) {
            for (const athlete of athletes) {
                const anag = athlete.anagrafiche;
                if (!anag) continue;

                const email = anag.contatti?.email;
                if (!email) {
                    console.log(`Athlete ${anag.nome} ${anag.cognome} has no email configured.`);
                    continue;
                }

                const certs = anag.certificati_medici || [];
                const sortedCerts = [...certs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                const latestCert = sortedCerts[0];
                const dataScadenza = latestCert ? latestCert.data_scadenza : 'N/D';

                console.log(`Sending email to ${anag.nome} ${anag.cognome} (${email}) - expired: ${dataScadenza}...`);
                try {
                    await sendEmail({
                        to: email,
                        subject: 'Tesseramento Sospeso - Certificato Medico Scaduto',
                        html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #df293e;">
                                <h2 style="color: #df293e;">ADRENALINA CLUB - TESSERAMENTO SOSPESO</h2>
                                <p>Ciao ${anag.nome}, ti informiamo che il tuo tesseramento sportivo è stato <strong>SOSPESO</strong> in conformità alle norme sulla tutela sanitaria RASD a causa della scadenza del certificato medico (${dataScadenza}).</p>
                                <p>Non potrai accedere ai corsi o prenotare eventi fino all'upload del nuovo certificato in corso di validità.</p>
                                <p style="color: #df293e; font-weight: bold;">
                                  Fino al caricamento e alla successiva approvazione del nuovo certificato medico, la tua operatività sul portale sarà limitata esclusivamente al caricamento dei documenti e non potrai partecipare ad alcun corso o prenotare eventi.
                                </p>
                               </div>`
                    });
                    console.log(`Email successfully sent to ${email}`);
                } catch (emailErr) {
                    console.error(`Failed to send email to ${email}:`, emailErr.message);
                }
            }
        }
    } catch (err) {
        console.error("Execution error:", err);
        process.exit(1);
    }
}

run();
