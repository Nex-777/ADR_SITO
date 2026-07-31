// ===========================================================================
// EPIKA PORTAL JAVASCRIPT
// ===========================================================================

const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentUserProfile = null;
let currentUserTessera = null;
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
let scabAbbinamentiMap = {};
let managedGroups = [];
let isCapogruppo = false;
let currentManagedGroupId = null;
let userScabRolesMap = {}; // Mappa dei ruoli SCAB dell'utente: tipo ('allenatore', 'scab_validatore', 'scab_allievo_allenatore') -> opzione_id
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
            .select('nome, cognome, ruolo, tipo_tessera, anagrafiche(id)')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (userError) {
            console.error("Errore recupero utenti:", userError);
            alert("Errore caricamento profilo utenti: " + userError.message);
        }

        // Blocco reindirizzamento se registrazione Adrenalina incompleta (anagrafica mancante)
        const anagCheck = userData?.anagrafiche;
        const hasAnagrafica = anagCheck && (Array.isArray(anagCheck) ? anagCheck.length > 0 : !!anagCheck.id);
        if (!hasAnagrafica) {
            alert("La tua registrazione ad Adrenalina Club non è ancora stata completata. Devi completare il tesseramento dal portale prima di poter accedere ad Epika.");
            window.location.href = "dashboard.html";
            return;
        }

        if (userData) {
            document.getElementById('epk-user-real-name').textContent = `${userData.nome} ${userData.cognome}`;
        } else {
            console.warn("Nessun record trovato in utenti per ID:", currentUser.id);
        }

        // Estrai il livello tessera usando la funzione RPC Postgres centralizzata (Single Source of Truth)
        try {
            const { data: tesseraLivello, error: tesseraErr } = await supabaseClient
                .rpc('get_user_tessera_livello', { p_utente_id: currentUser.id });
            
            if (tesseraErr) {
                console.warn("Errore recupero livello tessera via RPC:", tesseraErr);
                currentUserTessera = userData ? (userData.tipo_tessera || null) : null;
            } else {
                currentUserTessera = tesseraLivello;
            }
        } catch (err) {
            console.error("Eccezione RPC get_user_tessera_livello:", err);
            currentUserTessera = userData ? (userData.tipo_tessera || null) : null;
        }
        console.log("Livello tessera determinato per utente:", currentUserTessera);

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

        // Rilevamento ruoli SCAB per utente reale (multi-ruolo supportato)
        try {
            userScabRolesMap = {};
            const { data: scabRecords, error: scabErr } = await supabaseClient
                .from('epika_opzioni')
                .select('id, tipo')
                .eq('utente_id', currentUser.id)
                .in('tipo', ['allenatore', 'scab_validatore', 'scab_allievo_allenatore']);

            if (!scabErr && scabRecords && scabRecords.length > 0) {
                scabRecords.forEach(r => {
                    userScabRolesMap[r.tipo] = r.id;
                });
                console.log("Rilevati ruoli SCAB utente:", userScabRolesMap);
            }
        } catch (e) {
            console.error("Errore recupero ruoli SCAB utente:", e);
        }


        // Determina se l'utente appartiene a qualche direttivo/gruppo di lavoro
        const gLavoroIds = (epikaProfile && Array.isArray(epikaProfile.gruppo_lavoro_ids)) ? epikaProfile.gruppo_lavoro_ids.map(Number) : [];
        const hasDirettivoEpika = gLavoroIds.includes(1);
        const hasDirettivoScab = gLavoroIds.includes(2);
        const hasDirettivoLogistica = gLavoroIds.includes(3);
        const hasDirettivoMarketing = gLavoroIds.includes(4);
        const hasDirettivoSibis = gLavoroIds.includes(10);
        const isCapogruppoLavoro = isCapogruppo || gLavoroIds.includes(5) || gLavoroIds.includes(6) || gLavoroIds.includes(7) || gLavoroIds.includes(9);

        // Gestione switcher di vista (per admin, capogruppo, direttivi e ruoli SCAB)
        const haQualcheRuoloSpeciale = isEpikaAdmin || isCapogruppoLavoro || hasDirettivoEpika || hasDirettivoScab || hasDirettivoLogistica || hasDirettivoMarketing || hasDirettivoSibis || Object.keys(userScabRolesMap).length > 0;
        if (haQualcheRuoloSpeciale) {
            const adminSwitcher = document.getElementById('epk-admin-switcher');
            adminSwitcher.innerHTML = '';
            if (isEpikaAdmin) {
                adminSwitcher.innerHTML += '<option value="admin">VISTA AMMINISTRATORE</option>';
            }
            if (hasDirettivoEpika) {
                adminSwitcher.innerHTML += '<option value="direttivo_epika">VISTA DIRETTIVO</option>';
            }
            if (hasDirettivoLogistica) {
                adminSwitcher.innerHTML += '<option value="direttivo_logistica">VISTA DIRETTIVO LOGISTICA</option>';
            }
            if (hasDirettivoScab) {
                adminSwitcher.innerHTML += '<option value="direttivo_scab">VISTA DIRETTIVO SCAB</option>';
            }
            if (hasDirettivoSibis || isEpikaAdmin) {
                adminSwitcher.innerHTML += '<option value="direttivo_sibis">VISTA DIRETTIVO SIBIS</option>';
            }
            if (hasDirettivoMarketing) {
                adminSwitcher.innerHTML += '<option value="direttivo_marketing">VISTA DIRETTIVO MARKETING</option>';
            }
            if (userScabRolesMap['scab_validatore']) {
                adminSwitcher.innerHTML += '<option value="validatore">VISTA VALIDATORI</option>';
            }
            if (userScabRolesMap['allenatore']) {
                adminSwitcher.innerHTML += '<option value="allenatore">VISTA ALLENATORE</option>';
            }
            if (userScabRolesMap['scab_allievo_allenatore']) {
                adminSwitcher.innerHTML += '<option value="allievo_allenatore">VISTA ALLIEVO ALL.</option>';
            }
            if (isCapogruppoLavoro) {
                adminSwitcher.innerHTML += '<option value="capogruppo">VISTA CAPOGRUPPO</option>';
            }
            adminSwitcher.innerHTML += '<option value="athlete">VISTA ATLETA</option>';
            if (isEpikaAdmin) {
                adminSwitcher.innerHTML += '<option value="simula_validatore">🔍 SIMULA VALIDATORE</option>';
                adminSwitcher.innerHTML += '<option value="simula_allenatore">🔍 SIMULA ALLENATORE</option>';
                adminSwitcher.innerHTML += '<option value="simula_allievo">🔍 SIMULA ALLIEVO ALL.</option>';
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
            } else if (viewParam === 'direttivo_sibis' && (hasDirettivoSibis || isEpikaAdmin)) {
                adminSwitcher.value = 'direttivo_sibis';
            } else if (viewParam === 'direttivo_marketing' && hasDirettivoMarketing) {
                adminSwitcher.value = 'direttivo_marketing';
            } else if (viewParam === 'capogruppo' && isCapogruppoLavoro) {
                adminSwitcher.value = 'capogruppo';
            } else if (viewParam === 'allenatore' && userScabRolesMap['allenatore']) {
                adminSwitcher.value = 'allenatore';
            } else if (viewParam === 'allievo_allenatore' && userScabRolesMap['scab_allievo_allenatore']) {
                adminSwitcher.value = 'allievo_allenatore';
            } else if (viewParam === 'validatore' && userScabRolesMap['scab_validatore']) {
                adminSwitcher.value = 'validatore';
            }
        }

        // Nascondi loader iniziale
        document.getElementById('epk-loader').classList.add('epk-hidden');

        // Gestione ritorno dal pagamento Stripe per evento Epika
        // urlParams qui è sicuramente disponibile perché dichiarata subito dopo
        const allUrlParams = new URLSearchParams(window.location.search);
        const eventPayment = allUrlParams.get('event_payment');
        if (eventPayment === 'success') {
            setTimeout(() => {
                alert('✅ Iscrizione registrata con successo! Il pagamento è stato confermato.');
            }, 500);
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (eventPayment === 'cancel') {
            setTimeout(() => {
                alert('⚠️ Pagamento annullato. L\'iscrizione all\'evento non è stata completata.');
            }, 500);
            window.history.replaceState({}, document.title, window.location.pathname);
        }

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
                switchAllenatoreTab('atleti');
            } else if (viewMode === 'allievo_allenatore') {
                document.getElementById('epk-allievo').classList.remove('epk-hidden');
                switchAllievoTab('abbinamenti');
            } else if (viewMode === 'validatore') {
                document.getElementById('epk-validatore').classList.remove('epk-hidden');
                switchValidatoreTab('strutture');
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
            applicaRestrizioneTessera('fa-ruolo-combattimento');
            onFaRuoloChange();
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
        switchAllenatoreTab('atleti');
    } else if (view === 'allievo_allenatore') {
        document.getElementById('epk-allievo').classList.remove('epk-hidden');
        switchAllievoTab('abbinamenti');
    } else if (view === 'validatore') {
        document.getElementById('epk-validatore').classList.remove('epk-hidden');
        switchValidatoreTab('strutture');
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
        switchAllenatoreTab('atleti');
    } else if (viewMode === 'simula_allievo') {
        document.getElementById('epk-allievo').classList.remove('epk-hidden');
        switchAllievoTab('abbinamenti');
    } else if (viewMode === 'simula_validatore') {
        document.getElementById('epk-validatore').classList.remove('epk-hidden');
        switchValidatoreTab('strutture');
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
                if (g.stato !== 'sospeso' && g.stato !== 'cancellato') {
                    selectGruppo.innerHTML += `<option value="${g.id}">${g.nome}</option>`;
                }
            });
        }

        // Carica Allenatori e Allievi Allenatori
        const { data: allenatori, error: aError } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .in('tipo', ['allenatore', 'scab_allievo_allenatore'])
            .eq('attivo', true)
            .order('valore', { ascending: true });

        if (aError) {
            throw aError;
        }

        allenatoriLista = allenatori || [];

        const selectAllenatore = document.getElementById('fa-allenatore');
        if (selectAllenatore) {
            const allenatoriDirect = allenatoriLista.filter(a => a.tipo === 'allenatore');
            const allieviDirect = allenatoriLista.filter(a => a.tipo === 'scab_allievo_allenatore');

            selectAllenatore.innerHTML = '<option value="" disabled selected>SELEZIONA</option>';
            if (allenatoriDirect.length) {
                selectAllenatore.innerHTML += '<optgroup label="ALLENATORI">';
                allenatoriDirect.forEach(a => { selectAllenatore.innerHTML += `<option value="${a.id}">${a.valore}</option>`; });
                selectAllenatore.innerHTML += '</optgroup>';
            }
            if (allieviDirect.length) {
                selectAllenatore.innerHTML += '<optgroup label="ALLIEVI ALLENATORI">';
                allieviDirect.forEach(a => { selectAllenatore.innerHTML += `<option value="${a.id}">${a.valore}</option>`; });
                selectAllenatore.innerHTML += '</optgroup>';
            }
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
        if (gruppoScelto.popolo && gruppoScelto.popolo !== 'MERCENARI') {
            // Gruppo con popolo predefinito
            selectPopolo.value = gruppoScelto.popolo;
            selectPopolo.disabled = true;
        } else {
            // Mercenari: sblocca selezione
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
    const allenatoreSelect = document.getElementById('fa-allenatore');
    const allenatoreId = ruoloCombattimento === 'combattente' && allenatoreSelect.value ? parseInt(allenatoreSelect.value) : null;

    if (!nomeBattaglia || !ruoloCombattimento || !primoAnno || !gruppoStoricoId || !popolo) {
        alert("Compila tutti i campi obbligatori.");
        return;
    }

    if (ruoloCombattimento === 'combattente' && !allenatoreId) {
        alert("Seleziona l'allenatore di riferimento obbligatorio per i combattenti.");
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

        currentUserProfile = profilePayload;
        await syncAbilitazioneScab(ruoloCombattimento, allenatoreId);

        alert("Profilo storico creato con successo! Benvenuto in EPIKA.");
        document.getElementById('epk-first-access').classList.add('epk-hidden');
        document.getElementById('epk-user-battle-name').textContent = `~ ${nomeBattaglia} ~`;
        
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
        if (!gruppiStorici || gruppiStorici.length === 0 || !allenatoriLista || allenatoriLista.length === 0) {
            await caricaLookupDati();
        }

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
            ruolo_combattimento: prof.ruolo_combattimento
        };

        const selectGruppo = document.getElementById('edit-gruppo-storico');
        selectGruppo.innerHTML = '<option value="" disabled>-- SELEZIONA GRUPPO --</option>';
        gruppiStorici.forEach(g => {
            if (g.stato !== 'sospeso' && g.stato !== 'cancellato' || g.id === prof.gruppo_storico_id) {
                const labelStatus = g.stato === 'sospeso' ? ' (SOSPESO)' : (g.stato === 'cancellato' ? ' (CANCELLATO)' : '');
                selectGruppo.innerHTML += `<option value="${g.id}">${g.nome}${labelStatus}</option>`;
            }
        });
        selectGruppo.value = prof.gruppo_storico_id ? String(prof.gruppo_storico_id) : '';

        const selectPopolo = document.getElementById('edit-popolo');
        selectPopolo.innerHTML = '<option value="" disabled>-- SELEZIONA POPOLO --</option>';
        popoliList.forEach(p => {
            selectPopolo.innerHTML += `<option value="${p.nome}">${p.nome}</option>`;
        });
        selectPopolo.value = prof.popolo || '';

        document.getElementById('edit-ruolo-combattimento').value = prof.ruolo_combattimento || 'combattente';

        onEditGruppoStoricoChange();
        applicaRestrizioneTessera('edit-ruolo-combattimento');

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
        if (gruppoScelto.popolo && gruppoScelto.popolo !== 'MERCENARI') {
            selectPopolo.value = gruppoScelto.popolo;
            selectPopolo.disabled = true;
        } else {
            selectPopolo.disabled = false;
        }
    }
}

