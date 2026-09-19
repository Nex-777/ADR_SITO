// ===========================================================================
// NESTORE PORTAL JAVASCRIPT
// Assistente AI Sportivo & Nutrizionale per Atleti Corsi Adrenalina
// ===========================================================================

const SUPABASE_URL = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.SUPABASE_URL : '';
const SUPABASE_KEY = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.SUPABASE_KEY : '';
const supabaseClient = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

let currentUser = null;
let currentSession = null;
let currentUserProfile = null;
let userPreferenze = { conferma_preventiva: true, calorie_target: 2200 };
let currentSchedaAtleta = null;
let currentAttachedImage = null; // { base64, mimeType, name }
let speechRecognizer = null;
let isRecordingVoice = false;
let currentUserPesoKg = null;
let currentUserPrList = null;

// Schema di serie predefinito per programmi di forza: ripetizioni per % sul massimale
const DEFAULT_FORZA_SERIE = [
    { rip: 10, pct: 60 },
    { rip: 5, pct: 70 },
    { rip: 3, pct: 80 },
    { rip: 1, pct: 90 },
    { rip: 1, pct: 100 }
];

// Sequenza specifica di riscaldamento standard (5 serie di salita carichi)
const DEFAULT_FORZA_WARMUP = [
    { rip: 10, pct: 75 },
    { rip: 5, pct: 80 },
    { rip: 3, pct: 85 },
    { rip: 1, pct: 95 },
    { rip: 1, pct: 100 }
];

// Gestore Screen Wake Lock API (mantiene lo schermo sempre acceso durante allenamento/timer)
const WakeLockManager = {
    sentinel: null,
    isActive: false,
    async request() {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
            try {
                this.sentinel = await navigator.wakeLock.request('screen');
                this.isActive = true;
                this.sentinel.addEventListener('release', () => {
                    this.isActive = false;
                    this.updateUI();
                });
                this.updateUI();
                return true;
            } catch (err) {
                console.warn('[WakeLock] Impossibile attivare il blocco schermo:', err);
                this.isActive = false;
                this.updateUI();
                return false;
            }
        }
        return false;
    },
    async release() {
        if (this.sentinel) {
            try {
                await this.sentinel.release();
            } catch (e) {
                // Ignore release errors
            }
            this.sentinel = null;
        }
        this.isActive = false;
        this.updateUI();
    },
    updateUI() {
        if (typeof document === 'undefined') return;
        const badge = document.getElementById('nst-wakelock-badge');
        if (badge) {
            if (this.isActive) {
                badge.classList.remove('nst-hidden');
            } else {
                badge.classList.add('nst-hidden');
            }
        }
    }
};

// Re-acquisizione automatica Wake Lock quando l'app torna visibile
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && typeof ibridoSelezionato !== 'undefined' && ibridoSelezionato) {
            const modal = document.getElementById('nst-ibrido-active-modal');
            if (modal && !modal.classList.contains('nst-hidden')) {
                await WakeLockManager.request();
            }
        }
    });
}

function toggleIbridoNoteInSession() {
    const box = document.getElementById('nst-ibrido-note-inline-box');
    const btnText = document.getElementById('nst-ibrido-note-toggle-text');
    if (!box) return;
    const isHidden = box.classList.contains('nst-hidden');
    if (isHidden) {
        box.classList.remove('nst-hidden');
        if (btnText) btnText.textContent = '▲ Chiudi Note';
        const textarea = document.getElementById('nst-ibrido-workout-note-inline');
        if (textarea) textarea.focus();
    } else {
        box.classList.add('nst-hidden');
        if (btnText) btnText.textContent = '📝 Note Sessione';
    }
}

// Stato Globale Vista Allenatore & Admin (Fase 2)
let currentNestoreView = 'athlete'; // 'athlete' | 'coach' | 'admin'
let isIstruttore = false;
let isAuthorizedAdmin = false;
let isBoardMember = false;
let coachCorsiAtleti = [];
let selectedCoachAtleta = null; // { id, nome, corsoTitolo, corsoId }
let selectedSchedaWordFile = null; // File object
let coachSubpanelActive = 'schede'; // 'schede' | 'peso' | 'allenamenti' | 'dieta' | 'profilo'

// Sanitizzazione HTML per sicurezza
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Cache in memoria per le schede (evita injection XSS tramite attributi HTML onclick)
const schedeCacheMap = new Map();

// Helper per verifica validità iscrizione corso
function isIscrizioneAttiva(isc, dataRif) {
    if (!isc) return false;
    const oggi = dataRif || new Date().toISOString().split('T')[0];
    if (isc.data_scadenza_corso) return isc.data_scadenza_corso >= oggi;
    if (isc.ingressi_totali) return (isc.ingressi_usati || 0) < isc.ingressi_totali;
    return false;
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
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initNestore();
        inizializzaRiconoscimentoVocale();
    });
}

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

        isAuthorizedAdmin = Array.isArray(profile.ruolo) && profile.ruolo.includes('presidente');
        isBoardMember = Array.isArray(profile.ruolo) && profile.ruolo.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
        
        isIstruttore = false;
        if (profile.anagrafiche && profile.anagrafiche.length > 0) {
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

        if (impersonateId && isAuthorizedAdmin) {
            currentUser = { ...currentUser, id: impersonateId };
            const { data: targetProfile } = await supabaseClient
                .from('utenti')
                .select('id, nome, cognome, ruolo, anagrafiche(id, registro_approvazioni(stato))')
                .eq('id', impersonateId)
                .maybeSingle();
            if (targetProfile) {
                profile = targetProfile;

                // Ricalcolo permessi per l'utente impersonato (simulazione al 100% dell'utente reale)
                isAuthorizedAdmin = Array.isArray(profile.ruolo) && profile.ruolo.includes('presidente');
                isBoardMember = Array.isArray(profile.ruolo) && profile.ruolo.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
                
                isIstruttore = false;
                if (profile.anagrafiche && profile.anagrafiche.length > 0) {
                    try {
                        const anagId = profile.anagrafiche[0].id;
                        const { data: istrData } = await supabaseClient
                            .from('registro_istruttori')
                            .select('id')
                            .eq('anagrafica_id', anagId)
                            .maybeSingle();
                        if (istrData) isIstruttore = true;
                    } catch (e) {
                        console.error("Errore verifica istruttore in nestore per utente impersonato:", e);
                    }
                }

                // Visualizzazione Banner Assistenza
                const banner = document.getElementById('nst-assistenza-banner');
                const bannerTargetNome = document.getElementById('nst-assistenza-target-nome');
                if (banner) {
                    banner.classList.remove('nst-hidden');
                    if (bannerTargetNome) {
                        const targetNome = `${profile.nome || ''} ${profile.cognome || ''}`.trim() || impersonateId;
                        bannerTargetNome.textContent = targetNome;
                    }
                }
            }
        }

        const hasUnconditionalAccess = isBoardMember || isIstruttore;

        currentUserProfile = profile;
        const nomeCompleto = `${profile.nome || ''} ${profile.cognome || ''}`.trim() || 'Atleta';
        document.getElementById('nst-user-name').textContent = nomeCompleto;

        // Configurazione Selettore Vista per Admin / Coach
        // Regola: sia allenatori che amministratori entrano in nestore dalla loro sezione personale Atleta,
        // e passano alle altre qualifiche tramite selettore.
        // - Atleta: visibile a tutti
        // - Allenatore: SOLO a chi è registrato in registro_istruttori
        // - Amministratore: SOLO al presidente
        const switcher = document.getElementById('nst-view-switcher');
        if (switcher) {
            switcher.innerHTML = '';
            
            const optAtleta = document.createElement('option');
            optAtleta.value = 'athlete';
            optAtleta.textContent = 'ATLETA';
            switcher.appendChild(optAtleta);

            if (isIstruttore) {
                const optCoach = document.createElement('option');
                optCoach.value = 'coach';
                optCoach.textContent = 'ALLENATORE';
                switcher.appendChild(optCoach);
            }

            if (isAuthorizedAdmin) {
                const optAdmin = document.createElement('option');
                optAdmin.value = 'admin';
                optAdmin.textContent = 'AMMINISTRATORE';
                switcher.appendChild(optAdmin);
            }

            switcher.value = 'athlete';
            if (switcher.options.length > 1) {
                switcher.classList.remove('nst-hidden');
            } else {
                switcher.classList.add('nst-hidden');
            }
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

        const corsiValidi = (iscrizioni || []).filter(isc => isIscrizioneAttiva(isc, oggi));

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

        // 5. Carica KPI Dashboard & Scheda Atleta
        await caricaKpiDashboard();
        await caricaSchedaAtletaUI();

        // 6. Carica Cronologia Chat & Catalogo Programmi Ibrido / Libreria
        await caricaCronologiaChat();
        await caricaLibreriaProgrammi();
        renderCatalogoIbrido();

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

        // Aggiorna indicatore altezza e banner
        const altValEl = document.getElementById('nst-altezza-val');
        const heightBanner = document.getElementById('nst-missing-height-banner');
        if (userPreferenze.altezza_cm) {
            if (altValEl) altValEl.textContent = userPreferenze.altezza_cm;
            if (heightBanner) heightBanner.classList.add('nst-hidden');
        } else {
            if (altValEl) altValEl.textContent = '--';
            if (heightBanner) heightBanner.classList.remove('nst-hidden');
        }

        // Aggiorna indicatore calorie target
        const targetValEl = document.getElementById('nst-target-val');
        if (targetValEl) {
            targetValEl.textContent = userPreferenze.calorie_target || 2200;
        }
    } catch (e) {
        console.error("Eccezione preferenze:", e);
    }
}

async function modificaTargetCalorie() {
    const curr = userPreferenze?.calorie_target || 2200;
    const nuovo = prompt("Imposta il tuo obiettivo calorico giornaliero (kcal):", curr);
    if (nuovo === null) return;
    const val = parseInt(nuovo, 10);
    if (!val || isNaN(val) || val < 800 || val > 6000) {
        alert("Inserisci un valore valido compreso tra 800 e 6000 kcal.");
        return;
    }

    try {
        userPreferenze.calorie_target = val;
        const targetEl = document.getElementById('nst-target-val');
        if (targetEl) targetEl.textContent = val;

        await supabaseClient
            .from('nestore_preferenze')
            .upsert({
                utente_id: currentUser.id,
                calorie_target: val,
                aggiornato_il: new Date().toISOString()
            });

        // Ricarica il grafico per aggiornare la linea verde del target
        await renderGraficoDieta();

        // Notifica o ricalcola scheda atleta per sincronizzare i target
        if (typeof aggiornaSchedaManuale === 'function') {
            aggiornaSchedaManuale().catch(() => {});
        }
    } catch (e) {
        console.error("Errore salvataggio target calorie:", e);
        alert("Errore durante il salvataggio del target calorico.");
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
// GESTIONE ALTEZZA & SCHEDA ATLETA WIKI (Karpathy Style)
// ---------------------------------------------------------------------------
async function salvaAltezzaRapida() {
    const input = document.getElementById('nst-input-altezza-quick');
    const altVal = parseFloat(input?.value);
    if (!altVal || isNaN(altVal) || altVal < 100 || altVal > 250) {
        alert("Inserisci un'altezza valida in cm (compresa tra 100 e 250 cm).");
        return;
    }
    try {
        const response = await fetch('/api/nestore-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ action: 'save_height', altezza_cm: altVal })
        });
        if (response.ok) {
            userPreferenze.altezza_cm = altVal;
            const altEl = document.getElementById('nst-altezza-val');
            if (altEl) altEl.textContent = altVal;
            const banner = document.getElementById('nst-missing-height-banner');
            if (banner) banner.classList.add('nst-hidden');
            await caricaSchedaAtletaUI();
        } else {
            const err = await response.json().catch(() => ({}));
            alert(err.error || "Errore nel salvataggio dell'altezza.");
        }
    } catch (e) {
        console.error("Errore salvataggio altezza:", e);
        alert("Errore di connessione. Riprova.");
    }
}

async function modificaAltezzaPrompt() {
    const curr = userPreferenze.altezza_cm || '';
    const val = prompt("Modifica la tua altezza in cm (es. 178):", curr);
    if (!val) return;
    const num = parseFloat(val);
    if (!num || isNaN(num) || num < 100 || num > 250) {
        alert("Altezza non valida. Inserisci un numero tra 100 e 250.");
        return;
    }
    const input = document.getElementById('nst-input-altezza-quick');
    if (input) input.value = num;
    await salvaAltezzaRapida();
}

async function caricaSchedaAtletaUI() {
    try {
        const { data, error } = await supabaseClient
            .from('nestore_scheda_atleta')
            .select('*')
            .eq('utente_id', currentUser.id)
            .maybeSingle();

        if (error) {
            console.warn("Errore recupero scheda atleta:", error);
            return;
        }

        if (!data) {
            // Se ancora non esiste, richiedi ricalcolo iniziale
            await aggiornaSchedaManuale();
            return;
        }

        currentSchedaAtleta = data;

        // Aggiorna Badge Versione & Data
        const vBadge = document.getElementById('nst-scheda-version-badge');
        if (vBadge) vBadge.textContent = `V${data.versione || 1}`;

        const upAt = document.getElementById('nst-wiki-updated-at');
        if (upAt && data.aggiornato_il) {
            const dt = new Date(data.aggiornato_il);
            upAt.textContent = `Aggiornato: ${dt.toLocaleDateString('it-IT')} ${dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
        }

        // 1. Biometria
        const bio = data.biometria || {};
        const etaEl = document.getElementById('nst-wiki-eta');
        if (etaEl) etaEl.textContent = bio.eta ? `${bio.eta} anni` : 'Non specificata';

        const sessoEl = document.getElementById('nst-wiki-sesso');
        if (sessoEl) sessoEl.textContent = bio.sesso || 'Non specificato';

        const altEl = document.getElementById('nst-wiki-altezza');
        if (altEl) altEl.textContent = bio.altezza_cm ? `${bio.altezza_cm} cm` : 'Non inserita';

        const pesoEl = document.getElementById('nst-wiki-peso');
        if (pesoEl) {
            let pTxt = bio.peso_kg ? `${bio.peso_kg} kg` : 'Nessuna pesata';
            if (bio.delta_30gg !== null && bio.delta_30gg !== undefined) {
                const sign = bio.delta_30gg > 0 ? `+${bio.delta_30gg}` : `${bio.delta_30gg}`;
                pTxt += ` (${sign} kg/30gg)`;
            }
            pesoEl.textContent = pTxt;
        }

        const bmiEl = document.getElementById('nst-wiki-bmi');
        if (bmiEl) bmiEl.textContent = bio.bmi ? `${bio.bmi} (${bio.bmi_categoria || ''})` : '--';

        const bmrEl = document.getElementById('nst-wiki-bmr');
        if (bmrEl) bmrEl.textContent = bio.bmr ? `~${bio.bmr} kcal/die` : '--';

        const tdeeEl = document.getElementById('nst-wiki-tdee');
        if (tdeeEl) tdeeEl.textContent = bio.tdee_stimato ? `~${bio.tdee_stimato} kcal/die` : '--';

        // 2. Allenamento
        const all = data.allenamento || {};
        const discEl = document.getElementById('nst-wiki-disciplina');
        if (discEl) discEl.textContent = all.disciplina_principale || 'Nessuna sessione';

        const freqEl = document.getElementById('nst-wiki-frequenza');
        if (freqEl) freqEl.textContent = all.sessioni_settimana !== undefined ? `${all.sessioni_settimana} sess/sett` : '--';

        const sessEl = document.getElementById('nst-wiki-sessioni');
        if (sessEl) sessEl.textContent = all.totale_sessioni_30gg !== undefined ? `${all.totale_sessioni_30gg}` : '0';

        const rpeEl = document.getElementById('nst-wiki-rpe');
        if (rpeEl) rpeEl.textContent = all.rpe_medio ? `${all.rpe_medio} / 10` : '--';

        // 3. Nutrizione
        const nut = data.nutrizione || {};
        const tgtKcalEl = document.getElementById('nst-wiki-target-kcal');
        if (tgtKcalEl) tgtKcalEl.textContent = nut.calorie_target ? `${nut.calorie_target} kcal` : '--';

        const tgtProEl = document.getElementById('nst-wiki-target-pro');
        if (tgtProEl) tgtProEl.textContent = nut.proteine_target_g ? `${nut.proteine_target_g}g` : '--';

        const medKcalEl = document.getElementById('nst-wiki-media-kcal');
        if (medKcalEl) medKcalEl.textContent = nut.media_kcal ? `~${nut.media_kcal} kcal/die` : '--';

        const medProEl = document.getElementById('nst-wiki-media-pro');
        if (medProEl) medProEl.textContent = nut.media_pro_g ? `~${nut.media_pro_g}g/die` : '--';

        const ggTracciatiEl = document.getElementById('nst-wiki-giorni-pasti');
        if (ggTracciatiEl) ggTracciatiEl.textContent = `${nut.giorni_tracciati_30gg || 0} giorni`;

        // 4. Raw Markdown
        const rawCode = document.getElementById('nst-wiki-raw-code');
        if (rawCode) {
            rawCode.textContent = data.scheda_markdown || '(Scheda in fase di consolidamento dati)';
        }

    } catch (e) {
        console.error("Errore render scheda atleta UI:", e);
    }
}

async function aggiornaSchedaManuale() {
    try {
        const response = await fetch('/api/nestore-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ action: 'recalculate_wiki' })
        });
        if (response.ok) {
            await caricaSchedaAtletaUI();
        }
    } catch (e) {
        console.error("Errore aggiornamento manuale scheda:", e);
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
        const u = currentUser || (typeof window !== 'undefined' ? window.currentUser : null);
        if (!u || !u.id || !supabaseClient) return;

        let query = supabaseClient
            .from('nestore_pesi_misure')
            .select('*')
            .eq('utente_id', u.id)
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
            const altElEmpty = document.getElementById('nst-altezza-val');
            if (altElEmpty) altElEmpty.textContent = userPreferenze.altezza_cm || '--';
            document.getElementById('nst-vita-val').textContent = '--';
            document.getElementById('nst-torace-val').textContent = '--';
            document.getElementById('nst-braccio-val').textContent = '--';
            return;
        }

        if (emptyMsg) emptyMsg.classList.add('nst-hidden');

        // Aggiorna riassunto ultimo peso & delta
        const ultimo = data[data.length - 1];
        currentUserPesoKg = ultimo.peso_kg ? Number(ultimo.peso_kg) : null;
        document.getElementById('nst-current-weight').textContent = ultimo.peso_kg ? Number(ultimo.peso_kg).toFixed(1) : '--';
        const altEl = document.getElementById('nst-altezza-val');
        if (altEl) altEl.textContent = userPreferenze.altezza_cm || ultimo.altezza_cm || '--';
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

// ---------------------------------------------------------------------------
// PARSER & CALCOLO RECORD PERSONALI (PR) ALLENAMENTI
// ---------------------------------------------------------------------------

function normalizeExerciseName(rawName) {
    if (!rawName) return 'Esercizio';
    const clean = rawName.trim().replace(/^[-*•\s]+/, '').replace(/[:;,.]+$/, '').trim();
    const lower = clean.toLowerCase();

    if (lower === 'pull' || lower === 'pull up' || lower === 'pull-up' || lower === 'pullup' || lower === 'trazioni') return 'Pull-up';
    if (lower === 'push' || lower === 'push up' || lower === 'push-up' || lower === 'pushup' || lower === 'piegamenti') return 'Push-up';
    if (lower === 'panca' || lower === 'panca piana' || lower === 'bench' || lower === 'bench press') return 'Panca Piana';
    if (lower === 'squat' || lower === 'back squat') return 'Squat';
    if (lower === 'leg press' || lower === 'pressa' || lower === 'legpress') return 'Leg Press';
    if (lower === 'addominali' || lower === 'crunch' || lower === 'sit-up' || lower === 'situp' || lower === 'abs') return 'Addominali';
    if (lower === 'stacco' || lower === 'stacco da terra' || lower === 'deadlift') return 'Stacco da Terra';
    if (lower === 'military' || lower === 'military press' || lower === 'lento avanti' || lower === 'overhead press' || lower === 'ohp') return 'Military Press';
    if (lower === 'dip' || lower === 'dips') return 'Dip';
    if (lower === 'affondi' || lower === 'lunges') return 'Affondi';
    if (lower === 'rematore' || lower === 'barbell row') return 'Rematore';

    return clean.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function isBetterPerformance(candidate, currentBest) {
    if (!currentBest) return true;
    const candPeso = candidate.peso_kg || 0;
    const bestPeso = currentBest.peso_kg || 0;
    const candReps = candidate.ripetizioni || candidate.reps || 0;
    const bestReps = currentBest.ripetizioni || currentBest.reps || 0;

    // Se almeno uno dei due ha un sovraccarico (> 0 kg)
    if (candPeso > 0 || bestPeso > 0) {
        // Criterio 1: Vince il peso più alto
        if (candPeso > bestPeso) return true;
        // Criterio 2: A parità di peso, vince chi ha più ripetizioni
        if (candPeso === bestPeso && candReps > bestReps) return true;
        return false;
    }

    // Entrambi a corpo libero (peso === 0): vince chi ha più ripetizioni
    return candReps > bestReps;
}

function parseExercisesFromWorkout(workout) {
    const results = [];
    const date = workout.data_allenamento || '';

    // 1. Dati strutturati (scheda_dati JSONB)
    if (Array.isArray(workout.scheda_dati) && workout.scheda_dati.length > 0) {
        for (const ex of workout.scheda_dati) {
            if (!ex || !ex.nome) continue;
            results.push({
                nome: normalizeExerciseName(ex.nome),
                peso_kg: parseFloat(ex.peso_kg) || 0,
                ripetizioni: parseInt(ex.ripetizioni || ex.reps, 10) || 1,
                serie: parseInt(ex.serie, 10) || 1,
                data: date,
                note: ex.note || ''
            });
        }
        return results;
    }

    // 2. Parser Intelligente Retroattivo da campo note (Legacy)
    const note = workout.note || '';
    if (!note || typeof note !== 'string') return results;

    const sentences = note.split(/[.;\n]+/).map(s => s.trim()).filter(Boolean);

    for (const sentence of sentences) {
        const colonIdx = sentence.indexOf(':');
        if (colonIdx > 0) {
            const potentialName = sentence.slice(0, colonIdx).trim();
            const rest = sentence.slice(colonIdx + 1).trim();
            const isGenericKey = /^(totale|note|sessione|workout|disciplina|invictus)$/i.test(potentialName);

            if (!isGenericKey && potentialName.length > 1) {
                const exName = normalizeExerciseName(potentialName);
                const sets = rest.split(',').map(s => s.trim()).filter(Boolean);
                for (const setStr of sets) {
                    // Ignora le serie fallite
                    if (/(fallit|fail|non\s*chius)/i.test(setStr)) continue;

                    // Match 3x10x180kg (serie x reps x peso)
                    const m3 = setStr.match(/(\d+)\s*[xX*]\s*(\d+)\s*[xX*]\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?/i);
                    if (m3) {
                        results.push({
                            nome: exName,
                            serie: parseInt(m3[1], 10),
                            ripetizioni: parseInt(m3[2], 10),
                            peso_kg: parseFloat(m3[3].replace(',', '.')),
                            data: date
                        });
                        continue;
                    }

                    // Match 10x90kg (reps x peso)
                    const m2 = setStr.match(/(\d+)\s*[xX*]\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?/i);
                    if (m2) {
                        results.push({
                            nome: exName,
                            serie: 1,
                            ripetizioni: parseInt(m2[1], 10),
                            peso_kg: parseFloat(m2[2].replace(',', '.')),
                            data: date
                        });
                        continue;
                    }

                    // Match solo kg (es. 100kg)
                    const mKg = setStr.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
                    if (mKg) {
                        results.push({
                            nome: exName,
                            serie: 1,
                            ripetizioni: 1,
                            peso_kg: parseFloat(mKg[1].replace(',', '.')),
                            data: date
                        });
                        continue;
                    }

                    // Match solo ripetizioni (es. 15 rip, 20 reps)
                    const mRep = setStr.match(/^(\d+)\s*(?:reps?|rip|ripetizioni)?$/i);
                    if (mRep) {
                        results.push({
                            nome: exName,
                            serie: 1,
                            ripetizioni: parseInt(mRep[1], 10),
                            peso_kg: 0,
                            data: date
                        });
                        continue;
                    }
                }
                continue;
            }
        }

        // Se non ha i due punti, cerca pattern per corpo libero o serie singole
        const commaParts = sentence.split(',').map(s => s.trim()).filter(Boolean);
        for (const part of commaParts) {
            const mBw = part.match(/(?:totale\s*:?\s*)?(\d+)\s+([a-zA-Z\s\-]+)/i);
            if (mBw) {
                const count = parseInt(mBw[1], 10);
                const rawName = mBw[2].trim();
                if (/^(min|minuti|sec|secondi|ore|h|kg|calorie|kcal)$/i.test(rawName)) continue;
                results.push({
                    nome: normalizeExerciseName(rawName),
                    serie: 1,
                    ripetizioni: count,
                    peso_kg: 0,
                    data: date
                });
            }
        }
    }

    return results;
}

function calcolaRecordPersonali(allWorkouts) {
    const prMap = {};

    for (const w of allWorkouts) {
        const exercises = parseExercisesFromWorkout(w);
        for (const ex of exercises) {
            const key = ex.nome;
            if (!prMap[key]) {
                prMap[key] = ex;
            } else {
                if (isBetterPerformance(ex, prMap[key])) {
                    prMap[key] = ex;
                }
            }
        }
    }

    const prList = Object.values(prMap);
    prList.sort((a, b) => a.nome.localeCompare(b.nome));
    return prList;
}

async function ottieniBaseMassimaleEsercizio(nomeEsercizio) {
    const nomeNorm = (nomeEsercizio || '').trim().toLowerCase();
    let massimale = null;
    let fonte = 'pr';

    const prList = (typeof window !== 'undefined' && Array.isArray(window.currentUserPrList))
        ? window.currentUserPrList
        : (typeof currentUserPrList !== 'undefined' ? currentUserPrList : null);

    // 1. Cerca nei PR calcolati in memoria
    if (Array.isArray(prList) && prList.length > 0) {
        const pr = prList.find(p => (p.nome || '').trim().toLowerCase() === nomeNorm);
        if (pr && pr.peso_kg > 0) {
            massimale = Number(pr.peso_kg);
            fonte = `PR: ${massimale} kg`;
        }
    }

    const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    const user = (typeof window !== 'undefined' && window.currentUser) ? window.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);

    // 1b. Se non in memoria ma abbiamo client Supabase e utente loggato
    if (!massimale && client && user?.id && typeof client.from === 'function') {
        try {
            const { data: allW } = await client
                .from('nestore_allenamenti')
                .select('*')
                .eq('utente_id', user.id)
                .eq('attivo', true);
            if (allW && allW.length > 0) {
                const prs = calcolaRecordPersonali(allW);
                currentUserPrList = prs;
                if (typeof window !== 'undefined') window.currentUserPrList = prs;
                const pr = prs.find(p => (p.nome || '').trim().toLowerCase() === nomeNorm);
                if (pr && pr.peso_kg > 0) {
                    massimale = Number(pr.peso_kg);
                    fonte = `PR: ${massimale} kg`;
                }
            }
        } catch (e) {
            console.warn("Impossibile recuperare PR per", nomeEsercizio, e);
        }
    }

    // 2. Se nessun massimale, cerca il peso dell'atleta
    if (!massimale) {
        const pesoKgVal = (typeof window !== 'undefined' && window.currentUserPesoKg !== undefined)
            ? window.currentUserPesoKg
            : (typeof currentUserPesoKg !== 'undefined' ? currentUserPesoKg : null);

        if (typeof pesoKgVal === 'number' && pesoKgVal > 0) {
            massimale = pesoKgVal;
            fonte = `Peso atleta: ${massimale} kg`;
        } else if (typeof document !== 'undefined' && document) {
            const weightEl = document.getElementById('nst-current-weight');
            const wVal = parseFloat(weightEl?.textContent);
            if (!isNaN(wVal) && wVal > 0) {
                massimale = wVal;
                currentUserPesoKg = massimale;
                if (typeof window !== 'undefined') window.currentUserPesoKg = massimale;
                fonte = `Peso atleta: ${massimale} kg`;
            }
        }

        if (!massimale && client && user?.id && typeof client.from === 'function') {
            try {
                const { data: pesi } = await client
                    .from('nestore_pesi_misure')
                    .select('peso_kg')
                    .eq('utente_id', user.id)
                    .eq('attivo', true)
                    .order('data_rilevazione', { ascending: false })
                    .limit(1);
                if (pesi && pesi.length > 0 && pesi[0].peso_kg > 0) {
                    massimale = Number(pesi[0].peso_kg);
                    currentUserPesoKg = massimale;
                    if (typeof window !== 'undefined') window.currentUserPesoKg = massimale;
                    fonte = `Peso atleta: ${massimale} kg`;
                }
            } catch (e) {
                console.warn("Impossibile recuperare peso atleta:", e);
            }
        }
    }

    // 3. Fallback standard se nessun massimale e nessun peso corporeo
    if (!massimale || massimale <= 0) {
        massimale = 70;
        fonte = `Default: 70 kg`;
    }

    return { baseKg: massimale, fonte };
}

function renderPrGrid(prList) {
    const container = document.getElementById('nst-pr-container');
    const prCountEl = document.getElementById('nst-pr-count');
    if (prCountEl) {
        prCountEl.textContent = `${prList.length} eserciz${prList.length === 1 ? 'io' : 'i'}`;
    }
    if (!container) return;
    container.innerHTML = '';

    if (prList.length === 0) {
        container.innerHTML = `<div class="nst-pr-empty" style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--nst-text-muted); font-size: 11px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">Nessun esercizio rilevato nello storico sessioni.</div>`;
        return;
    }

    for (const pr of prList) {
        const card = document.createElement('div');
        card.className = 'nst-pr-card';

        let bestValHtml = '';
        let subValHtml = '';

        if (pr.peso_kg > 0) {
            bestValHtml = `${pr.peso_kg} <span style="font-size:11px;">KG</span>`;
            subValHtml = `${pr.ripetizioni} rep${pr.ripetizioni > 1 ? 's' : ''}${pr.serie > 1 ? ` (${pr.serie} serie)` : ''}`;
        } else {
            bestValHtml = `${pr.ripetizioni} <span style="font-size:11px;">REP</span>`;
            subValHtml = `Corpo libero`;
        }

        card.innerHTML = `
            <div class="nst-pr-exercise-name" title="${escapeHtml(pr.nome)}">${escapeHtml(pr.nome)}</div>
            <div class="nst-pr-card-body">
                <div class="nst-pr-best-val">${bestValHtml}</div>
                <div class="nst-pr-sub-val">${escapeHtml(subValHtml)}</div>
            </div>
            <div class="nst-pr-card-footer">
                <span>RECORD</span>
                <span style="color:#cbd5e1; font-weight:600;">${formatDateShort(pr.data)}</span>
            </div>
        `;
        container.appendChild(card);
    }
}

async function renderGraficoAllenamenti() {
    try {
        const u = currentUser || (typeof window !== 'undefined' ? window.currentUser : null);
        if (!u || !u.id || !supabaseClient) return;

        // Query ALL-TIME per calcolare i Record Personali di tutti gli allenamenti registrati
        const { data: allData, error } = await supabaseClient
            .from('nestore_allenamenti')
            .select('*')
            .eq('utente_id', u.id)
            .eq('attivo', true)
            .order('data_allenamento', { ascending: true });

        const emptyMsg = document.getElementById('nst-empty-allenamenti');

        if (error || !allData || allData.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove('nst-hidden');
            const prContainer = document.getElementById('nst-pr-container');
            if (prContainer) prContainer.innerHTML = '';
            const prCountEl = document.getElementById('nst-pr-count');
            if (prCountEl) prCountEl.textContent = '0 esercizi';
            document.getElementById('nst-training-count').textContent = '0 sessioni nel periodo';
            document.getElementById('nst-last-workout-name').textContent = 'Nessuna sessione';
            const tbody = document.getElementById('nst-tbody-allenamenti');
            if (tbody) tbody.innerHTML = '';
            return;
        }

        if (emptyMsg) emptyMsg.classList.add('nst-hidden');

        // 1. Calcola e renderizza i Record Personali ALL-TIME
        const prList = calcolaRecordPersonali(allData);
        currentUserPrList = prList;
        renderPrGrid(prList);

        // 2. Filtra i dati per il periodo selezionato (7G / 14G / 30G / ALL) per lo Storico Sessioni in basso
        const dataInizio = calcolaDataInizio(rangeFiltri.allenamenti);
        const filteredData = dataInizio
            ? allData.filter(a => a.data_allenamento >= dataInizio)
            : allData;

        // Aggiorna riassunto sessioni nel periodo
        document.getElementById('nst-training-count').textContent = `${filteredData.length} session${filteredData.length === 1 ? 'e' : 'i'} nel periodo`;
        const ultimo = filteredData.length > 0 ? filteredData[filteredData.length - 1] : allData[allData.length - 1];
        if (ultimo) {
            document.getElementById('nst-last-workout-name').textContent = `${formatDateShort(ultimo.data_allenamento)}: ${(ultimo.corso_disciplina || 'Workout').toUpperCase()}`;
        } else {
            document.getElementById('nst-last-workout-name').textContent = 'Nessuna sessione nel periodo';
        }

        // Genera Tabella Storico Sessioni
        const tbody = document.getElementById('nst-tbody-allenamenti');
        if (tbody) {
            tbody.innerHTML = '';
            for (let i = filteredData.length - 1; i >= 0; i--) {
                const item = filteredData[i];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateShort(item.data_allenamento)}</td>
                    <td style="color: var(--nst-lime); font-weight: 600;">${(item.corso_disciplina || 'Workout').toUpperCase()}</td>
                    <td>${item.durata_minuti || '-'}</td>
                    <td>${item.rpe_fatica ? item.rpe_fatica + '/10' : '-'}</td>
                    <td style="max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.note || '')}">${escapeHtml(item.note || '')}</td>
                `;
                tbody.appendChild(tr);
            }
        }

    } catch (e) {
        console.error("Errore bacheca allenamenti e record:", e);
    }
}

async function renderGraficoDieta() {
    try {
        const u = currentUser || (typeof window !== 'undefined' ? window.currentUser : null);
        if (!u || !u.id || !supabaseClient) return;

        let query = supabaseClient
            .from('nestore_pasti')
            .select('*')
            .eq('utente_id', u.id)
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

        // Calcolo o recupero TDEE e Calorie Target
        const targetVal = Number(userPreferenze?.calorie_target || currentSchedaAtleta?.nutrizione?.calorie_target || 2200);
        const targetValEl = document.getElementById('nst-target-val');
        if (targetValEl) targetValEl.textContent = Math.round(targetVal);

        let tdeeVal = Number(currentSchedaAtleta?.biometria?.tdee_stimato || 0);
        if (!tdeeVal) {
            try {
                const { data: sch } = await supabaseClient
                    .from('nestore_scheda_atleta')
                    .select('biometria, nutrizione')
                    .eq('utente_id', currentUser.id)
                    .maybeSingle();
                if (sch) {
                    currentSchedaAtleta = sch;
                    tdeeVal = Number(sch.biometria?.tdee_stimato || 0);
                }
            } catch (e) {
                console.warn("Errore recupero tdee per grafico:", e);
            }
        }
        if (!tdeeVal) {
            tdeeVal = 2000; // Riferimento medio standard
        }

        const canvas = document.getElementById('nst-chart-dieta');
        if (!canvas || typeof Chart === 'undefined') return;

        if (chartDietaInstance) {
            chartDietaInstance.destroy();
        }

        const datasets = [
            {
                type: 'bar',
                label: 'Proteine (kcal)',
                data: seriePro,
                backgroundColor: '#00e5ff', // Cyan (base)
                stack: 'macro',
                borderRadius: 0,
                order: 2
            },
            {
                type: 'bar',
                label: 'Grassi (kcal)',
                data: serieFat,
                backgroundColor: '#76ff03', // Lime (centro)
                stack: 'macro',
                borderRadius: 0,
                order: 2
            },
            {
                type: 'bar',
                label: 'Carboidrati (kcal)',
                data: serieCarb,
                backgroundColor: '#ffb300', // Amber (cima)
                stack: 'macro',
                borderRadius: 4,
                order: 2
            }
        ];

        let tdeeDatasetIndex = -1;
        let targetDatasetIndex = -1;

        if (labels.length > 0) {
            // Linea Rossa: TDEE Linee Guida Salute
            tdeeDatasetIndex = datasets.length;
            datasets.push({
                type: 'line',
                label: `TDEE Salute (${Math.round(tdeeVal)} kcal)`,
                data: labels.map(() => Math.round(tdeeVal)),
                borderColor: '#ff1744', // Red
                backgroundColor: '#ff1744',
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 4,
                showLine: false,
                fill: false,
                order: 1
            });

            // Linea Verde: Target Calorie Atleta
            targetDatasetIndex = datasets.length;
            datasets.push({
                type: 'line',
                label: `Target (${Math.round(targetVal)} kcal)`,
                data: labels.map(() => Math.round(targetVal)),
                borderColor: '#00e676', // Green
                backgroundColor: '#00e676',
                borderWidth: 2,
                borderDash: [3, 3],
                pointRadius: 0,
                pointHoverRadius: 4,
                showLine: false,
                fill: false,
                order: 1
            });
        }

        const fullWidthTargetLinesPlugin = {
            id: 'fullWidthTargetLines',
            afterDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const y = scales?.y;
                if (!chartArea || !y) return;

                // TDEE Line (Rossa a tutta ampiezza)
                if (tdeeDatasetIndex !== -1 && (!chart.isDatasetVisible || chart.isDatasetVisible(tdeeDatasetIndex))) {
                    const yPos = y.getPixelForValue(tdeeVal);
                    if (yPos >= chartArea.top - 5 && yPos <= chartArea.bottom + 5) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([6, 4]);
                        ctx.moveTo(chartArea.left, yPos);
                        ctx.lineTo(chartArea.right, yPos);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#ff1744';
                        ctx.stroke();
                        ctx.restore();
                    }
                }

                // Target Line (Verde a tutta ampiezza)
                if (targetDatasetIndex !== -1 && (!chart.isDatasetVisible || chart.isDatasetVisible(targetDatasetIndex))) {
                    const yPos = y.getPixelForValue(targetVal);
                    if (yPos >= chartArea.top - 5 && yPos <= chartArea.bottom + 5) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([3, 3]);
                        ctx.moveTo(chartArea.left, yPos);
                        ctx.lineTo(chartArea.right, yPos);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#00e676';
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }
        };

        const maxMacroDaily = dateOrdinate.length > 0 
            ? Math.max(...dateOrdinate.map(d => (aggregati[d]?.proKcal || 0) + (aggregati[d]?.carbKcal || 0) + (aggregati[d]?.fatKcal || 0)))
            : 0;
        const suggestedMaxKcal = Math.round(Math.max(tdeeVal, targetVal, maxMacroDaily, 1000) * 1.15);

        chartDietaInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            plugins: [fullWidthTargetLinesPlugin],
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
                                tooltipItems.forEach(ti => {
                                    if (ti.dataset.stack === 'macro') {
                                        sum += ti.parsed.y;
                                    }
                                });
                                return sum > 0 ? `Totale pasti: ${sum} kcal` : '';
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
                        suggestedMax: suggestedMaxKcal,
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
// GESTIONE CHAT (Flusso Invertito Top-Down: più recente in alto, input fisso in cima)
// ---------------------------------------------------------------------------
let currentChatOffset = 0;
const CHAT_PAGE_SIZE = 35;
const CHAT_MORE_SIZE = 20;

function ancoraChatInAlto() {
    const container = document.getElementById('nst-chat-messages');
    if (container) {
        container.scrollTop = 0;
    }
}

function gestisciInputConteggio(textarea) {
    const counter = document.getElementById('nst-char-counter');
    const sendBtn = document.getElementById('nst-send-btn');
    if (!textarea) return;
    const len = textarea.value.length;
    const max = 1500;

    if (counter) {
        counter.textContent = `${len}/${max}`;
        if (len >= max) {
            counter.className = 'nst-char-counter limit';
        } else if (len >= max * 0.85) {
            counter.className = 'nst-char-counter warning';
        } else {
            counter.className = 'nst-char-counter';
        }
    }

    if (sendBtn) {
        sendBtn.disabled = len > max;
    }
}

async function caricaCronologiaChat() {
    const container = document.getElementById('nst-chat-messages');
    let loadMoreBar = document.getElementById('nst-load-more-bar');
    
    // Svuota i messaggi preservando il blocco caricamento storico in fondo
    container.innerHTML = '';
    if (!loadMoreBar) {
        loadMoreBar = document.createElement('div');
        loadMoreBar.id = 'nst-load-more-bar';
        loadMoreBar.className = 'nst-load-more-bar nst-hidden';
        loadMoreBar.innerHTML = `
            <button type="button" class="nst-btn-load-more" id="nst-load-more-btn" onclick="caricaMessaggiPrecedenti()">
                <span class="material-symbols-outlined" style="font-size: 15px;">history</span>
                Carica messaggi precedenti
            </button>
        `;
    }
    container.appendChild(loadMoreBar);
    loadMoreBar.classList.add('nst-hidden');
    currentChatOffset = 0;

    try {
        // Preleva gli ultimi 35 messaggi ordinati in ordine decrescente (il più recente per primo)
        const { data, error } = await supabaseClient
            .from('nestore_chat_messaggi')
            .select('*')
            .eq('utente_id', currentUser.id)
            .order('creato_il', { ascending: false })
            .limit(CHAT_PAGE_SIZE);

        if (error) {
            console.error("Errore caricamento cronologia chat:", error);
        }

        if (!data || data.length === 0) {
            // Messaggio di benvenuto se prima conversazione (in cima)
            renderMessaggioUI({
                ruolo: 'assistant',
                contenuto: `Ciao ${currentUserProfile?.nome || 'Atleta'}! Sono **NESTORE**, il tuo assistente sportivo e nutrizionale ad Adrenalina Club.\n\nPuoi parlarmi a voce con il microfono, scrivermi o mandarmi la foto di un piatto o della tua scheda.\n\nEsempi di cosa posso fare:\n- *"Oggi peso 79.4 kg e la vita misura 84 cm"*\n- *"A pranzo ho mangiato 120g di pasta al pomodoro e 150g di petto di pollo"*\n- *"Oggi allenamento Strongman: log press 4x6 a 70kg e deadlift"*`,
                creato_il: new Date().toISOString()
            }, 'beforeLoadMore');
        } else {
            // Render dei messaggi: data[0] (più recente) in cima, seguiti dai più vecchi verso il basso
            data.forEach(m => renderMessaggioUI(m, 'beforeLoadMore'));
            currentChatOffset = data.length;

            // Mostra pulsante caricamento storico se abbiamo raggiunto la dimensione di pagina
            if (data.length === CHAT_PAGE_SIZE) {
                loadMoreBar.classList.remove('nst-hidden');
            }
        }

        ancoraChatInAlto();
    } catch (e) {
        console.error("Eccezione cronologia chat:", e);
    }
}

async function caricaMessaggiPrecedenti() {
    const loadBtn = document.getElementById('nst-load-more-btn');
    const loadMoreBar = document.getElementById('nst-load-more-bar');
    if (!loadBtn) return;

    loadBtn.disabled = true;
    loadBtn.innerHTML = `<span class="nst-loader-inline" style="width:12px; height:12px;"></span> Caricamento...`;

    try {
        const { data, error } = await supabaseClient
            .from('nestore_chat_messaggi')
            .select('*')
            .eq('utente_id', currentUser.id)
            .order('creato_il', { ascending: false })
            .range(currentChatOffset, currentChatOffset + CHAT_MORE_SIZE - 1);

        if (error) {
            console.error("Errore caricamento messaggi precedenti:", error);
            loadBtn.disabled = false;
            loadBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px;">history</span> Riprova`;
            return;
        }

        if (data && data.length > 0) {
            data.forEach(m => renderMessaggioUI(m, 'beforeLoadMore'));
            currentChatOffset += data.length;
        }

        if (!data || data.length < CHAT_MORE_SIZE) {
            if (loadMoreBar) loadMoreBar.classList.add('nst-hidden');
        } else {
            loadBtn.disabled = false;
            loadBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px;">history</span> Carica messaggi precedenti`;
        }
    } catch (e) {
        console.error("Eccezione caricamento precedenti:", e);
        loadBtn.disabled = false;
        loadBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px;">history</span> Carica messaggi precedenti`;
    }
}

function renderMessaggioUI(msg, position = 'prepend') {
    const container = document.getElementById('nst-chat-messages');
    const loadMoreBar = document.getElementById('nst-load-more-bar');
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

    // Posizionamento nel DOM
    if (position === 'prepend') {
        // Inserisci in cima assoluta (subito sotto l'input bar)
        if (container.firstChild) {
            container.insertBefore(msgDiv, container.firstChild);
        } else {
            container.appendChild(msgDiv);
        }
    } else {
        // Inserisci in fondo allo stream ma prima della barra "Carica precedenti"
        if (loadMoreBar && loadMoreBar.parentNode === container) {
            container.insertBefore(msgDiv, loadMoreBar);
        } else {
            container.appendChild(msgDiv);
        }
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

    // Controllo massimale caratteri (1500)
    if (testo.length > 1500) {
        alert("Il messaggio supera il limite massimo di 1500 caratteri.");
        return;
    }

    // Disabilita UI e reset input
    input.value = '';
    gestisciInputConteggio(input);
    sendBtn.disabled = true;

    // Render immediato messaggio utente in cima alla chat
    renderMessaggioUI({
        ruolo: 'user',
        contenuto: testo || '(Foto allegata)',
        foto_url: allegato ? allegato.base64 : null,
        creato_il: new Date().toISOString()
    }, 'prepend');

    rimuoviFotoAllegata();

    // Placeholder di risposta in cima (sopra il messaggio utente)
    const container = document.getElementById('nst-chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'nst-msg assistant';
    loadingDiv.id = 'nst-msg-loading';
    loadingDiv.innerHTML = `<div><span class="nst-loader-inline"></span> Nestore sta analizzando...</div>`;
    container.insertBefore(loadingDiv, container.firstChild);
    ancoraChatInAlto();

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
            }, 'prepend');
            ancoraChatInAlto();
            return;
        }

        const data = await response.json();

        // Render risposta di Nestore in cima
        renderMessaggioUI({
            id: data.messaggio_id,
            ruolo: 'assistant',
            contenuto: data.reply || "Dati ricevuti!",
            metadata: data.extraction_payload ? { dati_estratti: data.extraction_payload, salvato: data.salvato_direttamente } : null,
            creato_il: new Date().toISOString()
        }, 'prepend');

        ancoraChatInAlto();

        // Se salvataggio diretto o estrazione completata, ricarica i KPI e la scheda
        if (data.salvato_direttamente) {
            await caricaKpiDashboard();
            await caricaSchedaAtletaUI();
        }

    } catch (err) {
        console.error("Errore invio chat:", err);
        const loader = document.getElementById('nst-msg-loading');
        if (loader) loader.remove();

        renderMessaggioUI({
            ruolo: 'assistant',
            contenuto: "Errore di comunicazione con il server. Verifica la connessione.",
            creato_il: new Date().toISOString()
        }, 'prepend');
        ancoraChatInAlto();
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
        if (payload.altezza_cm) dettagliHtml += `<div class="nst-confirm-row"><span>Altezza:</span><strong>${payload.altezza_cm} cm</strong></div>`;
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
                altezza_cm: payload.altezza_cm || userPreferenze.altezza_cm || null,
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
            if (payload.altezza_cm) {
                await supabaseClient.from('nestore_preferenze').upsert({
                    utente_id: currentUser.id,
                    altezza_cm: payload.altezza_cm,
                    aggiornato_il: new Date().toISOString()
                });
                userPreferenze.altezza_cm = payload.altezza_cm;
            }
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

        // Ricalcolo asincrono scheda atleta
        fetch('/api/nestore-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ action: 'recalculate_wiki' })
        }).then(() => {
            caricaSchedaAtletaUI();
        }).catch(() => {});

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
                let testoCompleto = [testoBaseInputVocale, testoTrascrittoSessione].filter(Boolean).join(' ');
                if (testoCompleto.length > 1500) {
                    testoCompleto = testoCompleto.substring(0, 1500);
                }
                input.value = testoCompleto;
                gestisciInputConteggio(input);
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
                gestisciInputConteggio(input);
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

