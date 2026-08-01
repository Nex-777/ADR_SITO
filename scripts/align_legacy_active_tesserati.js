import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function alignLegacyActiveTesserati() {
    console.log('Avvio allineamento registri approvazione per tesserati/soci storici attivi...');

    const { data: users, error } = await supabase
        .from('utenti')
        .select('id, email, nome, cognome, anagrafiche(id, registro_approvazioni(*), registro_tesserati(*), registro_soci(*))');

    if (error) {
        console.error('Errore recupero utenti:', error);
        return;
    }

    let alignedCount = 0;

    for (const u of users) {
        const anags = Array.isArray(u.anagrafiche) ? u.anagrafiche : (u.anagrafiche ? [u.anagrafiche] : []);
        if (anags.length === 0) continue;
        const anag = anags[0];

        const apprs = Array.isArray(anag.registro_approvazioni) ? anag.registro_approvazioni : (anag.registro_approvazioni ? [anag.registro_approvazioni] : []);
        const hasApproved = apprs.some(a => a.stato === 'APPROVATO');

        const rt = Array.isArray(anag.registro_tesserati) ? anag.registro_tesserati[0] : anag.registro_tesserati;
        const rs = Array.isArray(anag.registro_soci) ? anag.registro_soci[0] : anag.registro_soci;

        const isTessActive = rt && rt.stato_tesseramento === 'ATTIVO';
        const isSocioActive = rs && rs.stato_socio === 'ATTIVO';

        if ((isTessActive || isSocioActive) && !hasApproved) {
            console.log(`\nAllineamento utente: ${u.nome} ${u.cognome} (${u.email})...`);

            const reqDate = rt?.data_richiesta_tesseramento || rs?.data_domanda || '2026-01-01';
            const tipo = isSocioActive ? 'SOCIO' : 'TESSERATO';
            const livello = rt?.livello_copertura || 'BASE';

            const { error: apprErr } = await supabase
                .from('registro_approvazioni')
                .insert({
                    anagrafica_id: anag.id,
                    tipo: tipo,
                    stato: 'APPROVATO',
                    data_richiesta: reqDate,
                    data_decisione: reqDate,
                    livello_copertura: livello
                });

            if (apprErr) {
                console.error(`  ✕ Errore inserimento approvazione:`, apprErr);
            } else {
                console.log(`  ✓ Approvazione registrata come APPROVATO (${tipo})`);
                alignedCount++;
            }
        }
    }

    console.log(`\n✅ Allineamento completato con successo per ${alignedCount} tesserati/soci storici!`);
}

alignLegacyActiveTesserati();
