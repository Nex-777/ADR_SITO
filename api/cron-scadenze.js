import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './_utils/resend-mail.js';
import { sendTelegramAlert, escapeTelegramHtml } from './_utils/telegram-bot.js';

/**
 * Filtra ed elimina duplicati per anagrafica replicando 1:1 la logica di
 * loadDocsAttesa() e loadCertificatiGialli() della Dashboard.
 */
export function filterVisibleApprovalItems(rows = []) {
    const seenAnag = new Set();
    const visible = [];

    for (const item of rows) {
        const anag = item?.anagrafiche;
        const raList = Array.isArray(anag?.registro_approvazioni)
            ? anag.registro_approvazioni
            : (anag?.registro_approvazioni ? [anag.registro_approvazioni] : []);
        const rtList = Array.isArray(anag?.registro_tesserati)
            ? anag.registro_tesserati
            : (anag?.registro_tesserati ? [anag.registro_tesserati] : []);

        const isSocioRespinto = raList.some(r => r?.stato === 'RESPINTO');
        const hasActiveTess = rtList.some(t => t?.stato_tesseramento === 'ATTIVO');
        if (isSocioRespinto && !hasActiveTess) continue;

        if (item?.anagrafica_id) {
            if (seenAnag.has(item.anagrafica_id)) continue;
            seenAnag.add(item.anagrafica_id);
        }
        visible.push(item);
    }

    return visible;
}

function appendDigestSection(lines, labelHtml, items, formatLine, overflowLabel = 'elementi') {
    if (!items || items.length === 0) return;
    lines.push(`${labelHtml} (${items.length}):</b>`);
    items.slice(0, 10).forEach(item => lines.push(formatLine(item)));
    if (items.length > 10) {
        lines.push(`  <i>...e altri ${items.length - 10} ${overflowLabel}</i>`);
    }
    lines.push('');
}

function formatAnagName(anag) {
    return `${anag?.nome || ''} ${anag?.cognome || ''}`.trim() || 'N/D';
}

export function buildDailyApprovalDigestMessage({
    pendingPayments = [],
    incompleteRegistrations = [],
    docsAttesa = [],
    certGialli = [],
    sociAttesa = [],
    tessAttesa = [],
    recuperoPwd = [],
    counts = {}
}) {
    const escapeTg = escapeTelegramHtml;

    const docsCount = docsAttesa.length > 0 ? docsAttesa.length : (counts.docsAttesa || 0);
    const certsCount = certGialli.length > 0 ? certGialli.length : (counts.certGialli || 0);
    const sociCount = sociAttesa.length > 0 ? sociAttesa.length : (counts.sociAttesa || 0);
    const tessCount = tessAttesa.length > 0 ? tessAttesa.length : (counts.tessAttesa || 0);
    const pwdCount = recuperoPwd.length > 0 ? recuperoPwd.length : (counts.recuperoPwd || 0);

    const totalItems =
        pendingPayments.length +
        incompleteRegistrations.length +
        docsCount +
        certsCount +
        sociCount +
        tessCount +
        pwdCount;

    if (totalItems === 0) return null;

    const lines = [
        `📋 <b>PROMEMORIA GIORNALIERO — REGISTRO APPROVAZIONI</b>\n`
    ];

    appendDigestSection(
        lines,
        '💳 <b>In Attesa di Pagamento',
        pendingPayments,
        item => {
            const anag = item.anagrafiche || {};
            const quota = parseFloat(anag.utenti?.quota_totale || 0);
            const quotaTxt = quota > 0 ? ` — €${quota.toFixed(2)}` : '';
            return `• ${escapeTg(formatAnagName(anag))} (${escapeTg(item.tipo || 'N/D')}${quotaTxt})`;
        },
        'utenti'
    );

    appendDigestSection(
        lines,
        '⚠️ <b>Registrazioni Incomplete / OTP Sospeso (&gt;1h)',
        incompleteRegistrations,
        g => {
            const dateIt = g.data_creazione
                ? new Date(g.data_creazione).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })
                : '';
            return `• ${escapeTg(formatAnagName(g))} (${escapeTg(g.email || '')}${dateIt ? ` — ${dateIt}` : ''})`;
        },
        'pratiche'
    );

    appendDigestSection(
        lines,
        '🪪 <b>Documenti Identità da Verificare',
        docsAttesa,
        d => `• ${escapeTg(formatAnagName(d.anagrafiche))} (${escapeTg(d.stato_validazione || 'IN_ATTESA')})`
    );

    appendDigestSection(
        lines,
        '🩺 <b>Certificati Medici in Revisione',
        certGialli,
        c => `• ${escapeTg(formatAnagName(c.anagrafiche))} (${escapeTg(c.stato_validazione || 'GIALLO')})`
    );

    appendDigestSection(
        lines,
        '🤝 <b>Soci in Attesa Delibera',
        sociAttesa,
        s => `• ${escapeTg(formatAnagName(s.anagrafiche))} (${escapeTg(s.tipo || 'SOCIO')})`
    );

    appendDigestSection(
        lines,
        '🥋 <b>Tesserati in Attesa Attivazione',
        tessAttesa,
        t => `• ${escapeTg(formatAnagName(t.anagrafiche))}`
    );

    appendDigestSection(
        lines,
        '🔑 <b>Richieste Recupero Password',
        recuperoPwd,
        p => {
            const nom = p.nominativo || formatAnagName(p);
            const label = nom !== 'N/D' ? `${escapeTg(nom)} (${escapeTg(p.email || '')})` : escapeTg(p.email || 'N/D');
            return `• ${label}`;
        }
    );

    // Fallback numerico per chiamate che passano solo counts senza array dettagliati
    const otherCounts = [];
    if (docsAttesa.length === 0 && (counts.docsAttesa || 0) > 0) otherCounts.push(`🪪 Documenti Identità da Verificare: <b>${counts.docsAttesa}</b>`);
    if (certGialli.length === 0 && (counts.certGialli || 0) > 0) otherCounts.push(`🩺 Certificati Medici in Revisione: <b>${counts.certGialli}</b>`);
    if (sociAttesa.length === 0 && (counts.sociAttesa || 0) > 0) otherCounts.push(`🤝 Soci in Attesa Delibera: <b>${counts.sociAttesa}</b>`);
    if (tessAttesa.length === 0 && (counts.tessAttesa || 0) > 0) otherCounts.push(`🥋 Tesserati in Attesa Attivazione: <b>${counts.tessAttesa}</b>`);
    if (recuperoPwd.length === 0 && (counts.recuperoPwd || 0) > 0) otherCounts.push(`🔑 Richieste Recupero Password: <b>${counts.recuperoPwd}</b>`);

    if (otherCounts.length > 0) {
        lines.push(`📌 <b>Altre Code Aperte nel Registro:</b>`);
        otherCounts.forEach(c => lines.push(`• ${c}`));
        lines.push('');
    }

    lines.push(`👉 <i>Accedi al portale direttivo per gestire le pratiche in sospeso.</i>`);
    return lines.join('\n');
}