// ---------------------------------------------------------------------------
// GESTIONE CAMBIO VISUALIZZAZIONE (ATLETA / ALLENATORE / AMMINISTRATORE)
// ---------------------------------------------------------------------------
async function switchNestoreView(val) {
    if (val === 'admin' && !isAuthorizedAdmin) {
        console.warn("Accesso negato: la vista AMMINISTRATORE è riservata al Presidente.");
        const switcher = document.getElementById('nst-view-switcher');
        if (switcher) switcher.value = 'athlete';
        val = 'athlete';
    } else if (val === 'coach' && !isIstruttore) {
        console.warn("Accesso negato: la vista ALLENATORE è riservata agli Istruttori.");
        const switcher = document.getElementById('nst-view-switcher');
        if (switcher) switcher.value = 'athlete';
        val = 'athlete';
    }

    currentNestoreView = val;
    const athleteGrid = document.getElementById('nst-athlete-main-grid');
    const mobileTabs = document.getElementById('nst-mobile-tabs');
    const coachContainer = document.getElementById('nst-coach-container');
    const rolePill = document.getElementById('nst-coach-role-pill');
    const dashTitle = document.getElementById('nst-coach-dashboard-title');
    const dashSubtitle = document.getElementById('nst-coach-dashboard-subtitle');

    // Reset eventuale atleta in ispezione
    selectedCoachAtleta = null;

    if (val === 'athlete') {
        if (athleteGrid) athleteGrid.classList.remove('nst-hidden');
        if (mobileTabs) mobileTabs.classList.remove('nst-hidden');
        if (coachContainer) coachContainer.classList.add('nst-hidden');
    } else if (val === 'coach') {
        if (athleteGrid) athleteGrid.classList.add('nst-hidden');
        if (mobileTabs) mobileTabs.classList.add('nst-hidden');
        if (coachContainer) coachContainer.classList.remove('nst-hidden');

        if (rolePill) {
            rolePill.textContent = 'ALLENATORE';
            rolePill.className = 'nst-coach-pill';
        }
        if (dashTitle) dashTitle.textContent = 'I MIEI ATLETI';
        if (dashSubtitle) dashSubtitle.textContent = 'Seleziona un atleta per monitorare i suoi parametri (peso, allenamenti, pasti, scheda AI) e assegnargli la scheda di allenamento.';

        // Mostra vista lista e nascondi dettaglio
        switchCoachMainTab('athletes');
        const athletesTabLabel = document.getElementById('nst-coach-tab-athletes-label');
        if (athletesTabLabel) athletesTabLabel.textContent = 'I MIEI ATLETI';
        document.getElementById('nst-coach-list-view')?.classList.remove('nst-hidden');
        document.getElementById('nst-coach-atleta-view')?.classList.add('nst-hidden');

        await caricaCoachDashboard();
    } else if (val === 'admin') {
        if (athleteGrid) athleteGrid.classList.add('nst-hidden');
        if (mobileTabs) mobileTabs.classList.add('nst-hidden');
        if (coachContainer) coachContainer.classList.remove('nst-hidden');

        if (rolePill) {
            rolePill.textContent = 'AMMINISTRATORE';
            rolePill.className = 'nst-coach-pill alt';
        }
        if (dashTitle) dashTitle.textContent = 'TUTTI GLI ATLETI (AMMINISTRATORE)';
        if (dashSubtitle) dashSubtitle.textContent = 'Visualizzazione completa di tutti i corsi e atleti registrati ad Adrenalina Club.';

        switchCoachMainTab('athletes');
        const athletesTabLabel = document.getElementById('nst-coach-tab-athletes-label');
        if (athletesTabLabel) athletesTabLabel.textContent = 'TUTTI GLI ATLETI';
        document.getElementById('nst-coach-list-view')?.classList.remove('nst-hidden');
        document.getElementById('nst-coach-atleta-view')?.classList.add('nst-hidden');

        await caricaAdminDashboard();
    }
}

// ---------------------------------------------------------------------------
// GESTIONE PANNELLI SPA ATLETA (Desktop Sidebar / Mobile Tabs)
// ---------------------------------------------------------------------------
function switchNestorePanel(panelId) {
    // Lista pannelli atleta
    const panels = ['chat', 'peso', 'allenamenti', 'dieta', 'timer', 'profilo', 'schede'];
    
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
        ancoraChatInAlto();
    } else if (panelId === 'profilo') {
        caricaSchedaAtletaUI();
    } else if (panelId === 'schede') {
        caricaLibreriaProgrammi();
        renderCatalogoIbrido();
        caricaSchedeAtleta(currentUser.id, 'nst-atleta-schede-container', false);
    }
    
    // Se l'utente entra nel pannello Timer, nascondi il mini-dock
    const dockEl = document.getElementById('nst-timer-dock');
    if (dockEl) {
        if (panelId === 'timer') {
            dockEl.classList.add('nst-hidden');
        } else {
            aggiornaVisibilitaDock();
        }
    }
}

// ===========================================================================
// SEZIONE DASHBOARD ALLENATORE & AMMINISTRATORE (Fase 2)
// ===========================================================================

async function caricaCoachDashboard() {
    if (!isIstruttore && !isAuthorizedAdmin) {
        console.warn("Accesso negato: la vista ALLENATORE è riservata agli Istruttori.");
        return;
    }

    const container = document.getElementById('nst-coach-atleti-container');
    if (container) {
        container.innerHTML = `
            <div class="nst-loading-box">
                <span class="material-symbols-outlined nst-spin">progress_activity</span>
                <span>Caricamento atleti dei tuoi corsi in corso...</span>
            </div>
        `;
    }

    try {
        // 1. Trova i corsi assegnati all'istruttore loggato
        const { data: assegnazioni, error: assErr } = await supabaseClient
            .from('istruttori_eventi')
            .select('evento_id, eventi(id, titolo, tipo, orari_settimanali)')
            .eq('istruttore_id', currentUser.id);

        if (assErr) throw assErr;

        if (!assegnazioni || assegnazioni.length === 0) {
            coachCorsiAtleti = [];
            aggiornaSelectCorsiCoach([]);
            if (container) {
                container.innerHTML = `
                    <div class="nst-card" style="text-align: center; padding: 40px 20px;">
                        <span class="material-symbols-outlined" style="font-size: 48px; color: var(--nst-text-muted); margin-bottom: 12px;">fitness_center</span>
                        <h3 class="nst-headline" style="font-size: 14px; color: #fff; margin-bottom: 8px;">NESSUN CORSO ASSEGNATO</h3>
                        <p style="font-size: 12px; color: var(--nst-text-muted); max-width: 500px; margin: 0 auto;">
                            Non risulti ancora assegnato come istruttore a nessun corso attivo. Contatta la presidenza per farti associare ai corsi nella Gestione Corsi.
                        </p>
                    </div>
                `;
            }
            const statsPill = document.getElementById('nst-coach-stats-pill');
            if (statsPill) statsPill.textContent = '0 ATLETI TOTALI';
            return;
        }

        const corsi = assegnazioni.map(a => a.eventi).filter(Boolean);
        const corsiIds = corsi.map(c => c.id);

        // 2. Trova tutti gli atleti iscritti a questi corsi
        const { data: iscrizioni, error: iscrErr } = await supabaseClient
            .from('iscrizioni_eventi')
            .select('id, evento_id, utente_id, data_inizio_corso, data_scadenza_corso, stato_pagamento, ingressi_totali, ingressi_usati, utenti(id, nome, cognome, email)')
            .in('evento_id', corsiIds)
            .in('stato_pagamento', ['PAGATO', 'GRATUITO']);

        if (iscrErr) throw iscrErr;

        // 3. Filtra solo iscrizioni attive (non scadute / ingressi rimanenti)
        const oggi = new Date().toISOString().split('T')[0];
        const iscrizioniAttive = (iscrizioni || []).filter(i => isIscrizioneAttiva(i, oggi));

        // 4. Trova schede attive per questi atleti
        const atletiIds = Array.from(new Set(iscrizioniAttive.map(i => i.utente_id)));
        const schedeMap = {};
        if (atletiIds.length > 0) {
            const { data: schede } = await supabaseClient
                .from('nestore_schede_allenamento')
                .select('id, atleta_id, titolo, file_nome, creato_il')
                .in('atleta_id', atletiIds)
                .eq('attivo', true);
            (schede || []).forEach(s => {
                schedeMap[s.atleta_id] = s;
            });
        }

        // 5. Aggrega per corso
        coachCorsiAtleti = corsi.map(c => {
            const iscrCorso = iscrizioniAttive.filter(i => i.evento_id === c.id && i.utenti);
            const atleti = iscrCorso.map(isc => ({
                id: isc.utenti.id,
                nome: isc.utenti.nome || '',
                cognome: isc.utenti.cognome || '',
                email: isc.utenti.email || '',
                dataScadenza: isc.data_scadenza_corso,
                schedaAttiva: schedeMap[isc.utenti.id] || null
            }));
            return {
                id: c.id,
                titolo: c.titolo,
                atleti: atleti
            };
        });

        aggiornaSelectCorsiCoach(coachCorsiAtleti);
        renderCoachCoursesList(coachCorsiAtleti);

    } catch (err) {
        console.error("Errore caricamento dashboard coach:", err);
        if (container) {
            container.innerHTML = `
                <div class="nst-card" style="color: var(--nst-danger); padding: 20px;">
                    Errore durante il caricamento dei corsi e atleti: ${escapeHtml(err.message)}
                </div>
            `;
        }
    }
}

async function caricaAdminDashboard() {
    if (!isAuthorizedAdmin) {
        console.warn("Accesso negato: la vista AMMINISTRATORE è riservata al Presidente.");
        return;
    }

    const container = document.getElementById('nst-coach-atleti-container');
    if (container) {
        container.innerHTML = `
            <div class="nst-loading-box">
                <span class="material-symbols-outlined nst-spin">progress_activity</span>
                <span>Caricamento di tutti i corsi e atleti del club...</span>
            </div>
        `;
    }

    try {
        // 1. Prendi tutti i corsi attivi
        const { data: corsi, error: cErr } = await supabaseClient
            .from('eventi')
            .select('id, titolo, tipo, orari_settimanali')
            .eq('tipo', 'corso')
            .order('titolo');

        if (cErr) throw cErr;

        if (!corsi || corsi.length === 0) {
            coachCorsiAtleti = [];
            aggiornaSelectCorsiCoach([]);
            if (container) {
                container.innerHTML = `
                    <div class="nst-card" style="text-align: center; padding: 40px 20px;">
                        <p style="font-size: 13px; color: var(--nst-text-muted);">Nessun corso configurato nel sistema.</p>
                    </div>
                `;
            }
            return;
        }

        const corsiIds = corsi.map(c => c.id);

        // 2. Iscrizioni per tutti i corsi (con limite anti-bloat a 500 record)
        const { data: iscrizioni, error: iscrErr } = await supabaseClient
            .from('iscrizioni_eventi')
            .select('id, evento_id, utente_id, data_inizio_corso, data_scadenza_corso, stato_pagamento, ingressi_totali, ingressi_usati, utenti(id, nome, cognome, email)')
            .in('evento_id', corsiIds)
            .in('stato_pagamento', ['PAGATO', 'GRATUITO'])
            .limit(500);

        if (iscrErr) throw iscrErr;

        // 3. Filtra solo iscrizioni attive (non scadute / ingressi rimanenti)
        const oggi = new Date().toISOString().split('T')[0];
        const iscrizioniAttive = (iscrizioni || []).filter(i => isIscrizioneAttiva(i, oggi));

        // 4. Schede attive
        const atletiIds = Array.from(new Set(iscrizioniAttive.map(i => i.utente_id)));
        const schedeMap = {};
        if (atletiIds.length > 0) {
            const { data: schede } = await supabaseClient
                .from('nestore_schede_allenamento')
                .select('id, atleta_id, titolo, file_nome, creato_il')
                .in('atleta_id', atletiIds)
                .eq('attivo', true);
            (schede || []).forEach(s => {
                schedeMap[s.atleta_id] = s;
            });
        }

        coachCorsiAtleti = corsi.map(c => {
            const iscrCorso = iscrizioniAttive.filter(i => i.evento_id === c.id && i.utenti);
            const atleti = iscrCorso.map(isc => ({
                id: isc.utenti.id,
                nome: isc.utenti.nome || '',
                cognome: isc.utenti.cognome || '',
                email: isc.utenti.email || '',
                dataScadenza: isc.data_scadenza_corso,
                schedaAttiva: schedeMap[isc.utenti.id] || null
            }));
            return {
                id: c.id,
                titolo: c.titolo,
                atleti: atleti
            };
        });

        aggiornaSelectCorsiCoach(coachCorsiAtleti);
        renderCoachCoursesList(coachCorsiAtleti);

        if (iscrizioni && iscrizioni.length >= 500) {
            const statsPill = document.getElementById('nst-coach-stats-pill');
            if (statsPill) {
                statsPill.textContent += ' (LIMITE 500)';
                statsPill.title = 'Attenzione: visualizzazione limitata a 500 iscrizioni. Utilizza i filtri per affinare la ricerca.';
            }
        }

    } catch (err) {
        console.error("Errore caricamento dashboard admin:", err);
        if (container) {
            container.innerHTML = `
                <div class="nst-card" style="color: var(--nst-danger); padding: 20px;">
                    Errore durante il caricamento generale: ${escapeHtml(err.message)}
                </div>
            `;
        }
    }
}

