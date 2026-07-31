import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function alignHistoricSoci() {
    console.log('Avvio allineamento completo Soci Storici e Direttivo (valido fino al 31/12/2026)...');

    // Recupera tutti gli utenti con ruolo socio_approvato o direttivo/admin
    const { data: users, error } = await supabase
        .from('utenti')
        .select('id, email, nome, cognome, ruolo, anagrafiche(id, registro_approvazioni(*), registro_soci(*), certificati_medici(*))');

    if (error) {
        console.error('Errore recupero utenti:', error);
        return;
    }

    const direttivoRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere', 'admin', 'socio_approvato'];

    for (const u of users) {
        const isStaffOrApprovedSocio = u.ruolo && u.ruolo.some(r => direttivoRoles.includes(r));
        if (!isStaffOrApprovedSocio) continue;

        console.log(`\nProcessing: ${u.nome} ${u.cognome} (${u.email})...`);

        const anags = Array.isArray(u.anagrafiche) ? u.anagrafiche : (u.anagrafiche ? [u.anagrafiche] : []);
        let anagId = null;

        if (anags.length === 0) {
            console.log(`  -> Nessuna anagrafica trovata. Creazione anagrafica di base...`);
            const cfDummy = (u.cognome?.substring(0, 3) + u.nome?.substring(0, 3) + '80A01H501Z').toUpperCase();
            const { data: newAnag, error: newAnagErr } = await supabase
                .from('anagrafiche')
                .insert({
                    utente_id: u.id,
                    nome: u.nome || 'Socio',
                    cognome: u.cognome || 'Storico',
                    codice_fiscale: cfDummy,
                    sesso: 'M',
                    data_nascita: '1980-01-01',
                    stato_nascita: 'Italia',
                    provincia_nascita: 'RM',
                    comune_nascita: 'Roma'
                })
                .select('id')
                .single();

            if (newAnagErr) {
                console.error(`  ✕ Errore creazione anagrafica:`, newAnagErr);
                continue;
            }
            anagId = newAnag.id;
        } else {
            anagId = anags[0].id;
        }

        // 1. Allineamento registro_approvazioni
        const apprs = Array.isArray(anags[0]?.registro_approvazioni) ? anags[0].registro_approvazioni : (anags[0]?.registro_approvazioni ? [anags[0].registro_approvazioni] : []);
        const hasApproved = apprs.some(a => a.stato === 'APPROVATO');

        if (!hasApproved) {
            console.log(`  -> Inserimento approvazione fittizia 2026...`);
            const { error: apprErr } = await supabase
                .from('registro_approvazioni')
                .insert({
                    anagrafica_id: anagId,
                    tipo: u.ruolo.includes('socio_approvato') ? 'SOCIO' : 'TESSERATO',
                    stato: 'APPROVATO',
                    data_richiesta: '2026-01-01',
                    data_decisione: '2026-01-01',
                    livello_copertura: 'BASE'
                });

            if (apprErr) console.error(`  ✕ Errore inserimento approvazione:`, apprErr);
            else console.log(`  ✓ Approvazione registrata con stato APPROVATO`);
        } else {
            console.log(`  ✓ Approvazione già presente.`);
        }

        // 2. Allineamento certificati_medici (Verde fino al 31/12/2026)
        const certs = Array.isArray(anags[0]?.certificati_medici) ? anags[0].certificati_medici : (anags[0]?.certificati_medici ? [anags[0].certificati_medici] : []);
        const hasValidCert = certs.some(c => c.stato_validazione === 'VERDE' && c.data_scadenza >= '2026-12-31');

        if (!hasValidCert) {
            if (certs.length > 0) {
                console.log(`  -> Aggiornamento certificato esistente a VERDE (scadenza 2026-12-31)...`);
                const certToUpdate = certs[0];
                const { error: certUpdateErr } = await supabase
                    .from('certificati_medici')
                    .update({
                        stato_validazione: 'VERDE',
                        data_scadenza: '2026-12-31',
                        medico_rilascio: certToUpdate.medico_rilascio || 'Validato Segreteria (Dato Storico Allineato)',
                        note_ai: 'Certificato approvato d\'ufficio per allineamento soci storici 2026.'
                    })
                    .eq('id', certToUpdate.id);

                if (certUpdateErr) console.error(`  ✕ Errore aggiornamento certificato:`, certUpdateErr);
                else console.log(`  ✓ Certificato esistente aggiornato a VERDE (scadenza 2026-12-31)`);
            } else {
                console.log(`  -> Inserimento certificato fittizio VERDE (scadenza 2026-12-31)...`);
                const { error: certInsErr } = await supabase
                    .from('certificati_medici')
                    .insert({
                        anagrafica_id: anagId,
                        file_url: 'fittizio',
                        tipologia: 'NON_AGONISTICO',
                        data_rilascio: '2026-01-01',
                        data_scadenza: '2026-12-31',
                        medico_rilascio: 'Validato Segreteria (Dato Storico Allineato)',
                        stato_validazione: 'VERDE',
                        note_ai: 'Certificato approvato d\'ufficio per allineamento soci storici 2026.'
                    });

                if (certInsErr) console.error(`  ✕ Errore inserimento certificato:`, certInsErr);
                else console.log(`  ✓ Certificato fittizio inserito con stato VERDE (scadenza 2026-12-31)`);
            }
        } else {
            console.log(`  ✓ Certificato medico già valido e in regola.`);
        }

        // 3. Allineamento registro_soci (se iscritto come socio)
        if (u.ruolo.includes('socio_approvato')) {
            const { data: socioReg } = await supabase
                .from('registro_soci')
                .select('*')
                .eq('anagrafica_id', anagId)
                .maybeSingle();

            if (!socioReg) {
                console.log(`  -> Inserimento registro_soci (scadenza 2026-12-31)...`);
                const { error: socioInsErr } = await supabase
                    .from('registro_soci')
                    .insert({
                        anagrafica_id: anagId,
                        stato_socio: 'ATTIVO',
                        data_domanda: '2026-01-01',
                        data_delibera_direttivo: '2026-01-01',
                        quota_scadenza: '2026-12-31'
                    });

                if (socioInsErr) console.error(`  ✕ Errore inserimento registro soci:`, socioInsErr);
                else console.log(`  ✓ Registro soci creato con scadenza 2026-12-31`);
            } else if (socioReg.stato_socio !== 'ATTIVO' || socioReg.quota_scadenza < '2026-12-31') {
                console.log(`  -> Aggiornamento registro_soci (scadenza 2026-12-31)...`);
                const { error: socioUpdErr } = await supabase
                    .from('registro_soci')
                    .update({
                        stato_socio: 'ATTIVO',
                        quota_scadenza: '2026-12-31'
                    })
                    .eq('id_socio', socioReg.id_socio);

                if (socioUpdErr) console.error(`  ✕ Errore aggiornamento registro soci:`, socioUpdErr);
                else console.log(`  ✓ Registro soci aggiornato ad ATTIVO con scadenza 2026-12-31`);
            } else {
                console.log(`  ✓ Registro soci già in regola.`);
            }
        }

        // 4. Azzeramento quota_totale in utenti
        if (u.quota_totale !== 0) {
            const { error: userUpdErr } = await supabase
                .from('utenti')
                .update({ quota_totale: 0.00 })
                .eq('id', u.id);

            if (userUpdErr) console.error(`  ✕ Errore azzeramento quota_totale:`, userUpdErr);
            else console.log(`  ✓ Quota totale utente azzerata (€0.00)`);
        }
    }

    console.log('\n✅ Allineamento Soci Storici e Direttivo completato con successo!');
}

alignHistoricSoci();
