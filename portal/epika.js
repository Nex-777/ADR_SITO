// ===========================================================================
// EPIKA PORTAL JAVASCRIPT
// ===========================================================================

const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentUserProfile = null;
let gruppiStorici = [];
let popoliList = [];
let allenatoriLista = [];
let gruppiLavoro = [];
let isEpikaAdmin = false;
let tesseratiCache = [];
let scabStrutture = [];
let soggettiValidatori = [];
let soggettiAllenatori = [];
let soggettiAllievi = [];
let abbinamentiState = {};
let managedGroups = [];
let isCapogruppo = false;
let currentManagedGroupId = null;
let currentScabRuolo = null;
let currentScabOpzioneId = null;
let simulatedScabOpzioneId = null; // Per la simulazione admin


document.addEventListener('DOMContentLoaded', () => {
    initPortal();
});

// Tornare al portale principale Adrenalina
function tornaAdAdrenalina() {
    if (window.opener) {
        window.opener.focus();
        window.close();
    } else {
        window.location.href = "dashboard.html";
    }
}

// Inizializzazione Portale
async function initPortal() {
    try {
        // 1. Rileva Sessione
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error || !session) {
            console.warn("Sessione non trovata. Reindirizzamento al login...");
            window.location.href = `login.html?redirect=epika`;
            return;
        }

        currentUser = session.user;
        console.log("Sessione trovata per utente ID:", currentUser.id);

        // Recupera info utente reale ed enum dei ruoli Adrenalina
        const { data: userData, error: userError } = await supabaseClient
            .from('utenti')
            .select('nome, cognome, ruolo')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (userError) {
            console.error("Errore recupero utenti:", userError);
            alert("Errore caricamento profilo utenti: " + userError.message);
        }

        if (userData) {
            document.getElementById('epk-user-real-name').textContent = `${userData.nome} ${userData.cognome}`;
        } else {
            console.warn("Nessun record trovato in utenti per ID:", currentUser.id);
        }

        // Default value per il primo anno di partecipazione (anno corrente)
        const currentYear = new Date().getFullYear();
        const yearInput = document.getElementById('fa-primo-anno');
        if (yearInput) {
            yearInput.value = currentYear;
            yearInput.max = currentYear;
        }

        // 2. Controlla se il profilo EPIKA esiste già
        const { data: epikaProfile, error: epikaError } = await supabaseClient
            .from('epika_profili')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (epikaError) {
            console.error("Errore query profilo epika:", epikaError);
            alert("Errore query profilo epika: " + epikaError.message);
        }

        // Determina se l'utente loggato è amministratore di EPIKA
        isEpikaAdmin = (epikaProfile && epikaProfile.is_admin_epika === true) || 
                       (userData && Array.isArray(userData.ruolo) && userData.ruolo.includes('presidente'));

        // Determina se l'utente loggato è Capogruppo o Vice Capogruppo di un gruppo attivo
        try {
            const { data: gruppiGest, error: ggError } = await supabaseClient
                .from('epika_gruppi_storici')
                .select('*')
                .or(`capogruppo_id.eq.${currentUser.id},vice_capogruppo_id.eq.${currentUser.id}`)
                .eq('attivo', true);

            if (ggError) throw ggError;
            managedGroups = gruppiGest || [];
            isCapogruppo = managedGroups.length > 0;
            if (isCapogruppo) {
                currentManagedGroupId = managedGroups[0].id;
            }
        } catch (e) {
            console.error("Errore recupero gruppi gestiti:", e);
        }

        // Rilevamento ruolo SCAB per utente reale
        // Usa limit(1) invece di maybeSingle() per gestire il caso in cui
        // uno stesso utente sia abbinato a più ruoli (es. allenatore + validatore)
        try {
            const { data: scabRecords, error: scabErr } = await supabaseClient
                .from('epika_opzioni')
                .select('id, tipo')
                .eq('utente_id', currentUser.id)
                .in('tipo', ['allenatore', 'scab_validatore', 'scab_allievo_allenatore'])
                .limit(1);

            if (!scabErr && scabRecords && scabRecords.length > 0) {
                currentScabRuolo = scabRecords[0].tipo;
                currentScabOpzioneId = scabRecords[0].id;
                console.log("Rilevato ruolo SCAB:", currentScabRuolo, "ID opzione:", currentScabOpzioneId);
            }
        } catch (e) {
            console.error("Errore recupero ruolo SCAB utente:", e);
        }


        // Determina se l'utente appartiene a qualche direttivo/gruppo di lavoro
        const gLavoroIds = (epikaProfile && Array.isArray(epikaProfile.gruppo_lavoro_ids)) ? epikaProfile.gruppo_lavoro_ids.map(Number) : [];
        const hasDirettivoEpika = gLavoroIds.includes(1);
        const hasDirettivoScab = gLavoroIds.includes(2);
        const hasDirettivoLogistica = gLavoroIds.includes(3);
        const hasDirettivoMarketing = gLavoroIds.includes(4);
        const isCapogruppoLavoro = isCapogruppo || gLavoroIds.includes(5) || gLavoroIds.includes(6) || gLavoroIds.includes(7) || gLavoroIds.includes(9);

        // Gestione switcher di vista (per admin, capogruppo, direttivi e ruoli SCAB)
        const haQualcheRuoloSpeciale = isEpikaAdmin || isCapogruppoLavoro || hasDirettivoEpika || hasDirettivoScab || hasDirettivoLogistica || hasDirettivoMarketing || !!currentScabRuolo;
        if (haQualcheRuoloSpeciale) {
            const adminSwitcher = document.getElementById('epk-admin-switcher');
            adminSwitcher.innerHTML = '<option value="athlete">VISTA ATLETA</option>';
            if (isCapogruppoLavoro) {
                adminSwitcher.innerHTML += '<option value="capogruppo">VISTA CAPOGRUPPO</option>';
            }
            if (hasDirettivoEpika) {
                adminSwitcher.innerHTML += '<option value="direttivo_epika">VISTA DIRETTIVO EPIKA</option>';
            }
            if (hasDirettivoScab) {
                adminSwitcher.innerHTML += '<option value="direttivo_scab">VISTA DIRETTIVO SCAB</option>';
            }
            if (hasDirettivoLogistica) {
                adminSwitcher.innerHTML += '<option value="direttivo_logistica">VISTA DIRETTIVO LOGISTICA</option>';
            }
            if (hasDirettivoMarketing) {
                adminSwitcher.innerHTML += '<option value="direttivo_marketing">VISTA DIRETTIVO MARKETING</option>';
            }
            if (currentScabRuolo === 'allenatore') {
                adminSwitcher.innerHTML += '<option value="allenatore">VISTA ALLENATORE</option>';
            }
            if (currentScabRuolo === 'scab_allievo_allenatore') {
                adminSwitcher.innerHTML += '<option value="allievo_allenatore">VISTA ALLIEVO ALL.</option>';
            }
            if (currentScabRuolo === 'scab_validatore') {
                adminSwitcher.innerHTML += '<option value="validatore">VISTA VALIDATORE</option>';
            }
            if (isEpikaAdmin) {
                adminSwitcher.innerHTML += '<option value="admin">VISTA AMMINISTRATORE</option>';
                adminSwitcher.innerHTML += '<option value="simula_allenatore">🔍 SIMULA ALLENATORE</option>';
                adminSwitcher.innerHTML += '<option value="simula_allievo">🔍 SIMULA ALLIEVO ALL.</option>';
                adminSwitcher.innerHTML += '<option value="simula_validatore">🔍 SIMULA VALIDATORE</option>';
            }
            adminSwitcher.classList.remove('epk-hidden');
            
            // Se l'URL contiene parametri, seleziona direttamente la vista
            const urlParams = new URLSearchParams(window.location.search);
            const viewParam = urlParams.get('view');
            const adminParam = urlParams.get('admin');
            if (adminParam === 'true' && isEpikaAdmin) {
                adminSwitcher.value = 'admin';
            } else if (viewParam === 'direttivo_epika' && hasDirettivoEpika) {
                adminSwitcher.value = 'direttivo_epika';
            } else if (viewParam === 'direttivo_scab' && hasDirettivoScab) {
                adminSwitcher.value = 'direttivo_scab';
            } else if (viewParam === 'direttivo_logistica' && hasDirettivoLogistica) {
                adminSwitcher.value = 'direttivo_logistica';
            } else if (viewParam === 'direttivo_marketing' && hasDirettivoMarketing) {
                adminSwitcher.value = 'direttivo_marketing';
            } else if (viewParam === 'capogruppo' && isCapogruppoLavoro) {
                adminSwitcher.value = 'capogruppo';
            } else if (viewParam === 'allenatore' && currentScabRuolo === 'allenatore') {
                adminSwitcher.value = 'allenatore';
            } else if (viewParam === 'allievo_allenatore' && currentScabRuolo === 'scab_allievo_allenatore') {
                adminSwitcher.value = 'allievo_allenatore';
            } else if (viewParam === 'validatore' && currentScabRuolo === 'scab_validatore') {
                adminSwitcher.value = 'validatore';
            }
        }

        // Nascondi loader iniziale
        document.getElementById('epk-loader').classList.add('epk-hidden');

        if (epikaProfile && epikaProfile.profilo_completato) {
            // Profilo già completato, mostra dashboard
            currentUserProfile = epikaProfile;
            document.getElementById('epk-user-battle-name').textContent = `~ ${epikaProfile.nome_di_battaglia} ~`;
            
            const viewMode = document.getElementById('epk-admin-switcher').value || 'athlete';
            if (viewMode === 'admin' || viewMode.startsWith('direttivo_')) {
                document.getElementById('epk-admin').classList.remove('epk-hidden');
                await renderAdminDashboard();
            } else if (viewMode === 'capogruppo') {
                document.getElementById('epk-capogruppo').classList.remove('epk-hidden');
                await renderCapogruppoDashboard(currentManagedGroupId);
            } else if (viewMode === 'allenatore') {
                document.getElementById('epk-allenatore').classList.remove('epk-hidden');
                await renderAllenatoreDashboard(currentScabOpzioneId);
            } else if (viewMode === 'allievo_allenatore') {
                document.getElementById('epk-allievo').classList.remove('epk-hidden');
                await renderAllievoAllenatoreDashboard(currentScabOpzioneId);
            } else if (viewMode === 'validatore') {
                document.getElementById('epk-validatore').classList.remove('epk-hidden');
                await renderValidatoreDashboard(currentScabOpzioneId);
            } else if (viewMode.startsWith('simula_')) {
                mostraSimulationBanner(viewMode);
            } else {
                document.getElementById('epk-main').classList.remove('epk-hidden');
                await renderAthleteDashboard();
            }
        } else {
            // Primo accesso o profilo incompleto, popola e mostra il form
            console.log("Nessun profilo completato trovato. Mostro form primo accesso.");
            await caricaLookupDati();
            document.getElementById('epk-first-access').classList.remove('epk-hidden');
        }

        // Gestione form submit
        const form = document.getElementById('epk-first-access-form');
        if (form) {
            form.addEventListener('submit', handleFirstAccessSubmit);
        }

    } catch (err) {
        console.error("Errore in initPortal:", err);
        alert("Errore critico durante l'inizializzazione del portale: " + err.message);
    }
}

// Switch tra Vista Atleta, Vista Capogruppo e Vista Amministratore
async function switchEpikaView(view) {
    // Nascondi tutto
    document.getElementById('epk-main').classList.add('epk-hidden');
    document.getElementById('epk-admin').classList.add('epk-hidden');
    document.getElementById('epk-capogruppo').classList.add('epk-hidden');
    document.getElementById('epk-allenatore').classList.add('epk-hidden');
    document.getElementById('epk-allievo').classList.add('epk-hidden');
    document.getElementById('epk-validatore').classList.add('epk-hidden');
    
    // Chiudi banner simulazione se non stiamo simulando
    if (!view.startsWith('simula_')) {
        document.getElementById('epk-simulation-banner').classList.add('epk-hidden');
        simulatedScabOpzioneId = null;
    }
    
    if (view === 'admin' || view.startsWith('direttivo_')) {
        document.getElementById('epk-admin').classList.remove('epk-hidden');
        await renderAdminDashboard();
    } else if (view === 'capogruppo') {
        document.getElementById('epk-capogruppo').classList.remove('epk-hidden');
        await renderCapogruppoDashboard(currentManagedGroupId);
    } else if (view === 'allenatore') {
        document.getElementById('epk-allenatore').classList.remove('epk-hidden');
        await renderAllenatoreDashboard(simulatedScabOpzioneId || currentScabOpzioneId);
    } else if (view === 'allievo_allenatore') {
        document.getElementById('epk-allievo').classList.remove('epk-hidden');
        await renderAllievoAllenatoreDashboard(simulatedScabOpzioneId || currentScabOpzioneId);
    } else if (view === 'validatore') {
        document.getElementById('epk-validatore').classList.remove('epk-hidden');
        await renderValidatoreDashboard(simulatedScabOpzioneId || currentScabOpzioneId);
    } else if (view.startsWith('simula_')) {
        await mostraSimulationBanner(view);
    } else {
        document.getElementById('epk-main').classList.remove('epk-hidden');
        await renderAthleteDashboard();
    }
}

// Logiche del Banner di Simulazione Admin
async function mostraSimulationBanner(tipoSimula) {
    const banner = document.getElementById('epk-simulation-banner');
    const select = document.getElementById('epk-sim-subject-select');
    if (!banner || !select) return;

    banner.classList.remove('epk-hidden');
    select.innerHTML = '<option value="" disabled selected>Caricamento...</option>';

    let dbTipo = '';
    if (tipoSimula === 'simula_allenatore') dbTipo = 'allenatore';
    else if (tipoSimula === 'simula_allievo') dbTipo = 'scab_allievo_allenatore';
    else if (tipoSimula === 'simula_validatore') dbTipo = 'scab_validatore';

    try {
        const { data: soggetti, error } = await supabaseClient
            .from('epika_opzioni')
            .select('id, valore')
            .eq('tipo', dbTipo)
            .eq('attivo', true)
            .order('valore', { ascending: true });

        if (error) throw error;

        select.innerHTML = '<option value="" disabled selected>SCEGLI SOGGETTO...</option>';
        (soggetti || []).forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.valore.toUpperCase()}</option>`;
        });
    } catch (e) {
        console.error("Errore caricamento soggetti simulazione:", e);
        select.innerHTML = '<option value="">Errore caricamento</option>';
    }
}

async function applicaSimulazione() {
    const val = document.getElementById('epk-sim-subject-select').value;
    if (!val) {
        alert("Seleziona prima un soggetto da simulare.");
        return;
    }
    
    simulatedScabOpzioneId = parseInt(val);
    const viewMode = document.getElementById('epk-admin-switcher').value;

    // Nascondi container attivi
    document.getElementById('epk-allenatore').classList.add('epk-hidden');
    document.getElementById('epk-allievo').classList.add('epk-hidden');
    document.getElementById('epk-validatore').classList.add('epk-hidden');

    if (viewMode === 'simula_allenatore') {
        document.getElementById('epk-allenatore').classList.remove('epk-hidden');
        await renderAllenatoreDashboard(simulatedScabOpzioneId);
    } else if (viewMode === 'simula_allievo') {
        document.getElementById('epk-allievo').classList.remove('epk-hidden');
        await renderAllievoAllenatoreDashboard(simulatedScabOpzioneId);
    } else if (viewMode === 'simula_validatore') {
        document.getElementById('epk-validatore').classList.remove('epk-hidden');
        await renderValidatoreDashboard(simulatedScabOpzioneId);
    }
}

function chiudiSimulazione() {
    document.getElementById('epk-simulation-banner').classList.add('epk-hidden');
    simulatedScabOpzioneId = null;
    
    // Ritorna alla vista atleta di default o amministratore
    const switcher = document.getElementById('epk-admin-switcher');
    switcher.value = isEpikaAdmin ? 'admin' : 'athlete';
    switchEpikaView(switcher.value);
}

// Caricamento dati dalle tabelle lookup
async function caricaLookupDati() {
    try {
        // Carica Gruppi Storici
        const { data: gruppi, error: gError } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('*')
            .eq('attivo', true);

        if (gError) {
            throw gError;
        }

        gruppiStorici = gruppi || [];
        
        const selectGruppo = document.getElementById('fa-gruppo-storico');
        if (selectGruppo) {
            selectGruppo.innerHTML = '<option value="" disabled selected>SELEZIONA</option>';
            gruppiStorici.forEach(g => {
                selectGruppo.innerHTML += `<option value="${g.id}">${g.nome}</option>`;
            });
        }

        // Carica Allenatori
        const { data: allenatori, error: aError } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .eq('tipo', 'allenatore')
            .eq('attivo', true);

        if (aError) {
            throw aError;
        }

        allenatoriLista = allenatori || [];

        const selectAllenatore = document.getElementById('fa-allenatore');
        if (selectAllenatore) {
            selectAllenatore.innerHTML = '<option value="" disabled selected>SELEZIONA</option>';
            allenatoriLista.forEach(a => {
                selectAllenatore.innerHTML += `<option value="${a.id}">${a.valore}</option>`;
            });
        }

        // Carica Popoli
        const { data: popoli, error: pError } = await supabaseClient
            .from('epika_popoli')
            .select('*')
            .eq('attivo', true)
            .order('nome', { ascending: true });

        if (pError) {
            throw pError;
        }

        popoliList = popoli || [];

        const selectPopolo = document.getElementById('fa-popolo');
        if (selectPopolo) {
            selectPopolo.innerHTML = '<option value="" disabled selected>SELEZIONA</option>';
            popoliList.forEach(p => {
                selectPopolo.innerHTML += `<option value="${p.nome}">${p.nome}</option>`;
            });
        }

        const selectNewGruppoPopolo = document.getElementById('new-gruppo-popolo');
        if (selectNewGruppoPopolo) {
            selectNewGruppoPopolo.innerHTML = '<option value="" disabled selected>SELEZIONA POPOLO...</option>';
            popoliList.forEach(p => {
                selectNewGruppoPopolo.innerHTML += `<option value="${p.nome}">${p.nome}</option>`;
            });
        }

        // Carica Tesserati Completati
        const { data: profili, error: profError } = await supabaseClient
            .from('epika_profili')
            .select('*')
            .eq('profilo_completato', true)
            .order('nome_di_battaglia', { ascending: true });

        if (profError) {
            throw profError;
        }
        tesseratiCache = profili || [];

        // Popola select del form creazione gruppi storici
        popolaSelectTesserati('new-gruppo-capo', false);
        popolaSelectTesserati('new-gruppo-vice', true);
        popolaSelectTesserati('new-gruppo-resp', true);

    } catch (err) {
        console.error("Errore caricamento dati lookup:", err);
        alert("Errore durante il recupero dei dati del tempio. Riprova più tardi.");
    }
}

// Popola un select element con i tesserati della cache
function popolaSelectTesserati(selectId, includeNone) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = includeNone 
        ? '<option value="" selected>NESSUNO</option>'
        : '<option value="" disabled selected>SELEZIONA...</option>';
        
    tesseratiCache.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.nome_di_battaglia || 'Senza Nome'}</option>`;
    });
}

// Logica di auto-popolamento cultura in base al gruppo scelto
function onGruppoStoricoChange() {
    const selectGruppo = document.getElementById('fa-gruppo-storico');
    const selectPopolo = document.getElementById('fa-popolo');
    const gruppoId = parseInt(selectGruppo.value);
    const gruppoScelto = gruppiStorici.find(g => g.id === gruppoId);

    if (gruppoScelto) {
        if (gruppoScelto.popolo) {
            // Gruppo con popolo predefinito
            selectPopolo.value = gruppoScelto.popolo;
            selectPopolo.disabled = true;
        } else {
            // Mercenari (popolo nullo nel seed): sblocca selezione
            selectPopolo.value = "";
            selectPopolo.disabled = false;
        }
    }
}