function aggiornaSelectCorsiCoach(corsiData) {
    const select = document.getElementById('nst-coach-course-select');
    if (!select) return;
    select.innerHTML = '<option value="ALL">TUTTI I CORSI</option>';
    corsiData.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.titolo.toUpperCase()} (${c.atleti.length} ATLETI)`;
        select.appendChild(opt);
    });
}

function filtraCorsoCoach(val) {
    const searchVal = document.getElementById('nst-coach-search-input')?.value || '';
    renderCoachCoursesList(coachCorsiAtleti, val, searchVal);
}

function cercaAtletiCoach(val) {
    const courseVal = document.getElementById('nst-coach-course-select')?.value || 'ALL';
    renderCoachCoursesList(coachCorsiAtleti, courseVal, val);
}

function renderCoachCoursesList(corsiData, filterCourseId = 'ALL', filterSearch = '') {
    const container = document.getElementById('nst-coach-atleti-container');
    if (!container) return;

    const term = (filterSearch || '').trim().toLowerCase();
    let totalAtletiCount = 0;

    let html = '';

    corsiData.forEach(corso => {
        if (filterCourseId !== 'ALL' && corso.id !== filterCourseId) {
            return;
        }

        // Filtra atleti per termine di ricerca
        const atletiFiltrati = (corso.atleti || []).filter(a => {
            if (!term) return true;
            const full = `${a.cognome} ${a.nome} ${a.email}`.toLowerCase();
            return full.includes(term);
        });

        totalAtletiCount += atletiFiltrati.length;

        html += `
            <div class="nst-coach-course-card" id="nst-course-card-${corso.id}">
                <div class="nst-coach-course-header">
                    <span class="nst-coach-course-title">
                        <span class="material-symbols-outlined">sports</span>
                        ${escapeHtml(corso.titolo)}
                    </span>
                    <span class="nst-coach-course-count">${atletiFiltrati.length} ATLETI</span>
                </div>
                <div class="nst-coach-athletes-grid">
        `;

        if (atletiFiltrati.length === 0) {
            html += `
                <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--nst-text-muted); font-size: 12px;">
                    Nessun atleta corrisponde ai criteri di ricerca in questo corso.
                </div>
            `;
        } else {
            atletiFiltrati.forEach(atleta => {
                const initial = (atleta.cognome ? atleta.cognome[0] : (atleta.nome ? atleta.nome[0] : 'A')).toUpperCase();
                const nomeCompleto = `${atleta.cognome} ${atleta.nome}`.trim() || 'Atleta Senza Nome';
                const haScheda = !!atleta.schedaAttiva;
                const badgeSchedaHtml = haScheda
                    ? `<span class="nst-atleta-badge active-scheda" title="${escapeHtml(atleta.schedaAttiva.titolo)}">SCHEDA: ${escapeHtml(atleta.schedaAttiva.titolo.slice(0, 18))}</span>`
                    : `<span class="nst-atleta-badge">NESSUNA SCHEDA</span>`;

                html += `
                    <div class="nst-coach-athlete-card">
                        <div class="nst-atleta-card-header">
                            <div class="nst-atleta-avatar">${initial}</div>
                            <div class="nst-atleta-card-info">
                                <div class="nst-atleta-card-name" title="${escapeHtml(nomeCompleto)}">${escapeHtml(nomeCompleto)}</div>
                                <div class="nst-atleta-card-email">${escapeHtml(atleta.email || 'Email non registrata')}</div>
                                <div class="nst-atleta-card-badges">
                                    ${badgeSchedaHtml}
                                    ${atleta.dataScadenza ? `<span class="nst-atleta-badge">SCAD: ${formatDate(atleta.dataScadenza)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <button type="button" class="nst-btn-open-atleta" data-atleta-id="${escapeHtml(atleta.id)}" data-atleta-nome="${escapeHtml(nomeCompleto)}" data-corso-titolo="${escapeHtml(corso.titolo)}" data-corso-id="${escapeHtml(corso.id)}">
                            <span>APRI SCHEDA ATLETA</span>
                            <span class="material-symbols-outlined" style="font-size: 16px;">arrow_forward</span>
                        </button>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;
    });

    if (!html) {
        html = `
            <div class="nst-card" style="text-align: center; padding: 30px; color: var(--nst-text-muted); font-size: 13px;">
                Nessun corso o atleta trovato con i filtri selezionati.
            </div>
        `;
    }

    container.innerHTML = html;

    // Event delegation per apertura scheda atleta senza inline onclick handlers
    if (!container._hasAthleteClickListener) {
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.nst-btn-open-atleta');
            if (btn) {
                const { atletaId, atletaNome, corsoTitolo, corsoId } = btn.dataset;
                if (atletaId) {
                    apriAtletaPerAllenatore(atletaId, atletaNome || 'Atleta', corsoTitolo || '', corsoId || '');
                }
            }
        });
        container._hasAthleteClickListener = true;
    }

    const statsPill = document.getElementById('nst-coach-stats-pill');
    if (statsPill) {
        statsPill.textContent = `${totalAtletiCount} ATLETI TOTALI`;
    }
}

// ---------------------------------------------------------------------------
// VISTA DETTAGLIO ATLETA PER COACH (ISPEZIONE METRICHE & GESTIONE SCHEDE)
// ---------------------------------------------------------------------------

async function apriAtletaPerAllenatore(atletaId, nomeCompleto, corsoTitolo, corsoId) {
    selectedCoachAtleta = {
        id: atletaId,
        nome: nomeCompleto,
        corsoTitolo: corsoTitolo,
        corsoId: corsoId
    };

    // Switch UI view
    document.getElementById('nst-coach-list-view')?.classList.add('nst-hidden');
    document.getElementById('nst-coach-atleta-view')?.classList.remove('nst-hidden');

    // Imposta info in testata
    const nameEl = document.getElementById('nst-coach-inspect-name');
    if (nameEl) nameEl.textContent = nomeCompleto.toUpperCase();
    const courseEl = document.getElementById('nst-coach-inspect-course');
    if (courseEl) courseEl.textContent = `CORSO: ${corsoTitolo.toUpperCase()}`;

    // Mostra per default il subpanel schede
    switchCoachSubpanel('schede');

    // Carica schede dell'atleta
    await caricaSchedeAtleta(atletaId, 'nst-coach-schede-history-list', true);

    // Carica metriche in sola lettura dell'atleta
    await caricaDatiAtletaPerCoach(atletaId);
}

function chiudiDettaglioAtletaPerCoach() {
    selectedCoachAtleta = null;
    document.getElementById('nst-coach-atleta-view')?.classList.add('nst-hidden');
    document.getElementById('nst-coach-list-view')?.classList.remove('nst-hidden');
}

function switchCoachSubpanel(subId) {
    coachSubpanelActive = subId;
    const subtabs = ['schede', 'peso', 'allenamenti', 'dieta', 'profilo'];
    subtabs.forEach(s => {
        const btn = document.getElementById(`nst-csub-btn-${s}`);
        const panel = document.getElementById(`nst-coach-subpanel-${s}`);
        if (s === subId) {
            btn?.classList.add('active');
            panel?.classList.remove('nst-hidden');
        } else {
            btn?.classList.remove('active');
            panel?.classList.add('nst-hidden');
        }
    });
}

async function caricaDatiAtletaPerCoach(atletaId) {
    try {
        // 1. Carica Peso & Misure
        const { data: pesiData } = await supabaseClient
            .from('nestore_pesi_misure')
            .select('*')
            .eq('utente_id', atletaId)
            .eq('attivo', true)
            .order('data_rilevazione', { ascending: false });

        const pesoSummaryEl = document.getElementById('nst-coach-peso-summary');
        const pesoTbody = document.getElementById('nst-coach-peso-tbody');
        if (pesiData && pesiData.length > 0) {
            const ultimo = pesiData[0];
            const pesoKg = ultimo.peso_kg ? `${ultimo.peso_kg} kg` : '--';
            const alt = ultimo.altezza_cm ? `${ultimo.altezza_cm} cm` : '--';
            const vita = ultimo.vita_cm ? `${ultimo.vita_cm} cm` : '--';
            const torace = ultimo.torace_cm ? `${ultimo.torace_cm} cm` : '--';
            const braccio = ultimo.braccio_dx_cm ? `${ultimo.braccio_dx_cm} cm` : '--';

            if (pesoSummaryEl) {
                pesoSummaryEl.innerHTML = `
                    <span>Peso attuale: <strong>${pesoKg}</strong></span>
                    <span>Altezza: <strong>${alt}</strong></span>
                    <span>Vita: <strong>${vita}</strong></span>
                    <span>Torace: <strong>${torace}</strong></span>
                    <span>Braccio: <strong>${braccio}</strong></span>
                    <span style="color:var(--nst-cyan); margin-left:auto;">${pesiData.length} rilevazioni registrate</span>
                `;
            }

            if (pesoTbody) {
                pesoTbody.innerHTML = pesiData.map(p => `
                    <tr>
                        <td>${formatDate(p.data_rilevazione)}</td>
                        <td style="color:var(--nst-cyan); font-weight:700;">${p.peso_kg || '--'}</td>
                        <td>${p.altezza_cm || '--'}</td>
                        <td>${p.vita_cm || '--'}</td>
                        <td>${p.torace_cm || '--'}</td>
                        <td>${p.braccio_dx_cm || '--'}</td>
                        <td>${p.fianchi_cm || '--'}</td>
                        <td style="color:var(--nst-text-muted);">${escapeHtml(p.note || '')}</td>
                    </tr>
                `).join('');
            }
        } else {
            if (pesoSummaryEl) pesoSummaryEl.innerHTML = '<span style="color:var(--nst-text-muted);">Nessun dato di peso o circonferenze registrato dall\'atleta.</span>';
            if (pesoTbody) pesoTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--nst-text-muted); padding:20px;">Nessuna misurazione presente.</td></tr>';
        }

        // 2. Carica Allenamenti & PR
        const { data: allData } = await supabaseClient
            .from('nestore_allenamenti')
            .select('*')
            .eq('utente_id', atletaId)
            .eq('attivo', true)
            .order('data_allenamento', { ascending: false });

        const prGrid = document.getElementById('nst-coach-pr-grid');
        const allTbody = document.getElementById('nst-coach-allenamenti-tbody');
        if (allData && allData.length > 0) {
            const records = calcolaRecordPersonali(allData);
            if (prGrid) {
                const keys = Object.keys(records);
                if (keys.length > 0) {
                    prGrid.innerHTML = keys.map(k => {
                        const rec = records[k];
                        const bestValStr = rec.tipo === 'carico' ? `${rec.peso} kg` : `${rec.ripetizioni} reps`;
                        const subValStr = rec.tipo === 'carico' ? `(${rec.ripetizioni} reps)` : '(corpo libero)';
                        return `
                            <div class="nst-pr-card">
                                <div class="nst-pr-exercise-name" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
                                <div class="nst-pr-card-body">
                                    <div class="nst-pr-best-val">${bestValStr}</div>
                                    <div class="nst-pr-sub-val">${subValStr}</div>
                                </div>
                                <div class="nst-pr-card-footer">
                                    <span>${formatDate(rec.data)}</span>
                                    <span>⚡ PR</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                } else {
                    prGrid.innerHTML = '<div style="color:var(--nst-text-muted); font-size:12px;">Nessun esercizio strutturato rilevato.</div>';
                }
            }

            if (allTbody) {
                allTbody.innerHTML = allData.map(a => `
                    <tr>
                        <td>${formatDate(a.data_allenamento)}</td>
                        <td style="color:var(--nst-lime); font-weight:700;">${escapeHtml(a.corso_disciplina || '--')}</td>
                        <td>${a.durata_minuti ? `${a.durata_minuti} min` : '--'}</td>
                        <td>${a.rpe_fatica ? `RPE ${a.rpe_fatica}/10` : '--'}</td>
                        <td style="max-width:300px; white-space:pre-wrap;">${escapeHtml(a.note || '--')}</td>
                    </tr>
                `).join('');
            }
        } else {
            if (prGrid) prGrid.innerHTML = '<div style="color:var(--nst-text-muted); font-size:12px;">Nessun allenamento registrato dall\'atleta.</div>';
            if (allTbody) allTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--nst-text-muted); padding:20px;">Nessuna sessione registrata.</td></tr>';
        }

        // 3. Carica Dieta & Pasti
        const { data: pastiData } = await supabaseClient
            .from('nestore_pasti')
            .select('*')
            .eq('utente_id', atletaId)
            .eq('attivo', true)
            .order('data_pasto', { ascending: false });

        const dietaSummaryEl = document.getElementById('nst-coach-dieta-summary');
        const dietaTbody = document.getElementById('nst-coach-dieta-tbody');
        if (pastiData && pastiData.length > 0) {
            const totKcal = pastiData.reduce((acc, p) => acc + (p.calorie_stimate || 0), 0);
            const totPro = pastiData.reduce((acc, p) => acc + (Number(p.proteine_g) || 0), 0);
            const totCarb = pastiData.reduce((acc, p) => acc + (Number(p.carboidrati_g) || 0), 0);
            const totFat = pastiData.reduce((acc, p) => acc + (Number(p.grassi_g) || 0), 0);

            if (dietaSummaryEl) {
                dietaSummaryEl.innerHTML = `
                    <span>Totale pasti registrati: <strong>${pastiData.length}</strong></span>
                    <span>Totale kcal tracciate: <strong style="color:var(--nst-cyan);">${totKcal} kcal</strong></span>
                    <span>Proteine: <strong>${totPro.toFixed(0)}g</strong></span>
                    <span>Carboidrati: <strong>${totCarb.toFixed(0)}g</strong></span>
                    <span>Grassi: <strong>${totFat.toFixed(0)}g</strong></span>
                `;
            }

            if (dietaTbody) {
                dietaTbody.innerHTML = pastiData.map(p => `
                    <tr>
                        <td>${formatDate(p.data_pasto)}</td>
                        <td style="color:#fff; font-weight:700; text-transform:uppercase;">${escapeHtml(p.tipo_pasto || '--')}</td>
                        <td>${escapeHtml(p.descrizione)}</td>
                        <td style="color:var(--nst-cyan); font-weight:700;">${p.calorie_stimate || '--'}</td>
                        <td>${p.carboidrati_g ? `${p.carboidrati_g}g` : '--'}</td>
                        <td>${p.proteine_g ? `${p.proteine_g}g` : '--'}</td>
                        <td>${p.grassi_g ? `${p.grassi_g}g` : '--'}</td>
                    </tr>
                `).join('');
            }
        } else {
            if (dietaSummaryEl) dietaSummaryEl.innerHTML = '<span style="color:var(--nst-text-muted);">Nessun pasto registrato dall\'atleta.</span>';
            if (dietaTbody) dietaTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--nst-text-muted); padding:20px;">Nessun pasto registrato.</td></tr>';
        }

        // 4. Carica Scheda AI (Wiki Karpathy)
        const { data: schedaAi } = await supabaseClient
            .from('nestore_scheda_atleta')
            .select('*')
            .eq('utente_id', atletaId)
            .maybeSingle();

        const wikiCardsEl = document.getElementById('nst-coach-wiki-cards');
        const wikiRawEl = document.getElementById('nst-coach-wiki-raw');

        if (schedaAi) {
            const bio = schedaAi.biometria || {};
            const all = schedaAi.allenamento || {};
            const nut = schedaAi.nutrizione || {};

            if (wikiCardsEl) {
                wikiCardsEl.innerHTML = `
                    <div class="nst-wiki-subcard">
                        <h4 class="nst-wiki-subcard-title cyan">
                            <span class="material-symbols-outlined" style="font-size: 16px;">monitor_weight</span>
                            BIOMETRIA &amp; METABOLISMO
                        </h4>
                        <div class="nst-wiki-stats-list">
                            <div class="nst-wiki-stat-row"><span>Età stimata:</span><strong>${bio.eta ? `${bio.eta} anni` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Sesso biologico:</span><strong>${bio.sesso || '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Altezza:</span><strong>${bio.altezza_cm ? `${bio.altezza_cm} cm` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Peso attuale:</span><strong>${bio.peso_attuale_kg ? `${bio.peso_attuale_kg} kg` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>BMI:</span><strong>${bio.bmi || '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>BMR stimato:</span><strong>${bio.bmr_kcal ? `${bio.bmr_kcal} kcal` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>TDEE stimato:</span><strong>${bio.tdee_kcal ? `${bio.tdee_kcal} kcal` : '--'}</strong></div>
                        </div>
                    </div>
                    <div class="nst-wiki-subcard">
                        <h4 class="nst-wiki-subcard-title lime">
                            <span class="material-symbols-outlined" style="font-size: 16px;">fitness_center</span>
                            PROFILO SPORTIVO
                        </h4>
                        <div class="nst-wiki-stats-list">
                            <div class="nst-wiki-stat-row"><span>Disciplina principale:</span><strong>${escapeHtml(all.disciplina_principale || '--')}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Frequenza settimanale:</span><strong>${all.frequenza_settimanale ? `${all.frequenza_settimanale} gg/sett` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Sessioni 30gg:</span><strong>${all.sessioni_ultimi_30gg ?? '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Intensità media (RPE):</span><strong>${all.rpe_medio ? `${all.rpe_medio}/10` : '--'}</strong></div>
                        </div>
                    </div>
                    <div class="nst-wiki-subcard">
                        <h4 class="nst-wiki-subcard-title amber">
                            <span class="material-symbols-outlined" style="font-size: 16px;">restaurant</span>
                            NUTRIZIONE &amp; TARGET
                        </h4>
                        <div class="nst-wiki-stats-list">
                            <div class="nst-wiki-stat-row"><span>Target calorie:</span><strong>${nut.target_calorie ? `${nut.target_calorie} kcal` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Target proteine:</span><strong>${nut.target_proteine_g ? `${nut.target_proteine_g}g` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Media assunta (30gg):</span><strong>${nut.media_calorie_30gg ? `${nut.media_calorie_30gg} kcal` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Proteine medie (30gg):</span><strong>${nut.media_proteine_30gg ? `${nut.media_proteine_30gg}g` : '--'}</strong></div>
                            <div class="nst-wiki-stat-row"><span>Giorni tracciati:</span><strong>${nut.giorni_tracciati_30gg ?? '--'}</strong></div>
                        </div>
                    </div>
                `;
            }
            if (wikiRawEl) {
                wikiRawEl.textContent = schedaAi.scheda_markdown || 'Nessuna sintesi markdown generata.';
            }
        } else {
            if (wikiCardsEl) wikiCardsEl.innerHTML = '<div style="color:var(--nst-text-muted); padding:16px;">Scheda AI Karpathy non ancora generata per questo atleta.</div>';
            if (wikiRawEl) wikiRawEl.textContent = 'In attesa di rilevazioni atleta...';
        }

    } catch (e) {
        console.error("Errore caricamento dati atleta per coach:", e);
    }
}

// ---------------------------------------------------------------------------
// GESTIONE SCHEDE DI ALLENAMENTO (UPLOAD, STORICIZZAZIONE & VISUALIZZAZIONE)
// ---------------------------------------------------------------------------

function selezionaModalitaScheda(mode) {
    const pillText = document.getElementById('nst-pill-mode-text');
    const pillFile = document.getElementById('nst-pill-mode-file');
    const pillLib = document.getElementById('nst-pill-mode-lib');
    const areaText = document.getElementById('nst-scheda-input-text-area');
    const areaFile = document.getElementById('nst-scheda-input-file-area');
    const areaLib = document.getElementById('nst-scheda-input-library-area');

    pillText?.classList.toggle('active', mode === 'text');
    pillFile?.classList.toggle('active', mode === 'file');
    pillLib?.classList.toggle('active', mode === 'library');

    const radio = document.querySelector(`input[name="nst-scheda-mode"][value="${mode}"]`);
    if (radio) radio.checked = true;

    if (mode === 'text') {
        areaText?.classList.remove('nst-hidden');
        areaFile?.classList.add('nst-hidden');
        areaLib?.classList.add('nst-hidden');
    } else if (mode === 'file') {
        areaFile?.classList.remove('nst-hidden');
        areaText?.classList.add('nst-hidden');
        areaLib?.classList.add('nst-hidden');
    } else if (mode === 'library') {
        areaLib?.classList.remove('nst-hidden');
        areaText?.classList.add('nst-hidden');
        areaFile?.classList.add('nst-hidden');
        popolaSelectProgrammiLibreriaPerScheda();
    }
}

function popolaSelectProgrammiLibreriaPerScheda() {
    const select = document.getElementById('nst-scheda-select-programma-lib');
    if (!select) return;
    
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Seleziona un programma di allenamento --</option>';

    const list = (typeof window !== 'undefined' && window.libreriaProgrammiTotali && window.libreriaProgrammiTotali.length > 0)
        ? window.libreriaProgrammiTotali
        : libreriaProgrammiTotali;
    const attivi = (list || []).filter(p => p.attivo !== false);
    attivi.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const tipoLabel = p.categoria === 'metcon' ? 'Metcon' : p.categoria === 'forza' ? 'Forza' : (p.tipo || 'Standard');
        opt.textContent = `${p.nome} [${tipoLabel.toUpperCase()}]`;
        select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
}