export async function runApprovalDigest(supabase) {
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 4a. Auto-archiviazione richieste recupero password più vecchie di 7 giorni
    await supabase
        .from('richieste_recupero_password')
        .update({ stato: 'archiviato', risolto_il: new Date().toISOString() })
        .eq('stato', 'in_attesa')
        .lt('created_at', sevenDaysAgoIso);

    // 4b. Card 5: Tesserati e Soci in Attesa di Pagamento
    const { data: pendingPayments } = await supabase
        .from('registro_approvazioni')
        .select('id, tipo, data_decisione, data_richiesta, anagrafiche(nome, cognome, utenti(quota_totale))')
        .eq('stato', 'IN_ATTESA_PAGAMENTO')
        .order('data_richiesta', { ascending: true });

    // 4c. Card 6: Registrazioni Incomplete aperte da oltre 1 ora (esclude chi sta ancora inserendo OTP)
    const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: incompleteRegistrations } = await supabase
        .from('vw_registrazioni_incomplete')
        .select('utente_id, nome, cognome, email, data_creazione')
        .lt('data_creazione', oneHourAgoIso)
        .order('data_creazione', { ascending: false });

    // 4d. Card 1, 2, 3, 4, 7 con filtri allineati 1:1 alla Dashboard e nominativi espliciti
    const [docsRes, certsRes, pendingApprRes, pwdRes] = await Promise.all([
        supabase.from('documenti_identita')
            .select('id, anagrafica_id, stato_validazione, created_at, anagrafiche(nome, cognome, registro_approvazioni(stato), registro_tesserati(stato_tesseramento))')
            .in('stato_validazione', ['GIALLO', 'IN_ATTESA'])
            .eq('revisionato_manualmente', false)
            .order('created_at', { ascending: false }),
        supabase.from('certificati_medici')
            .select('id, anagrafica_id, stato_validazione, created_at, anagrafiche(nome, cognome, registro_approvazioni(stato), registro_tesserati(stato_tesseramento))')
            .not('file_url', 'is', null)
            .neq('file_url', '')
            .neq('file_url', 'fittizio')
            .eq('revisionato_manualmente', false)
            .or(`stato_validazione.in.(GIALLO,IN_ATTESA),and(stato_validazione.eq.ROSSO,created_at.gte.${sevenDaysAgoIso})`)
            .order('created_at', { ascending: false }),
        supabase.from('registro_approvazioni')
            .select('id, tipo, anagrafica_id, data_richiesta, anagrafiche(nome, cognome)')
            .eq('stato', 'IN_ATTESA')
            .in('tipo', ['SOCIO', 'SOCIO_TESSERATO', 'TESSERATO'])
            .order('data_richiesta', { ascending: true }),
        supabase.from('richieste_recupero_password')
            .select('id, email, created_at')
            .eq('stato', 'in_attesa')
            .order('created_at', { ascending: false })
    ]);

    const docsAttesa = filterVisibleApprovalItems(docsRes?.data || []);
    const certGialli = filterVisibleApprovalItems(certsRes?.data || []);
    const pendingAppr = pendingApprRes?.data || [];
    const sociAttesa = pendingAppr.filter(x => x.tipo === 'SOCIO' || x.tipo === 'SOCIO_TESSERATO');
    const tessAttesa = pendingAppr.filter(x => x.tipo === 'TESSERATO' || x.tipo === 'SOCIO_TESSERATO');

    let recuperoPwd = pwdRes?.data || [];
    if (recuperoPwd.length > 0) {
        const emails = [...new Set(recuperoPwd.map(r => (r.email || '').trim().toLowerCase()).filter(Boolean))];
        if (emails.length > 0) {
            const orFilter = emails.map(e => `email.ilike."${e.replace(/["\\]/g, '')}"`).join(',');
            const { data: matchedUsers } = await supabase
                .from('utenti')
                .select('email, nome, cognome')
                .or(orFilter);
            const userMap = {};
            (matchedUsers || []).forEach(u => {
                if (u.email) userMap[u.email.trim().toLowerCase()] = `${u.nome || ''} ${u.cognome || ''}`.trim();
            });
            recuperoPwd = recuperoPwd.map(r => ({
                ...r,
                nominativo: userMap[(r.email || '').trim().toLowerCase()] || 'Utente non censito'
            }));
        }
    }

    const digestMsg = buildDailyApprovalDigestMessage({
        pendingPayments: pendingPayments || [],
        incompleteRegistrations: incompleteRegistrations || [],
        docsAttesa,
        certGialli,
        sociAttesa,
        tessAttesa,
        recuperoPwd
    });

    if (digestMsg) {
        await sendTelegramAlert(digestMsg).catch(err => console.warn('[CRON DIGEST TELEGRAM]', err.message));
    }

    return Boolean(digestMsg);
}

