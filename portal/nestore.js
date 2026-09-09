// ===========================================================================
// NESTORE PORTAL JAVASCRIPT
// Assistente AI Sportivo & Nutrizionale per Atleti Corsi Adrenalina
// ===========================================================================

const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentSession = null;
let currentUserProfile = null;
let userPreferenze = { conferma_preventiva: true, calorie_target: 2200 };
let currentAttachedImage = null; // { base64, mimeType, name }
let speechRecognizer = null;
let isRecordingVoice = false;

// Sanitizzazione HTML per sicurezza
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Navigazione: torna alla dashboard principale
function tornaAdAdrenalina() {
    if (window.opener) {
        window.opener.focus();
        window.close();
    } else {
        window.location.href = "dashboard.html";
    }
}

// Inizializzazione al caricamento
document.addEventListener('DOMContentLoaded', () => {
    initNestore();
    inizializzaRiconoscimentoVocale();
});

// Inizializzazione Principale
async function initNestore() {
    try {
        // 1. Recupera Sessione Utente
        const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
        if (sessionErr || !session) {
            console.warn("Nessuna sessione attiva. Redirect a login...");
            window.location.href = "login.html?redirect=nestore";
            return;
        }

        currentSession = session;
        currentUser = session.user;

        // 2. Controllo Impersonificazione Admin (Modalità Assistenza)
        const urlParams = new URLSearchParams(window.location.search);
        const impersonateId = urlParams.get('impersonate_id');

        // Carica anagrafica utente
        let { data: profile, error: profErr } = await supabaseClient
            .from('utenti')
            .select('id, nome, cognome, ruolo, anagrafiche(id, registro_approvazioni(stato))')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (profErr || !profile) {
            console.error("Errore caricamento profilo:", profErr);
            window.location.href = "dashboard.html?nestore_blocked=1";
            return;
        }

        const isAuthorizedAdmin = Array.isArray(profile.ruolo) && profile.ruolo.some(r => ['presidente', 'vice_presidente'].includes(r));
        const isBoardMember = Array.isArray(profile.ruolo) && profile.ruolo.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
        
        let isIstruttore = false;
        if (!isBoardMember && profile.anagrafiche && profile.anagrafiche.length > 0) {
            try {
                const anagId = profile.anagrafiche[0].id;
                const { data: istrData } = await supabaseClient
                    .from('registro_istruttori')
                    .select('id')
                    .eq('anagrafica_id', anagId)
                    .maybeSingle();
                if (istrData) isIstruttore = true;
            } catch (e) {
                console.error("Errore verifica istruttore in nestore:", e);
            }
        }

        const hasUnconditionalAccess = isBoardMember || isIstruttore;

        if (impersonateId && isAuthorizedAdmin) {
            currentUser = { ...currentUser, id: impersonateId };
            const { data: targetProfile } = await supabaseClient
                .from('utenti')
                .select('id, nome, cognome, ruolo')
                .eq('id', impersonateId)
                .maybeSingle();
            if (targetProfile) profile = targetProfile;
        }

        currentUserProfile = profile;
        const nomeCompleto = `${profile.nome || ''} ${profile.cognome || ''}`.trim() || 'Atleta';
        document.getElementById('nst-user-name').textContent = nomeCompleto;

        // Predisposizione View Switcher per Admin / Coach (Fase 2)
        if (hasUnconditionalAccess) {
            const switcher = document.getElementById('nst-view-switcher');
            if (switcher) switcher.classList.remove('nst-hidden');
        }

        // 3. Verifica Corso Continuativo Attivo
        const oggi = new Date().toISOString().split('T')[0];
        const { data: iscrizioni, error: iscrErr } = await supabaseClient
            .from('iscrizioni_eventi')
            .select('id, data_scadenza_corso, stato_pagamento, ingressi_totali, ingressi_usati, eventi!inner(id, titolo, tipo)')
            .eq('utente_id', currentUser.id)
            .eq('eventi.tipo', 'corso')
            .in('stato_pagamento', ['PAGATO', 'GRATUITO']);

        if (iscrErr) {
            console.error("Errore verifica iscrizioni:", iscrErr);
        }

        const corsiValidi = (iscrizioni || []).filter(isc => {
            if (isc.data_scadenza_corso) return isc.data_scadenza_corso >= oggi;
            if (isc.ingressi_totali) return (isc.ingressi_usati || 0) < isc.ingressi_totali;
            return false;
        });

        // Se non ha accesso incondizionato e non ha corsi validi, blocca l'accesso
        if (!hasUnconditionalAccess && corsiValidi.length === 0) {
            console.warn("Utente senza corsi continuativi attivi. Reindirizzamento...");
            window.location.href = "dashboard.html?nestore_blocked=1";
            return;
        }

        if (corsiValidi.length > 0) {
            const nomeCorso = corsiValidi[0].eventi?.titolo || 'CORSO ATTIVO';
            document.getElementById('nst-user-course').textContent = nomeCorso.toUpperCase();
        } else {
            let labelText = 'MODALITÀ ADMIN';
            if (!isAuthorizedAdmin) {
                labelText = isIstruttore ? 'ISTRUTTORE' : 'DIRETTIVO';
            }
            document.getElementById('nst-user-course').textContent = labelText;
        }

        // 4. Carica Preferenze Utente
        await caricaPreferenze();

        // 5. Carica KPI Dashboard
        await caricaKpiDashboard();

        // 6. Carica Cronologia Chat
        await caricaCronologiaChat();

    } catch (err) {
        console.error("Errore inizializzazione Nestore:", err);
    }
}