// Invio del modulo di primo accesso
async function handleFirstAccessSubmit(e) {
    e.preventDefault();
    
    const nomeBattaglia = document.getElementById('fa-nome-battaglia').value.trim().toUpperCase();
    const ruoloCombattimento = document.getElementById('fa-ruolo-combattimento').value;
    const primoAnno = parseInt(document.getElementById('fa-primo-anno').value);
    const gruppoStoricoId = parseInt(document.getElementById('fa-gruppo-storico').value);
    
    const selectPopolo = document.getElementById('fa-popolo');
    const popolo = selectPopolo.value;
    const allenatoreId = parseInt(document.getElementById('fa-allenatore').value);

    if (!nomeBattaglia || !ruoloCombattimento || !primoAnno || !gruppoStoricoId || !popolo || !allenatoreId) {
        alert("Compila tutti i campi obbligatori.");
        return;
    }

    try {
        const profilePayload = {
            id: currentUser.id,
            nome_di_battaglia: nomeBattaglia,
            ruolo_combattimento: ruoloCombattimento,
            primo_anno_partecipazione: primoAnno,
            gruppo_storico_id: gruppoStoricoId,
            popolo: popolo,
            allenatore_id: allenatoreId,
            profilo_completato: true
        };

        const { error } = await supabaseClient
            .from('epika_profili')
            .upsert(profilePayload);

        if (error) throw error;

        alert("Profilo storico creato con successo! Benvenuto in EPIKA.");
        document.getElementById('epk-first-access').classList.add('epk-hidden');
        document.getElementById('epk-user-battle-name').textContent = `~ ${nomeBattaglia} ~`;
        
        currentUserProfile = profilePayload;
        
        const viewMode = document.getElementById('epk-admin-switcher').value || 'athlete';
        if (viewMode === 'admin') {
            document.getElementById('epk-admin').classList.remove('epk-hidden');
            await renderAdminDashboard();
        } else {
            document.getElementById('epk-main').classList.remove('epk-hidden');
            await renderAthleteDashboard();
        }

    } catch (err) {
        console.error("Errore salvataggio profilo epika:", err);
        alert("Impossibile salvare il profilo storico. Riprova o contatta l'amministrazione.");
    }
}

// ===========================================================================
// FUNZIONI DI MODIFICA PROFILO & REGISTRO (AUDIT)
// ===========================================================================

let originalProfileData = {};

async function apriModaleModificaProfilo() {
    try {
        const { data: prof, error } = await supabaseClient
            .from('epika_profili')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error || !prof) {
            console.error("Errore caricamento profilo per modifica:", error);
            alert("Impossibile caricare i dati del profilo.");
            return;
        }

        originalProfileData = {
            gruppo_storico_id: prof.gruppo_storico_id,
            popolo: prof.popolo,
            ruolo_combattimento: prof.ruolo_combattimento,
            allenatore_id: prof.allenatore_id
        };

        const selectGruppo = document.getElementById('edit-gruppo-storico');
        selectGruppo.innerHTML = '';
        gruppiStorici.forEach(g => {
            selectGruppo.innerHTML += `<option value="${g.id}">${g.nome}</option>`;
        });
        selectGruppo.value = prof.gruppo_storico_id || '';

        const selectPopolo = document.getElementById('edit-popolo');
        selectPopolo.innerHTML = '';
        popoliList.forEach(p => {
            selectPopolo.innerHTML += `<option value="${p.nome}">${p.nome}</option>`;
        });
        selectPopolo.value = prof.popolo || '';

        document.getElementById('edit-ruolo-combattimento').value = prof.ruolo_combattimento || 'combattente';

        const selectAllenatore = document.getElementById('edit-allenatore');
        selectAllenatore.innerHTML = '';
        allenatoriLista.forEach(a => {
            selectAllenatore.innerHTML += `<option value="${a.id}">${a.valore}</option>`;
        });
        selectAllenatore.value = prof.allenatore_id || '';

        onEditGruppoStoricoChange();

        document.getElementById('epk-edit-profile-modal').classList.remove('epk-hidden');
    } catch (err) {
        console.error("Errore apriModaleModificaProfilo:", err);
    }
}

function chiudiModaleModificaProfilo() {
    document.getElementById('epk-edit-profile-modal').classList.add('epk-hidden');
}

function onEditGruppoStoricoChange() {
    const selectGruppo = document.getElementById('edit-gruppo-storico');
    const selectPopolo = document.getElementById('edit-popolo');
    const gruppoId = parseInt(selectGruppo.value);
    const gruppoScelto = gruppiStorici.find(g => g.id === gruppoId);

    if (gruppoScelto) {
        if (gruppoScelto.popolo) {
            selectPopolo.value = gruppoScelto.popolo;
            selectPopolo.disabled = true;
        } else {
            selectPopolo.disabled = false;
        }
    }
}