export default async function handler(req, res) {
    // Basic verification (e.g. check secret token to prevent unauthorized execution)
    const authHeader = req.headers['authorization'];
    const bearerSecret = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const internalSecret = req.headers['x-cron-secret'];
    const cronSecret = bearerSecret || internalSecret;
    if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase environment variables.');
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
                                      Dal giorno successivo alla scadenza e fino al caricamento e alla successiva approvazione del nuovo certificato medico, l'accesso ai corsi, agli eventi e alle attività sportive sarà sospeso. Il portale sarà limitato esclusivamente al caricamento della documentazione.
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
                                      Dal giorno successivo alla scadenza e fino al caricamento e alla successiva approvazione del nuovo certificato medico, l'accesso ai corsi, agli eventi e alle attività sportive sarà sospeso. Il portale sarà limitato esclusivamente al caricamento della documentazione.
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
                                          Dal giorno successivo alla scadenza e fino al caricamento e alla successiva approvazione del nuovo certificato medico, la tua operatività sul portale sarà limitata esclusivamente al caricamento dei documenti e non potrai partecipare ad alcun corso o prenotare eventi.
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

        // 1B. CSEN TESSERE EXPIRY & RENEWAL WINDOW REMINDERS (-60gg, -15gg, SCADUTA)
        const target60Tess = getFutureDateStr(60);
        const target15Tess = getFutureDateStr(15);

        const { data: allActiveTesserati } = await supabase
            .from('registro_tesserati')
            .select(`
                id_tesserato,
                livello_copertura,
                data_scadenza_tessera,
                stato_tesseramento,
                anagrafiche (
                    nome,
                    cognome,
                    contatti ( email )
                )
            `)
            .eq('stato_tesseramento', 'ATTIVO')
            .not('data_scadenza_tessera', 'is', null);

        if (allActiveTesserati) {
            for (const tess of allActiveTesserati) {
                const scad = tess.data_scadenza_tessera;
                const anag = tess.anagrafiche;
                const contObj = Array.isArray(anag?.contatti) ? anag.contatti[0] : anag?.contatti;
                const email = contObj?.email;

                if (scad < todayStr) {
                    await supabase
                        .from('registro_tesserati')
                        .update({ stato_tesseramento: 'SCADUTO' })
                        .eq('id_tesserato', tess.id_tesserato);

                    if (email) {
                        await sendEmail({
                            to: email,
                            subject: 'Tessera Sportiva CSEN Scaduta - Adrenalina Club',
                            html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #df293e;">
                                    <h2 style="color: #df293e;">ADRENALINA CLUB</h2>
                                    <p>Ciao ${anag.nome}, la tua tessera sportiva CSEN (${(tess.livello_copertura || 'BASE').replace(/_/g, ' ')}) è scaduta in data <strong>${scad.split('-').reverse().join('/')}</strong>.</p>
                                    <p>Accedi alla tua dashboard su <a href="https://portal.adrenalinaclub.it" style="color: #df293e;">portal.adrenalinaclub.it</a> per procedere al rinnovo e mantenere attiva l'iscrizione e la copertura assicurativa.</p>
                                   </div>`
                        });
                    }
                } else if (email && (scad === target60Tess || scad === target15Tess)) {
                    const giorniMancanti = scad === target60Tess ? 60 : 15;
                    const titoloAvviso = giorniMancanti === 60
                        ? 'Apertura Rinnovo Tessera CSEN - Adrenalina Club'
                        : 'URGENTE: Tessera CSEN in scadenza tra 15 giorni - Adrenalina Club';
                    await sendEmail({
                        to: email,
                        subject: titoloAvviso,
                        html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid ${giorniMancanti === 15 ? '#df293e' : '#eab308'};">
                                <h2 style="color: #df293e;">ADRENALINA CLUB</h2>
                                <p>Ciao ${anag.nome}, ti informiamo che la tua tessera sportiva CSEN (${(tess.livello_copertura || 'BASE').replace(/_/g, ' ')}) scadrà tra <strong>${giorniMancanti} giorni</strong> (il <strong>${scad.split('-').reverse().join('/')}</strong>).</p>
                                <p>Da oggi è aperto il rinnovo nella tua area personale su <a href="https://portal.adrenalinaclub.it" style="color: #df293e;">portal.adrenalinaclub.it</a>, dove potrai anche confermare o cambiare il livello di copertura assicurativa.</p>
                               </div>`
                    });
                }
            }
        }

        // 2. SOCIAL DUES RENEWAL (November 1st opening & December 1st reminder for unpaid members)
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentDay = today.getDate();
        const nextYear = today.getFullYear() + 1;
        const nextYearEnd = `${nextYear}-12-31`;

        if ((currentMonth === 11 && currentDay === 1) || (currentMonth === 12 && currentDay === 1)) {
            const { data: activeSoci } = await supabase
                .from('registro_soci')
                .select(`
                    id_socio,
                    quota_scadenza,
                    anagrafiche (
                        nome,
                        contatti ( email )
                    )
                `)
                .eq('stato_socio', 'ATTIVO')
                .lt('quota_scadenza', nextYearEnd);

            if (activeSoci) {
                for (const socio of activeSoci) {
                    const contObj = Array.isArray(socio.anagrafiche?.contatti) ? socio.anagrafiche.contatti[0] : socio.anagrafiche?.contatti;
                    const email = contObj?.email;
                    if (email) {
                        const isDicembre = currentMonth === 12;
                        await sendEmail({
                            to: email,
                            subject: isDicembre
                                ? `Promemoria: Rinnovo Quota Sociale ${nextYear} entro il 31/12 - Adrenalina Club`
                                : `Apertura Rinnovi Quota Sociale ${nextYear} - Adrenalina Club`,
                            html: `<div style="font-family: sans-serif; background-color: #0e0e0e; color: #fff; padding: 25px; border-left: 5px solid #df293e;">
                                    <h2 style="color: #df293e;">ADRENALINA CLUB</h2>
                                    <p>Ciao ${socio.anagrafiche.nome}, ti ricordiamo che dal <strong>1° Novembre</strong> sono aperti i rinnovi della quota associativa annuale per l'anno <strong>${nextYear}</strong>.</p>
                                    <p>La tua iscrizione è a tempo indeterminato, ma la quota di rinnovo annuale va saldata entro il <strong>31 Dicembre</strong> per evitare lo stato di morosità (dal 1° Gennaio il Consiglio Direttivo potrà deliberare la decadenza dallo status di socio).</p>
                                    <p>Accedi alla tua dashboard su <a href="https://portal.adrenalinaclub.it" style="color: #df293e;">portal.adrenalinaclub.it</a> per completare il rinnovo online.</p>
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

        // 4. DIGEST GIORNALIERO REGISTRO APPROVAZIONI & PULIZIA RECUPERO PASSWORD
        try {
            await runApprovalDigest(supabase);
        } catch (digestErr) {
            console.warn('[CRON DIGEST] Errore durante elaborazione digest approvazioni:', digestErr.message);
        }

        return res.status(200).json({ success: true, processed: true });
    } catch (error) {
        console.error("Cron handler error:", error);
        return res.status(500).json({ error: 'Errore interno del server.' });
    }
}
