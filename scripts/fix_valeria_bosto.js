import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runSanatoriaValeria() {
    console.log('Avvio sanatoria per Valeria Bosco...');

    const userId = 'da47dd72-4fc7-4677-a449-fb12048af4ab';
    const anagId = '772fa4bb-dbb0-451c-9510-d3e978ff80ef';
    const certId = '16a66a83-79cd-4cfd-abf9-9deb7a04f3fe';
    const apprId = 'fa8dad02-2a65-46e1-ad57-7331fb5616c4';

    // 1. Approvazione certificato medico (VERDE)
    const { error: certErr } = await supabase
        .from('certificati_medici')
        .update({
            stato_validazione: 'VERDE',
            note_ai: 'Validato manualmente tramite procedura di sanatoria segreteria.',
            medico_rilascio: 'Validato Segreteria'
        })
        .eq('id', certId);

    if (certErr) console.error('Errore aggiornamento certificato:', certErr);
    else console.log('✓ Certificato medico aggiornato a VERDE');

    // 2. Aggiornamento registro_approvazioni (IN_ATTESA_PAGAMENTO)
    const { error: apprErr } = await supabase
        .from('registro_approvazioni')
        .update({
            stato: 'IN_ATTESA_PAGAMENTO'
        })
        .eq('id', apprId);

    if (apprErr) console.error('Errore aggiornamento registro approvazioni:', apprErr);
    else console.log('✓ Registro approvazioni aggiornato a IN_ATTESA_PAGAMENTO');

    // 3. Aggiornamento quota_totale utenti (25.00 €)
    const { error: userErr } = await supabase
        .from('utenti')
        .update({
            quota_totale: 25.00
        })
        .eq('id', userId);

    if (userErr) console.error('Errore aggiornamento quota_totale utente:', userErr);
    else console.log('✓ Quota totale utente impostata a €25.00');

    console.log('Sanatoria completata con successo!');
}

runSanatoriaValeria();