// ---------------------------------------------------------------------------
// GESTIONE PREFERENZE (Salvataggio Diretto vs Controllo Preventivo)
// ---------------------------------------------------------------------------
async function caricaPreferenze() {
    try {
        const { data, error } = await supabaseClient
            .from('nestore_preferenze')
            .select('*')
            .eq('utente_id', currentUser.id)
            .maybeSingle();

        if (error) {
            console.warn("Errore caricamento preferenze:", error);
            return;
        }

        if (data) {
            userPreferenze = data;
            const toggle = document.getElementById('nst-pref-conferma');
            if (toggle) toggle.checked = !!data.conferma_preventiva;
        } else {
            // Crea record predefinito
            const defaultPref = {
                utente_id: currentUser.id,
                conferma_preventiva: true,
                calorie_target: 2200
            };
            await supabaseClient.from('nestore_preferenze').insert(defaultPref);
            userPreferenze = defaultPref;
        }
    } catch (e) {
        console.error("Eccezione preferenze:", e);
    }
}

async function aggiornaPreferenzaConferma(valore) {
    userPreferenze.conferma_preventiva = valore;
    try {
        await supabaseClient
            .from('nestore_preferenze')
            .upsert({
                utente_id: currentUser.id,
                conferma_preventiva: valore,
                aggiornato_il: new Date().toISOString()
            });
    } catch (e) {
        console.error("Errore salvataggio preferenza:", e);
    }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GESTIONE GRAFICI DASHBOARD (Chart.js) & FILTRI TEMPORALI
// ---------------------------------------------------------------------------
let chartPesoInstance = null;
let chartAllenamentiInstance = null;
let chartDietaInstance = null;

const rangeFiltri = {
    peso: '30',
    allenamenti: '30',
    dieta: '30'
};

function calcolaDataInizio(rangeStr) {
    if (rangeStr === 'ALL') return null;
    const giorni = parseInt(rangeStr, 10) || 30;
    const d = new Date();
    d.setDate(d.getDate() - giorni);
    return d.toISOString().split('T')[0];
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
}

async function impostaRangeCard(tipo, range) {
    rangeFiltri[tipo] = range;
    
    // Aggiorna classe active sui chip
    const chipContainer = document.getElementById(`nst-chips-${tipo}`);
    if (chipContainer) {
        chipContainer.querySelectorAll('.nst-time-chip').forEach(btn => {
            if (btn.getAttribute('data-range') === range) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    if (tipo === 'peso') await renderGraficoPesiMisure();
    else if (tipo === 'allenamenti') await renderGraficoAllenamenti();
    else if (tipo === 'dieta') await renderGraficoDieta();
}

async function caricaKpiDashboard() {
    await Promise.all([
        renderGraficoPesiMisure(),
        renderGraficoAllenamenti(),
        renderGraficoDieta()
    ]);
}

async function renderGraficoPesiMisure() {
    try {
        let query = supabaseClient
            .from('nestore_pesi_misure')
            .select('*')
            .eq('utente_id', currentUser.id)
            .eq('attivo', true);

        const dataInizio = calcolaDataInizio(rangeFiltri.peso);
        if (dataInizio) {
            query = query.gte('data_rilevazione', dataInizio);
        }

        const { data, error } = await query
            .order('data_rilevazione', { ascending: true })
            .order('creato_il', { ascending: true });

        const emptyMsg = document.getElementById('nst-empty-peso');

        if (error || !data || data.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove('nst-hidden');
            if (chartPesoInstance) {
                chartPesoInstance.destroy();
                chartPesoInstance = null;
            }
            document.getElementById('nst-current-weight').textContent = '--';
            document.getElementById('nst-peso-delta').textContent = 'N/D';
            document.getElementById('nst-vita-val').textContent = '--';
            document.getElementById('nst-torace-val').textContent = '--';
            document.getElementById('nst-braccio-val').textContent = '--';
            return;
        }

        if (emptyMsg) emptyMsg.classList.add('nst-hidden');

        // Aggiorna riassunto ultimo peso & delta
        const ultimo = data[data.length - 1];
        document.getElementById('nst-current-weight').textContent = ultimo.peso_kg ? Number(ultimo.peso_kg).toFixed(1) : '--';
        document.getElementById('nst-vita-val').textContent = ultimo.vita_cm ? `${ultimo.vita_cm}cm` : '--';
        document.getElementById('nst-torace-val').textContent = ultimo.torace_cm ? `${ultimo.torace_cm}cm` : '--';
        document.getElementById('nst-braccio-val').textContent = ultimo.braccio_dx_cm ? `${ultimo.braccio_dx_cm}cm` : '--';

        const deltaEl = document.getElementById('nst-peso-delta');
        if (data.length > 1) {
            const penultimo = data[data.length - 2];
            if (ultimo.peso_kg && penultimo.peso_kg) {
                const diff = (Number(ultimo.peso_kg) - Number(penultimo.peso_kg)).toFixed(1);
                if (diff > 0) {
                    deltaEl.className = 'nst-kpi-delta nst-delta-up';
                    deltaEl.textContent = `+${diff} kg`;
                } else if (diff < 0) {
                    deltaEl.className = 'nst-kpi-delta nst-delta-down';
                    deltaEl.textContent = `${diff} kg`;
                } else {
                    deltaEl.className = 'nst-kpi-delta nst-delta-neutral';
                    deltaEl.textContent = `= 0 kg`;
                }
            } else {
                deltaEl.className = 'nst-kpi-delta nst-delta-neutral';
                deltaEl.textContent = '1ª RIL.';
            }
        } else {
            deltaEl.className = 'nst-kpi-delta nst-delta-neutral';
            deltaEl.textContent = '1ª RIL.';
        }

        // Prepara dati Chart.js
        const labels = data.map(d => formatDateShort(d.data_rilevazione));
        const pesi = data.map(d => d.peso_kg ? Number(d.peso_kg) : null);
        const vite = data.map(d => d.vita_cm ? Number(d.vita_cm) : null);
        const toraci = data.map(d => d.torace_cm ? Number(d.torace_cm) : null);
        const braccia = data.map(d => d.braccio_dx_cm ? Number(d.braccio_dx_cm) : null);

        const canvas = document.getElementById('nst-chart-peso');
        if (!canvas || typeof Chart === 'undefined') return;

        if (chartPesoInstance) {
            chartPesoInstance.destroy();
        }

        chartPesoInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Peso (kg)',
                        data: pesi,
                        borderColor: '#00e5ff',
                        backgroundColor: 'rgba(0, 229, 255, 0.1)',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#00e5ff',
                        tension: 0.25,
                        yAxisID: 'yPeso',
                        spanGaps: true
                    },
                    {
                        label: 'Vita (cm)',
                        data: vite,
                        borderColor: '#76ff03',
                        backgroundColor: 'transparent',
                        borderWidth: 1.8,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#76ff03',
                        tension: 0.25,
                        yAxisID: 'yMisure',
                        spanGaps: true
                    },
                    {
                        label: 'Torace (cm)',
                        data: toraci,
                        borderColor: '#ffd600',
                        backgroundColor: 'transparent',
                        borderWidth: 1.8,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#ffd600',
                        tension: 0.25,
                        yAxisID: 'yMisure',
                        spanGaps: true
                    },
                    {
                        label: 'Braccio (cm)',
                        data: braccia,
                        borderColor: '#e040fb',
                        backgroundColor: 'transparent',
                        borderWidth: 1.8,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#e040fb',
                        tension: 0.25,
                        yAxisID: 'yMisure',
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            boxWidth: 8,
                            boxHeight: 8,
                            padding: 6,
                            font: { size: 9, family: "'Orbitron', sans-serif" }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(6, 12, 24, 0.95)',
                        titleColor: '#00e5ff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(0, 229, 255, 0.3)',
                        borderWidth: 1,
                        padding: 8,
                        titleFont: { family: "'Orbitron', sans-serif", size: 10 },
                        bodyFont: { size: 10 }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 45 }
                    },
                    yPeso: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: {
                            color: '#00e5ff',
                            font: { size: 9 },
                            callback: v => v + 'kg'
                        }
                    },
                    yMisure: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            color: '#76ff03',
                            font: { size: 9 },
                            callback: v => v + 'cm'
                        }
                    }
                }
            }
        });

        // Genera Tabella Storico Pesi
        const tbody = document.getElementById('nst-tbody-peso');
        if (tbody) {
            tbody.innerHTML = '';
            // Iteriamo all'incontrario per avere il più recente in cima
            for (let i = data.length - 1; i >= 0; i--) {
                const item = data[i];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateShort(item.data_rilevazione)}</td>
                    <td style="color: var(--nst-cyan); font-weight: 600;">${item.peso_kg ? Number(item.peso_kg).toFixed(1) : '-'}</td>
                    <td>${item.vita_cm || '-'}</td>
                    <td>${item.torace_cm || '-'}</td>
                    <td>${item.braccio_dx_cm || '-'}</td>
                `;
                tbody.appendChild(tr);
            }
        }

    } catch (e) {
        console.error("Errore grafico pesi e misure:", e);
    }
}

async function renderGraficoAllenamenti() {
    try {
        let query = supabaseClient
            .from('nestore_allenamenti')
            .select('*')
            .eq('utente_id', currentUser.id)
            .eq('attivo', true);

        const dataInizio = calcolaDataInizio(rangeFiltri.allenamenti);
        if (dataInizio) {
            query = query.gte('data_allenamento', dataInizio);
        }

        const { data, error } = await query
            .order('data_allenamento', { ascending: true });

        const emptyMsg = document.getElementById('nst-empty-allenamenti');

        if (error || !data || data.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove('nst-hidden');
            if (chartAllenamentiInstance) {
                chartAllenamentiInstance.destroy();
                chartAllenamentiInstance = null;
            }
            document.getElementById('nst-training-count').textContent = '0 sessioni nel periodo';
            document.getElementById('nst-last-workout-name').textContent = 'Nessuna sessione';
            return;
        }

        if (emptyMsg) emptyMsg.classList.add('nst-hidden');

        // Aggiorna riassunto
        document.getElementById('nst-training-count').textContent = `${data.length} session${data.length === 1 ? 'e' : 'i'} registrat${data.length === 1 ? 'a' : 'e'}`;
        const ultimo = data[data.length - 1];
        document.getElementById('nst-last-workout-name').textContent = `${formatDateShort(ultimo.data_allenamento)}: ${(ultimo.corso_disciplina || 'Workout').toUpperCase()}`;

        // Prepara serie temporale (data e presenza/durata)
        const labels = data.map(a => formatDateShort(a.data_allenamento));
        const durate = data.map(a => a.durata_minuti ? Number(a.durata_minuti) : 60);

        const canvas = document.getElementById('nst-chart-allenamenti');
        if (!canvas || typeof Chart === 'undefined') return;

        if (chartAllenamentiInstance) {
            chartAllenamentiInstance.destroy();
        }

        chartAllenamentiInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sessione Svolta (min)',
                    data: durate,
                    borderColor: '#76ff03',
                    backgroundColor: 'rgba(118, 255, 3, 0.12)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#76ff03',
                    pointBorderColor: '#060c18',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(6, 12, 24, 0.95)',
                        titleColor: '#76ff03',
                        bodyColor: '#fff',
                        borderColor: 'rgba(118, 255, 3, 0.3)',
                        borderWidth: 1,
                        padding: 8,
                        titleFont: { family: "'Orbitron', sans-serif", size: 10 },
                        bodyFont: { size: 10 },
                        callbacks: {
                            label: function(ctx) {
                                const item = data[ctx.dataIndex];
                                const disc = item.corso_disciplina || 'Workout';
                                const dur = item.durata_minuti ? `${item.durata_minuti} min` : '';
                                const rpe = item.rpe_fatica ? `RPE ${item.rpe_fatica}/10` : '';
                                return [disc, [dur, rpe].filter(Boolean).join(' • ')].filter(Boolean);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 45 }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: {
                            color: '#76ff03',
                            font: { size: 9 },
                            callback: v => v + 'm'
                        },
                        suggestedMin: 0
                    }
                }
            }
        });

        // Genera Tabella Storico Allenamenti
        const tbody = document.getElementById('nst-tbody-allenamenti');
        if (tbody) {
            tbody.innerHTML = '';
            for (let i = data.length - 1; i >= 0; i--) {
                const item = data[i];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateShort(item.data_allenamento)}</td>
                    <td style="color: var(--nst-lime); font-weight: 600;">${(item.corso_disciplina || 'Workout').toUpperCase()}</td>
                    <td>${item.durata_minuti || '-'}</td>
                    <td>${item.rpe_fatica ? item.rpe_fatica + '/10' : '-'}</td>
                    <td style="max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.note || '')}">${escapeHtml(item.note || '')}</td>
                `;
                tbody.appendChild(tr);
            }
        }

    } catch (e) {
        console.error("Errore grafico allenamenti:", e);
    }
}

