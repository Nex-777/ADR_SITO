import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './resend-mail.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Server configuration error');
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    const internalSecret = req.headers['x-cron-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!process.env.CRON_SECRET || internalSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Query suspended athletes with their latest expired certificate
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

        const sent = [];
        if (athletes) {
            for (const athlete of athletes) {
                const anag = athlete.anagrafiche;
                if (!anag) continue;

                const email = anag.contatti?.email;
                if (!email) continue;

                const certs = anag.certificati_medici || [];
                const sortedCerts = [...certs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                const latestCert = sortedCerts[0];
                const dataScadenza = latestCert ? latestCert.data_scadenza : 'N/D';

                console.log(`Sending suspension warning email to ${anag.nome} ${anag.cognome} (${email})...`);
                const result = await sendEmail({
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

                sent.push({ email, name: `${anag.nome} ${anag.cognome}`, success: result.success, error: result.error });
            }
        }

        return res.status(200).json({ success: true, sent });
    } catch (error) {
        console.error("Error sending emails:", error);
        return res.status(500).json({ error: error.message });
    }
}
