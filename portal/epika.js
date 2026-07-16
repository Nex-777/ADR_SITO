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
let gruppiLavoro = [];
let isEpikaAdmin = false;
let tesseratiCache = [];
let scabStrutture = [];
let soggettiValidatori = [];
let soggettiAllenatori = [];
let soggettiAllievi = [];
let abbinamentiState = {};

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

        // Gestione switcher di vista per admin
        if (isEpikaAdmin) {
            const adminSwitcher = document.getElementById('epk-admin-switcher');
            adminSwitcher.classList.remove('epk-hidden');
            
            // Se l'URL contiene ?admin=true, visualizza direttamente la vista admin
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('admin') === 'true') {
                adminSwitcher.value = 'admin';
            }
        }

        // Nascondi loader iniziale
        document.getElementById('epk-loader').classList.add('epk-hidden');

        if (epikaProfile && epikaProfile.profilo_completato) {
            // Profilo già completato, mostra dashboard
            currentUserProfile = epikaProfile;
            document.getElementById('epk-user-battle-name').textContent = `~ ${epikaProfile.nome_di_battaglia} ~`;
            
            const viewMode = document.getElementById('epk-admin-switcher').value || 'athlete';
            if (viewMode === 'admin') {
                document.getElementById('epk-admin').classList.remove('epk-hidden');
                await renderAdminDashboard();
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

// Switch tra Vista Atleta e Vista Amministratore
async function switchEpikaView(view) {
    document.getElementById('epk-main').classList.add('epk-hidden');
    document.getElementById('epk-admin').classList.add('epk-hidden');
    
    if (view === 'admin') {
        document.getElementById('epk-admin').classList.remove('epk-hidden');
        await renderAdminDashboard();
    } else {
        document.getElementById('epk-main').classList.remove('epk-hidden');
        await renderAthleteDashboard();
    }
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

        const allenatoriLista = allenatori || [];

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
// FASE 4 — LOGICA DASHBOARD ATLETA
// ===========================================================================

async function renderAthleteDashboard() {
    try {
        const { data: prof, error: profError } = await supabaseClient
            .from('epika_profili')
            .select(`
                *,
                gruppo_storico:epika_gruppi_storici(nome),
                allenatore:epika_opzioni(valore)
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
            .gte('data_evento', todayStr)
            .order('data_evento', { ascending: true });

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
            const dataFormattata = formattaData(evt.data_evento);
            
            const btnHtml = isIscritto 
                ? `<button class="epk-btn-secondary" style="border-color: var(--epk-gold); color: var(--epk-gold); cursor: default;" disabled>ISCRITTO ✓</button>`
                : `<button class="epk-btn" onclick="iscrivitiEvento('${evt.id}')">ISCRIVITI</button>`;

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

async function iscrivitiEvento(eventoId) {
    try {
        const { error } = await supabaseClient
            .from('epika_iscrizioni_eventi')
            .insert({
                evento_id: eventoId,
                utente_id: currentUser.id
            });

        if (error) {
            if (error.code === '23505') {
                alert("Sei già iscritto a questo evento!");
            } else {
                throw error;
            }
        } else {
            alert("Iscrizione completata con successo!");
            await caricaEventiDisponibili();
        }
    } catch (e) {
        console.error("Errore iscrizione evento:", e);
        alert("Impossibile completare l'iscrizione. Riprova più tardi.");
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

        // Carica il tab attivo
        switchAdminTab(activeAdminTab);

    } catch (err) {
        console.error("Errore renderAdminDashboard:", err);
    }
}

function switchAdminTab(tab) {
    activeAdminTab = tab;
    
    // Rimuove classe active da tutti i bottoni e nasconde tutti i pannelli
    document.querySelectorAll('.epk-sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.epk-admin-tab-panel').forEach(panel => panel.classList.add('epk-hidden'));
    
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
                                    <input type="checkbox" id="chk-adm-${g.id}-${m.id}" ${m.is_admin_epika ? 'checked' : ''} onchange="salvaStatoAdminInverso('${m.id}', this.checked)" style="cursor: pointer; transform: scale(0.9);">
                                    <label for="chk-adm-${g.id}-${m.id}" style="font-size: 8px; font-weight: bold; color: var(--epk-gold); cursor: pointer; text-transform: uppercase;">ADMIN</label>
                                </div>
                                ` : ''}
                                ${!isAutoCompiled ? `
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
            } else {
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

        if (s.tipo === 'palestra') {
            const refSelect = `<select id="select-pal-ref-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;">${generaOpzioniSoggetti(soggettiAllenatori, abb.allenatore_ref_id)}</select>`;
            const valSelect = `<select id="select-pal-val-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;">${generaOpzioniSoggetti(soggettiValidatori, abb.validatore_id)}</select>`;

            palestreBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 8px; font-weight: bold; color: var(--epk-gold);">${s.nome.toUpperCase()}</td>
                    <td style="padding: 8px;">${refSelect}</td>
                    <td style="padding: 8px;">${valSelect}</td>
                    <td style="padding: 8px;">
                        <div id="container-co-${s.id}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                        <button class="epk-btn-secondary" style="font-size: 10px; padding: 2px 6px; margin-top: 4px;" onclick="mostraSelectAggiunta(${s.id}, 'co')">+</button>
                        <div id="add-co-${s.id}" class="epk-hidden" style="margin-top:4px;"></div>
                    </td>
                    <td style="padding: 8px;">
                        <div id="container-all-${s.id}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                        <button class="epk-btn-secondary" style="font-size: 10px; padding: 2px 6px; margin-top: 4px;" onclick="mostraSelectAggiunta(${s.id}, 'all')">+</button>
                        <div id="add-all-${s.id}" class="epk-hidden" style="margin-top:4px;"></div>
                    </td>
                    <td style="padding: 8px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <button class="epk-btn" style="font-size: 8px; padding: 6px; width: 100%; border-radius: 2px;" onclick="salvaAbbinamentoSCAB(${s.id}, 'palestra')">SALVA</button>
                            <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px; width: 100%; border-radius: 2px; color: #ff4d4d; border-color: rgba(255,77,77,0.3);" onclick="pulisciAbbinamentoSCAB(${s.id})">PULISCI</button>
                        </div>
                    </td>
                </tr>`;
        } else {
            const allRefSelect = `<select id="select-cp-ref-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;">${generaOpzioniSoggetti(soggettiAllievi, abb.allievo_ref_id)}</select>`;
            const alnSelect = `<select id="select-cp-aln-${s.id}" class="epk-input" style="padding: 4px; font-size: 11px;">${generaOpzioniSoggetti(soggettiAllenatori, abb.allenatore_ref_id)}</select>`;

            centriBody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 8px; font-weight: bold; color: var(--epk-gold);">${s.nome.toUpperCase()}</td>
                    <td style="padding: 8px;">${allRefSelect}</td>
                    <td style="padding: 8px;">${alnSelect}</td>
                    <td style="padding: 8px;">
                        <div id="container-all-${s.id}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                        <button class="epk-btn-secondary" style="font-size: 10px; padding: 2px 6px; margin-top: 4px;" onclick="mostraSelectAggiunta(${s.id}, 'all')">+</button>
                        <div id="add-all-${s.id}" class="epk-hidden" style="margin-top:4px;"></div>
                    </td>
                    <td style="padding: 8px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <button class="epk-btn" style="font-size: 8px; padding: 6px; width: 100%; border-radius: 2px;" onclick="salvaAbbinamentoSCAB(${s.id}, 'centro_pratica')">SALVA</button>
                            <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px; width: 100%; border-radius: 2px; color: #ff4d4d; border-color: rgba(255,77,77,0.3);" onclick="pulisciAbbinamentoSCAB(${s.id})">PULISCI</button>
                        </div>
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
            container.innerHTML += `
                <div style="background: rgba(201,168,76,0.1); border: 1px solid var(--epk-gold); padding: 2px 6px; font-size: 10px; border-radius: 2px; display: flex; align-items: center; gap: 4px;">
                    ${sogg.valore.toUpperCase()}
                    <span style="cursor: pointer; color: #ff4d4d; font-weight: bold;" onclick="rimuoviToken(${strutturaId}, '${tipo}', ${id})">&times;</span>
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


// A — Gestione Ruoli (CRUD)
async function renderRuoliAdmin() {
    const container = document.getElementById('adm-allenatori-list');
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
            
            const html = `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(251, 191, 36, 0.1); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13px; font-weight: bold; ${s.attivo ? '' : 'text-decoration: line-through; opacity: 0.5;'}">${s.valore.toUpperCase()}</span>
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
        const { data: eventi, error } = await supabaseClient
            .from('epika_eventi')
            .select('*')
            .order('data_evento', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        (eventi || []).forEach(evt => {
            const dataFormattata = formattaData(evt.data_evento);
            const statusStyle = evt.attivo ? 'color: #ff4d4d; border-color: rgba(255, 77, 77, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);';
            const statusText = evt.attivo ? 'DISATTIVA' : 'ATTIVA';

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
                            <button class="epk-btn" style="padding: 6px 12px; font-size: 9px;" onclick="mostraPannelloPresenze('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')">GESTISCI PRESENZE</button>
                            <button class="epk-btn-secondary" style="font-size: 9px; padding: 6px 12px; ${statusStyle}" onclick="toggleStatoEvento('${evt.id}', ${evt.attivo})">${statusText}</button>
                        </div>
                    </div>
                </div>`;
        });

    } catch (err) {
        console.error("Errore caricamento eventi admin:", err);
    }
}

function mostraFormCreaEvento() {
    document.getElementById('adm-evento-form-container').classList.remove('epk-hidden');
    // Set default date check
    document.getElementById('evt-data').value = new Date().toISOString().split('T')[0];
}

function nascondiFormCreaEvento() {
    document.getElementById('adm-evento-form-container').classList.add('epk-hidden');
}

async function salvaEventoStorico() {
    const titolo = document.getElementById('evt-titolo').value.trim();
    const luogo = document.getElementById('evt-luogo').value.trim();
    const data = document.getElementById('evt-data').value;
    const tipo = document.getElementById('evt-tipo').value;
    const descrizione = document.getElementById('evt-descrizione').value.trim();

    if (!titolo || !luogo || !data || !tipo) {
        alert("Compila tutti i campi obbligatori dell'evento.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_eventi')
            .insert({
                titolo: titolo,
                luogo: luogo,
                data_evento: data,
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

// D — Conferma Presenze Evento
async function mostraPannelloPresenze(eventoId, eventoTitolo) {
    const panel = document.getElementById('adm-presenze-panel');
    document.getElementById('adm-presenze-titolo').textContent = `CONFERMA PRESENZE: ${eventoTitolo.toUpperCase()}`;
    document.getElementById('adm-presenze-evento-id').value = eventoId;
    
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

            const infoText = document.createElement('div');
            infoText.innerHTML = `<strong style="color: var(--epk-gold);">${g.nome}</strong> <span style="font-size: 11px; color: #a1a1aa; margin-left: 8px;">(${g.popolo || 'Mercenari'})</span> <span style="font-size: 10px; color: #71717a; margin-left: 12px;">Capogruppo: ${capoNome}</span>`;
            
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
    
    try {
        const { error } = await supabaseClient
            .from('epika_gruppi_storici')
            .update({
                data_inizio_formazione: dataFormazioneDal,
                data_fine_formazione: dataFormazioneAl,
                data_inizio_ufficiale: dataUfficialeDal,
                data_fine_ufficiale: dataUfficialeAl
            })
            .eq('id', gruppoId);
            
        if (error) throw error;
        
        alert("Date di attività salvate con successo!");
        await caricaLookupDati();
        
    } catch (e) {
        console.error("Errore salvataggio date gruppo:", e);
        alert("Errore durante il salvataggio delle date.");
    }
}