async function renderGraficoDieta() {
    try {
        let query = supabaseClient
            .from('nestore_pasti')
            .select('*')
            .eq('utente_id', currentUser.id)
            .eq('attivo', true);

        const dataInizio = calcolaDataInizio(rangeFiltri.dieta);
        if (dataInizio) {
            query = query.gte('data_pasto', dataInizio);
        }

        const { data, error } = await query
            .order('data_pasto', { ascending: true });

        const emptyMsg = document.getElementById('nst-empty-dieta');

        if (error || !data || data.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove('nst-hidden');
            if (chartDietaInstance) {
                chartDietaInstance.destroy();
                chartDietaInstance = null;
            }
            document.getElementById('nst-kcal-val').textContent = '0';
            document.getElementById('nst-macro-pro').textContent = '0g';
            document.getElementById('nst-macro-carb').textContent = '0g';
            document.getElementById('nst-macro-fat').textContent = '0g';
            return;
        }

        if (emptyMsg) emptyMsg.classList.add('nst-hidden');

        // Aggregazione per data
        const aggregati = {};
        const oggi = new Date().toISOString().split('T')[0];
        let totKcalOggi = 0, totProOggi = 0, totCarbOggi = 0, totFatOggi = 0;

        data.forEach(p => {
            const d = p.data_pasto;
            if (!aggregati[d]) {
                aggregati[d] = {
                    proG: 0,
                    carbG: 0,
                    fatG: 0,
                    proKcal: 0,
                    carbKcal: 0,
                    fatKcal: 0
                };
            }
            const pro = Number(p.proteine_g || 0);
            const carb = Number(p.carboidrati_g || 0);
            const fat = Number(p.grassi_g || 0);

            aggregati[d].proG += pro;
            aggregati[d].carbG += carb;
            aggregati[d].fatG += fat;
            aggregati[d].proKcal += pro * 4;
            aggregati[d].carbKcal += carb * 4;
            aggregati[d].fatKcal += fat * 9;

            if (d === oggi) {
                totProOggi += pro;
                totCarbOggi += carb;
                totFatOggi += fat;
                totKcalOggi += Number(p.calorie_stimate || (pro * 4 + carb * 4 + fat * 9));
            }
        });

        // Aggiorna riassunto oggi
        document.getElementById('nst-kcal-val').textContent = totKcalOggi.toFixed(0);
        document.getElementById('nst-macro-pro').textContent = `${totProOggi.toFixed(0)}g`;
        document.getElementById('nst-macro-carb').textContent = `${totCarbOggi.toFixed(0)}g`;
        document.getElementById('nst-macro-fat').textContent = `${totFatOggi.toFixed(0)}g`;

        // Date ordinate
        const dateOrdinate = Object.keys(aggregati).sort();
        const labels = dateOrdinate.map(d => formatDateShort(d));
        const serieCarb = dateOrdinate.map(d => Math.round(aggregati[d].carbKcal));
        const seriePro = dateOrdinate.map(d => Math.round(aggregati[d].proKcal));
        const serieFat = dateOrdinate.map(d => Math.round(aggregati[d].fatKcal));

        const canvas = document.getElementById('nst-chart-dieta');
        if (!canvas || typeof Chart === 'undefined') return;

        if (chartDietaInstance) {
            chartDietaInstance.destroy();
        }

        chartDietaInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Carboidrati (kcal)',
                        data: serieCarb,
                        backgroundColor: '#ffb300', // Amber
                        stack: 'macro',
                        borderRadius: 2
                    },
                    {
                        label: 'Proteine (kcal)',
                        data: seriePro,
                        backgroundColor: '#00e5ff', // Cyan
                        stack: 'macro',
                        borderRadius: 2
                    },
                    {
                        label: 'Grassi (kcal)',
                        data: serieFat,
                        backgroundColor: '#76ff03', // Lime
                        stack: 'macro',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            boxWidth: 8,
                            boxHeight: 8,
                            padding: 6,
                            font: { size: 9, family: "'Orbitron', sans-serif" }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(6, 12, 24, 0.95)',
                        titleColor: '#ffb300',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255, 179, 0, 0.3)',
                        borderWidth: 1,
                        padding: 8,
                        titleFont: { family: "'Orbitron', sans-serif", size: 10 },
                        bodyFont: { size: 10 },
                        callbacks: {
                            footer: function(tooltipItems) {
                                let sum = 0;
                                tooltipItems.forEach(ti => { sum += ti.parsed.y; });
                                return `Totale: ${sum} kcal`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 45 }
                    },
                    y: {
                        stacked: true,
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 9 },
                            callback: v => v + ' kcal'
                        }
                    }
                }
            }
        });

        // Genera Tabella Storico Pasti
        const tbody = document.getElementById('nst-tbody-dieta');
        if (tbody) {
            tbody.innerHTML = '';
            for (let i = data.length - 1; i >= 0; i--) {
                const item = data[i];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateShort(item.data_pasto)}</td>
                    <td style="color: #f59e0b; font-weight: 600; text-transform: capitalize;">${escapeHtml(item.tipo_pasto || '-')}</td>
                    <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.descrizione || '')}">${escapeHtml(item.descrizione || '')}</td>
                    <td>${item.calorie_stimate || '-'}</td>
                    <td style="font-size: 10px; color: var(--nst-text-muted);">
                        <span style="color: var(--nst-cyan);">${item.proteine_g || 0}</span> / 
                        <span style="color: var(--nst-amber);">${item.carboidrati_g || 0}</span> / 
                        <span style="color: var(--nst-lime);">${item.grassi_g || 0}</span>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        }

    } catch (e) {
        console.error("Errore grafico dieta:", e);
    }
}

