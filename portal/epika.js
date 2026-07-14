// ===========================================================================
// EPIKA PORTAL JAVASCRIPT
// ===========================================================================

const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentUserProfile = null;
let gruppiStorici = [];
let gruppiLavoro = [];
let isEpikaAdmin = false;

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

        // Recupera info utente reale ed enum dei ruoli Adrenalina
        const { data: userData, error: userError } = await supabaseClient
            .from('utenti')
            .select('nome, cognome, ruolo')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (userData) {
            document.getElementById('epk-user-real-name').textContent = `${userData.nome} ${userData.cognome}`;
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

        if (gError) throw gError;
        gruppiStorici = gruppi || [];

        const selectGruppo = document.getElementById('fa-gruppo-storico');
        selectGruppo.innerHTML = '<option value="" disabled selected>SELEZIONA</option>';
        gruppiStorici.forEach(g => {
            selectGruppo.innerHTML += `<option value="${g.id}">${g.nome}</option>`;
        });

        // Carica Allenatori
        const { data: allenatori, error: aError } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .eq('tipo', 'allenatore')
            .eq('attivo', true);

        if (aError) throw aError;

        const selectAllenatore = document.getElementById('fa-allenatore');
        selectAllenatore.innerHTML = '<option value="" disabled selected>SELEZIONA</option>';
        (allenatori || []).forEach(a => {
            selectAllenatore.innerHTML += `<option value="${a.id}">${a.valore}</option>`;
        });

    } catch (err) {
        console.error("Errore caricamento dati lookup:", err);
        alert("Errore durante il recupero dei dati del tempio. Riprova più tardi.");
    }
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
                gruppo_lavoro:epika_gruppi_lavoro(nome),
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
        document.getElementById('epk-prof-lavoro').textContent = prof.gruppo_lavoro ? prof.gruppo_lavoro.nome : 'NESSUN INCARICO';

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

async function renderAdminDashboard() {
    try {
        // Carica la lista dei gruppi di lavoro per il selettore nomine
        const { data: gruppiL, error: glError } = await supabaseClient
            .from('epika_gruppi_lavoro')
            .select('*')
            .eq('attivo', true)
            .order('ordine', { ascending: true });

        if (!glError) {
            gruppiLavoro = gruppiL || [];
        }

        // Esegui le viste in ordine
        await renderAllenatoriAdmin();
        await renderTesseratiNomine();
        await renderEventiAdmin();
        await renderOrganigrammaMermaid();

    } catch (err) {
        console.error("Errore renderAdminDashboard:", err);
    }
}

// A — Gestione Allenatori (CRUD)
async function renderAllenatoriAdmin() {
    const container = document.getElementById('adm-allenatori-list');
    try {
        const { data: allenatori, error } = await supabaseClient
            .from('epika_opzioni')
            .select('*')
            .eq('tipo', 'allenatore')
            .order('attivo', { ascending: false })
            .order('valore', { ascending: true });

        if (error) throw error;

        container.innerHTML = '';
        (allenatori || []).forEach(a => {
            const statusText = a.attivo ? 'DISATTIVA' : 'ATTIVA';
            const statusClass = a.attivo ? 'color: #ff4d4d; border-color: rgba(255, 77, 77, 0.4);' : 'color: #22c55e; border-color: rgba(34, 197, 94, 0.4);';
            
            container.innerHTML += `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(251, 191, 36, 0.1); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13px; font-weight: bold; ${a.attivo ? '' : 'text-decoration: line-through; opacity: 0.5;'}">${a.valore.toUpperCase()}</span>
                    <button class="epk-btn-secondary" style="font-size: 8px; padding: 4px 8px; ${statusClass}" onclick="toggleStatoAllenatore('${a.id}', ${a.attivo})">
                        ${statusText}
                    </button>
                </div>`;
        });

    } catch (err) {
        console.error("Errore caricamento allenatori admin:", err);
    }
}