function gestisciSelezioneProgrammaPerScheda(progId) {
    const previewBox = document.getElementById('nst-scheda-programma-lib-preview');
    const titoloInput = document.getElementById('nst-scheda-titolo');
    const obiettivoInput = document.getElementById('nst-scheda-obiettivo');

    if (!progId) {
        if (previewBox) {
            previewBox.innerHTML = '';
            previewBox.style.display = 'none';
        }
        return;
    }

    const p = (libreriaProgrammiTotali || []).find(item => item.id === progId);
    if (!p) return;

    if (titoloInput && !titoloInput.value.trim()) {
        titoloInput.value = p.nome;
    }
    if (obiettivoInput && !obiettivoInput.value.trim() && p.descrizione) {
        obiettivoInput.value = p.descrizione;
    }

    if (previewBox) {
        let timerMeta = p.timer_mode === 'tabata' 
            ? `Tabata Timer: ${p.work_default || 30}" work / ${p.rest_default || 30}" rest • ${p.rounds_default || 8} rounds`
            : `Cronometro: Lap & Pausa${p.giri_target ? ` • Target: ${p.giri_target} giri` : ''}`;
        
        const exPreview = Array.isArray(p.esercizi) && p.esercizi.length > 0
            ? p.esercizi.map(ex => `<div style="padding: 2px 0;">• <strong>${escapeHtml(ex.nome)}</strong>: <span style="color:var(--nst-lime); font-family: 'Orbitron', monospace;">${escapeHtml(ex.target || '')}</span></div>`).join('')
            : '<div style="font-style: italic; color: var(--nst-text-muted);">Nessun esercizio specificato</div>';

        previewBox.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; color: #fff;">${escapeHtml(p.nome)}</span>
                <span class="nst-ibrido-badge ${p.categoria || 'standard'}" style="font-size: 9px;">${(p.categoria || p.tipo || 'STANDARD').toUpperCase()}</span>
            </div>
            <div style="font-size: 11px; color: var(--nst-cyan); margin-bottom: 8px; font-family: 'Orbitron', monospace;">
                <span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle;">timer</span> ${timerMeta}
            </div>
            ${p.descrizione ? `<div style="font-size: 11px; color: var(--nst-text-muted); margin-bottom: 10px;">${escapeHtml(p.descrizione)}</div>` : ''}
            <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 10px; font-size: 11px;">
                <div style="font-size: 10px; color: var(--nst-text-muted); margin-bottom: 4px; font-weight: 700;">SCHEMA ESERCIZI:</div>
                ${exPreview}
            </div>
        `;
        previewBox.style.display = 'block';
    }
}


function aggiornaConteggioTestoScheda(textarea) {
    const counter = document.getElementById('nst-scheda-char-count');
    if (counter) {
        counter.textContent = `${textarea.value.length} / 50000`;
    }
}

function gestisciFileSchedaCoach(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Controllo estensione
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.docx') && !fileName.endsWith('.doc')) {
        alert("Formato non supportato. Puoi caricare esclusivamente documenti Word (.docx o .doc).");
        event.target.value = '';
        selectedSchedaWordFile = null;
        return;
    }

    // Controllo anti-bloat: max 5 MB
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
        alert(`Il file selezionato (${(file.size / (1024 * 1024)).toFixed(2)} MB) supera il limite massimo di 5 MB consentito per evitare sprechi di memoria.`);
        event.target.value = '';
        selectedSchedaWordFile = null;
        return;
    }

    selectedSchedaWordFile = file;
    const badge = document.getElementById('nst-scheda-selected-file-name');
    if (badge) {
        badge.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        badge.classList.remove('nst-hidden');
    }
}

async function inviaNuovaSchedaCoach() {
    if (!selectedCoachAtleta) {
        alert("Nessun atleta selezionato.");
        return;
    }

    const titoloInput = document.getElementById('nst-scheda-titolo');
    const periodoInput = document.getElementById('nst-scheda-periodo');
    const obiettivoInput = document.getElementById('nst-scheda-obiettivo');
    const testoInput = document.getElementById('nst-scheda-testo-content');
    const modeRadio = document.querySelector('input[name="nst-scheda-mode"]:checked');
    const mode = modeRadio ? modeRadio.value : 'text';

    const titolo = (titoloInput?.value || '').trim();
    const periodo = (periodoInput?.value || '').trim();
    const obiettivo = (obiettivoInput?.value || '').trim();
    const testo = (testoInput?.value || '').trim();

    if (!titolo) {
        alert("Inserisci il titolo della scheda di allenamento.");
        titoloInput?.focus();
        return;
    }

    if (mode === 'text' && !testo) {
        alert("Inserisci il programma di allenamento nel riquadro di testo (o fai copia-incolla da Word).");
        testoInput?.focus();
        return;
    }

    if (mode === 'file' && !selectedSchedaWordFile) {
        alert("Seleziona un file Word (.docx o .doc) da caricare.");
        return;
    }

    let selectedProgrammaLibreriaId = null;
    if (mode === 'library') {
        const progSelect = document.getElementById('nst-scheda-select-programma-lib');
        selectedProgrammaLibreriaId = progSelect?.value;
        if (!selectedProgrammaLibreriaId) {
            alert("Seleziona un programma dalla libreria da assegnare all'atleta.");
            progSelect?.focus();
            return;
        }
    }

    const btn = document.getElementById('nst-btn-invia-scheda');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined nst-spin">progress_activity</span> SALVATAGGIO...';
    }

    try {
        let uploadedFilePath = null;
        let uploadedFileName = null;
        let uploadedFileSize = null;

        // Se è stato selezionato un file, effettua l'upload in Supabase Storage
        if (mode === 'file' && selectedSchedaWordFile) {
            const cleanName = selectedSchedaWordFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            uploadedFilePath = `${selectedCoachAtleta.id}/${Date.now()}_${cleanName}`;
            uploadedFileName = selectedSchedaWordFile.name;
            uploadedFileSize = selectedSchedaWordFile.size;

            const { error: upErr } = await supabaseClient.storage
                .from('schede_allenamento')
                .upload(uploadedFilePath, selectedSchedaWordFile, {
                    contentType: selectedSchedaWordFile.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    upsert: false
                });

            if (upErr) throw upErr;
        }

        // Storicizzazione: archivia (soft-delete) eventuali schede attive precedenti per questo atleta
        await supabaseClient
            .from('nestore_schede_allenamento')
            .update({ attivo: false, aggiornato_il: new Date().toISOString() })
            .eq('atleta_id', selectedCoachAtleta.id)
            .eq('attivo', true);

        // Inserimento nuova scheda
        const { error: insErr } = await supabaseClient
            .from('nestore_schede_allenamento')
            .insert({
                atleta_id: selectedCoachAtleta.id,
                allenatore_id: currentUser ? currentUser.id : null,
                titolo: titolo,
                periodo: periodo || null,
                obiettivo: obiettivo || null,
                contenuto_testo: mode === 'text' ? testo : null,
                file_nome: uploadedFileName,
                file_path: uploadedFilePath,
                file_dimensione: uploadedFileSize,
                programma_libreria_id: mode === 'library' ? selectedProgrammaLibreriaId : null,
                attivo: true
            });

        if (insErr) throw insErr;

        // Reset form
        if (titoloInput) titoloInput.value = '';
        if (periodoInput) periodoInput.value = '';
        if (obiettivoInput) obiettivoInput.value = '';
        if (testoInput) {
            testoInput.value = '';
            aggiornaConteggioTestoScheda(testoInput);
        }
        selectedSchedaWordFile = null;
        const fileInput = document.getElementById('nst-scheda-word-file');
        if (fileInput) fileInput.value = '';
        const badge = document.getElementById('nst-scheda-selected-file-name');
        if (badge) {
            badge.textContent = '';
            badge.classList.add('nst-hidden');
        }
        const libSelect = document.getElementById('nst-scheda-select-programma-lib');
        if (libSelect) libSelect.value = '';
        const libPreview = document.getElementById('nst-scheda-programma-lib-preview');
        if (libPreview) {
            libPreview.innerHTML = '';
            libPreview.style.display = 'none';
        }

        // Ricarica storico schede
        await caricaSchedeAtleta(selectedCoachAtleta.id, 'nst-coach-schede-history-list', true);
        alert("Scheda di allenamento assegnata con successo all'atleta!");

    } catch (err) {
        // Rollback: se il file è stato caricato su Storage ma l'insert a DB fallisce, rimuovi il file orfano
        if (uploadedFilePath) {
            try {
                await supabaseClient.storage.from('schede_allenamento').remove([uploadedFilePath]);
            } catch (cleanupErr) {
                console.warn("Impossibile rimuovere file Storage orfano:", cleanupErr);
            }
        }
        console.error("Errore salvataggio scheda:", err);
        alert("Errore durante il salvataggio della scheda: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">send</span><span>SALVA E ASSEGNA ALL\'ATLETA</span>';
        }
    }
}

async function archiviaSchedaCoach(schedaId) {
    if (!confirm("Sei sicuro di voler archiviare questa scheda? Rimarrà nello storico consultabile dell'atleta.")) {
        return;
    }
    try {
        const { error } = await supabaseClient
            .from('nestore_schede_allenamento')
            .update({ attivo: false, aggiornato_il: new Date().toISOString() })
            .eq('id', schedaId);

        if (error) throw error;

        if (selectedCoachAtleta) {
            await caricaSchedeAtleta(selectedCoachAtleta.id, 'nst-coach-schede-history-list', true);
        }
    } catch (err) {
        alert("Errore archiviazione scheda: " + err.message);
    }
}

async function scaricaFileScheda(filePath, fileName) {
    try {
        const { data, error } = await supabaseClient.storage
            .from('schede_allenamento')
            .createSignedUrl(filePath, 300);

        if (error) throw error;
        if (!data || !data.signedUrl) throw new Error("URL firmato non disponibile");

        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = fileName || 'scheda_allenamento.docx';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        alert("Errore download file scheda: " + err.message);
    }
}

function apriModalSchedaTesto(titolo, periodo, dataStr, autore, testo) {
    const titleEl = document.getElementById('nst-modal-scheda-title');
    const metaEl = document.getElementById('nst-modal-scheda-meta');
    const contentEl = document.getElementById('nst-modal-scheda-content');
    const modalEl = document.getElementById('nst-modal-scheda-view');

    if (titleEl) titleEl.textContent = titolo.toUpperCase();
    if (metaEl) {
        metaEl.innerHTML = `
            <span>Coach: <strong>${escapeHtml(autore)}</strong></span> |
            <span>Periodo: <strong>${escapeHtml(periodo || '--')}</strong></span> |
            <span>Assegnata: <strong>${dataStr}</strong></span>
        `;
    }
    if (contentEl) contentEl.textContent = testo || 'Nessun testo specificato.';
    if (modalEl) modalEl.classList.remove('nst-hidden');
}

function chiudiModalSchedaTesto() {
    const modalEl = document.getElementById('nst-modal-scheda-view');
    if (modalEl) modalEl.classList.add('nst-hidden');
}

function copiaTestoSchedaModal() {
    const contentEl = document.getElementById('nst-modal-scheda-content');
    if (!contentEl) return;
    navigator.clipboard.writeText(contentEl.textContent).then(() => {
        alert("Programma di allenamento copiato negli appunti!");
    }).catch(e => {
        alert("Errore copia: " + e.message);
    });
}

async function caricaSchedeAtleta(atletaId, containerId, isCoachView = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const { data: schede, error } = await supabaseClient
            .from('nestore_schede_allenamento')
            .select('*, allenatore:allenatore_id(nome, cognome), programma:programma_libreria_id(*)')
            .eq('atleta_id', atletaId)
            .order('attivo', { ascending: false })
            .order('creato_il', { ascending: false });

        if (error) throw error;

        // Aggiorna contatore badge
        const badgeId = isCoachView ? 'nst-coach-schede-count' : 'nst-atleta-schede-badge';
        const badgeEl = document.getElementById(badgeId);
        if (badgeEl) {
            badgeEl.textContent = `${(schede || []).length} SCHEDE`;
        }

        if (!schede || schede.length === 0) {
            container.innerHTML = `
                <div class="nst-card" style="text-align: center; padding: 30px; color: var(--nst-text-muted); font-size: 12px;">
                    <span class="material-symbols-outlined" style="font-size: 36px; margin-bottom: 8px; display: block; color: var(--nst-cyan);">assignment_late</span>
                    ${isCoachView ? 'Nessuna scheda ancora assegnata a questo atleta. Utilizza il form in alto per caricarne una.' : 'Nessuna scheda di allenamento attualmente assegnata dal tuo allenatore.'}
                </div>
            `;
            return;
        }

        let html = '';
        schede.forEach(s => {
            schedeCacheMap.set(s.id, s);
            if (s.programma && !libreriaProgrammiTotali.some(p => p.id === s.programma.id)) {
                libreriaProgrammiTotali.push(s.programma);
            }
            const isAttiva = s.attivo;
            const autoreNome = s.allenatore ? `${s.allenatore.cognome || ''} ${s.allenatore.nome || ''}`.trim() : 'Allenatore';
            const dataCaricamento = formatDate(s.creato_il);
            const statusClass = isAttiva ? 'attiva' : 'archiviata';
            const statusLabel = isAttiva ? 'SCHEDA ATTIVA' : 'ARCHIVIATA';
            const cardExtraClass = s.programma_libreria_id ? 'has-program' : '';

            // Se è collegato un programma della libreria, prepariamo la preview leggibile degli esercizi e del timer
            let progPreviewHtml = '';
            if (s.programma && Array.isArray(s.programma.esercizi) && s.programma.esercizi.length > 0) {
                const timerDesc = s.programma.timer_mode === 'tabata'
                    ? `Tabata: ${s.programma.work_default || 30}"w / ${s.programma.rest_default || 30}"r • ${s.programma.rounds_default || 8} giri`
                    : `Cronometro con Lap & Pausa${s.programma.giri_target ? ` • ${s.programma.giri_target} giri` : ''}`;
                
                progPreviewHtml = `
                    <div class="nst-coach-lib-ex-preview" style="margin-top: 10px; margin-bottom: 8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span style="font-size: 10px; color: var(--nst-cyan); font-family: 'Orbitron', sans-serif; font-weight: 700;">
                                <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">timer</span> ${timerDesc}
                            </span>
                            <span class="nst-ibrido-badge ${s.programma.categoria || 'standard'}" style="font-size: 9px;">${(s.programma.categoria || s.programma.tipo || 'PROGRAMMA').toUpperCase()}</span>
                        </div>
                        <div style="font-size: 11px; color: #94a3b8;">
                            ${s.programma.esercizi.map(ex => `<div>• <strong>${escapeHtml(ex.nome)}</strong>: <span style="color:var(--nst-lime); font-family: 'Orbitron', monospace;">${escapeHtml(ex.target || (ex.rip_target ? `${ex.serie_target || 4}x${ex.rip_target}` : ''))}</span></div>`).join('')}
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="nst-scheda-card ${statusClass} ${cardExtraClass}">
                    <div class="nst-scheda-card-header">
                        <div>
                            <div class="nst-scheda-title-text">${escapeHtml(s.titolo)}</div>
                            <div class="nst-scheda-meta-row" style="margin-top: 4px;">
                                ${s.periodo ? `<span class="nst-scheda-meta-item"><span class="material-symbols-outlined" style="font-size:14px;">date_range</span> ${escapeHtml(s.periodo)}</span>` : ''}
                                <span class="nst-scheda-meta-item"><span class="material-symbols-outlined" style="font-size:14px;">person</span> Coach: ${escapeHtml(autoreNome)}</span>
                                <span class="nst-scheda-meta-item"><span class="material-symbols-outlined" style="font-size:14px;">event</span> Assegnata il: ${dataCaricamento}</span>
                            </div>
                        </div>
                        <span class="nst-scheda-status-badge ${statusClass}">${statusLabel}</span>
                    </div>

                    ${s.obiettivo ? `
                        <div class="nst-scheda-desc">
                            <strong>Obiettivo / Note:</strong> ${escapeHtml(s.obiettivo)}
                        </div>
                    ` : ''}

                    ${progPreviewHtml}

                    <div class="nst-scheda-actions">
                        ${s.programma_libreria_id ? `
                            <button type="button" class="nst-btn-launch-workout" data-prog-id="${escapeHtml(s.programma_libreria_id)}" data-scheda-id="${escapeHtml(s.id)}" title="Apri e avvia il programma con il timer">
                                <span class="material-symbols-outlined">play_circle</span>
                                <span>AVVIA PROGRAMMA</span>
                            </button>
                        ` : ''}

                        ${s.contenuto_testo ? `
                            <button type="button" class="nst-btn-view-text" data-scheda-id="${escapeHtml(s.id)}">
                                <span class="material-symbols-outlined">visibility</span>
                                <span>VISUALIZZA PROGRAMMA</span>
                            </button>
                        ` : ''}

                        ${s.file_path ? `
                            <button type="button" class="nst-btn-download" data-file-path="${escapeHtml(s.file_path)}" data-file-nome="${escapeHtml(s.file_nome || 'scheda_allenamento.docx')}">
                                <span class="material-symbols-outlined">download</span>
                                <span>SCARICA FILE WORD (${escapeHtml(s.file_nome || '.docx')})</span>
                            </button>
                        ` : ''}

                        ${isCoachView && isAttiva ? `
                            <button type="button" class="nst-btn-archive" data-scheda-id="${escapeHtml(s.id)}" title="Archivia questa scheda (storicizzazione)">
                                <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">archive</span>
                                ARCHIVIA
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Event delegation per schede actions (visualizza, scarica, archivia, avvia programma)
        if (!container._hasSchedeClickListener) {
            container.addEventListener('click', (e) => {
                const launchBtn = e.target.closest('.nst-btn-launch-workout');
                if (launchBtn) {
                    const progId = launchBtn.dataset.progId;
                    if (progId) {
                        apriAnteprimaIbrido(progId);
                    }
                    return;
                }
                const viewBtn = e.target.closest('.nst-btn-view-text');
                if (viewBtn) {
                    const s = schedeCacheMap.get(viewBtn.dataset.schedaId);
                    if (s) {
                        const autoreNome = s.allenatore ? `${s.allenatore.cognome || ''} ${s.allenatore.nome || ''}`.trim() : 'Allenatore';
                        const dataCaricamento = formatDate(s.creato_il);
                        apriModalSchedaTesto(s.titolo, s.periodo || '', dataCaricamento, autoreNome, s.contenuto_testo || '');
                    }
                    return;
                }
                const dlBtn = e.target.closest('.nst-btn-download');
                if (dlBtn) {
                    scaricaFileScheda(dlBtn.dataset.filePath, dlBtn.dataset.fileNome);
                    return;
                }
                const archBtn = e.target.closest('.nst-btn-archive');
                if (archBtn) {
                    archiviaSchedaCoach(archBtn.dataset.schedaId);
                    return;
                }
            });
            container._hasSchedeClickListener = true;
        }

    } catch (err) {
        console.error("Errore caricamento schede atleta:", err);
        container.innerHTML = `<div class="nst-card" style="color:var(--nst-danger);">Errore caricamento schede: ${escapeHtml(err.message)}</div>`;
    }
}

// ===========================================================================
// SEZIONE MOTORE TIMER, CRONOMETRO & TABATA
// ===========================================================================

// --- 1. Sound Engine (Web Audio API senza file MP3 esterni) ---
const SoundEngine = {
    ctx: null,
    getCtx() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    },
    beep(freq = 880, durationMs = 150, type = 'sine') {
        try {
            const ctx = this.getCtx();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (durationMs / 1000));
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + (durationMs / 1000));
        } catch (e) {
            console.warn('Audio non riproducibile:', e);
        }
    },
    countdownBeep() { this.beep(880, 150, 'sine'); },
    workBuzzer() { this.beep(1200, 350, 'triangle'); },
    restBuzzer() { this.beep(650, 350, 'triangle'); },
    longBuzzer() { this.beep(440, 1000, 'sawtooth'); },
    finishFanfare() {
        this.beep(587, 150, 'triangle');
        setTimeout(() => this.beep(740, 150, 'triangle'), 150);
        setTimeout(() => this.beep(880, 450, 'triangle'), 300);
    }
};

// Toast di sistema per notifiche timer
function showTimerToast(message) {
    if (typeof document === 'undefined') return;
    let toast = document.getElementById('nst-timer-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'nst-timer-toast';
        toast.className = 'nst-timer-toast';
        if (document.body && typeof document.body.appendChild === 'function') {
            document.body.appendChild(toast);
        }
    }
    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;color:var(--nst-cyan);">timer</span> ${escapeHtml(message)}`;
    if (toast.style) {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            if (toast.style) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(-10px)';
            }
        }, 3500);
    }
}

// Modalità attiva: 'stopwatch' | 'tabata'
let currentTimerMode = localStorage.getItem('adr_timer_mode') || 'stopwatch';

function switchTimerMode(mode) {
    SoundEngine.getCtx(); // sblocca audio
    currentTimerMode = mode;
    localStorage.setItem('adr_timer_mode', mode);

    const btnStopwatch = document.getElementById('nst-mode-btn-stopwatch');
    const btnTabata = document.getElementById('nst-mode-btn-tabata');
    const cfgBox = document.getElementById('nst-tabata-config-box');
    const lapsContainer = document.getElementById('nst-stopwatch-laps-container');
    const metaRow = document.getElementById('nst-tabata-meta-row');
    const lapBtn = document.getElementById('nst-stopwatch-lap-btn');
    const skipBtn = document.getElementById('nst-tabata-skip-btn');

    if (mode === 'stopwatch') {
        if (btnStopwatch) btnStopwatch.classList.add('active');
        if (btnTabata) btnTabata.classList.remove('active');
        if (cfgBox) cfgBox.classList.add('nst-hidden');
        if (metaRow) metaRow.classList.add('nst-hidden');
        if (lapBtn) lapBtn.classList.remove('nst-hidden');
        if (skipBtn) skipBtn.classList.add('nst-hidden');
        timerEngine.updateUI();
    } else {
        if (btnStopwatch) btnStopwatch.classList.remove('active');
        if (btnTabata) btnTabata.classList.add('active');
        if (cfgBox) cfgBox.classList.remove('nst-hidden');
        if (lapsContainer) lapsContainer.classList.add('nst-hidden');
        if (metaRow) metaRow.classList.remove('nst-hidden');
        if (lapBtn) lapBtn.classList.add('nst-hidden');
        if (skipBtn) skipBtn.classList.remove('nst-hidden');
        tabataEngine.updateUI();
    }
    aggiornaVisibilitaDock();
}

// --- 2. Modulo Cronometro (Stopwatch) con auto-stop a 3 ore ---
const MAX_STOPWATCH_MS = 3 * 60 * 60 * 1000; // 3 ore esatte: 10.800.000 ms