// ---------------------------------------------------------------------------
// GESTIONE CHAT
// ---------------------------------------------------------------------------
async function caricaCronologiaChat() {
    const container = document.getElementById('nst-chat-messages');
    container.innerHTML = '';

    try {
        const { data, error } = await supabaseClient
            .from('nestore_chat_messaggi')
            .select('*')
            .eq('utente_id', currentUser.id)
            .order('creato_il', { ascending: true })
            .limit(40);

        if (error) {
            console.error("Errore caricamento cronologia chat:", error);
        }

        if (!data || data.length === 0) {
            // Messaggio di benvenuto se prima conversazione
            renderMessaggioUI({
                ruolo: 'assistant',
                contenuto: `Ciao ${currentUserProfile?.nome || 'Atleta'}! Sono **NESTORE**, il tuo assistente sportivo e nutrizionale ad Adrenalina Club.\n\nPuoi parlarmi a voce con il microfono, scrivermi o mandarmi la foto di un piatto o della tua scheda.\n\nEsempi di cosa posso fare:\n- *"Oggi peso 79.4 kg e la vita misura 84 cm"*\n- *"A pranzo ho mangiato 120g di pasta al pomodoro e 150g di petto di pollo"*\n- *"Oggi allenamento Strongman: log press 4x6 a 70kg e deadlift"*`,
                creato_il: new Date().toISOString()
            });
        } else {
            data.forEach(m => renderMessaggioUI(m));
        }

        scrollChatToBottom();
    } catch (e) {
        console.error("Eccezione cronologia chat:", e);
    }
}