async function creaAllenatore() {
    const input = document.getElementById('adm-new-allenatore');
    const valore = input.value.trim();
    if (!valore) {
        alert("Inserisci un nome valido per l'allenatore.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('epika_opzioni')
            .insert({
                tipo: 'allenatore',
                valore: valore
            });

        if (error) throw error;

        input.value = '';
        alert("Allenatore aggiunto con successo!");
        await renderAllenatoriAdmin();

    } catch (err) {
        console.error("Errore inserimento allenatore:", err);
        alert("Impossibile salvare l'allenatore. Riprova.");
    }
}

async function toggleStatoAllenatore(id, statoAttuale) {
    try {
        const { error } = await supabaseClient
            .from('epika_opzioni')
            .update({ attivo: !statoAttuale })
            .eq('id', id);

        if (error) throw error;
        await renderAllenatoriAdmin();
    } catch (err) {
        console.error("Errore aggiornamento allenatore:", err);
    }
}

// B — Gestione Nomine Gruppi di Lavoro e Admin
async function renderTesseratiNomine() {
    const container = document.getElementById('adm-tesserati-nomine-list');
    try {
        // Query di tutti i profili EPIKA registrati
        const { data: profili, error } = await supabaseClient
            .from('epika_profili')
            .select('*')
            .eq('profilo_completato', true)
            .order('nome_di_battaglia', { ascending: true });

        if (error) throw error;

        // Recupera le anagrafiche reali degli utenti
        const uids = (profili || []).map(p => p.id);
        let utentiMappa = {};
        if (uids.length > 0) {
            const { data: utentiD } = await supabaseClient
                .from('utenti')
                .select('id, nome, cognome')
                .in('id', uids);
            (utentiD || []).forEach(u => { utentiMappa[u.id] = `${u.nome} ${u.cognome}`; });
        }

        container.innerHTML = '';
        (profili || []).forEach(p => {
            const realName = utentiMappa[p.id] || 'N/D';
            
            // Crea le opzioni per la dropdown dei gruppi di lavoro
            let optHTML = '<option value="">-- NESSUNO --</option>';
            gruppiLavoro.forEach(g => {
                const selected = p.gruppo_lavoro_id === g.id ? 'selected' : '';
                optHTML += `<option value="${g.id}" ${selected}>${g.nome.toUpperCase()}</option>`;
            });

            container.innerHTML += `
                <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); padding: 12px; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <span class="epk-headline" style="font-size: 13px; color: var(--epk-gold); font-family: 'Cinzel', serif;">${p.nome_di_battaglia}</span>
                            <span style="font-size: 10px; display: block; color: rgba(245, 230, 200, 0.5); uppercase; margin-top: 2px;">Real: ${realName.toUpperCase()}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="checkbox" id="check-admin-${p.id}" ${p.is_admin_epika ? 'checked' : ''} onchange="salvaStatoAdmin('${p.id}', this.checked)" style="cursor: pointer;">
                            <label for="check-admin-${p.id}" style="font-size: 9px; font-weight: bold; color: var(--epk-gold); text-transform: uppercase; cursor: pointer;">ADMIN</label>
                        </div>
                    </div>
                    <div>
                        <label class="epk-label" style="font-size: 8px; margin-bottom: 2px;">Gruppo Lavoro</label>
                        <select class="epk-input" style="padding: 6px; font-size: 11px; text-transform: uppercase;" onchange="salvaNominaLavoro('${p.id}', this.value)">
                            ${optHTML}
                        </select>
                    </div>
                </div>`;
        });

    } catch (err) {
        console.error("Errore caricamento nomine admin:", err);
    }
}

async function salvaNominaLavoro(utenteId, gruppoLavoroId) {
    try {
        const val = gruppoLavoroId ? parseInt(gruppoLavoroId) : null;
        const { error } = await supabaseClient
            .from('epika_profili')
            .update({ gruppo_lavoro_id: val })
            .eq('id', utenteId);

        if (error) throw error;
        
        // Rigenera l'organigramma Mermaid per riflettere le modifiche
        await renderOrganigrammaMermaid();
    } catch (e) {
        console.error("Errore salvataggio nomina:", e);
    }
}

async function salvaStatoAdmin(utenteId, isChecked) {
    try {
        const { error } = await supabaseClient
            .from('epika_profili')
            .update({ is_admin_epika: isChecked })
            .eq('id', utenteId);

        if (error) throw error;
        alert(`Privilegi amministratore EPIKA aggiornati.`);
    } catch (e) {
        console.error("Errore salvataggio stato admin:", e);
        alert("Errore durante l'aggiornamento dei ruoli amministrativi.");
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
            .select('nome_di_battaglia, gruppo_lavoro_id')
            .eq('profilo_completato', true)
            .not('gruppo_lavoro_id', 'is', null);

        if (pError) throw pError;

        // Raggruppa i profili per gruppo di lavoro ID
        const membriMappa = {};
        (profili || []).forEach(p => {
            if (!membriMappa[p.gruppo_lavoro_id]) {
                membriMappa[p.gruppo_lavoro_id] = [];
            }
            membriMappa[p.gruppo_lavoro_id].push(p.nome_di_battaglia);
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