const timerEngine = {
    state: {
        running: false,
        startTimestamp: null,
        elapsedBeforePause: 0,
        laps: []
    },
    loadState() {
        try {
            const raw = localStorage.getItem('adr_stopwatch_state');
            if (raw) {
                this.state = JSON.parse(raw);
                if (!Array.isArray(this.state.laps)) this.state.laps = [];
            }
        } catch (e) {
            console.error('Errore caricamento stato cronometro:', e);
        }
    },
    saveState() {
        try {
            localStorage.setItem('adr_stopwatch_state', JSON.stringify(this.state));
        } catch (e) {
            console.error('Errore salvataggio cronometro:', e);
        }
        aggiornaVisibilitaDock();
    },
    getElapsedMs() {
        if (!this.state.running || !this.state.startTimestamp) {
            return this.state.elapsedBeforePause || 0;
        }
        return (Date.now() - this.state.startTimestamp) + (this.state.elapsedBeforePause || 0);
    },
    start() {
        SoundEngine.getCtx();
        if (this.state.running) return;
        this.state.running = true;
        this.state.startTimestamp = Date.now();
        this.saveState();
        this.updateUI();
    },
    pause() {
        if (!this.state.running) return;
        this.state.elapsedBeforePause = this.getElapsedMs();
        this.state.running = false;
        this.state.startTimestamp = null;
        this.saveState();
        this.updateUI();
    },
    toggle() {
        if (this.state.running) {
            this.pause();
        } else {
            this.start();
        }
    },
    reset() {
        this.state.running = false;
        this.state.startTimestamp = null;
        this.state.elapsedBeforePause = 0;
        this.state.laps = [];
        this.saveState();
        this.updateUI();
    },
    autoStop() {
        this.state.running = false;
        this.state.startTimestamp = null;
        this.state.elapsedBeforePause = 0;
        this.saveState();
        this.updateUI();
        SoundEngine.longBuzzer();
        showTimerToast("CRONOMETRO: STOP E RESET AUTOMATICO DOPO 3 ORE");
    },
    lap() {
        if (!this.state.running) return;
        const totalMs = this.getElapsedMs();
        const lastTotal = this.state.laps.length > 0 ? this.state.laps[0].totalMs : 0;
        const splitMs = totalMs - lastTotal;
        const lapNumber = this.state.laps.length + 1;

        this.state.laps.unshift({
            number: lapNumber,
            splitMs,
            totalMs,
            timestamp: Date.now()
        });
        this.saveState();
        SoundEngine.beep(950, 100);
        this.updateUI();
    },
    clearLaps() {
        this.state.laps = [];
        this.saveState();
        this.updateUI();
    },
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const tenths = Math.floor((ms % 1000) / 100);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const pM = String(minutes).padStart(2, '0');
        const pS = String(seconds).padStart(2, '0');

        if (hours > 0) {
            const pH = String(hours).padStart(2, '0');
            return {
                main: `${pH}:${pM}:${pS}`,
                sub: `.${tenths}`
            };
        }
        return {
            main: `${pM}:${pS}`,
            sub: `.${tenths}`
        };
    },
    updateUI() {
        if (currentTimerMode !== 'stopwatch') return;

        const elapsedMs = this.getElapsedMs();

        // Controllo limite 3 ore
        if (this.state.running && elapsedMs >= MAX_STOPWATCH_MS) {
            this.autoStop();
            return;
        }

        const formatted = this.formatTime(elapsedMs);
        const digitsMain = document.getElementById('nst-timer-digits-main');
        const digitsSub = document.getElementById('nst-timer-digits-sub');
        const heroCard = document.getElementById('nst-timer-hero');
        const phaseBadge = document.getElementById('nst-timer-phase-badge');
        const phaseIcon = document.getElementById('nst-timer-phase-icon');
        const phaseText = document.getElementById('nst-timer-phase-text');
        const primaryBtn = document.getElementById('nst-timer-primary-btn');
        const primaryIcon = document.getElementById('nst-timer-primary-icon');
        const primaryLabel = document.getElementById('nst-timer-primary-label');
        const lapBtn = document.getElementById('nst-stopwatch-lap-btn');

        if (digitsMain) digitsMain.textContent = formatted.main;
        if (digitsSub) digitsSub.textContent = formatted.sub;

        if (heroCard) {
            heroCard.className = 'nst-timer-hero-card' + (this.state.running ? ' phase-work' : '');
        }

        if (phaseBadge && phaseText && phaseIcon) {
            phaseBadge.className = 'nst-phase-badge ' + (this.state.running ? 'work' : 'prep');
            phaseIcon.textContent = this.state.running ? 'timer' : 'pause_circle';
            phaseText.textContent = this.state.running ? 'CRONOMETRO IN CORSO' : (elapsedMs > 0 ? 'CRONOMETRO IN PAUSA' : 'CRONOMETRO PRONTO');
        }

        if (primaryBtn && primaryIcon && primaryLabel) {
            if (this.state.running) {
                primaryBtn.classList.add('is-running');
                primaryIcon.textContent = 'pause';
                primaryLabel.textContent = 'PAUSA';
            } else {
                primaryBtn.classList.remove('is-running');
                primaryIcon.textContent = 'play_arrow';
                primaryLabel.textContent = elapsedMs > 0 ? 'RIPRENDI' : 'AVVIA';
            }
        }

        if (lapBtn) {
            lapBtn.disabled = !this.state.running;
        }

        // Render Laps
        const lapsContainer = document.getElementById('nst-stopwatch-laps-container');
        const lapsBody = document.getElementById('nst-stopwatch-laps-body');
        if (lapsContainer && lapsBody) {
            if (this.state.laps.length > 0) {
                lapsContainer.classList.remove('nst-hidden');
                let fastestIndex = -1;
                let slowestIndex = -1;
                if (this.state.laps.length > 1) {
                    let minSplit = Infinity;
                    let maxSplit = -Infinity;
                    this.state.laps.forEach((l, idx) => {
                        if (l.splitMs < minSplit) { minSplit = l.splitMs; fastestIndex = idx; }
                        if (l.splitMs > maxSplit) { maxSplit = l.splitMs; slowestIndex = idx; }
                    });
                }

                lapsBody.innerHTML = this.state.laps.map((lap, idx) => {
                    const splitFmt = this.formatTime(lap.splitMs);
                    const totalFmt = this.formatTime(lap.totalMs);
                    let rowClass = '';
                    if (idx === fastestIndex) rowClass = 'lap-best';
                    else if (idx === slowestIndex) rowClass = 'lap-worst';

                    return `
                        <tr class="${rowClass}">
                            <td>GIRO ${lap.number} ${idx === fastestIndex ? '⚡' : ''}</td>
                            <td>+${splitFmt.main}${splitFmt.sub}</td>
                            <td>${totalFmt.main}${totalFmt.sub}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                lapsContainer.classList.add('nst-hidden');
                lapsBody.innerHTML = '';
            }
        }
    }
};

// --- 3. Modulo Tabata & Intervalli ---
const tabataEngine = {
    state: {
        running: false,
        phase: 'prep', // 'prep' | 'work' | 'rest' | 'done'
        phaseStartTimestamp: null,
        phaseElapsedBeforePause: 0,
        phaseDurationSec: 5,
        currentRound: 1,
        currentSet: 1,
        config: {
            prep: 5,
            work: 20,
            rest: 10,
            rounds: 8,
            sets: 1
        },
        lastBeepSecond: -1
    },
    loadState() {
        try {
            const raw = localStorage.getItem('adr_tabata_state');
            if (raw) {
                this.state = { ...this.state, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.error('Errore caricamento tabata:', e);
        }
    },
    saveState() {
        try {
            localStorage.setItem('adr_tabata_state', JSON.stringify(this.state));
        } catch (e) {
            console.error('Errore salvataggio tabata:', e);
        }
        aggiornaVisibilitaDock();
    },
    getPhaseElapsedMs() {
        if (!this.state.running || !this.state.phaseStartTimestamp) {
            return this.state.phaseElapsedBeforePause || 0;
        }
        return (Date.now() - this.state.phaseStartTimestamp) + (this.state.phaseElapsedBeforePause || 0);
    },
    start() {
        SoundEngine.getCtx();
        if (this.state.phase === 'done') {
            this.reset();
        }
        this.state.running = true;
        this.state.phaseStartTimestamp = Date.now();
        this.state.lastBeepSecond = -1;
        this.saveState();
        this.updateUI();
    },
    pause() {
        if (!this.state.running) return;
        this.state.phaseElapsedBeforePause = this.getPhaseElapsedMs();
        this.state.running = false;
        this.state.phaseStartTimestamp = null;
        this.saveState();
        this.updateUI();
    },
    toggle() {
        if (this.state.running) {
            this.pause();
        } else {
            this.start();
        }
    },
    reset() {
        this.state.running = false;
        this.state.phase = 'prep';
        this.state.phaseDurationSec = this.state.config.prep > 0 ? this.state.config.prep : this.state.config.work;
        if (this.state.config.prep === 0) this.state.phase = 'work';
        this.state.phaseStartTimestamp = null;
        this.state.phaseElapsedBeforePause = 0;
        this.state.currentRound = 1;
        this.state.currentSet = 1;
        this.state.lastBeepSecond = -1;
        this.saveState();
        this.updateUI();
    },
    skipPhase() {
        if (this.state.phase === 'done') return;
        this.avanzaFase();
    },
    avanzaFase() {
        this.state.phaseElapsedBeforePause = 0;
        this.state.phaseStartTimestamp = this.state.running ? Date.now() : null;
        this.state.lastBeepSecond = -1;

        if (this.state.phase === 'prep') {
            this.state.phase = 'work';
            this.state.phaseDurationSec = this.state.config.work;
            SoundEngine.workBuzzer();
        } else if (this.state.phase === 'work') {
            if (this.state.currentRound < this.state.config.rounds) {
                this.state.phase = 'rest';
                this.state.phaseDurationSec = this.state.config.rest;
                SoundEngine.restBuzzer();
            } else {
                // Fine del set
                if (this.state.currentSet < this.state.config.sets) {
                    this.state.currentSet++;
                    this.state.currentRound = 1;
                    this.state.phase = 'rest';
                    this.state.phaseDurationSec = this.state.config.rest * 2; // Recupero lungo tra set
                    SoundEngine.restBuzzer();
                } else {
                    // Fine allenamento
                    this.state.phase = 'done';
                    this.state.running = false;
                    this.state.phaseStartTimestamp = null;
                    SoundEngine.finishFanfare();
                    showTimerToast("ALLENAMENTO TABATA COMPLETATO!");
                }
            }
        } else if (this.state.phase === 'rest') {
            this.state.currentRound++;
            this.state.phase = 'work';
            this.state.phaseDurationSec = this.state.config.work;
            SoundEngine.workBuzzer();
        }

        this.saveState();
        this.updateUI();
    },
    tick() {
        if (!this.state.running) return;

        const elapsedMs = this.getPhaseElapsedMs();
        const durationMs = this.state.phaseDurationSec * 1000;
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const remainingSec = Math.ceil(remainingMs / 1000);

        // Suono acustico 3, 2, 1
        if (remainingSec <= 3 && remainingSec > 0 && remainingSec !== this.state.lastBeepSecond) {
            SoundEngine.countdownBeep();
            this.state.lastBeepSecond = remainingSec;
        }

        // Transizione fase a 0
        if (elapsedMs >= durationMs) {
            this.avanzaFase();
        }
    },
    updateUI() {
        if (currentTimerMode !== 'tabata') return;

        const elapsedMs = this.getPhaseElapsedMs();
        const durationMs = this.state.phaseDurationSec * 1000;
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const totalSeconds = Math.ceil(remainingMs / 1000);

        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        const tenths = Math.floor((remainingMs % 1000) / 100);

        const digitsMain = document.getElementById('nst-timer-digits-main');
        const digitsSub = document.getElementById('nst-timer-digits-sub');
        const heroCard = document.getElementById('nst-timer-hero');
        const phaseBadge = document.getElementById('nst-timer-phase-badge');
        const phaseIcon = document.getElementById('nst-timer-phase-icon');
        const phaseText = document.getElementById('nst-timer-phase-text');
        const primaryBtn = document.getElementById('nst-timer-primary-btn');
        const primaryIcon = document.getElementById('nst-timer-primary-icon');
        const primaryLabel = document.getElementById('nst-timer-primary-label');
        const skipBtn = document.getElementById('nst-tabata-skip-btn');

        if (digitsMain) digitsMain.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        if (digitsSub) digitsSub.textContent = `.${tenths}`;

        // Colorazione dinamica e stato
        let phaseName = 'PREPARAZIONE';
        let badgeClass = 'prep';
        let icon = 'hourglass_top';

        if (this.state.phase === 'work') {
            phaseName = 'LAVORO (WORK)';
            badgeClass = 'work';
            icon = 'directions_run';
        } else if (this.state.phase === 'rest') {
            phaseName = 'RIPOSO (REST)';
            badgeClass = 'rest';
            icon = 'airline_seat_recline_extra';
        } else if (this.state.phase === 'done') {
            phaseName = 'COMPLETATO!';
            badgeClass = 'done';
            icon = 'emoji_events';
        }

        if (heroCard) {
            heroCard.className = `nst-timer-hero-card phase-${this.state.phase}`;
        }

        if (phaseBadge && phaseText && phaseIcon) {
            phaseBadge.className = `nst-phase-badge ${badgeClass}`;
            phaseIcon.textContent = icon;
            phaseText.textContent = phaseName;
        }

        if (primaryBtn && primaryIcon && primaryLabel) {
            if (this.state.running) {
                primaryBtn.classList.add('is-running');
                primaryIcon.textContent = 'pause';
                primaryLabel.textContent = 'PAUSA';
            } else {
                primaryBtn.classList.remove('is-running');
                primaryIcon.textContent = 'play_arrow';
                primaryLabel.textContent = this.state.phase === 'done' ? 'RIPETI' : (elapsedMs > 0 ? 'RIPRENDI' : 'AVVIA');
            }
        }

        if (skipBtn) {
            skipBtn.disabled = this.state.phase === 'done';
        }

        // Metadati round/set
        const rEl = document.getElementById('nst-tabata-current-round');
        const totREl = document.getElementById('nst-tabata-total-rounds');
        const sEl = document.getElementById('nst-tabata-current-set');
        const totSEl = document.getElementById('nst-tabata-total-sets');
        const totTimeEl = document.getElementById('nst-tabata-total-time');

        if (rEl) rEl.textContent = this.state.currentRound;
        if (totREl) totREl.textContent = this.state.config.rounds;
        if (sEl) sEl.textContent = this.state.currentSet;
        if (totSEl) totSEl.textContent = this.state.config.sets;

        if (totTimeEl) {
            const singleSetSec = (this.state.config.work + this.state.config.rest) * this.state.config.rounds - this.state.config.rest;
            const totalSec = this.state.config.prep + (singleSetSec * this.state.config.sets) + ((this.state.config.sets - 1) * this.state.config.rest);
            const totM = Math.floor(totalSec / 60);
            const totS = totalSec % 60;
            totTimeEl.textContent = `${String(totM).padStart(2, '0')}:${String(totS).padStart(2, '0')}`;
        }
    }
};

// Handlers pulsanti UI
function gestisciTimerPrimaryClick() {
    if (currentTimerMode === 'stopwatch') {
        timerEngine.toggle();
    } else {
        tabataEngine.toggle();
    }
}

function gestisciTimerResetClick() {
    if (currentTimerMode === 'stopwatch') {
        timerEngine.reset();
    } else {
        tabataEngine.reset();
    }
}

function modificaTabataParam(param, delta) {
    const input = document.getElementById(`nst-cfg-${param}`);
    if (!input) return;
    let val = parseInt(input.value, 10) || 0;
    val = Math.max(parseInt(input.min, 10) || 0, Math.min(parseInt(input.max, 10) || 300, val + delta));
    input.value = val;
    aggiornaConfigDaInput();
}

function aggiornaConfigDaInput() {
    const prep = parseInt(document.getElementById('nst-cfg-prep')?.value, 10) || 5;
    const work = parseInt(document.getElementById('nst-cfg-work')?.value, 10) || 20;
    const rest = parseInt(document.getElementById('nst-cfg-rest')?.value, 10) || 10;
    const rounds = parseInt(document.getElementById('nst-cfg-rounds')?.value, 10) || 8;
    const sets = parseInt(document.getElementById('nst-cfg-sets')?.value, 10) || 1;

    tabataEngine.state.config = { prep, work, rest, rounds, sets };
    if (!tabataEngine.state.running) {
        tabataEngine.reset();
    } else {
        tabataEngine.saveState();
        tabataEngine.updateUI();
    }
}

function tabataApplyPreset(presetName) {
    const presets = {
        'tabata_classic': { prep: 5, work: 20, rest: 10, rounds: 8, sets: 1 },
        'hiit_30_15': { prep: 5, work: 30, rest: 15, rounds: 10, sets: 1 },
        'emom_50_10': { prep: 10, work: 50, rest: 10, rounds: 5, sets: 1 },
        'hard_40_20': { prep: 5, work: 40, rest: 20, rounds: 6, sets: 1 }
    };

    const p = presets[presetName];
    if (!p) return;

    if (document.getElementById('nst-cfg-prep')) document.getElementById('nst-cfg-prep').value = p.prep;
    if (document.getElementById('nst-cfg-work')) document.getElementById('nst-cfg-work').value = p.work;
    if (document.getElementById('nst-cfg-rest')) document.getElementById('nst-cfg-rest').value = p.rest;
    if (document.getElementById('nst-cfg-rounds')) document.getElementById('nst-cfg-rounds').value = p.rounds;
    if (document.getElementById('nst-cfg-sets')) document.getElementById('nst-cfg-sets').value = p.sets;

    tabataEngine.state.config = { ...p };
    tabataEngine.reset();
    SoundEngine.beep(880, 150);
}

// --- 4. Floating Dock Controller (Cross-page & Mini-widget) ---
function aggiornaVisibilitaDock() {
    const dockEl = document.getElementById('nst-timer-dock');
    if (!dockEl) return;

    // Controlla se il pannello timer è attualmente visibile a tutto schermo
    const timerPanel = document.getElementById('nst-timer-panel');
    const isTimerPanelVisible = timerPanel && !timerPanel.classList.contains('nst-hidden');

    const isStopwatchActive = timerEngine.state.running || timerEngine.getElapsedMs() > 0;
    const isTabataActive = tabataEngine.state.running || (tabataEngine.state.phase !== 'prep' && tabataEngine.state.phase !== 'done');

    const shouldShow = (!isTimerPanelVisible) && (isStopwatchActive || isTabataActive || ibridoSessionMinimized);

    if (shouldShow) {
        dockEl.classList.remove('nst-hidden');
        aggiornaDatiDock();
    } else {
        dockEl.classList.add('nst-hidden');
    }
}

function aggiornaDatiDock() {
    const modeLabel = document.getElementById('nst-dock-mode-label');
    const modeText = document.getElementById('nst-dock-mode-text');
    const timeText = document.getElementById('nst-dock-time-text');
    const toggleIcon = document.getElementById('nst-dock-toggle-icon');

    if (!timeText || !modeText) return;

    if (currentTimerMode === 'tabata') {
        const elapsedMs = tabataEngine.getPhaseElapsedMs();
        const durationMs = tabataEngine.state.phaseDurationSec * 1000;
        const remainingMs = Math.max(0, durationMs - elapsedMs);
        const sec = Math.ceil(remainingMs / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const tenths = Math.floor((remainingMs % 1000) / 100);

        modeText.textContent = `TABATA: ${tabataEngine.state.phase.toUpperCase()} (R${tabataEngine.state.currentRound}/${tabataEngine.state.config.rounds})`;
        timeText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
        if (modeLabel) modeLabel.className = `nst-dock-mode ${tabataEngine.state.phase}`;
        if (toggleIcon) toggleIcon.textContent = tabataEngine.state.running ? 'pause' : 'play_arrow';
    } else {
        const elapsedMs = timerEngine.getElapsedMs();
        const fmt = timerEngine.formatTime(elapsedMs);
        modeText.textContent = timerEngine.state.running ? 'CRONOMETRO' : 'CRONO IN PAUSA';
        timeText.textContent = `${fmt.main}${fmt.sub}`;
        if (modeLabel) modeLabel.className = 'nst-dock-mode';
        if (toggleIcon) toggleIcon.textContent = timerEngine.state.running ? 'pause' : 'play_arrow';
    }
}

function dockToggleTimer() {
    if (currentTimerMode === 'stopwatch') {
        timerEngine.toggle();
    } else {
        tabataEngine.toggle();
    }
    aggiornaDatiDock();
}

function dockExpandTimer() {
    if (ibridoSelezionato && ibridoSessionMinimized) {
        const modal = document.getElementById('nst-ibrido-active-modal');
        if (modal) modal.classList.remove('nst-hidden');
        ibridoSessionMinimized = false;
        if (typeof window !== 'undefined') window.ibridoSessionMinimized = false;
        aggiornaVisibilitaDock();
    } else {
        switchNestorePanel('timer');
    }
}

// --- 5. Render Loop Master (RAF + Background Interval) ---
function masterTimerLoop() {
    if (timerEngine.state.running) {
        timerEngine.updateUI();
    }
    if (tabataEngine.state.running) {
        tabataEngine.tick();
        tabataEngine.updateUI();
    }
    aggiornaModalWorkoutAttivo();
    aggiornaIbridoModalAttivo();
    aggiornaVisibilitaDock();
    requestAnimationFrame(masterTimerLoop);
}

// Tick di sicurezza in background ogni 250ms (se il browser riduce il RAF tab inattivo)
setInterval(() => {
    if (timerEngine.state.running) {
        const elapsed = timerEngine.getElapsedMs();
        if (elapsed >= MAX_STOPWATCH_MS) {
            timerEngine.autoStop();
        }
    }
    if (tabataEngine.state.running) {
        tabataEngine.tick();
    }
}, 250);

// Sincronizzazione multi-tab
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (e) => {
        if (e.key === 'adr_stopwatch_state') {
            timerEngine.loadState();
            timerEngine.updateUI();
        } else if (e.key === 'adr_tabata_state') {
            tabataEngine.loadState();
            tabataEngine.updateUI();
        } else if (e.key === 'adr_timer_mode') {
            currentTimerMode = e.newValue || 'stopwatch';
            switchTimerMode(currentTimerMode);
        }
        aggiornaVisibilitaDock();
    });
}

// Inizializzazione Timer all'avvio
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => {
        timerEngine.loadState();
        tabataEngine.loadState();

    // Sincronizza i campi input con la config salvata
    if (document.getElementById('nst-cfg-prep')) document.getElementById('nst-cfg-prep').value = tabataEngine.state.config.prep;
    if (document.getElementById('nst-cfg-work')) document.getElementById('nst-cfg-work').value = tabataEngine.state.config.work;
    if (document.getElementById('nst-cfg-rest')) document.getElementById('nst-cfg-rest').value = tabataEngine.state.config.rest;
    if (document.getElementById('nst-cfg-rounds')) document.getElementById('nst-cfg-rounds').value = tabataEngine.state.config.rounds;
    if (document.getElementById('nst-cfg-sets')) document.getElementById('nst-cfg-sets').value = tabataEngine.state.config.sets;

    switchTimerMode(currentTimerMode);

    // Se l'hash nell'URL è #timer o param ?panel=timer, apri subito il timer
    const urlParams = new URLSearchParams(window.location.search);
    if (window.location.hash === '#timer' || urlParams.get('panel') === 'timer') {
        switchNestorePanel('timer');
    }

    requestAnimationFrame(masterTimerLoop);
    });
}

// Window Exports
window.impostaRangeCard = impostaRangeCard;
window.switchNestorePanel = switchNestorePanel;
window.toggleInputVocale = toggleInputVocale;
window.caricaMessaggiPrecedenti = caricaMessaggiPrecedenti;
window.gestisciInputConteggio = gestisciInputConteggio;
window.ancoraChatInAlto = ancoraChatInAlto;
window.switchTimerMode = switchTimerMode;
window.timerEngine = timerEngine;
window.tabataEngine = tabataEngine;
// ===========================================================================
// SEZIONE ALLENAMENTI STANDARD & BENCHMARK (INVICTUS)
// ===========================================================================

let invictusPullBase = 5;

function modificaInvictusPull(delta) {
    invictusPullBase = Math.max(1, Math.min(100, invictusPullBase + delta));
    const pullEl = document.getElementById('nst-invictus-pull-val');
    const targetPullEl = document.getElementById('nst-invictus-target-pull');
    const targetPushEl = document.getElementById('nst-invictus-target-push');
    const targetSquatEl = document.getElementById('nst-invictus-target-squat');

    if (pullEl) pullEl.textContent = invictusPullBase;
    if (targetPullEl) targetPullEl.textContent = invictusPullBase;
    if (targetPushEl) targetPushEl.textContent = invictusPullBase * 2;
    if (targetSquatEl) targetSquatEl.textContent = invictusPullBase * 4;
}

function apriAnteprimaInvictus() {
    const modal = document.getElementById('nst-invictus-preview-modal');
    if (modal) modal.classList.remove('nst-hidden');
}

function chiudiAnteprimaInvictus() {
    const modal = document.getElementById('nst-invictus-preview-modal');
    if (modal) modal.classList.add('nst-hidden');
}

function avviaAllenamentoInvictus() {
    chiudiAnteprimaInvictus();
    // 1. Configura target nella modale
    const pullReps = invictusPullBase;
    const pushReps = invictusPullBase * 2;
    const squatReps = invictusPullBase * 4;

    const pullEl = document.getElementById('nst-modal-pull-reps');
    const pushEl = document.getElementById('nst-modal-push-reps');
    const squatEl = document.getElementById('nst-modal-squat-reps');
    if (pullEl) pullEl.textContent = pullReps;
    if (pushEl) pushEl.textContent = pushReps;
    if (squatEl) squatEl.textContent = squatReps;

    // 2. Ripristina vista running e nasconde vista save
    const runningView = document.getElementById('nst-workout-running-view');
    const saveView = document.getElementById('nst-workout-save-view');
    if (runningView) runningView.classList.remove('nst-hidden');
    if (saveView) saveView.classList.add('nst-hidden');

    const noteInput = document.getElementById('nst-workout-note-input');
    if (noteInput) noteInput.value = '';

    // 3. Resetta e avvia cronometro nativo
    currentTimerMode = 'stopwatch';
    timerEngine.reset();
    renderModalLapsList();
    timerEngine.start();

    // 4. Mostra modale overlay
    const modal = document.getElementById('nst-active-workout-modal');
    if (modal) modal.classList.remove('nst-hidden');

    aggiornaModalWorkoutAttivo();
}

function renderModalLapsList() {
    const listEl = document.getElementById('nst-modal-laps-list');
    const countEl = document.getElementById('nst-modal-laps-count');
    if (!listEl) return;

    const laps = timerEngine.state.laps || [];
    if (countEl) countEl.textContent = `${laps.length} Lap`;

    if (laps.length === 0) {
        listEl.innerHTML = `<div class="nst-modal-laps-empty">Nessun intertempo registrato. Premi "GIRO (LAP)" durante l'esercizio.</div>`;
        return;
    }

    listEl.innerHTML = laps.map(l => {
        const splitF = timerEngine.formatTime(l.splitMs);
        const totalF = timerEngine.formatTime(l.totalMs);
        return `
            <div class="nst-modal-lap-row">
                <span class="lap-num">LAP ${l.number}</span>
                <span class="lap-split">+${splitF.main}${splitF.sub}</span>
                <span class="lap-total">${totalF.main}${totalF.sub}</span>
            </div>
        `;
    }).join('');
}

function gestisciWorkoutModalPausa() {
    timerEngine.toggle();
    aggiornaModalWorkoutAttivo();
}

function gestisciWorkoutModalLap() {
    if (!timerEngine.state.running) return;
    timerEngine.lap();
    renderModalLapsList();
}

function aggiornaModalWorkoutAttivo() {
    const modal = document.getElementById('nst-active-workout-modal');
    if (!modal || modal.classList.contains('nst-hidden')) return;

    const elapsedMs = timerEngine.getElapsedMs();
    const formatted = timerEngine.formatTime(elapsedMs);
    const textEl = document.getElementById('nst-modal-timer-text');
    if (textEl) textEl.textContent = `${formatted.main}${formatted.sub}`;

    const statusEl = document.getElementById('nst-modal-timer-status');
    const dotEl = document.getElementById('nst-modal-status-dot');
    const pauseIcon = document.getElementById('nst-modal-pause-icon');
    const pauseText = document.getElementById('nst-modal-pause-text');

    if (timerEngine.state.running) {
        if (statusEl) statusEl.textContent = 'CRONOMETRO IN CORSO';
        if (dotEl) {
            dotEl.style.backgroundColor = 'var(--nst-lime)';
            dotEl.classList.add('pulse');
        }
        if (pauseIcon) pauseIcon.textContent = 'pause';
        if (pauseText) pauseText.textContent = 'PAUSA';
    } else {
        if (statusEl) statusEl.textContent = 'CRONOMETRO IN PAUSA';
        if (dotEl) {
            dotEl.style.backgroundColor = 'var(--nst-amber)';
            dotEl.classList.remove('pulse');
        }
        if (pauseIcon) pauseIcon.textContent = 'play_arrow';
        if (pauseText) pauseText.textContent = 'RIPRENDI';
    }
}

function terminaAllenamentoAttivo() {
    // 1. Pausa il cronometro
    timerEngine.pause();

    // 2. Prepara riepilogo
    const elapsedMs = timerEngine.getElapsedMs();
    const formatted = timerEngine.formatTime(elapsedMs);
    const timeFinalEl = document.getElementById('nst-save-final-time');
    if (timeFinalEl) timeFinalEl.textContent = `${formatted.main}${formatted.sub}`;

    const repsFinalEl = document.getElementById('nst-save-final-reps');
    if (repsFinalEl) repsFinalEl.textContent = `${invictusPullBase} Pull-up / ${invictusPullBase * 2} Push-up / ${invictusPullBase * 4} Air Squat`;

    // 3. Commuta vista modale
    const runningView = document.getElementById('nst-workout-running-view');
    const saveView = document.getElementById('nst-workout-save-view');
    if (runningView) runningView.classList.add('nst-hidden');
    if (saveView) saveView.classList.remove('nst-hidden');
}

function annullaSalvataggioWorkout() {
    const runningView = document.getElementById('nst-workout-running-view');
    const saveView = document.getElementById('nst-workout-save-view');
    if (runningView) runningView.classList.remove('nst-hidden');
    if (saveView) saveView.classList.add('nst-hidden');
}

async function confermaSalvaAllenamentoStandard() {
    const saveBtn = document.getElementById('nst-btn-confirm-save-workout');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="material-symbols-outlined nst-spin">progress_activity</span><span>SALVATAGGIO...</span>`;
    }

    try {
        const elapsedMs = timerEngine.getElapsedMs();
        const durataMinuti = Math.max(1, Math.round(elapsedMs / 60000));
        const oggi = new Date().toISOString().split('T')[0];

        const pullReps = invictusPullBase;
        const pushReps = invictusPullBase * 2;
        const squatReps = invictusPullBase * 4;

        const schedaDati = [
            { nome: 'Pull-up', ripetizioni: pullReps, serie: 1, peso_kg: 0 },
            { nome: 'Push-up', ripetizioni: pushReps, serie: 1, peso_kg: 0 },
            { nome: 'Air Squat', ripetizioni: squatReps, serie: 1, peso_kg: 0 }
        ];

        const noteInput = document.getElementById('nst-workout-note-input');
        const userNote = noteInput ? noteInput.value.trim() : '';
        const noteFinale = userNote || 'Benchmark Workout INVICTUS completato.';

        const { error } = await supabaseClient.from('nestore_allenamenti').insert({
            utente_id: currentUser.id,
            data_allenamento: oggi,
            corso_disciplina: 'Invictus',
            durata_minuti: durataMinuti,
            scheda_dati: schedaDati,
            note: noteFinale
        });

        if (error) throw error;

        // Feedback successo
        timerEngine.reset();
        const modal = document.getElementById('nst-active-workout-modal');
        if (modal) modal.classList.add('nst-hidden');

        showTimerToast("✓ ALLENAMENTO INVICTUS SALVATO CON SUCCESSO!");
        await caricaKpiDashboard();

        // Se ci troviamo sul pannello allenamenti, aggiorna la griglia PR
        if (typeof renderGraficoAllenamenti === 'function') {
            await renderGraficoAllenamenti();
        }

        // Ricalcolo asincrono scheda atleta
        fetch('/api/nestore-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'recalculate_wiki' })
        }).catch(err => console.warn('Ricalcolo asincrono non critico:', err));

    } catch (e) {
        console.error("Errore salvataggio allenamento standard:", e);
        alert("Errore durante il salvataggio: " + e.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span class="material-symbols-outlined">save</span><span>CONFERMA E SALVA ALLENAMENTO</span>`;
        }
    }
}

function chiudiModalWorkoutAttivo() {
    if (!confirm("Attenzione: sei sicuro di voler annullare l'allenamento? Tutti i progressi e il tempo registrato andranno persi.")) {
        return;
    }
    timerEngine.reset();
    const modal = document.getElementById('nst-active-workout-modal');
    if (modal) modal.classList.add('nst-hidden');
}

// ===========================================================================
// SEZIONE PROGRAMMI UFFICIALI CORSO IBRIDO BASE (METCON 1-4 & FORZA 1-4)
// ===========================================================================

let libreriaProgrammiTotali = [];
let IBRIDO_PROGRAMMI_CATALOGO = [
    {
        id: 'ibrido_metcon_1',
        nome: 'Metcon 1',
        tipo: 'metcon',
        timer_mode: 'tabata',
        work_default: 30,
        rest_default: 30,
        rounds_default: 40,
        descrizione: '30" work + 30" rest (Giro 60"), 40 giri tot. Riscaldamento dinamico 10\'.',
        esercizi: [
            { nome: 'PULL', target: '15 rip' },
            { nome: 'Assault Bike', target: '60 cal/rpm' },
            { nome: 'Swing 16kg', target: '15 rip' },
            { nome: 'Vogatore', target: '20 cal/m' },
            { nome: 'Stacchi 90kg', target: '4 rip' },
            { nome: 'C+J Manubrio 20kg', target: '3+3 rip' }
        ]
    },
    {
        id: 'ibrido_forza_1',
        nome: 'Forza 1',
        tipo: 'forza',
        timer_mode: 'stopwatch',
        descrizione: 'Panca Piana, Squat, Jump Max, Trazioni Pesate. Rispettare i riposi lunghi e non fuggire dal peso.',
        esercizi: [
            { nome: 'Panca Piana', target: 'Risc. 1x10@90kg, salita (100, 110, 120, 125) → Target: 4x5 @ 105kg', serie_target: 4, rip_target: 5, peso_target: 105 },
            { nome: 'Squat', target: 'Risc. 1x10@100kg, salita (110, 120) → Target: 4x4 @ 130kg', serie_target: 4, rip_target: 4, peso_target: 130 },
            { nome: 'Jump Max', target: '5 salti massimali', serie_target: 1, rip_target: 5, peso_target: 0 },
            { nome: 'Trazioni Pesate', target: 'Risc. 1x21@0kg → Target: 4x6 @ +20kg', serie_target: 4, rip_target: 6, peso_target: 20 }
        ]
    },
    {
        id: 'ibrido_metcon_2',
        nome: 'Metcon 2',
        tipo: 'metcon',
        timer_mode: 'tabata',
        work_default: 30,
        rest_default: 30,
        rounds_default: 7,
        tempo_target: '42 min',
        descrizione: '30" work + 30" rest (Giro 60"), 7 giri tot, tempo target 42\'. Riscaldamento dinamico 10\'.',
        esercizi: [
            { nome: 'Pull', target: '15 rip' },
            { nome: 'Burpees', target: '8 rip' },
            { nome: 'Push', target: '20 rip' },
            { nome: 'Swing', target: '15 rip' },
            { nome: 'Dip', target: '10 rip' },
            { nome: 'Box Jump', target: '10 rip' }
        ]
    },
    {
        id: 'ibrido_forza_2',
        nome: 'Forza 2',
        tipo: 'forza',
        timer_mode: 'stopwatch',
        descrizione: 'Spinte Manubri 15°, Stacco da terra, Jump Max, Rematore Bilanciere.',
        esercizi: [
            { nome: 'Spinte Manubri 15°', target: 'Salita con manubri (30, 35kg) → Target: 4x4 @ 42kg', serie_target: 4, rip_target: 4, peso_target: 42 },
            { nome: 'Stacco da terra', target: 'Risc. 1x10@140kg, salita (160, 180, 200kg) → Target: 4x5 @ 160kg', serie_target: 4, rip_target: 5, peso_target: 160 },
            { nome: 'Jump Max', target: '5 salti massimali', serie_target: 1, rip_target: 5, peso_target: 0 },
            { nome: 'Rematore Bilanciere', target: 'Risc. 1x10@55kg, salita (65, 75, 85, 95kg) → Target: 4x4 @ 85kg', serie_target: 4, rip_target: 4, peso_target: 85 }
        ]
    },
    {
        id: 'ibrido_metcon_3',
        nome: 'Metcon 3',
        tipo: 'metcon',
        timer_mode: 'stopwatch',
        tempo_target: '40 min',
        giri_target: 20,
        descrizione: 'Unbroken, Giro no Time, 20 giri tot, tempo target 40\'. Riscaldamento dinamico 10\'.',
        esercizi: [
            { nome: 'Muscle Up', target: '1 rip' },
            { nome: 'Pull', target: '2 rip' },
            { nome: 'Push', target: '5 rip' },
            { nome: 'Burpee to Bar', target: '5 rip' },
            { nome: 'Air Squat', target: '10 rip' }
        ]
    },
    {
        id: 'ibrido_forza_3',
        nome: 'Forza 3',
        tipo: 'forza',
        timer_mode: 'stopwatch',
        descrizione: 'Panca Piana, Squat, Jump Max, Trazioni Pesate con sovraccarico.',
        esercizi: [
            { nome: 'Panca Piana', target: 'Risc. 1x10@90kg, salita (100, 110, 120, 125) → Target: 4x4 @ 105kg', serie_target: 4, rip_target: 4, peso_target: 105 },
            { nome: 'Squat', target: 'Risc. 1x10@100kg, salita (110, 120) → Target: 4x4 @ 120kg', serie_target: 4, rip_target: 4, peso_target: 120 },
            { nome: 'Jump Max', target: '5 salti massimali', serie_target: 1, rip_target: 5, peso_target: 0 },
            { nome: 'Trazioni Pesate', target: 'Risc. 1x22@0kg → Target: 4x6 @ +22kg', serie_target: 4, rip_target: 6, peso_target: 22 }
        ]
    },
    {
        id: 'ibrido_metcon_4',
        nome: 'Metcon 4',
        tipo: 'metcon',
        timer_mode: 'tabata',
        work_default: 25,
        rest_default: 35,
        rounds_default: 7,
        tempo_target: '42 min',
        descrizione: 'Isometrico, 25" work + 35" rest (Giro 60"), 7 giri tot, tempo target 42\'. Riscaldamento dinamico 10\'.',
        esercizi: [
            { nome: 'Pull', target: 'max rep' },
            { nome: 'Affondi SX + OH', target: 'max rep' },
            { nome: 'Push', target: 'max rep' },
            { nome: 'Affondi DX + OH', target: 'max rep' },
            { nome: 'DIP', target: 'max rep' },
            { nome: 'Good Morning KET 16kg', target: 'max rep' }
        ]
    },
    {
        id: 'ibrido_forza_4',
        nome: 'Forza 4',
        tipo: 'forza',
        timer_mode: 'stopwatch',
        descrizione: 'Lento Avanti, Stacco da terra, Jump Max, Rematore Bilanciere.',
        esercizi: [
            { nome: 'Lento Avanti', target: 'Risc. 1x10@50kg, salita (60, 80kg) → Target: 4x5 @ 65kg', serie_target: 4, rip_target: 5, peso_target: 65 },
            { nome: 'Stacco da terra', target: 'Risc. 1x10@140kg, salita (160, 180, 190kg) → Target: 4x4 @ 160kg', serie_target: 4, rip_target: 4, peso_target: 160 },
            { nome: 'Jump Max', target: '5 salti massimali', serie_target: 1, rip_target: 5, peso_target: 0 },
            { nome: 'Rematore Bilanciere', target: 'Salita serie → Target: 4x10 @ 70kg', serie_target: 4, rip_target: 10, peso_target: 70 }
        ]
    }
];

let ibridoSelezionato = null;
let ibridoWorkSec = 30;
let ibridoRestSec = 30;
let ibridoRounds = 40;
let ibridoSessionStartMs = 0;
let ibridoConfigurazionePersonalizzata = null;
let ibridoSessionMinimized = false;

function getIbridoSessionMinimized() {
    return ibridoSessionMinimized;
}

function setIbridoSessionMinimized(val) {
    ibridoSessionMinimized = !!val;
    if (typeof window !== 'undefined') window.ibridoSessionMinimized = ibridoSessionMinimized;
}

function isPureBodyweight(nome) {
    const n = (nome || '').trim().toLowerCase();
    return n.includes('jump') || n.includes('salto') || n.includes('corsa') || n.includes('air squat');
}

function ottieniMassimoStoricoEsercizio(nomeEsercizio) {
    const nomeNorm = (nomeEsercizio || '').trim().toLowerCase();
    const prList = (typeof window !== 'undefined' && Array.isArray(window.currentUserPrList))
        ? window.currentUserPrList
        : (typeof currentUserPrList !== 'undefined' && Array.isArray(currentUserPrList) ? currentUserPrList : []);

    const pr = prList.find(p => (p.nome || '').trim().toLowerCase() === nomeNorm);
    if (pr && pr.peso_kg > 0) {
        return Number(pr.peso_kg);
    }
    return 0;
}

async function recuperaUltimaSessioneProgramma(progId, progNome) {
    const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    const user = (typeof window !== 'undefined' && window.currentUser) ? window.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!client || !user?.id || typeof client.from !== 'function') return null;

    try {
        const { data, error } = await client
            .from('nestore_allenamenti')
            .select('scheda_dati, data_allenamento')
            .eq('utente_id', user.id)
            .eq('attivo', true)
            .or(`corso_disciplina.ilike.%${progNome}%,scheda_dati->>programma_id.eq.${progId}`)
            .order('data_allenamento', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return null;
        return data[0];
    } catch (e) {
        console.warn("Impossibile recuperare ultima sessione programma:", e);
        return null;
    }
}

function verificaForzaMaxStorico(exIdx, maxStorico) {
    const input = document.getElementById(`nst-forza-cfg-peso-${exIdx}`);
    const badgeEl = document.getElementById(`nst-forza-badge-max-${exIdx}`);
    if (!input || !badgeEl) return;
    const currentVal = parseFloat(input.value) || 0;
    if (maxStorico > 0 && currentVal > 0 && currentVal < maxStorico) {
        badgeEl.innerHTML = `<span class="nst-forza-max-warn"><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle;">warning</span> Il peso impostato (${currentVal} kg) è inferiore al tuo massimo storico (${maxStorico} kg)</span>`;
        badgeEl.classList.remove('nst-hidden');
    } else if (maxStorico > 0 && currentVal >= maxStorico) {
        badgeEl.innerHTML = `<span class="nst-forza-max-record"><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle;">trophy</span> Record storico: ${maxStorico} kg</span>`;
        badgeEl.classList.remove('nst-hidden');
    } else {
        badgeEl.classList.add('nst-hidden');
    }
}

function aggiungiSerieExtraForza(exIdx) {
    const tbody = document.getElementById(`nst-active-tbody-ex-${exIdx}`);
    if (!tbody || !ibridoConfigurazionePersonalizzata) return;
    const ex = ibridoConfigurazionePersonalizzata.esercizi[exIdx];
    if (!ex) return;
    const currentRows = tbody.querySelectorAll('tr').length;
    const sIdx = currentRows;
    const pesoVal = ex.isBw ? 0 : (ex.peso_target_kg || 0);
    const tr = document.createElement('tr');
    tr.className = 'nst-active-set-row work-row extra-row';
    tr.innerHTML = `
        <td class="nst-active-set-label" style="color: var(--nst-lime); font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700;">
            Serie ${sIdx + 1} (Extra)
        </td>
        <td style="text-align: center;">
            <div class="nst-active-input-col">
                <input type="number" id="nst-ibrido-ex-peso-${exIdx}-${sIdx}" class="nst-active-set-input peso-input nst-ex-input" value="${pesoVal}" step="0.5" min="0" max="500" ${ex.isBw ? 'disabled title="Corpo Libero"' : ''}>
                <span class="nst-active-unit-label">kg</span>
            </div>
        </td>
        <td style="text-align: center;">
            <div class="nst-active-input-col">
                <input type="number" id="nst-ibrido-ex-rip-${exIdx}-${sIdx}" class="nst-ex-input nst-active-rip-input nst-active-set-input rip-input" value="${ex.rip_target}" min="0" max="100">
                <span class="nst-active-unit-label">rip</span>
            </div>
        </td>
    `;
    tbody.appendChild(tr);
}

function renderCatalogoIbrido() {
    const grid = document.getElementById('nst-ibrido-programmi-grid');
    if (!grid) return;

    if (!IBRIDO_PROGRAMMI_CATALOGO || IBRIDO_PROGRAMMI_CATALOGO.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--nst-text-muted); padding: 16px; font-size: 12px;">Nessun programma Ibrido disponibile al momento.</div>`;
        return;
    }

    grid.innerHTML = IBRIDO_PROGRAMMI_CATALOGO.map(p => {
        const isMetcon = (p.categoria === 'metcon' || p.tipo === 'metcon');
        const typeClass = isMetcon ? 'metcon' : 'forza';
        const badgeLabel = isMetcon ? 'METCON' : 'FORZA';
        const progKey = p.id || p.codice;

        return `
            <div class="nst-ibrido-card ${typeClass}" onclick="apriAnteprimaIbrido('${progKey}')" role="button" tabindex="0" title="Apri scheda ${escapeHtml(p.nome)}">
                <div class="nst-ibrido-card-header">
                    <span class="nst-ibrido-card-title">${escapeHtml(p.nome)}</span>
                    <span class="nst-ibrido-badge ${typeClass}">${badgeLabel}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderForzaAnteprimaEsercizi(p, exListEl, ultimaSessione) {
    let html = `
        <div style="background: rgba(255,179,0,0.06); border: 1px solid rgba(255,179,0,0.25); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 11px; line-height: 1.4; color: #f1f5f9;">
            <strong style="color: var(--nst-amber);">ℹ️ GUIDA SESSIONE FORZA:</strong>
            Riscaldamento generale dinamico libero di 10'. Qui sotto puoi personalizzare i carichi di riscaldamento specifico, le serie, le ripetizioni e il carico target da eseguire.
        </div>
    `;

    html += (p.esercizi || []).map((ex, exIdx) => {
        const isBw = isPureBodyweight(ex.nome);
        const maxStorico = ottieniMassimoStoricoEsercizio(ex.nome);

        let prevEx = null;
        if (ultimaSessione && ultimaSessione.scheda_dati && Array.isArray(ultimaSessione.scheda_dati.esercizi)) {
            prevEx = ultimaSessione.scheda_dati.esercizi.find(e => (e.nome || '').trim().toLowerCase() === (ex.nome || '').trim().toLowerCase());
        }

        // Schema serie strutturate se presente (da libreria coach o catalogo)
        let schemaStr = '';
        if (ex.serie && Array.isArray(ex.serie) && ex.serie.length > 0) {
            schemaStr = ex.serie.map(s => `${s.rip} rip @ ${(s.pct !== undefined ? s.pct : s.percentuale)}%`).join(' · ');
        } else if (ex.target) {
            schemaStr = ex.target;
        }

        // Default serie e rip
        const serieDef = prevEx ? (prevEx.serie_target || prevEx.serie || 4) : (ex.serie_target || (ex.serie ? ex.serie.length : 4));
        const ripDef = prevEx ? (prevEx.rip_target || prevEx.ripetizioni || 4) : (ex.rip_target || (ex.serie && ex.serie[0] ? ex.serie[0].rip : 4));

        // Base di calcolo carico
        let baseKg = 70;
        let fonte = 'Default: 70 kg';
        if (maxStorico > 0) {
            baseKg = maxStorico;
            fonte = `PR: ${maxStorico} kg`;
        } else {
            const pesoKgVal = (typeof window !== 'undefined' && window.currentUserPesoKg !== undefined)
                ? window.currentUserPesoKg
                : (typeof currentUserPesoKg !== 'undefined' ? currentUserPesoKg : null);
            if (typeof pesoKgVal === 'number' && pesoKgVal > 0) {
                baseKg = pesoKgVal;
                fonte = `Peso atleta: ${baseKg} kg`;
            }
        }

        // Default peso allenante
        let pesoDef = 0;
        if (!isBw) {
            if (prevEx && prevEx.peso_target_kg !== undefined && prevEx.peso_target_kg > 0) {
                pesoDef = prevEx.peso_target_kg;
            } else if (prevEx && prevEx.peso_kg !== undefined && prevEx.peso_kg > 0) {
                pesoDef = prevEx.peso_kg;
            } else if (ex.peso_target !== undefined && ex.peso_target > 0) {
                pesoDef = ex.peso_target;
            } else {
                pesoDef = Math.round((baseKg * 0.85) * 2) / 2;
            }
        }

        // Riscaldamento specifico (5 serie progressive):
        const warmupRows = DEFAULT_FORZA_WARMUP.map((w, wIdx) => {
            let wKg = 0;
            if (prevEx && Array.isArray(prevEx.riscaldamento) && prevEx.riscaldamento[wIdx] && prevEx.riscaldamento[wIdx].peso_kg > 0) {
                wKg = prevEx.riscaldamento[wIdx].peso_kg;
            } else {
                wKg = Math.round((baseKg * w.pct / 100) * 2) / 2;
            }
            return { rip: w.rip, pct: w.pct, peso_kg: wKg };
        });

        const fonteTesto = prevEx
            ? `Dati precompilati dall'ultima seduta (${formatDateShort(ultimaSessione.data_allenamento)})`
            : `Pesi calcolati su: ${fonte}`;

        return `
            <div class="nst-forza-ex-card">
                <div class="nst-forza-ex-header">
                    <div>
                        <div style="font-weight: 700; font-size: 13px; color: #fff;">${escapeHtml(ex.nome)}</div>
                        ${schemaStr ? `<div style="color: var(--nst-amber); font-family: 'Orbitron', monospace; font-size: 11px; margin-top: 2px;">${escapeHtml(schemaStr)}</div>` : ''}
                    </div>
                    <div class="nst-forza-ex-sub">${escapeHtml(fonteTesto)}</div>
                </div>

                ${!isBw ? `
                <!-- Box Riscaldamento Specifico (Modificabile) -->
                <div class="nst-forza-warmup-container">
                    <div class="nst-forza-sec-title">
                        <span class="material-symbols-outlined" style="font-size: 13px; color: var(--nst-cyan);">local_fire_department</span>
                        <span>RISCALDAMENTO SPECIFICO (MODIFICA CARICHI SE DESIDERI)</span>
                    </div>
                    <div class="nst-forza-warmup-grid">
                        ${warmupRows.map((w, wIdx) => `
                            <div class="nst-forza-warmup-chip">
                                <span class="chip-step">${w.rip} rip @ ${w.pct}%</span>
                                <div style="display: flex; align-items: center; gap: 3px;">
                                    <input type="number" id="nst-forza-cfg-warmup-${exIdx}-${wIdx}" class="nst-ex-input nst-warmup-input" value="${w.peso_kg}" step="0.5" min="0" max="500">
                                    <span style="font-size: 10px; color: var(--nst-text-muted);">kg</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Box Serie Allenanti (Target della Seduta) -->
                <div class="nst-forza-work-container">
                    <div class="nst-forza-sec-title">
                        <span class="material-symbols-outlined" style="font-size: 13px; color: var(--nst-amber);">fitness_center</span>
                        <span>SEQUENZA ALLENANTE (MODIFICA SERIE, RIP E CARICO)</span>
                    </div>
                    <div class="nst-forza-target-grid">
                        <div class="nst-forza-param-col">
                            <label>SERIE</label>
                            <input type="number" id="nst-forza-cfg-serie-${exIdx}" class="nst-ex-input" value="${serieDef}" min="1" max="20" style="width: 60px;">
                        </div>
                        <div class="nst-forza-param-col">
                            <label>RIPETIZIONI</label>
                            <input type="number" id="nst-forza-cfg-rip-${exIdx}" class="nst-ex-input" value="${ripDef}" min="1" max="100" style="width: 60px;">
                        </div>
                        ${!isBw ? `
                        <div class="nst-forza-param-col">
                            <label>CARICO (KG)</label>
                            <input type="number" id="nst-forza-cfg-peso-${exIdx}" class="nst-ex-input" value="${pesoDef}" step="0.5" min="0" max="500" style="width: 75px; color: var(--nst-lime);" oninput="verificaForzaMaxStorico(${exIdx}, ${maxStorico})">
                        </div>
                        ` : `
                        <input type="hidden" id="nst-forza-cfg-peso-${exIdx}" value="0">
                        `}
                    </div>

                    <!-- Segnale / Badge Massimo Storico -->
                    <div id="nst-forza-badge-max-${exIdx}" class="nst-forza-badge-container ${maxStorico > 0 ? '' : 'nst-hidden'}">
                        ${(maxStorico > 0 && pesoDef < maxStorico)
                            ? `<span class="nst-forza-max-warn"><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle;">warning</span> Il peso impostato (${pesoDef} kg) è inferiore al tuo massimo storico (${maxStorico} kg)</span>`
                            : (maxStorico > 0 ? `<span class="nst-forza-max-record"><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle;">trophy</span> Record storico: ${maxStorico} kg</span>` : '')
                        }
                    </div>

                    <div class="nst-forza-tip-box">
                        💡 <strong>Progressione:</strong> 4x4 → 4x5 → 4x6. A 4x6 superato: valuta 4x7 oppure aumenta il carico tornando a 4x4.
                    </div>
                </div>
            </div>
        `;
    }).join('');

    exListEl.innerHTML = html;
}

function apriAnteprimaIbrido(progId) {
    const catList = (typeof window !== 'undefined' && window.IBRIDO_PROGRAMMI_CATALOGO) ? window.IBRIDO_PROGRAMMI_CATALOGO : IBRIDO_PROGRAMMI_CATALOGO;
    const libList = (typeof window !== 'undefined' && window.libreriaProgrammiTotali) ? window.libreriaProgrammiTotali : libreriaProgrammiTotali;

    const p = (catList || []).find(item => item.id === progId || item.codice === progId)
        || (libList || []).find(item => item.id === progId || item.codice === progId);
    if (!p) return;
    ibridoSelezionato = p;

    const modal = document.getElementById('nst-ibrido-preview-modal');
    const card = document.getElementById('nst-ibrido-preview-card');
    const titleEl = document.getElementById('nst-ibrido-preview-title');
    const descEl = document.getElementById('nst-ibrido-preview-desc');
    const iconEl = document.getElementById('nst-ibrido-preview-icon');
    const tabataBox = document.getElementById('nst-ibrido-tabata-config-box');
    const exListEl = document.getElementById('nst-ibrido-preview-ex-list');

    if (titleEl) titleEl.textContent = `IBRIDO — ${p.nome.toUpperCase()}`;
    if (descEl) descEl.textContent = p.descrizione;
    
    const isForza = (p.tipo === 'forza' || p.categoria === 'forza');

    if (card && card.classList) {
        if (isForza) card.classList.add('forza');
        else card.classList.remove('forza');
    }
    if (iconEl && iconEl.style) {
        iconEl.style.color = isForza ? 'var(--nst-amber)' : 'var(--nst-cyan)';
    }

    if (p.timer_mode === 'tabata') {
        if (tabataBox) tabataBox.classList.remove('nst-hidden');
        ibridoWorkSec = p.work_default || 30;
        ibridoRestSec = p.rest_default || 30;
        ibridoRounds = p.rounds_default || 8;
        const workInput = document.getElementById('nst-ibrido-cfg-work');
        const restInput = document.getElementById('nst-ibrido-cfg-rest');
        const roundsInput = document.getElementById('nst-ibrido-cfg-rounds');
        if (workInput) workInput.value = ibridoWorkSec;
        if (restInput) restInput.value = ibridoRestSec;
        if (roundsInput) roundsInput.value = ibridoRounds;
    } else {
        if (tabataBox) tabataBox.classList.add('nst-hidden');
    }

    if (modal) modal.classList.remove('nst-hidden');

    // Lista esercizi
    if (exListEl) {
        if (isForza) {
            // Render immediato sincrono con i default/PR calcolati
            renderForzaAnteprimaEsercizi(p, exListEl, null);

            // Fetch asincrono per eventuale sessione precedente dello stesso programma
            recuperaUltimaSessioneProgramma(p.id, p.nome).then(prev => {
                if (prev && ibridoSelezionato && (ibridoSelezionato.id === p.id || ibridoSelezionato.codice === p.id)) {
                    renderForzaAnteprimaEsercizi(p, exListEl, prev);
                }
            }).catch(err => console.warn("Errore fetch background ultima sessione:", err));
        } else {
            exListEl.innerHTML = `
                <table class="nst-ex-table">
                    <thead>
                        <tr>
                            <th>ESERCIZIO</th>
                            <th>TARGET / SCHEMA</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(p.esercizi || []).map(ex => {
                            let targetText = ex.target || '';
                            if (ex.serie && Array.isArray(ex.serie) && ex.serie.length > 0) {
                                targetText = ex.serie.map(s => `${s.rip} rip @ ${(s.pct !== undefined ? s.pct : s.percentuale)}%`).join(' · ');
                            }
                            return `
                                <tr>
                                    <td style="font-weight: 600; color: #f1f5f9;">${escapeHtml(ex.nome)}</td>
                                    <td style="color: var(--nst-lime); font-family: 'Orbitron', monospace; font-size: 11px;">${escapeHtml(targetText)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    }
}

function chiudiAnteprimaIbrido() {
    const modal = document.getElementById('nst-ibrido-preview-modal');
    if (modal) modal.classList.add('nst-hidden');
}

function modificaIbridoParam(param, delta) {
    const input = document.getElementById(`nst-ibrido-cfg-${param}`);
    if (!input) return;
    let val = parseInt(input.value, 10) || 0;
    val = Math.max(parseInt(input.min, 10) || 0, Math.min(parseInt(input.max, 10) || 300, val + delta));
    input.value = val;
    aggiornaIbridoParamDaInput();
}

function aggiornaIbridoParamDaInput() {
    const workInput = document.getElementById('nst-ibrido-cfg-work');
    const restInput = document.getElementById('nst-ibrido-cfg-rest');
    const roundsInput = document.getElementById('nst-ibrido-cfg-rounds');
    if (workInput) ibridoWorkSec = parseInt(workInput.value, 10) || 30;
    if (restInput) ibridoRestSec = parseInt(restInput.value, 10) || 30;
    if (roundsInput) ibridoRounds = parseInt(roundsInput.value, 10) || 8;
}

async function avviaIbridoSeduta() {
    if (!ibridoSelezionato) return;
    ibridoSessionMinimized = false;
    if (typeof window !== 'undefined') window.ibridoSessionMinimized = false;
    const p = ibridoSelezionato;
    const isForza = (p.tipo === 'forza' || p.categoria === 'forza');

    // Se forza, raccogli la configurazione personalizzata dalla Preview prima di chiuderla
    if (isForza) {
        ibridoConfigurazionePersonalizzata = {
            programma_id: p.id,
            programma_nome: p.nome,
            esercizi: (p.esercizi || []).map((ex, exIdx) => {
                const isBw = isPureBodyweight(ex.nome);
                const serieVal = parseInt(document.getElementById(`nst-forza-cfg-serie-${exIdx}`)?.value, 10) || ex.serie_target || 4;
                const ripVal = parseInt(document.getElementById(`nst-forza-cfg-rip-${exIdx}`)?.value, 10) || ex.rip_target || 4;
                const pesoVal = !isBw ? (parseFloat(document.getElementById(`nst-forza-cfg-peso-${exIdx}`)?.value) || 0) : 0;
                const maxStorico = ottieniMassimoStoricoEsercizio(ex.nome);

                const warmupList = [];
                if (!isBw) {
                    DEFAULT_FORZA_WARMUP.forEach((w, wIdx) => {
                        const wInput = document.getElementById(`nst-forza-cfg-warmup-${exIdx}-${wIdx}`);
                        const wKg = parseFloat(wInput?.value) || 0;
                        warmupList.push({ rip: w.rip, pct: w.pct, peso_kg: wKg });
                    });
                }

                return {
                    nome: ex.nome,
                    isBw,
                    serie_target: serieVal,
                    rip_target: ripVal,
                    peso_target_kg: pesoVal,
                    max_storico: maxStorico,
                    riscaldamento: warmupList,
                    target_descrittivo: isBw ? `${serieVal}x${ripVal} rip` : `${serieVal}x${ripVal} @ ${pesoVal}kg`
                };
            })
        };
    } else {
        ibridoConfigurazionePersonalizzata = null;
    }

    chiudiAnteprimaIbrido();

    const modal = document.getElementById('nst-ibrido-active-modal');
    const titleEl = document.getElementById('nst-ibrido-active-title');
    const runningView = document.getElementById('nst-ibrido-running-view');
    const saveView = document.getElementById('nst-ibrido-save-view');
    const exTableContainer = document.getElementById('nst-ibrido-active-ex-table-container');
    const lapsWrapper = document.getElementById('nst-ibrido-laps-wrapper');
    const secBtnIcon = document.getElementById('nst-ibrido-action-sec-icon');
    const secBtnText = document.getElementById('nst-ibrido-action-sec-text');

    if (titleEl) {
        titleEl.textContent = `IBRIDO — ${p.nome.toUpperCase()} — IN CORSO`;
        titleEl.style.color = isForza ? 'var(--nst-amber)' : 'var(--nst-cyan)';
    }

    if (runningView) runningView.classList.remove('nst-hidden');
    if (saveView) saveView.classList.add('nst-hidden');

    // Tabella interattiva esercizi
    if (exTableContainer) {
        if (isForza && ibridoConfigurazionePersonalizzata) {
            exTableContainer.innerHTML = `
                <div class="nst-active-workout-wrapper">
                    ${ibridoConfigurazionePersonalizzata.esercizi.map((ex, exIdx) => {
                        const hasWarmup = !ex.isBw && ex.riscaldamento && ex.riscaldamento.length > 0;

                        // Righe riscaldamento specifico interattive (Risc 1 10x, Risc 2 5x, etc.)
                        const warmupRowsHtml = hasWarmup ? ex.riscaldamento.map((w, wIdx) => {
                            const riscLabel = `Risc ${wIdx + 1} ${w.rip}x`;
                            return `
                                <tr class="nst-active-set-row warmup-row">
                                    <td class="nst-active-set-label">
                                        <span style="font-size: 11px;">🔥</span>
                                        <span>${riscLabel}</span>
                                    </td>
                                    <td style="text-align: center;">
                                        <div class="nst-active-input-col">
                                            <input type="number" id="nst-ibrido-warmup-peso-${exIdx}-${wIdx}" class="nst-active-set-input peso-input nst-ex-input" value="${w.peso_kg}" step="0.5" min="0" max="500">
                                            <span class="nst-active-unit-label">kg</span>
                                        </div>
                                    </td>
                                    <td style="text-align: center;">
                                        <div class="nst-active-input-col">
                                            <input type="number" id="nst-ibrido-warmup-rip-${exIdx}-${wIdx}" class="nst-active-set-input rip-input nst-ex-input" value="${w.rip}" min="0" max="100">
                                            <span class="nst-active-unit-label">rip</span>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('') : '';

                        // Righe serie allenanti interattive (Serie 1, Serie 2, etc.)
                        const workRowsHtml = Array.from({ length: ex.serie_target }).map((_, sIdx) => {
                            const pesoVal = ex.isBw ? 0 : (ex.peso_target_kg || 0);
                            return `
                                <tr class="nst-active-set-row work-row">
                                    <td class="nst-active-set-label">
                                        <span>Serie ${sIdx + 1}</span>
                                    </td>
                                    <td style="text-align: center;">
                                        <div class="nst-active-input-col">
                                            <input type="number" id="nst-ibrido-ex-peso-${exIdx}-${sIdx}" class="nst-active-set-input peso-input nst-ex-input" value="${pesoVal}" step="0.5" min="0" max="500" ${ex.isBw ? 'disabled title="Corpo Libero"' : ''}>
                                            <span class="nst-active-unit-label">kg</span>
                                        </div>
                                    </td>
                                    <td style="text-align: center;">
                                        <div class="nst-active-input-col">
                                            <input type="number" id="nst-ibrido-ex-rip-${exIdx}-${sIdx}" class="nst-active-set-input rip-input nst-ex-input nst-active-rip-input" value="${ex.rip_target}" min="0" max="100">
                                            <span class="nst-active-unit-label">rip</span>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('');

                        return `
                            <div class="nst-active-ex-block" data-ex-idx="${exIdx}">
                                <div class="nst-active-ex-header">
                                    <div>
                                        <span class="nst-active-ex-title">${escapeHtml(ex.nome)}</span>
                                        ${hasWarmup ? `<div style="font-size: 10px; color: var(--nst-amber); margin-top: 2px;">🔥 Riscaldamento specifico (5 serie) + Serie Allenanti</div>` : ''}
                                    </div>
                                    <div class="nst-active-target-badge">
                                        🎯 TARGET: ${escapeHtml(ex.target_descrittivo)}
                                    </div>
                                </div>

                                <table class="nst-ex-table nst-active-series-table" style="width: 100%;">
                                    <thead>
                                        <tr class="nst-active-sets-header">
                                            <th style="width: 32%;">SET</th>
                                            <th style="width: 34%; text-align: center;">CARICO (KG)</th>
                                            <th style="width: 34%; text-align: center;">RIP EFFETTIVE</th>
                                        </tr>
                                    </thead>
                                    ${hasWarmup ? `
                                    <tbody id="nst-active-warmup-tbody-ex-${exIdx}">
                                        ${warmupRowsHtml}
                                    </tbody>
                                    ` : ''}
                                    <tbody id="nst-active-tbody-ex-${exIdx}">
                                        ${workRowsHtml}
                                    </tbody>
                                </table>

                                <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
                                    <button type="button" class="nst-btn-ghost-sm" style="font-size: 10px; padding: 4px 10px; border-color: rgba(255,179,0,0.3); color: var(--nst-amber);" onclick="aggiungiSerieExtraForza(${exIdx})">
                                        + AGGIUNGI SERIE EXTRA
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            exTableContainer.innerHTML = `
                <table class="nst-ex-table">
                    <thead>
                        <tr>
                            <th>ESERCIZIO</th>
                            <th>TARGET SCHEDA</th>
                            <th>RISULTATO EFFETTIVO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(p.esercizi || []).map((ex, idx) => `
                            <tr>
                                <td style="font-weight: 600; color: #fff;">${escapeHtml(ex.nome)}</td>
                                <td style="color: var(--nst-lime); font-family: 'Orbitron', monospace;">${escapeHtml(ex.target)}</td>
                                <td>
                                    <input type="text" id="nst-ibrido-ex-risultato-${idx}" class="nst-ex-input" value="${escapeHtml(ex.target)}" style="width: 100%; text-align: left;">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    // Reset eventuale campo note in sessione
    const inlineNote = document.getElementById('nst-ibrido-workout-note-inline');
    if (inlineNote) inlineNote.value = '';
    const inlineNoteBox = document.getElementById('nst-ibrido-note-inline-box');
    if (inlineNoteBox) inlineNoteBox.classList.add('nst-hidden');
    const noteToggleText = document.getElementById('nst-ibrido-note-toggle-text');
    if (noteToggleText) noteToggleText.textContent = '📝 Note Sessione';

    ibridoSessionStartMs = Date.now();

    // Attiva Screen Wake Lock API per mantenere lo schermo acceso
    WakeLockManager.request();

    // Configura motore timer appropriato
    if (p.timer_mode === 'tabata') {
        currentTimerMode = 'tabata';
        tabataEngine.state.config = {
            prep: 5,
            work: ibridoWorkSec,
            rest: ibridoRestSec,
            rounds: ibridoRounds,
            sets: 1
        };
        tabataEngine.reset();
        tabataEngine.start();
        if (lapsWrapper) lapsWrapper.classList.add('nst-hidden');
        if (secBtnIcon) secBtnIcon.textContent = 'skip_next';
        if (secBtnText) secBtnText.textContent = 'SALTA FASE';
    } else {
        currentTimerMode = 'stopwatch';
        timerEngine.reset();
        timerEngine.start();
        if (lapsWrapper) lapsWrapper.classList.remove('nst-hidden');
        renderIbridoLapsList();
        if (secBtnIcon) secBtnIcon.textContent = 'flag';
        if (secBtnText) secBtnText.textContent = 'GIRO (LAP)';
    }

    if (modal) modal.classList.remove('nst-hidden');
    aggiornaIbridoModalAttivo();
}

function gestisciIbridoActionPause() {
    if (!ibridoSelezionato) return;
    const p = ibridoSelezionato;
    if (p.timer_mode === 'tabata') {
        tabataEngine.toggle();
    } else {
        timerEngine.toggle();
    }
    aggiornaIbridoModalAttivo();
}

function gestisciIbridoActionSecondary() {
    if (!ibridoSelezionato) return;
    const p = ibridoSelezionato;
    if (p.timer_mode === 'tabata') {
        tabataEngine.skip();
    } else {
        if (!timerEngine.state.running) return;
        timerEngine.lap();
        renderIbridoLapsList();
    }
}

function renderIbridoLapsList() {
    const listEl = document.getElementById('nst-ibrido-laps-list');
    const countEl = document.getElementById('nst-ibrido-laps-count');
    if (!listEl) return;
    const laps = timerEngine.state.laps || [];
    if (countEl) countEl.textContent = `${laps.length} Lap`;
    if (laps.length === 0) {
        listEl.innerHTML = `<div class="nst-modal-laps-empty">Nessun intertempo registrato. Premi "GIRO (LAP)".</div>`;
        return;
    }
    listEl.innerHTML = laps.map(l => {
        const splitF = timerEngine.formatTime(l.splitMs);
        const totalF = timerEngine.formatTime(l.totalMs);
        return `
            <div class="nst-modal-lap-row">
                <span class="lap-num">LAP ${l.number}</span>
                <span class="lap-split">+${splitF.main}${splitF.sub}</span>
                <span class="lap-total">${totalF.main}${totalF.sub}</span>
            </div>
        `;
    }).join('');
}

function aggiornaIbridoModalAttivo() {
    const modal = document.getElementById('nst-ibrido-active-modal');
    if (!modal || modal.classList.contains('nst-hidden') || !ibridoSelezionato) return;

    const p = ibridoSelezionato;
    const displayEl = document.getElementById('nst-ibrido-timer-display');
    const subEl = document.getElementById('nst-ibrido-timer-sub');
    const pauseIcon = document.getElementById('nst-ibrido-pause-icon');
    const pauseText = document.getElementById('nst-ibrido-pause-text');
    const dotEl = document.getElementById('nst-ibrido-status-dot');

    if (p.timer_mode === 'tabata') {
        const elapsed = tabataEngine.getPhaseElapsedMs();
        const durationMs = tabataEngine.state.phaseDurationSec * 1000;
        const remainSec = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
        const m = Math.floor(remainSec / 60);
        const s = remainSec % 60;
        if (displayEl) displayEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        
        const phaseNames = { prep: 'PREPARAZIONE', work: 'LAVORO (WORK)', rest: 'RIPOSO (REST)', done: 'COMPLETATO' };
        const phaseName = phaseNames[tabataEngine.state.phase] || tabataEngine.state.phase.toUpperCase();
        if (subEl) subEl.textContent = `${phaseName} — ROUND ${tabataEngine.state.currentRound}/${tabataEngine.state.config.rounds}`;

        if (tabataEngine.state.phase === 'work') {
            if (displayEl) displayEl.style.color = 'var(--nst-lime)';
        } else if (tabataEngine.state.phase === 'rest') {
            if (displayEl) displayEl.style.color = 'var(--nst-amber)';
        } else {
            if (displayEl) displayEl.style.color = '#fff';
        }

        if (tabataEngine.state.running) {
            if (pauseIcon) pauseIcon.textContent = 'pause';
            if (pauseText) pauseText.textContent = 'PAUSA';
            if (dotEl) { dotEl.style.backgroundColor = 'var(--nst-lime)'; dotEl.classList.add('pulse'); }
        } else {
            if (pauseIcon) pauseIcon.textContent = 'play_arrow';
            if (pauseText) pauseText.textContent = 'RIPRENDI';
            if (dotEl) { dotEl.style.backgroundColor = 'var(--nst-amber)'; dotEl.classList.remove('pulse'); }
        }
    } else {
        const elapsedMs = timerEngine.getElapsedMs();
        const formatted = timerEngine.formatTime(elapsedMs);
        if (displayEl) {
            displayEl.textContent = `${formatted.main}${formatted.sub}`;
            displayEl.style.color = '#fff';
        }

        if (timerEngine.state.running) {
            if (subEl) subEl.textContent = 'CRONOMETRO IN CORSO';
            if (pauseIcon) pauseIcon.textContent = 'pause';
            if (pauseText) pauseText.textContent = 'PAUSA';
            if (dotEl) { dotEl.style.backgroundColor = 'var(--nst-lime)'; dotEl.classList.add('pulse'); }
        } else {
            if (subEl) subEl.textContent = 'CRONOMETRO IN PAUSA';
            if (pauseIcon) pauseIcon.textContent = 'play_arrow';
            if (pauseText) pauseText.textContent = 'RIPRENDI';
            if (dotEl) { dotEl.style.backgroundColor = 'var(--nst-amber)'; dotEl.classList.remove('pulse'); }
        }
    }
}

function terminaIbridoSeduta() {
    if (!ibridoSelezionato) return;
    const p = ibridoSelezionato;
    const isForza = (p.tipo === 'forza' || p.categoria === 'forza');

    // Ferma timer
    if (p.timer_mode === 'tabata') {
        tabataEngine.pause();
    } else {
        timerEngine.pause();
    }

    const elapsedTotalMs = Date.now() - ibridoSessionStartMs;
    const durataMinuti = Math.max(1, Math.round(elapsedTotalMs / 60000));

    const durationInput = document.getElementById('nst-ibrido-final-duration-input');
    if (durationInput) durationInput.value = durataMinuti;

    const warningBox = document.getElementById('nst-ibrido-timer-warning');
    if (warningBox) {
        if (durataMinuti >= 90) {
            warningBox.classList.remove('nst-hidden');
        } else {
            warningBox.classList.add('nst-hidden');
        }
    }

    const progNameEl = document.getElementById('nst-ibrido-save-prog-name');
    if (progNameEl) progNameEl.textContent = p.nome;

    const summaryContainer = document.getElementById('nst-ibrido-save-ex-summary');
    const esitoBadge = document.getElementById('nst-ibrido-esito-badge');

    if (isForza && ibridoConfigurazionePersonalizzata) {
        let totalTargetRepsAll = 0;
        let totalCompletedRepsAll = 0;
        let hasParziale = false;
        let hasSuperata = false;

        const summaryEsercizi = ibridoConfigurazionePersonalizzata.esercizi.map((ex, exIdx) => {
            const tbody = document.getElementById(`nst-active-tbody-ex-${exIdx}`);
            const rows = tbody ? tbody.querySelectorAll('tr') : [];
            const serieEffettive = [];
            const riscaldamentoEffettivo = [];
            let sumCompletedReps = 0;
            let targetTotalReps = 0;
            let exHasParziale = false;
            let exHasSuperata = false;

            // 1. Raccolta dati Riscaldamento Specifico (se presente e non a corpo libero)
            if (!ex.isBw && ex.riscaldamento && ex.riscaldamento.length > 0) {
                ex.riscaldamento.forEach((w, wIdx) => {
                    const ripInput = document.getElementById(`nst-ibrido-warmup-rip-${exIdx}-${wIdx}`);
                    const pesoInput = document.getElementById(`nst-ibrido-warmup-peso-${exIdx}-${wIdx}`);
                    const ripVal = ripInput ? (parseInt(ripInput.value, 10) || 0) : w.rip;
                    const pesoVal = pesoInput ? (parseFloat(pesoInput.value) || 0) : (w.peso_kg || 0);

                    riscaldamentoEffettivo.push({
                        serie: wIdx + 1,
                        label: `Risc ${wIdx + 1} ${w.rip}x`,
                        rip: ripVal,
                        rip_target: w.rip,
                        peso_kg: pesoVal,
                        pct: w.pct
                    });

                    sumCompletedReps += ripVal;
                    targetTotalReps += w.rip;

                    if (ripVal < w.rip) {
                        exHasParziale = true;
                    } else if (ripVal > w.rip) {
                        exHasSuperata = true;
                    }
                });
            }

            // 2. Raccolta dati Serie Allenanti
            rows.forEach((_, sIdx) => {
                const ripInput = document.getElementById(`nst-ibrido-ex-rip-${exIdx}-${sIdx}`);
                const pesoInput = document.getElementById(`nst-ibrido-ex-peso-${exIdx}-${sIdx}`);
                const ripVal = ripInput ? (parseInt(ripInput.value, 10) || 0) : ex.rip_target;
                const pesoVal = pesoInput ? (parseFloat(pesoInput.value) || 0) : (ex.isBw ? 0 : (ex.peso_target_kg || 0));

                serieEffettive.push({
                    serie: sIdx + 1,
                    rip_completate: ripVal,
                    peso_kg: pesoVal
                });

                sumCompletedReps += ripVal;

                if (ripVal < ex.rip_target) {
                    exHasParziale = true;
                } else if (ripVal > ex.rip_target) {
                    exHasSuperata = true;
                }
            });

            const workTargetReps = ex.serie_target * ex.rip_target;
            targetTotalReps += workTargetReps;

            totalTargetRepsAll += targetTotalReps;
            totalCompletedRepsAll += sumCompletedReps;

            if (serieEffettive.length > ex.serie_target) {
                exHasSuperata = true;
            } else if (serieEffettive.length < ex.serie_target) {
                exHasParziale = true;
            }

            let esitoEx = 'COMPLETATA';
            if (exHasParziale || sumCompletedReps < targetTotalReps) {
                esitoEx = 'PARZIALE';
                hasParziale = true;
            } else if (exHasSuperata || sumCompletedReps > targetTotalReps) {
                esitoEx = 'SUPERATA';
                hasSuperata = true;
            }

            return {
                ...ex,
                riscaldamento_effettivo: riscaldamentoEffettivo,
                serie_effettive: serieEffettive,
                rip_totali_effettive: sumCompletedReps,
                rip_totali_target: targetTotalReps,
                esito: esitoEx
            };
        });

        let esitoGlobale = 'COMPLETATA';
        if (hasParziale) {
            esitoGlobale = 'PARZIALE';
        } else if (hasSuperata) {
            esitoGlobale = 'SUPERATA';
        }

        // Salva stato calcolato nella configurazione personalizzata per la conferma
        ibridoConfigurazionePersonalizzata.summaryEsercizi = summaryEsercizi;
        ibridoConfigurazionePersonalizzata.esitoGlobale = esitoGlobale;
        ibridoConfigurazionePersonalizzata.totalTargetRepsAll = totalTargetRepsAll;
        ibridoConfigurazionePersonalizzata.totalCompletedRepsAll = totalCompletedRepsAll;

        // Visualizza badge esito
        if (esitoBadge) {
            esitoBadge.classList.remove('nst-hidden');
            if (esitoGlobale === 'SUPERATA') {
                esitoBadge.className = 'nst-esito-badge superata';
                esitoBadge.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 24px;">local_fire_department</span>
                    <div>
                        <strong style="color: var(--nst-lime);">🔥 SCHEDA SUPERATA CON SUCCESSO!</strong>
                        <div style="font-size: 11px; margin-top: 2px;">Hai chiuso ${totalCompletedRepsAll} rip (target: ${totalTargetRepsAll}). Nella prossima seduta valuta di aumentare le rip (es. da 4x5 a 4x6) o salire di peso tornando a 4x4!</div>
                    </div>
                `;
            } else if (esitoGlobale === 'COMPLETATA') {
                esitoBadge.className = 'nst-esito-badge completata';
                esitoBadge.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 24px;">check_circle</span>
                    <div>
                        <strong style="color: var(--nst-cyan);">🎯 SCHEDA COMPLETATA AL 100%!</strong>
                        <div style="font-size: 11px; margin-top: 2px;">Tutte le serie e ripetizioni target sono state chiuse perfettamente (${totalCompletedRepsAll}/${totalTargetRepsAll} rip). Ottimo lavoro!</div>
                    </div>
                `;
            } else {
                esitoBadge.className = 'nst-esito-badge parziale';
                esitoBadge.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 24px;">info</span>
                    <div>
                        <strong style="color: var(--nst-amber);">⚡ SESSIONE PARZIALE</strong>
                        <div style="font-size: 11px; margin-top: 2px;">Completate ${totalCompletedRepsAll}/${totalTargetRepsAll} rip previste. Mantieni questo carico nella prossima sessione per consolidare il volume.</div>
                    </div>
                `;
            }
        }

        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <table class="nst-ex-table">
                    <thead>
                        <tr>
                            <th>ESERCIZIO</th>
                            <th>TARGET PREVISTO</th>
                            <th>SERIE &amp; RIP EFFETTIVE</th>
                            <th>ESITO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summaryEsercizi.map(ex => {
                            let esitoBadgeColor = 'var(--nst-lime)';
                            if (ex.esito === 'SUPERATA') esitoBadgeColor = 'var(--nst-lime)';
                            else if (ex.esito === 'PARZIALE') esitoBadgeColor = 'var(--nst-amber)';
                            else esitoBadgeColor = 'var(--nst-cyan)';

                            const setsDetailStr = ex.serie_effettive.map(s => `${s.rip_completate}`).join(', ');
                            const pesiEff = ex.serie_effettive.map(s => s.peso_kg).filter(p => typeof p === 'number' && p > 0);
                            const maxEffPeso = pesiEff.length > 0 ? Math.max(...pesiEff) : ex.peso_target_kg;

                            return `
                                <tr>
                                    <td style="font-weight: 600; color: #fff;">${escapeHtml(ex.nome)}</td>
                                    <td style="color: var(--nst-text-muted); font-size: 11px;">${escapeHtml(ex.target_descrittivo)}</td>
                                    <td style="color: #f1f5f9; font-weight: 600;">
                                        ${ex.serie_effettive.length} serie (${escapeHtml(setsDetailStr)} rip)
                                        ${!ex.isBw ? `<span style="color: var(--nst-lime); margin-left: 4px;">@ ${maxEffPeso}kg</span>` : ''}
                                    </td>
                                    <td>
                                        <span style="color: ${esitoBadgeColor}; font-family: 'Orbitron', monospace; font-size: 10px; font-weight: 700;">
                                            ${ex.esito}
                                        </span>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    } else {
        if (esitoBadge) esitoBadge.classList.add('nst-hidden');
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <table class="nst-ex-table">
                    <thead>
                        <tr>
                            <th>ESERCIZIO</th>
                            <th>RISULTATO CONFERMATO</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(p.esercizi || []).map((ex, idx) => {
                            const res = document.getElementById(`nst-ibrido-ex-risultato-${idx}`)?.value || ex.target;
                            return `
                                <tr>
                                    <td style="font-weight: 600; color: #fff;">${escapeHtml(ex.nome)}</td>
                                    <td style="color: var(--nst-lime); font-weight: 700;">${escapeHtml(String(res))}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    // Sincronizza note scritte durante la seduta attiva verso la vista di salvataggio
    const inlineNoteEl = document.getElementById('nst-ibrido-workout-note-inline');
    const saveNoteEl = document.getElementById('nst-ibrido-workout-note');
    if (inlineNoteEl && saveNoteEl && inlineNoteEl.value.trim() && !saveNoteEl.value.trim()) {
        saveNoteEl.value = inlineNoteEl.value.trim();
    }

    const runningView = document.getElementById('nst-ibrido-running-view');
    const saveView = document.getElementById('nst-ibrido-save-view');
    if (runningView) runningView.classList.add('nst-hidden');
    if (saveView) saveView.classList.remove('nst-hidden');
}

function annullaSalvataggioIbrido() {
    const runningView = document.getElementById('nst-ibrido-running-view');
    const saveView = document.getElementById('nst-ibrido-save-view');
    if (runningView) runningView.classList.remove('nst-hidden');
    if (saveView) saveView.classList.add('nst-hidden');
}

async function confermaSalvaIbridoSeduta() {
    if (!ibridoSelezionato) return;
    const p = ibridoSelezionato;
    const isForza = (p.tipo === 'forza' || p.categoria === 'forza');

    const saveBtn = document.getElementById('nst-btn-confirm-save-ibrido');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="material-symbols-outlined nst-spin">progress_activity</span><span>SALVATAGGIO...</span>`;
    }

    try {
        const durataInput = document.getElementById('nst-ibrido-final-duration-input');
        const durataMinuti = parseInt(durataInput?.value, 10) || 1;
        const noteInput = document.getElementById('nst-ibrido-workout-note');
        const inlineNoteInput = document.getElementById('nst-ibrido-workout-note-inline');
        const userNote = (noteInput ? noteInput.value.trim() : '') || (inlineNoteInput ? inlineNoteInput.value.trim() : '');

        let schedaDati = null;
        let esitoPerNote = '';

        if (isForza && ibridoConfigurazionePersonalizzata && ibridoConfigurazionePersonalizzata.summaryEsercizi) {
            const summary = ibridoConfigurazionePersonalizzata.summaryEsercizi;
            const esitoGlobale = ibridoConfigurazionePersonalizzata.esitoGlobale || 'COMPLETATA';
            esitoPerNote = esitoGlobale;

            schedaDati = {
                tipo: p.tipo,
                programma_id: p.id,
                programma_nome: p.nome,
                esito_globale: esitoGlobale,
                timer_mode: p.timer_mode,
                esercizi: summary.map(ex => {
                    const pesiEffettivi = (ex.serie_effettive || []).map(s => s.peso_kg).filter(p => typeof p === 'number' && p > 0);
                    const maxPeso = pesiEffettivi.length > 0 ? Math.max(...pesiEffettivi) : (ex.peso_target_kg || 0);
                    return {
                        nome: ex.nome,
                        serie: ex.serie_effettive.length,
                        peso_kg: maxPeso,
                        peso_target_kg: ex.peso_target_kg,
                        ripetizioni: ex.rip_totali_effettive,
                        rip_target: ex.rip_target,
                        serie_target: ex.serie_target,
                        esito: ex.esito,
                        riscaldamento: ex.riscaldamento || [],
                        riscaldamento_effettivo: ex.riscaldamento_effettivo || [],
                        serie_dettaglio: ex.serie_effettive.map(s => ({
                            serie: s.serie,
                            peso_kg: typeof s.peso_kg === 'number' ? s.peso_kg : maxPeso,
                            ripetizioni: s.rip_completate
                        })),
                        target_originario: ex.target_descrittivo
                    };
                })
            };
        } else {
            const eserciziDati = (p.esercizi || []).map((ex, idx) => {
                const res = document.getElementById(`nst-ibrido-ex-risultato-${idx}`)?.value || ex.target;
                return {
                    nome: ex.nome,
                    risultato: res,
                    target_originario: ex.target
                };
            });

            schedaDati = {
                tipo: p.tipo,
                programma_id: p.id,
                programma_nome: p.nome,
                esercizi: eserciziDati,
                timer_mode: p.timer_mode
            };
        }

        const oggi = new Date().toISOString().split('T')[0];
        const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : supabaseClient;
        const user = (typeof window !== 'undefined' && window.currentUser) ? window.currentUser : currentUser;

        if (client && user?.id) {
            const defaultNote = esitoPerNote
                ? `Sessione ${p.nome} (${esitoPerNote}).`
                : `Sessione ${p.nome} completata.`;

            const { error } = await client.from('nestore_allenamenti').insert({
                utente_id: user.id,
                data_allenamento: oggi,
                corso_disciplina: `Ibrido — ${p.nome}`,
                durata_minuti: durataMinuti,
                scheda_dati: schedaDati,
                note: userNote || defaultNote
            });

            if (error) throw error;
        }

        // Reset e chiusura
        if (p.timer_mode === 'tabata') tabataEngine.reset();
        else timerEngine.reset();

        WakeLockManager.release();
        ibridoSessionMinimized = false;
        if (typeof window !== 'undefined') window.ibridoSessionMinimized = false;

        ibridoConfigurazionePersonalizzata = null;

        const modal = document.getElementById('nst-ibrido-active-modal');
        if (modal) modal.classList.add('nst-hidden');

        const toastMsg = esitoPerNote
            ? `✓ SESSIONE ${p.nome.toUpperCase()} REGISTRATA (${esitoPerNote})!`
            : `✓ SESSIONE ${p.nome.toUpperCase()} REGISTRATA CON SUCCESSO!`;

        if (typeof showTimerToast === 'function') showTimerToast(toastMsg);
        if (typeof caricaKpiDashboard === 'function' && typeof document !== 'undefined' && document.getElementById('nst-current-weight')) {
            await caricaKpiDashboard();
        }

        if (typeof renderGraficoAllenamenti === 'function' && typeof document !== 'undefined' && document.getElementById('nst-chart-allenamenti')) {
            await renderGraficoAllenamenti();
        }

        // Ricalcolo scheda atleta asincrono
        if (typeof window !== 'undefined' && window.location && window.location.origin && typeof fetch === 'function') {
            fetch('/api/nestore-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'recalculate_wiki' })
            }).catch(err => console.warn('Ricalcolo asincrono non critico:', err));
        }

    } catch (err) {
        console.error("Errore salvataggio seduta Ibrido:", err);
        if (typeof alert === 'function') alert("Errore salvataggio: " + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span class="material-symbols-outlined">save</span><span>CONFERMA E SALVA ALLENAMENTO</span>`;
        }
    }
}

function minimizzaIbridoSeduta() {
    const modal = document.getElementById('nst-ibrido-active-modal');
    if (modal) modal.classList.add('nst-hidden');
    ibridoSessionMinimized = true;
    if (typeof window !== 'undefined') window.ibridoSessionMinimized = true;
    aggiornaVisibilitaDock();
}

function chiudiIbridoActiveModal() {
    if (!ibridoSelezionato) {
        const modal = document.getElementById('nst-ibrido-active-modal');
        if (modal) modal.classList.add('nst-hidden');
        WakeLockManager.release();
        ibridoSessionMinimized = false;
        if (typeof window !== 'undefined') window.ibridoSessionMinimized = false;
        ibridoConfigurazionePersonalizzata = null;
        return;
    }
    const p = ibridoSelezionato;
    const isRunning = p.timer_mode === 'tabata' ? tabataEngine.state.running : timerEngine.state.running;
    if (isRunning) {
        if (!confirm("La sessione è ancora in corso. Vuoi interromperla e annullare il timer?")) {
            return;
        }
    }
    if (p.timer_mode === 'tabata') tabataEngine.reset();
    else timerEngine.reset();

    WakeLockManager.release();
    ibridoSessionMinimized = false;
    if (typeof window !== 'undefined') window.ibridoSessionMinimized = false;

    ibridoConfigurazionePersonalizzata = null;

    const modal = document.getElementById('nst-ibrido-active-modal');
    if (modal) modal.classList.add('nst-hidden');
}

// ===========================================================================
// SEZIONE LIBRERIA ALLENAMENTI DINAMICA (Supabase & Gestione Coach)
// ===========================================================================

let currentEditingProgramId = null;

function switchCoachMainTab(tab) {
    const athletesBtn = document.getElementById('nst-coach-tab-athletes');
    const libraryBtn = document.getElementById('nst-coach-tab-library');
    const athletesWrapper = document.getElementById('nst-coach-athletes-wrapper');
    const libraryView = document.getElementById('nst-coach-library-view');

    if (tab === 'athletes') {
        if (athletesBtn) athletesBtn.classList.add('active');
        if (libraryBtn) libraryBtn.classList.remove('active');
        if (athletesWrapper) athletesWrapper.classList.remove('nst-hidden');
        if (libraryView) libraryView.classList.add('nst-hidden');
    } else if (tab === 'library') {
        if (athletesBtn) athletesBtn.classList.remove('active');
        if (libraryBtn) libraryBtn.classList.add('active');
        if (athletesWrapper) athletesWrapper.classList.add('nst-hidden');
        if (libraryView) libraryView.classList.remove('nst-hidden');
        caricaLibreriaProgrammiCoach();
    }
}

async function caricaLibreriaProgrammi() {
    try {
        const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : supabaseClient;
        if (!client) return;
        const { data, error } = await client
            .from('nestore_programmi_libreria')
            .select('*')
            .eq('attivo', true)
            .order('ordine', { ascending: true })
            .order('nome', { ascending: true });

        if (error) {
            console.warn("Errore caricamento libreria programmi da DB (uso catalogo in cache):", error);
            return;
        }

        if (Array.isArray(data) && data.length > 0) {
            libreriaProgrammiTotali = data;
            const ibridi = data.filter(p => p.tipo === 'ibrido' || p.categoria === 'metcon' || p.categoria === 'forza');
            if (ibridi.length > 0) {
                IBRIDO_PROGRAMMI_CATALOGO = ibridi.map(p => ({
                    ...p,
                    id: p.id,
                    codice: p.codice || p.id
                }));
                if (typeof window !== 'undefined') {
                    window.IBRIDO_PROGRAMMI_CATALOGO = IBRIDO_PROGRAMMI_CATALOGO;
                }
            }
            renderCatalogoIbrido();
        }
    } catch (err) {
        console.warn("Eccezione durante fetch libreria programmi:", err);
    }
}

async function caricaLibreriaProgrammiCoach() {
    const grid = document.getElementById('nst-coach-library-grid');
    const statsPill = document.getElementById('nst-coach-library-stats-pill');

    try {
        const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : supabaseClient;
        if (!client) return;
        const { data, error } = await client
            .from('nestore_programmi_libreria')
            .select('*')
            .eq('attivo', true)
            .order('ordine', { ascending: true })
            .order('nome', { ascending: true });

        if (error) throw error;

        libreriaProgrammiTotali = data || [];
        if (statsPill) {
            statsPill.textContent = `${libreriaProgrammiTotali.length} PROGRAMMI ATTIVI`;
        }

        filtraProgrammiLibreriaCoach();
    } catch (err) {
        console.error("Errore caricamento libreria coach:", err);
        if (grid) {
            grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--nst-amber); padding: 16px;">Impossibile caricare la libreria: ${escapeHtml(err.message)}</div>`;
        }
    }
}

function filtraProgrammiLibreriaCoach() {
    const tipoVal = document.getElementById('nst-lib-filter-tipo')?.value || 'ALL';
    const searchVal = (document.getElementById('nst-lib-search-input')?.value || '').toLowerCase().trim();
    const grid = document.getElementById('nst-coach-library-grid');
    if (!grid) return;

    let filtered = [...libreriaProgrammiTotali];

    if (tipoVal === 'ibrido_metcon') {
        filtered = filtered.filter(p => (p.tipo === 'ibrido' || p.categoria === 'metcon') && p.categoria === 'metcon');
    } else if (tipoVal === 'ibrido_forza') {
        filtered = filtered.filter(p => (p.tipo === 'ibrido' || p.categoria === 'forza') && p.categoria === 'forza');
    } else if (tipoVal === 'invictus') {
        filtered = filtered.filter(p => p.tipo === 'invictus' || p.categoria === 'standard');
    } else if (tipoVal === 'altro') {
        filtered = filtered.filter(p => p.tipo !== 'ibrido' && p.tipo !== 'invictus');
    }

    if (searchVal) {
        filtered = filtered.filter(p => {
            const inNome = (p.nome || '').toLowerCase().includes(searchVal);
            const inDesc = (p.descrizione || '').toLowerCase().includes(searchVal);
            const inEx = Array.isArray(p.esercizi) && p.esercizi.some(ex => (ex.nome || '').toLowerCase().includes(searchVal));
            return inNome || inDesc || inEx;
        });
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--nst-text-muted); padding: 30px;">Nessun programma trovato con i criteri selezionati.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const isMetcon = (p.categoria === 'metcon');
        const isForza = (p.categoria === 'forza');
        const isInvictus = (p.tipo === 'invictus');
        const cardClass = isMetcon ? 'metcon' : isForza ? 'forza' : 'standard';
        const typeLabel = isMetcon ? 'IBRIDO METCON' : isForza ? 'IBRIDO FORZA' : isInvictus ? 'INVICTUS BENCHMARK' : (p.tipo ? p.tipo.toUpperCase() : 'STANDARD');

        let timerMeta = '';
        if (p.timer_mode === 'tabata') {
            timerMeta = `Tabata: ${p.work_default}"w / ${p.rest_default}"r • ${p.rounds_default} giri`;
        } else {
            timerMeta = `Cronometro: Lap & Pausa${p.giri_target ? ` • ${p.giri_target} giri` : ''}`;
        }
        if (p.tempo_target) {
            timerMeta += ` • Target: ${escapeHtml(p.tempo_target)}`;
        }

        const exPreview = Array.isArray(p.esercizi) && p.esercizi.length > 0
            ? p.esercizi.slice(0, 4).map(ex => `<div>• <strong>${escapeHtml(ex.nome)}</strong>: <span style="color:var(--nst-lime);">${escapeHtml(ex.target || (ex.rip_target ? `${ex.serie_target || 4}x${ex.rip_target}` : ''))}</span></div>`).join('') + (p.esercizi.length > 4 ? `<div style="font-style: italic; margin-top: 2px;">...e altri ${p.esercizi.length - 4} esercizi</div>` : '')
            : '<div style="font-style: italic;">Nessun esercizio dettagliato</div>';

        return `
            <div class="nst-coach-lib-card ${cardClass}">
                <div>
                    <div class="nst-coach-lib-card-header">
                        <div>
                            <div class="nst-coach-lib-title">${escapeHtml(p.nome)}</div>
                            <span class="nst-ibrido-badge ${cardClass}" style="font-size: 9px; margin-top: 4px; display: inline-block;">${typeLabel}</span>
                        </div>
                        <span class="nst-version-badge" style="font-size: 9px;">ORD: ${p.ordine || 0}</span>
                    </div>

                    <div class="nst-coach-lib-desc">${escapeHtml(p.descrizione || 'Nessuna descrizione.')}</div>

                    <div class="nst-coach-lib-meta-pill">
                        <span class="material-symbols-outlined" style="font-size: 13px;">timer</span>
                        <span>${timerMeta}</span>
                    </div>

                    <div class="nst-coach-lib-ex-preview">
                        ${exPreview}
                    </div>
                </div>

                <div class="nst-coach-lib-card-actions">
                    <button type="button" class="nst-btn-ghost-sm" style="color: var(--nst-cyan); border-color: rgba(6, 182, 212, 0.3);" onclick="apriModalAssegnaProgramma('${p.id}')" title="Assegna direttamente ad un atleta seguito">
                        <span class="material-symbols-outlined" style="font-size: 14px;">person_add</span>
                        <span>ASSEGNA</span>
                    </button>
                    <button type="button" class="nst-btn-ghost-sm" onclick="duplicaProgrammaLibreria('${p.id}')" title="Crea una copia modificabile di questo programma">
                        <span class="material-symbols-outlined" style="font-size: 14px;">content_copy</span>
                        <span>DUPLICA</span>
                    </button>
                    <button type="button" class="nst-btn-ghost-sm" onclick="apriModalEditorProgramma('${p.id}')" title="Modifica programma">
                        <span class="material-symbols-outlined" style="font-size: 14px;">edit</span>
                        <span>MODIFICA</span>
                    </button>
                    <button type="button" class="nst-btn-ghost-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" onclick="disattivaProgrammaLibreria('${p.id}')" title="Rimuovi dalla libreria">
                        <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
                        <span>DISATTIVA</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function isModalInForzaMode() {
    const tipo = document.getElementById('nst-prog-edit-tipo')?.value;
    const cat = document.getElementById('nst-prog-edit-categoria')?.value;
    return (tipo === 'forza' || cat === 'forza');
}

function apriModalEditorProgramma(progId = null) {
    currentEditingProgramId = progId;
    const modal = document.getElementById('nst-coach-programma-modal');
    const titleText = document.getElementById('nst-prog-modal-title-text');
    const idInput = document.getElementById('nst-prog-edit-id');
    const nomeInput = document.getElementById('nst-prog-edit-nome');
    const tipoSelect = document.getElementById('nst-prog-edit-tipo');
    const catSelect = document.getElementById('nst-prog-edit-categoria');
    const timerSelect = document.getElementById('nst-prog-edit-timer-mode');
    const ordineInput = document.getElementById('nst-prog-edit-ordine');
    const workInput = document.getElementById('nst-prog-edit-work');
    const restInput = document.getElementById('nst-prog-edit-rest');
    const roundsInput = document.getElementById('nst-prog-edit-rounds');
    const tempoInput = document.getElementById('nst-prog-edit-tempo-target');
    const giriInput = document.getElementById('nst-prog-edit-giri-target');
    const descInput = document.getElementById('nst-prog-edit-desc');
    const exContainer = document.getElementById('nst-prog-edit-esercizi-container');

    if (exContainer) exContainer.innerHTML = '';

    if (progId) {
        const list = (typeof window !== 'undefined' && window.libreriaProgrammiTotali && window.libreriaProgrammiTotali.length > 0)
            ? window.libreriaProgrammiTotali
            : libreriaProgrammiTotali;
        const prog = list.find(p => p.id === progId);
        const pTipo = prog ? prog.tipo : 'ibrido';
        const pCat = prog ? (prog.categoria || 'metcon') : 'metcon';
        const isForza = (pTipo === 'forza' || pCat === 'forza');

        if (titleText) titleText.textContent = `MODIFICA: ${prog ? prog.nome.toUpperCase() : 'PROGRAMMA'}`;
        if (idInput) idInput.value = progId;
        if (nomeInput) nomeInput.value = prog ? prog.nome : '';
        if (tipoSelect) tipoSelect.value = pTipo;
        if (catSelect) catSelect.value = pCat;
        if (timerSelect) timerSelect.value = prog ? (prog.timer_mode || 'stopwatch') : 'stopwatch';
        if (ordineInput) ordineInput.value = prog ? (prog.ordine || 10) : 10;
        if (workInput) workInput.value = prog ? (prog.work_default || 30) : 30;
        if (restInput) restInput.value = prog ? (prog.rest_default || 30) : 30;
        if (roundsInput) roundsInput.value = prog ? (prog.rounds_default || 8) : 8;
        if (tempoInput) tempoInput.value = prog ? (prog.tempo_target || '') : '';
        if (giriInput) giriInput.value = prog ? (prog.giri_target || '') : '';
        if (descInput) descInput.value = prog ? (prog.descrizione || '') : '';

        if (prog && Array.isArray(prog.esercizi) && prog.esercizi.length > 0) {
            prog.esercizi.forEach(ex => aggiungiRigaEsercizioModal(ex.nome || '', ex.target || '', ex.serie || null, isForza));
        } else {
            aggiungiRigaEsercizioModal('', '', null, isForza);
        }
    } else {
        if (titleText) titleText.textContent = 'NUOVO PROGRAMMA ALLENAMENTO';
        if (idInput) idInput.value = '';
        if (nomeInput) nomeInput.value = '';
        if (tipoSelect) tipoSelect.value = 'ibrido';
        if (catSelect) catSelect.value = 'metcon';
        if (timerSelect) timerSelect.value = 'tabata';
        if (ordineInput) ordineInput.value = (libreriaProgrammiTotali.length + 1) * 2;
        if (workInput) workInput.value = 30;
        if (restInput) restInput.value = 30;
        if (roundsInput) roundsInput.value = 8;
        if (tempoInput) tempoInput.value = '';
        if (giriInput) giriInput.value = '';
        if (descInput) descInput.value = '';

        const isForza = isModalInForzaMode();
        aggiungiRigaEsercizioModal('', '', null, isForza);
        aggiungiRigaEsercizioModal('', '', null, isForza);
    }

    gestisciCambioTimerMode();
    if (modal) modal.classList.remove('nst-hidden');
}

function chiudiModalEditorProgramma() {
    const modal = document.getElementById('nst-coach-programma-modal');
    if (modal && modal.classList) modal.classList.add('nst-hidden');
    currentEditingProgramId = null;
}

function gestisciCambioTimerMode() {
    const timerMode = document.getElementById('nst-prog-edit-timer-mode')?.value;
    const tabataRow = document.getElementById('nst-prog-edit-tabata-row');
    if (tabataRow) {
        if (timerMode === 'tabata') tabataRow.classList.remove('nst-hidden');
        else tabataRow.classList.add('nst-hidden');
    }
}

function gestisciCambioTipoProgramma() {
    const tipo = document.getElementById('nst-prog-edit-tipo')?.value;
    const catSelect = document.getElementById('nst-prog-edit-categoria');
    if (catSelect) {
        if (tipo === 'invictus') catSelect.value = 'standard';
        else if (tipo === 'forza') catSelect.value = 'forza';
        else if (tipo === 'ibrido' && catSelect.value === 'standard') catSelect.value = 'metcon';
        else if (catSelect.value === 'forza' && tipo !== 'forza') {
            const tipoSelect = document.getElementById('nst-prog-edit-tipo');
            if (tipoSelect) tipoSelect.value = 'forza';
        }
    }
    aggiornaLayoutEserciziModal();
}

function aggiornaLayoutEserciziModal() {
    const container = document.getElementById('nst-prog-edit-esercizi-container');
    if (!container) return;

    const isForza = isModalInForzaMode();
    const existingRows = container.querySelectorAll ? container.querySelectorAll('.nst-ex-row-edit') : [];
    if (existingRows.length === 0) return;

    const datiEsercizi = [];
    existingRows.forEach(r => {
        const nome = r.querySelector('.ex-nome')?.value || '';
        const target = r.querySelector('.ex-target')?.value || '';
        const serie = [];
        const sRows = r.querySelectorAll ? r.querySelectorAll('.nst-serie-row') : [];
        sRows.forEach(sr => {
            const rip = parseInt(sr.querySelector('.serie-rip')?.value, 10) || 5;
            const pct = parseFloat(sr.querySelector('.serie-pct')?.value) || 70;
            serie.push({ rip, pct, percentuale: pct });
        });
        datiEsercizi.push({ nome, target, serie: serie.length > 0 ? serie : null });
    });

    container.innerHTML = '';
    datiEsercizi.forEach(d => {
        aggiungiRigaEsercizioModal(d.nome, d.target, d.serie, isForza);
    });
}

function aggiungiRigaSerie(container, rip = 5, pct = 70) {
    if (!container) return;
    const list = container.classList?.contains('nst-serie-rows-list')
        ? container
        : (container.querySelector ? container.querySelector('.nst-serie-rows-list') : container);

    if (!list) return;

    const row = document.createElement('div');
    row.className = 'nst-serie-row';
    const currentCount = (list.querySelectorAll ? list.querySelectorAll('.nst-serie-row').length : 0) + 1;

    row.innerHTML = `
        <span class="nst-serie-idx-badge">Serie ${currentCount}</span>
        <div style="position: relative;">
            <input type="number" class="nst-form-input serie-rip" min="1" max="100" value="${rip}" placeholder="Rip" style="height: 30px; font-size: 12px; padding-right: 28px; text-align: center;">
            <span style="position: absolute; right: 8px; top: 6px; font-size: 10px; color: var(--nst-text-muted); pointer-events: none;">rip</span>
        </div>
        <div style="position: relative;">
            <input type="number" class="nst-form-input serie-pct" min="1" max="200" step="1" value="${pct}" placeholder="%" style="height: 30px; font-size: 12px; padding-right: 20px; text-align: center;">
            <span style="position: absolute; right: 8px; top: 6px; font-size: 10px; color: var(--nst-text-muted); pointer-events: none;">%</span>
        </div>
        <button type="button" class="nst-btn-icon-close" style="width: 26px; height: 26px; line-height: 26px; font-size: 11px;" onclick="rimuoviRigaSerie(this)" title="Rimuovi serie">✕</button>
    `;
    list.appendChild(row);
}

function rimuoviRigaSerie(btn) {
    const row = btn?.closest ? btn.closest('.nst-serie-row') : btn?.parentElement;
    const list = row?.parentElement;
    if (row && typeof row.remove === 'function') row.remove();
    if (list && list.querySelectorAll) {
        const rows = list.querySelectorAll('.nst-serie-row');
        rows.forEach((r, idx) => {
            const badge = r.querySelector('.nst-serie-idx-badge');
            if (badge) badge.textContent = `Serie ${idx + 1}`;
        });
    }
}

function aggiungiRigaEsercizioModal(nome = '', target = '', serie = null, forzaMode = null) {
    const container = document.getElementById('nst-prog-edit-esercizi-container');
    if (!container) return;

    const isForza = (forzaMode !== null) ? !!forzaMode : isModalInForzaMode();

    const row = document.createElement('div');
    row.className = 'nst-ex-row-edit' + (isForza ? ' nst-ex-forza-block' : '');

    if (isForza) {
        row.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
                <span class="material-symbols-outlined" style="color: var(--nst-amber); font-size: 18px;">fitness_center</span>
                <input type="text" class="nst-form-input ex-nome" placeholder="Nome Esercizio di Forza (es. Back Squat, Panca, Stacco)" style="flex: 1; height: 34px; font-size: 12px; font-weight: 600;" value="${escapeHtml(nome)}">
                <button type="button" class="nst-btn-icon-close" style="width: 28px; height: 28px; line-height: 28px; font-size: 12px;" onclick="this.closest('.nst-ex-row-edit').remove()" title="Rimuovi esercizio">✕</button>
            </div>
            <div class="nst-ex-serie-container" style="width: 100%;">
                <div style="display: grid; grid-template-columns: 80px 1fr 1fr 32px; gap: 8px; font-size: 10px; font-weight: 700; color: var(--nst-text-muted); text-transform: uppercase; margin-bottom: 6px; padding-left: 4px;">
                    <span>Serie</span>
                    <span>Ripetizioni</span>
                    <span>% Massimale</span>
                    <span></span>
                </div>
                <div class="nst-serie-rows-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
                <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                    <button type="button" class="nst-btn-ghost-sm nst-btn-add-serie" style="font-size: 11px; padding: 4px 10px; border-color: rgba(245,158,11,0.3); color: var(--nst-amber);">
                        + AGGIUNGI SERIE
                    </button>
                </div>
            </div>
        `;

        const serieList = row.querySelector ? row.querySelector('.nst-serie-rows-list') : null;
        const addBtn = row.querySelector ? row.querySelector('.nst-btn-add-serie') : null;
        if (addBtn && serieList) {
            addBtn.onclick = () => aggiungiRigaSerie(serieList);
        }

        const seriesToRender = (Array.isArray(serie) && serie.length > 0) ? serie : DEFAULT_FORZA_SERIE;
        seriesToRender.forEach(s => {
            const rip = s.rip || 5;
            const pct = s.pct !== undefined ? s.pct : (s.percentuale !== undefined ? s.percentuale : 70);
            aggiungiRigaSerie(serieList, rip, pct);
        });

    } else {
        row.innerHTML = `
            <input type="text" class="nst-form-input ex-nome" placeholder="Nome Esercizio (es. Pull-up)" style="flex: 2; height: 34px; font-size: 12px;" value="${escapeHtml(nome)}">
            <input type="text" class="nst-form-input ex-target" placeholder="Target / Schema (es. 4x5 @ 100kg o 15 rip)" style="flex: 2; height: 34px; font-size: 12px;" value="${escapeHtml(target)}">
            <button type="button" class="nst-btn-icon-close" style="width: 28px; height: 28px; line-height: 28px; font-size: 12px;" onclick="this.parentElement.remove()" title="Rimuovi esercizio">✕</button>
        `;
    }

    container.appendChild(row);
}

async function salvaProgrammaLibreriaDaModal() {
    const id = document.getElementById('nst-prog-edit-id')?.value;
    const nome = document.getElementById('nst-prog-edit-nome')?.value.trim();
    const tipo = document.getElementById('nst-prog-edit-tipo')?.value;
    const categoria = document.getElementById('nst-prog-edit-categoria')?.value;
    const timerMode = document.getElementById('nst-prog-edit-timer-mode')?.value;
    const ordine = parseInt(document.getElementById('nst-prog-edit-ordine')?.value, 10) || 10;
    const work = parseInt(document.getElementById('nst-prog-edit-work')?.value, 10) || 30;
    const rest = parseInt(document.getElementById('nst-prog-edit-rest')?.value, 10) || 30;
    const rounds = parseInt(document.getElementById('nst-prog-edit-rounds')?.value, 10) || 8;
    const tempoTarget = document.getElementById('nst-prog-edit-tempo-target')?.value.trim() || null;
    const giriTargetVal = document.getElementById('nst-prog-edit-giri-target')?.value;
    const giriTarget = giriTargetVal ? parseInt(giriTargetVal, 10) : null;
    const descrizione = document.getElementById('nst-prog-edit-desc')?.value.trim();

    if (!nome) {
        alert("Inserisci il nome del programma.");
        return;
    }

    const isForza = isModalInForzaMode();
    const exRows = document.querySelectorAll('#nst-prog-edit-esercizi-container .nst-ex-row-edit');
    const esercizi = [];

    exRows.forEach(r => {
        const exNome = r.querySelector('.ex-nome')?.value.trim();
        if (!exNome) return;

        if (isForza) {
            const serieRows = r.querySelectorAll ? r.querySelectorAll('.nst-serie-row') : [];
            const serie = [];
            serieRows.forEach(sr => {
                const rip = parseInt(sr.querySelector('.serie-rip')?.value, 10) || 0;
                const pct = parseFloat(sr.querySelector('.serie-pct')?.value) || 0;
                if (rip > 0 || pct > 0) {
                    serie.push({ rip, pct, percentuale: pct });
                }
            });
            const finalSerie = serie.length > 0 ? serie : DEFAULT_FORZA_SERIE;
            const targetStr = finalSerie.map(s => `${s.rip} rip @ ${s.pct}%`).join(', ');
            esercizi.push({
                nome: exNome,
                serie: finalSerie,
                target: targetStr
            });
        } else {
            const exTarget = r.querySelector('.ex-target')?.value.trim() || '';
            esercizi.push({ nome: exNome, target: exTarget });
        }
    });

    const payload = {
        nome,
        tipo,
        categoria,
        timer_mode: timerMode,
        work_default: timerMode === 'tabata' ? work : null,
        rest_default: timerMode === 'tabata' ? rest : null,
        rounds_default: timerMode === 'tabata' ? rounds : null,
        tempo_target: tempoTarget,
        giri_target: giriTarget,
        descrizione,
        ordine,
        esercizi,
        attivo: true,
        aggiornato_il: new Date().toISOString()
    };

    const saveBtn = document.getElementById('nst-btn-salva-programma-lib');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="material-symbols-outlined nst-spin">progress_activity</span><span>SALVATAGGIO...</span>`;
    }

    try {
        const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : supabaseClient;
        if (!client) throw new Error("Client Supabase non disponibile.");

        if (id) {
            const { error } = await client
                .from('nestore_programmi_libreria')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
        } else {
            payload.creato_da = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
            const { error } = await client
                .from('nestore_programmi_libreria')
                .insert(payload);
            if (error) throw error;
        }

        chiudiModalEditorProgramma();
        if (typeof showTimerToast === 'function') showTimerToast("✓ PROGRAMMA SALVATO CON SUCCESSO NELLA LIBRERIA!");

        if (typeof caricaLibreriaProgrammiCoach === 'function') await caricaLibreriaProgrammiCoach();
        if (typeof caricaLibreriaProgrammi === 'function') await caricaLibreriaProgrammi();

    } catch (err) {
        console.error("Errore salvataggio programma:", err);
        if (typeof alert === 'function') alert("Errore salvataggio programma: " + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span class="material-symbols-outlined">save</span><span>SALVA PROGRAMMA</span>`;
        }
    }
}

async function disattivaProgrammaLibreria(progId) {
    const prog = libreriaProgrammiTotali.find(p => p.id === progId);
    const nome = prog ? prog.nome : 'questo programma';
    if (!confirm(`Sei sicuro di voler disattivare "${nome}" dalla libreria atleti?\n\n(Regola EPIKA: Il programma non verrà eliminato fisicamente, ma archiviato per mantenere intatto lo storico degli atleti)`)) {
        return;
    }

    try {
        if (!supabaseClient) throw new Error("Client Supabase non disponibile.");
        const { error } = await supabaseClient
            .from('nestore_programmi_libreria')
            .update({ attivo: false, aggiornato_il: new Date().toISOString() })
            .eq('id', progId);

        if (error) throw error;

        showTimerToast(`✓ Programma "${nome}" archiviato.`);
        await caricaLibreriaProgrammiCoach();
        await caricaLibreriaProgrammi();
    } catch (err) {
        console.error("Errore disattivazione programma:", err);
        alert("Errore disattivazione: " + err.message);
    }
}

function duplicaProgrammaLibreria(progId) {
    const list = (typeof window !== 'undefined' && window.libreriaProgrammiTotali && window.libreriaProgrammiTotali.length > 0)
        ? window.libreriaProgrammiTotali
        : libreriaProgrammiTotali;
    const prog = (list || []).find(p => p.id === progId);
    if (!prog) {
        if (typeof alert === 'function') alert("Programma non trovato per la duplicazione.");
        return;
    }

    apriModalEditorProgramma(progId);

    // Modalità duplicazione: svuota l'ID per forzare un nuovo insert
    currentEditingProgramId = null;
    const idInput = document.getElementById('nst-prog-edit-id');
    if (idInput) idInput.value = '';

    const titleText = document.getElementById('nst-prog-modal-title-text');
    if (titleText) titleText.textContent = `DUPLICA: ${prog.nome.toUpperCase()} (COPIA)`;

    const nomeInput = document.getElementById('nst-prog-edit-nome');
    if (nomeInput) nomeInput.value = `${prog.nome} (Copia)`;

    const ordineInput = document.getElementById('nst-prog-edit-ordine');
    if (ordineInput) ordineInput.value = (prog.ordine || 10) + 1;
}

async function garantisciAtletiCoachCaricati() {
    if (coachCorsiAtleti && coachCorsiAtleti.length > 0) return coachCorsiAtleti;
    if (typeof isAuthorizedAdmin !== 'undefined' && isAuthorizedAdmin) {
        await caricaAdminDashboard();
    } else if (typeof caricaCoachDashboard === 'function') {
        await caricaCoachDashboard();
    }
    return coachCorsiAtleti || [];
}

async function apriModalAssegnaProgramma(progId) {
    const modal = document.getElementById('nst-modal-assegna-programma');
    if (!modal) return;

    const prog = (libreriaProgrammiTotali || []).find(p => p.id === progId);
    if (!prog) {
        alert("Programma non trovato.");
        return;
    }

    const progIdInput = document.getElementById('nst-assegna-modal-prog-id');
    if (progIdInput) progIdInput.value = prog.id;

    const nomeEl = document.getElementById('nst-assegna-modal-prog-nome');
    if (nomeEl) nomeEl.textContent = prog.nome.toUpperCase();

    const metaEl = document.getElementById('nst-assegna-modal-prog-meta');
    if (metaEl) {
        const timerDesc = prog.timer_mode === 'tabata'
            ? `Tabata (${prog.work_default || 30}"w / ${prog.rest_default || 30}"r • ${prog.rounds_default || 8} rounds)`
            : 'Cronometro con Lap e Pausa';
        const exCount = Array.isArray(prog.esercizi) ? prog.esercizi.length : 0;
        metaEl.textContent = `${(prog.categoria || prog.tipo || 'Standard').toUpperCase()} • ${timerDesc} • ${exCount} esercizi`;
    }

    const periodoInput = document.getElementById('nst-assegna-modal-periodo');
    if (periodoInput) periodoInput.value = '';

    const noteInput = document.getElementById('nst-assegna-modal-note');
    if (noteInput) noteInput.value = prog.descrizione || '';

    // Popola select atleti
    const atletaSelect = document.getElementById('nst-assegna-modal-atleta-select');
    if (atletaSelect) {
        atletaSelect.innerHTML = '<option value="">Caricamento atleti in corso...</option>';
        try {
            await garantisciAtletiCoachCaricati();
            atletaSelect.innerHTML = '<option value="">-- Seleziona atleta --</option>';

            const uniqueAtleti = new Map();
            (coachCorsiAtleti || []).forEach(corso => {
                (corso.atleti || []).forEach(a => {
                    if (!uniqueAtleti.has(a.id)) {
                        uniqueAtleti.set(a.id, { ...a, corsoTitolo: corso.titolo });
                    }
                });
            });

            if (uniqueAtleti.size === 0) {
                atletaSelect.innerHTML = '<option value="">Nessun atleta attivo nei tuoi corsi</option>';
            } else {
                uniqueAtleti.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = `${a.cognome || ''} ${a.nome || ''} (${a.corsoTitolo || 'Corso'})`.trim();
                    atletaSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("Errore popolamento atleti modale:", e);
            atletaSelect.innerHTML = '<option value="">Errore caricamento atleti</option>';
        }
    }

    modal.classList.remove('nst-hidden');
}

function chiudiModalAssegnaProgramma() {
    const modal = document.getElementById('nst-modal-assegna-programma');
    if (modal) modal.classList.add('nst-hidden');
}

async function confermaAssegnazioneProgrammaDaModal() {
    const progId = document.getElementById('nst-assegna-modal-prog-id')?.value;
    const atletaId = document.getElementById('nst-assegna-modal-atleta-select')?.value;
    const periodo = document.getElementById('nst-assegna-modal-periodo')?.value.trim();
    const note = document.getElementById('nst-assegna-modal-note')?.value.trim();

    if (!progId) {
        alert("Nessun programma selezionato.");
        return;
    }
    if (!atletaId) {
        alert("Seleziona un atleta a cui assegnare il programma.");
        document.getElementById('nst-assegna-modal-atleta-select')?.focus();
        return;
    }

    const prog = (libreriaProgrammiTotali || []).find(p => p.id === progId);
    const progNome = prog ? prog.nome : 'Programma';

    const btn = document.getElementById('nst-btn-conferma-assegna-modal');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined nst-spin">progress_activity</span><span>ASSEGNAZIONE...</span>';
    }

    try {
        if (!supabaseClient) throw new Error("Client Supabase non inizializzato.");

        // Storicizzazione EPIKA: soft-delete schede attive precedenti per questo atleta
        await supabaseClient
            .from('nestore_schede_allenamento')
            .update({ attivo: false, aggiornato_il: new Date().toISOString() })
            .eq('atleta_id', atletaId)
            .eq('attivo', true);

        // Inserimento nuova scheda con foreign key programma_libreria_id
        const { error: insErr } = await supabaseClient
            .from('nestore_schede_allenamento')
            .insert({
                atleta_id: atletaId,
                allenatore_id: currentUser ? currentUser.id : null,
                titolo: progNome,
                periodo: periodo || null,
                obiettivo: note || (prog ? prog.descrizione : null),
                programma_libreria_id: progId,
                attivo: true
            });

        if (insErr) throw insErr;

        chiudiModalAssegnaProgramma();
        showTimerToast(`✓ Programma "${progNome}" assegnato con successo!`);

        // Se l'atleta era attualmente aperto nell'ispezione coach, aggiorna le schede
        if (selectedCoachAtleta && selectedCoachAtleta.id === atletaId) {
            await caricaSchedeAtleta(selectedCoachAtleta.id, 'nst-coach-schede-history-list', true);
        }

    } catch (err) {
        console.error("Errore assegnazione programma da libreria:", err);
        alert("Errore durante l'assegnazione del programma: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">send</span><span>CONFERMA ASSEGNAZIONE</span>';
        }
    }
}

window.libreriaProgrammiTotali = libreriaProgrammiTotali;
window.switchCoachMainTab = switchCoachMainTab;
window.caricaLibreriaProgrammi = caricaLibreriaProgrammi;
window.caricaLibreriaProgrammiCoach = caricaLibreriaProgrammiCoach;
window.filtraProgrammiLibreriaCoach = filtraProgrammiLibreriaCoach;
window.apriModalEditorProgramma = apriModalEditorProgramma;
window.chiudiModalEditorProgramma = chiudiModalEditorProgramma;
window.gestisciCambioTimerMode = gestisciCambioTimerMode;
window.gestisciCambioTipoProgramma = gestisciCambioTipoProgramma;
window.aggiungiRigaEsercizioModal = aggiungiRigaEsercizioModal;
window.salvaProgrammaLibreriaDaModal = salvaProgrammaLibreriaDaModal;
window.disattivaProgrammaLibreria = disattivaProgrammaLibreria;
window.duplicaProgrammaLibreria = duplicaProgrammaLibreria;
window.apriModalAssegnaProgramma = apriModalAssegnaProgramma;
window.chiudiModalAssegnaProgramma = chiudiModalAssegnaProgramma;
window.confermaAssegnazioneProgrammaDaModal = confermaAssegnazioneProgrammaDaModal;
window.popolaSelectProgrammiLibreriaPerScheda = popolaSelectProgrammiLibreriaPerScheda;
window.gestisciSelezioneProgrammaPerScheda = gestisciSelezioneProgrammaPerScheda;
window.ottieniBaseMassimaleEsercizio = ottieniBaseMassimaleEsercizio;
window.DEFAULT_FORZA_SERIE = DEFAULT_FORZA_SERIE;
window.DEFAULT_FORZA_WARMUP = DEFAULT_FORZA_WARMUP;
window.isPureBodyweight = isPureBodyweight;
window.ottieniMassimoStoricoEsercizio = ottieniMassimoStoricoEsercizio;
window.recuperaUltimaSessioneProgramma = recuperaUltimaSessioneProgramma;
window.verificaForzaMaxStorico = verificaForzaMaxStorico;
window.aggiungiSerieExtraForza = aggiungiSerieExtraForza;
window.isModalInForzaMode = isModalInForzaMode;
window.aggiungiRigaSerie = aggiungiRigaSerie;
window.rimuoviRigaSerie = rimuoviRigaSerie;
window.aggiornaLayoutEserciziModal = aggiornaLayoutEserciziModal;

window.IBRIDO_PROGRAMMI_CATALOGO = IBRIDO_PROGRAMMI_CATALOGO;
window.renderCatalogoIbrido = renderCatalogoIbrido;
window.apriAnteprimaIbrido = apriAnteprimaIbrido;
window.chiudiAnteprimaIbrido = chiudiAnteprimaIbrido;
window.modificaIbridoParam = modificaIbridoParam;
window.aggiornaIbridoParamDaInput = aggiornaIbridoParamDaInput;
window.avviaIbridoSeduta = avviaIbridoSeduta;
window.gestisciIbridoActionPause = gestisciIbridoActionPause;
window.gestisciIbridoActionSecondary = gestisciIbridoActionSecondary;
window.terminaIbridoSeduta = terminaIbridoSeduta;
window.annullaSalvataggioIbrido = annullaSalvataggioIbrido;
window.confermaSalvaIbridoSeduta = confermaSalvaIbridoSeduta;
window.chiudiIbridoActiveModal = chiudiIbridoActiveModal;
window.minimizzaIbridoSeduta = minimizzaIbridoSeduta;
window.getIbridoSessionMinimized = getIbridoSessionMinimized;
window.setIbridoSessionMinimized = setIbridoSessionMinimized;
window.aggiornaIbridoModalAttivo = aggiornaIbridoModalAttivo;
window.WakeLockManager = WakeLockManager;
window.toggleIbridoNoteInSession = toggleIbridoNoteInSession;

window.gestisciTimerPrimaryClick = gestisciTimerPrimaryClick;
window.gestisciTimerResetClick = gestisciTimerResetClick;
window.modificaTabataParam = modificaTabataParam;
window.aggiornaConfigDaInput = aggiornaConfigDaInput;
window.tabataApplyPreset = tabataApplyPreset;
window.dockToggleTimer = dockToggleTimer;
window.dockExpandTimer = dockExpandTimer;
window.normalizeExerciseName = normalizeExerciseName;
window.isBetterPerformance = isBetterPerformance;
window.parseExercisesFromWorkout = parseExercisesFromWorkout;
window.calcolaRecordPersonali = calcolaRecordPersonali;
window.salvaAltezzaRapida = salvaAltezzaRapida;
window.modificaAltezzaPrompt = modificaAltezzaPrompt;
window.caricaSchedaAtletaUI = caricaSchedaAtletaUI;
window.aggiornaSchedaManuale = aggiornaSchedaManuale;
window.switchNestoreView = switchNestoreView;
window.switchNestorePanel = switchNestorePanel;
window.caricaCoachDashboard = caricaCoachDashboard;
window.caricaAdminDashboard = caricaAdminDashboard;
window.filtraCorsoCoach = filtraCorsoCoach;
window.cercaAtletiCoach = cercaAtletiCoach;
window.apriAtletaPerAllenatore = apriAtletaPerAllenatore;
window.chiudiDettaglioAtletaPerCoach = chiudiDettaglioAtletaPerCoach;
window.switchCoachSubpanel = switchCoachSubpanel;
window.caricaDatiAtletaPerCoach = caricaDatiAtletaPerCoach;
window.caricaSchedeAtleta = caricaSchedeAtleta;
window.selezionaModalitaScheda = selezionaModalitaScheda;
window.aggiornaConteggioTestoScheda = aggiornaConteggioTestoScheda;
window.gestisciFileSchedaCoach = gestisciFileSchedaCoach;
window.inviaNuovaSchedaCoach = inviaNuovaSchedaCoach;
window.archiviaSchedaCoach = archiviaSchedaCoach;
window.scaricaFileScheda = scaricaFileScheda;
window.apriModalSchedaTesto = apriModalSchedaTesto;
window.chiudiModalSchedaTesto = chiudiModalSchedaTesto;
window.copiaTestoSchedaModal = copiaTestoSchedaModal;
window.modificaTargetCalorie = modificaTargetCalorie;
window.renderGraficoDieta = renderGraficoDieta;
window.modificaInvictusPull = modificaInvictusPull;
window.apriAnteprimaInvictus = apriAnteprimaInvictus;
window.chiudiAnteprimaInvictus = chiudiAnteprimaInvictus;
window.avviaAllenamentoInvictus = avviaAllenamentoInvictus;
window.gestisciWorkoutModalPausa = gestisciWorkoutModalPausa;
window.gestisciWorkoutModalLap = gestisciWorkoutModalLap;
window.terminaAllenamentoAttivo = terminaAllenamentoAttivo;
window.annullaSalvataggioWorkout = annullaSalvataggioWorkout;
window.confermaSalvaAllenamentoStandard = confermaSalvaAllenamentoStandard;
window.chiudiModalWorkoutAttivo = chiudiModalWorkoutAttivo;
window.escapeHtml = escapeHtml;
window.isIscrizioneAttiva = isIscrizioneAttiva;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        isIscrizioneAttiva,
        normalizeExerciseName,
        isBetterPerformance,
        parseExercisesFromWorkout,
        calcolaRecordPersonali,
        salvaAltezzaRapida,
        modificaAltezzaPrompt,
        modificaTargetCalorie,
        renderGraficoDieta,
        caricaSchedaAtletaUI,
        aggiornaSchedaManuale,
        switchNestoreView,
        switchNestorePanel,
        caricaCoachDashboard,
        caricaAdminDashboard,
        caricaSchedeAtleta,
        modificaInvictusPull,
        apriAnteprimaInvictus,
        chiudiAnteprimaInvictus,
        avviaAllenamentoInvictus,
        gestisciWorkoutModalPausa,
        gestisciWorkoutModalLap,
        terminaAllenamentoAttivo,
        annullaSalvataggioWorkout,
        confermaSalvaAllenamentoStandard,
        chiudiModalWorkoutAttivo,
        IBRIDO_PROGRAMMI_CATALOGO,
        renderCatalogoIbrido,
        apriAnteprimaIbrido,
        chiudiAnteprimaIbrido,
        modificaIbridoParam,
        aggiornaIbridoParamDaInput,
        avviaIbridoSeduta,
        gestisciIbridoActionPause,
        gestisciIbridoActionSecondary,
        terminaIbridoSeduta,
        annullaSalvataggioIbrido,
        confermaSalvaIbridoSeduta,
        chiudiIbridoActiveModal,
        minimizzaIbridoSeduta,
        getIbridoSessionMinimized,
        setIbridoSessionMinimized,
        switchCoachMainTab,
        caricaLibreriaProgrammi,
        caricaLibreriaProgrammiCoach,
        filtraProgrammiLibreriaCoach,
        apriModalEditorProgramma,
        chiudiModalEditorProgramma,
        gestisciCambioTimerMode,
        gestisciCambioTipoProgramma,
        aggiungiRigaEsercizioModal,
        salvaProgrammaLibreriaDaModal,
        disattivaProgrammaLibreria,
        duplicaProgrammaLibreria,
        apriModalAssegnaProgramma,
        chiudiModalAssegnaProgramma,
        confermaAssegnazioneProgrammaDaModal,
        popolaSelectProgrammiLibreriaPerScheda,
        gestisciSelezioneProgrammaPerScheda,
        ottieniBaseMassimaleEsercizio,
        DEFAULT_FORZA_SERIE,
        DEFAULT_FORZA_WARMUP,
        WakeLockManager,
        toggleIbridoNoteInSession,
        isPureBodyweight,
        ottieniMassimoStoricoEsercizio,
        recuperaUltimaSessioneProgramma,
        verificaForzaMaxStorico,
        aggiungiSerieExtraForza,
        isModalInForzaMode,
        aggiungiRigaSerie,
        rimuoviRigaSerie,
        aggiornaLayoutEserciziModal
    };
}