function renderMessaggioUI(msg) {
    const container = document.getElementById('nst-chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `nst-msg ${msg.ruolo === 'user' ? 'user' : 'assistant'}`;

    // Foto allegata se presente
    let imgHtml = '';
    if (msg.foto_url) {
        imgHtml = `<img src="${escapeHtml(msg.foto_url)}" alt="Allegato" class="nst-msg-img">`;
    }

    // Formattazione testo (supporto base grassetto e a capo)
    let formattato = escapeHtml(msg.contenuto)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    // Ora
    const oraStr = new Date(msg.creato_il || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msgDiv.innerHTML = `
        ${imgHtml}
        <div>${formattato}</div>
        <span class="nst-msg-time">${oraStr}</span>
    `;

    // Se il messaggio contiene una proposta di estrazione non ancora salvata
    if (msg.metadata && msg.metadata.dati_estratti && !msg.metadata.salvato) {
        renderCardConfermaInMessage(msgDiv, msg.metadata.dati_estratti, msg.id);
    }

    container.appendChild(msgDiv);
    scrollChatToBottom();
}

function scrollChatToBottom() {
    const container = document.getElementById('nst-chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// ---------------------------------------------------------------------------
// INVIO MESSAGGIO E CHIAMATA LLM API
// ---------------------------------------------------------------------------
async function inviaMessaggioChat() {
    const input = document.getElementById('nst-chat-input');
    const sendBtn = document.getElementById('nst-send-btn');
    const testo = input.value.trim();
    const allegato = currentAttachedImage;

    if (!testo && !allegato) return;

    // Disabilita UI
    input.value = '';
    sendBtn.disabled = true;

    // Render immediato messaggio utente in chat
    renderMessaggioUI({
        ruolo: 'user',
        contenuto: testo || '(Foto allegata)',
        foto_url: allegato ? allegato.base64 : null,
        creato_il: new Date().toISOString()
    });

    rimuoviFotoAllegata();

    // Placeholder di risposta in attesa
    const container = document.getElementById('nst-chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'nst-msg assistant';
    loadingDiv.id = 'nst-msg-loading';
    loadingDiv.innerHTML = `<div><span class="nst-loader-inline"></span> Nestore sta analizzando...</div>`;
    container.appendChild(loadingDiv);
    scrollChatToBottom();

    try {
        // Chiamata all'API Serverless Vercel
        const response = await fetch('/api/nestore-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({
                message: testo,
                image_base64: allegato ? allegato.base64 : null,
                image_mime: allegato ? allegato.mimeType : null,
                conferma_preventiva: !!userPreferenze.conferma_preventiva
            })
        });

        // Rimuovi loading
        const loader = document.getElementById('nst-msg-loading');
        if (loader) loader.remove();

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            renderMessaggioUI({
                ruolo: 'assistant',
                contenuto: errData.error || "Si è verificato un errore di connessione con Nestore. Riprova tra poco.",
                creato_il: new Date().toISOString()
            });
            return;
        }

        const data = await response.json();

        // Render risposta
        renderMessaggioUI({
            id: data.messaggio_id,
            ruolo: 'assistant',
            contenuto: data.reply || "Dati ricevuti!",
            metadata: data.extraction_payload ? { dati_estratti: data.extraction_payload, salvato: data.salvato_direttamente } : null,
            creato_il: new Date().toISOString()
        });

        // Se salvataggio diretto o estrazione completata, ricarica i KPI
        if (data.salvato_direttamente) {
            await caricaKpiDashboard();
        }

    } catch (err) {
        console.error("Errore invio chat:", err);
        const loader = document.getElementById('nst-msg-loading');
        if (loader) loader.remove();

        renderMessaggioUI({
            ruolo: 'assistant',
            contenuto: "Errore di comunicazione con il server. Verifica la connessione.",
            creato_il: new Date().toISOString()
        });
    } finally {
        sendBtn.disabled = false;
        input.focus();
    }
}

function gestisciInvioTasto(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        inviaMessaggioChat();
    }
}