async function salvaModificheProfilo() {
    const gruppoStoricoVal = document.getElementById('edit-gruppo-storico').value;
    const gruppoStoricoId = gruppoStoricoVal ? parseInt(gruppoStoricoVal) : null;
    const selectPopolo = document.getElementById('edit-popolo');
    const popolo = selectPopolo.value;
    const ruoloCombattimento = document.getElementById('edit-ruolo-combattimento').value;

    if (isNaN(gruppoStoricoId) || !gruppoStoricoId) {
        alert("Seleziona un Gruppo Storico valido.");
        return;
    }

    if (!popolo) {
        alert("Seleziona un Popolo / Cultura valido.");
        return;
    }

    if (
        gruppoStoricoId === originalProfileData.gruppo_storico_id &&
        popolo === originalProfileData.popolo &&
        ruoloCombattimento === originalProfileData.ruolo_combattimento
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
                ruolo_combattimento: ruoloCombattimento
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

// Helper per gestire visibilità ed obbligatorietà allenatore
function gestisciVisibilitaAllenatore(ruoloVal, selectId, containerId) {
    const container = document.getElementById(containerId);
    const select = document.getElementById(selectId);
    if (!container || !select) return;

    if (ruoloVal === 'non_combattente') {
        container.classList.add('epk-hidden');
        select.removeAttribute('required');
        select.value = '';
    } else {
        container.classList.remove('epk-hidden');
        select.setAttribute('required', 'required');
    }
}

// Restrizione opzioni ruolo in base alla tessera utente.
// WHITELIST: solo le tessere in questo array abilitano il ruolo combattente.
// Aggiornare qui quando si aggiungono nuovi tipi di tessera integrativa.
const TESSERE_COMBATTENTI = ['INTEGRATIVA_A', 'INTEGRATIVA_B', 'tessera_integrativa_a', 'tessera_integrativa_b'];

function applicaRestrizioneTessera(selectRuoloId) {
    const selectRuolo = document.getElementById(selectRuoloId);
    if (!selectRuolo) return;

    // Un utente può essere combattente SOLO se la sua tessera è nella whitelist.
    // Utenti con currentUserTessera === null (es. soci puri senza tessera sportiva)
    // vengono trattati come "non abilitati al combattimento".
    const isAbilitatoCombattente = currentUserTessera !== null && TESSERE_COMBATTENTI.includes(currentUserTessera);

    if (!isAbilitatoCombattente) {
        // Forza su non_combattente e disabilita l'opzione combattente
        selectRuolo.value = 'non_combattente';
        Array.from(selectRuolo.options).forEach(opt => {
            if (opt.value === 'combattente') {
                opt.disabled = true;
            }
        });
    } else {
        // Tessera integrativa: sblocca tutte le opzioni
        Array.from(selectRuolo.options).forEach(opt => {
            opt.disabled = false;
        });
    }
}

function onFaRuoloChange() {
    const ruolo = document.getElementById('fa-ruolo-combattimento').value;
    gestisciVisibilitaAllenatore(ruolo, 'fa-allenatore', 'container-fa-allenatore');
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
        await renderAbilitazioneAtleta();
        await caricaEventiDisponibili();

    } catch (err) {
        console.error("Errore rendering dashboard atleta:", err);
    }
}

async function syncAbilitazioneScab(ruolo, allenatoreId) {
    if (ruolo === 'combattente' && allenatoreId) {
        try {
            await supabaseClient.rpc('crea_richiesta_abilitazione', {
                p_anno: new Date().getFullYear(),
                p_soggetto_opzione_id: allenatoreId
            });
        } catch (err) {
            console.warn("Sync abilitazione SCAB silenziato:", err);
        }
    }
}

async function renderAbilitazioneAtleta() {
    const container = document.getElementById('epk-abilitazione-content');
    const annoBadge = document.getElementById('epk-abilitazione-anno-badge');
    if (!container || !currentUser) return;

    // Controlla se l'utente ha caricato il profilo ed è un combattente
    if (currentUserProfile && currentUserProfile.ruolo_combattimento !== 'combattente') {
        const card = document.getElementById('epk-abilitazione-card');
        if (card) card.classList.add('epk-hidden');
        return;
    }

    container.innerHTML = '<div style="text-align:center;padding:16px;">Caricamento stato abilitazione...</div>';

    try {
        const currentYear = new Date().getFullYear();
        let targetAnnoAbilitativo = currentYear;

        // 1. Cerca la pratica più recente in assoluto dell'utente
        const { data: latestAbl, error } = await supabaseClient
            .from('epika_scab_abilitazioni')
            .select(`
                *,
                allenatore:allenatore_opzione_id(valore),
                allievo:allievo_opzione_id(valore),
                validatore:validatore_opzione_id(valore)
            `)
            .eq('profilo_id', currentUser.id)
            .order('anno_abilitativo', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        let isScaduto = false;
        let isPrimaPraticaAssoluta = false;

        if (!latestAbl) {
            isPrimaPraticaAssoluta = true;
        } else {
            const oggi = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            if (latestAbl.data_scadenza < oggi) {
                isScaduto = true;
                // Se la pratica scaduta fa riferimento all'anno corrente (es. scaduta il 31/08), il rinnovo è per l'anno prossimo
                if (latestAbl.anno_abilitativo >= currentYear) {
                    targetAnnoAbilitativo = latestAbl.anno_abilitativo + 1;
                }
            } else {
                targetAnnoAbilitativo = latestAbl.anno_abilitativo;
            }
        }

        if (annoBadge) annoBadge.textContent = `ANNO ABILITATIVO ${targetAnnoAbilitativo}`;

        if (isPrimaPraticaAssoluta || isScaduto) {
            // AUTO-HEALING TRASPARENTE: Si attiva SOLO per la prima pratica assoluta (nuovi utenti o orfani)
            if (isPrimaPraticaAssoluta && currentUserProfile && currentUserProfile.ruolo_combattimento === 'combattente' && currentUserProfile.allenatore_id) {
                try {
                    const { error: rpcErr } = await supabaseClient.rpc('crea_richiesta_abilitazione', {
                        p_anno: targetAnnoAbilitativo,
                        p_soggetto_opzione_id: currentUserProfile.allenatore_id
                    });
                    if (!rpcErr) {
                        return await renderAbilitazioneAtleta();
                    }
                } catch (healErr) {
                    console.warn("Auto-healing abilitazione atterraggio fallito:", healErr);
                }
            }

            // Fallback: mostra il form di richiesta o rinnovo manuale
            const { data: soggetti } = await supabaseClient
                .from('epika_opzioni')
                .select('id, tipo, valore')
                .in('tipo', ['allenatore', 'scab_allievo_allenatore'])
                .eq('attivo', true)
                .order('valore', { ascending: true });

            const allenatori = (soggetti || []).filter(s => s.tipo === 'allenatore');
            const allievi = (soggetti || []).filter(s => s.tipo === 'scab_allievo_allenatore');

            let optsAll = allenatori.map(s => `<option value="${s.id}">${s.valore.toUpperCase()}</option>`).join('');
            let optsAllievi = allievi.map(s => `<option value="${s.id}">${s.valore.toUpperCase()}</option>`).join('');

            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                    <span style="background:#7f1d1d;color:#fca5a5;padding:4px 12px;font-size:10px;font-weight:bold;letter-spacing:0.1em;">⚔ NON ABILITATO${isScaduto ? ' — SCADUTO' : ''}</span>
                </div>
                <p style="font-size:11px;text-transform:uppercase;color:rgba(245,230,200,0.6);margin-bottom:16px;">
                    ${isScaduto ? `La tua abilitazione precedente è scaduta. Invia la richiesta per l'anno ${targetAnnoAbilitativo}.` : `Devi richiedere l'abilitazione per poter combattere per l'anno ${targetAnnoAbilitativo}.`}
                </p>
                <div style="display:flex;flex-direction:column;gap:12px;max-width:400px;">
                    <label class="epk-label">INDICA IL TUO ALLENATORE O ALLIEVO ALLENATORE *</label>
                    <select id="epk-abl-soggetto-select" class="epk-input">
                        <option value="" disabled selected>Seleziona...</option>
                        <optgroup label="ALLENATORI">${optsAll}</optgroup>
                        <optgroup label="ALLIEVI ALLENATORI">${optsAllievi}</optgroup>
                    </select>
                    <button class="epk-btn" onclick="inviaRichiestaAbilitazione(${targetAnnoAbilitativo})">
                        RICHIEDI ABILITAZIONE
                    </button>
                </div>
            `;

            // Pre-seleziona l'allenatore corrente nel select se presente nel profilo
            if (currentUserProfile && currentUserProfile.allenatore_id) {
                const selectEl = document.getElementById('epk-abl-soggetto-select');
                if (selectEl) selectEl.value = String(currentUserProfile.allenatore_id);
            }
        } else {
            // --- Stato: ABILITAZIONE ATTIVA — Mostra progress read-only ---
            const abl = latestAbl;
            const statiAllenatore = ['in_attesa','in_valutazione','video_fatto','video_in_valutazione'];
            const statiLabel = ['IN ATTESA','IN VALUTAZIONE','VIDEO FATTO','VIDEO IN VAL.'];
            const idxCorrente = statiAllenatore.indexOf(abl.stato_allenatore);

            const stepsHtml = statiAllenatore.map((s, i) => {
                const isActive = i === idxCorrente;
                const isDone = i < idxCorrente;
                const color = isDone ? 'var(--epk-gold-dim)' : isActive ? 'var(--epk-gold)' : 'rgba(245,230,200,0.2)';
                const weight = isActive ? 'bold' : 'normal';
                return `<div style="flex:1;text-align:center;font-size:9px;text-transform:uppercase;color:${color};font-weight:${weight};padding:6px 2px;border-bottom:3px solid ${isActive ? 'var(--epk-gold)' : isDone ? 'var(--epk-gold-dim)' : 'transparent'};">${statiLabel[i]}</div>`;
            }).join('');

            const semaforoMap = {
                giallo: { emoji: '🟡', testo: 'IN ATTESA / NON VISTO', color: '#f9a825' },
                rosso:  { emoji: '🔴', testo: 'VALIDAZIONE RESPINTA',  color: '#ef4444' },
                verde:  { emoji: '🟢', testo: 'VALIDAZIONE APPROVATA', color: '#22c55e' }
            };
            const sem = semaforoMap[abl.stato_validatore] || semaforoMap.giallo;

            const nomeAllenatore = abl.allenatore?.valore?.toUpperCase() || 'N/D';
            const nomeAllievo = abl.allievo?.valore ? ` (via ${abl.allievo.valore.toUpperCase()})` : '';
            const nomeValidatore = abl.validatore?.valore?.toUpperCase() || 'N/D';

            const anno2Cifre = String(targetAnnoAbilitativo).slice(-2);

            container.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">
                    <span style="background:#78350f;color:#fbbf24;padding:4px 12px;font-size:10px;font-weight:bold;letter-spacing:0.1em;">🛡 ${statiLabel[idxCorrente] || abl.stato_allenatore.toUpperCase()}</span>
                    <span style="font-size:10px;color:rgba(245,230,200,0.6);">abilitazione valida fino al 31/08/${anno2Cifre} . per i partecipanti a CM ${targetAnnoAbilitativo} l'abilitazione è valida fino al 31/12/${anno2Cifre}</span>
                </div>
                <div style="display:flex;margin-bottom:20px;border-bottom:1px solid var(--epk-gold-dim);overflow:hidden;">${stepsHtml}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.2);border:1px solid var(--epk-gold-dim);padding:12px 16px;">
                    <div>
                        <div style="font-size:9px;text-transform:uppercase;color:rgba(245,230,200,0.5);margin-bottom:4px;">RISPOSTA VALIDATORE</div>
                        <div style="font-size:12px;font-weight:bold;color:${sem.color};">${sem.emoji} ${sem.testo}</div>
                    </div>
                    <div style="font-size:10px;text-align:right;color:rgba(245,230,200,0.5);text-transform:uppercase;">
                        <div>Allenatore: <strong style="color:var(--epk-parchment);">${nomeAllenatore}${nomeAllievo}</strong></div>
                        <div>Validatore: <strong style="color:var(--epk-parchment);">${nomeValidatore}</strong></div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error('Errore renderAbilitazioneAtleta:', e);
        container.innerHTML = '<div style="color:#ef4444;font-size:11px;">Errore caricamento stato abilitazione.</div>';
    }
}

async function inviaRichiestaAbilitazione(anno) {
    const select = document.getElementById('epk-abl-soggetto-select');
    if (!select || !select.value) { alert('Seleziona un allenatore o allievo allenatore.'); return; }

    const soggettoId = parseInt(select.value);
    try {
        const { error } = await supabaseClient.rpc('crea_richiesta_abilitazione', {
            p_anno: anno,
            p_soggetto_opzione_id: soggettoId
        });
        if (error) throw error;
        await renderAbilitazioneAtleta(); // Ricarica
    } catch (e) {
        console.error('Errore invio richiesta abilitazione:', e);
        alert('Errore: ' + (e.message || 'impossibile inviare la richiesta.'));
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

function ottieniUrlMappa(evt) {
    if (!evt) return null;
    if (evt.link_mappa && evt.link_mappa.trim() !== '') {
        let link = evt.link_mappa.trim();
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            link = 'https://' + link;
        }
        return link;
    }
    if (evt.luogo && evt.luogo.trim() !== '') {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evt.luogo.trim())}`;
    }
    return null;
}

async function autoFillLinkMappaDaStorico() {
    const inputLuogo = document.getElementById('evt-luogo');
    const inputLinkMappa = document.getElementById('evt-link-mappa');
    if (!inputLuogo || !inputLinkMappa) return;
    
    if (inputLinkMappa.value.trim() !== '') return;
    
    const luogoVal = inputLuogo.value.trim();
    if (!luogoVal || luogoVal.length < 3) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('epika_eventi')
            .select('link_mappa')
            .ilike('luogo', `%${luogoVal}%`)
            .not('link_mappa', 'is', null)
            .neq('link_mappa', '')
            .order('data_inizio', { ascending: false })
            .limit(1);

        if (!error && data && data.length > 0 && data[0].link_mappa) {
            if (inputLinkMappa.value.trim() === '') {
                inputLinkMappa.value = data[0].link_mappa.trim();
            }
        }
    } catch (e) {
        console.error("Errore durante l'auto-completamento del link mappa:", e);
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
            const mapUrl = ottieniUrlMappa(evt);
            
            const luogoHtml = mapUrl 
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; font-weight: bold;" title="Apri posizione su Google Maps">📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'NON SPECIFICATO'} 🗺️</a>`
                : `📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'NON SPECIFICATO'}`;

            const navigaBtnHtml = (isIscritto && mapUrl)
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="epk-btn-secondary" style="border-color: var(--epk-gold); color: var(--epk-gold); display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 10px; text-decoration: none; border-radius: 4px; margin-top: 6px;">📍 NAVIGA / MAPPA 🗺️</a>`
                : '';

            const btnHtml = isIscritto 
                ? `<div style="display: flex; flex-direction: column; align-items: flex-end;"><button class="epk-btn-secondary" style="border-color: var(--epk-gold); color: var(--epk-gold); cursor: default;" disabled>ISCRITTO ✓</button>${navigaBtnHtml}</div>`
                : `<button class="epk-btn" onclick="apriModaleIscrizione('${evt.id}', '${evt.data_inizio}', '${evt.data_fine}')">ISCRIVITI</button>`;

            listContainer.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(201, 168, 76, 0.2); padding: 16px; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 16px; margin: 0;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="epk-headline" style="font-size: 14px; display: block; color: var(--epk-gold);">${evt.titolo.toUpperCase()}</span>
                        <span style="font-size: 10px; font-family: monospace; color: rgba(245, 230, 200, 0.6); uppercase">
                            📅 ${dataFormattata} | ${luogoHtml} | 💰 QUOTA: ${parseFloat(evt.costo || 0) > 0 ? `€${parseFloat(evt.costo).toFixed(2)}` : 'GRATUITO'}
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

// State per gli orari inline nel form di iscrizione
let currentOraArrivo = '';
let currentOraRipartenza = '';
let currentEventoDataInizio = '';
let currentEventoDataFine = '';
let currentEventoOraArrivoMin = '09:00';
let currentEventoOraRipartenzaMax = '18:00';

function aggiornaInlinerOrari() {
    // 1. Salva valori correnti se già digitati
    const inpArr = document.getElementById('epk-time-arrivo');
    const inpRip = document.getElementById('epk-time-ripartenza');
    if (inpArr && inpArr.value) currentOraArrivo = inpArr.value;
    if (inpRip && inpRip.value) currentOraRipartenza = inpRip.value;

    // 2. Rimuovi tutti i contenitori di orario esistenti nelle righe
    document.querySelectorAll('.epk-time-wrapper').forEach(el => el.remove());

    // 3. Gestione selezione ininterrotta
    const allCheckboxes = Array.from(document.querySelectorAll('input[name="giorni-presenza-check"]'));
    const checkedCheckboxes = allCheckboxes.filter(cb => cb.checked);

    if (checkedCheckboxes.length > 0) {
        const checkedDates = checkedCheckboxes.map(cb => cb.value).sort();
        const firstDate = checkedDates[0];
        const lastDate = checkedDates[checkedDates.length - 1];

        // Forza a true tutte le checkbox tra la prima e l'ultima data (intervallo ininterrotto)
        allCheckboxes.forEach(cb => {
            if (cb.value >= firstDate && cb.value <= lastDate) {
                cb.checked = true;
            }
        });
    }

    const finalChecked = allCheckboxes.filter(cb => cb.checked);
    if (finalChecked.length === 0) return;

    const checkedDates = finalChecked.map(cb => cb.value).sort();
    const firstDate = checkedDates[0];
    const lastDate = checkedDates[checkedDates.length - 1];

    // Se non abbiamo ancora orari in memoria, usiamo gli orari limite dell'evento
    if (!currentOraArrivo) currentOraArrivo = currentEventoOraArrivoMin || '09:00';
    if (!currentOraRipartenza) currentOraRipartenza = currentEventoOraRipartenzaMax || '18:00';

    // 4. Inserisci input per Primo Giorno (Ora Arrivo)
    const firstRowInput = document.querySelector(`input[name="giorni-presenza-check"][value="${firstDate}"]`);
    const firstRowLabel = firstRowInput ? firstRowInput.closest('label') : null;
    if (firstRowLabel) {
        const minAttr = (firstDate === currentEventoDataInizio && currentEventoOraArrivoMin) ? `min="${currentEventoOraArrivoMin}"` : '';
        const arrHtml = `
            <div class="epk-time-wrapper" style="margin-left: auto; display: inline-flex; align-items: center; gap: 6px;">
                <span style="font-size: 10px; color: var(--epk-gold); text-transform: uppercase;">Ora Arrivo:</span>
                <input type="time" id="epk-time-arrivo" class="epk-input" ${minAttr} value="${currentOraArrivo}" style="width: 105px; padding: 2px 6px; font-size: 11px;" required oninput="currentOraArrivo = this.value">
            </div>
        `;
        firstRowLabel.insertAdjacentHTML('beforeend', arrHtml);
    }

    // 5. Inserisci input per Ultimo Giorno (Ora Ripartenza)
    const lastRowInput = document.querySelector(`input[name="giorni-presenza-check"][value="${lastDate}"]`);
    const lastRowLabel = lastRowInput ? lastRowInput.closest('label') : null;
    if (lastRowLabel) {
        const maxAttr = (lastDate === currentEventoDataFine && currentEventoOraRipartenzaMax) ? `max="${currentEventoOraRipartenzaMax}"` : '';
        const ripHtml = `
            <div class="epk-time-wrapper" style="margin-left: ${firstDate === lastDate ? '8px' : 'auto'}; display: inline-flex; align-items: center; gap: 6px;">
                <span style="font-size: 10px; color: var(--epk-gold); text-transform: uppercase;">Ora Ripartenza:</span>
                <input type="time" id="epk-time-ripartenza" class="epk-input" ${maxAttr} value="${currentOraRipartenza}" style="width: 105px; padding: 2px 6px; font-size: 11px;" required oninput="currentOraRipartenza = this.value">
            </div>
        `;
        lastRowLabel.insertAdjacentHTML('beforeend', ripHtml);
    }
}

async function apriModaleIscrizione(eventoId, dataInizio, dataFine) {
    try {
        document.getElementById('epk-iscrizione-modal-evento-id').value = eventoId;
        
        currentEventoDataInizio = dataInizio;
        currentEventoDataFine = dataFine;
        currentEventoOraArrivoMin = '09:00';
        currentEventoOraRipartenzaMax = '18:00';
        currentOraArrivo = '';
        currentOraRipartenza = '';

        // Recupera dettagli dell'evento da Supabase
        const { data: evt } = await supabaseClient
            .from('epika_eventi')
            .select('titolo, luogo, link_mappa, ora_arrivo_min, ora_ripartenza_max')
            .eq('id', eventoId)
            .maybeSingle();

        if (evt) {
            if (evt.ora_arrivo_min) currentEventoOraArrivoMin = evt.ora_arrivo_min.slice(0, 5);
            if (evt.ora_ripartenza_max) currentEventoOraRipartenzaMax = evt.ora_ripartenza_max.slice(0, 5);
            
            const modalTitleEl = document.querySelector('#epk-iscrizione-modal h3');
            const mapUrl = ottieniUrlMappa(evt);
            const luogoHtml = mapUrl 
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--epk-gold); text-decoration: underline;">📍 ${evt.luogo ? evt.luogo.toUpperCase() : ''} 🗺️</a>`
                : (evt.luogo ? `📍 ${evt.luogo.toUpperCase()}` : '');
            
            if (modalTitleEl && evt.titolo) {
                modalTitleEl.innerHTML = `ISCRIZIONE A ${evt.titolo.toUpperCase()}` + (luogoHtml ? `<br><span style="font-size: 11px; font-family: monospace; font-weight: normal;">${luogoHtml}</span>` : '');
            }
        }

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
                <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; text-transform: uppercase; cursor: pointer; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.02);">
                    <input type="checkbox" name="giorni-presenza-check" value="${dateStr}" checked style="cursor: pointer;" onchange="aggiornaInlinerOrari()">
                    <span>${dataFormattata}</span>
                </label>
            `;
        });

        // Renderizza per la prima volta gli orari inline
        aggiornaInlinerOrari();

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
                coachSelect.disabled = true;
                coachSelect.style.pointerEvents = 'none';
            } else {
                coachSelect.disabled = false;
                coachSelect.style.pointerEvents = 'auto';
            }
        } else {
            combattenteFields.classList.add('epk-hidden');
        }

        // Resetta armi speciali
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
    const btn = document.querySelector('#epk-iscrizione-modal button[onclick="salvaIscrizioneDettagliata()"]');
    const originalText = btn ? btn.innerHTML : "CONFERMA ISCRIZIONE";
    
    const eventoId = document.getElementById('epk-iscrizione-modal-evento-id').value;
    const checkedGiorni = Array.from(document.querySelectorAll('input[name="giorni-presenza-check"]:checked')).map(cb => cb.value).sort();
    
    if (checkedGiorni.length === 0) {
        alert("Devi selezionare almeno un giorno di presenza.");
        return;
    }

    // Controllo sicurezza intervallo ininterrotto
    for (let i = 1; i < checkedGiorni.length; i++) {
        const prev = new Date(checkedGiorni[i - 1]);
        const curr = new Date(checkedGiorni[i]);
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays !== 1) {
            alert("Il periodo di presenza deve essere ininterrotto. Non è possibile deselezionare giorni intermedi.");
            return;
        }
    }

    const firstDate = checkedGiorni[0];
    const lastDate = checkedGiorni[checkedGiorni.length - 1];

    const oraArrivo = document.getElementById('epk-time-arrivo')?.value || currentOraArrivo;
    const oraRipartenza = document.getElementById('epk-time-ripartenza')?.value || currentOraRipartenza;

    if (!oraArrivo || !oraRipartenza) {
        alert("Inserisci l'orario di arrivo e di ripartenza.");
        return;
    }

    // Controlli vincoli orario min e max
    if (firstDate === currentEventoDataInizio && currentEventoOraArrivoMin && oraArrivo < currentEventoOraArrivoMin) {
        alert(`L'evento inizia alle ${currentEventoOraArrivoMin}. Per il primo giorno non puoi indicare un orario di arrivo precedente.`);
        return;
    }

    if (lastDate === currentEventoDataFine && currentEventoOraRipartenzaMax && oraRipartenza > currentEventoOraRipartenzaMax) {
        alert(`L'evento termina alle ${currentEventoOraRipartenzaMax}. Per l'ultimo giorno non puoi indicare un orario di ripartenza successivo.`);
        return;
    }

    const dataOraArrivo = `${firstDate}T${oraArrivo}:00`;
    const dataOraRipartenza = `${lastDate}T${oraRipartenza}:00`;

    if (new Date(dataOraRipartenza) <= new Date(dataOraArrivo)) {
        alert("La data e ora di ripartenza deve essere successiva alla data e ora di arrivo.");
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

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "Elaborazione...";
    }

    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        const session = sessionData?.session;
        const token = session?.access_token;
        
        if (!token) {
            throw new Error("Sessione scaduta. Effettua nuovamente il login.");
        }

        const apiBase = APP_CONFIG.API_BASE_URL || "";
        const response = await fetch(`${apiBase}/api/create-checkout-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                eventId: eventoId,
                giorni_presenza: checkedGiorni,
                data_ora_arrivo: new Date(dataOraArrivo).toISOString(),
                data_ora_ripartenza: new Date(dataOraRipartenza).toISOString(),
                dettagli: dettagliPayload
            })
        });

        const data = await response.json();

        if (response.status !== 200) {
            throw new Error(data.error || "Errore durante la creazione dell'iscrizione.");
        }

        if (data.free) {
            alert("Iscrizione registrata con successo!");
            chiudiModaleIscrizione();
            await caricaEventiDisponibili();
        } else if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error("Risposta del server non valida.");
        }

    } catch (e) {
        console.error("Errore salvataggio iscrizione:", e);
        alert(e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
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
        contabilita: document.getElementById('epk-adm-btn-contabilita'),
        logistica: document.getElementById('epk-adm-btn-logistica'),
        marketing: document.getElementById('epk-adm-btn-marketing')
    };

    // Nascondi tutto inizialmente
    Object.values(allBtns).forEach(btn => { if (btn) btn.classList.add('epk-hidden'); });

    // Definisci quali tab sono visibili in base alla vista
    let visibleTabs = [];
    if (viewMode === 'admin' && isEpikaAdmin) {
        visibleTabs = ['dash', 'direttivi', 'scab', 'gruppi', 'popoli', 'eventi', 'generale', 'contabilita'];
    } else if (viewMode === 'direttivo_epika') {
        visibleTabs = ['dash', 'direttivi', 'scab', 'gruppi', 'popoli', 'eventi', 'generale'];
    } else if (viewMode === 'direttivo_scab') {
        visibleTabs = ['scab', 'eventi'];
    } else if (viewMode === 'direttivo_logistica') {
        visibleTabs = ['eventi', 'logistica'];
    } else if (viewMode === 'direttivo_marketing') {
        visibleTabs = ['eventi', 'marketing'];
    } else if (viewMode === 'direttivo_sibis') {
        visibleTabs = ['dash'];
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
    if (tab === 'contabilita' && !isEpikaAdmin) {
        console.warn("Accesso negato alla Contabilità per l'utente corrente.");
        tab = 'dash';
    }

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
    } else if (tab === 'contabilita' && isEpikaAdmin) {
        renderContabilitaAdmin();
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
            let mancanti = [];
            let isAutoCompiled = false;
            
            if (g.id === 5) {
                // Capi Gruppo (auto-compilato)
                isAutoCompiled = true;
                gruppiStorici.forEach(grp => {
                    if (!grp.attivo) return;
                    if (grp.capogruppo_id) {
                        const m = tesseratiCache.find(t => t.id === grp.capogruppo_id);
                        if (m) {
                            membri.push({
                                ...m,
                                gruppoRepresentedName: grp.nome
                            });
                        } else {
                            mancanti.push({ nome: grp.nome, ruolo: "Capo Gruppo" });
                        }
                    } else {
                        mancanti.push({ nome: grp.nome, ruolo: "Capo Gruppo" });
                    }
                });
            } else if (g.nome === 'Gruppo Vice Capi Gruppo') {
                // Vice Capi Gruppo (auto-compilato)
                isAutoCompiled = true;
                gruppiStorici.forEach(grp => {
                    if (!grp.attivo) return;
                    if (grp.vice_capogruppo_id) {
                        const m = tesseratiCache.find(t => t.id === grp.vice_capogruppo_id);
                        if (m) {
                            membri.push({
                                ...m,
                                gruppoRepresentedName: grp.nome
                            });
                        } else {
                            mancanti.push({ nome: grp.nome, ruolo: "Vice Capo Gruppo" });
                        }
                    } else {
                        mancanti.push({ nome: grp.nome, ruolo: "Vice Capo Gruppo" });
                    }
                });
            } else if (g.id === 6) {
                // Responsabili Iscrizioni (auto-compilato)
                isAutoCompiled = true;
                gruppiStorici.forEach(grp => {
                    if (!grp.attivo) return;
                    if (grp.responsabile_iscrizioni_id) {
                        const m = tesseratiCache.find(t => t.id === grp.responsabile_iscrizioni_id);
                        if (m) {
                            membri.push({
                                ...m,
                                gruppoRepresentedName: grp.nome
                            });
                        } else {
                            mancanti.push({ nome: grp.nome, ruolo: "Resp. Iscrizioni" });
                        }
                    } else {
                        mancanti.push({ nome: grp.nome, ruolo: "Resp. Iscrizioni" });
                    }
                });
            } else {
                // Standard manuale
                membri = membriPerGruppo[g.id] || [];
            }

            let membriHTML = '';
            
            if (membri.length === 0 && mancanti.length === 0) {
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
                        <div class="direttivo-member-row" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(251,191,36,0.1); padding: 8px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px;">
                            <div>
                                <span class="epk-headline direttivo-member-battle" style="font-size: 12px; color: var(--epk-gold);">${m.nome_di_battaglia}${rappresentatoText}</span>
                                <span class="direttivo-member-real" style="font-size: 9px; display: block; color: rgba(245,230,200,0.5);">Real: ${nomeReale.toUpperCase()}</span>
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

                // Accoda gli slot per i gruppi storici sprovvisti di responsabile
                mancanti.forEach(item => {
                    membriHTML += `
                        <div class="direttivo-member-row" style="background: rgba(0,0,0,0.15); border: 1px dashed rgba(255,255,255,0.15); padding: 8px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px; opacity: 0.65;">
                            <div>
                                <span class="epk-headline direttivo-member-battle" style="font-size: 12px; color: rgba(245,230,200,0.45);">${item.nome.toUpperCase()}</span>
                                <span class="direttivo-member-real" style="font-size: 9px; display: block; color: rgba(245,230,200,0.3);">GRUPPO STORICO</span>
                            </div>
                            <div style="font-size: 9px; font-weight: bold; color: rgba(239, 68, 68, 0.7); border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 6px; border-radius: 2px; text-transform: uppercase; font-style: italic;">
                                DA ASSEGNARE
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

            let titleBadgeHTML = '';
            if (isAutoCompiled && mancanti.length > 0) {
                titleBadgeHTML = ` <span style="font-size: 9px; color: #f87171; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); padding: 1px 6px; border-radius: 2px; font-weight: normal; margin-left: 6px;">⚠️ ${mancanti.length} DA ASSEGNARE</span>`;
            }

            const containerStyle = isAutoCompiled 
                ? 'flex-grow: 1; padding-right: 4px;' 
                : 'flex-grow: 1; max-height: 220px; overflow-y: auto; padding-right: 4px;';

            container.innerHTML += `
                <div class="epk-card direttivo-group-card" style="display: flex; flex-direction: column; gap: 12px;">
                    <h3 class="epk-headline direttivo-group-title" style="margin-top: 0; font-size: 14px; border-bottom: 1px solid var(--epk-gold-dim); padding-bottom: 6px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                        <span>${g.nome.toUpperCase()}</span>
                        ${titleBadgeHTML}
                    </h3>
                    <div style="${containerStyle}">
                        ${membriHTML}
                    </div>
                    ${actionButtonHTML}
                </div>`;
        });

        // Applica eventuale filtro attivo
        filtraDirettiviInverso();

    } catch (err) {
        console.error("Errore renderTesseratiNomineInverso:", err);
        container.innerHTML = '<p style="font-size: 11px; text-transform: uppercase; color: red;">Errore durante il caricamento delle nomine.</p>';
    }
}