async function salvaModificheProfilo() {
    const gruppoStoricoId = parseInt(document.getElementById('edit-gruppo-storico').value);
    const selectPopolo = document.getElementById('edit-popolo');
    const popolo = selectPopolo.value;
    const ruoloCombattimento = document.getElementById('edit-ruolo-combattimento').value;
    const allenatoreId = parseInt(document.getElementById('edit-allenatore').value);

    if (
        gruppoStoricoId === originalProfileData.gruppo_storico_id &&
        popolo === originalProfileData.popolo &&
        ruoloCombattimento === originalProfileData.ruolo_combattimento &&
        allenatoreId === originalProfileData.allenatore_id
    ) {
        chiudiModaleModificaProfilo();
        return;
    }

    const saveBtn = document.getElementById('edit-profile-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'SALVATAGGIO...';

    try {
        const { error } = await supabaseClient
            .from('epika_profili')
            .update({
                gruppo_storico_id: gruppoStoricoId,
                popolo: popolo,
                ruolo_combattimento: ruoloCombattimento,
                allenatore_id: allenatoreId
            })
            .eq('id', currentUser.id);

        if (error) throw error;

        alert("Profilo aggiornato con successo!");
        chiudiModaleModificaProfilo();
        await renderAthleteDashboard();
    } catch (err) {
        console.error("Errore durante il salvataggio del profilo:", err);
        alert("Errore durante il salvataggio. Riprova più tardi.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SALVA MODIFICHE';
    }
}

async function apriModaleRegistroModifiche() {
    try {
        const tbody = document.getElementById('epk-registro-tbody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 16px;">Caricamento in corso...</td></tr>';

        document.getElementById('epk-modifiche-registro-modal').classList.remove('epk-hidden');

        const { data: logs, error } = await supabaseClient
            .from('epika_registro_modifiche_profilo')
            .select('*')
            .eq('profilo_id', currentUser.id)
            .order('data_modifica', { ascending: false });

        if (error) {
            console.error("Errore caricamento registro modifiche:", error);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 16px; color: red;">Errore durante il caricamento.</td></tr>';
            return;
        }

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 16px; color: gray;">Nessuna modifica registrata.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        logs.forEach(log => {
            const dataStr = new Date(log.data_modifica).toLocaleString('it-IT');
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 8px 4px; color: white;">${dataStr}</td>
                    <td style="padding: 8px 4px; color: var(--epk-gold); font-weight: bold;">${log.campo}</td>
                    <td style="padding: 8px 4px; color: rgba(255,255,255,0.6);">${log.valore_precedente}</td>
                    <td style="padding: 8px 4px; color: white; font-weight: bold;">${log.valore_nuovo}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Errore apriModaleRegistroModifiche:", err);
    }
}

function chiudiModaleRegistroModifiche() {
    document.getElementById('epk-modifiche-registro-modal').classList.add('epk-hidden');
}

// ===========================================================================
// FASE 4 — LOGICA DASHBOARD ATLETA
// ===========================================================================

async function renderAthleteDashboard() {
    try {
        const { data: prof, error: profError } = await supabaseClient
            .from('epika_profili')
            .select(`
                *,
                gruppo_storico:gruppo_storico_id(nome),
                allenatore:allenatore_id(valore)
            `)
            .eq('id', currentUser.id)
            .maybeSingle();

        if (profError || !prof) {
            console.error("Errore recupero info estese profilo:", profError);
            return;
        }

        const { data: userData } = await supabaseClient.from('utenti').select('nome, cognome').eq('id', currentUser.id).maybeSingle();
        document.getElementById('epk-prof-real-name').textContent = userData ? `${userData.nome} ${userData.cognome}` : '-';
        document.getElementById('epk-prof-battle-name').textContent = prof.nome_di_battaglia;
        document.getElementById('epk-prof-gruppo').textContent = prof.gruppo_storico ? prof.gruppo_storico.nome : '-';
        document.getElementById('epk-prof-popolo').textContent = prof.popolo;
        document.getElementById('epk-prof-ruolo').textContent = prof.ruolo_combattimento.replace('_', ' ');
        document.getElementById('epk-prof-allenatore').textContent = prof.allenatore ? prof.allenatore.valore : '-';

        // Carica nomi dei gruppi di lavoro
        const { data: gruppiL } = await supabaseClient.from('epika_gruppi_lavoro').select('id, nome');
        const gruppiLMap = {};
        (gruppiL || []).forEach(g => { gruppiLMap[g.id] = g.nome; });
        const workGroups = (prof.gruppo_lavoro_ids || [])
            .map(id => gruppiLMap[id])
            .filter(Boolean)
            .join(', ');
        document.getElementById('epk-prof-lavoro').textContent = workGroups.toUpperCase() || 'NESSUN INCARICO';

        const currentYear = new Date().getFullYear();
        const anniServizio = currentYear - prof.primo_anno_partecipazione + 1;
        document.getElementById('epk-stat-anni-servizio').textContent = `${anniServizio} ${anniServizio === 1 ? 'Anno' : 'Anni'} (${prof.primo_anno_partecipazione} - ${currentYear})`;

        await caricaStatistiche();
        await caricaEventiDisponibili();

    } catch (err) {
        console.error("Errore rendering dashboard atleta:", err);
    }
}

async function caricaStatistiche() {
    try {
        const { count: campiCount, error: campiError } = await supabaseClient
            .from('epika_presenze_eventi')
            .select('id, evento:epika_eventi(tipo_evento)', { count: 'exact', head: true })
            .eq('utente_id', currentUser.id)
            .eq('presente', true)
            .eq('epika_eventi.tipo_evento', 'campo_marzio');

        if (!campiError) {
            document.getElementById('epk-stat-campi').textContent = campiCount || 0;
        }

        const { count: torneiCount, error: torneiError } = await supabaseClient
            .from('epika_presenze_eventi')
            .select('id, evento:epika_eventi(tipo_evento)', { count: 'exact', head: true })
            .eq('utente_id', currentUser.id)
            .eq('presente', true)
            .eq('epika_eventi.tipo_evento', 'torneo');

        if (!torneiError) {
            document.getElementById('epk-stat-tornei').textContent = torneiCount || 0;
        }

    } catch (e) {
        console.error("Errore calcolo statistiche:", e);
    }
}

async function caricaEventiDisponibili() {
    const listContainer = document.getElementById('epk-eventi-lista');
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: eventi, error: eError } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .eq('attivo', true)
            .gte('data_fine', todayStr)
            .order('data_inizio', { ascending: true });

        if (eError) throw eError;

        if (!eventi || eventi.length === 0) {
            listContainer.innerHTML = `
                <p style="font-size: 12px; color: rgba(245, 230, 200, 0.4); text-transform: uppercase; text-align: center; padding: 20px 0;">
                    Nessun evento storico in programma al tempio.
                </p>`;
            return;
        }

        const { data: iscrizioni } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .select('evento_id')
            .eq('utente_id', currentUser.id);

        const iscrizioniSet = new Set((iscrizioni || []).map(i => i.evento_id));

        listContainer.innerHTML = '';
        eventi.forEach(evt => {
            const isIscritto = iscrizioniSet.has(evt.id);
            const dataInizioF = formattaData(evt.data_inizio);
            const dataFineF = formattaData(evt.data_fine);
            const dataFormattata = dataInizioF === dataFineF ? dataInizioF : `DAL ${dataInizioF} AL ${dataFineF}`;
            
            const btnHtml = isIscritto 
                ? `<button class="epk-btn-secondary" style="border-color: var(--epk-gold); color: var(--epk-gold); cursor: default;" disabled>ISCRITTO ✓</button>`
                : `<button class="epk-btn" onclick="apriModaleIscrizione('${evt.id}', '${evt.data_inizio}', '${evt.data_fine}')">ISCRIVITI</button>`;

            listContainer.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(201, 168, 76, 0.2); padding: 16px; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 16px; margin: 0;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="epk-headline" style="font-size: 14px; display: block; color: var(--epk-gold);">${evt.titolo.toUpperCase()}</span>
                        <span style="font-size: 10px; font-family: monospace; color: rgba(245, 230, 200, 0.6); uppercase">
                            📅 ${dataFormattata} | 📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'NON SPECIFICATO'}
                        </span>
                        ${evt.descrizione ? `<p style="font-size: 11px; margin: 6px 0 0 0; color: rgba(245, 230, 200, 0.8);">${evt.descrizione}</p>` : ''}
                    </div>
                    <div style="shrink-0;">
                        ${btnHtml}
                    </div>
                </div>`;
        });

    } catch (err) {
        console.error("Errore caricamento eventi:", err);
        listContainer.innerHTML = `<p style="font-size: 12px; color: #ff0000; text-align: center;">Errore durante la ricerca degli eventi.</p>`;
    }
}

async function apriModaleIscrizione(eventoId, dataInizio, dataFine) {
    try {
        document.getElementById('epk-iscrizione-modal-evento-id').value = eventoId;
        
        // Genera i giorni di presenza
        const giorniContainer = document.getElementById('epk-iscrizione-modal-giorni');
        giorniContainer.innerHTML = '';
        
        const inizioDate = new Date(dataInizio);
        const fineDate = new Date(dataFine);
        const dateArray = [];
        let currentDate = new Date(inizioDate);
        while (currentDate <= fineDate) {
            dateArray.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        dateArray.forEach(d => {
            const dateStr = d.toISOString().split('T')[0];
            const dataFormattata = formattaData(dateStr);
            giorniContainer.innerHTML += `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; text-transform: uppercase; cursor: pointer;">
                    <input type="checkbox" name="giorni-presenza-check" value="${dateStr}" checked style="cursor: pointer;"> ${dataFormattata}
                </label>
            `;
        });

        // Carica la lista allenatori
        const coachSelect = document.getElementById('epk-iscrizione-coach');
        coachSelect.innerHTML = '<option value="">SELEZIONA ALLENATORE...</option>';
        const { data: allenatori, error: coachError } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .eq('tipo', 'allenatore')
            .eq('attivo', true)
            .order('valore', { ascending: true });

        if (!coachError && allenatori) {
            allenatori.forEach(c => {
                coachSelect.innerHTML += `<option value="${c.id}">${c.valore.toUpperCase()}</option>`;
            });
        }

        // Mostra campi combattente se applicabile
        const isCombattente = currentUserProfile && currentUserProfile.ruolo_combattimento === 'combattente';
        const combattenteFields = document.getElementById('epk-iscrizione-modal-combattente-fields');
        
        if (isCombattente) {
            combattenteFields.classList.remove('epk-hidden');
            if (currentUserProfile.allenatore_id) {
                coachSelect.value = currentUserProfile.allenatore_id;
            }
        } else {
            combattenteFields.classList.add('epk-hidden');
        }

        // Resetta campi armi speciali
        document.getElementById('epk-wp-giavellotto').checked = false;
        document.getElementById('epk-wp-spada-lunga').checked = false;
        document.getElementById('epk-wp-lancia').checked = false;
        document.getElementById('epk-wp-sperimentali').checked = false;
        document.getElementById('epk-iscrizione-armatura').value = 'nessuna';
        document.getElementById('epk-iscrizione-arciere').value = 'nessuno';
        document.getElementById('epk-iscrizione-sperimentali-desc').value = '';
        document.getElementById('epk-iscrizione-modal-sperimentali-desc-container').classList.add('epk-hidden');

        document.getElementById('epk-iscrizione-modal').classList.remove('epk-hidden');
    } catch (e) {
        console.error("Errore apertura modale iscrizione:", e);
    }
}

function chiudiModaleIscrizione() {
    document.getElementById('epk-iscrizione-modal').classList.add('epk-hidden');
}

function toggleArmiSperimentaliDesc(checked) {
    const descContainer = document.getElementById('epk-iscrizione-modal-sperimentali-desc-container');
    if (checked) {
        descContainer.classList.remove('epk-hidden');
    } else {
        descContainer.classList.add('epk-hidden');
    }
}

async function salvaIscrizioneDettagliata() {
    const eventoId = document.getElementById('epk-iscrizione-modal-evento-id').value;
    const checkedGiorni = Array.from(document.querySelectorAll('input[name="giorni-presenza-check"]:checked')).map(cb => cb.value);
    
    if (checkedGiorni.length === 0) {
        alert("Devi selezionare almeno un giorno di presenza.");
        return;
    }

    const isCombattente = currentUserProfile && currentUserProfile.ruolo_combattimento === 'combattente';
    let coachId = null;
    let armatura = 'nessuna';
    let arciere = 'nessuno';
    let armiSpeciali = [];
    let descSperimentali = null;

    if (isCombattente) {
        coachId = document.getElementById('epk-iscrizione-coach').value;
        if (!coachId) {
            alert("Seleziona l'allenatore che ti ha abilitato.");
            return;
        }
        coachId = parseInt(coachId);
        armatura = document.getElementById('epk-iscrizione-armatura').value;
        arciere = document.getElementById('epk-iscrizione-arciere').value;
        
        if (document.getElementById('epk-wp-giavellotto').checked) armiSpeciali.push('giavellotto');
        if (document.getElementById('epk-wp-spada-lunga').checked) armiSpeciali.push('spada_lunga');
        if (document.getElementById('epk-wp-lancia').checked) armiSpeciali.push('lancia');
        if (document.getElementById('epk-wp-sperimentali').checked) {
            armiSpeciali.push('armi_sperimentali');
            descSperimentali = document.getElementById('epk-iscrizione-sperimentali-desc').value.trim();
            if (!descSperimentali) {
                alert("Fornisci una descrizione per l'arma sperimentale.");
                return;
            }
        }
    }

    const dettagliPayload = {
        allenatore_id: coachId,
        armatura: armatura,
        arciere: arciere,
        armi_speciali: armiSpeciali,
        descrizione_sperimentali: descSperimentali
    };

    try {
        const { error } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .insert({
                evento_id: eventoId,
                utente_id: currentUser.id,
                giorni_presenza: checkedGiorni,
                dettagli: dettagliPayload
            });

        if (error) {
            if (error.code === '23505') {
                alert("Sei già iscritto a questo evento!");
            } else {
                throw error;
            }
        } else {
            alert("Iscrizione registrata con successo!");
            chiudiModaleIscrizione();
            await caricaEventiDisponibili();
        }
    } catch (e) {
        console.error("Errore salvataggio iscrizione:", e);
        alert("Errore durante il salvataggio dell'iscrizione. Riprova.");
    }
}

function formattaData(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// ===========================================================================
// FASE 5 — LOGICA DI AMMINISTRAZIONE DEL PRESIDENTE
// ===========================================================================

let activeAdminTab = 'dash';

function isReadOnly() {
    const viewMode = document.getElementById('epk-admin-switcher').value || 'athlete';
    return viewMode.startsWith('direttivo_');
}

function configureAdminTabs() {
    const viewMode = document.getElementById('epk-admin-switcher').value || 'athlete';
    
    const allBtns = {
        dash: document.getElementById('epk-adm-btn-dash'),
        direttivi: document.getElementById('epk-adm-btn-direttivi'),
        scab: document.getElementById('epk-adm-btn-scab'),
        gruppi: document.getElementById('epk-adm-btn-gruppi'),
        popoli: document.getElementById('epk-adm-btn-popoli'),
        eventi: document.getElementById('epk-adm-btn-eventi'),
        generale: document.getElementById('epk-adm-btn-generale'),
        logistica: document.getElementById('epk-adm-btn-logistica'),
        marketing: document.getElementById('epk-adm-btn-marketing')
    };

    // Nascondi tutto inizialmente
    Object.values(allBtns).forEach(btn => { if (btn) btn.classList.add('epk-hidden'); });

    // Definisci quali tab sono visibili in base alla vista
    let visibleTabs = [];
    if (viewMode === 'admin') {
        visibleTabs = ['dash', 'direttivi', 'scab', 'gruppi', 'popoli', 'eventi', 'generale'];
    } else if (viewMode === 'direttivo_epika') {
        visibleTabs = ['dash', 'direttivi', 'scab', 'gruppi', 'popoli', 'eventi', 'generale'];
    } else if (viewMode === 'direttivo_scab') {
        visibleTabs = ['scab', 'eventi'];
    } else if (viewMode === 'direttivo_logistica') {
        visibleTabs = ['eventi', 'logistica'];
    } else if (viewMode === 'direttivo_marketing') {
        visibleTabs = ['eventi', 'marketing'];
    }

    // Mostra i bottoni visibili
    visibleTabs.forEach(tab => {
        if (allBtns[tab]) allBtns[tab].classList.remove('epk-hidden');
    });

    // Se il tab attivo non è tra quelli visibili, seleziona il primo visibile
    if (!visibleTabs.includes(activeAdminTab) && visibleTabs.length > 0) {
        activeAdminTab = visibleTabs[0];
    }
}

async function renderAdminDashboard() {
    try {
        // Carica dati lookup (gruppi storici, popoli, allenatori) in cache globale
        await caricaLookupDati();

        // Carica la lista dei gruppi di lavoro per il selettore nomine
        const { data: gruppiL, error: glError } = await supabaseClient
            .from('epika_gruppi_lavoro')
            .select('*')
            .eq('attivo', true)
            .order('ordine', { ascending: true });

        if (!glError) {
            gruppiLavoro = gruppiL || [];
        }

        // Configura visibilità tab
        configureAdminTabs();

        // Carica il tab attivo
        switchAdminTab(activeAdminTab);

    } catch (err) {
        console.error("Errore renderAdminDashboard:", err);
    }
}

function switchAdminTab(tab) {
    activeAdminTab = tab;
    
    // Rimuove classe active da tutti i bottoni e nasconde tutti i pannelli dell'admin
    document.querySelectorAll('#epk-admin .epk-sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#epk-admin .epk-admin-tab-panel').forEach(panel => panel.classList.add('epk-hidden'));
    
    // Attiva bottone e mostra pannello corrispondente
    const btn = document.getElementById(`epk-adm-btn-${tab}`);
    if (btn) btn.classList.add('active');
    
    const panel = document.getElementById(`epk-adm-tab-${tab}`);
    if (panel) panel.classList.remove('epk-hidden');
    
    // Caricamento dei dati on-demand per ottimizzare le query
    if (tab === 'dash') {
        renderOrganigrammaMermaid();
    } else if (tab === 'direttivi') {
        renderTesseratiNomineInverso();
    } else if (tab === 'scab') {
        renderSCABTab();
    } else if (tab === 'gruppi') {
        renderGruppiStoriciAdmin();
    } else if (tab === 'popoli') {
        renderPopoliAdmin();
    } else if (tab === 'eventi') {
        renderEventiAdmin();
    } else if (tab === 'generale') {
        renderListaGeneraleAdmin();
    }
}

// STUBS PER LE PROSSIME FASI (Evitano crash a runtime)
// B — Gestione Nomine Gruppi di Lavoro e Admin (STRUTTURA INVERSA)
async function renderTesseratiNomineInverso() {
    const container = document.getElementById('adm-direttivi-quadri-list');
    if (!container) return;
    
    container.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray; grid-column: span 2;">Caricamento quadri in corso...</p>';
    
    try {
        // 1. Carica tutti i profili completati
        const { data: profili, error: profError } = await supabaseClient
            .from('epika_profili')
            .select('*')
            .eq('profilo_completato', true)
            .order('nome_di_battaglia', { ascending: true });

        if (profError) throw profError;
        tesseratiCache = profili || [];

        // 2. Carica anagrafica utenti reali
        const uids = tesseratiCache.map(p => p.id);
        let utentiMappa = {};
        if (uids.length > 0) {
            const { data: utentiD } = await supabaseClient
                .from('utenti')
                .select('id, nome, cognome')
                .in('id', uids);
            (utentiD || []).forEach(u => {
                utentiMappa[u.id] = `${u.nome} ${u.cognome}`;
            });
        }

        // Attacca il nome reale ai record per abilitare la ricerca
        tesseratiCache.forEach(t => {
            t.nome_reale = utentiMappa[t.id] || 'N/D';
        });

        // Raggruppa i profili per gruppo_lavoro_ids (solo per quelli manuali)
        const membriPerGruppo = {};
        tesseratiCache.forEach(p => {
            const gids = p.gruppo_lavoro_ids || [];
            if (gids.length === 0) {
                if (!membriPerGruppo[0]) membriPerGruppo[0] = [];
                membriPerGruppo[0].push(p);
            } else {
                gids.forEach(gid => {
                    if (!membriPerGruppo[gid]) membriPerGruppo[gid] = [];
                    membriPerGruppo[gid].push(p);
                });
            }
        });

        container.innerHTML = '';

        // Genera i quadri per ciascun gruppo di lavoro attivo
        gruppiLavoro.forEach(g => {
            let membri = [];
            let isAutoCompiled = false;
            
            if (g.id === 5) {
                // Capi Gruppo (auto-compilato)
                isAutoCompiled = true;
                gruppiStorici.forEach(grp => {
                    if (grp.capogruppo_id) {
                        const m = tesseratiCache.find(t => t.id === grp.capogruppo_id);
                        if (m) {
                            membri.push({
                                ...m,
                                gruppoRepresentedName: grp.nome
                            });
                        }
                    }
                });
            } else if (g.nome === 'Gruppo Vice Capi Gruppo') {
                // Vice Capi Gruppo (auto-compilato)
                isAutoCompiled = true;
                gruppiStorici.forEach(grp => {
                    if (grp.vice_capogruppo_id) {
                        const m = tesseratiCache.find(t => t.id === grp.vice_capogruppo_id);
                        if (m) {
                            membri.push({
                                ...m,
                                gruppoRepresentedName: grp.nome
                            });
                        }
                    }
                });
            } else if (g.id === 6) {
                // Responsabili Iscrizioni (auto-compilato)
                isAutoCompiled = true;
                gruppiStorici.forEach(grp => {
                    if (grp.responsabile_iscrizioni_id) {
                        const m = tesseratiCache.find(t => t.id === grp.responsabile_iscrizioni_id);
                        if (m) {
                            membri.push({
                                ...m,
                                gruppoRepresentedName: grp.nome
                            });
                        }
                    }
                });
            } else {
                // Standard manuale
                membri = membriPerGruppo[g.id] || [];
            }

            let membriHTML = '';
            
            if (membri.length === 0) {
                membriHTML = '<p style="font-size: 11px; color: rgba(245, 230, 200, 0.4); text-transform: uppercase; font-style: italic; margin: 10px 0;">Nessun componente nominato</p>';
            } else {
                membri.forEach(m => {
                    const nomeReale = utentiMappa[m.id] || 'N/D';
                    
                    let rappresentatoText = '';
                    if (isAutoCompiled && m.gruppoRepresentedName) {
                        rappresentatoText = ` <span style="font-size: 10px; color: var(--epk-gold); font-weight: bold; border: 1px solid var(--epk-gold-dim); padding: 1px 4px; margin-left: 6px; border-radius: 2px;">${m.gruppoRepresentedName}</span>`;
                    } else if ((g.id === 5 || g.id === 6) && m.rappresentante_gruppo_storico_id) {
                        // Legacy fallback
                        const grp = gruppiStorici.find(x => x.id === m.rappresentante_gruppo_storico_id);
                        if (grp) {
                            rappresentatoText = ` <span style="font-size: 10px; color: var(--epk-gold); font-weight: bold; border: 1px solid var(--epk-gold-dim); padding: 1px 4px; margin-left: 6px; border-radius: 2px;">${grp.nome}</span>`;
                        }
                    }

                    membriHTML += `
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(251,191,36,0.1); padding: 8px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px;">
                            <div>
                                <span class="epk-headline" style="font-size: 12px; color: var(--epk-gold);">${m.nome_di_battaglia}${rappresentatoText}</span>
                                <span style="font-size: 9px; display: block; color: rgba(245,230,200,0.5);">Real: ${nomeReale.toUpperCase()}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                ${g.id === 1 ? `
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <input type="checkbox" id="chk-adm-${g.id}-${m.id}" ${m.is_admin_epika ? 'checked' : ''} onchange="salvaStatoAdminInverso('${m.id}', this.checked)" style="cursor: pointer; transform: scale(0.9);" ${isReadOnly() ? 'disabled' : ''}>
                                    <label for="chk-adm-${g.id}-${m.id}" style="font-size: 8px; font-weight: bold; color: var(--epk-gold); cursor: pointer; text-transform: uppercase;">ADMIN</label>
                                </div>
                                ` : ''}
                                ${(!isAutoCompiled && !isReadOnly()) ? `
                                <button class="epk-btn-secondary" style="font-size: 8px; padding: 2px 6px; color: #ff4d4d; border-color: rgba(255,77,77,0.3);" onclick="rimuoviNominaLavoroInverso('${m.id}', ${g.id})">
                                    RIMUOVI
                                </button>
                                ` : ''}
                            </div>
                        </div>`;
                });
            }

            let actionButtonHTML = '';
            if (isAutoCompiled) {
                actionButtonHTML = `<div style="font-size: 9px; text-align: center; margin-top: 8px; color: #71717a; font-style: italic; border: 1px dashed rgba(255,255,255,0.05); padding: 6px;">Gestito tramite la scheda Gruppi Storici</div>`;
            } else if (!isReadOnly()) {
                actionButtonHTML = `<button class="epk-btn-secondary" style="font-size: 9px; width: 100%; text-align: center; margin-top: 8px; border-color: var(--epk-gold); color: var(--epk-gold);" onclick="apriModaleNomina(${g.id}, '${g.nome.replace(/'/g, "\\'")}')">
                    + AGGIUNGI COMPONENTE
                </button>`;
            }

            container.innerHTML += `
                <div class="epk-card" style="display: flex; flex-direction: column; gap: 12px;">
                    <h3 class="epk-headline" style="margin-top: 0; font-size: 14px; border-bottom: 1px solid var(--epk-gold-dim); padding-bottom: 6px; margin-bottom: 6px;">
                        ${g.nome.toUpperCase()}
                    </h3>
                    <div style="flex-grow: 1; max-h: 220px; overflow-y: auto; padding-right: 4px;">
                        ${membriHTML}
                    </div>
                    ${actionButtonHTML}
                </div>`;
        });

    } catch (err) {
        console.error("Errore renderTesseratiNomineInverso:", err);
        container.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: red;">Errore durante il caricamento delle nomine.</p>';
    }
}

// Logica per il Modale Centralizzato di Ricerca e Aggiunta
function apriModaleNomina(gruppoId, gruppoNome) {
    const modal = document.getElementById('adm-nomina-modal');
    if (!modal) return;
    
    document.getElementById('adm-nomina-modal-gruppo-id').value = gruppoId;
    document.getElementById('adm-nomina-modal-titolo').textContent = `AGGIUNGI MEMBRO A: ${gruppoNome.toUpperCase()}`;
    document.getElementById('adm-nomina-modal-search').value = '';
    
    modal.classList.remove('epk-hidden');
    filtraTesseratiNomina();
}

function chiudiModaleNomine() {
    const modal = document.getElementById('adm-nomina-modal');
    if (modal) modal.classList.add('epk-hidden');
}

function filtraTesseratiNomina() {
    const searchVal = document.getElementById('adm-nomina-modal-search').value.trim().toUpperCase();
    const gruppoId = parseInt(document.getElementById('adm-nomina-modal-gruppo-id').value);
    const resultsContainer = document.getElementById('adm-nomina-modal-results');
    
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';
    
    // Filtra i tesserati: non devono far parte del gruppo attivo e devono matchare il nome
    const filtered = tesseratiCache.filter(t => {
        const gids = t.gruppo_lavoro_ids || [];
        if (gids.includes(gruppoId)) return false;
        if (!searchVal) return true;
        
        const battleMatch = t.nome_di_battaglia && t.nome_di_battaglia.toUpperCase().includes(searchVal);
        const realMatch = t.nome_reale && t.nome_reale.toUpperCase().includes(searchVal);
        return battleMatch || realMatch;
    });
    
    if (filtered.length === 0) {
        resultsContainer.innerHTML = '<p style="font-size: 11px; text-align: center; color: rgba(245,230,200,0.5); text-transform: uppercase; padding: 12px;">Nessun tesserato trovato</p>';
        return;
    }
    
    filtered.forEach(t => {
        let representSelectHTML = '';
        if (gruppoId === 5 || gruppoId === 6) {
            const defaultGrpId = t.rappresentante_gruppo_storico_id || t.gruppo_storico_id || '';
            let options = '<option value="" disabled>SELEZIONA GRUPPO...</option>';
            gruppiStorici.forEach(g => {
                if (g.attivo) {
                    const selected = g.id == defaultGrpId ? 'selected' : '';
                    options += `<option value="${g.id}" ${selected}>${g.nome}</option>`;
                }
            });
            representSelectHTML = `
                <div style="margin-right: 12px;">
                    <select id="select-rep-${t.id}" class="epk-input" style="font-size: 10px; padding: 4px 8px; height: 26px; min-width: 150px; background: #150904; border-color: var(--epk-gold-dim); color: #fff;">
                        ${options}
                    </select>
                </div>
            `;
        }

        resultsContainer.innerHTML += `
            <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px; margin-bottom: 4px;">
                <div>
                    <span class="epk-headline" style="font-size: 12px; color: var(--epk-gold);">${t.nome_di_battaglia}</span>
                </div>
                <div style="display: flex; align-items: center;">
                    ${representSelectHTML}
                    <button class="epk-btn" style="font-size: 8px; padding: 6px 12px;" onclick="salvaNominaLavoroInverso('${t.id}', ${gruppoId})">
                        AGGIUNGI
                    </button>
                </div>
            </div>`;
    });
}

// Chiamate API Supabase per il salvataggio
async function salvaNominaLavoroInverso(utenteId, gruppoId) {
    try {
        const tesserato = tesseratiCache.find(t => t.id === utenteId);
        const currentGids = tesserato ? (tesserato.gruppo_lavoro_ids || []) : [];
        
        let updatePayload = {};
        if (!currentGids.includes(gruppoId)) {
            updatePayload.gruppo_lavoro_ids = [...currentGids, gruppoId];
        }

        // Se stiamo nominando a Capi Gruppo (5) o Responsabili Iscrizioni (6), leggiamo il gruppo rappresentato
        if (gruppoId === 5 || gruppoId === 6) {
            const selectRep = document.getElementById(`select-rep-${utenteId}`);
            if (selectRep) {
                const rappresentanteGruppoId = selectRep.value ? parseInt(selectRep.value) : null;
                if (!rappresentanteGruppoId) {
                    alert("Seleziona il gruppo storico rappresentato per questo ruolo.");
                    return;
                }
                updatePayload.rappresentante_gruppo_storico_id = rappresentanteGruppoId;
            }
        }

        if (Object.keys(updatePayload).length > 0) {
            const { error } = await supabaseClient
                .from('epika_profili')
                .update(updatePayload)
                .eq('id', utenteId);
            if (error) throw error;
        }
        
        chiudiModaleNomine();
        await renderTesseratiNomineInverso();
        await renderOrganigrammaMermaid();
    } catch (e) {
        console.error("Errore salvataggio nomina inverso:", e);
        alert("Impossibile salvare la nomina. Riprova.");
    }
}

async function rimuoviNominaLavoroInverso(utenteId, gruppoId) {
    try {
        const tesserato = tesseratiCache.find(t => t.id === utenteId);
        if (tesserato) {
            const currentGids = tesserato.gruppo_lavoro_ids || [];
            const newGids = currentGids.filter(id => id !== gruppoId);
            
            let updatePayload = { gruppo_lavoro_ids: newGids };
            
            // Logica Robusta: Azzera rappresentante_gruppo_storico_id solo se non ha più né il ruolo 5 né il ruolo 6
            if ((gruppoId === 5 || gruppoId === 6) && !newGids.includes(5) && !newGids.includes(6)) {
                updatePayload.rappresentante_gruppo_storico_id = null;
            }

            const { error } = await supabaseClient
                .from('epika_profili')
                .update(updatePayload)
                .eq('id', utenteId);
            if (error) throw error;
        }
        
        await renderTesseratiNomineInverso();
        await renderOrganigrammaMermaid();
    } catch (e) {
        console.error("Errore rimozione nomina inverso:", e);
        alert("Impossibile rimuovere il componente. Riprova.");
    }
}

async function salvaStatoAdminInverso(utenteId, isChecked) {
    try {
        const { error } = await supabaseClient
            .from('epika_profili')
            .update({ is_admin_epika: isChecked })
            .eq('id', utenteId);
            
        if (error) throw error;
    } catch (e) {
        console.error("Errore aggiornamento ruolo admin inverso:", e);
        alert("Errore durante l'aggiornamento dei privilegi amministratore.");
    }
}

async function renderSCABTab() {
    try {
        // 1. Carica strutture SCAB
        const { data: struttureD, error: strErr } = await supabaseClient
            .from('epika_scab_strutture')
            .select('*')
            .order('tipo', { ascending: false }) // Palestre prima dei centri
            .order('nome', { ascending: true });
            
        if (strErr) throw strErr;
        scabStrutture = struttureD || [];

        // 2. Carica soggetti SCAB per ruolo
        const { data: soggettiD, error: sogErr } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .in('tipo', ['scab_validatore', 'allenatore', 'scab_allievo_allenatore'])
            .eq('attivo', true)
            .order('valore', { ascending: true });
            
        if (sogErr) throw sogErr;
        const allSoggetti = soggettiD || [];
        soggettiValidatori = allSoggetti.filter(s => s.tipo === 'scab_validatore');
        soggettiAllenatori = allSoggetti.filter(s => s.tipo === 'allenatore');
        soggettiAllievi = allSoggetti.filter(s => s.tipo === 'scab_allievo_allenatore');

        // 3. Carica abbinamenti esistenti
        const { data: abbinamentiD, error: abbErr } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .select('*');
            
        if (abbErr) throw abbErr;
        const abbinamentiMap = {};
        (abbinamentiD || []).forEach(a => {
            abbinamentiMap[a.struttura_id] = a;
        });

        // 4. Renderizza Anagrafiche
        renderSCABAnagrafica();

        // 5. Renderizza Abbinamenti
        renderSCABAbbinamenti(abbinamentiMap);

        // 6. Renderizza Ruoli
        renderRuoliAdmin();

    } catch (e) {
        console.error("Errore renderSCABTab:", e);
    }
}

// Rendering Anagrafica Palestre e Centri
function renderSCABAnagrafica() {
    const palestreList = document.getElementById('scab-palestre-list');
    const centriList = document.getElementById('scab-centri-list');
    if (!palestreList || !centriList) return;

    palestreList.innerHTML = '';
    centriList.innerHTML = '';
    
    scabStrutture.forEach(s => {
        const badge = s.tipo === 'palestra' ? 'PAL' : 'CP';
        const activeText = s.attivo ? 'Dis' : 'Att';
        const activeStyle = s.attivo ? 'color: #f97316; border-color: rgba(249, 115, 22, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);';
        
        const html = `
            <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px;">
                <div>
                    <span style="font-size: 9px; font-weight: bold; padding: 2px 4px; background: rgba(201,168,76,0.2); border: 1px solid var(--epk-gold); border-radius: 2px; margin-right: 6px;">${badge}</span>
                    <span style="font-size: 13px; font-weight: bold; ${s.attivo ? '' : 'text-decoration: line-through; opacity: 0.5;'}">${s.nome.toUpperCase()}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px 8px; ${activeStyle}" onclick="toggleStatoStrutturaSCAB('${s.id}', ${s.attivo})">
                        ${activeText}
                    </button>
                    <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px 8px; color: #ef4444; border-color: rgba(239, 68, 68, 0.4);" onclick="cancellaStrutturaSCAB('${s.id}')">
                        Canc
                    </button>
                </div>
            </div>`;
            
        if (s.tipo === 'palestra') {
            palestreList.innerHTML += html;
        } else {
            centriList.innerHTML += html;
        }
    });
}

// Rendering Abbinamenti SCAB (Step 4.2)
function renderSCABAbbinamenti(abbinamentiMap) {
    const palestreBody = document.getElementById('scab-palestre-table-body');
    const centriBody = document.getElementById('scab-centri-table-body');
    if (!palestreBody || !centriBody) return;

    palestreBody.innerHTML = '';
    centriBody.innerHTML = '';

    scabStrutture.forEach(s => {
        if (!s.attivo) return;

        const abb = abbinamentiMap[s.id] || {
            allenatore_ref_id: null,
            validatore_id: null,
            allenatori_co_ids: [],
            allievo_ref_id: null,
            allievi_ids: []
        };
        
        // Inizializza lo stato in memoria per questa struttura, scartando gli orfani
        abbinamentiState[s.id] = {
            allenatori_co_ids: (abb.allenatori_co_ids || []).filter(id => soggettiAllenatori.some(x => x.id === id)),
            allievi_ids: (abb.allievi_ids || []).filter(id => soggettiAllievi.some(x => x.id === id))
        };

        const isDisabledAttr = isReadOnly() ? 'disabled' : '';
        const actionBtnPalHtml = isReadOnly() ? '-' : `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <button class="epk-btn" style="font-size: 8px; padding: 6px; width: 100%; border-radius: 2px;" onclick="salvaAbbinamentoSCAB(${s.id}, 'palestra')">SALVA</button>
                <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px; width: 100%; border-radius: 2px; color: #ff4d4d; border-color: rgba(255,77,77,0.3);" onclick="pulisciAbbinamentoSCAB(${s.id})">PULISCI</button>
            </div>`;
        const actionBtnCentroHtml = isReadOnly() ? '-' : `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <button class="epk-btn" style="font-size: 8px; padding: 6px; width: 100%; border-radius: 2px;" onclick="salvaAbbinamentoSCAB(${s.id}, 'centro_pratica')">SALVA</button>
                <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px; width: 100%; border-radius: 2px; color: #ff4d4d; border-color: rgba(255,77,77,0.3);" onclick="pulisciAbbinamentoSCAB(${s.id})">PULISCI</button>
            </div>`;
        const addBtnCoHtml = isReadOnly() ? '' : `<button class="epk-btn-secondary" style="font-size: 10px; padding: 2px 6px; margin-top: 4px;" onclick="mostraSelectAggiunta(${s.id}, 'co')">+</button>`;
        const addBtnAllHtml = isReadOnly() ? '' : `<button class="epk-btn-secondary" style="font-size: 10px; padding: 2px 6px; margin-top: 4px;" onclick="mostraSelectAggiunta(${s.id}, 'all')">+</button>`;

        if (s.tipo === 'palestra') {
            const refSelect = `<select id="select-pal-ref-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;" ${isDisabledAttr}>${generaOpzioniSoggetti(soggettiAllenatori, abb.allenatore_ref_id)}</select>`;
            const valSelect = `<select id="select-pal-val-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;" ${isDisabledAttr}>${generaOpzioniSoggetti(soggettiValidatori, abb.validatore_id)}</select>`;

            palestreBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 8px; font-weight: bold; color: var(--epk-gold);">${s.nome.toUpperCase()}</td>
                    <td style="padding: 8px;">${refSelect}</td>
                    <td style="padding: 8px;">${valSelect}</td>
                    <td style="padding: 8px;">
                        <div id="container-co-${s.id}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                        ${addBtnCoHtml}
                        <div id="add-co-${s.id}" class="epk-hidden" style="margin-top:4px;"></div>
                    </td>
                    <td style="padding: 8px;">
                        <div id="container-all-${s.id}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                        ${addBtnAllHtml}
                        <div id="add-all-${s.id}" class="epk-hidden" style="margin-top:4px;"></div>
                    </td>
                    <td style="padding: 8px;">
                        ${actionBtnPalHtml}
                    </td>
                </tr>`;
        } else {
            const allRefSelect = `<select id="select-cp-ref-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;" ${isDisabledAttr}>${generaOpzioniSoggetti(soggettiAllievi, abb.allievo_ref_id)}</select>`;
            const alnSelect = `<select id="select-cp-aln-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;" ${isDisabledAttr}>${generaOpzioniSoggetti(soggettiAllenatori, abb.allenatore_ref_id)}</select>`;

            centriBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 8px; font-weight: bold; color: var(--epk-gold);">${s.nome.toUpperCase()}</td>
                    <td style="padding: 8px;">${allRefSelect}</td>
                    <td style="padding: 8px;">${alnSelect}</td>
                    <td style="padding: 8px;">
                        <div id="container-all-${s.id}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                        ${addBtnAllHtml}
                        <div id="add-all-${s.id}" class="epk-hidden" style="margin-top:4px;"></div>
                    </td>
                    <td style="padding: 8px;">
                        ${actionBtnCentroHtml}
                    </td>
                </tr>`;
        }
    });

    // Dopo aver creato il DOM, renderizza i token iniziali
    scabStrutture.forEach(s => {
        if (!s.attivo) return;
        if (s.tipo === 'palestra') renderTokens(s.id, 'co');
        renderTokens(s.id, 'all');
    });
}

function generaOpzioniSoggetti(sorgente, selectedValue, excludeIds = []) {
    let html = '<option value="">-- NESSUNO --</option>';
    sorgente.forEach(s => {
        if (excludeIds.includes(s.id)) return;
        const sel = s.id === selectedValue ? 'selected' : '';
        html += `<option value="${s.id}" ${sel}>${s.valore.toUpperCase()}</option>`;
    });
    return html;
}

// Logiche UI State-Driven
function renderTokens(strutturaId, tipo) {
    const container = document.getElementById(`container-${tipo}-${strutturaId}`);
    if (!container) return;
    container.innerHTML = '';
    
    const ids = tipo === 'co' ? abbinamentiState[strutturaId].allenatori_co_ids : abbinamentiState[strutturaId].allievi_ids;
    const sorgente = tipo === 'co' ? soggettiAllenatori : soggettiAllievi;
    
    ids.forEach(id => {
        const sogg = sorgente.find(x => x.id === id);
        if (sogg) {
            const removeBtnHtml = isReadOnly() ? '' : `<span style="cursor: pointer; color: #ff4d4d; font-weight: bold;" onclick="rimuoviToken(${strutturaId}, '${tipo}', ${id})">&times;</span>`;
            container.innerHTML += `
                <div style="background: rgba(201,168,76,0.1); border: 1px solid var(--epk-gold); padding: 2px 6px; font-size: 10px; border-radius: 2px; display: flex; align-items: center; gap: 4px;">
                    ${sogg.valore.toUpperCase()}
                    ${removeBtnHtml}
                </div>`;
        }
    });
}

function mostraSelectAggiunta(strutturaId, tipo) {
    const addContainer = document.getElementById(`add-${tipo}-${strutturaId}`);
    if (!addContainer) return;
    
    const ids = tipo === 'co' ? abbinamentiState[strutturaId].allenatori_co_ids : abbinamentiState[strutturaId].allievi_ids;
    const sorgente = tipo === 'co' ? soggettiAllenatori : soggettiAllievi;
    
    const selectHtml = `
        <select class="epk-input" style="padding: 2px; font-size: 10px; width: 100%;" 
                onchange="aggiungiTokenDaSelect(${strutturaId}, '${tipo}', this.value)" 
                onblur="nascondiSelectAggiunta(${strutturaId}, '${tipo}')">
            ${generaOpzioniSoggetti(sorgente, null, ids)}
        </select>`;
        
    addContainer.innerHTML = selectHtml;
    addContainer.classList.remove('epk-hidden');
    
    setTimeout(() => {
        const select = addContainer.querySelector('select');
        if (select) select.focus();
    }, 50);
}

function nascondiSelectAggiunta(strutturaId, tipo) {
    const addContainer = document.getElementById(`add-${tipo}-${strutturaId}`);
    if (addContainer) {
        addContainer.innerHTML = '';
        addContainer.classList.add('epk-hidden');
    }
}

function aggiungiTokenDaSelect(strutturaId, tipo, stringId) {
    if (!stringId) {
        nascondiSelectAggiunta(strutturaId, tipo);
        return;
    }
    const id = parseInt(stringId);
    if (tipo === 'co') {
        abbinamentiState[strutturaId].allenatori_co_ids.push(id);
    } else {
        abbinamentiState[strutturaId].allievi_ids.push(id);
    }
    renderTokens(strutturaId, tipo);
    nascondiSelectAggiunta(strutturaId, tipo);
}

function rimuoviToken(strutturaId, tipo, idToRemove) {
    if (tipo === 'co') {
        abbinamentiState[strutturaId].allenatori_co_ids = abbinamentiState[strutturaId].allenatori_co_ids.filter(id => id !== idToRemove);
    } else {
        abbinamentiState[strutturaId].allievi_ids = abbinamentiState[strutturaId].allievi_ids.filter(id => id !== idToRemove);
    }
    renderTokens(strutturaId, tipo);
}

// Logiche di Salvataggio e Creazione (Step 4.3)
async function creaStrutturaSCAB() {
    const nomeInput = document.getElementById('scab-new-struttura-nome');
    const tipoSelect = document.getElementById('scab-new-struttura-tipo');
    const nome = nomeInput.value.trim();
    const tipo = tipoSelect.value;

    if (!nome) {
        alert("Inserisci un nome valido per la struttura.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_scab_strutture')
            .insert({ nome: nome, tipo: tipo });
            
        if (error) throw error;
        nomeInput.value = '';
        await renderSCABTab();
    } catch (e) {
        console.error(e);
        alert("Errore durante il salvataggio della struttura.");
    }
}

async function toggleStatoStrutturaSCAB(id, statoAttuale) {
    try {
        const { error } = await supabaseClient
            .from('epika_scab_strutture')
            .update({ attivo: !statoAttuale })
            .eq('id', id);
            
        if (error) throw error;
        await renderSCABTab();
    } catch (e) {
        console.error(e);
    }
}

async function salvaAbbinamentoSCAB(strutturaId, tipoStruttura) {
    try {
        let payload = {
            struttura_id: strutturaId,
            allenatore_ref_id: null,
            validatore_id: null,
            allenatori_co_ids: [],
            allievo_ref_id: null,
            allievi_ids: []
        };

        if (tipoStruttura === 'palestra') {
            const refVal = document.getElementById(`select-pal-ref-${strutturaId}`).value;
            const valVal = document.getElementById(`select-pal-val-${strutturaId}`).value;

            payload.allenatore_ref_id = refVal ? parseInt(refVal) : null;
            payload.validatore_id = valVal ? parseInt(valVal) : null;
            
            if (abbinamentiState[strutturaId]) {
                payload.allenatori_co_ids = [...abbinamentiState[strutturaId].allenatori_co_ids];
                payload.allievi_ids = [...abbinamentiState[strutturaId].allievi_ids];
            }
        } else {
            const allRefVal = document.getElementById(`select-cp-ref-${strutturaId}`).value;
            const alnVal = document.getElementById(`select-cp-aln-${strutturaId}`).value;

            payload.allievo_ref_id = allRefVal ? parseInt(allRefVal) : null;
            payload.allenatore_ref_id = alnVal ? parseInt(alnVal) : null;

            if (abbinamentiState[strutturaId]) {
                payload.allievi_ids = [...abbinamentiState[strutturaId].allievi_ids];
            }
        }

        const { error } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .upsert(payload, { onConflict: 'struttura_id' });

        if (error) throw error;
        alert("Abbinamento salvato con successo!");
        await renderSCABTab();

    } catch (e) {
        console.error(e);
        alert("Impossibile salvare l'abbinamento. Riprova.");
    }
}

async function pulisciAbbinamentoSCAB(strutturaId) {
    if (!confirm("Vuoi azzerare gli abbinamenti per questa struttura?")) return;
    try {
        const { error } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .delete()
            .eq('struttura_id', strutturaId);

        if (error) throw error;
        await renderSCABTab();
    } catch (e) {
        console.error(e);
        alert("Errore durante l'azzeramento.");
    }
}

// Stub di default per aggiungere riga abbinamento
function aggiungiRigaAbbinamento(tipo) {
    alert("Per aggiungere un abbinamento, inserisci prima la struttura nel tab 'Anagrafica SCAB'. Verrà mostrata automaticamente qui.");
    switchScabSubTab('anagrafica');
}

let activeScabSubTab = 'abbinamenti';
function switchScabSubTab(subTab) {
    activeScabSubTab = subTab;
    document.getElementById('scab-panel-abbinamenti').classList.add('epk-hidden');
    document.getElementById('scab-panel-anagrafica').classList.add('epk-hidden');
    document.getElementById('scab-panel-allenatori').classList.add('epk-hidden');
    
    document.getElementById('scab-tab-btn-abbinamenti').style.borderColor = 'transparent';
    document.getElementById('scab-tab-btn-abbinamenti').style.color = 'var(--epk-parchment)';
    document.getElementById('scab-tab-btn-palestre-centri').style.borderColor = 'transparent';
    document.getElementById('scab-tab-btn-palestre-centri').style.color = 'var(--epk-parchment)';
    document.getElementById('scab-tab-btn-ruoli').style.borderColor = 'transparent';
    document.getElementById('scab-tab-btn-ruoli').style.color = 'var(--epk-parchment)';

    let btnId = 'scab-tab-btn-abbinamenti';
    if (subTab === 'anagrafica') btnId = 'scab-tab-btn-palestre-centri';
    else if (subTab === 'allenatori') btnId = 'scab-tab-btn-ruoli';

    const btn = document.getElementById(btnId);
    if (btn) {
        btn.style.borderColor = 'var(--epk-gold)';
        btn.style.color = 'var(--epk-gold)';
    }

    const panel = document.getElementById(`scab-panel-${subTab}`);
    if (panel) {
        panel.classList.remove('epk-hidden');
    }
}


// Modifica variabili globali di binding
let currentBindingOpzioneId = null;
let currentBindingSoggettoNome = "";
let currentBindingTipo = "";

// A — Gestione Ruoli (CRUD con Binding Account)
async function renderRuoliAdmin() {
    try {
        const { data: soggetti, error } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .in('tipo', ['scab_validatore', 'allenatore', 'scab_allievo_allenatore'])
            .order('attivo', { ascending: false })
            .order('valore', { ascending: true });

        if (error) throw error;

        const valList = document.getElementById('adm-validatori-list');
        const allList = document.getElementById('adm-allenatori-list');
        const allieviList = document.getElementById('adm-allievi-list');
        if (valList) valList.innerHTML = '';
        if (allList) allList.innerHTML = '';
        if (allieviList) allieviList.innerHTML = '';

        (soggetti || []).forEach(s => {
            const activeText = s.attivo ? 'Dis' : 'Att';
            const activeStyle = s.attivo ? 'color: #f97316; border-color: rgba(249, 115, 22, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);';
            
            // Icona di binding a seconda se utente_id è presente
            const isBound = !!s.utente_id;
            const bindingIconColor = isBound ? '#22c55e' : '#888';
            const bindingTitle = isBound ? 'Account Reale Collegato (Clicca per modificare/scollegare)' : 'Nessun Account Collegato (Clicca per collegare)';
            
            const html = `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(251, 191, 36, 0.1); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 13px; font-weight: bold; ${s.attivo ? '' : 'text-decoration: line-through; opacity: 0.5;'}">${s.valore.toUpperCase()}</span>
                        <span style="cursor: pointer; color: ${bindingIconColor}; font-size: 14px;" title="${bindingTitle}" onclick="apriModaleBinding(${s.id}, '${s.valore.replace(/'/g, "\\'")}', '${s.tipo}', ${s.utente_id ? `'${s.utente_id}'` : 'null'})">
                            ${isBound ? '🔗' : '➕'}
                        </span>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px 8px; ${activeStyle}" onclick="toggleStatoSoggettoRuolo('${s.id}', ${s.attivo})">
                            ${activeText}
                        </button>
                        <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px 8px; color: #ef4444; border-color: rgba(239, 68, 68, 0.4);" onclick="cancellaSoggettoRuolo('${s.id}')">
                            Canc
                        </button>
                    </div>
                </div>`;
                
            if (s.tipo === 'scab_validatore' && valList) valList.innerHTML += html;
            else if (s.tipo === 'allenatore' && allList) allList.innerHTML += html;
            else if (s.tipo === 'scab_allievo_allenatore' && allieviList) allieviList.innerHTML += html;
        });

    } catch (err) {
        console.error("Errore caricamento ruoli admin:", err);
    }
}

// Gestione Modale Binding Account Reale
async function apriModaleBinding(opzioneId, nomeSoggetto, tipo, utenteIdCorrente) {
    currentBindingOpzioneId = opzioneId;
    currentBindingSoggettoNome = nomeSoggetto;
    currentBindingTipo = tipo;

    document.getElementById('binding-modal-title').textContent = `ASSOCIA ACCOUNT A ${nomeSoggetto.toUpperCase()}`;

    const select = document.getElementById('binding-utente-select');
    select.innerHTML = '<option value="" disabled selected>Caricamento utenti...</option>';

    document.getElementById('epk-modal-binding').classList.remove('epk-hidden');

    try {
        // Recupera tutti gli utenti reali
        const { data: utentiD, error } = await supabaseClient
            .from('utenti')
            .select('id, nome, cognome');

        if (error) throw error;

        // Recupera profili epika per vedere i nomi di battaglia
        const { data: profiliD } = await supabaseClient
            .from('epika_profili')
            .select('id, nome_di_battaglia');

        const profiliMap = {};
        (profiliD || []).forEach(p => {
            profiliMap[p.id] = p.nome_di_battaglia;
        });

        select.innerHTML = '<option value="">-- SELEZIONA UTENTE --</option>';
        (utentiD || []).forEach(u => {
            const nomeDiBattaglia = profiliMap[u.id] ? ` (${profiliMap[u.id]})` : ' (Nessun profilo Epika)';
            const sel = u.id === utenteIdCorrente ? 'selected' : '';
            select.innerHTML += `<option value="${u.id}" ${sel}>${u.nome.toUpperCase()} ${u.cognome.toUpperCase()}${nomeDiBattaglia}</option>`;
        });

        // Mostra o nasconde bottone rimozione
        const removeBtn = document.getElementById('binding-remove-btn');
        if (utenteIdCorrente) {
            removeBtn.style.display = 'inline-block';
        } else {
            removeBtn.style.display = 'none';
        }

    } catch (e) {
        console.error("Errore caricamento utenti per binding:", e);
        select.innerHTML = '<option value="">Errore caricamento utenti</option>';
    }
}

function chiudiModaleBinding() {
    document.getElementById('epk-modal-binding').classList.add('epk-hidden');
    currentBindingOpzioneId = null;
    currentBindingSoggettoNome = "";
    currentBindingTipo = "";
}

async function salvaBindingAccount() {
    if (!currentBindingOpzioneId) return;

    const utenteId = document.getElementById('binding-utente-select').value;
    if (!utenteId) {
        alert("Seleziona un utente prima di salvare.");
        return;
    }

    try {
        // Ottieni eventuale epika_profilo_id per cache
        const { data: prof } = await supabaseClient
            .from('epika_profili')
            .select('id')
            .eq('id', utenteId)
            .maybeSingle();

        const { error } = await supabaseClient
            .from('epika_opzioni')
            .update({
                utente_id: utenteId,
                profilo_epika_id: prof ? prof.id : null
            })
            .eq('id', currentBindingOpzioneId);

        if (error) throw error;

        alert("Associazione salvata con successo!");
        chiudiModaleBinding();
        await renderRuoliAdmin();
        await renderSCABTab();

    } catch (e) {
        console.error("Errore salvataggio binding:", e);
        alert("Errore durante il salvataggio dell'associazione.");
    }
}

async function rimuoviBindingAccount() {
    if (!currentBindingOpzioneId) return;
    if (!confirm(`Scollegare l'account reale da ${currentBindingSoggettoNome.toUpperCase()}?`)) return;

    try {
        const { error } = await supabaseClient
            .from('epika_opzioni')
            .update({
                utente_id: null,
                profilo_epika_id: null
            })
            .eq('id', currentBindingOpzioneId);

        if (error) throw error;

        alert("Associazione rimossa.");
        chiudiModaleBinding();
        await renderRuoliAdmin();
        await renderSCABTab();

    } catch (e) {
        console.error("Errore rimozione binding:", e);
        alert("Errore durante la rimozione.");
    }
}

async function creaSoggettoRuolo(tipo) {
    let inputId = '';
    if (tipo === 'scab_validatore') inputId = 'adm-new-validatore';
    else if (tipo === 'allenatore') inputId = 'adm-new-allenatore';
    else if (tipo === 'scab_allievo_allenatore') inputId = 'adm-new-allievo';

    const input = document.getElementById(inputId);
    if (!input) return;

    const valore = input.value.trim();
    if (!valore) {
        alert("Inserisci un nome valido.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_opzioni')
            .insert({
                tipo: tipo,
                valore: valore
            });

        if (error) throw error;

        input.value = '';
        alert("Soggetto aggiunto con successo!");
        await renderRuoliAdmin();
        await renderSCABTab();

    } catch (err) {
        console.error("Errore inserimento soggetto ruolo:", err);
        alert("Impossibile salvare il soggetto. Riprova.");
    }
}

async function toggleStatoSoggettoRuolo(id, statoAttuale) {
    try {
        const { error } = await supabaseClient
            .from('epika_opzioni')
            .update({ attivo: !statoAttuale })
            .eq('id', id);

        if (error) throw error;
        await renderRuoliAdmin();
        await renderSCABTab();
    } catch (err) {
        console.error("Errore aggiornamento ruolo:", err);
    }
}



// C — Gestione Eventi Storici (CRUD)
async function renderEventiAdmin() {
    const container = document.getElementById('adm-eventi-lista');
    try {
        const btnNuovo = document.querySelector('#epk-adm-tab-eventi button[onclick="mostraFormCreaEvento()"]');
        if (btnNuovo) {
            if (isReadOnly()) btnNuovo.classList.add('epk-hidden');
            else btnNuovo.classList.remove('epk-hidden');
        }

        const { data: eventi, error } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .order('data_inizio', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        (eventi || []).forEach(evt => {
            const dataInizioF = formattaData(evt.data_inizio);
            const dataFineF = formattaData(evt.data_fine);
            const dataFormattata = dataInizioF === dataFineF ? dataInizioF : `DAL ${dataInizioF} AL ${dataFineF}`;
            const statusStyle = evt.attivo ? 'color: #ff4d4d; border-color: rgba(255, 77, 77, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);';
            const statusText = evt.attivo ? 'DISATTIVA' : 'ATTIVA';

            const toggleBtnHtml = isReadOnly() ? '' : `<button class="epk-btn-secondary" style="font-size: 9px; padding: 6px 12px; ${statusStyle}" onclick="toggleStatoEvento('${evt.id}', ${evt.attivo})">${statusText}</button>`;
            const deleteBtnHtml = isReadOnly() ? '' : `<button class="epk-btn-secondary" style="font-size: 9px; padding: 6px 12px; color: #ff4d4d; border-color: rgba(255, 77, 77, 0.4);" onclick="cancellaEvento('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">CANCELLA</button>`;
            const presenzeBtnText = isReadOnly() ? 'VEDI PRESENZE' : 'GESTISCI PRESENZE';

            container.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); padding: 16px; display: flex; flex-direction: column; gap: 12px; margin: 0;">
                     <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <span class="epk-headline" style="font-size: 14px; color: var(--epk-gold);">${evt.titolo.toUpperCase()}</span>
                            <span style="font-size: 10px; font-family: monospace; display: block; color: rgba(245, 230, 200, 0.5); uppercase; margin-top: 2px;">
                                📅 ${dataFormattata} | 📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'} | TIPO: ${evt.tipo_evento.toUpperCase().replace('_', ' ')}
                            </span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="epk-btn" style="padding: 6px 12px; font-size: 9px; background: #1e3a8a; border-color: #3b82f6;" onclick="mostraDashboardEvento('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}', '${evt.data_inizio}', '${evt.data_fine}')">DASHBOARD</button>
                            <button class="epk-btn" style="padding: 6px 12px; font-size: 9px;" onclick="mostraPannelloPresenze('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">${presenzeBtnText}</button>
                            ${toggleBtnHtml}
                            ${deleteBtnHtml}
                        </div>
                    </div>
                </div>`;
        });

    } catch (err) {
        console.error("Errore caricamento eventi admin:", err);
    }
}

function mostraFormCreaEvento() {
    if (isReadOnly()) return;
    document.getElementById('adm-evento-form-container').classList.remove('epk-hidden');
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('evt-data-inizio').value = todayStr;
    document.getElementById('evt-data-fine').value = todayStr;
}

function nascondiFormCreaEvento() {
    document.getElementById('adm-evento-form-container').classList.add('epk-hidden');
}

async function salvaEventoStorico() {
    if (isReadOnly()) return;
    const titolo = document.getElementById('evt-titolo').value.trim();
    const luogo = document.getElementById('evt-luogo').value.trim();
    const dataInizio = document.getElementById('evt-data-inizio').value;
    const dataFine = document.getElementById('evt-data-fine').value;
    const tipo = document.getElementById('evt-tipo').value;
    const descrizione = document.getElementById('evt-descrizione').value.trim();

    if (!titolo || !luogo || !dataInizio || !dataFine || !tipo) {
        alert("Compila tutti i campi obbligatori dell'evento.");
        return;
    }

    if (new Date(dataFine) < new Date(dataInizio)) {
        alert("La data di fine non può essere precedente alla data di inizio.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_eventi')
            .insert({
                titolo: titolo,
                luogo: luogo,
                data_inizio: dataInizio,
                data_fine: dataFine,
                tipo_evento: tipo,
                descrizione: descrizione || null
            });

        if (error) throw error;

        alert("Evento salvato con successo!");
        nascondiFormCreaEvento();
        
        // Reset form inputs
        document.getElementById('evt-titolo').value = '';
        document.getElementById('evt-luogo').value = '';
        document.getElementById('evt-descrizione').value = '';

        await renderEventiAdmin();

    } catch (err) {
        console.error("Errore creazione evento:", err);
        alert("Impossibile salvare l'evento storico. Riprova.");
    }
}

async function toggleStatoEvento(id, statoAttuale) {
    try {
        const { error } = await supabaseClient
            .from('epika_eventi')
            .update({ attivo: !statoAttuale })
            .eq('id', id);

        if (error) throw error;
        await renderEventiAdmin();
    } catch (err) {
        console.error("Errore aggiornamento stato evento:", err);
    }
}

async function cancellaEvento(id, titolo) {
    if (isReadOnly()) return;
    
    const conferma = confirm(`Sei sicuro di voler CANCELLARE DEFINITIVAMENTE l'evento "${titolo}"?\nQuesta azione eliminerà anche tutte le iscrizioni e presenze collegate e non potrà essere annullata.`);
    if (!conferma) return;

    try {
        // 1. Elimina presenze collegate
        const { error: presError } = await supabaseClient
            .from('epika_presenze_eventi')
            .delete()
            .eq('evento_id', id);
        if (presError) throw presError;

        // 2. Elimina iscrizioni collegate
        const { error: iscError } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .delete()
            .eq('evento_id', id);
        if (iscError) throw iscError;

        // 3. Elimina l'evento stesso
        const { error: evtError } = await supabaseClient
            .from('epika_eventi')
            .delete()
            .eq('id', id);
        if (evtError) throw evtError;

        alert("Evento eliminato con successo.");
        
        // Chiudi eventuali pannelli aperti per questo evento
        document.getElementById('adm-presenze-panel').classList.add('epk-hidden');
        document.getElementById('adm-dashboard-evento-panel').classList.add('epk-hidden');
        
        await renderEventiAdmin();
    } catch (err) {
        console.error("Errore cancellazione evento:", err);
        alert("Impossibile cancellare l'evento: " + err.message);
    }
}

// D — Conferma Presenze Evento
async function mostraPannelloPresenze(eventoId, eventoTitolo) {
    const panel = document.getElementById('adm-presenze-panel');
    document.getElementById('adm-presenze-titolo').textContent = `CONFERMA PRESENZE: ${eventoTitolo.toUpperCase()}`;
    document.getElementById('adm-presenze-evento-id').value = eventoId;
    
    // Nascondi dashboard se aperta
    document.getElementById('adm-dashboard-evento-panel').classList.add('epk-hidden');
    
    panel.classList.remove('epk-hidden');
    panel.scrollIntoView({ behavior: 'smooth' });

    const listContainer = document.getElementById('adm-presenze-utenti-list');
    listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray;">Caricamento iscritti...</p>';

    try {
        // 1. Carica gli iscritti all'evento
        const { data: iscritti, error } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .select(`
                utente_id,
                profilo:epika_profili(nome_di_battaglia)
            `)
            .eq('evento_id', eventoId);

        if (error) throw error;

        // Recupera le presenze già salvate per questo evento
        const { data: presenze } = await supabaseClient
            .from('epika_presenze_eventi')
            .select('utente_id, presente')
            .eq('evento_id', eventoId);

        const presenzeMappa = {};
        (presenze || []).forEach(p => { presenzeMappa[p.utente_id] = p.presente; });

        listContainer.innerHTML = '';
        
        if (!iscritti || iscritti.length === 0) {
            listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: #ff4d4d;">Nessun atleta si è ancora iscritto a questo evento.</p>';
            return;
        }

        // Carica i nomi reali
        const uids = iscritti.map(i => i.utente_id);
        const { data: utentiD } = await supabaseClient.from('utenti').select('id, nome, cognome').in('id', uids);
        const nomiReali = {};
        (utentiD || []).forEach(u => { nomiReali[u.id] = `${u.nome} ${u.cognome}`; });

        iscritti.forEach(isc => {
            const nomeReale = nomiReali[isc.utente_id] || 'N/D';
            const nomeStorico = isc.profilo ? isc.profilo.nome_di_battaglia : 'N/D';
            const isPresente = presenzeMappa[isc.utente_id] === true;

            listContainer.innerHTML += `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span class="epk-headline" style="font-size: 12px; color: var(--epk-gold);">${nomeStorico}</span>
                        <span style="font-size: 10px; color: rgba(245, 230, 200, 0.4); display: block; uppercase;">Real: ${nomeReale.toUpperCase()}</span>
                    </div>
                    <div>
                        <button class="epk-btn-secondary" style="font-size: 9px; padding: 6px 12px; ${isPresente ? 'color: #22c55e; border-color: #22c55e;' : 'color: #ff4d4d; border-color: #ff4d4d;'}" onclick="togglePresenzaAtleta('${eventoId}', '${isc.utente_id}', ${isPresente})">
                            ${isPresente ? 'PRESENTE' : 'ASSENTE'}
                        </button>
                    </div>
                </div>`;
        });

    } catch (err) {
        console.error("Errore caricamento presenze evento:", err);
        listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: red;">Errore durante il caricamento del registro presenze.</p>';
    }
}

async function togglePresenzaAtleta(eventoId, utenteId, statoAttuale) {
    try {
        const { error } = await supabaseClient
            .from('epika_presenze_eventi')
            .upsert({
                evento_id: eventoId,
                utente_id: utenteId,
                presente: !statoAttuale,
                confermato_da: currentUser.id
            }, { onConflict: 'evento_id, utente_id' });

        if (error) throw error;
        
        // Ricarica il pannello presenze per mostrare la variazione
        const titolo = document.getElementById('adm-presenze-titolo').textContent.replace('CONFERMA PRESENZE: ', '');
        await mostraPannelloPresenze(eventoId, titolo);
    } catch (e) {
        console.error("Errore salvataggio presenza:", e);
    }
}

function nascondiPannelloPresenze() {
    document.getElementById('adm-presenze-panel').classList.add('epk-hidden');
}

let dashboardIscrittiCache = [];

async function mostraDashboardEvento(eventoId, eventoTitolo, dataInizio, dataFine) {
    const panel = document.getElementById('adm-dashboard-evento-panel');
    document.getElementById('adm-dashboard-evento-titolo').textContent = `STATISTICHE & DETTAGLI EVENTO: ${eventoTitolo.toUpperCase()}`;
    document.getElementById('adm-dashboard-evento-id').value = eventoId;
    document.getElementById('evt-dashboard-search').value = '';
    
    // Nascondi presenze se aperto
    document.getElementById('adm-presenze-panel').classList.add('epk-hidden');
 
    panel.classList.remove('epk-hidden');
    panel.scrollIntoView({ behavior: 'smooth' });

    const tableBody = document.getElementById('evt-dashboard-table-body');
    tableBody.innerHTML = '<tr><td colspan="8" style="padding: 15px; text-align: center; text-transform: uppercase; color: gray;">Caricamento dati...</td></tr>';

    try {
        // 1. Carica iscrizioni con profili
        const { data: iscritti, error: errIsc } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .select(`
                utente_id,
                giorni_presenza,
                dettagli,
                profilo:epika_profili(nome_di_battaglia, ruolo_combattimento, gruppo_storico_id)
            `)
            .eq('evento_id', eventoId);

        if (errIsc) throw errIsc;

        if (!iscritti || iscritti.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="padding: 15px; text-align: center; text-transform: uppercase; color: #ff4d4d;">Nessun iscritto a questo evento.</td></tr>';
            document.getElementById('evt-stat-totale').textContent = '0';
            document.getElementById('evt-stat-ruoli').innerHTML = 'COMBATTENTI: 0<br>NON COMBATTENTI: 0';
            document.getElementById('evt-stat-combattimento').innerHTML = 'ARMATURA LEGGERA: 0 | PESANTE: 0 | NO: 0<br>ARCIERI PURI: 0 | IBRIDI: 0 | NO: 0';
            document.getElementById('evt-stat-armi').innerHTML = 'GIAVELLOTTI: 0 | SPADA LUNGA: 0 | LANCIA: 0 | SPERIMENTALI: 0';
            document.getElementById('evt-giorni-presenze-container').innerHTML = '';
            dashboardIscrittiCache = [];
            return;
        }

        // 2. Carica anagrafiche utenti
        const uids = iscritti.map(i => i.utente_id);
        const { data: utentiD } = await supabaseClient
            .from('utenti')
            .select('id, nome, cognome')
            .in('id', uids);
        
        const nomiReali = {};
        (utentiD || []).forEach(u => { nomiReali[u.id] = `${u.nome} ${u.cognome}`; });

        // 3. Carica gruppi storici
        const { data: gruppiS } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('id, nome');
        
        const gruppiMappa = {};
        (gruppiS || []).forEach(g => { gruppiMappa[g.id] = g.nome; });

        // 4. Carica allenatori
        const { data: allenatori } = await supabaseClient
            .from('epika_opzioni')
            .select('id, valore')
            .eq('tipo', 'allenatore');
        
        const coachMappa = {};
        (allenatori || []).forEach(c => { coachMappa[c.id] = c.valore; });

        // Elabora statistiche
        let totale = iscritti.length;
        let combattenti = 0;
        let nonCombattenti = 0;
        let armLeggera = 0;
        let armPesante = 0;
        let armNessuna = 0;
        let arcPuro = 0;
        let arcIbrido = 0;
        let arcNo = 0;
        let giavellotti = 0;
        let spadeLunghe = 0;
        let lancia = 0;
        let sperimentali = 0;

        const giorniPresenzaMappa = {};
        const inizioD = new Date(dataInizio);
        const fineD = new Date(dataFine);
        let currD = new Date(inizioD);
        while (currD <= fineD) {
            giorniPresenzaMappa[currD.toISOString().split('T')[0]] = 0;
            currD.setDate(currD.getDate() + 1);
        }

        dashboardIscrittiCache = iscritti.map(isc => {
            const nomeReale = nomiReali[isc.utente_id] || 'NON TROVATO';
            const profilo = isc.profilo || {};
            const nomeStorico = profilo.nome_di_battaglia || 'NON DI BATTAGLIA';
            const ruolo = profilo.ruolo_combattimento || 'non_combattente';
            const gruppoNome = gruppiMappa[profilo.gruppo_storico_id] || 'MERCENARI';
            
            const giorni = Array.isArray(isc.giorni_presenza) ? isc.giorni_presenza : [];
            giorni.forEach(g => {
                if (giorniPresenzaMappa[g] !== undefined) {
                    giorniPresenzaMappa[g]++;
                }
            });

            const dett = isc.dettagli || {};
            const coachNome = coachMappa[dett.allenatore_id] || 'N/D';
            const arm = dett.armatura || 'nessuna';
            const arc = dett.arciere || 'nessuno';
            const armiS = Array.isArray(dett.armi_speciali) ? dett.armi_speciali : [];
            const descSper = dett.descrizione_sperimentali || '';

            if (ruolo === 'combattente') {
                combattenti++;
                if (arm === 'leggera') armLeggera++;
                else if (arm === 'pesante') armPesante++;
                else armNessuna++;

                if (arc === 'puro') arcPuro++;
                else if (arc === 'ibrido') arcIbrido++;
                else arcNo++;

                if (armiS.includes('giavellotto')) giavellotti++;
                if (armiS.includes('spada_lunga')) spadeLunghe++;
                if (armiS.includes('lancia')) lancia++;
                if (armiS.includes('armi_sperimentali')) sperimentali++;
            } else {
                nonCombattenti++;
            }

            return {
                nome_storico: nomeStorico,
                nome_reale: nomeReale,
                gruppo: gruppoNome,
                ruolo: ruolo,
                giorni: giorni.map(formattaData).join(', '),
                coach: coachNome,
                armatura: arm,
                arciere: arc,
                armi_speciali: armiS,
                descrizione_sperimentali: descSper
            };
        });

        // Aggiorna widget statistiche
        document.getElementById('evt-stat-totale').textContent = totale;
        document.getElementById('evt-stat-ruoli').innerHTML = `COMBATTENTI: ${combattenti}<br>NON COMBATTENTI: ${nonCombattenti}`;
        document.getElementById('evt-stat-combattimento').innerHTML = `ARMATURA LEGGERA: ${armLeggera} | PESANTE: ${armPesante} | NO: ${armNessuna}<br>ARCIERI PURI: ${arcPuro} | IBRIDI: ${arcIbrido} | NO: ${arcNo}`;
        document.getElementById('evt-stat-armi').innerHTML = `GIAVELLOTTI: ${giavellotti} | SPADE LUNGHE: ${spadeLunghe} | LANCIA: ${lancia} | SPERIMENTALI: ${sperimentali}`;

        // Aggiorna giorni presenza
        const giorniCont = document.getElementById('evt-giorni-presenze-container');
        giorniCont.innerHTML = '';
        Object.keys(giorniPresenzaMappa).sort().forEach(g => {
            const dataF = formattaData(g);
            const count = giorniPresenzaMappa[g];
            giorniCont.innerHTML += `
                <div style="background: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.15); padding: 8px 12px; border-radius: 2px; text-align: center; min-width: 90px;">
                    <span style="font-size: 9px; display: block; color: rgba(245, 230, 200, 0.6); font-family: monospace;">${dataF}</span>
                    <span style="font-size: 14px; font-weight: bold; color: var(--epk-gold); display: block; margin-top: 2px;">${count}</span>
                </div>
            `;
        });

        filtraPartecipantiDashboard();

    } catch (e) {
        console.error("Errore caricamento dashboard evento:", e);
        tableBody.innerHTML = '<tr><td colspan="8" style="padding: 15px; text-align: center; text-transform: uppercase; color: red;">Errore caricamento dati.</td></tr>';
    }
}

function nascondiDashboardEvento() {
    document.getElementById('adm-dashboard-evento-panel').classList.add('epk-hidden');
}

function filtraPartecipantiDashboard() {
    const query = document.getElementById('evt-dashboard-search').value.toLowerCase().trim();
    const tableBody = document.getElementById('evt-dashboard-table-body');
    
    tableBody.innerHTML = '';

    const filtrati = dashboardIscrittiCache.filter(i => 
        i.nome_storico.toLowerCase().includes(query) ||
        i.nome_reale.toLowerCase().includes(query) ||
        i.gruppo.toLowerCase().includes(query) ||
        i.ruolo.toLowerCase().includes(query)
    );

    if (filtrati.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="padding: 15px; text-align: center; text-transform: uppercase; color: gray;">Nessun partecipante corrisponde ai filtri.</td></tr>';
        return;
    }

    filtrati.forEach(i => {
        const ruoloF = i.ruolo === 'combattente' ? '<span style="color: var(--epk-gold);">COMBATTENTE</span>' : 'NON COMBATTENTE';
        let equip = 'N/D';
        let armiNote = '';

        if (i.ruolo === 'combattente') {
            const armText = i.armatura === 'nessuna' ? 'NO ARMATURA' : `ARM. ${i.armatura.toUpperCase()}`;
            const arcText = i.arciere === 'nessuno' ? 'NO ARCIERE' : `ARC. ${i.arciere.toUpperCase()}`;
            equip = `${armText}<br>${arcText}`;
            
            const armiSpecialiFormatted = i.armi_speciali.map(a => a.toUpperCase().replace('_', ' '));
            if (i.descrizione_sperimentali) {
                armiSpecialiFormatted.push(`SPERIMENTALE: "${i.descrizione_sperimentali}"`);
            }
            armiNote = armiSpecialiFormatted.length > 0 ? armiSpecialiFormatted.join(', ') : 'NESSUNA ABILITAZIONE SPECIALE';
        }

        tableBody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 10px; font-weight: bold; color: var(--epk-gold);">${i.nome_storico.toUpperCase()}</td>
                <td style="padding: 10px; color: rgba(245, 230, 200, 0.7);">${i.nome_reale.toUpperCase()}</td>
                <td style="padding: 10px; text-transform: uppercase;">${i.gruppo}</td>
                <td style="padding: 10px; font-family: monospace;">${ruoloF}</td>
                <td style="padding: 10px; font-family: monospace; font-size: 10px; color: rgba(245, 230, 200, 0.6);">${i.giorni}</td>
                <td style="padding: 10px; text-transform: uppercase;">${i.ruolo === 'combattente' ? i.coach : '-'}</td>
                <td style="padding: 10px; line-height: 1.4; font-size: 10px;">${equip}</td>
                <td style="padding: 10px; font-size: 10px; color: rgba(245, 230, 200, 0.7); max-width: 250px; overflow-wrap: break-word;">${armiNote}</td>
            </tr>
        `;
    });
}

// E — Organigramma Dinamico (Mermaid.js)
async function renderOrganigrammaMermaid() {
    const container = document.getElementById('epk-mermaid-container');
    container.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray;">Generazione organigramma...</p>';
    
    try {
        // Carica tutti i gruppi di lavoro attivi
        const { data: gruppiL, error: glError } = await supabaseClient
            .from('epika_gruppi_lavoro')
            .select('*')
            .eq('attivo', true)
            .order('ordine', { ascending: true });

        if (glError) throw glError;

        // Carica tutti i profili EPIKA nominati a un gruppo di lavoro
        const { data: profili, error: pError } = await supabaseClient
            .from('epika_profili')
            .select('nome_di_battaglia, gruppo_lavoro_ids')
            .eq('profilo_completato', true);

        if (pError) throw pError;

        // Raggruppa i profili per gruppo di lavoro ID
        const membriMappa = {};
        (profili || []).forEach(p => {
            const gids = p.gruppo_lavoro_ids || [];
            gids.forEach(gid => {
                if (!membriMappa[gid]) {
                    membriMappa[gid] = [];
                }
                membriMappa[gid].push(p.nome_di_battaglia);
            });
        });

        // Genera la definizione del grafo Mermaid
        let mermaidCode = "graph TD\n";
        mermaidCode += "    classDef default fill:#150904,stroke:#C9A84C,stroke-width:2px,color:#F5E6C8;\n";
        mermaidCode += "    classDef leader fill:#6B1E2B,stroke:#C9A84C,stroke-width:2px,color:#F5E6C8;\n\n";

        // Crea i nodi per ciascun gruppo di lavoro e associa i relativi tesserati
        (gruppiL || []).forEach((g, index) => {
            const listMembri = membriMappa[g.id] || [];
            let label = `<b>${g.nome.toUpperCase()}</b>`;
            if (listMembri.length > 0) {
                label += `<br/>[${listMembri.join(' - ')}]`;
            } else {
                label += `<br/><i style="font-size:9px;">NESSUNA NOMINA</i>`;
            }
            
            const nodeId = `G${g.id}`;
            mermaidCode += `    ${nodeId}["${label}"]\n`;
            
            // Assegna una classe differenziata per evidenziare graficamente il Direttivo supremo
            if (index === 0) {
                mermaidCode += `    class ${nodeId} leader;\n`;
            }

            // Disegna i legami: collega il Direttivo EPIKA (indice 0) a tutti gli altri gruppi subordinati
            if (index > 0 && gruppiL[0]) {
                mermaidCode += `    G${gruppiL[0].id} --> ${nodeId}\n`;
            }
        });

        container.removeAttribute('data-processed'); // Rimuove eventuali metadati di parsing precedenti
        container.innerHTML = `<pre class="mermaid">${mermaidCode}</pre>`;

        // Renderizza il diagramma Mermaid DOPO che il DOM è visibile
        await mermaid.run({ nodes: [container] });

    } catch (e) {
        console.error("Errore durante il rendering del diagramma Mermaid:", e);
        container.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: red;">Errore di rendering dell\'organigramma strutturale.</p>';
    }
}

// --- GESTIONE GRUPPI STORICI ---
async function renderGruppiStoriciAdmin() {
    const listContainer = document.getElementById('adm-gruppi-storici-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray;">Caricamento in corso...</p>';

    try {
        const { data: gruppi, error } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        if (!gruppi || gruppi.length === 0) {
            listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray;">Nessun gruppo storico registrato.</p>';
            return;
        }

        listContainer.innerHTML = '';
        gruppi.forEach(g => {
            const row = document.createElement('div');
            row.style = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(251, 191, 36, 0.15); padding: 8px 12px; margin-bottom: 4px;";
            
            const capoProf = tesseratiCache.find(t => t.id === g.capogruppo_id);
            const capoNome = capoProf ? (capoProf.nome_di_battaglia || 'Senza Nome') : 'Nessuno';

            let statoLabel = '';
            if (g.stato === 'in_formazione') {
                statoLabel = ' <span style="font-size: 9px; padding: 2px 4px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); margin-left: 6px; border-radius: 3px;">IN FORMAZIONE</span>';
            } else if (g.stato === 'sospeso') {
                statoLabel = ' <span style="font-size: 9px; padding: 2px 4px; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); margin-left: 6px; border-radius: 3px;">SOSPESO</span>';
            } else {
                statoLabel = ' <span style="font-size: 9px; padding: 2px 4px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); margin-left: 6px; border-radius: 3px;">UFFICIALE</span>';
            }

            const infoText = document.createElement('div');
            infoText.innerHTML = `<strong style="color: var(--epk-gold);">${g.nome}</strong>${statoLabel} <span style="font-size: 11px; color: #a1a1aa; margin-left: 8px;">(${g.popolo || 'Mercenari'})</span> <span style="font-size: 10px; color: #71717a; margin-left: 12px;">Capogruppo: ${capoNome}</span>`;
            
            const btnContainer = document.createElement('div');
            btnContainer.style = "display: flex; gap: 4px;";

            const detBtn = document.createElement('button');
            detBtn.className = 'epk-btn';
            detBtn.style = 'font-size: 8px; padding: 4px 8px; background: #92400e; border-color: #78350f; color: #fff; cursor: pointer;';
            detBtn.textContent = 'Gestione';
            detBtn.onclick = () => apriDettaglioGruppo(g.id);

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'epk-btn-secondary';
            toggleBtn.style = `font-size: 8px; padding: 4px 8px; ${g.attivo ? 'color: #f97316; border-color: rgba(249, 115, 22, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);'}`;
            toggleBtn.textContent = g.attivo ? 'Dis' : 'Att';
            toggleBtn.onclick = () => toggleStatoGruppoStorico(g.id, !g.attivo);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'epk-btn-secondary';
            deleteBtn.style = 'font-size: 8px; padding: 4px 8px; color: #ef4444; border-color: rgba(239, 68, 68, 0.4);';
            deleteBtn.textContent = 'Canc';
            deleteBtn.onclick = () => cancellaGruppoStorico(g.id);

            btnContainer.appendChild(detBtn);
            btnContainer.appendChild(toggleBtn);
            btnContainer.appendChild(deleteBtn);

            row.appendChild(infoText);
            row.appendChild(btnContainer);
            listContainer.appendChild(row);
        });
    } catch (e) {
        console.error("Errore caricamento gruppi storici:", e);
        listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: red;">Errore durante il caricamento.</p>';
    }
}

async function creaGruppoStorico() {
    const nomeInput = document.getElementById('new-gruppo-nome');
    const popoloSelect = document.getElementById('new-gruppo-popolo');
    const capoSelect = document.getElementById('new-gruppo-capo');
    const viceSelect = document.getElementById('new-gruppo-vice');
    const respSelect = document.getElementById('new-gruppo-resp');
    
    const nome = nomeInput.value.trim().toUpperCase();
    const popolo = popoloSelect.value || null;
    const capoId = capoSelect.value || null;
    const viceId = viceSelect.value || null;
    const respId = respSelect.value || null;

    if (!nome) {
        alert("Inserisci un nome valido per il gruppo storico.");
        return;
    }
    if (!popolo) {
        alert("Il popolo di riferimento è obbligatorio.");
        return;
    }
    if (!capoId) {
        alert("Il capogruppo è obbligatorio.");
        return;
    }

    try {
        const { data: nuovoGruppo, error: insertError } = await supabaseClient
            .from('epika_gruppi_storici')
            .insert([{
                nome,
                popolo,
                capogruppo_id: capoId,
                vice_capogruppo_id: viceId || null,
                responsabile_iscrizioni_id: respId || null,
                attivo: true
            }])
            .select();

        if (insertError) throw insertError;
        
        const gruppoId = nuovoGruppo[0].id;
        
        const logProms = [];
        logProms.push(supabaseClient.from('epika_storico_ruoli_gruppi').insert([{
            gruppo_storico_id: gruppoId,
            profilo_id: capoId,
            ruolo: 'capogruppo',
            data_inizio: new Date().toISOString()
        }]));
        
        if (viceId) {
            logProms.push(supabaseClient.from('epika_storico_ruoli_gruppi').insert([{
                gruppo_storico_id: gruppoId,
                profilo_id: viceId,
                ruolo: 'vice_capogruppo',
                data_inizio: new Date().toISOString()
            }]));
        }
        
        if (respId) {
            logProms.push(supabaseClient.from('epika_storico_ruoli_gruppi').insert([{
                gruppo_storico_id: gruppoId,
                profilo_id: respId,
                ruolo: 'responsabile_iscrizioni',
                data_inizio: new Date().toISOString()
            }]));
        }
        
        await Promise.all(logProms);

        nomeInput.value = '';
        popoloSelect.value = '';
        capoSelect.value = '';
        viceSelect.value = '';
        respSelect.value = '';
        
        await renderGruppiStoriciAdmin();
        await caricaLookupDati();
    } catch (e) {
        console.error("Errore creazione gruppo storico:", e);
        alert("Errore durante la creazione: il gruppo potrebbe già esistere.");
    }
}

async function toggleStatoGruppoStorico(id, stato) {
    try {
        const { error } = await supabaseClient
            .from('epika_gruppi_storici')
            .update({ attivo: stato })
            .eq('id', id);

        if (error) throw error;

        await renderGruppiStoriciAdmin();
        await caricaLookupDati();
    } catch (e) {
        console.error("Errore aggiornamento stato gruppo storico:", e);
        alert("Errore durante l'aggiornamento dello stato.");
    }
}

// --- FISICA CANCELLAZIONE ---

async function cancellaStrutturaSCAB(id) {
    if (!confirm("Sei sicuro di voler CANCELLARE fisicamente questa struttura? Questa azione è irreversibile.")) return;
    try {
        const { error } = await supabaseClient
            .from('epika_scab_strutture')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await renderSCABTab();
    } catch (e) {
        console.error("Errore cancellazione struttura SCAB:", e);
        if (e.code === '23503') {
            alert("Impossibile cancellare: questa struttura è associata ad abbinamenti attivi o presenze. Disattivala invece.");
        } else {
            alert("Errore durante la cancellazione.");
        }
    }
}

async function cancellaSoggettoRuolo(id) {
    if (!confirm("Sei sicuro di voler CANCELLARE fisicamente questo soggetto/ruolo? Questa azione è irreversibile.")) return;
    try {
        const { error } = await supabaseClient
            .from('epika_opzioni')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await renderSCABTab();
    } catch (e) {
        console.error("Errore cancellazione soggetto ruolo:", e);
        if (e.code === '23503') {
            alert("Impossibile cancellare: questo soggetto è già assegnato a tesserati o abbinamenti. Disattivalo invece.");
        } else {
            alert("Errore durante la cancellazione.");
        }
    }
}

async function cancellaGruppoStorico(id) {
    if (!confirm("Sei sicuro di voler CANCELLARE fisicamente questo gruppo storico? Questa azione è irreversibile.")) return;
    try {
        const { error } = await supabaseClient
            .from('epika_gruppi_storici')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await renderGruppiStoriciAdmin();
        await caricaLookupDati();
    } catch (e) {
        console.error("Errore cancellazione gruppo storico:", e);
        if (e.code === '23503') {
            alert("Impossibile cancellare: questo gruppo è già assegnato a tesserati o nomine. Disattivalo invece.");
        } else {
            alert("Errore durante la cancellazione.");
        }
    }
}

// --- GESTIONE POPOLI ---

async function renderPopoliAdmin() {
    const listContainer = document.getElementById('adm-popoli-list');
    if (!listContainer) return;

    // Show/hide creation form
    const formDiv = document.querySelector('#epk-adm-tab-popoli div[style*="align-items: flex-end"]');
    if (formDiv) {
        if (isReadOnly()) formDiv.classList.add('epk-hidden');
        else formDiv.classList.remove('epk-hidden');
    }

    listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray;">Caricamento in corso...</p>';

    try {
        const { data: popoli, error } = await supabaseClient
            .from('epika_popoli')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        if (!popoli || popoli.length === 0) {
            listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: gray;">Nessun popolo registrato.</p>';
            return;
        }

        listContainer.innerHTML = '';
        popoli.forEach(p => {
            const row = document.createElement('div');
            row.style = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(251, 191, 36, 0.15); padding: 8px 12px; margin-bottom: 4px;";
            
            const infoText = document.createElement('div');
            infoText.innerHTML = `<strong style="color: var(--epk-gold);">${p.nome}</strong>`;
            
            const btnContainer = document.createElement('div');
            btnContainer.style = "display: flex; gap: 4px;";

            if (!isReadOnly()) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'epk-btn-secondary';
                toggleBtn.style = `font-size: 8px; padding: 4px 8px; ${p.attivo ? 'color: #f97316; border-color: rgba(249, 115, 22, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);'}`;
                toggleBtn.textContent = p.attivo ? 'Dis' : 'Att';
                toggleBtn.onclick = () => toggleStatoPopolo(p.id, !p.attivo);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'epk-btn-secondary';
                deleteBtn.style = 'font-size: 8px; padding: 4px 8px; color: #ef4444; border-color: rgba(239, 68, 68, 0.4);';
                deleteBtn.textContent = 'Canc';
                deleteBtn.onclick = () => cancellaPopolo(p.id);

                btnContainer.appendChild(toggleBtn);
                btnContainer.appendChild(deleteBtn);
            }

            row.appendChild(infoText);
            row.appendChild(btnContainer);
            listContainer.appendChild(row);
        });
    } catch (e) {
        console.error("Errore caricamento popoli:", e);
        listContainer.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: red;">Errore durante il caricamento.</p>';
    }
}

async function creaPopolo() {
    const nomeInput = document.getElementById('new-popolo-nome');
    if (!nomeInput) return;
    
    const nome = nomeInput.value.trim().toUpperCase();

    if (!nome) {
        alert("Inserisci un nome valido per il popolo.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_popoli')
            .insert([{ nome, attivo: true }]);

        if (error) throw error;

        nomeInput.value = '';
        await renderPopoliAdmin();
        await caricaLookupDati();
    } catch (e) {
        console.error("Errore creazione popolo:", e);
        alert("Errore durante la creazione: il popolo potrebbe già esistere.");
    }
}

async function toggleStatoPopolo(id, stato) {
    try {
        const { error } = await supabaseClient
            .from('epika_popoli')
            .update({ attivo: stato })
            .eq('id', id);

        if (error) throw error;

        await renderPopoliAdmin();
        await caricaLookupDati();
    } catch (e) {
        console.error("Errore aggiornamento stato popolo:", e);
        alert("Errore durante l'aggiornamento dello stato.");
    }
}

async function cancellaPopolo(id) {
    if (!confirm("Sei sicuro di voler CANCELLARE fisicamente questo popolo? Questa azione è irreversibile.")) return;
    try {
        const { error } = await supabaseClient
            .from('epika_popoli')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await renderPopoliAdmin();
        await caricaLookupDati();
    } catch (e) {
        console.error("Errore cancellazione popolo:", e);
        if (e.code === '23503') {
            alert("Impossibile cancellare: questo popolo è associato a gruppi o tesserati. Disattivalo invece.");
        } else {
            alert("Errore durante la cancellazione.");
        }
    }
}

// --- SOTTO-DASHBOARD GESTIONE DETTAGLIO GRUPPO ---
let oldRuoliDettaglio = {}; // Per tracciare i cambiamenti di ruolo e fare lo storico

async function apriDettaglioGruppo(gruppoId) {
    document.getElementById('epk-adm-tab-gruppi').classList.add('epk-hidden');
    
    const panel = document.getElementById('epk-adm-tab-gruppo-dettaglio');
    if (!panel) return;
    panel.classList.remove('epk-hidden');
    
    try {
        const { data: gruppi, error } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('*')
            .eq('id', gruppoId);
            
        if (error) throw error;
        if (!gruppi || gruppi.length === 0) return;
        
        const g = gruppi[0];
        
        document.getElementById('epk-dettaglio-titolo').textContent = `GESTIONE GRUPPO: ${g.nome}`;
        document.getElementById('det-gruppo-id').value = g.id;
        document.getElementById('det-gruppo-nome').value = g.nome;
        
        const detPopolo = document.getElementById('det-gruppo-popolo');
        const detCapo = document.getElementById('det-gruppo-capo');
        const detVice = document.getElementById('det-gruppo-vice');
        const detResp = document.getElementById('det-gruppo-resp');
        
        if (detPopolo) {
            detPopolo.innerHTML = '<option value="" disabled>SELEZIONA POPOLO...</option>';
            popoliList.forEach(p => {
                const selected = p.nome === g.popolo ? 'selected' : '';
                detPopolo.innerHTML += `<option value="${p.nome}" ${selected}>${p.nome}</option>`;
            });
        }
        
        if (detCapo) {
            detCapo.innerHTML = '<option value="" disabled>SELEZIONA CAPOGRUPPO...</option>';
            tesseratiCache.forEach(t => {
                const selected = t.id === g.capogruppo_id ? 'selected' : '';
                detCapo.innerHTML += `<option value="${t.id}" ${selected}>${t.nome_di_battaglia}</option>`;
            });
        }
        
        if (detVice) {
            detVice.innerHTML = '<option value="">NESSUNO</option>';
            tesseratiCache.forEach(t => {
                const selected = t.id === g.vice_capogruppo_id ? 'selected' : '';
                detVice.innerHTML += `<option value="${t.id}" ${selected}>${t.nome_di_battaglia}</option>`;
            });
        }
        
        if (detResp) {
            detResp.innerHTML = '<option value="">NESSUNO</option>';
            tesseratiCache.forEach(t => {
                const selected = t.id === g.responsabile_iscrizioni_id ? 'selected' : '';
                detResp.innerHTML += `<option value="${t.id}" ${selected}>${t.nome_di_battaglia}</option>`;
            });
        }
        
        oldRuoliDettaglio = {
            capogruppo_id: g.capogruppo_id || null,
            vice_capogruppo_id: g.vice_capogruppo_id || null,
            responsabile_iscrizioni_id: g.responsabile_iscrizioni_id || null
        };
        
        document.getElementById('det-data-formazione-dal').value = g.data_inizio_formazione || '';
        document.getElementById('det-data-formazione-al').value = g.data_fine_formazione || '';
        document.getElementById('det-data-ufficiale-dal').value = g.data_inizio_ufficiale || '';
        document.getElementById('det-data-ufficiale-al').value = g.data_fine_ufficiale || '';
        document.getElementById('det-gruppo-stato').value = g.stato || 'ufficiale';
        document.getElementById('det-gruppo-data-stato').value = g.data_stato || '';
        
        await caricaStoricoRuoliGruppo(gruppoId);
        
    } catch (e) {
        console.error("Errore caricamento dettaglio gruppo:", e);
        alert("Errore durante il caricamento del dettaglio gruppo.");
    }
}

function chiudiDettaglioGruppo() {
    const panel = document.getElementById('epk-adm-tab-gruppo-dettaglio');
    if (panel) panel.classList.add('epk-hidden');
    
    document.getElementById('epk-adm-tab-gruppi').classList.remove('epk-hidden');
    renderGruppiStoriciAdmin();
}

async function caricaStoricoRuoliGruppo(gruppoId) {
    const tbody = document.getElementById('det-storico-ruoli-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px;">Caricamento storico...</td></tr>';
    
    try {
        const { data: storico, error } = await supabaseClient
            .from('epika_storico_ruoli_gruppi')
            .select('*')
            .eq('gruppo_storico_id', gruppoId)
            .order('data_inizio', { ascending: false });
            
        if (error) throw error;
        
        if (!storico || storico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px; color: gray;">Nessun mandato storico registrato per questo gruppo.</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        storico.forEach(s => {
            const prof = tesseratiCache.find(t => t.id === s.profilo_id);
            const nomeTesserato = prof ? (prof.nome_di_battaglia || 'Senza Nome') : 'Utente Sconosciuto';
            
            let ruoloFormatted = '';
            if (s.ruolo === 'capogruppo') ruoloFormatted = 'CAPOGRUPPO';
            else if (s.ruolo === 'vice_capogruppo') ruoloFormatted = 'VICE CAPOGRUPPO';
            else if (s.ruolo === 'responsabile_iscrizioni') ruoloFormatted = 'RESP. ISCRIZIONI';
            
            const inizioStr = s.data_inizio ? new Date(s.data_inizio).toLocaleDateString('it-IT') : 'N/D';
            const fineStr = s.data_fine ? new Date(s.data_fine).toLocaleDateString('it-IT') : 'Attivo';
            
            const tr = document.createElement('tr');
            tr.style = "border-bottom: 1px solid rgba(255,255,255,0.05);";
            tr.innerHTML = `
                <td style="padding: 8px;">${nomeTesserato}</td>
                <td style="padding: 8px; color: var(--epk-gold);">${ruoloFormatted}</td>
                <td style="padding: 8px;">${inizioStr}</td>
                <td style="padding: 8px; ${s.data_fine ? '' : 'color: #22c55e; font-weight: bold;'}">${fineStr}</td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (e) {
        console.error("Errore caricamento storico ruoli:", e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red; padding: 8px;">Errore caricamento storico.</td></tr>';
    }
}

async function salvaRuoliGruppo() {
    const gruppoId = parseInt(document.getElementById('det-gruppo-id').value);
    const nome = document.getElementById('det-gruppo-nome').value.trim().toUpperCase();
    const popolo = document.getElementById('det-gruppo-popolo').value;
    const capoId = document.getElementById('det-gruppo-capo').value;
    const viceId = document.getElementById('det-gruppo-vice').value || null;
    const respId = document.getElementById('det-gruppo-resp').value || null;
    
    if (!nome) {
        alert("Inserisci un nome per il gruppo.");
        return;
    }
    if (!popolo) {
        alert("Il popolo di riferimento è obbligatorio.");
        return;
    }
    if (!capoId) {
        alert("Il capogruppo è obbligatorio.");
        return;
    }
    
    try {
        const updatePayload = {
            nome,
            popolo,
            capogruppo_id: capoId,
            vice_capogruppo_id: viceId,
            responsabile_iscrizioni_id: respId
        };
        
        const { error: updateError } = await supabaseClient
            .from('epika_gruppi_storici')
            .update(updatePayload)
            .eq('id', gruppoId);
            
        if (updateError) throw updateError;
        
        const logProms = [];
        const oraISO = new Date().toISOString();
        
        const gestisciStoricoRuolo = async (ruoloKey, ruoloNome, nuovoValore) => {
            const vecchioValore = oldRuoliDettaglio[ruoloKey];
            if (vecchioValore !== nuovoValore) {
                if (vecchioValore) {
                    logProms.push(
                        supabaseClient
                            .from('epika_storico_ruoli_gruppi')
                            .update({ data_fine: oraISO })
                            .eq('gruppo_storico_id', gruppoId)
                            .eq('profilo_id', vecchioValore)
                            .eq('ruolo', ruoloNome)
                            .is('data_fine', null)
                    );
                }
                if (nuovoValore) {
                    logProms.push(
                        supabaseClient
                            .from('epika_storico_ruoli_gruppi')
                            .insert([{
                                gruppo_storico_id: gruppoId,
                                profilo_id: nuovoValore,
                                ruolo: ruoloNome,
                                data_inizio: oraISO
                            }])
                    );
                }
            }
        };
        
        await gestisciStoricoRuolo('capogruppo_id', 'capogruppo', capoId);
        await gestisciStoricoRuolo('vice_capogruppo_id', 'vice_capogruppo', viceId);
        await gestisciStoricoRuolo('responsabile_iscrizioni_id', 'responsabile_iscrizioni', respId);
        
        if (logProms.length > 0) {
            await Promise.all(logProms);
        }
        
        alert("Ruoli salvati con successo!");
        await caricaLookupDati();
        await apriDettaglioGruppo(gruppoId);
        
    } catch (e) {
        console.error("Errore salvataggio ruoli gruppo:", e);
        alert("Errore durante il salvataggio dei ruoli.");
    }
}

async function salvaDateGruppo() {
    const gruppoId = parseInt(document.getElementById('det-gruppo-id').value);
    const dataFormazioneDal = document.getElementById('det-data-formazione-dal').value || null;
    const dataFormazioneAl = document.getElementById('det-data-formazione-al').value || null;
    const dataUfficialeDal = document.getElementById('det-data-ufficiale-dal').value || null;
    const dataUfficialeAl = document.getElementById('det-data-ufficiale-al').value || null;
    const stato = document.getElementById('det-gruppo-stato').value;
    const dataStato = document.getElementById('det-gruppo-data-stato').value || null;
    
    try {
        const { error } = await supabaseClient
            .from('epika_gruppi_storici')
            .update({
                data_inizio_formazione: dataFormazioneDal,
                data_fine_formazione: dataFormazioneAl,
                data_inizio_ufficiale: dataUfficialeDal,
                data_fine_ufficiale: dataUfficialeAl,
                stato: stato,
                data_stato: dataStato
            })
            .eq('id', gruppoId);
            
        if (error) throw error;
        
        alert("Dati e stato di attività salvati con successo!");
        await caricaLookupDati();
        
    } catch (e) {
        console.error("Errore salvataggio dati gruppo:", e);
        alert("Errore durante il salvataggio dei dati del gruppo.");
    }
}

// ===========================================================================
// SEZIONE GESTIONE VISTA CAPOGRUPPO
// ===========================================================================
let activeCapoTab = 'dati';
let capoTesseratiCache = [];

async function renderCapogruppoDashboard(groupId) {
    if (!groupId) return;
    currentManagedGroupId = groupId;
    
    // Gestione visualizzazione selettore se gestisce più di un gruppo
    const selectContainer = document.getElementById('epk-capo-group-select-container');
    const selectEl = document.getElementById('epk-capo-group-select');
    
    if (managedGroups.length > 1) {
        selectContainer.classList.remove('epk-hidden');
        selectEl.innerHTML = '';
        managedGroups.forEach(g => {
            const selected = g.id === groupId ? 'selected' : '';
            selectEl.innerHTML += `<option value="${g.id}" ${selected}>${g.nome}</option>`;
        });
    } else {
        selectContainer.classList.add('epk-hidden');
    }

    // Carica tutti i profili a cui ha accesso (suoi iscritti + storici)
    try {
        const { data: profili, error: profError } = await supabaseClient
            .from('epika_profili')
            .select('*, utenti(nome, cognome)')
            .eq('profilo_completato', true);
            
        if (profError) throw profError;
        capoTesseratiCache = profili || [];
    } catch (e) {
        console.error("Errore caricamento profili per capogruppo:", e);
    }

    // Carica anche i gruppi di lavoro per mostrare i nomi nei dettagli
    if (gruppiLavoro.length === 0) {
        try {
            const { data: gl, error: glErr } = await supabaseClient
                .from('epika_gruppi_lavoro')
                .select('*')
                .order('ordine', { ascending: true });
            if (!glErr) gruppiLavoro = gl || [];
        } catch (err) {
            console.error(err);
        }
    }

    // Forza il caricamento del tab attivo
    switchCapoTab(activeCapoTab);
}

function switchCapoTab(tab) {
    activeCapoTab = tab;
    
    // Rimuove classe active da tutti i bottoni e nasconde tutti i pannelli del capogruppo
    document.querySelectorAll('#epk-capogruppo .epk-sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#epk-capogruppo .epk-admin-tab-panel').forEach(panel => panel.classList.add('epk-hidden'));
    
    // Attiva bottone e mostra pannello corrispondente
    const btn = document.getElementById(`epk-capo-btn-${tab}`);
    if (btn) btn.classList.add('active');
    
    const panel = document.getElementById(`epk-capo-tab-${tab}`);
    if (panel) panel.classList.remove('epk-hidden');
    
    if (tab === 'dati') {
        renderCapoDatiGruppo();
    } else if (tab === 'iscritti') {
        renderCapoIscrittiGruppo();
    }
}

async function switchManagedGroup(groupId) {
    currentManagedGroupId = parseInt(groupId);
    await renderCapogruppoDashboard(currentManagedGroupId);
}

async function renderCapoDatiGruppo() {
    const groupId = currentManagedGroupId;
    if (!groupId) return;
    
    try {
        // Carica dati del gruppo
        const { data: gruppi, error } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('*')
            .eq('id', groupId)
            .single();
            
        if (error) throw error;
        
        // Imposta i valori testuali
        document.getElementById('epk-capo-dettaglio-titolo').textContent = `GESTIONE GRUPPO: ${gruppi.nome} (Vista Capogruppo)`;
        document.getElementById('capo-val-nome').textContent = gruppi.nome;
        document.getElementById('capo-val-popolo').textContent = gruppi.popolo || 'N/D';
        
        // Helper per formattare i ruoli
        const getMembroNome = (id) => {
            const prof = capoTesseratiCache.find(t => t.id === id);
            if (!prof) return 'Nessuno';
            const realName = prof.utenti ? ` (${prof.utenti.nome} ${prof.utenti.cognome})` : '';
            return `${prof.nome_di_battaglia}${realName}`;
        };
        
        document.getElementById('capo-val-capo').textContent = getMembroNome(gruppi.capogruppo_id);
        document.getElementById('capo-val-vice').textContent = getMembroNome(gruppi.vice_capogruppo_id);
        document.getElementById('capo-val-resp').textContent = getMembroNome(gruppi.responsabile_iscrizioni_id);
        
        // Date attività
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('it-IT') : 'N/D';
        document.getElementById('capo-val-formazione-dal').textContent = formatDate(gruppi.data_inizio_formazione);
        document.getElementById('capo-val-formazione-al').textContent = formatDate(gruppi.data_fine_formazione);
        document.getElementById('capo-val-ufficiale-dal').textContent = formatDate(gruppi.data_inizio_ufficiale);
        document.getElementById('capo-val-ufficiale-al').textContent = formatDate(gruppi.data_fine_ufficiale);
        
        // Statistiche
        document.getElementById('capo-stat-partecipati').textContent = "0";
        document.getElementById('capo-stat-vinti').textContent = "0";
        
        // Carica storico ruoli
        await renderCapoStoricoRuoli(groupId);
        
    } catch (e) {
        console.error("Errore caricamento dati gruppo capogruppo:", e);
    }
}

async function renderCapoStoricoRuoli(groupId) {
    const tbody = document.getElementById('capo-storico-ruoli-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px;">Caricamento storico...</td></tr>';
    
    try {
        const { data: storico, error } = await supabaseClient
            .from('epika_storico_ruoli_gruppi')
            .select('*')
            .eq('gruppo_storico_id', groupId)
            .order('data_inizio', { ascending: false });
            
        if (error) throw error;
        
        if (!storico || storico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px; color: gray;">Nessun mandato storico registrato.</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        storico.forEach(s => {
            const prof = capoTesseratiCache.find(t => t.id === s.profilo_id);
            const nomeTesserato = prof ? (prof.nome_di_battaglia || 'Senza Nome') : 'Utente Sconosciuto';
            const realName = prof && prof.utenti ? ` (${prof.utenti.nome} ${prof.utenti.cognome})` : '';
            
            let ruoloFormatted = '';
            if (s.ruolo === 'capogruppo') ruoloFormatted = 'CAPOGRUPPO';
            else if (s.ruolo === 'vice_capogruppo') ruoloFormatted = 'VICE CAPOGRUPPO';
            else if (s.ruolo === 'responsabile_iscrizioni') ruoloFormatted = 'RESP. ISCRIZIONI';
            
            const inizioStr = s.data_inizio ? new Date(s.data_inizio).toLocaleDateString('it-IT') : 'N/D';
            const fineStr = s.data_fine ? new Date(s.data_fine).toLocaleDateString('it-IT') : 'Attivo';
            
            const tr = document.createElement('tr');
            tr.style = "border-bottom: 1px solid rgba(255,255,255,0.05);";
            tr.innerHTML = `
                <td style="padding: 8px 10px;"><strong>${nomeTesserato}</strong><span style="font-size: 9px; color: gray; margin-left: 6px;">${realName}</span></td>
                <td style="padding: 8px 10px; color: var(--epk-gold);">${ruoloFormatted}</td>
                <td style="padding: 8px 10px;">${inizioStr}</td>
                <td style="padding: 8px 10px; ${fineStr === 'Attivo' ? 'color: #22c55e;' : ''}">${fineStr}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Errore caricamento storico ruoli:", e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px; color: red;">Errore storico.</td></tr>';
    }
}

let capoIscrittiCache = [];
let capoIscrittiOrdinamentoAscendente = true;

async function renderCapoIscrittiGruppo() {
    const tbody = document.getElementById('capo-iscritti-table-body');
    const countEl = document.getElementById('capo-iscritti-count');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 12px;">Ricerca iscritti in corso...</td></tr>';
    
    try {
        const { data: iscritti, error } = await supabaseClient
            .from('epika_profili')
            .select('*, utenti(nome, cognome)')
            .eq('gruppo_storico_id', currentManagedGroupId)
            .eq('profilo_completato', true);
            
        if (error) throw error;
        
        capoIscrittiCache = iscritti || [];
        
        // Popola il filtro dei popoli in base ai popoli effettivamente presenti nel gruppo
        const popoliPresenti = [...new Set(capoIscrittiCache.map(i => i.popolo).filter(Boolean))].sort();
        const popoloFilterSel = document.getElementById('capo-filter-popolo');
        if (popoloFilterSel) {
            popoloFilterSel.innerHTML = '<option value="">TUTTI I POPOLI</option>';
            popoliPresenti.forEach(p => {
                popoloFilterSel.innerHTML += `<option value="${p}">${p.toUpperCase()}</option>`;
            });
        }
        
        disegnaTabellaCapoIscritti();
        
    } catch (e) {
        console.error("Errore caricamento iscritti gruppo:", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 12px; color: red;">Errore durante il caricamento degli iscritti.</td></tr>';
    }
}

function disegnaTabellaCapoIscritti() {
    const tbody = document.getElementById('capo-iscritti-table-body');
    const countEl = document.getElementById('capo-iscritti-count');
    if (!tbody) return;
    
    const query = (document.getElementById('capo-search-input')?.value || '').toLowerCase().trim();
    const ruoloFilter = document.getElementById('capo-filter-ruolo')?.value || '';
    const popoloFilter = document.getElementById('capo-filter-popolo')?.value || '';
    
    // 1. Filtra
    let filtrati = capoIscrittiCache.filter(i => {
        const nomeStorico = (i.nome_di_battaglia || '').toLowerCase();
        const nomeReal = i.utenti ? `${i.utenti.nome} ${i.utenti.cognome}`.toLowerCase() : '';
        const matchNome = nomeStorico.includes(query) || nomeReal.includes(query);
        if (!matchNome) return false;
        
        if (ruoloFilter && i.ruolo_combattimento !== ruoloFilter) return false;
        if (popoloFilter && i.popolo !== popoloFilter) return false;
        
        return true;
    });
    
    // 2. Ordina
    filtrati.sort((a, b) => {
        const nomeA = (a.nome_di_battaglia || '').toLowerCase();
        const nomeB = (b.nome_di_battaglia || '').toLowerCase();
        if (nomeA < nomeB) return capoIscrittiOrdinamentoAscendente ? -1 : 1;
        if (nomeA > nomeB) return capoIscrittiOrdinamentoAscendente ? 1 : -1;
        return 0;
    });
    
    countEl.textContent = `${filtrati.length} ISCRITTI`;
    
    if (filtrati.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 12px; color: gray;">Nessun iscritto trovato con i filtri selezionati.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    filtrati.forEach((i, idx) => {
        const rowNum = idx + 1;
        const nomeStorico = i.nome_di_battaglia || 'Senza Nome';
        const nomeReal = i.utenti ? `${i.utenti.nome} ${i.utenti.cognome}` : 'N/D';
        const popoloVal = i.popolo || 'Mercenario';
        
        let ruoloComb = '';
        if (i.ruolo_combattimento === 'combattente') ruoloComb = 'Combattente';
        else if (i.ruolo_combattimento === 'non_combattente') ruoloComb = 'Non Combattente';
        else ruoloComb = i.ruolo_combattimento || 'N/D';
        
        let incarichiStr = 'Nessuno';
        const gids = i.gruppo_lavoro_ids || [];
        if (gids.length > 0) {
            const nomi = gids.map(gid => {
                const gl = gruppiLavoro.find(l => l.id === gid);
                return gl ? gl.nome : `Incarico #${gid}`;
            }).filter(Boolean);
            if (nomi.length > 0) incarichiStr = nomi.join(', ');
        }
        
        const tr = document.createElement('tr');
        tr.style = "border-bottom: 1px solid rgba(255,255,255,0.05);";
        tr.innerHTML = `
            <td style="padding: 10px; text-align: center; color: var(--epk-gold-dim); font-weight: bold;">${rowNum}</td>
            <td style="padding: 10px;"><strong>${nomeStorico}</strong></td>
            <td style="padding: 10px; color: #a1a1aa;">${nomeReal}</td>
            <td style="padding: 10px; color: #cbd5e1; font-weight: 500; font-size: 11px;">${popoloVal.toUpperCase()}</td>
            <td style="padding: 10px; color: var(--epk-gold);">${ruoloComb}</td>
            <td style="padding: 10px; font-size: 10px; color: #a1a1aa;">${incarichiStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

function applicaFiltriCapoIscritti() {
    disegnaTabellaCapoIscritti();
}

function toggleOrdinamentoCapoIscritti() {
    capoIscrittiOrdinamentoAscendente = !capoIscrittiOrdinamentoAscendente;
    disegnaTabellaCapoIscritti();
}


// --- GESTIONE LISTA GENERALE (2026-2028) ---
let listaGeneraleProfili = [];
let listaGeneraleStorico = [];
let listaGeneraleGruppi = [];
let ordinamentoAscendente = true;

async function renderListaGeneraleAdmin() {
    const tbody = document.getElementById('adm-generale-table-body');
    if (!tbody) return;
    
    // Hide/show save button based on read-only status
    const saveBtn = document.querySelector('#epk-adm-tab-generale button[onclick="salvaTuttaLaListaGenerale()"]');
    if (saveBtn) {
        if (isReadOnly()) saveBtn.classList.add('epk-hidden');
        else saveBtn.classList.remove('epk-hidden');
    }

    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 12px;">Caricamento lista generale...</td></tr>';
    
    try {
        const { data: profili, error: profError } = await supabaseClient
            .from('epika_profili')
            .select('*, utenti(nome, cognome)')
            .eq('profilo_completato', true);
            
        if (profError) throw profError;
        
        const { data: storico, error: storicoError } = await supabaseClient
            .from('epika_storico_organico')
            .select('*');
            
        if (storicoError) throw storicoError;
        
        const { data: gruppi, error: gruppiError } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('id, nome')
            .eq('attivo', true)
            .order('nome', { ascending: true });
            
        if (gruppiError) throw gruppiError;
        
        listaGeneraleProfili = profili || [];
        listaGeneraleStorico = storico || [];
        listaGeneraleGruppi = gruppi || [];
        
        const groupFilterSel = document.getElementById('gen-filter-gruppo');
        if (groupFilterSel) {
            groupFilterSel.innerHTML = '<option value="">TUTTI I GRUPPI 2026</option>';
            listaGeneraleGruppi.forEach(g => {
                groupFilterSel.innerHTML += `<option value="${g.id}">${g.nome.toUpperCase()}</option>`;
            });
        }

        const popoloFilterSel = document.getElementById('gen-filter-popolo');
        if (popoloFilterSel) {
            popoloFilterSel.innerHTML = '<option value="">TUTTI I POPOLI 2026</option>';
            popoliList.forEach(p => {
                popoloFilterSel.innerHTML += `<option value="${p.nome}">${p.nome.toUpperCase()}</option>`;
            });
        }
        
        disegnaTabellaListaGenerale();
        
    } catch (e) {
        console.error("Errore caricamento lista generale:", e);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 12px; color: red;">Errore durante il caricamento della lista generale.</td></tr>';
    }
}

function disegnaTabellaListaGenerale() {
    const tbody = document.getElementById('adm-generale-table-body');
    if (!tbody) return;

    const query = (document.getElementById('gen-search-input')?.value || '').toLowerCase().trim();
    const ruoloFilter = document.getElementById('gen-filter-ruolo')?.value || '';
    const gruppoFilter = document.getElementById('gen-filter-gruppo')?.value || '';
    const popoloFilter = document.getElementById('gen-filter-popolo')?.value || '';

    // 1. Applica Filtri
    let filtrati = listaGeneraleProfili.filter(p => {
        // Filtro Nome
        const nomeStorico = (p.nome_di_battaglia || '').toLowerCase();
        const nomeReal = p.utenti ? `${p.utenti.nome} ${p.utenti.cognome}`.toLowerCase() : '';
        const matchNome = nomeStorico.includes(query) || nomeReal.includes(query);
        if (!matchNome) return false;

        // Trova dati 2026 per filtri
        const row2026 = listaGeneraleStorico.find(s => s.profilo_id === p.id && s.anno_sociale === 2026);
        const ruolo2026 = row2026 ? row2026.ruolo_combattimento : p.ruolo_combattimento;
        const gruppoId2026 = row2026 ? row2026.gruppo_storico_id : p.gruppo_storico_id;
        const popolo2026 = row2026 ? row2026.popolo : p.popolo;

        if (ruoloFilter && ruolo2026 !== ruoloFilter) return false;
        if (gruppoFilter && String(gruppoId2026) !== String(gruppoFilter)) return false;
        if (popoloFilter && popolo2026 !== popoloFilter) return false;

        return true;
    });

    // 2. Applica Ordinamento
    filtrati.sort((a, b) => {
        const nomeA = (a.nome_di_battaglia || '').toLowerCase();
        const nomeB = (b.nome_di_battaglia || '').toLowerCase();
        if (nomeA < nomeB) return ordinamentoAscendente ? -1 : 1;
        if (nomeA > nomeB) return ordinamentoAscendente ? 1 : -1;
        return 0;
    });

    if (filtrati.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 12px; color: gray;">Nessun componente trovato con i filtri selezionati.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtrati.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.style = "border-bottom: 1px solid rgba(255,255,255,0.05);";
        
        const rowNum = idx + 1;
        const nomeStorico = p.nome_di_battaglia || 'Senza Nome';
        const nomeReal = p.utenti ? `${p.utenti.nome} ${p.utenti.cognome}` : 'N/D';

        const row2026 = listaGeneraleStorico.find(s => s.profilo_id === p.id && s.anno_sociale === 2026);
        const ruoloAttivo = row2026 ? row2026.ruolo_combattimento : p.ruolo_combattimento;
        const gruppoIdAttivo = row2026 ? row2026.gruppo_storico_id : p.gruppo_storico_id;
        const popoloAttivo = row2026 ? row2026.popolo : p.popolo;
        
        const isFallback = !row2026;
        const selectStyle = isFallback ? "opacity: 0.65; font-style: italic; border-color: rgba(251, 191, 36, 0.2);" : "border-color: var(--epk-gold);";
        
        const disabledSelect = isReadOnly() ? 'disabled' : '';
        // Select Ruolo
        let ruoloSelect = `<select class="gen-ruolo epk-input" data-uid="${p.id}" data-year="2026" style="font-size: 10px; padding: 4px; width: 100px; ${selectStyle}" ${disabledSelect} onchange="this.style.opacity='1'; this.style.fontStyle='normal'; this.style.borderColor='var(--epk-gold)'">`;
        ruoloSelect += `<option value="" ${!ruoloAttivo ? 'selected' : ''}>NESSUNO</option>`;
        ruoloSelect += `<option value="combattente" ${ruoloAttivo === 'combattente' ? 'selected' : ''}>COMBATTENTE</option>`;
        ruoloSelect += `<option value="non_combattente" ${ruoloAttivo === 'non_combattente' ? 'selected' : ''}>NON COMBATTENTE</option>`;
        ruoloSelect += `</select>`;
        
        // Select Gruppo
        let gruppoSelect = `<select class="gen-gruppo epk-input" data-uid="${p.id}" data-year="2026" style="font-size: 10px; padding: 4px; width: 110px; ${selectStyle}" ${disabledSelect} onchange="this.style.opacity='1'; this.style.fontStyle='normal'; this.style.borderColor='var(--epk-gold)'">`;
        gruppoSelect += `<option value="" ${!gruppoIdAttivo ? 'selected' : ''}>NESSUNO</option>`;
        listaGeneraleGruppi.forEach(g => {
            const selected = (gruppoIdAttivo && Number(g.id) === Number(gruppoIdAttivo)) ? 'selected' : '';
            gruppoSelect += `<option value="${g.id}" ${selected}>${g.nome.toUpperCase()}</option>`;
        });
        gruppoSelect += `</select>`;

        // Select Popolo
        let popoloSelect = `<select class="gen-popolo epk-input" data-uid="${p.id}" data-year="2026" style="font-size: 10px; padding: 4px; width: 110px; ${selectStyle}" ${disabledSelect} onchange="this.style.opacity='1'; this.style.fontStyle='normal'; this.style.borderColor='var(--epk-gold)'">`;
        popoloSelect += `<option value="" ${!popoloAttivo ? 'selected' : ''}>NESSUNO</option>`;
        popoliList.forEach(pop => {
            const selected = (popoloAttivo && pop.nome === popoloAttivo) ? 'selected' : '';
            popoloSelect += `<option value="${pop.nome}" ${selected}>${pop.nome.toUpperCase()}</option>`;
        });
        popoloSelect += `</select>`;

        tr.innerHTML = `
            <td style="padding: 10px; text-align: center; color: var(--epk-gold-dim); font-weight: bold;">${rowNum}</td>
            <td style="padding: 10px;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="color: var(--epk-gold);">${nomeStorico}</strong>
                    <span style="font-size: 10px; color: #a1a1aa;">${nomeReal}</span>
                </div>
            </td>
            <td style="padding: 8px; text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
                    ${ruoloSelect}
                    ${gruppoSelect}
                    ${popoloSelect}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function applicaFiltriListaGenerale() {
    disegnaTabellaListaGenerale();
}

function toggleOrdinamentoListaGenerale() {
    ordinamentoAscendente = !ordinamentoAscendente;
    disegnaTabellaListaGenerale();
}

async function salvaTuttaLaListaGenerale() {
    if (isReadOnly()) return;
    const ruoliSelects = document.querySelectorAll('.gen-ruolo');
    const gruppiSelects = document.querySelectorAll('.gen-gruppo');
    const popoliSelects = document.querySelectorAll('.gen-popolo');
    
    const rowsToUpsert = [];
    const map = {};
    
    ruoliSelects.forEach(sel => {
        const uid = sel.getAttribute('data-uid');
        const year = parseInt(sel.getAttribute('data-year'));
        const key = `${uid}_${year}`;
        if (!map[key]) {
            map[key] = { profilo_id: uid, anno_sociale: year };
        }
        map[key].ruolo_combattimento = sel.value || null;
    });
    
    gruppiSelects.forEach(sel => {
        const uid = sel.getAttribute('data-uid');
        const year = parseInt(sel.getAttribute('data-year'));
        const key = `${uid}_${year}`;
        if (!map[key]) {
            map[key] = { profilo_id: uid, anno_sociale: year };
        }
        map[key].gruppo_storico_id = sel.value ? parseInt(sel.value) : null;
    });

    popoliSelects.forEach(sel => {
        const uid = sel.getAttribute('data-uid');
        const year = parseInt(sel.getAttribute('data-year'));
        const key = `${uid}_${year}`;
        if (!map[key]) {
            map[key] = { profilo_id: uid, anno_sociale: year };
        }
        map[key].popolo = sel.value || null;
    });
    
    for (const key in map) {
        rowsToUpsert.push(map[key]);
    }
    
    if (rowsToUpsert.length === 0) return;
    
    try {
        const { error } = await supabaseClient
            .from('epika_storico_organico')
            .upsert(rowsToUpsert, { onConflict: 'profilo_id,anno_sociale' });
            
        if (error) throw error;
        
        alert("Modifiche per l'anno 2026 salvate con successo!");
        // Ricarichiamo i dati dello storico
        const { data: storico } = await supabaseClient
            .from('epika_storico_organico')
            .select('*');
        listaGeneraleStorico = storico || [];
        
        disegnaTabellaListaGenerale();
    } catch (e) {
        console.error("Errore salvataggio lista generale:", e);
        alert("Errore durante il salvataggio della lista generale.");
    }
}

// ===========================================================================
// FUNZIONI DI RENDER PER LE NUOVE VISTE SCAB
// ===========================================================================

async function renderAllenatoreDashboard(opzioneId) {
    const container = document.getElementById('epk-allenatore-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento atleti...</div>';

    try {
        // Carica tutti i profili che hanno questo allenatore_id
        // Nota: alias esplicito "gruppo_storico:gruppo_storico_id" richiesto da PostgREST
        // per disambiguare il join quando ci sono più FK verso la stessa tabella
        const { data: atleti, error } = await supabaseClient
            .from('epika_profili')
            .select('nome_di_battaglia, popolo, ruolo_combattimento, primo_anno_partecipazione, gruppo_storico:gruppo_storico_id(nome)')
            .eq('allenatore_id', opzioneId)
            .eq('profilo_completato', true)
            .order('nome_di_battaglia', { ascending: true });

        if (error) throw error;

        if (!atleti || atleti.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Nessun atleta ti ha inserito come suo allenatore nel portale.</div>';
            return;
        }

        let html = `
            <div style="overflow-x: auto; margin-top: 16px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 11px; text-transform: uppercase;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--epk-gold); color: var(--epk-gold);">
                            <th style="padding: 10px;">Nome di Battaglia</th>
                            <th style="padding: 10px;">Gruppo Storico</th>
                            <th style="padding: 10px;">Cultura / Popolo</th>
                            <th style="padding: 10px;">Ruolo Militare</th>
                            <th style="padding: 10px;">Primo Anno Part.</th>
                        </tr>
                    </thead>
                    <tbody>`;

        atleti.forEach(a => {
            const gruppoNome = a.gruppo_storico ? a.gruppo_storico.nome : 'N/D';
            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; font-weight: bold; color: var(--epk-parchment);">${a.nome_di_battaglia}</td>
                    <td style="padding: 10px;">${gruppoNome}</td>
                    <td style="padding: 10px;">${a.popolo || 'N/D'}</td>
                    <td style="padding: 10px;">${a.ruolo_combattimento}</td>
                    <td style="padding: 10px; text-align: center;">${a.primo_anno_partecipazione}</td>
                </tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Errore caricamento atleti allenatore:", e);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento della lista atleti.</div>';
    }
}

async function renderAllievoAllenatoreDashboard(opzioneId) {
    const container = document.getElementById('epk-allievo-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento abbinamenti...</div>';

    try {
        // Carica tutti gli abbinamenti
        const { data: abbinamenti, error } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .select('*, struttura:struttura_id(nome, tipo), allenatore:allenatore_ref_id(valore), validatore:validatore_id(valore)');

        if (error) throw error;

        // Filtra lato client
        const mieiAbbinamenti = (abbinamenti || []).filter(a => 
            Number(a.allievo_ref_id) === Number(opzioneId) ||
            (Array.isArray(a.allievi_ids) && a.allievi_ids.map(Number).includes(Number(opzioneId)))
        );

        if (mieiAbbinamenti.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Non risulti abbinato a nessuna struttura SCAB al momento.</div>';
            return;
        }

        let html = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 16px;">`;

        mieiAbbinamenti.forEach(a => {
            const strutturaNome = a.struttura ? a.struttura.nome.toUpperCase() : 'N/D';
            const strutturaTipo = a.struttura ? (a.struttura.tipo === 'palestra' ? 'PALESTRA' : 'CENTRO PRATICA') : 'N/D';
            const allenatoreCapo = a.allenatore ? a.allenatore.valore.toUpperCase() : 'NESSUNO';
            const validatore = a.validatore ? a.validatore.valore.toUpperCase() : 'N/D';

            html += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(251, 191, 36, 0.2); padding-bottom: 6px;">
                        <span style="font-weight: bold; color: var(--epk-gold); font-size: 13px;">${strutturaNome}</span>
                        <span style="font-size: 9px; padding: 2px 6px; background: rgba(201, 168, 76, 0.2); border-radius: 2px;">${strutturaTipo}</span>
                    </div>
                    <div style="font-size: 11px; display: flex; flex-direction: column; gap: 4px; text-transform: uppercase;">
                        <div><strong style="color: var(--epk-gold-dim);">Allenatore Capo:</strong> ${allenatoreCapo}</div>
                        <div><strong style="color: var(--epk-gold-dim);">Validatore:</strong> ${validatore}</div>
                    </div>
                </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Errore caricamento abbinamenti allievo:", e);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento degli abbinamenti.</div>';
    }
}

async function renderValidatoreDashboard(opzioneId) {
    const container = document.getElementById('epk-validatore-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento strutture...</div>';

    try {
        // Carica soggetti e abbinamenti
        const { data: soggetti, error: sErr } = await supabaseClient
            .from('epika_opzioni')
            .select('id, valore, tipo')
            .in('tipo', ['allenatore', 'scab_allievo_allenatore']);

        if (sErr) throw sErr;

        const soggettiMap = {};
        (soggetti || []).forEach(s => {
            soggettiMap[s.id] = s.valore.toUpperCase();
        });

        const { data: abbinamenti, error: aErr } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .select('*, struttura:struttura_id(nome, tipo)')
            .eq('validatore_id', opzioneId);

        if (aErr) throw aErr;

        if (!abbinamenti || abbinamenti.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Non sei registrato come validatore per nessuna palestra o centro.</div>';
            return;
        }

        let html = `
            <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 16px;">`;

        abbinamenti.forEach(a => {
            const strutturaNome = a.struttura ? a.struttura.nome.toUpperCase() : 'N/D';
            const allenatoreCapo = a.allenatore_ref_id ? soggettiMap[a.allenatore_ref_id] : 'NESSUNO';
            
            // Co-allenatori
            const coAllenatori = (a.allenatori_co_ids || [])
                .map(id => soggettiMap[id])
                .filter(Boolean)
                .join(', ') || 'NESSUNO';

            // Allievi
            const allievoRef = a.allievo_ref_id ? soggettiMap[a.allievo_ref_id] : 'NESSUNO';
            const allieviAltri = (a.allievi_ids || [])
                .map(id => soggettiMap[id])
                .filter(Boolean)
                .join(', ') || 'NESSUNO';

            html += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); display: flex; flex-direction: column; gap: 12px; padding: 16px;">
                    <div style="font-size: 14px; font-weight: bold; color: var(--epk-gold); border-bottom: 1px solid rgba(251, 191, 36, 0.2); padding-bottom: 6px; text-transform: uppercase;">
                        ${strutturaNome}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 11px; text-transform: uppercase;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div><strong style="color: var(--epk-gold-dim);">Allenatore Principale:</strong> ${allenatoreCapo}</div>
                            <div><strong style="color: var(--epk-gold-dim);">Co-Allenatori:</strong> ${coAllenatori}</div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div><strong style="color: var(--epk-gold-dim);">Allievo Referente:</strong> ${allievoRef}</div>
                            <div><strong style="color: var(--epk-gold-dim);">Altri Allievi:</strong> ${allieviAltri}</div>
                        </div>
                    </div>
                </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Errore caricamento strutture validatore:", e);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento delle strutture.</div>';
    }
}