// ---------------------------------------------------------------------------
// CARD DI CONFERMA DATI (Q3: Controllo Preventivo)
// ---------------------------------------------------------------------------
function renderCardConfermaInMessage(msgDiv, payload, messaggioId) {
    const card = document.createElement('div');
    card.className = 'nst-confirm-card';

    let titolo = 'REGISTRAZIONE DATI';
    let dettagliHtml = '';

    if (payload.tipo === 'peso_misure') {
        titolo = '⚖️ RILEVAZIONE PESO E MISURE';
        if (payload.peso_kg) dettagliHtml += `<div class="nst-confirm-row"><span>Peso:</span><strong>${payload.peso_kg} kg</strong></div>`;
        if (payload.vita_cm) dettagliHtml += `<div class="nst-confirm-row"><span>Vita:</span><strong>${payload.vita_cm} cm</strong></div>`;
        if (payload.torace_cm) dettagliHtml += `<div class="nst-confirm-row"><span>Torace:</span><strong>${payload.torace_cm} cm</strong></div>`;
        if (payload.braccio_dx_cm) dettagliHtml += `<div class="nst-confirm-row"><span>Braccio:</span><strong>${payload.braccio_dx_cm} cm</strong></div>`;
    } else if (payload.tipo === 'pasto') {
        titolo = '🥗 REGISTRAZIONE PASTO';
        dettagliHtml += `<div class="nst-confirm-row"><span>Descrizione:</span><strong>${escapeHtml(payload.descrizione)}</strong></div>`;
        if (payload.calorie) dettagliHtml += `<div class="nst-confirm-row"><span>Calorie:</span><strong>~${payload.calorie} kcal</strong></div>`;
        if (payload.proteine) dettagliHtml += `<div class="nst-confirm-row"><span>Macro (P/C/G):</span><strong>${payload.proteine}g / ${payload.carboidrati || 0}g / ${payload.grassi || 0}g</strong></div>`;
    } else if (payload.tipo === 'allenamento') {
        titolo = '🏋️ REGISTRAZIONE ALLENAMENTO';
        dettagliHtml += `<div class="nst-confirm-row"><span>Disciplina:</span><strong>${escapeHtml(payload.disciplina || 'Generale')}</strong></div>`;
        if (payload.durata_minuti) dettagliHtml += `<div class="nst-confirm-row"><span>Durata:</span><strong>${payload.durata_minuti} min</strong></div>`;
        if (payload.rpe) dettagliHtml += `<div class="nst-confirm-row"><span>Intensità RPE:</span><strong>${payload.rpe}/10</strong></div>`;
    }

    card.innerHTML = `
        <div class="nst-confirm-header">${titolo}</div>
        ${dettagliHtml}
        <div class="nst-confirm-actions">
            <button type="button" class="nst-btn-confirm" onclick="confermaESalvaDati(this, ${JSON.stringify(payload).replace(/"/g, '&quot;')}, '${messaggioId}')">CONFERMA E SALVA</button>
            <button type="button" class="nst-btn-cancel" onclick="annullaConfermaDati(this)">ANNULLA</button>
        </div>
    `;

    msgDiv.appendChild(card);
}