// Logica per il Filtraggio Live dei Direttivi (Ricerca Globale)
function filtraDirettiviInverso() {
    const input = document.getElementById('adm-direttivi-global-search');
    if (!input) return;
    const searchVal = input.value.trim().toUpperCase();
    const cards = document.querySelectorAll('.direttivo-group-card');

    cards.forEach(card => {
        const titleEl = card.querySelector('.direttivo-group-title');
        const groupTitle = titleEl ? titleEl.textContent.toUpperCase() : '';
        const isGroupMatch = searchVal !== '' && groupTitle.includes(searchVal);

        const rows = card.querySelectorAll('.direttivo-member-row');
        let visibleCount = 0;

        rows.forEach(row => {
            const battleEl = row.querySelector('.direttivo-member-battle');
            const realEl = row.querySelector('.direttivo-member-real');
            const battleText = battleEl ? battleEl.textContent.toUpperCase() : '';
            const realText = realEl ? realEl.textContent.toUpperCase() : '';

            if (isGroupMatch || !searchVal || battleText.includes(searchVal) || realText.includes(searchVal)) {
                row.style.display = 'flex';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        if (!searchVal || isGroupMatch || visibleCount > 0) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
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
        scabAbbinamentiMap = abbinamentiMap;

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


// Helper per il calcolo dei contatori di abbinamento nelle strutture attive
function calcolaContatoriAbbinamentiSCAB(strutture, abbinamentiMap) {
    const contatori = {};
    const increment = (id) => {
        if (id === null || id === undefined || id === '') return;
        const strId = String(id);
        contatori[strId] = (contatori[strId] || 0) + 1;
    };

    (strutture || []).forEach(s => {
        if (!s.attivo) return; // Considera solo le strutture attive
        const abb = abbinamentiMap ? abbinamentiMap[s.id] : null;
        if (!abb) return;

        increment(abb.validatore_id);
        increment(abb.allenatore_ref_id);
        increment(abb.allievo_ref_id);
        if (Array.isArray(abb.allenatori_co_ids)) {
            abb.allenatori_co_ids.forEach(increment);
        }
        if (Array.isArray(abb.allievi_ids)) {
            abb.allievi_ids.forEach(increment);
        }
    });
    return contatori;
}

// Modifica variabili globali di binding
let currentBindingOpzioneId = null;
let currentBindingSoggettoNome = "";
let currentBindingTipo = "";

// A — Gestione Ruoli (CRUD con Binding Account e Badge Abbinamenti)
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

        const contatori = calcolaContatoriAbbinamentiSCAB(scabStrutture, scabAbbinamentiMap);

        (soggetti || []).forEach(s => {
            const count = contatori[String(s.id)] || 0;
            const activeText = s.attivo ? 'Dis' : 'Att';
            const activeStyle = s.attivo ? 'color: #f97316; border-color: rgba(249, 115, 22, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);';
            
            // Icona di binding a seconda se utente_id è presente
            const isBound = !!s.utente_id;
            const bindingIconColor = isBound ? '#22c55e' : '#888';
            const bindingTitle = isBound ? 'Account Reale Collegato (Clicca per modificare/scollegare)' : 'Nessun Account Collegato (Clicca per collegare)';
            
            // Badge Abbinamenti SCAB
            let badgeAbbinamentoHtml = '';
            if (count > 0) {
                badgeAbbinamentoHtml = `
                    <span style="font-size: 10px; font-weight: bold; background: rgba(34, 197, 94, 0.18); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;" title="Abbinato in ${count} strutture SCAB attive">
                        🔗 ${count}
                    </span>`;
            } else {
                badgeAbbinamentoHtml = `
                    <span style="font-size: 10px; color: #64748b; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;" title="Nessun abbinamento attivo in strutture SCAB">
                        0
                    </span>`;
            }

            const html = `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(251, 191, 36, 0.1); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 13px; font-weight: bold; ${s.attivo ? '' : 'text-decoration: line-through; opacity: 0.5;'}">${s.valore.toUpperCase()}</span>
                        ${badgeAbbinamentoHtml}
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

            const mapUrl = ottieniUrlMappa(evt);
            const mappaBadge = mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--epk-gold); text-decoration: underline;" title="Apri posizione Google Maps">🗺️ MAPPA</a>` : '';

            const toggleBtnHtml = isReadOnly() ? '' : `<button class="epk-btn-secondary" style="font-size: 9px; padding: 6px 12px; ${statusStyle}" onclick="toggleStatoEvento('${evt.id}', ${evt.attivo})">${statusText}</button>`;
            const deleteBtnHtml = isReadOnly() ? '' : `<button class="epk-btn-secondary" style="font-size: 9px; padding: 6px 12px; color: #ff4d4d; border-color: rgba(255, 77, 77, 0.4);" onclick="cancellaEvento('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">CANCELLA</button>`;
            const presenzeBtnText = isReadOnly() ? 'VEDI PRESENZE' : 'GESTISCI PRESENZE';
            const esercitiBtnHtml = isReadOnly() ? '' : `<button class="epk-btn" style="padding: 6px 12px; font-size: 9px; background: #581c87; border-color: #a855f7;" onclick="mostraPannelloEserciti('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">GESTIONE ESERCITI</button>`;

            container.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); padding: 16px; display: flex; flex-direction: column; gap: 12px; margin: 0;">
                     <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <span class="epk-headline" style="font-size: 14px; color: var(--epk-gold);">${evt.titolo.toUpperCase()}</span>
                            <span style="font-size: 10px; font-family: monospace; display: block; color: rgba(245, 230, 200, 0.5); uppercase; margin-top: 2px;">
                                📅 ${dataFormattata} | ⏰ INIZIO: ${evt.ora_arrivo_min ? evt.ora_arrivo_min.slice(0, 5) : '09:00'} - FINE: ${evt.ora_ripartenza_max ? evt.ora_ripartenza_max.slice(0, 5) : '18:00'} | 📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'} ${mappaBadge ? '| ' + mappaBadge : ''} | TIPO: ${evt.tipo_evento.toUpperCase().replace('_', ' ')} | 💰 COSTO: €${parseFloat(evt.costo || 0).toFixed(2)}
                            </span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="epk-btn" style="padding: 6px 12px; font-size: 9px; background: #1e3a8a; border-color: #3b82f6;" onclick="mostraDashboardEvento('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}', '${evt.data_inizio}', '${evt.data_fine}')">DASHBOARD</button>
                            <button class="epk-btn" style="padding: 6px 12px; font-size: 9px;" onclick="mostraPannelloPresenze('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">${presenzeBtnText}</button>
                            ${esercitiBtnHtml}
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
    document.getElementById('evt-costo').value = '0.00';
    if (document.getElementById('evt-ora-arrivo-min')) document.getElementById('evt-ora-arrivo-min').value = '09:00';
    if (document.getElementById('evt-ora-ripartenza-max')) document.getElementById('evt-ora-ripartenza-max').value = '18:00';
    if (document.getElementById('evt-link-mappa')) document.getElementById('evt-link-mappa').value = '';
}

function nascondiFormCreaEvento() {
    document.getElementById('adm-evento-form-container').classList.add('epk-hidden');
}

async function salvaEventoStorico() {
    if (isReadOnly()) return;
    const titolo = document.getElementById('evt-titolo').value.trim();
    const luogo = document.getElementById('evt-luogo').value.trim();
    const linkMappaInput = document.getElementById('evt-link-mappa');
    const linkMappa = linkMappaInput ? linkMappaInput.value.trim() : '';
    const dataInizio = document.getElementById('evt-data-inizio').value;
    const dataFine = document.getElementById('evt-data-fine').value;
    const tipo = document.getElementById('evt-tipo').value;
    const costo = parseFloat(document.getElementById('evt-costo').value) || 0;
    const oraArrivoMin = document.getElementById('evt-ora-arrivo-min') ? document.getElementById('evt-ora-arrivo-min').value : '09:00';
    const oraRipartenzaMax = document.getElementById('evt-ora-ripartenza-max') ? document.getElementById('evt-ora-ripartenza-max').value : '18:00';
    const descrizione = document.getElementById('evt-descrizione').value.trim();

    if (!titolo || !luogo || !dataInizio || !dataFine || !tipo) {
        alert("Compila tutti i campi obbligatori dell'evento.");
        return;
    }

    if (linkMappa) {
        if (linkMappa.toLowerCase().includes('<iframe')) {
            alert("Sembra che tu abbia incollato il codice HTML di incorporamento (iframe). Per favore incolla solo il link di condivisione di Google Maps (es. https://goo.gl/maps/... o https://maps.app.goo.gl/...).");
            return;
        }
        try {
            const urlObj = new URL(linkMappa.startsWith('http') ? linkMappa : `https://${linkMappa}`);
            const host = urlObj.hostname.toLowerCase();
            if (!host.includes('google') && !host.includes('goo.gl')) {
                alert("Il link della mappa deve essere un URL valido di Google Maps (es. https://goo.gl/maps/... o https://maps.app.goo.gl/...)");
                return;
            }
        } catch (e) {
            alert("Il formato del link Google Maps inserito non è un URL valido.");
            return;
        }
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
                link_mappa: linkMappa || null,
                data_inizio: dataInizio,
                data_fine: dataFine,
                tipo_evento: tipo,
                costo: costo,
                ora_arrivo_min: oraArrivoMin || '09:00',
                ora_ripartenza_max: oraRipartenzaMax || '18:00',
                descrizione: descrizione || null
            });

        if (error) throw error;

        alert("Evento salvato con successo!");
        nascondiFormCreaEvento();
        
        // Reset form inputs
        document.getElementById('evt-titolo').value = '';
        document.getElementById('evt-luogo').value = '';
        if (document.getElementById('evt-link-mappa')) document.getElementById('evt-link-mappa').value = '';
        document.getElementById('evt-descrizione').value = '';
        document.getElementById('evt-costo').value = '0.00';

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

function apriPannelloEsclusivoAdmin(targetPanelId) {
    const PANNELLI_EVENTO = [
        'adm-presenze-panel', 
        'adm-dashboard-evento-panel', 
        'adm-eserciti-panel'
    ];
    PANNELLI_EVENTO.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('epk-hidden');
    });
    if (targetPanelId) {
        const target = document.getElementById(targetPanelId);
        if (target) {
            target.classList.remove('epk-hidden');
            target.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

// D — Conferma Presenze Evento
async function mostraPannelloPresenze(eventoId, eventoTitolo) {
    apriPannelloEsclusivoAdmin('adm-presenze-panel');
    document.getElementById('adm-presenze-titolo').textContent = `CONFERMA PRESENZE: ${eventoTitolo.toUpperCase()}`;
    document.getElementById('adm-presenze-evento-id').value = eventoId;

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
    apriPannelloEsclusivoAdmin(null);
}

let dashboardIscrittiCache = [];

async function mostraDashboardEvento(eventoId, eventoTitolo, dataInizio, dataFine) {
    apriPannelloEsclusivoAdmin('adm-dashboard-evento-panel');
    document.getElementById('adm-dashboard-evento-titolo').textContent = `STATISTICHE & DETTAGLI EVENTO: ${eventoTitolo.toUpperCase()}`;
    document.getElementById('adm-dashboard-evento-id').value = eventoId;
    document.getElementById('evt-dashboard-search').value = '';

    const tableBody = document.getElementById('evt-dashboard-table-body');
    tableBody.innerHTML = '<tr><td colspan="8" style="padding: 15px; text-align: center; text-transform: uppercase; color: gray;">Caricamento dati...</td></tr>';

    try {
        // 1. Carica iscrizioni con profili (ordinate per data_iscrizione decrescente)
        const { data: iscritti, error: errIsc } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .select(`
                id,
                data_iscrizione,
                utente_id,
                giorni_presenza,
                dettagli,
                profilo:epika_profili(nome_di_battaglia, ruolo_combattimento, gruppo_storico_id)
            `)
            .eq('evento_id', eventoId)
            .order('data_iscrizione', { ascending: false })
            .order('id', { ascending: false });

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
                giorni_raw: giorni,
                coach: coachNome,
                armatura: arm,
                arciere: arc,
                armi_speciali: armiS,
                descrizione_sperimentali: descSper,
                data_iscrizione: isc.data_iscrizione
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

        popolaFiltriDinamiciDashboard(giorniPresenzaMappa);
        filtraPartecipantiDashboard();

    } catch (e) {
        console.error("Errore caricamento dashboard evento:", e);
        tableBody.innerHTML = '<tr><td colspan="8" style="padding: 15px; text-align: center; text-transform: uppercase; color: red;">Errore caricamento dati.</td></tr>';
    }
}

function nascondiDashboardEvento() {
    apriPannelloEsclusivoAdmin(null);
}

function popolaFiltriDinamiciDashboard(giorniPresenzaMappa) {
    // Gruppi
    const gruppi = [...new Set(dashboardIscrittiCache.map(i => i.gruppo))].sort();
    const selGruppo = document.getElementById('evt-dashboard-filter-gruppo');
    if (selGruppo) {
        selGruppo.innerHTML = '<option value="">TUTTI I GRUPPI</option>' + 
            gruppi.map(g => `<option value="${g}">${g.toUpperCase()}</option>`).join('');
    }

    // Ruoli
    const ruoli = [...new Set(dashboardIscrittiCache.map(i => i.ruolo))].sort();
    const selRuolo = document.getElementById('evt-dashboard-filter-ruolo');
    if (selRuolo) {
        selRuolo.innerHTML = '<option value="">TUTTI I RUOLI</option>' + 
            ruoli.map(r => `<option value="${r}">${r === 'combattente' ? 'COMBATTENTE' : 'NON COMBATTENTE'}</option>`).join('');
    }

    // Date presenze
    const selGiorno = document.getElementById('evt-dashboard-filter-giorno');
    if (selGiorno) {
        const dateISO = Object.keys(giorniPresenzaMappa || {}).sort();
        selGiorno.innerHTML = '<option value="">TUTTE LE DATE</option>' + 
            dateISO.map(d => `<option value="${d}">${formattaData(d)}</option>`).join('');
    }

    // Allenatori
    const coachList = [...new Set(dashboardIscrittiCache.filter(i => i.ruolo === 'combattente' && i.coach && i.coach !== 'N/D').map(i => i.coach))].sort();
    const selCoach = document.getElementById('evt-dashboard-filter-allenatore');
    if (selCoach) {
        selCoach.innerHTML = '<option value="">TUTTI GLI ALLENATORI</option>' + 
            coachList.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
    }

    const selArciere = document.getElementById('evt-dashboard-filter-arciere');
    if (selArciere) selArciere.value = '';
}

function resetFiltriDashboardEvento() {
    const search = document.getElementById('evt-dashboard-search');
    if (search) search.value = '';
    const fGruppo = document.getElementById('evt-dashboard-filter-gruppo');
    if (fGruppo) fGruppo.value = '';
    const fRuolo = document.getElementById('evt-dashboard-filter-ruolo');
    if (fRuolo) fRuolo.value = '';
    const fGiorno = document.getElementById('evt-dashboard-filter-giorno');
    if (fGiorno) fGiorno.value = '';
    const fCoach = document.getElementById('evt-dashboard-filter-allenatore');
    if (fCoach) fCoach.value = '';
    const fArciere = document.getElementById('evt-dashboard-filter-arciere');
    if (fArciere) fArciere.value = '';
    filtraPartecipantiDashboard();
}

function filtraPartecipantiDashboard() {
    const query = (document.getElementById('evt-dashboard-search')?.value || '').toLowerCase().trim();
    const fGruppo = document.getElementById('evt-dashboard-filter-gruppo')?.value || '';
    const fRuolo = document.getElementById('evt-dashboard-filter-ruolo')?.value || '';
    const fGiorno = document.getElementById('evt-dashboard-filter-giorno')?.value || '';
    const fCoach = document.getElementById('evt-dashboard-filter-allenatore')?.value || '';
    const fArciere = document.getElementById('evt-dashboard-filter-arciere')?.value || '';

    const tableBody = document.getElementById('evt-dashboard-table-body');
    tableBody.innerHTML = '';

    const filtrati = dashboardIscrittiCache.filter(i => {
        const matchText = !query || 
            i.nome_storico.toLowerCase().includes(query) ||
            i.nome_reale.toLowerCase().includes(query);

        const matchGruppo = !fGruppo || i.gruppo === fGruppo;
        const matchRuolo = !fRuolo || i.ruolo === fRuolo;
        const matchGiorno = !fGiorno || (Array.isArray(i.giorni_raw) && i.giorni_raw.includes(fGiorno));
        const matchCoach = !fCoach || i.coach === fCoach;

        let matchArciere = true;
        if (fArciere === 'si') {
            matchArciere = i.ruolo === 'combattente' && i.arciere !== 'nessuno';
        } else if (fArciere === 'no') {
            matchArciere = i.ruolo !== 'combattente' || i.arciere === 'nessuno';
        }

        return matchText && matchGruppo && matchRuolo && matchGiorno && matchCoach && matchArciere;
    });

    const countBadge = document.getElementById('evt-dashboard-filter-count');
    if (countBadge) {
        countBadge.textContent = `MOSTRATI: ${filtrati.length} / ${dashboardIscrittiCache.length}`;
    }

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
                statoLabel = ' <span style="font-size: 9px; padding: 2px 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); margin-left: 6px; border-radius: 3px;">SOSPESO</span>';
            } else if (g.stato === 'cancellato') {
                statoLabel = ' <span style="font-size: 9px; padding: 2px 4px; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); margin-left: 6px; border-radius: 3px;">CANCELLATO</span>';
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
        oldStatoDettaglioGruppo = g.stato || 'ufficiale';
        
        const dateInput = document.getElementById('det-nuovo-stato-data');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        
        await caricaStoricoStatiGruppo(gruppoId);
        await caricaStoricoRuoliGruppo(gruppoId);
        
    } catch (e) {
        console.error("Errore caricamento dettaglio gruppo:", e);
        alert("Errore durante il caricamento del dettaglio gruppo.");
    }
}

let oldStatoDettaglioGruppo = null;

async function caricaStoricoStatiGruppo(gruppoId) {
    const tbody = document.getElementById('det-storico-stati-table-body');
    const badgeContainer = document.getElementById('det-badge-stato-corrente');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px; color: gray;">Caricamento storico...</td></tr>';
    
    try {
        const { data: storico, error } = await supabaseClient
            .from('epika_gruppi_storico_stati')
            .select('*')
            .eq('gruppo_id', gruppoId)
            .order('data_inizio', { ascending: false })
            .order('id', { ascending: false });
            
        if (error) throw error;
        
        if (!storico || storico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 8px; color: gray;">Nessun cambio di stato registrato.</td></tr>';
            if (badgeContainer) {
                badgeContainer.innerHTML = '<span class="epk-version-badge" style="margin: 0; font-size: 10px; padding: 4px 8px; border-color: gray; color: gray;">N/D</span>';
            }
            return;
        }
        
        // Il primo record in alto è lo STATO ATTUALE
        const topState = storico[0];
        let topColor = '#22c55e';
        let topLabel = (topState.stato || '').toUpperCase().replace('_', ' ');
        if (topState.stato === 'in_formazione') topColor = '#3b82f6';
        else if (topState.stato === 'sospeso') topColor = '#f59e0b';
        else if (topState.stato === 'cancellato') { topColor = '#ef4444'; topLabel = 'CANCELLATO / SCIOLTO'; }

        if (badgeContainer) {
            badgeContainer.innerHTML = `<span class="epk-version-badge" style="margin: 0; font-size: 10px; padding: 4px 8px; border-color: ${topColor}; color: ${topColor}; font-weight: bold;">${topLabel}</span>`;
        }

        tbody.innerHTML = '';
        storico.forEach((s, idx) => {
            const isTop = idx === 0;
            let statoFormatted = (s.stato || '').toUpperCase().replace('_', ' ');
            if (s.stato === 'cancellato') statoFormatted = 'CANCELLATO / SCIOLTO';
            const inizioStr = s.data_inizio ? new Date(s.data_inizio).toLocaleDateString('it-IT') : 'N/D';
            
            let colorStato = '#ffffff';
            if (s.stato === 'ufficiale') colorStato = '#22c55e';
            else if (s.stato === 'in_formazione') colorStato = '#3b82f6';
            else if (s.stato === 'sospeso') colorStato = '#f59e0b';
            else if (s.stato === 'cancellato') colorStato = '#ef4444';

            const bgStyle = isTop ? 'background: rgba(251, 191, 36, 0.08); font-weight: bold;' : 'border-bottom: 1px solid rgba(255,255,255,0.05);';
            const attualeBadge = isTop ? '<span style="font-size: 8px; background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #4ade80; padding: 2px 5px; border-radius: 3px; margin-left: 6px; font-weight: bold;">ATTUALE</span>' : '';
            const deleteBtn = (isTop && storico.length > 1) ? `<button onclick="eliminaUltimaVariazioneStato(${s.id}, ${gruppoId})" class="epk-btn-secondary" style="font-size: 9px; padding: 2px 6px; color: #ef4444; border-color: #ef4444;" title="Elimina questa variazione errata">🗑️ ELIMINA</button>` : '-';

            const tr = document.createElement('tr');
            tr.style = bgStyle;
            tr.innerHTML = `
                <td style="padding: 6px; color: ${colorStato}; font-weight: bold;">${statoFormatted}${attualeBadge}</td>
                <td style="padding: 6px;">${inizioStr}</td>
                <td style="padding: 6px; color: #aaa; font-size: 9px;">${s.note || '-'}</td>
                <td style="padding: 6px; text-align: center;">${deleteBtn}</td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (e) {
        console.error("Errore caricamento storico stati:", e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red; padding: 8px;">Errore caricamento storico stati.</td></tr>';
    }
}

async function aggiungiVariazioneStatoGruppo() {
    const gruppoId = parseInt(document.getElementById('det-gruppo-id').value);
    const nuovoStato = document.getElementById('det-nuovo-stato-tipo').value;
    const dataInizio = document.getElementById('det-nuovo-stato-data').value;
    const note = (document.getElementById('det-nuovo-stato-note').value || '').trim();

    if (!gruppoId) {
        alert("Nessun gruppo selezionato.");
        return;
    }
    if (!dataInizio) {
        alert("Inserisci la data di inizio della variazione.");
        return;
    }

    try {
        const { error: insErr } = await supabaseClient
            .from('epika_gruppi_storico_stati')
            .insert([{
                gruppo_id: gruppoId,
                stato: nuovoStato,
                data_inizio: dataInizio,
                note: note || `Variazione a ${nuovoStato.toUpperCase().replace('_', ' ')}`
            }]);

        if (insErr) throw insErr;

        document.getElementById('det-nuovo-stato-note').value = '';

        await sincronizzaStatoAttualeGruppo(gruppoId);
        await caricaLookupDati();
        await apriDettaglioGruppo(gruppoId);
        alert("Nuova variazione di stato registrata con successo!");

    } catch (e) {
        console.error("Errore inserimento variazione stato:", e);
        alert("Errore durante la registrazione della variazione di stato: " + e.message);
    }
}

async function eliminaUltimaVariazioneStato(recordId, gruppoId) {
    if (!confirm("Sei sicuro di voler eliminare questa variazione di stato? Il gruppo ripristinerà lo stato precedente.")) {
        return;
    }

    try {
        const { error: delErr } = await supabaseClient
            .from('epika_gruppi_storico_stati')
            .delete()
            .eq('id', recordId);

        if (delErr) throw delErr;

        await sincronizzaStatoAttualeGruppo(gruppoId);
        await caricaLookupDati();
        await apriDettaglioGruppo(gruppoId);
        alert("Variazione eliminata con successo. Stato ripristinato.");

    } catch (e) {
        console.error("Errore eliminazione variazione stato:", e);
        alert("Errore durante l'eliminazione della variazione di stato: " + e.message);
    }
}

async function sincronizzaStatoAttualeGruppo(gruppoId) {
    try {
        const { data: ultimiStati, error: fetchErr } = await supabaseClient
            .from('epika_gruppi_storico_stati')
            .select('*')
            .eq('gruppo_id', gruppoId)
            .order('data_inizio', { ascending: false })
            .order('id', { ascending: false })
            .limit(1);

        if (fetchErr) throw fetchErr;

        if (ultimiStati && ultimiStati.length > 0) {
            const topState = ultimiStati[0];
            const isCancellato = topState.stato === 'cancellato';

            await supabaseClient
                .from('epika_gruppi_storici')
                .update({
                    stato: topState.stato,
                    data_stato: topState.data_inizio,
                    attivo: !isCancellato
                })
                .eq('id', gruppoId);
        }
    } catch (e) {
        console.error("Errore sincronizzazione stato attuale gruppo:", e);
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
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 8px;">Caricamento storico...</td></tr>';
    
    try {
        const { data: storico, error } = await supabaseClient
            .from('epika_storico_ruoli_gruppi')
            .select('*')
            .eq('gruppo_storico_id', gruppoId)
            .order('data_inizio', { ascending: false });
            
        if (error) throw error;
        
        if (!storico || storico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 8px; color: gray;">Nessun mandato storico registrato per questo gruppo.</td></tr>';
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
            
            const rawInizio = s.data_inizio ? s.data_inizio.split('T')[0] : '';
            const rawFine = s.data_fine ? s.data_fine.split('T')[0] : '';
            const isActive = !s.data_fine;

            let azioniHtml = `
                <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                    <button class="epk-btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="abilitaModificaMandato(${s.id}, '${rawInizio}', '${rawFine}', ${gruppoId}, ${isActive})" title="Modifica date mandato">✏️</button>
            `;
            if (isActive) {
                azioniHtml += `
                    <button class="epk-btn-secondary" style="padding: 2px 6px; font-size: 11px; opacity: 0.4; cursor: not-allowed;" disabled title="Impossibile eliminare un mandato attivo. Cambia prima il ruolo dal pannello superiore.">🗑️</button>
                </div>`;
            } else {
                azioniHtml += `
                    <button class="epk-btn-secondary" style="padding: 2px 6px; font-size: 11px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" onclick="eliminaMandatoStorico(${s.id}, ${gruppoId})" title="Elimina mandato chiuso">🗑️</button>
                </div>`;
            }
            
            const tr = document.createElement('tr');
            tr.id = `storico-row-${s.id}`;
            tr.style = "border-bottom: 1px solid rgba(255,255,255,0.05);";
            tr.innerHTML = `
                <td style="padding: 8px;">${nomeTesserato}</td>
                <td style="padding: 8px; color: var(--epk-gold);">${ruoloFormatted}</td>
                <td style="padding: 8px;" id="cell-inizio-${s.id}">${inizioStr}</td>
                <td style="padding: 8px; ${s.data_fine ? '' : 'color: #22c55e; font-weight: bold;'}" id="cell-fine-${s.id}">${fineStr}</td>
                <td style="padding: 8px; text-align: center;" id="cell-azioni-${s.id}">${azioniHtml}</td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (e) {
        console.error("Errore caricamento storico ruoli:", e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red; padding: 8px;">Errore caricamento storico.</td></tr>';
    }
}

function abilitaModificaMandato(id, dataInizio, dataFine, gruppoId, isActive) {
    const cellInizio = document.getElementById(`cell-inizio-${id}`);
    const cellFine = document.getElementById(`cell-fine-${id}`);
    const cellAzioni = document.getElementById(`cell-azioni-${id}`);

    if (!cellInizio || !cellFine || !cellAzioni) return;

    cellInizio.innerHTML = `<input type="date" id="edit-mandato-inizio-${id}" class="epk-input" style="font-size: 10px; padding: 2px 4px;" value="${dataInizio}">`;

    if (isActive) {
        cellFine.innerHTML = `<span style="color: #22c55e; font-size: 10px; font-weight: bold;" title="I mandati attivi possono essere chiusi solo cambiando ruolo nel pannello superiore">Attivo (Bloccato)</span>`;
    } else {
        cellFine.innerHTML = `<input type="date" id="edit-mandato-fine-${id}" class="epk-input" style="font-size: 10px; padding: 2px 4px;" value="${dataFine}">`;
    }

    cellAzioni.innerHTML = `
        <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="epk-btn" style="padding: 2px 8px; font-size: 10px;" onclick="salvaModificaMandato(${id}, ${gruppoId}, ${isActive})" title="Salva modifiche">✓</button>
            <button class="epk-btn-secondary" style="padding: 2px 8px; font-size: 10px;" onclick="caricaStoricoRuoliGruppo(${gruppoId})" title="Annulla">✕</button>
        </div>
    `;
}

async function salvaModificaMandato(id, gruppoId, isActive) {
    const valInizio = document.getElementById(`edit-mandato-inizio-${id}`)?.value;
    if (!valInizio) {
        alert("Inserisci una data di inizio valida.");
        return;
    }

    const updatePayload = {
        data_inizio: valInizio
    };

    if (!isActive) {
        const valFine = document.getElementById(`edit-mandato-fine-${id}`)?.value;
        if (valFine) {
            updatePayload.data_fine = valFine;
        } else {
            updatePayload.data_fine = null;
        }
    }

    try {
        const { error } = await supabaseClient
            .from('epika_storico_ruoli_gruppi')
            .update(updatePayload)
            .eq('id', id);

        if (error) throw error;
        await caricaStoricoRuoliGruppo(gruppoId);
    } catch (e) {
        console.error("Errore durante la modifica del mandato:", e);
        alert("Errore durante il salvataggio della modifica del mandato.");
    }
}

async function eliminaMandatoStorico(id, gruppoId) {
    if (!confirm("Sei sicuro di voler eliminare definitivamente questo mandato dallo storico?")) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_storico_ruoli_gruppi')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await caricaStoricoRuoliGruppo(gruppoId);
    } catch (e) {
        console.error("Errore durante l'eliminazione del mandato:", e);
        alert("Errore durante l'eliminazione del mandato dallo storico.");
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
    alert("I dati di stato ora vengono salvati tramite il Registro Variazioni Stato.");
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
    } else if (tab === 'eventi') {
        renderCapoEventi();
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
        const elFormDal = document.getElementById('capo-val-formazione-dal');
        if (elFormDal) elFormDal.textContent = formatDate(gruppi.data_inizio_formazione);
        const elUffDal = document.getElementById('capo-val-ufficiale-dal');
        if (elUffDal) elUffDal.textContent = formatDate(gruppi.data_inizio_ufficiale);
        
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
let capoAbilitazioniMap = new Map(); // profilo_id -> record abilitazione anno corrente
let capoOpzioniNomiMap = new Map();  // opzione_id -> valore (nome) per allenatori + validatori

async function renderCapoIscrittiGruppo() {
    const tbody = document.getElementById('capo-iscritti-table-body');
    const countEl = document.getElementById('capo-iscritti-count');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 12px;">Ricerca iscritti in corso...</td></tr>';
    
    try {
        const { data: iscritti, error } = await supabaseClient
            .from('epika_profili')
            .select('*, utenti(nome, cognome)')
            .eq('gruppo_storico_id', currentManagedGroupId)
            .eq('profilo_completato', true);
            
        if (error) throw error;

        const annoCorrente = new Date().getFullYear();

        // Fetch abilitazioni anno corrente per i profili del gruppo
        let ablData = [];
        if (iscritti && iscritti.length > 0) {
            const profiloIds = iscritti.map(i => i.id);
            const { data: ablResult } = await supabaseClient
                .from('epika_scab_abilitazioni')
                .select('profilo_id, stato_allenatore, stato_validatore, allenatore_opzione_id, validatore_opzione_id')
                .in('profilo_id', profiloIds)
                .eq('anno_abilitativo', annoCorrente);
            ablData = ablResult || [];
        }

        // Fetch opzioni nomi (allenatori + validatori SCAB)
        const { data: opzioniResult } = await supabaseClient
            .from('epika_opzioni')
            .select('id, valore')
            .in('tipo', ['allenatore', 'scab_allievo_allenatore', 'scab_validatore']);

        // Costruire le Map per lookup O(1)
        capoAbilitazioniMap = new Map(ablData.map(a => [a.profilo_id, a]));
        capoOpzioniNomiMap = new Map((opzioniResult || []).map(o => [o.id, o.valore]));
        
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
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 12px; color: red;">Errore durante il caricamento degli iscritti.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 12px; color: gray;">Nessun iscritto trovato con i filtri selezionati.</td></tr>';
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

        // Lookup abilitazione per questo iscritto
        const abl = capoAbilitazioniMap.get(i.id);

        // --- Cella: Stato Abilitazione ---
        let statoAblHtml;
        if (!abl) {
            statoAblHtml = `<td style="padding: 10px; font-style: italic; color: rgba(245,230,200,0.35); font-size: 10px;">NON HA RICHIESTO</td>`;
        } else {
            const statiLabelMap = {
                'in_attesa':           'IN ATTESA',
                'in_valutazione':      'IN VALUTAZIONE',
                'video_fatto':         'VIDEO FATTO',
                'video_in_valutazione':'VIDEO IN VALUTAZIONE'
            };
            const statoLabel = statiLabelMap[abl.stato_allenatore] || (abl.stato_allenatore ? abl.stato_allenatore.toUpperCase() : '—');
            const nomeAllenatore = abl.allenatore_opzione_id ? (capoOpzioniNomiMap.get(abl.allenatore_opzione_id) || '—') : '—';
            statoAblHtml = `<td style="padding: 10px; font-size: 10px;">
                <span style="color: var(--epk-gold); font-weight: 600;">${statoLabel}</span><br>
                <span style="color: #a1a1aa; font-size: 9px;">Allenatore: ${nomeAllenatore}</span>
            </td>`;
        }

        // --- Cella: Risposta Validatore ---
        let rispostaValHtml;
        if (!abl) {
            rispostaValHtml = `<td style="padding: 10px; text-align: center; color: rgba(245,230,200,0.35);">—</td>`;
        } else {
            const semMap = {
                'giallo': { label: 'IN ATTESA',  emoji: '🟡', color: '#f9a825' },
                'rosso':  { label: 'RESPINTA',   emoji: '🔴', color: '#ef4444' },
                'verde':  { label: 'APPROVATA',  emoji: '🟢', color: '#22c55e' }
            };
            const sem = semMap[abl.stato_validatore] || null;
            const nomeValidatore = abl.validatore_opzione_id ? (capoOpzioniNomiMap.get(abl.validatore_opzione_id) || '—') : '—';
            if (!sem) {
                rispostaValHtml = `<td style="padding: 10px; text-align: center; color: rgba(245,230,200,0.35);">—</td>`;
            } else {
                rispostaValHtml = `<td style="padding: 10px; font-size: 10px;">
                    <span style="color: ${sem.color}; font-weight: 600;">${sem.emoji} ${sem.label}</span><br>
                    <span style="color: #a1a1aa; font-size: 9px;">Validatore: ${nomeValidatore}</span>
                </td>`;
            }
        }
        
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
            ${statoAblHtml}
            ${rispostaValHtml}
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

        if (soggettiAllenatori.length === 0) {
            const { data: allnData } = await supabaseClient
                .from('epika_opzioni')
                .select('*')
                .eq('tipo', 'allenatore')
                .eq('attivo', true)
                .order('valore', { ascending: true });
            if (allnData) soggettiAllenatori = allnData;
        }
        
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

        const allenatoreFilterSel = document.getElementById('gen-filter-allenatore');
        if (allenatoreFilterSel) {
            allenatoreFilterSel.innerHTML = '<option value="">TUTTI GLI ALLENATORI 2026</option>';
            soggettiAllenatori.forEach(a => {
                allenatoreFilterSel.innerHTML += `<option value="${a.id}">${a.valore.toUpperCase()}</option>`;
            });
        }
        
        disegnaTabellaListaGenerale();
        
    } catch (e) {
        console.error("Errore caricamento lista generale:", e);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 12px; color: red;">Errore durante il caricamento della lista generale.</td></tr>';
    }
}

function handleGenRuoloChange(ruoloSel, uid) {
    ruoloSel.style.opacity = '1';
    ruoloSel.style.fontStyle = 'normal';
    ruoloSel.style.borderColor = 'var(--epk-gold)';
    
    const allenatoreSel = document.querySelector(`.gen-allenatore[data-uid="${uid}"]`);
    if (!allenatoreSel) return;
    
    if (ruoloSel.value === 'non_combattente') {
        allenatoreSel.value = '';
        allenatoreSel.disabled = true;
        allenatoreSel.style.opacity = '0.5';
    } else {
        if (!isReadOnly()) {
            allenatoreSel.disabled = false;
            allenatoreSel.style.opacity = '1';
        }
    }
}

function disegnaTabellaListaGenerale() {
    const tbody = document.getElementById('adm-generale-table-body');
    if (!tbody) return;

    const query = (document.getElementById('gen-search-input')?.value || '').toLowerCase().trim();
    const ruoloFilter = document.getElementById('gen-filter-ruolo')?.value || '';
    const gruppoFilter = document.getElementById('gen-filter-gruppo')?.value || '';
    const popoloFilter = document.getElementById('gen-filter-popolo')?.value || '';
    const allenatoreFilter = document.getElementById('gen-filter-allenatore')?.value || '';

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
        const allenatoreId2026 = row2026 ? row2026.allenatore_id : p.allenatore_id;

        if (ruoloFilter && ruolo2026 !== ruoloFilter) return false;
        if (gruppoFilter && String(gruppoId2026) !== String(gruppoFilter)) return false;
        if (popoloFilter && popolo2026 !== popoloFilter) return false;
        if (allenatoreFilter && String(allenatoreId2026) !== String(allenatoreFilter)) return false;

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
        
        const rowNum = filtrati.length - idx;
        const nomeStorico = p.nome_di_battaglia || 'Senza Nome';
        const nomeReal = p.utenti ? `${p.utenti.nome} ${p.utenti.cognome}` : 'N/D';

        const row2026 = listaGeneraleStorico.find(s => s.profilo_id === p.id && s.anno_sociale === 2026);
        const ruoloAttivo = row2026 ? row2026.ruolo_combattimento : p.ruolo_combattimento;
        const gruppoIdAttivo = row2026 ? row2026.gruppo_storico_id : p.gruppo_storico_id;
        const popoloAttivo = row2026 ? row2026.popolo : p.popolo;
        const allenatoreIdAttivo = row2026 ? row2026.allenatore_id : p.allenatore_id;
        
        const isFallback = !row2026;
        const selectStyle = isFallback ? "opacity: 0.65; font-style: italic; border-color: rgba(251, 191, 36, 0.2);" : "border-color: var(--epk-gold);";
        
        const disabledSelect = isReadOnly() ? 'disabled' : '';
        // Select Ruolo
        let ruoloSelect = `<select class="gen-ruolo epk-input" data-uid="${p.id}" data-year="2026" style="font-size: 10px; padding: 4px; width: 100px; ${selectStyle}" ${disabledSelect} onchange="handleGenRuoloChange(this, '${p.id}');">`;
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

        // Select Allenatore
        const isNonCombattente = (ruoloAttivo === 'non_combattente');
        const allenatoreDisabledAttr = (disabledSelect || isNonCombattente) ? 'disabled' : '';
        const allenatoreVal = isNonCombattente ? '' : (allenatoreIdAttivo || '');
        const allenatoreOpacity = isNonCombattente ? 'opacity: 0.5;' : '';
        
        let allenatoreSelect = `<select class="gen-allenatore epk-input" data-uid="${p.id}" data-year="2026" style="font-size: 10px; padding: 4px; width: 110px; ${selectStyle} ${allenatoreOpacity}" ${allenatoreDisabledAttr} onchange="this.style.opacity='1'; this.style.fontStyle='normal'; this.style.borderColor='var(--epk-gold)'">`;
        allenatoreSelect += `<option value="" ${!allenatoreVal ? 'selected' : ''}>NESSUNO</option>`;
        soggettiAllenatori.forEach(aln => {
            const selected = (allenatoreVal && Number(aln.id) === Number(allenatoreVal)) ? 'selected' : '';
            allenatoreSelect += `<option value="${aln.id}" ${selected}>${aln.valore.toUpperCase()}</option>`;
        });
        allenatoreSelect += `</select>`;

        tr.innerHTML = `
            <td style="padding: 10px; text-align: center; color: var(--epk-gold-dim); font-weight: bold;">${rowNum}</td>
            <td style="padding: 10px;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="color: var(--epk-gold);">${nomeStorico}</strong>
                    <span style="font-size: 10px; color: #a1a1aa;">${nomeReal}</span>
                </div>
            </td>
            <td style="padding: 8px; text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center; align-items: center; flex-wrap: wrap;">
                    ${ruoloSelect}
                    ${gruppoSelect}
                    ${popoloSelect}
                    ${allenatoreSelect}
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
    const allenatoriSelects = document.querySelectorAll('.gen-allenatore');
    
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

    allenatoriSelects.forEach(sel => {
        const uid = sel.getAttribute('data-uid');
        const year = parseInt(sel.getAttribute('data-year'));
        const key = `${uid}_${year}`;
        if (!map[key]) {
            map[key] = { profilo_id: uid, anno_sociale: year };
        }
        if (map[key].ruolo_combattimento === 'non_combattente') {
            map[key].allenatore_id = null;
        } else {
            map[key].allenatore_id = sel.value ? parseInt(sel.value) : null;
        }
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
    container.innerHTML = '<div style="text-align:center;padding:20px;">Caricamento atleti...</div>';

    const annoCorrente = new Date().getFullYear();
    const effId = opzioneId;
    if (!effId) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:gray;">ID allenatore non trovato.</div>';
        return;
    }

    try {
        // 1. Risolvi tutti i profilo_id seguiti (diretti + via allievi) — funzione esistente riga 5130+
        const allProfiloIds = await getAllenatoreAllieviIds(effId);

        if (!allProfiloIds || allProfiloIds.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:gray;">Nessun atleta ti ha inserito come allenatore nel portale.</div>';
            return;
        }

        // 2. Carica dati profilo
        const { data: profili, error: pErr } = await supabaseClient
            .from('epika_profili')
            .select('id, nome_di_battaglia, popolo, ruolo_combattimento, primo_anno_partecipazione, gruppo_storico:gruppo_storico_id(nome)')
            .in('id', allProfiloIds)
            .eq('profilo_completato', true)
            .order('nome_di_battaglia', { ascending: true });
        if (pErr) throw pErr;

        // 3. Carica nomi reali da utenti
        const { data: utenti } = await supabaseClient
            .from('utenti')
            .select('id, nome, cognome')
            .in('id', allProfiloIds);
        const utentiMap = {};
        (utenti || []).forEach(u => { utentiMap[u.id] = `${u.nome} ${u.cognome}`; });

        // 4. Carica abilitazioni anno corrente
        const { data: abl } = await supabaseClient
            .from('epika_scab_abilitazioni')
            .select('id, profilo_id, stato_allenatore, stato_validatore')
            .in('profilo_id', allProfiloIds)
            .eq('anno_abilitativo', annoCorrente);
        const ablMap = {};
        (abl || []).forEach(a => { ablMap[a.profilo_id] = a; });

        const statiLabel = {
            'in_attesa': 'IN ATTESA',
            'in_valutazione': 'IN VALUTAZIONE',
            'video_fatto': 'VIDEO FATTO',
            'video_in_valutazione': 'VIDEO IN VALUTAZIONE'
        };
        const semLabel = { giallo: '🟡 IN ATTESA', rosso: '🔴 RESPINTA', verde: '🟢 APPROVATA' };
        const semColor = { giallo: '#f9a825', rosso: '#ef4444', verde: '#22c55e' };

        let html = `
            <p style="font-size:10px;color:rgba(245,230,200,0.5);text-transform:uppercase;margin-bottom:12px;">
                Anno Abilitativo: <strong style="color:var(--epk-gold);">${annoCorrente}</strong> — 
                Include atleti diretti e atleti seguiti dai tuoi Allievi Allenatori.
            </p>
            <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11px;text-transform:uppercase;">
                <thead>
                    <tr style="border-bottom:2px solid var(--epk-gold);color:var(--epk-gold);">
                        <th style="padding:10px;">Nome Vero</th>
                        <th style="padding:10px;">Nome di Battaglia</th>
                        <th style="padding:10px;">Gruppo Storico</th>
                        <th style="padding:10px;">Stato Abilitazione</th>
                        <th style="padding:10px;">Risposta Validatore</th>
                    </tr>
                </thead>
                <tbody>`;

        (profili || []).forEach(p => {
            const nomeVero = utentiMap[p.id] || 'N/D';
            const gruppo = p.gruppo_storico?.nome || 'N/D';
            const record = ablMap[p.id];

            let statoCell, semCell;
            if (!record) {
                statoCell = `<td style="padding:10px;color:rgba(245,230,200,0.3);font-style:italic;">Non ha richiesto</td>`;
                semCell = `<td style="padding:10px;">—</td>`;
            } else {
                const isVerde = record.stato_validatore === 'verde';
                const disabledAttr = isVerde ? 'disabled' : '';
                const titleAttr = isVerde ? 'Ciclo chiuso: approvazione verde del Validatore presente' : 'Modifica stato atleta';
                const opacityStyle = isVerde ? 'opacity:0.4;cursor:not-allowed;' : '';
                statoCell = `
                    <td style="padding:10px;">
                        <select ${disabledAttr} title="${titleAttr}" onchange="aggiornaStatoAllenatore(${record.id}, this.value, this)"
                                style="background:#1a0a0a;border:1px solid var(--epk-gold-dim);color:var(--epk-parchment);font-size:10px;padding:4px;text-transform:uppercase;${opacityStyle}">
                            <option value="in_attesa" ${record.stato_allenatore==='in_attesa'?'selected':''}>IN ATTESA</option>
                            <option value="in_valutazione" ${record.stato_allenatore==='in_valutazione'?'selected':''}>IN VALUTAZIONE</option>
                            <option value="video_fatto" ${record.stato_allenatore==='video_fatto'?'selected':''}>VIDEO FATTO</option>
                            <option value="video_in_valutazione" ${record.stato_allenatore==='video_in_valutazione'?'selected':''}>VIDEO IN VALUTAZIONE</option>
                        </select>
                    </td>`;
                const sem = record.stato_validatore || 'giallo';
                semCell = `<td style="padding:10px;font-weight:bold;color:${semColor[sem]};">${semLabel[sem]}</td>`;
            }

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px;">${nomeVero}</td>
                    <td style="padding:10px;font-weight:bold;color:var(--epk-gold);font-family:'Cinzel',serif;">${p.nome_di_battaglia}</td>
                    <td style="padding:10px;">${gruppo}</td>
                    ${statoCell}
                    ${semCell}
                </tr>`;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (e) {
        console.error('Errore renderAllenatoreDashboard:', e);
        container.innerHTML = '<div style="color:#ef4444;padding:20px;">Errore durante il caricamento della lista atleti.</div>';
    }
}

async function aggiornaStatoAllenatore(abilitazioneId, nuovoStato, selectEl) {
    const vecchioValore = selectEl.dataset.prevValue || selectEl.value;
    selectEl.dataset.prevValue = vecchioValore;
    try {
        const { error } = await supabaseClient.rpc('aggiorna_stato_allenatore', {
            p_abilitazione_id: abilitazioneId,
            p_nuovo_stato: nuovoStato,
            p_note: null
        });
        if (error) throw error;
        selectEl.dataset.prevValue = nuovoStato;
        const opzioneId = simulatedScabOpzioneId || userScabRolesMap['allenatore'];
        await renderAllenatoreDashboard(opzioneId);
    } catch (e) {
        console.error('Errore aggiornamento stato allenatore:', e);
        selectEl.value = vecchioValore; // Ripristina
        alert('Errore: ' + (e.message || 'impossibile aggiornare lo stato.'));
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
            <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 16px;">`;

        mieiAbbinamenti.forEach(a => {
            const strutturaNome = a.struttura ? a.struttura.nome.toUpperCase() : 'N/D';
            const allenatoreCapo = a.allenatore ? a.allenatore.valore.toUpperCase() : 'NESSUNO';
            const validatoreNome = a.validatore ? a.validatore.valore.toUpperCase() : 'NESSUNO';

            html += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); display: flex; flex-direction: column; gap: 12px; padding: 16px;">
                    <div style="font-size: 14px; font-weight: bold; color: var(--epk-gold); border-bottom: 1px solid rgba(251, 191, 36, 0.2); padding-bottom: 6px; text-transform: uppercase;">
                        ${strutturaNome}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 11px; text-transform: uppercase;">
                        <div><strong style="color: var(--epk-gold-dim);">Allenatore Referente:</strong> ${allenatoreCapo}</div>
                        <div><strong style="color: var(--epk-gold-dim);">Validatore:</strong> ${validatoreNome}</div>
                    </div>
                </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;

        // ---- SEZIONE ATLETI SEGUITI (SOLO LETTURA) ----
        const annoCorrente = new Date().getFullYear();
        const allProfiloIds = await getAllievoCoachAllieviIds(opzioneId);

        if (allProfiloIds && allProfiloIds.length > 0) {
            const { data: profili } = await supabaseClient
                .from('epika_profili').select('id, nome_di_battaglia').in('id', allProfiloIds).eq('profilo_completato', true);

            const { data: abl } = await supabaseClient
                .from('epika_scab_abilitazioni')
                .select('id, profilo_id, stato_allenatore, stato_validatore, allenatore:allenatore_opzione_id(valore)')
                .in('profilo_id', allProfiloIds)
                .eq('anno_abilitativo', annoCorrente);
            const ablMap = {};
            (abl || []).forEach(a => { ablMap[a.profilo_id] = a; });

            const statiAll = { in_attesa: { t: 'IN ATTESA', c: 'rgba(245,230,200,0.4)' }, in_valutazione: { t: 'IN VALUTAZIONE', c: '#f9a825' }, video_fatto: { t: 'VIDEO FATTO', c: '#fb923c' }, video_in_valutazione: { t: 'VIDEO IN VAL.', c: '#f97316' }};
            const semLabel = { giallo: '🟡 IN ATTESA', rosso: '🔴 RESPINTA', verde: '🟢 APPROVATA' };
            const semColor = { giallo: '#f9a825', rosso: '#ef4444', verde: '#22c55e' };

            let atlHtml = `
                <div class="epk-card" style="margin-top:16px;">
                    <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--epk-gold-dim);padding-bottom:8px;margin-bottom:16px;">
                        <h2 class="epk-headline" style="margin:0;font-size:16px;">ATLETI SEGUITI — ANNO ABILITATIVO ${annoCorrente}</h2>
                        <span style="background:#1c3a2f;color:#86efac;font-size:9px;padding:3px 8px;font-weight:bold;letter-spacing:0.1em;">👁 SOLA LETTURA</span>
                    </div>
                    <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11px;text-transform:uppercase;">
                        <thead>
                            <tr style="border-bottom:2px solid var(--epk-gold);color:var(--epk-gold);">
                                <th style="padding:10px;">Nome di Battaglia</th>
                                <th style="padding:10px;">Allenatore Supervisore</th>
                                <th style="padding:10px;">Stato Abilitazione</th>
                                <th style="padding:10px;">Risposta Validatore</th>
                            </tr>
                        </thead>
                        <tbody>`;

            (profili || []).forEach(p => {
                const record = ablMap[p.id];
                if (!record) {
                    atlHtml += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                        <td style="padding:10px;font-weight:bold;color:var(--epk-gold);">${p.nome_di_battaglia}</td>
                        <td colspan="3" style="padding:10px;color:rgba(245,230,200,0.3);font-style:italic;">Non ha richiesto abilitazione</td>
                    </tr>`;
                    return;
                }
                const sa = statiAll[record.stato_allenatore] || { t: record.stato_allenatore, c: 'gray' };
                const sem = record.stato_validatore || 'giallo';
                const nomeAll = record.allenatore?.valore?.toUpperCase() || 'N/D';
                atlHtml += `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                        <td style="padding:10px;font-weight:bold;color:var(--epk-gold);font-family:'Cinzel',serif;">${p.nome_di_battaglia}</td>
                        <td style="padding:10px;">${nomeAll}</td>
                        <td style="padding:10px;"><span style="color:${sa.c};font-weight:bold;">${sa.t}</span></td>
                        <td style="padding:10px;font-weight:bold;color:${semColor[sem]};">${semLabel[sem]}</td>
                    </tr>`;
            });
            atlHtml += '</tbody></table></div></div>';
            container.insertAdjacentHTML('beforeend', atlHtml);
        }

    } catch (e) {
        console.error("Errore caricamento abbinamenti allievo:", e);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento degli abbinamenti.</div>';
    }
}

// Helper per ottenere gli ID profilo seguiti da un allievo allenatore
async function getAllievoAllenatoreAllieviIds(opzioneId) {
    // In questa versione gli allievi allenatori seguono i propri atleti assegnati
    return [];
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

        // ---- SEZIONE ATLETI DA VALIDARE ----
        const annoCorrente = new Date().getFullYear();
        const allProfiloIds = await getValidatoreAllieviIds(opzioneId);

        if (allProfiloIds && allProfiloIds.length > 0) {
            const { data: profili } = await supabaseClient
                .from('epika_profili')
                .select('id, nome_di_battaglia')
                .in('id', allProfiloIds)
                .eq('profilo_completato', true);

            const { data: utenti } = await supabaseClient
                .from('utenti').select('id, nome, cognome').in('id', allProfiloIds);
            const utentiMap = {};
            (utenti || []).forEach(u => { utentiMap[u.id] = `${u.nome} ${u.cognome}`; });

            const { data: abl } = await supabaseClient
                .from('epika_scab_abilitazioni')
                .select('id, profilo_id, allenatore_opzione_id, stato_allenatore, stato_validatore, allenatore:allenatore_opzione_id(valore)')
                .in('profilo_id', allProfiloIds)
                .eq('anno_abilitativo', annoCorrente);
            const ablMap = {};
            (abl || []).forEach(a => { ablMap[a.profilo_id] = a; });

            const statiAllLabel = {
                'in_attesa': { t: 'IN ATTESA', c: 'rgba(245,230,200,0.4)' },
                'in_valutazione': { t: 'IN VALUTAZIONE', c: '#f9a825' },
                'video_fatto': { t: 'VIDEO FATTO', c: '#fb923c' },
                'video_in_valutazione': { t: 'VIDEO IN VAL.', c: '#f97316' }
            };
            const semColor = { giallo: '#f9a825', rosso: '#ef4444', verde: '#22c55e' };

            let atlHtml = `
                <div class="epk-card" style="margin-top:16px;">
                    <h2 class="epk-headline" style="margin-top:0;font-size:16px;border-bottom:1px solid var(--epk-gold-dim);padding-bottom:8px;margin-bottom:16px;">
                        ATLETI DA VALIDARE — ANNO ABILITATIVO ${annoCorrente}
                    </h2>
                    <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11px;text-transform:uppercase;">
                        <thead>
                            <tr style="border-bottom:2px solid var(--epk-gold);color:var(--epk-gold);">
                                <th style="padding:10px;">Nome Vero</th>
                                <th style="padding:10px;">Nome di Battaglia</th>
                                <th style="padding:10px;">Allenatore</th>
                                <th style="padding:10px;">Stato Allenatore</th>
                                <th style="padding:10px;">Semaforo Validatore</th>
                            </tr>
                        </thead>
                        <tbody>`;

            (profili || []).forEach(p => {
                const nomeVero = utentiMap[p.id] || 'N/D';
                const record = ablMap[p.id];
                if (!record) {
                    atlHtml += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                        <td style="padding:10px;">${nomeVero}</td>
                        <td style="padding:10px;color:var(--epk-gold);font-family:'Cinzel',serif;">${p.nome_di_battaglia}</td>
                        <td colspan="3" style="padding:10px;color:rgba(245,230,200,0.3);font-style:italic;">Non ha richiesto abilitazione</td>
                    </tr>`;
                    return;
                }
                const sa = statiAllLabel[record.stato_allenatore] || { t: record.stato_allenatore, c: 'gray' };
                const sem = record.stato_validatore || 'giallo';
                const nomeAllenatore = record.allenatore?.valore?.toUpperCase() || 'N/D';

                const isVideoInVal = record.stato_allenatore === 'video_in_valutazione';
                const isAlreadyVerde = record.stato_validatore === 'verde';
                const canEdit = isVideoInVal || isAlreadyVerde;
                const disabledAttr = canEdit ? '' : 'disabled';
                const opacityStyle = canEdit ? 'opacity:1;cursor:pointer;' : 'opacity:0.35;cursor:not-allowed;';
                const titleAttr = canEdit 
                    ? 'Modifica il semaforo di valutazione' 
                    : 'Disponibile solo quando l\'allenatore imposta lo stato su VIDEO IN VALUTAZIONE';

                atlHtml += `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                        <td style="padding:10px;">${nomeVero}</td>
                        <td style="padding:10px;font-weight:bold;color:var(--epk-gold);font-family:'Cinzel',serif;">${p.nome_di_battaglia}</td>
                        <td style="padding:10px;">${nomeAllenatore}</td>
                        <td style="padding:10px;"><span style="color:${sa.c};font-weight:bold;">${sa.t}</span></td>
                        <td style="padding:10px;">
                            <select ${disabledAttr}
                                    title="${titleAttr}"
                                    onchange="aggiornaStatoValidatore(${record.id}, this.value, this)"
                                    style="background:#1a0a0a;border:1px solid ${semColor[sem]};color:${semColor[sem]};font-size:10px;padding:4px;text-transform:uppercase;font-weight:bold;${opacityStyle}">
                                <option value="giallo" ${sem==='giallo'?'selected':''}>🟡 IN ATTESA</option>
                                <option value="verde" ${sem==='verde'?'selected':''}>🟢 APPROVATA</option>
                                <option value="rosso" ${sem==='rosso'?'selected':''}>🔴 RESPINTA</option>
                            </select>
                        </td>
                    </tr>`;
            });

            atlHtml += '</tbody></table></div></div>';
            container.insertAdjacentHTML('beforeend', atlHtml);
        }

    } catch (e) {
        console.error("Errore caricamento strutture validatore:", e);
        container.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento delle strutture.</div>';
    }
}

async function aggiornaStatoValidatore(abilitazioneId, nuovoStato, selectEl) {
    const vecchioValore = selectEl.dataset.prevValue || selectEl.value;
    selectEl.dataset.prevValue = vecchioValore;
    try {
        const { error } = await supabaseClient.rpc('aggiorna_stato_validatore', {
            p_abilitazione_id: abilitazioneId,
            p_nuovo_stato: nuovoStato,
            p_note: null
        });
        if (error) throw error;
        selectEl.dataset.prevValue = nuovoStato;
        const opzioneId = simulatedScabOpzioneId || userScabRolesMap['scab_validatore'];
        await renderValidatoreDashboard(opzioneId);
    } catch (e) {
        console.error('Errore aggiornamento semaforo validatore:', e);
        alert('Errore: ' + (e.message || 'impossibile aggiornare il semaforo.'));
        const opzioneId = simulatedScabOpzioneId || userScabRolesMap['scab_validatore'];
        await renderValidatoreDashboard(opzioneId);
    }
}

// ===========================================================================
// TAB SWITCHERS PER LE VISTE RUOLO (SCAB)
// ===========================================================================

let activeAllenatoreTab = 'atleti';
function switchAllenatoreTab(tab) {
    activeAllenatoreTab = tab;
    document.querySelectorAll('#epk-allenatore .epk-sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#epk-allenatore .epk-admin-tab-panel').forEach(panel => panel.classList.add('epk-hidden'));
    
    const btn = document.getElementById(`epk-all-btn-${tab}`);
    if (btn) btn.classList.add('active');
    
    const panel = document.getElementById(`epk-all-tab-${tab}`);
    if (panel) panel.classList.remove('epk-hidden');
    
    if (tab === 'atleti') {
        renderAllenatoreDashboard(simulatedScabOpzioneId || userScabRolesMap['allenatore']);
    } else if (tab === 'eventi') {
        renderAllenatoreEventi();
    }
}

let activeAllievoTab = 'abbinamenti';
function switchAllievoTab(tab) {
    activeAllievoTab = tab;
    document.querySelectorAll('#epk-allievo .epk-sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#epk-allievo .epk-admin-tab-panel').forEach(panel => panel.classList.add('epk-hidden'));
    
    const btn = document.getElementById(`epk-alv-btn-${tab}`);
    if (btn) btn.classList.add('active');
    
    const panel = document.getElementById(`epk-allievo-tab-${tab}`);
    if (panel) panel.classList.remove('epk-hidden');
    
    if (tab === 'abbinamenti') {
        renderAllievoAllenatoreDashboard(simulatedScabOpzioneId || userScabRolesMap['scab_allievo_allenatore']);
    } else if (tab === 'eventi') {
        renderAllievoEventi();
    }
}

let activeValidatoreTab = 'strutture';
function switchValidatoreTab(tab) {
    activeValidatoreTab = tab;
    document.querySelectorAll('#epk-validatore .epk-sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#epk-validatore .epk-admin-tab-panel').forEach(panel => panel.classList.add('epk-hidden'));
    
    const btn = document.getElementById(`epk-val-btn-${tab}`);
    if (btn) btn.classList.add('active');
    
    const panel = document.getElementById(`epk-validatore-tab-${tab}`);
    if (panel) panel.classList.remove('epk-hidden');
    
    if (tab === 'strutture') {
        renderValidatoreDashboard(simulatedScabOpzioneId || userScabRolesMap['scab_validatore']);
    } else if (tab === 'eventi') {
        renderValidatoreEventi();
    }
}

// ===========================================================================
// FUNZIONI SUPPORTO FILTRAGGIO ATLETI (SCAB)
// ===========================================================================

async function getAllenatoreAllieviIds(opzioneId) {
    const allieviIds = new Set();
    if (!opzioneId) return [];

    try {
        const { data: abbinamenti } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .select('*')
            .or(`allenatore_ref_id.eq.${opzioneId},allenatori_co_ids.cs.{${opzioneId}}`);

        const mieiAbb = abbinamenti || [];

        const opzioniAllieviIds = [];
        mieiAbb.forEach(a => {
            if (a.allievo_ref_id) opzioniAllieviIds.push(Number(a.allievo_ref_id));
            if (Array.isArray(a.allievi_ids)) {
                a.allievi_ids.map(Number).forEach(id => opzioniAllieviIds.push(id));
            }
        });

        if (opzioniAllieviIds.length > 0) {
            const { data: opzioni } = await supabaseClient
                .from('epika_opzioni')
                .select('utente_id')
                .in('id', opzioniAllieviIds);
            
            (opzioni || []).forEach(o => {
                if (o.utente_id) allieviIds.add(o.utente_id);
            });
        }

        const { data: profili } = await supabaseClient
            .from('epika_profili')
            .select('id')
            .eq('allenatore_id', opzioneId);

        (profili || []).forEach(p => {
            allieviIds.add(p.id);
        });
    } catch (e) {
        console.error("Errore risoluzione allievi allenatore:", e);
    }

    return Array.from(allieviIds);
}

async function getAllievoCoachAllieviIds(opzioneId) {
    const coaches = new Set();
    if (!opzioneId) return [];

    try {
        const { data: abbinamenti } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .select('*')
            .or(`allievo_ref_id.eq.${opzioneId},allievi_ids.cs.{${opzioneId}}`);

        const mieiAbb = abbinamenti || [];

        mieiAbb.forEach(a => {
            if (a.allenatore_ref_id) coaches.add(Number(a.allenatore_ref_id));
        });
    } catch (e) {
        console.error("Errore risoluzione coach di riferimento:", e);
    }

    const allieviIds = new Set();
    for (const coachId of coaches) {
        const list = await getAllenatoreAllieviIds(coachId);
        list.forEach(id => allieviIds.add(id));
    }

    return Array.from(allieviIds);
}

async function getValidatoreAllieviIds(opzioneId) {
    const coaches = new Set();
    if (!opzioneId) return [];

    try {
        const { data: abbinamenti } = await supabaseClient
            .from('epika_scab_abbinamenti')
            .select('*')
            .eq('validatore_id', opzioneId);

        (abbinamenti || []).forEach(a => {
            if (a.allenatore_ref_id) coaches.add(Number(a.allenatore_ref_id));
            if (Array.isArray(a.allenatori_co_ids)) {
                a.allenatori_co_ids.map(Number).forEach(id => coaches.add(id));
            }
        });
    } catch (e) {
        console.error("Errore risoluzione coach per validatore:", e);
    }

    const allieviIds = new Set();
    for (const coachId of coaches) {
        const list = await getAllenatoreAllieviIds(coachId);
        list.forEach(id => allieviIds.add(id));
    }

    return Array.from(allieviIds);
}

// ===========================================================================
// FUNZIONE DETTAGLI PARTECIPANTI (JOIN & MAPPING)
// ===========================================================================

async function fetchIscrittiEventoDettagli(eventoId) {
    const { data: iscritti, error: errIsc } = await supabaseClient
        .from('epika_iscrizioni_eventi')
        .select(`
            utente_id,
            gruppo_storico_id,
            giorni_presenza,
            data_ora_arrivo,
            data_ora_ripartenza,
            codice_transazione,
            ricevuta_id,
            dettagli,
            profilo:epika_profili(nome_di_battaglia, ruolo_combattimento, gruppo_storico_id, allenatore_id)
        `)
        .eq('evento_id', eventoId);

    if (errIsc) throw errIsc;
    if (!iscritti || iscritti.length === 0) return [];

    const uids = iscritti.map(i => i.utente_id);
    const { data: utentiD } = await supabaseClient
        .from('utenti')
        .select('id, nome, cognome')
        .in('id', uids);
    
    const nomiReali = {};
    (utentiD || []).forEach(u => { nomiReali[u.id] = `${u.nome} ${u.cognome}`; });

    const { data: allD } = await supabaseClient
        .from('epika_opzioni')
        .select('id, valore')
        .eq('tipo', 'allenatore');
    
    const allenatoriMappa = {};
    (allD || []).forEach(a => { allenatoriMappa[a.id] = a.valore; });

    return iscritti.map(i => {
        const prof = i.profilo || {};
        const dett = i.dettagli || {};
        
        let equip = 'NESSUNO';
        if (prof.ruolo_combattimento === 'combattente') {
            const armi = Array.isArray(dett.armi_speciali) ? dett.armi_speciali.join(', ') : '';
            const armatura = dett.armatura ? `ARMATURA: ${dett.armatura}` : '';
            const arciere = dett.arciere ? `ARCIERE: ${dett.arciere}` : '';
            const coach = dett.allenatore_id ? `ABILITATO DA: ${allenatoriMappa[dett.allenatore_id] || 'N/D'}` : '';
            const spDesc = dett.descrizione_sperimentali ? `(SPERIMENTALE: ${dett.descrizione_sperimentali})` : '';
            equip = [armatura, arciere, armi, spDesc, coach].filter(Boolean).join(' | ');
        }

        return {
            utente_id: i.utente_id,
            nome_di_battaglia: prof.nome_di_battaglia || 'N/D',
            nome_reale: nomiReali[i.utente_id] || 'N/D',
            ruolo: prof.ruolo_combattimento || 'non_combattente',
            giorni: i.giorni_presenza || [],
            arrivo: i.data_ora_arrivo,
            ripartenza: i.data_ora_ripartenza,
            equipaggiamento: equip,
            stato_pagamento: i.ricevuta_id ? 'PAGATO ✓' : 'ATTESA PAGAMENTO ⏳',
            gruppo_storico_id: i.gruppo_storico_id || prof.gruppo_storico_id,
            allenatore_id: prof.allenatore_id
        };
    });
}

// ===========================================================================
// FUNZIONI DI EVENTI / TABELLA DETTAGLI PER CAPOGRUPPO
// ===========================================================================

async function renderCapoEventi() {
    const listContainer = document.getElementById('epk-capo-eventi-lista');
    const detailsPanel = document.getElementById('epk-capo-evento-dettagli-panel');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento eventi...</div>';
    detailsPanel.classList.add('epk-hidden');

    try {
        const { data: eventi, error } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .order('data_inizio', { ascending: false });

        if (error) throw error;

        if (!eventi || eventi.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Nessun evento in programma.</div>';
            return;
        }

        listContainer.innerHTML = '';
        eventi.forEach(evt => {
            const dataInizioF = formattaData(evt.data_inizio);
            const dataFineF = formattaData(evt.data_fine);
            const dataFormattata = dataInizioF === dataFineF ? dataInizioF : `DAL ${dataInizioF} AL ${dataFineF}`;
            const costoText = parseFloat(evt.costo || 0) > 0 ? `€${parseFloat(evt.costo).toFixed(2)}` : 'GRATUITO';
            const mapUrl = ottieniUrlMappa(evt);
            const luogoHtml = mapUrl 
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;" title="Apri Google Maps">📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'} 🗺️</a>`
                : `📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'}`;

            listContainer.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); padding: 16px; display: flex; flex-direction: column; gap: 12px; margin: 0;">
                    <div>
                        <span class="epk-headline" style="font-size: 13px; color: var(--epk-gold); display: block;">${evt.titolo.toUpperCase()}</span>
                        <span style="font-size: 9px; font-family: monospace; display: block; color: rgba(245, 230, 200, 0.6); margin-top: 4px; text-transform: uppercase;">
                            📅 ${dataFormattata}<br>${luogoHtml}<br>💰 QUOTA: ${costoText}
                        </span>
                    </div>
                    <button class="epk-btn" style="padding: 6px 12px; font-size: 9px; margin-top: 8px;" onclick="mostraIscrittiEventoCapo('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">VEDI PARTECIPANTI</button>
                </div>`;
        });
    } catch (e) {
        console.error("Errore caricamento eventi capogruppo:", e);
        listContainer.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento della lista eventi.</div>';
    }
}

async function mostraIscrittiEventoCapo(eventoId, eventoTitolo) {
    const tableBody = document.getElementById('epk-capo-evento-iscritti-body');
    const detailsPanel = document.getElementById('epk-capo-evento-dettagli-panel');
    const title = document.getElementById('epk-capo-evento-dettagli-titolo');
    
    title.textContent = `PARTECIPANTI DEL GRUPPO ALL'EVENTO: ${eventoTitolo.toUpperCase()}`;
    tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: gray;">Caricamento partecipanti...</td></tr>';
    detailsPanel.classList.remove('epk-hidden');
    detailsPanel.scrollIntoView({ behavior: 'smooth' });

    try {
        const tuttiIscritti = await fetchIscrittiEventoDettagli(eventoId);
        // currentManagedGroupId è l'ID del gruppo storico (da epika_gruppi_storici).
        // Il profilo atleta ha gruppo_storico_id che è la FK verso la stessa tabella.
        // Il confronto è quindi diretto e corretto.
        const iscrittiGruppo = tuttiIscritti.filter(i => Number(i.gruppo_storico_id) === Number(currentManagedGroupId));

        if (iscrittiGruppo.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ff4d4d;">NESSUN PARTECIPANTE DEL TUO GRUPPO ISCRITTO A QUESTO EVENTO.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        iscrittiGruppo.forEach(i => {
            const formatDatetime = (dt) => dt ? new Date(dt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/D';
            const arrivoText = formatDatetime(i.arrivo);
            const ripartenzaText = formatDatetime(i.ripartenza);
            const giorniText = (i.giorni || []).map(formattaData).join(', ');
            const pagBadgeStyle = i.stato_pagamento.includes('PAGATO') ? 'color: #22c55e;' : 'color: #eab308;';

            tableBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; font-weight: bold; color: var(--epk-parchment);">${i.nome_di_battaglia}<br><span style="font-size: 9px; color: gray;">Real: ${i.nome_reale}</span></td>
                    <td style="padding: 10px;"><span class="epk-version-badge" style="font-size: 8px; margin: 0;">${i.ruolo}</span></td>
                    <td style="padding: 10px; font-size: 10px;">${giorniText}</td>
                    <td style="padding: 10px; font-size: 10px;">ARR: ${arrivoText}<br>PART: ${ripartenzaText}</td>
                    <td style="padding: 10px; font-size: 9px; color: rgba(245, 230, 200, 0.75);">${i.equipaggiamento}</td>
                    <td style="padding: 10px; font-weight: bold; font-size: 10px; ${pagBadgeStyle}">${i.stato_pagamento}</td>
                </tr>`;
        });
    } catch (e) {
        console.error("Errore dettagli partecipanti capogruppo:", e);
        tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ef4444;">ERRORE CARICAMENTO DATI.</td></tr>';
    }
}

// ===========================================================================
// FUNZIONI DI EVENTI / TABELLA DETTAGLI PER ALLENATORE
// ===========================================================================

async function renderAllenatoreEventi() {
    const listContainer = document.getElementById('epk-allenatore-eventi-lista');
    const detailsPanel = document.getElementById('epk-allenatore-evento-dettagli-panel');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento eventi...</div>';
    detailsPanel.classList.add('epk-hidden');

    try {
        const { data: eventi, error } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .order('data_inizio', { ascending: false });

        if (error) throw error;

        if (!eventi || eventi.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Nessun evento in programma.</div>';
            return;
        }

        listContainer.innerHTML = '';
        eventi.forEach(evt => {
            const dataInizioF = formattaData(evt.data_inizio);
            const dataFineF = formattaData(evt.data_fine);
            const dataFormattata = dataInizioF === dataFineF ? dataInizioF : `DAL ${dataInizioF} AL ${dataFineF}`;
            const costoText = parseFloat(evt.costo || 0) > 0 ? `€${parseFloat(evt.costo).toFixed(2)}` : 'GRATUITO';
            const mapUrl = ottieniUrlMappa(evt);
            const luogoHtml = mapUrl 
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;" title="Apri Google Maps">📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'} 🗺️</a>`
                : `📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'}`;

            listContainer.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); padding: 16px; display: flex; flex-direction: column; gap: 12px; margin: 0;">
                    <div>
                        <span class="epk-headline" style="font-size: 13px; color: var(--epk-gold); display: block;">${evt.titolo.toUpperCase()}</span>
                        <span style="font-size: 9px; font-family: monospace; display: block; color: rgba(245, 230, 200, 0.6); margin-top: 4px; text-transform: uppercase;">
                            📅 ${dataFormattata}<br>${luogoHtml}<br>💰 QUOTA: ${costoText}
                        </span>
                    </div>
                    <button class="epk-btn" style="padding: 6px 12px; font-size: 9px; margin-top: 8px;" onclick="mostraIscrittiEventoAllenatore('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">VEDI PARTECIPANTI</button>
                </div>`;
        });
    } catch (e) {
        console.error("Errore caricamento eventi allenatore:", e);
        listContainer.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento della lista eventi.</div>';
    }
}

async function mostraIscrittiEventoAllenatore(eventoId, eventoTitolo) {
    const tableBody = document.getElementById('epk-allenatore-evento-iscritti-body');
    const detailsPanel = document.getElementById('epk-allenatore-evento-dettagli-panel');
    const title = document.getElementById('epk-allenatore-evento-dettagli-titolo');

    title.textContent = `ALLIEVI ISCRITTI ALL'EVENTO: ${eventoTitolo.toUpperCase()}`;
    tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: gray;">Caricamento partecipanti...</td></tr>';
    detailsPanel.classList.remove('epk-hidden');
    detailsPanel.scrollIntoView({ behavior: 'smooth' });

    try {
        const coachOpzioneId = simulatedScabOpzioneId || userScabRolesMap['allenatore'];
        const allieviIds = await getAllenatoreAllieviIds(coachOpzioneId);
        
        const tuttiIscritti = await fetchIscrittiEventoDettagli(eventoId);
        const iscrittiAllenatore = tuttiIscritti.filter(i => allieviIds.includes(i.utente_id));

        if (iscrittiAllenatore.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ff4d4d;">NESSUN TUO ALLIEVO ISCRITTO A QUESTO EVENTO.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        iscrittiAllenatore.forEach(i => {
            const formatDatetime = (dt) => dt ? new Date(dt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/D';
            const arrivoText = formatDatetime(i.arrivo);
            const ripartenzaText = formatDatetime(i.ripartenza);
            const giorniText = (i.giorni || []).map(formattaData).join(', ');
            const pagBadgeStyle = i.stato_pagamento.includes('PAGATO') ? 'color: #22c55e;' : 'color: #eab308;';

            tableBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; font-weight: bold; color: var(--epk-parchment);">${i.nome_di_battaglia}<br><span style="font-size: 9px; color: gray;">Real: ${i.nome_reale}</span></td>
                    <td style="padding: 10px;"><span class="epk-version-badge" style="font-size: 8px; margin: 0;">${i.ruolo}</span></td>
                    <td style="padding: 10px; font-size: 10px;">${giorniText}</td>
                    <td style="padding: 10px; font-size: 10px;">ARR: ${arrivoText}<br>PART: ${ripartenzaText}</td>
                    <td style="padding: 10px; font-size: 9px; color: rgba(245, 230, 200, 0.75);">${i.equipaggiamento}</td>
                    <td style="padding: 10px; font-weight: bold; font-size: 10px; ${pagBadgeStyle}">${i.stato_pagamento}</td>
                </tr>`;
        });
    } catch (e) {
        console.error("Errore dettagli partecipanti allenatore:", e);
        tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ef4444;">ERRORE CARICAMENTO DATI.</td></tr>';
    }
}

// ===========================================================================
// FUNZIONI DI EVENTI / TABELLA DETTAGLI PER ALLIEVO ALLENATORE
// ===========================================================================

async function renderAllievoEventi() {
    const listContainer = document.getElementById('epk-allievo-eventi-lista');
    const detailsPanel = document.getElementById('epk-allievo-evento-dettagli-panel');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento eventi...</div>';
    detailsPanel.classList.add('epk-hidden');

    try {
        const { data: eventi, error } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .order('data_inizio', { ascending: false });

        if (error) throw error;

        if (!eventi || eventi.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Nessun evento in programma.</div>';
            return;
        }

        listContainer.innerHTML = '';
        eventi.forEach(evt => {
            const dataInizioF = formattaData(evt.data_inizio);
            const dataFineF = formattaData(evt.data_fine);
            const dataFormattata = dataInizioF === dataFineF ? dataInizioF : `DAL ${dataInizioF} AL ${dataFineF}`;
            const costoText = parseFloat(evt.costo || 0) > 0 ? `€${parseFloat(evt.costo).toFixed(2)}` : 'GRATUITO';
            const mapUrl = ottieniUrlMappa(evt);
            const luogoHtml = mapUrl 
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;" title="Apri Google Maps">📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'} 🗺️</a>`
                : `📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'}`;

            listContainer.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); padding: 16px; display: flex; flex-direction: column; gap: 12px; margin: 0;">
                    <div>
                        <span class="epk-headline" style="font-size: 13px; color: var(--epk-gold); display: block;">${evt.titolo.toUpperCase()}</span>
                        <span style="font-size: 9px; font-family: monospace; display: block; color: rgba(245, 230, 200, 0.6); margin-top: 4px; text-transform: uppercase;">
                            📅 ${dataFormattata}<br>${luogoHtml}<br>💰 QUOTA: ${costoText}
                        </span>
                    </div>
                    <button class="epk-btn" style="padding: 6px 12px; font-size: 9px; margin-top: 8px;" onclick="mostraIscrittiEventoAllievo('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">VEDI PARTECIPANTI</button>
                </div>`;
        });
    } catch (e) {
        console.error("Errore caricamento eventi allievo:", e);
        listContainer.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento della lista eventi.</div>';
    }
}

async function mostraIscrittiEventoAllievo(eventoId, eventoTitolo) {
    const tableBody = document.getElementById('epk-allievo-evento-iscritti-body');
    const detailsPanel = document.getElementById('epk-allievo-evento-dettagli-panel');
    const title = document.getElementById('epk-allievo-evento-dettagli-titolo');

    title.textContent = `ALLIEVI CO-ALLENATORI ISCRITTI ALL'EVENTO: ${eventoTitolo.toUpperCase()}`;
    tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: gray;">Caricamento partecipanti...</td></tr>';
    detailsPanel.classList.remove('epk-hidden');
    detailsPanel.scrollIntoView({ behavior: 'smooth' });

    try {
        const alvOpzioneId = simulatedScabOpzioneId || userScabRolesMap['scab_allievo_allenatore'];
        const allieviIds = await getAllievoCoachAllieviIds(alvOpzioneId);
        
        const tuttiIscritti = await fetchIscrittiEventoDettagli(eventoId);
        const iscrittiAllievo = tuttiIscritti.filter(i => allieviIds.includes(i.utente_id));

        if (iscrittiAllievo.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ff4d4d;">NESSUN ALLIEVO DEL CO-ALLENATORE DI RIFERIMENTO ISCRITTO A QUESTO EVENTO.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        iscrittiAllievo.forEach(i => {
            const formatDatetime = (dt) => dt ? new Date(dt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/D';
            const arrivoText = formatDatetime(i.arrivo);
            const ripartenzaText = formatDatetime(i.ripartenza);
            const giorniText = (i.giorni || []).map(formattaData).join(', ');
            const pagBadgeStyle = i.stato_pagamento.includes('PAGATO') ? 'color: #22c55e;' : 'color: #eab308;';

            tableBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; font-weight: bold; color: var(--epk-parchment);">${i.nome_di_battaglia}<br><span style="font-size: 9px; color: gray;">Real: ${i.nome_reale}</span></td>
                    <td style="padding: 10px;"><span class="epk-version-badge" style="font-size: 8px; margin: 0;">${i.ruolo}</span></td>
                    <td style="padding: 10px; font-size: 10px;">${giorniText}</td>
                    <td style="padding: 10px; font-size: 10px;">ARR: ${arrivoText}<br>PART: ${ripartenzaText}</td>
                    <td style="padding: 10px; font-size: 9px; color: rgba(245, 230, 200, 0.75);">${i.equipaggiamento}</td>
                    <td style="padding: 10px; font-weight: bold; font-size: 10px; ${pagBadgeStyle}">${i.stato_pagamento}</td>
                </tr>`;
        });
    } catch (e) {
        console.error("Errore dettagli partecipanti allievo:", e);
        tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ef4444;">ERRORE CARICAMENTO DATI.</td></tr>';
    }
}

// ===========================================================================
// FUNZIONI DI EVENTI / TABELLA DETTAGLI PER VALIDATORE
// ===========================================================================

async function renderValidatoreEventi() {
    const listContainer = document.getElementById('epk-validatore-eventi-lista');
    const detailsPanel = document.getElementById('epk-validatore-evento-dettagli-panel');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Caricamento eventi...</div>';
    detailsPanel.classList.add('epk-hidden');

    try {
        const { data: eventi, error } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .order('data_inizio', { ascending: false });

        if (error) throw error;

        if (!eventi || eventi.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: gray;">Nessun evento in programma.</div>';
            return;
        }

        listContainer.innerHTML = '';
        eventi.forEach(evt => {
            const dataInizioF = formattaData(evt.data_inizio);
            const dataFineF = formattaData(evt.data_fine);
            const dataFormattata = dataInizioF === dataFineF ? dataInizioF : `DAL ${dataInizioF} AL ${dataFineF}`;
            const costoText = parseFloat(evt.costo || 0) > 0 ? `€${parseFloat(evt.costo).toFixed(2)}` : 'GRATUITO';
            const mapUrl = ottieniUrlMappa(evt);
            const luogoHtml = mapUrl 
                ? `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;" title="Apri Google Maps">📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'} 🗺️</a>`
                : `📍 ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'}`;

            listContainer.innerHTML += `
                <div class="epk-card" style="background: rgba(0,0,0,0.35); border: 1px solid var(--epk-gold-dim); padding: 16px; display: flex; flex-direction: column; gap: 12px; margin: 0;">
                    <div>
                        <span class="epk-headline" style="font-size: 13px; color: var(--epk-gold); display: block;">${evt.titolo.toUpperCase()}</span>
                        <span style="font-size: 9px; font-family: monospace; display: block; color: rgba(245, 230, 200, 0.6); margin-top: 4px; text-transform: uppercase;">
                            📅 ${dataFormattata}<br>${luogoHtml}<br>💰 QUOTA: ${costoText}
                        </span>
                    </div>
                    <button class="epk-btn" style="padding: 6px 12px; font-size: 9px; margin-top: 8px;" onclick="mostraIscrittiEventoValidatore('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">VEDI PARTECIPANTI</button>
                </div>`;
        });
    } catch (e) {
        console.error("Errore caricamento eventi validatore:", e);
        listContainer.innerHTML = '<div style="color: #ef4444; padding: 20px;">Errore durante il caricamento della lista eventi.</div>';
    }
}

async function mostraIscrittiEventoValidatore(eventoId, eventoTitolo) {
    const tableBody = document.getElementById('epk-validatore-evento-iscritti-body');
    const detailsPanel = document.getElementById('epk-validatore-evento-dettagli-panel');
    const title = document.getElementById('epk-validatore-evento-dettagli-titolo');

    title.textContent = `ATLETI VALIDATI ISCRITTI ALL'EVENTO: ${eventoTitolo.toUpperCase()}`;
    tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: gray;">Caricamento partecipanti...</td></tr>';
    detailsPanel.classList.remove('epk-hidden');
    detailsPanel.scrollIntoView({ behavior: 'smooth' });

    try {
        const valOpzioneId = simulatedScabOpzioneId || userScabRolesMap['scab_validatore'];
        const allieviIds = await getValidatoreAllieviIds(valOpzioneId);
        
        const tuttiIscritti = await fetchIscrittiEventoDettagli(eventoId);
        const iscrittiValidatore = tuttiIscritti.filter(i => allieviIds.includes(i.utente_id));

        if (iscrittiValidatore.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ff4d4d;">NESSUN ATLETA SOTTO LA TUA VALIDAZIONE ISCRITTO A QUESTO EVENTO.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        iscrittiValidatore.forEach(i => {
            const formatDatetime = (dt) => dt ? new Date(dt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/D';
            const arrivoText = formatDatetime(i.arrivo);
            const ripartenzaText = formatDatetime(i.ripartenza);
            const giorniText = (i.giorni || []).map(formattaData).join(', ');
            const pagBadgeStyle = i.stato_pagamento.includes('PAGATO') ? 'color: #22c55e;' : 'color: #eab308;';

            tableBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; font-weight: bold; color: var(--epk-parchment);">${i.nome_di_battaglia}<br><span style="font-size: 9px; color: gray;">Real: ${i.nome_reale}</span></td>
                    <td style="padding: 10px;"><span class="epk-version-badge" style="font-size: 8px; margin: 0;">${i.ruolo}</span></td>
                    <td style="padding: 10px; font-size: 10px;">${giorniText}</td>
                    <td style="padding: 10px; font-size: 10px;">ARR: ${arrivoText}<br>PART: ${ripartenzaText}</td>
                    <td style="padding: 10px; font-size: 9px; color: rgba(245, 230, 200, 0.75);">${i.equipaggiamento}</td>
                    <td style="padding: 10px; font-weight: bold; font-size: 10px; ${pagBadgeStyle}">${i.stato_pagamento}</td>
                </tr>`;
        });
    } catch (e) {
        console.error("Errore dettagli partecipanti validatore:", e);
        tableBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #ef4444;">ERRORE CARICAMENTO DATI.</td></tr>';
    }
}

// ============================================================
// DASHBOARD CONTABILITÀ & BILANCIO EVENTI (v1.03.26)
// ============================================================
let contabilitaState = {
    eventi: [],
    iscrizioni: [],
    ricevute: [],
    spese: [],
    profili: []
};
let contabilitaEventoSelezionatoId = null;

async function renderContabilitaAdmin() {
    const tbody = document.getElementById('cnt-tbody-eventi');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 15px; color: gray;">Caricamento dati contabili in corso...</td></tr>';

    try {
        // 1. Carica dati in parallelo da Supabase
        const [resEventi, resIscrizioni, resRicevute, resSpese, resProfili] = await Promise.all([
            supabaseClient.from('epika_eventi').select('*').order('data_inizio', { ascending: false }),
            supabaseClient.from('epika_iscrizioni_eventi').select('*'),
            supabaseClient.from('ricevute_pagamenti').select('*'),
            supabaseClient.from('registro_spese').select('*'),
            supabaseClient.from('epika_profili').select('id, nome_di_battaglia')
        ]);

        if (resEventi.error) throw resEventi.error;
        if (resIscrizioni.error) throw resIscrizioni.error;
        if (resRicevute.error) throw resRicevute.error;
        if (resSpese.error) throw resSpese.error;
        if (resProfili.error) throw resProfili.error;

        const epikaEventi = resEventi.data || [];
        const epikaIscrizioni = resIscrizioni.data || [];
        const allRicevute = resRicevute.data || [];
        const allSpese = resSpese.data || [];

        const epikaEventiIds = new Set(epikaEventi.map(e => e.id));
        const epikaRicevutaIdsFromIscrizioni = new Set(epikaIscrizioni.map(i => i.ricevuta_id).filter(Boolean));

        // Filtra solo entrate (ricevute) pertinenti ad Epika
        const epikaRicevute = allRicevute.filter(r => {
            if (r.evento_id && epikaEventiIds.has(r.evento_id)) return true;
            if (epikaRicevutaIdsFromIscrizioni.has(r.id)) return true;
            if (r.causale && r.causale.toLowerCase().includes('evento storico')) return true;
            return false;
        });

        // Filtra solo uscite (spese) pertinenti ad Epika
        const epikaSpese = allSpese.filter(s => {
            if (s.evento_id && epikaEventiIds.has(s.evento_id)) return true;
            if (s.titolo && s.titolo.toLowerCase().includes('epika')) return true;
            if (s.categoria && s.categoria.toLowerCase().includes('epika')) return true;
            return false;
        });

        contabilitaState.eventi = epikaEventi;
        contabilitaState.iscrizioni = epikaIscrizioni;
        contabilitaState.ricevute = epikaRicevute;
        contabilitaState.spese = epikaSpese;
        contabilitaState.profili = resProfili.data || [];

        // Popola i selettori degli eventi nei modali
        popolaSelettoriEventiContabilita();

        // Applica i filtri e disegna la dashboard
        applicaFiltriContabilita();
    } catch (err) {
        console.error("Errore durante il caricamento della contabilità:", err);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 15px; color: red;">Errore durante il caricamento dei dati contabili.</td></tr>';
    }
}

function popolaSelettoriEventiContabilita() {
    const selInc = document.getElementById('cnt-inc-evento');
    const selSps = document.getElementById('cnt-sps-evento');
    const selAtl = document.getElementById('cnt-inc-atleta');

    if (selInc) {
        selInc.innerHTML = '<option value="">Seleziona Evento...</option>' +
            contabilitaState.eventi.map(e => `<option value="${e.id}">${e.titolo}</option>`).join('');
    }
    if (selSps) {
        selSps.innerHTML = '<option value="">Spesa Generale Epika</option>' +
            contabilitaState.eventi.map(e => `<option value="${e.id}">${e.titolo}</option>`).join('');
    }
    if (selAtl) {
        selAtl.innerHTML = '<option value="">Nessuno / Incasso Esterno</option>' +
            contabilitaState.profili.map(p => `<option value="${p.id}">${p.nome_di_battaglia}</option>`).join('');
    }
}

function setFilterPresetContabilita(preset) {
    const startInput = document.getElementById('cnt-filter-start');
    const endInput = document.getElementById('cnt-filter-end');

    if (preset === '2026') {
        if (startInput) startInput.value = '2026-01-01';
        if (endInput) endInput.value = '2026-12-31';
    } else if (preset === '30g') {
        const d = new Date();
        if (endInput) endInput.value = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - 30);
        if (startInput) startInput.value = d.toISOString().split('T')[0];
    } else if (preset === 'tutto') {
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
    }
    applicaFiltriContabilita();
}

function applicaFiltriContabilita() {
    const startDateVal = document.getElementById('cnt-filter-start')?.value;
    const endDateVal = document.getElementById('cnt-filter-end')?.value;
    const searchText = (document.getElementById('cnt-search-input')?.value || '').trim().toLowerCase();

    const startDate = startDateVal ? new Date(startDateVal) : null;
    const endDate = endDateVal ? new Date(endDateVal + 'T23:59:59') : null;

    // Filtra ricevute in base alla data
    const ricevuteFiltrate = contabilitaState.ricevute.filter(r => {
        if (!r.data_pagamento) return true;
        const dt = new Date(r.data_pagamento);
        if (startDate && dt < startDate) return false;
        if (endDate && dt > endDate) return false;
        return true;
    });

    // Filtra spese in base alla data
    const speseFiltrate = contabilitaState.spese.filter(s => {
        if (!s.data_spesa) return true;
        const dt = new Date(s.data_spesa);
        if (startDate && dt < startDate) return false;
        if (endDate && dt > endDate) return false;
        return true;
    });

    // Filtra eventi in base al testo o alle date
    const eventiFiltrati = contabilitaState.eventi.filter(e => {
        if (searchText && !e.titolo.toLowerCase().includes(searchText)) {
            // Verifica se la ricerca corrisponde al nome di un atleta pagante dell'evento
            const iscrizioniEv = contabilitaState.iscrizioni.filter(i => i.evento_id === e.id);
            const haAtleta = iscrizioniEv.some(i => {
                const p = contabilitaState.profili.find(pr => pr.id === i.utente_id);
                return p && p.nome_di_battaglia.toLowerCase().includes(searchText);
            });
            if (!haAtleta) return false;
        }
        return true;
    });

    // Calcolo KPI complessivi
    let totIncassi = 0;
    let totSpese = 0;
    let totRicevuteCount = ricevuteFiltrate.length;

    ricevuteFiltrate.forEach(r => { totIncassi += (parseFloat(r.importo) || 0); });
    speseFiltrate.forEach(s => { totSpese += (parseFloat(s.importo) || 0); });

    const utileNetto = totIncassi - totSpese;
    const marginePct = totIncassi > 0 ? ((utileNetto / totIncassi) * 100).toFixed(1) : 0;

    // Aggiorna KPI DOM
    const kpiInc = document.getElementById('cnt-kpi-incassi');
    const kpiSps = document.getElementById('cnt-kpi-spese');
    const kpiUtl = document.getElementById('cnt-kpi-utile');
    const kpiMrg = document.getElementById('cnt-kpi-margine-pct');
    const kpiRcv = document.getElementById('cnt-kpi-ricevute');

    if (kpiInc) kpiInc.innerText = `€ ${totIncassi.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (kpiSps) kpiSps.innerText = `€ ${totSpese.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (kpiUtl) {
        kpiUtl.innerText = `€ ${utileNetto.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        kpiUtl.style.color = utileNetto >= 0 ? 'var(--epk-gold)' : '#f87171';
    }
    if (kpiMrg) kpiMrg.innerText = `Margine: ${marginePct}%`;
    if (kpiRcv) kpiRcv.innerText = totRicevuteCount;

    // Render Tabella Eventi
    const tbody = document.getElementById('cnt-tbody-eventi');
    if (!tbody) return;

    if (eventiFiltrati.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 15px; color: gray;">Nessun evento trovato con i filtri attuali.</td></tr>';
        return;
    }

    let rowsHtml = '';
    eventiFiltrati.forEach((ev, idx) => {
        const costVal = parseFloat(ev.costo) || 0;
        const iscrizioniEv = contabilitaState.iscrizioni.filter(i => i.evento_id === ev.id);
        const totalIscritti = iscrizioniEv.length;

        // Trova ricevute dell'evento (tramite iscrizione o tramite evento_id diretto)
        const ricevutaIds = iscrizioniEv.map(i => i.ricevuta_id).filter(Boolean);
        const ricevuteEv = contabilitaState.ricevute.filter(r => ricevutaIds.includes(r.id) || r.evento_id === ev.id);
        
        let incassoEv = 0;
        ricevuteEv.forEach(r => { incassoEv += (parseFloat(r.importo) || 0); });

        // Spese dell'evento
        const speseEvList = contabilitaState.spese.filter(s => s.evento_id === ev.id);
        let speseEv = 0;
        speseEvList.forEach(s => { speseEv += (parseFloat(s.importo) || 0); });

        const utileEv = incassoEv - speseEv;
        const pagantiCount = ricevuteEv.length;

        const dataInizioStr = ev.data_inizio ? new Date(ev.data_inizio).toLocaleDateString('it-IT') : '-';
        const dataFineStr = ev.data_fine ? new Date(ev.data_fine).toLocaleDateString('it-IT') : '-';
        const dateStr = `${dataInizioStr} - ${dataFineStr}`;

        const utileColor = utileEv > 0 ? '#4ade80' : (utileEv < 0 ? '#f87171' : '#aaa');

        rowsHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px; text-align: center; font-weight: bold; color: var(--epk-gold-dim);">${idx + 1}</td>
                <td style="padding: 10px; font-weight: bold; color: var(--epk-parchment);">${ev.titolo}</td>
                <td style="padding: 10px; font-size: 10px; color: #bbb;">${dateStr}</td>
                <td style="padding: 10px; text-align: right;">€ ${costVal.toFixed(2)}</td>
                <td style="padding: 10px; text-align: center; font-weight: bold;">${totalIscritti}</td>
                <td style="padding: 10px; text-align: center; color: #4ade80;">${pagantiCount}</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; color: #4ade80;">€ ${incassoEv.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; color: #f87171;">€ ${speseEv.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; color: ${utileColor};">€ ${utileEv.toFixed(2)}</td>
                <td style="padding: 10px; text-align: center;">
                    <button class="epk-btn-secondary" onclick="apriDettaglioBilancioEvento('${ev.id}')" style="font-size: 9px; padding: 4px 8px;">DETTAGLIO</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml;
}

// ------------------------------------------------------------
// MODALI INCASSI E SPESE MANUALE
// ------------------------------------------------------------
function apriModaleIncassoManuale() {
    const modal = document.getElementById('cnt-modal-incasso');
    if (modal) {
        modal.classList.remove('epk-hidden');
        document.getElementById('cnt-inc-data').value = new Date().toISOString().split('T')[0];
    }
}

function chiudiModaleIncassoManuale() {
    const modal = document.getElementById('cnt-modal-incasso');
    if (modal) modal.classList.add('epk-hidden');
}

async function salvaIncassoManuale(e) {
    e.preventDefault();
    const eventoId = document.getElementById('cnt-inc-evento').value;
    const utenteId = document.getElementById('cnt-inc-atleta').value || null;
    const importo = parseFloat(document.getElementById('cnt-inc-importo').value);
    const metodo = document.getElementById('cnt-inc-metodo').value;
    const dataPagamento = document.getElementById('cnt-inc-data').value;
    const causale = document.getElementById('cnt-inc-causale').value.trim();

    if (!eventoId || !importo || !metodo || !dataPagamento || !causale) {
        alert("Compila tutti i campi obbligatori.");
        return;
    }

    try {
        const annoFiscale = new Date(dataPagamento).getFullYear();
        const numRicevuta = Math.floor(1000 + Math.random() * 9000);

        const { data: ricData, error: ricErr } = await supabaseClient
            .from('ricevute_pagamenti')
            .insert([{
                numero_ricevuta: numRicevuta,
                anno_fiscale: annoFiscale,
                utente_id: utenteId,
                evento_id: eventoId,
                importo: importo,
                causale: causale,
                data_pagamento: dataPagamento,
                metodo_pagamento: metodo,
                codice_transazione: `MANUAL_${Date.now()}`
            }])
            .select()
            .single();

        if (ricErr) throw ricErr;

        alert("Incasso manuale registrato con successo!");
        chiudiModaleIncassoManuale();
        renderContabilitaAdmin();
    } catch (err) {
        console.error("Errore salvaIncassoManuale:", err);
        alert("Errore durante il salvataggio dell'incasso: " + err.message);
    }
}

function apriModaleNuovaSpesa() {
    const modal = document.getElementById('cnt-modal-spesa');
    if (modal) {
        modal.classList.remove('epk-hidden');
        document.getElementById('cnt-sps-data').value = new Date().toISOString().split('T')[0];
    }
}

function chiudiModaleNuovaSpesa() {
    const modal = document.getElementById('cnt-modal-spesa');
    if (modal) modal.classList.add('epk-hidden');
}

async function salvaNuovaSpesa(e) {
    e.preventDefault();
    const eventoId = document.getElementById('cnt-sps-evento').value || null;
    const titolo = document.getElementById('cnt-sps-titolo').value.trim();
    const importo = parseFloat(document.getElementById('cnt-sps-importo').value);
    const categoria = document.getElementById('cnt-sps-categoria').value;
    const dataSpesa = document.getElementById('cnt-sps-data').value;

    if (!titolo || !importo || !categoria || !dataSpesa) {
        alert("Compila tutti i campi obbligatori.");
        return;
    }

    try {
        const { error: spsErr } = await supabaseClient
            .from('registro_spese')
            .insert([{
                evento_id: eventoId,
                titolo: titolo,
                importo: importo,
                categoria: categoria,
                data_spesa: dataSpesa,
                registrato_da: currentUser.id
            }]);

        if (spsErr) throw spsErr;

        alert("Spesa registrata con successo!");
        chiudiModaleNuovaSpesa();
        renderContabilitaAdmin();
    } catch (err) {
        console.error("Errore salvaNuovaSpesa:", err);
        alert("Errore durante il salvataggio della spesa: " + err.message);
    }
}

// ------------------------------------------------------------
// DETTAGLIO BILANCIO EVENTO (MODAL / DRAWER)
// ------------------------------------------------------------
function apriDettaglioBilancioEvento(eventoId) {
    contabilitaEventoSelezionatoId = eventoId;
    const ev = contabilitaState.eventi.find(e => e.id === eventoId);
    if (!ev) return;

    const modal = document.getElementById('cnt-modal-dettaglio');
    const titolo = document.getElementById('cnt-det-titolo');

    if (titolo) titolo.innerText = `DETTAGLIO BILANCIO: ${ev.titolo.toUpperCase()}`;

    // Filtra entrate ed uscite per questo evento
    const iscrizioniEv = contabilitaState.iscrizioni.filter(i => i.evento_id === eventoId);
    const ricevutaIds = iscrizioniEv.map(i => i.ricevuta_id).filter(Boolean);
    const ricevuteEv = contabilitaState.ricevute.filter(r => ricevutaIds.includes(r.id) || r.evento_id === eventoId);
    const speseEv = contabilitaState.spese.filter(s => s.evento_id === eventoId);

    let totInc = 0;
    let totSps = 0;
    ricevuteEv.forEach(r => { totInc += (parseFloat(r.importo) || 0); });
    speseEv.forEach(s => { totSps += (parseFloat(s.importo) || 0); });
    const utileNetto = totInc - totSps;

    const kpiInc = document.getElementById('cnt-det-kpi-incassi');
    const kpiSps = document.getElementById('cnt-det-kpi-spese');
    const kpiUtl = document.getElementById('cnt-det-kpi-utile');

    if (kpiInc) kpiInc.innerText = `€ ${totInc.toFixed(2)}`;
    if (kpiSps) kpiSps.innerText = `€ ${totSps.toFixed(2)}`;
    if (kpiUtl) {
        kpiUtl.innerText = `€ ${utileNetto.toFixed(2)}`;
        kpiUtl.style.color = utileNetto >= 0 ? 'var(--epk-gold)' : '#f87171';
    }

    // Render Entrate
    const tbodyEntrate = document.getElementById('cnt-det-tbody-entrate');
    if (tbodyEntrate) {
        if (ricevuteEv.length === 0) {
            tbodyEntrate.innerHTML = '<tr><td colspan="5" style="padding: 10px; text-align: center; color: gray;">Nessun incasso registrato per questo evento.</td></tr>';
        } else {
            tbodyEntrate.innerHTML = ricevuteEv.map(r => {
                const prof = contabilitaState.profili.find(p => p.id === r.utente_id);
                const nomeAtleta = prof ? prof.nome_di_battaglia : 'Incasso Diretto / Esterno';
                const dataPag = r.data_pagamento ? new Date(r.data_pagamento).toLocaleDateString('it-IT') : '-';
                const codice = r.codice_transazione || (r.numero_ricevuta ? `Ric. N.${r.numero_ricevuta}` : 'N/D');

                return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 6px;">${dataPag}</td>
                        <td style="padding: 6px; font-weight: bold; color: var(--epk-parchment);">${nomeAtleta}</td>
                        <td style="padding: 6px;"><span class="epk-version-badge" style="font-size: 8px; margin: 0;">${r.metodo_pagamento || 'STRIPE'}</span></td>
                        <td style="padding: 6px; text-align: right; color: #4ade80; font-weight: bold;">€ ${(parseFloat(r.importo) || 0).toFixed(2)}</td>
                        <td style="padding: 6px; font-size: 9px; color: #aaa;">${codice}</td>
                    </tr>`;
            }).join('');
        }
    }

    // Render Uscite
    const tbodyUscite = document.getElementById('cnt-det-tbody-uscite');
    if (tbodyUscite) {
        if (speseEv.length === 0) {
            tbodyUscite.innerHTML = '<tr><td colspan="4" style="padding: 10px; text-align: center; color: gray;">Nessuna spesa registrata per questo evento.</td></tr>';
        } else {
            tbodyUscite.innerHTML = speseEv.map(s => {
                const dataSps = s.data_spesa ? new Date(s.data_spesa).toLocaleDateString('it-IT') : '-';

                return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 6px;">${dataSps}</td>
                        <td style="padding: 6px; font-weight: bold; color: var(--epk-parchment);">${s.titolo}</td>
                        <td style="padding: 6px;"><span class="epk-version-badge" style="font-size: 8px; margin: 0; background: rgba(248, 113, 113, 0.2); border-color: #f87171; color: #f87171;">${s.categoria}</span></td>
                        <td style="padding: 6px; text-align: right; color: #f87171; font-weight: bold;">€ ${(parseFloat(s.importo) || 0).toFixed(2)}</td>
                    </tr>`;
            }).join('');
        }
    }

    switchDettaglioEventoTab('entrate');
    if (modal) modal.classList.remove('epk-hidden');
}

function switchDettaglioEventoTab(tab) {
    const tabEntrate = document.getElementById('cnt-det-tab-entrate');
    const tabUscite = document.getElementById('cnt-det-tab-uscite');
    const btnEntrate = document.getElementById('cnt-det-tab-btn-entrate');
    const btnUscite = document.getElementById('cnt-det-tab-btn-uscite');

    if (tab === 'entrate') {
        if (tabEntrate) tabEntrate.classList.remove('epk-hidden');
        if (tabUscite) tabUscite.classList.add('epk-hidden');
        if (btnEntrate) { btnEntrate.className = 'epk-btn'; }
        if (btnUscite) { btnUscite.className = 'epk-btn-secondary'; }
    } else {
        if (tabEntrate) tabEntrate.classList.add('epk-hidden');
        if (tabUscite) tabUscite.classList.remove('epk-hidden');
        if (btnEntrate) { btnEntrate.className = 'epk-btn-secondary'; }
        if (btnUscite) { btnUscite.className = 'epk-btn'; }
    }
}

function chiudiDettaglioBilancioEvento() {
    const modal = document.getElementById('cnt-modal-dettaglio');
    if (modal) modal.classList.add('epk-hidden');
}

// ------------------------------------------------------------
// ESPORTAZIONE REPORT CSV
// ------------------------------------------------------------
function esportaCSVContabilita() {
    if (!contabilitaState.eventi || contabilitaState.eventi.length === 0) {
        alert("Nessun dato da esportare.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "N,TITOLO EVENTO,DATA INIZIO,DATA FINE,TICKET EUR,ISCRITTI TOTALI,PAGANTI,INCASSO LORDO EUR,SPESE TOTATORI EUR,UTILE NETTO EUR\n";

    contabilitaState.eventi.forEach((ev, idx) => {
        const iscrizioniEv = contabilitaState.iscrizioni.filter(i => i.evento_id === ev.id);
        const ricevutaIds = iscrizioniEv.map(i => i.ricevuta_id).filter(Boolean);
        const ricevuteEv = contabilitaState.ricevute.filter(r => ricevutaIds.includes(r.id) || r.evento_id === ev.id);
        const speseEvList = contabilitaState.spese.filter(s => s.evento_id === ev.id);

        let incassoEv = 0;
        let speseEv = 0;
        ricevuteEv.forEach(r => { incassoEv += (parseFloat(r.importo) || 0); });
        speseEvList.forEach(s => { speseEv += (parseFloat(s.importo) || 0); });
        const utileEv = incassoEv - speseEv;

        const row = [
            idx + 1,
            `"${ev.titolo.replace(/"/g, '""')}"`,
            ev.data_inizio || '',
            ev.data_fine || '',
            (parseFloat(ev.costo) || 0).toFixed(2),
            iscrizioniEv.length,
            ricevuteEv.length,
            incassoEv.toFixed(2),
            speseEv.toFixed(2),
            utileEv.toFixed(2)
        ];

        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rendiconto_Contabile_EPIKA_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// GESTIONE ESERCITI & SCHIERAMENTI (CAMPO MARTIO)
// ==========================================

let esercitiCacheData = {
    eventoId: null,
    coeff: {
        non_combattente: 0,
        combattente: 1.0,
        armatura_leggera: 1.2,
        armatura_pesante: 1.3,
        arciere_puro: 0.75,
        arciere_ibrido: 1.0
    },
    gruppi: {},      // { "Nome Gruppo": [ { utente_id, nome_battaglia, ruolo, armatura, arciere } ] }
    mercenari: [],   // [ { utente_id, nome_battaglia, ruolo, armatura, arciere } ]
    assegnazioniGruppi: {},    // { "Nome Gruppo": "A" | "B" | null }
    assegnazioniMercenari: {}  // { utente_id: "A" | "B" | null }
};

async function mostraPannelloEserciti(eventoId, eventoTitolo) {
    const panel = document.getElementById('adm-eserciti-panel');
    if (!panel) return;

    apriPannelloEsclusivoAdmin('adm-eserciti-panel');
    document.getElementById('adm-eserciti-titolo').textContent = `GESTIONE ESERCITI & SCHIERAMENTI: ${eventoTitolo.toUpperCase()}`;
    document.getElementById('adm-eserciti-evento-id').value = eventoId;

    esercitiCacheData.eventoId = eventoId;
    esercitiCacheData.coeff = {
        non_combattente: 0,
        combattente: 1.0,
        armatura_leggera: 1.2,
        armatura_pesante: 1.3,
        arciere_puro: 0.75,
        arciere_ibrido: 1.0
    };
    esercitiCacheData.gruppi = {};
    esercitiCacheData.mercenari = [];
    esercitiCacheData.assegnazioniGruppi = {};
    esercitiCacheData.assegnazioniMercenari = {};

    try {
        // 1. Carica iscrizioni dell'evento con profili
        const { data: iscritti, error: errIsc } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .select(`
                utente_id,
                dettagli,
                profilo:epika_profili(nome_di_battaglia, ruolo_combattimento, gruppo_storico_id)
            `)
            .eq('evento_id', eventoId);

        if (errIsc) throw errIsc;

        // Popola datalist con gli atleti iscritti per autocompletamento generali
        const datalist = document.getElementById('adm-eserciti-atleti-datalist');
        if (datalist) {
            datalist.innerHTML = '';
            const nomiUnici = [...new Set((iscritti || []).map(i => (i.profilo?.nome_di_battaglia || '').toUpperCase()).filter(Boolean))].sort();
            nomiUnici.forEach(nome => {
                datalist.innerHTML += `<option value="${nome}">`;
            });
        }

        // 2. Carica anagrafiche gruppi storici
        const { data: gruppiS } = await supabaseClient
            .from('epika_gruppi_storici')
            .select('id, nome');
        const gruppiMappa = {};
        (gruppiS || []).forEach(g => { gruppiMappa[g.id] = g.nome; });

        // 3. Carica la configurazione eserciti salvata da Supabase
        const { data: savedEserciti } = await supabaseClient
            .from('epika_eserciti_eventi')
            .select('*')
            .eq('evento_id', eventoId)
            .maybeSingle();

        if (savedEserciti) {
            document.getElementById('adm-esercito-a-nome').value = savedEserciti.nome_esercito_a || 'ESERCITO A';
            document.getElementById('adm-esercito-a-grido').value = savedEserciti.grido_esercito_a || '';
            document.getElementById('adm-esercito-b-nome').value = savedEserciti.nome_esercito_b || 'ESERCITO B';
            document.getElementById('adm-esercito-b-grido').value = savedEserciti.grido_esercito_b || '';

            const genA = savedEserciti.generali_esercito_a || [];
            if (document.getElementById('adm-esercito-a-gen-1')) document.getElementById('adm-esercito-a-gen-1').value = genA[0] || '';
            if (document.getElementById('adm-esercito-a-gen-2')) document.getElementById('adm-esercito-a-gen-2').value = genA[1] || '';
            if (document.getElementById('adm-esercito-a-gen-3')) document.getElementById('adm-esercito-a-gen-3').value = genA[2] || '';

            const genB = savedEserciti.generali_esercito_b || [];
            if (document.getElementById('adm-esercito-b-gen-1')) document.getElementById('adm-esercito-b-gen-1').value = genB[0] || '';
            if (document.getElementById('adm-esercito-b-gen-2')) document.getElementById('adm-esercito-b-gen-2').value = genB[1] || '';
            if (document.getElementById('adm-esercito-b-gen-3')) document.getElementById('adm-esercito-b-gen-3').value = genB[2] || '';

            if (savedEserciti.coefficienti_forza) {
                esercitiCacheData.coeff = { ...esercitiCacheData.coeff, ...savedEserciti.coefficienti_forza };
            }
            if (savedEserciti.assegnazione_gruppi) {
                esercitiCacheData.assegnazioniGruppi = { ...savedEserciti.assegnazione_gruppi };
            }
            if (savedEserciti.assegnazione_mercenari) {
                esercitiCacheData.assegnazioniMercenari = { ...savedEserciti.assegnazione_mercenari };
            }
        } else {
            document.getElementById('adm-esercito-a-nome').value = 'ESERCITO A';
            document.getElementById('adm-esercito-a-grido').value = '';
            document.getElementById('adm-esercito-b-nome').value = 'ESERCITO B';
            document.getElementById('adm-esercito-b-grido').value = '';

            if (document.getElementById('adm-esercito-a-gen-1')) document.getElementById('adm-esercito-a-gen-1').value = '';
            if (document.getElementById('adm-esercito-a-gen-2')) document.getElementById('adm-esercito-a-gen-2').value = '';
            if (document.getElementById('adm-esercito-a-gen-3')) document.getElementById('adm-esercito-a-gen-3').value = '';
            if (document.getElementById('adm-esercito-b-gen-1')) document.getElementById('adm-esercito-b-gen-1').value = '';
            if (document.getElementById('adm-esercito-b-gen-2')) document.getElementById('adm-esercito-b-gen-2').value = '';
            if (document.getElementById('adm-esercito-b-gen-3')) document.getElementById('adm-esercito-b-gen-3').value = '';
        }

        // 4. Organizza gli atleti
        (iscritti || []).forEach(isc => {
            const prof = isc.profilo || {};
            const dett = isc.dettagli || {};
            const gruppoNome = gruppiMappa[prof.gruppo_storico_id] || 'MERCENARI';
            const nomeBattaglia = prof.nome_di_battaglia || 'Senza Nome';
            const ruolo = prof.ruolo_combattimento || 'non_combattente';
            const armatura = dett.armatura || 'nessuna';
            const arciere = dett.arciere || 'nessuno';

            const atleta = {
                utente_id: isc.utente_id,
                nome_battaglia: nomeBattaglia,
                gruppo: gruppoNome,
                ruolo: ruolo,
                armatura: armatura,
                arciere: arciere
            };

            if (gruppoNome.toUpperCase() === 'MERCENARI') {
                esercitiCacheData.mercenari.push(atleta);
            } else {
                if (!esercitiCacheData.gruppi[gruppoNome]) {
                    esercitiCacheData.gruppi[gruppoNome] = [];
                }
                esercitiCacheData.gruppi[gruppoNome].push(atleta);
            }
        });

        renderTatticaEserciti();

    } catch (e) {
        console.error("Errore caricamento eserciti:", e);
        if (typeof showToast === 'function') showToast("Errore caricamento dati eserciti", "error");
    }
}

function nascondiPannelloEserciti() {
    apriPannelloEsclusivoAdmin(null);
}

function calcolaForzaSingoloAtleta(atleta, coeff) {
    if (atleta.ruolo !== 'combattente') {
        return parseFloat(coeff.non_combattente || 0);
    }
    let p = parseFloat(coeff.combattente || 1.0);
    if (atleta.armatura === 'leggera') {
        p = parseFloat(coeff.armatura_leggera || 1.2);
    } else if (atleta.armatura === 'pesante') {
        p = parseFloat(coeff.armatura_pesante || 1.3);
    }

    if (atleta.arciere === 'puro') {
        p = parseFloat(coeff.arciere_puro || 0.75);
    } else if (atleta.arciere === 'ibrido') {
        p = parseFloat(coeff.arciere_ibrido || 1.0);
    }

    return parseFloat(p.toFixed(2));
}

function calcolaStatisticheGruppo(atletiList) {
    let forza = 0;
    let combattenti = 0;
    let nonCombattenti = 0;

    atletiList.forEach(a => {
        const f = calcolaForzaSingoloAtleta(a, esercitiCacheData.coeff);
        forza += f;
        if (a.ruolo === 'combattente') combattenti++;
        else nonCombattenti++;
    });

    return {
        forza: parseFloat(forza.toFixed(2)),
        combattenti: combattenti,
        nonCombattenti: nonCombattenti,
        totale: atletiList.length
    };
}

function renderTatticaEserciti() {
    const colA = document.getElementById('adm-esercito-a-gruppi-list');
    const colB = document.getElementById('adm-esercito-b-gruppi-list');
    const colPool = document.getElementById('adm-eserciti-pool-gruppi-list');
    const mercList = document.getElementById('adm-eserciti-mercenari-list');

    if (!colA || !colB || !colPool || !mercList) return;

    colA.innerHTML = '';
    colB.innerHTML = '';
    colPool.innerHTML = '';
    mercList.innerHTML = '';

    // Render Gruppi
    const gruppiNomi = Object.keys(esercitiCacheData.gruppi).sort();
    
    if (gruppiNomi.length === 0) {
        colPool.innerHTML = '<p style="font-size: 10px; color: gray; text-align: center;">Nessun gruppo iscritto all\'evento.</p>';
    }

    gruppiNomi.forEach(gNome => {
        const atleti = esercitiCacheData.gruppi[gNome];
        const stats = calcolaStatisticheGruppo(atleti);
        const schieramento = esercitiCacheData.assegnazioniGruppi[gNome] || null;

        const cardHtml = `
            <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(251, 191, 36, 0.2); padding: 10px; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 11px; font-weight: bold; color: var(--epk-gold); text-transform: uppercase;">${gNome}</span>
                    <span style="font-size: 10px; font-family: monospace; color: #60a5fa;">+${stats.forza} pts</span>
                </div>
                <div style="font-size: 9px; color: rgba(245, 230, 200, 0.6); margin-bottom: 8px;">
                    ⚔️ ${stats.combattenti} Combattenti | 🛡️ ${stats.nonCombattenti} Non Comb.
                </div>
                <div style="display: flex; gap: 4px;">
                    ${schieramento === 'A' ? 
                        `<button class="epk-btn-secondary" onclick="impostaGruppoSchieramento('${gNome.replace(/'/g, "\\'")}', null)" style="font-size: 9px; padding: 4px 8px; width: 100%;">← RIMUOVI</button>` :
                        `<button class="epk-btn" onclick="impostaGruppoSchieramento('${gNome.replace(/'/g, "\\'")}', 'A')" style="font-size: 9px; padding: 4px 8px; background: #1e3a8a; border-color: #3b82f6; flex: 1;">← AD ESERCITO A</button>`
                    }
                    ${schieramento === 'B' ? 
                        `<button class="epk-btn-secondary" onclick="impostaGruppoSchieramento('${gNome.replace(/'/g, "\\'")}', null)" style="font-size: 9px; padding: 4px 8px; width: 100%;">RIMUOVI →</button>` :
                        `<button class="epk-btn" onclick="impostaGruppoSchieramento('${gNome.replace(/'/g, "\\'")}', 'B')" style="font-size: 9px; padding: 4px 8px; background: #88242b; border-color: #ef4444; flex: 1;">AD ESERCITO B →</button>`
                    }
                </div>
            </div>
        `;

        if (schieramento === 'A') {
            colA.innerHTML += cardHtml;
        } else if (schieramento === 'B') {
            colB.innerHTML += cardHtml;
        } else {
            colPool.innerHTML += cardHtml;
        }
    });

    // Render Mercenari Singoli
    if (esercitiCacheData.mercenari.length === 0) {
        mercList.innerHTML = '<p style="font-size: 10px; color: gray; text-align: center; grid-column: 1 / -1;">Nessun mercenario iscritto a questo evento.</p>';
    }

    esercitiCacheData.mercenari.forEach(m => {
        const forzaM = calcolaForzaSingoloAtleta(m, esercitiCacheData.coeff);
        const schieramentoM = esercitiCacheData.assegnazioniMercenari[m.utente_id] || '';

        const badgeRuolo = m.ruolo === 'combattente' ? 
            `<span style="color: var(--epk-gold); font-size: 9px;">COMBATTENTE (${m.armatura.toUpperCase()})</span>` : 
            `<span style="color: gray; font-size: 9px;">NON COMBATTENTE</span>`;

        mercList.innerHTML += `
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; font-weight: bold; color: var(--epk-gold);">${m.nome_battaglia.toUpperCase()}</span>
                        <span style="font-size: 10px; font-family: monospace; color: #60a5fa;">+${forzaM} pts</span>
                    </div>
                    <div style="margin-top: 2px;">${badgeRuolo}</div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="epk-btn" onclick="impostaMercenarioSchieramento('${m.utente_id}', 'A')" style="font-size: 9px; padding: 4px 6px; flex: 1; ${schieramentoM === 'A' ? 'background: #1e3a8a; border-color: #3b82f6;' : 'background: transparent; opacity: 0.5;'}">ESERCITO A</button>
                    <button class="epk-btn-secondary" onclick="impostaMercenarioSchieramento('${m.utente_id}', '')" style="font-size: 9px; padding: 4px 6px; ${schieramentoM === '' ? 'border-color: var(--epk-gold); color: var(--epk-gold);' : 'opacity: 0.5;'}">FREE</button>
                    <button class="epk-btn" onclick="impostaMercenarioSchieramento('${m.utente_id}', 'B')" style="font-size: 9px; padding: 4px 6px; flex: 1; ${schieramentoM === 'B' ? 'background: #88242b; border-color: #ef4444;' : 'background: transparent; opacity: 0.5;'}">ESERCITO B</button>
                </div>
            </div>
        `;
    });

    aggiornaCalcoliEserciti();
}

function impostaGruppoSchieramento(gNome, schieramento) {
    if (schieramento) {
        esercitiCacheData.assegnazioniGruppi[gNome] = schieramento;
    } else {
        delete esercitiCacheData.assegnazioniGruppi[gNome];
    }
    renderTatticaEserciti();
}

function impostaMercenarioSchieramento(utenteId, schieramento) {
    if (schieramento) {
        esercitiCacheData.assegnazioniMercenari[utenteId] = schieramento;
    } else {
        delete esercitiCacheData.assegnazioniMercenari[utenteId];
    }
    renderTatticaEserciti();
}

function aggiornaCalcoliEserciti() {
    const nomeA = (document.getElementById('adm-esercito-a-nome')?.value || 'ESERCITO A').trim().toUpperCase();
    const nomeB = (document.getElementById('adm-esercito-b-nome')?.value || 'ESERCITO B').trim().toUpperCase();

    const genA = [
        document.getElementById('adm-esercito-a-gen-1')?.value.trim(),
        document.getElementById('adm-esercito-a-gen-2')?.value.trim(),
        document.getElementById('adm-esercito-a-gen-3')?.value.trim()
    ].filter(Boolean);

    const genB = [
        document.getElementById('adm-esercito-b-gen-1')?.value.trim(),
        document.getElementById('adm-esercito-b-gen-2')?.value.trim(),
        document.getElementById('adm-esercito-b-gen-3')?.value.trim()
    ].filter(Boolean);

    const titleA = document.getElementById('adm-esercito-a-col-titolo');
    if (titleA) {
        titleA.innerHTML = `${nomeA} (GRUPPI)<br><span style="font-size:9px; color:rgba(147,197,253,0.8); font-family:sans-serif; text-transform:none;">👑 GENERALI: ${genA.length ? genA.join(' | ') : 'Nessuno'}</span>`;
    }

    const titleB = document.getElementById('adm-esercito-b-col-titolo');
    if (titleB) {
        titleB.innerHTML = `${nomeB} (GRUPPI)<br><span style="font-size:9px; color:rgba(252,165,165,0.8); font-family:sans-serif; text-transform:none;">👑 GENERALI: ${genB.length ? genB.join(' | ') : 'Nessuno'}</span>`;
    }

    let forzaA = 0;
    let combA = 0;
    let forzaB = 0;
    let combB = 0;

    // Calcolo Gruppi
    Object.keys(esercitiCacheData.gruppi).forEach(gNome => {
        const schieramento = esercitiCacheData.assegnazioniGruppi[gNome];
        const atleti = esercitiCacheData.gruppi[gNome];
        atleti.forEach(a => {
            const f = calcolaForzaSingoloAtleta(a, esercitiCacheData.coeff);
            if (schieramento === 'A') {
                forzaA += f;
                if (a.ruolo === 'combattente') combA++;
            } else if (schieramento === 'B') {
                forzaB += f;
                if (a.ruolo === 'combattente') combB++;
            }
        });
    });

    // Calcolo Mercenari
    esercitiCacheData.mercenari.forEach(m => {
        const schieramento = esercitiCacheData.assegnazioniMercenari[m.utente_id];
        const f = calcolaForzaSingoloAtleta(m, esercitiCacheData.coeff);
        if (schieramento === 'A') {
            forzaA += f;
            if (m.ruolo === 'combattente') combA++;
        } else if (schieramento === 'B') {
            forzaB += f;
            if (m.ruolo === 'combattente') combB++;
        }
    });

    forzaA = parseFloat(forzaA.toFixed(2));
    forzaB = parseFloat(forzaB.toFixed(2));

    const badgeA = document.getElementById('adm-esercito-a-badge');
    const badgeB = document.getElementById('adm-esercito-b-badge');
    if (badgeA) badgeA.textContent = `FORZA: ${forzaA} pts | ${combA} COMBATTENTI`;
    if (badgeB) badgeB.textContent = `FORZA: ${forzaB} pts | ${combB} COMBATTENTI`;

    // Aggiorna VS Delta Indicator
    const deltaEl = document.getElementById('adm-eserciti-vs-delta');
    if (deltaEl) {
        const diff = parseFloat((forzaA - forzaB).toFixed(2));
        if (diff === 0) {
            deltaEl.textContent = 'PERFETTAMENTE BILANCIATI';
            deltaEl.style.color = 'var(--epk-gold)';
        } else if (diff > 0) {
            deltaEl.textContent = `+${diff} FORZA A PER ${nomeA}`;
            deltaEl.style.color = '#60a5fa';
        } else {
            deltaEl.textContent = `+${Math.abs(diff)} FORZA A PER ${nomeB}`;
            deltaEl.style.color = '#f87171';
        }
    }
}

function apriModalCofficientiEserciti() {
    const c = esercitiCacheData.coeff;
    if (document.getElementById('coeff-non-combattente')) document.getElementById('coeff-non-combattente').value = c.non_combattente;
    if (document.getElementById('coeff-combattente')) document.getElementById('coeff-combattente').value = c.combattente;
    if (document.getElementById('coeff-armatura-leggera')) document.getElementById('coeff-armatura-leggera').value = c.armatura_leggera;
    if (document.getElementById('coeff-armatura-pesante')) document.getElementById('coeff-armatura-pesante').value = c.armatura_pesante;
    if (document.getElementById('coeff-arciere-puro')) document.getElementById('coeff-arciere-puro').value = c.arciere_puro;
    if (document.getElementById('coeff-arciere-ibrido')) document.getElementById('coeff-arciere-ibrido').value = c.arciere_ibrido;

    document.getElementById('adm-eserciti-coeff-modal')?.classList.remove('epk-hidden');
}

function chiudiModalCofficientiEserciti() {
    document.getElementById('adm-eserciti-coeff-modal')?.classList.add('epk-hidden');
}

function confermaCoefficientiEserciti() {
    esercitiCacheData.coeff = {
        non_combattente: parseFloat(document.getElementById('coeff-non-combattente')?.value || 0),
        combattente: parseFloat(document.getElementById('coeff-combattente')?.value || 1.0),
        armatura_leggera: parseFloat(document.getElementById('coeff-armatura-leggera')?.value || 1.2),
        armatura_pesante: parseFloat(document.getElementById('coeff-armatura-pesante')?.value || 1.3),
        arciere_puro: parseFloat(document.getElementById('coeff-arciere-puro')?.value || 0.75),
        arciere_ibrido: parseFloat(document.getElementById('coeff-arciere-ibrido')?.value || 1.0)
    };

    chiudiModalCofficientiEserciti();
    renderTatticaEserciti();
    if (typeof showToast === 'function') showToast("Coefficienti di forza aggiornati!", "success");
}

async function salvaSchieramentiEserciti() {
    const eventoId = esercitiCacheData.eventoId;
    if (!eventoId) return;

    const genA = [
        document.getElementById('adm-esercito-a-gen-1')?.value.trim(),
        document.getElementById('adm-esercito-a-gen-2')?.value.trim(),
        document.getElementById('adm-esercito-a-gen-3')?.value.trim()
    ].filter(Boolean);

    const genB = [
        document.getElementById('adm-esercito-b-gen-1')?.value.trim(),
        document.getElementById('adm-esercito-b-gen-2')?.value.trim(),
        document.getElementById('adm-esercito-b-gen-3')?.value.trim()
    ].filter(Boolean);

    const payload = {
        evento_id: eventoId,
        nome_esercito_a: (document.getElementById('adm-esercito-a-nome')?.value || 'ESERCITO A').trim(),
        grido_esercito_a: (document.getElementById('adm-esercito-a-grido')?.value || '').trim(),
        nome_esercito_b: (document.getElementById('adm-esercito-b-nome')?.value || 'ESERCITO B').trim(),
        grido_esercito_b: (document.getElementById('adm-esercito-b-grido')?.value || '').trim(),
        generali_esercito_a: genA,
        generali_esercito_b: genB,
        coefficienti_forza: esercitiCacheData.coeff,
        assegnazione_gruppi: esercitiCacheData.assegnazioniGruppi,
        assegnazione_mercenari: esercitiCacheData.assegnazioniMercenari,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient
            .from('epika_eserciti_eventi')
            .upsert(payload, { onConflict: 'evento_id' });

        if (error) throw error;

        if (typeof showToast === 'function') showToast("⚔️ Schieramenti, generali e gridi di battaglia salvati con successo!", "success");
    } catch (err) {
        console.error("Errore salvataggio eserciti:", err);
        if (typeof showToast === 'function') showToast("Errore durante il salvataggio degli eserciti", "error");
    }
}