async function confermaESalvaDati(btn, payload, messaggioId) {
    btn.disabled = true;
    btn.textContent = 'Salvataggio in corso...';

    try {
        const oggi = new Date().toISOString().split('T')[0];

        if (payload.tipo === 'peso_misure') {
            await supabaseClient.from('nestore_pesi_misure').insert({
                utente_id: currentUser.id,
                data_rilevazione: payload.data || oggi,
                peso_kg: payload.peso_kg || null,
                vita_cm: payload.vita_cm || null,
                torace_cm: payload.torace_cm || null,
                collo_cm: payload.collo_cm || null,
                fianchi_cm: payload.fianchi_cm || null,
                braccio_dx_cm: payload.braccio_dx_cm || null,
                braccio_sx_cm: payload.braccio_sx_cm || null,
                coscia_dx_cm: payload.coscia_dx_cm || null,
                coscia_sx_cm: payload.coscia_sx_cm || null,
                note: payload.note || null
            });
        } else if (payload.tipo === 'pasto') {
            await supabaseClient.from('nestore_pasti').insert({
                utente_id: currentUser.id,
                data_pasto: payload.data || oggi,
                tipo_pasto: payload.tipo_pasto || 'pranzo',
                descrizione: payload.descrizione || 'Pasto',
                calorie_stimate: payload.calorie || null,
                proteine_g: payload.proteine || null,
                carboidrati_g: payload.carboidrati || null,
                grassi_g: payload.grassi || null
            });
        } else if (payload.tipo === 'allenamento') {
            await supabaseClient.from('nestore_allenamenti').insert({
                utente_id: currentUser.id,
                data_allenamento: payload.data || oggi,
                corso_disciplina: payload.disciplina || 'Generale',
                durata_minuti: payload.durata_minuti || null,
                scheda_dati: payload.esercizi || [],
                rpe_fatica: payload.rpe || null,
                note: payload.note || null
            });
        }

        // Aggiorna metadata del messaggio
        if (messaggioId) {
            await supabaseClient
                .from('nestore_chat_messaggi')
                .update({ metadata: { salvato: true } })
                .eq('id', messaggioId);
        }

        btn.parentElement.innerHTML = `<span style="font-size:10px; color:var(--nst-lime); font-weight:bold; font-family:'Orbitron', sans-serif;">✓ DATI SALVATI CON SUCCESSO</span>`;
        await caricaKpiDashboard();

    } catch (err) {
        console.error("Errore salvataggio dati estratti:", err);
        btn.disabled = false;
        btn.textContent = 'ERRORE. RIPROVA';
    }
}

function annullaConfermaDati(btn) {
    const card = btn.closest('.nst-confirm-card');
    if (card) {
        card.innerHTML = `<span style="font-size:10px; color:var(--nst-text-muted); font-style:italic;">Operazione annullata.</span>`;
    }
}

// ---------------------------------------------------------------------------
// GESTIONE INPUT VOCALE (Web Speech API)
// ---------------------------------------------------------------------------
let testoBaseInputVocale = '';
let testoTrascrittoSessione = '';

function inizializzaRiconoscimentoVocale() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('nst-mic-btn');

    if (!SpeechRecognition) {
        console.info("Web Speech API non supportata da questo browser.");
        if (micBtn) micBtn.style.display = 'none';
        return;
    }

    try {
        speechRecognizer = new SpeechRecognition();
        speechRecognizer.lang = 'it-IT';
        speechRecognizer.continuous = true; // Ascolto continuo senza interruzione anticipata
        speechRecognizer.interimResults = false; // Opzione A: solo risultati consolidati (elimina eco e duplicazioni)

        speechRecognizer.onstart = () => {
            isRecordingVoice = true;
            testoTrascrittoSessione = '';
            if (micBtn) micBtn.classList.add('nst-recording');
        };

        speechRecognizer.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal || !speechRecognizer.interimResults) {
                    const chunk = (res[0] && res[0].transcript ? res[0].transcript : '').trim();
                    if (chunk) {
                        // Protezione anti-duplicazione per bug noti di Chrome/Android
                        if (!testoTrascrittoSessione.endsWith(chunk)) {
                            testoTrascrittoSessione = (testoTrascrittoSessione ? testoTrascrittoSessione + ' ' : '') + chunk;
                        }
                    }
                }
            }

            const input = document.getElementById('nst-chat-input');
            if (input) {
                const testoCompleto = [testoBaseInputVocale, testoTrascrittoSessione].filter(Boolean).join(' ');
                input.value = testoCompleto;
            }
        };

        speechRecognizer.onerror = (event) => {
            console.warn("Speech recognition error:", event.error);
            if (event.error !== 'no-speech') {
                isRecordingVoice = false;
                if (micBtn) micBtn.classList.remove('nst-recording');
            }
        };

        speechRecognizer.onend = () => {
            isRecordingVoice = false;
            if (micBtn) micBtn.classList.remove('nst-recording');
            const input = document.getElementById('nst-chat-input');
            if (input) {
                testoBaseInputVocale = input.value.trim();
            }
        };
    } catch (e) {
        console.error("Errore setup SpeechRecognition:", e);
    }
}

function toggleInputVocale() {
    if (!speechRecognizer) return;

    const micBtn = document.getElementById('nst-mic-btn');
    const input = document.getElementById('nst-chat-input');

    if (isRecordingVoice) {
        speechRecognizer.stop();
        isRecordingVoice = false;
        if (micBtn) micBtn.classList.remove('nst-recording');
        if (input) {
            testoBaseInputVocale = input.value.trim();
        }
    } else {
        try {
            if (input) {
                testoBaseInputVocale = input.value.trim();
            } else {
                testoBaseInputVocale = '';
            }
            testoTrascrittoSessione = '';
            speechRecognizer.start();
        } catch (e) {
            console.warn("Errore start SpeechRecognizer:", e);
        }
    }
}

// ---------------------------------------------------------------------------
// GESTIONE IMMAGINI ALLEGATE (Pasti / Schede)
// ---------------------------------------------------------------------------
function gestisciFileSelezionato(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Controllo che sia un'immagine
    if (!file.type.startsWith('image/')) {
        alert("Seleziona un'immagine valida (JPEG, PNG, WEBP).");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Ridimensiona con canvas a max 1024px per mantenere la chiamata API leggera e veloce
            const maxDim = 1024;
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);

            currentAttachedImage = {
                base64: compressedBase64,
                mimeType: 'image/jpeg',
                name: file.name
            };

            // Mostra anteprima UI
            const previewBar = document.getElementById('nst-image-preview-bar');
            const previewImg = document.getElementById('nst-preview-img');
            const previewName = document.getElementById('nst-preview-name');

            previewImg.src = compressedBase64;
            previewName.textContent = file.name;
            previewBar.classList.remove('nst-hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function rimuoviFotoAllegata() {
    currentAttachedImage = null;
    const previewBar = document.getElementById('nst-image-preview-bar');
    if (previewBar) previewBar.classList.add('nst-hidden');
    const fileInput = document.getElementById('nst-file-input');
    if (fileInput) fileInput.value = '';
}

// ---------------------------------------------------------------------------
// FORMATTAZIONE DATE
// ---------------------------------------------------------------------------
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
}

// Predisposizione cambio visualizzazione
function switchNestoreView(val) {
    console.log("Switch vista Nestore a:", val);
}

// ---------------------------------------------------------------------------
// GESTIONE PANNELLI SPA (Desktop Sidebar / Mobile Tabs)
// ---------------------------------------------------------------------------
function switchNestorePanel(panelId) {
    // Lista pannelli
    const panels = ['chat', 'peso', 'allenamenti', 'dieta'];
    
    panels.forEach(p => {
        // Nascondi / Mostra Main Panel
        const panelEl = document.getElementById(`nst-${p}-panel`);
        if (panelEl) {
            if (p === panelId) {
                panelEl.classList.remove('nst-hidden');
            } else {
                panelEl.classList.add('nst-hidden');
            }
        }
        
        // Aggiorna stato active su Desktop Sidebar
        const navItem = document.getElementById(`nst-nav-${p}`);
        if (navItem) {
            if (p === panelId) navItem.classList.add('active');
            else navItem.classList.remove('active');
        }

        // Aggiorna stato active su Mobile Tab Bar
        const tabBtn = document.getElementById(`nst-tab-btn-${p}`);
        if (tabBtn) {
            if (p === panelId) tabBtn.classList.add('active');
            else tabBtn.classList.remove('active');
        }
    });

    if (panelId === 'chat') {
        scrollChatToBottom();
    }
}

window.impostaRangeCard = impostaRangeCard;
window.switchNestorePanel = switchNestorePanel;
window.toggleInputVocale = toggleInputVocale;
