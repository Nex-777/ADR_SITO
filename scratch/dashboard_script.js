
        // Supabase Initialization
        if (typeof APP_CONFIG === 'undefined') {
            window.APP_CONFIG = {
                SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
                SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYXRlZ21rZWxxbWV4ZXRwYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjk0NDAsImV4cCI6MjA5NTMwNTQ0MH0.jeRMwUwK5GQXKiiZNIJlag3oeWej_rTg8EaYZi4QhpM",
                API_BASE_URL: "https://portal.adrenalinaclub.it",
                VERSION: "1.05.05"
            };
        }
        const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
        const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        }

        function getCertInfo(anag) {
            if (!anag) return null;
            if (!anag.certificati_medici) return null;
            if (Array.isArray(anag.certificati_medici)) {
                return anag.certificati_medici.length > 0 ? anag.certificati_medici[0] : null;
            }
            return anag.certificati_medici;
        }

        async function openSignedFile(bucket, filePath) {
            try {
                if (!filePath) {
                    alert("Percorso file non valido.");
                    return;
                }
                // Verify bucket is safe
                if (bucket !== 'certificati_medici') {
                    alert("Bucket non autorizzato.");
                    return;
                }
                let parsedPath = filePath;
                if (filePath.includes('/storage/v1/object/public/')) {
                    parsedPath = filePath.split(`/storage/v1/object/public/${bucket}/`)[1];
                } else if (filePath.includes(`/storage/v1/object/sign/`)) {
                    parsedPath = filePath.split(`/storage/v1/object/sign/${bucket}/`)[1].split('?')[0];
                }
                
                const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(parsedPath, 300);
                if (error) throw error;
                window.open(data.signedUrl, '_blank');
            } catch (err) {
                console.error("Errore generazione signed URL:", err);
                alert("Impossibile caricare il file. Riprova.");
            }
        }

        let currentUser = null;
        let currentUserProfile = null;
        let userRoles = []; // array of roles
        
        let sociData = [];
        let tesseratiData = [];
        let quoteData = [];
        let direttivoData = [];
        let bilanciData = [];
        let contabilitaData = [];

        let sociSort = { field: 'id_socio', direction: 'asc' };
        let tesseratiSort = { field: 'id_tesserato', direction: 'asc' };
        let quoteSort = { field: 'nominativo', direction: 'asc' };
        let direttivoSort = { field: 'nominativo', direction: 'asc' };
        let bilanciSort = { field: 'anno', direction: 'desc' };
        let contabilitaSort = { field: 'data', direction: 'desc' };

        // Helper per la scrittura dei log di audit (Tracciabilità RUNTS - DM 2/2026)
        async function scriviAuditLog(azione, tabellaTarget, recordTargetId, dettagli = {}) {
            try {
                if (!currentUser) return;
                let ip = 'N/A';
                try {
                    const res = await fetch('https://api.ipify.org?format=json');
                    const data = await res.json();
                    ip = data.ip;
                } catch (e) {
                    console.warn("Impossibile rilevare IP:", e);
                }

                const { error } = await supabaseClient
                    .from('registro_audit_operazioni')
                    .insert({
                        operatore_id: currentUser.id,
                        azione: azione,
                        tabella_target: tabellaTarget,
                        record_target_id: String(recordTargetId),
                        dettagli: dettagli,
                        ip_address: ip
                    });
                if (error) console.error("Errore scrittura audit:", error);
            } catch (err) {
                console.error("Errore in scriviAuditLog:", err);
            }
        }

        // Rilevazione Sessione ed Autorizzazioni
        async function checkSession() {
            try {
                // Recupera sessione
                const { data: { session }, error } = await supabaseClient.auth.getSession();
                
                if (error || !session) {
                    // Se non autenticato, rimanda al login
                    console.warn("Sessione non trovata. Reindirizzamento...");
                    window.location.href = "login.html";
                    return;
                }
                
                const user = session.user;
                currentUser = user;
                
                // Fetch info ruolo dal database utenti
                let profile = null;
                let profileError = null;
                try {
                    const res = await supabaseClient
                        .from('utenti')
                        .select('*, anagrafiche(id, certificati_medici(*))')
                        .eq('id', user.id)
                        .maybeSingle();
                    profile = res.data;
                    profileError = res.error;
                } catch (e) {
                    console.error("Errore query profilo relazionale:", e);
                    profileError = e;
                }

                if (profileError || !profile) {
                    console.warn("Impossibile caricare profilo con relazioni, tento query semplice di fallback...");
                    try {
                        const resSimple = await supabaseClient
                            .from('utenti')
                            .select('*')
                            .eq('id', user.id)
                            .maybeSingle();
                        if (resSimple.data) {
                            profile = resSimple.data;
                            profileError = null;
                        }
                    } catch (e2) {
                        console.error("Errore query semplice di fallback:", e2);
                    }
                }

                if (profileError || !profile) {
                    alert("Errore caricamento profilo direttivo.");
                    return;
                }

                currentUserProfile = profile;
                let rawRoles = profile.ruolo || [];
                if (!Array.isArray(rawRoles)) {
                    if (typeof rawRoles === 'string') {
                        rawRoles = rawRoles.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
                    } else {
                        rawRoles = [];
                    }
                }
                userRoles = rawRoles;
                const nome = profile.nome || 'N/D';
                const cognome = profile.cognome || 'N/D';
                
                document.getElementById('user-display-name').textContent = `${nome} ${cognome}`;
                document.getElementById('user-display-role').textContent = `Ruoli: ${userRoles.length > 0 ? userRoles.map(r => r.replace(/_/g, ' ')).join(', ') : 'N/D'}`;

                try {
                    applyRolePermissions(profile);
                } catch (e) {
                    console.error("Errore in applyRolePermissions:", e);
                }

                const isBoardMember = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
                const isApprovedSocio = userRoles.includes('socio_approvato');

                const loaders = [];
                if (isBoardMember) {
                    loaders.push(
                        { name: 'loadStats', fn: loadStats },
                        { name: 'loadSoci', fn: loadSoci },
                        { name: 'loadTesserati', fn: loadTesserati },
                        { name: 'loadApprovazioni', fn: loadApprovazioni },
                        { name: 'loadQuote', fn: loadQuote },
                        { name: 'loadVerbali', fn: loadVerbali },
                        { name: 'loadDirettivo', fn: loadDirettivo },
                        { name: 'loadBilanci', fn: loadBilanci },
                        { name: 'loadContabilita', fn: loadContabilita }
                    );
                }
                
                if (isBoardMember || isApprovedSocio) {
                    loaders.push({ name: 'loadVerbaliAssemblea', fn: loadVerbaliAssemblea });
                }

                // Carica sempre la dashboard utente (profilo, certificati, pagamenti)
                loaders.push({ name: 'loadUserDashboard', fn: loadUserDashboard });

                for (const loader of loaders) {
                    try {
                        await loader.fn();
                    } catch (err) {
                        console.error(`Errore caricamento ${loader.name}:`, err);
                    }
                }
            } catch (err) {
                console.error("Errore check session:", err);
            }
        }

        // Configurazione delle Viste e dei Pulsanti a seconda del Ruolo
        let currentViewContext = 'athlete';
        
        function switchContext(view) {
            currentViewContext = view;
            renderContextUI();
        }

        function renderContextUI() {
            const isBoardMember = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
            const isApprovedSocio = userRoles.includes('socio_approvato');

            document.body.classList.remove('theme-tesserato', 'theme-direttivo', 'theme-istruttore', 'theme-volontario', 'theme-socio');

            const bannerApprovazioni = document.getElementById('board-alert-approvazioni-banner');
            if (bannerApprovazioni) bannerApprovazioni.classList.add('hidden');

            // Funzione di utilità per nascondere tutti i bottoni tab amministrativi e atleti
            function hideAllTabs() {
                const tabs = [
                    'user_profilo', 'user_certificato', 'user_corsi', 'user_eventi', 'user_pagamenti',
                    'instructor_corsi', 'volunteer_eventi',
                    'approvazioni', 'soci', 'tesserati', 'quote', 'contabilita', 'direttivo', 'verbali', 'verbali_assemblea', 'bilanci'
                ];
                tabs.forEach(tab => {
                    const el = document.getElementById(`tab-btn-${tab}`);
                    if (el) el.classList.add('hidden');
                });
            }

            hideAllTabs();

            if (currentViewContext === 'athlete') {
                if (userRoles.includes('istruttore')) document.body.classList.add('theme-istruttore');
                else if (userRoles.includes('volontario')) document.body.classList.add('theme-volontario');
                else document.body.classList.add('theme-tesserato');
                
                document.getElementById('welcome-title').textContent = "Benvenuto in Adrenalina Club";
                document.getElementById('welcome-subtitle').textContent = "Adrenalina Club - Portale Atleti Ufficiale";
                document.getElementById('board-stats-grid').classList.add('hidden');
                document.getElementById('board-alert-board').classList.add('hidden');
                
                // Mostra pulsanti atleti base
                document.getElementById('tab-btn-user_profilo').classList.remove('hidden');
                document.getElementById('tab-btn-user_certificato').classList.remove('hidden');
                document.getElementById('tab-btn-user_corsi').classList.remove('hidden');
                document.getElementById('tab-btn-user_eventi').classList.remove('hidden');
                document.getElementById('tab-btn-user_pagamenti').classList.remove('hidden');

                if (userRoles.includes('socio_in_attesa')) document.getElementById('user-status-container').classList.remove('hidden');
                else document.getElementById('user-status-container').classList.add('hidden');

                switchTab('user_profilo');
            } else if (currentViewContext === 'member') {
                document.body.classList.add('theme-socio');
                document.getElementById('welcome-title').textContent = "Area Socio";
                document.getElementById('welcome-subtitle').textContent = "Documentazione e Vita Associativa";
                document.getElementById('board-stats-grid').classList.add('hidden');
                document.getElementById('board-alert-board').classList.add('hidden');
                document.getElementById('user-status-container').classList.add('hidden');
                
                // Mostra pulsanti socio
                document.getElementById('tab-btn-user_profilo').classList.remove('hidden');
                document.getElementById('tab-btn-user_corsi').classList.remove('hidden');
                document.getElementById('tab-btn-user_eventi').classList.remove('hidden');
                document.getElementById('tab-btn-user_pagamenti').classList.remove('hidden');
                document.getElementById('tab-btn-verbali_assemblea').classList.remove('hidden');
                document.getElementById('tab-btn-bilanci').classList.remove('hidden');

                switchTab('user_profilo');
            } else if (currentViewContext === 'instructor') {
                document.body.classList.add('theme-istruttore');
                document.getElementById('welcome-title').textContent = "Pannello Istruttori";
                document.getElementById('welcome-subtitle').textContent = "Gestione Corsi e Presenze";
                document.getElementById('board-stats-grid').classList.add('hidden');
                document.getElementById('board-alert-board').classList.add('hidden');
                document.getElementById('user-status-container').classList.add('hidden');
                
                // Mostra pulsanti base e pulsanti istruttore
                document.getElementById('tab-btn-user_profilo').classList.remove('hidden');
                document.getElementById('tab-btn-user_certificato').classList.remove('hidden');
                document.getElementById('tab-btn-user_pagamenti').classList.remove('hidden');
                document.getElementById('tab-btn-instructor_corsi').classList.remove('hidden');

                switchTab('user_profilo');
            } else if (currentViewContext === 'volunteer') {
                document.body.classList.add('theme-volontario');
                document.getElementById('welcome-title').textContent = "Pannello Volontari";
                document.getElementById('welcome-subtitle').textContent = "Organizzazione Eventi";
                document.getElementById('board-stats-grid').classList.add('hidden');
                document.getElementById('board-alert-board').classList.add('hidden');
                document.getElementById('user-status-container').classList.add('hidden');
                
                // Mostra pulsanti base e pulsanti volontario
                document.getElementById('tab-btn-user_profilo').classList.remove('hidden');
                document.getElementById('tab-btn-user_certificato').classList.remove('hidden');
                document.getElementById('tab-btn-volunteer_eventi').classList.remove('hidden');

                switchTab('user_profilo');
            } else if (currentViewContext === 'board') {
                document.body.classList.add('theme-direttivo');
                
                document.getElementById('welcome-title').textContent = "Benvenuto nel Consiglio Direttivo";
                document.getElementById('welcome-subtitle').textContent = "Adrenalina Club - Portale Amministrativo Riforma 2026";
                document.getElementById('board-stats-grid').classList.remove('hidden');
                document.getElementById('board-alert-board').classList.remove('hidden');
                document.getElementById('user-status-container').classList.add('hidden');
                
                if (bannerApprovazioni && bannerApprovazioni.innerHTML.trim() !== '') {
                    bannerApprovazioni.classList.remove('hidden');
                }
                
                document.getElementById('tab-btn-approvazioni').classList.remove('hidden');
                document.getElementById('tab-btn-soci').classList.remove('hidden');
                document.getElementById('tab-btn-tesserati').classList.remove('hidden');
                document.getElementById('tab-btn-quote').classList.remove('hidden');
                document.getElementById('tab-btn-contabilita').classList.remove('hidden');
                document.getElementById('tab-btn-direttivo').classList.remove('hidden');
                document.getElementById('tab-btn-verbali').classList.remove('hidden');
                document.getElementById('tab-btn-verbali_assemblea').classList.remove('hidden');
                document.getElementById('tab-btn-bilanci').classList.remove('hidden');

                switchTab('panoramica');
            }
        }

        function applyRolePermissions(profile) {
            const switcher = document.getElementById('context-switcher');
            const staticBadge = document.getElementById('static-context-badge');
            
            // Context Switcher setup
            if (userRoles.length > 0) {
                const isBoardMember = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
                const isAthlete = userRoles.some(r => ['socio_approvato', 'tesserato_esterno', 'socio_in_attesa', 'minore'].includes(r));
                const isSocio = userRoles.includes('socio_approvato');
                const isInstructor = userRoles.includes('istruttore');
                const isVolunteer = userRoles.includes('volontario');

                let optionsHTML = '';
                if (isBoardMember) optionsHTML += '<option value="board">AREA DIRETTIVO</option>';
                if (isSocio) optionsHTML += '<option value="member">AREA SOCIO</option>';
                if (isAthlete) optionsHTML += '<option value="athlete">AREA TESSERATO</option>';
                if (isInstructor) optionsHTML += '<option value="instructor">AREA ISTRUTTORE</option>';
                if (isVolunteer) optionsHTML += '<option value="volunteer">AREA VOLONTARIO</option>';

                switcher.innerHTML = optionsHTML;
                
                if (switcher.options.length > 1) {
                    switcher.classList.remove('hidden');
                    staticBadge.classList.add('hidden');
                } else {
                    switcher.classList.add('hidden');
                    staticBadge.classList.remove('hidden');
                    staticBadge.textContent = switcher.options.length > 0 ? switcher.options[0].text : 'AREA TESSERATO';
                }

                // Initial selection
                if (!currentViewContext || !Array.from(switcher.options).find(o => o.value === currentViewContext)) {
                    if (isBoardMember) currentViewContext = 'board';
                    else if (isSocio) currentViewContext = 'member';
                    else if (isAthlete) currentViewContext = 'athlete';
                    else if (isInstructor) currentViewContext = 'instructor';
                    else if (isVolunteer) currentViewContext = 'volunteer';
                    else currentViewContext = 'athlete';
                }
                switcher.value = currentViewContext;
            }


            renderContextUI();

            const descEl = document.getElementById('auth-description');
            
            // Definisce la descrizione permessi basata sulla logica a cascata
            const descrizioni = {
                'presidente': 'Accesso Completo Superiore. Abilitazione completa alla firma delle delibere, inserimento dei verbali, gestione delle quote associative e visualizzazione dei dati anagrafici e tesseramenti.',
                'vice_presidente': 'Accesso Completo Superiore. Abilitazione completa alla firma delle delibere, inserimento dei verbali, gestione delle quote associative e visualizzazione dei dati anagrafici e tesseramenti.',
                'segretario': 'Livello Segreteria. Abilitato all\'editing delle anagrafiche dei soci, alla scrittura dei verbali e al pre-controllo dei documenti e dei tesserati.',
                'tesoriere': 'Livello Amministrazione Finanziaria. Abilitato al tracciamento dei pagamenti, alla riscossione delle quote e alla gestione delle scadenze contabili.',
                'consigliere': 'Livello Consultivo. Visualizzazione dei registri e dell\'archivio dei verbali. Partecipazione al consiglio con funzioni di sola lettura.',
                'socio_approvato': 'Livello Socio Attivo. Accesso alle funzionalità atleti e ai tuoi protocolli fisici personali.',
                'socio_in_attesa': 'Socio in attesa di delibera da parte del Consiglio Direttivo.',
                'tesserato_esterno': 'Atleta tesserato attivo. Visualizzazione del tuo profilo sportivo.'
            };

            descEl.textContent = userRoles.map(r => descrizioni[r]).filter(Boolean).join(' | ') || 'Profilo atleta registrato.';

            const isBoardMember = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
            const isApprovedSocio = userRoles.includes('socio_approvato');
            
            // Mostra/Nascondi banner pagamento e certificati a seconda dello stato
            const quotaTotale = profile ? (parseFloat(profile.quota_totale) || 0) : 0;
            const containerPagamento = document.getElementById('user-payment-container');
            const userCertContainer = document.getElementById('user-certificate-container');
            
            // Nascondi di default
            if (containerPagamento) containerPagamento.classList.add('hidden');
            if (userCertContainer) userCertContainer.classList.add('hidden');
            
            if (!isBoardMember && (profile.tipo_adesione === 'tesserato' || profile.tipo_adesione === 'socio_tesserato')) {
                if (userCertContainer) {
                    userCertContainer.classList.remove('hidden');
                    
                    const anag = Array.isArray(profile.anagrafiche) ? profile.anagrafiche[0] : profile.anagrafiche;
                    const cert = anag && anag.certificati_medici ? (Array.isArray(anag.certificati_medici) ? anag.certificati_medici[0] : anag.certificati_medici) : null;
                    
                    const box = document.getElementById('user-cert-status-box');
                    const msg = document.getElementById('user-cert-message');
                    const form = document.getElementById('user-cert-upload-form');
                    
                    form.classList.add('hidden');
                    
                    if (!cert) {
                        box.className = "border p-6 space-y-4 bg-red-500/5 border-l-4 border-primary";
                        msg.innerHTML = "⚠️ CERTIFICATO MEDICO MANCANTE.<br>Devi caricare un certificato medico valido (Agonistico o Non Agonistico) per poter sbloccare il pagamento ed attivare la tua tessera.";
                        form.classList.remove('hidden');
                    } else {
                        const status = cert.stato_validazione;
                        const scaduto = new Date(cert.data_scadenza) < new Date();
                        
                        if (scaduto) {
                            box.className = "border p-6 space-y-4 bg-red-500/5 border-l-4 border-primary";
                            msg.innerHTML = `⚠️ CERTIFICATO MEDICO SCADUTO IL ${escapeHtml(cert.data_scadenza)}.<br>Carica un certificato medico aggiornato per sbloccare il profilo.`;
                            form.classList.remove('hidden');
                        } else if (status === 'ROSSO') {
                            box.className = "border p-6 space-y-4 bg-red-500/5 border-l-4 border-primary";
                            msg.innerHTML = `❌ CERTIFICATO MEDICO RIFIUTATO.<br>Motivo: ${escapeHtml(cert.note_ai || 'File non leggibile o non conforme')}.<br>Carica nuovamente un file corretto.`;
                            form.classList.remove('hidden');
                        } else if (status === 'IN_ATTESA') {
                            box.className = "border p-6 space-y-4 bg-yellow-500/5 border-l-4 border-yellow-500";
                            msg.innerHTML = "🔍 VALIDAZIONE IN CORSO...<br>Il tuo certificato medico è in fase di elaborazione. Aggiorna la pagina tra qualche minuto.";
                        } else if (status === 'GIALLO') {
                            box.className = "border p-6 space-y-4 bg-yellow-500/5 border-l-4 border-yellow-500";
                            msg.innerHTML = "⏳ CERTIFICATO IN ATTESA DI APPROVAZIONE MANUALE.<br>La validazione richiede un controllo visivo da parte del Presidente. Potrai procedere al pagamento appena approvato.";
                        } else if (status === 'VERDE') {
                            // Nascondi la schermata verde di stato se è completamente valido per ridurre l'ingombro
                            userCertContainer.classList.add('hidden');
                            
                            // Sblocca pagamento se la quota è insoluta
                            if (quotaTotale > 0 && containerPagamento) {
                                document.getElementById('payment-quota-amount').textContent = `€${quotaTotale.toFixed(2)}`;
                                containerPagamento.classList.remove('hidden');
                            }
                        }
                    }
                }
            } else if (!isBoardMember && quotaTotale > 0) {
                // Per soci e utenti diretti che non richiedono certificato obbligatorio subito
                if (containerPagamento) {
                    document.getElementById('payment-quota-amount').textContent = `€${quotaTotale.toFixed(2)}`;
                    containerPagamento.classList.remove('hidden');
                }
            }
            
            // (La logica di visibilità UI è stata mossa in renderContextUI)

            // Mostra/Nascondi pulsanti operativi a seconda del ruolo
            if (userRoles.some(r => ['presidente', 'vice_presidente', 'segretario'].includes(r))) {
                document.getElementById('btn-crea-verbale-toggle').classList.remove('hidden');
                document.getElementById('btn-crea-verbale-assemblea-toggle').classList.remove('hidden');
            }
            if (userRoles.some(r => ['presidente', 'vice_presidente', 'tesoriere'].includes(r))) {
                document.getElementById('btn-nuovo-bilancio-toggle').classList.remove('hidden');
                document.getElementById('btn-nuova-spesa-toggle').classList.remove('hidden');
            } else {
                const btnSpesa = document.getElementById('btn-nuova-spesa-toggle');
                if (btnSpesa) btnSpesa.classList.add('hidden');
            }
            if (userRoles.some(r => ['presidente', 'vice_presidente'].includes(r))) {
                document.getElementById('btn-nomina-direttivo-toggle').classList.remove('hidden');
            } else {
                const btnNomina = document.getElementById('btn-nomina-direttivo-toggle');
                if (btnNomina) btnNomina.classList.add('hidden');
            }
        }

        // Funzione per reindirizzare al pagamento Stripe
        function vaiAlPagamento() {
            if (currentUserProfile && currentUserProfile.id) {
                window.location.href = `pagamento.html?id=${currentUserProfile.id}`;
            }
        }

        // Caricamento Dati Panoramica
        async function loadStats() {
            const isBoardMember = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
            if (!isBoardMember) {
                const alertBanner = document.getElementById('board-alert-approvazioni-banner');
                if (alertBanner) alertBanner.classList.add('hidden');
                return;
            }
            try {
                // Conteggio Richieste in Attesa Approvazione
                const { count: approvazioniAttesa } = await supabaseClient
                    .from('registro_approvazioni')
                    .select('*', { count: 'exact', head: true })
                    .eq('stato', 'IN_ATTESA');
                document.getElementById('stat-approvazioni-attesa').textContent = approvazioniAttesa !== null ? approvazioniAttesa : 0;

                // Aggiorna il banner alert dinamico per il CD
                const alertBanner = document.getElementById('board-alert-approvazioni-banner');
                if (alertBanner) {
                    if (approvazioniAttesa > 0) {
                        alertBanner.innerHTML = `🔴 CI SONO ${approvazioniAttesa} RICHIESTE IN ATTESA DI APPROVAZIONE / ATTIVAZIONE. <a href="#" onclick="event.preventDefault(); switchTab('approvazioni')" class="underline font-bold">VAI AL REGISTRO APPROVAZIONI</a>`;
                        alertBanner.classList.remove('hidden');
                    } else {
                        alertBanner.classList.add('hidden');
                    }
                }

                // Conteggio Soci in Attesa
                const { count: sociAttesa } = await supabaseClient
                    .from('registro_approvazioni')
                    .select('*', { count: 'exact', head: true })
                    .eq('stato', 'IN_ATTESA')
                    .or('tipo.eq.SOCIO,tipo.eq.SOCIO_TESSERATO');
                
                document.getElementById('stat-soci-attesa').textContent = sociAttesa !== null ? sociAttesa : 0;

                // Conteggio Soci Attivi
                const { count: sociAttivi } = await supabaseClient
                    .from('registro_soci')
                    .select('*', { count: 'exact', head: true })
                    .eq('stato_socio', 'ATTIVO');

                document.getElementById('stat-soci-attivi').textContent = sociAttivi !== null ? sociAttivi : 0;

                // Conteggio certificati scaduti/sospesi
                const { count: certSospesi } = await supabaseClient
                    .from('registro_tesserati')
                    .select('*', { count: 'exact', head: true })
                    .eq('stato_tesseramento', 'SOSPESO');

                document.getElementById('stat-certificati-scaduti').textContent = certSospesi !== null ? certSospesi : 0;
            } catch (err) {
                console.error("Errore caricamento statistiche:", err);
            }
        }

        // Helper generico per ordinare gli array in memoria
        function sortArray(arr, field, direction) {
            const dir = direction === 'asc' ? 1 : -1;
            return arr.sort((a, b) => {
                let valA = '';
                let valB = '';

                if (field === 'id_socio') {
                    return (a.id_socio - b.id_socio) * dir;
                } else if (field === 'id_tesserato') {
                    return (a.id_tesserato - b.id_tesserato) * dir;
                } else if (field === 'quota_totale') {
                    return ((a.quota_totale || 0) - (b.quota_totale || 0)) * dir;
                } else if (field === 'anno') {
                    return ((a.anno || 0) - (b.anno || 0)) * dir;
                } else if (field === 'entrate') {
                    const entA = parseFloat(a.totale_entrate || a.entrate || 0);
                    const entB = parseFloat(b.totale_entrate || b.entrate || 0);
                    return (entA - entB) * dir;
                } else if (field === 'uscite') {
                    const uscA = parseFloat(a.totale_uscite || a.uscite || 0);
                    const uscB = parseFloat(b.totale_uscite || b.uscite || 0);
                    return (uscA - uscB) * dir;
                } else if (field === 'avanzo') {
                    const avA = parseFloat(a.avanzo_disavanzo || a.avanzo || 0);
                    const avB = parseFloat(b.avanzo_disavanzo || b.avanzo || 0);
                    return (avA - avB) * dir;
                } else if (field === 'importo') {
                    return ((a.importo || 0) - (b.importo || 0)) * dir;
                } else if (field === 'nominativo') {
                    if (a.nominativo && b.nominativo) {
                        valA = a.nominativo.toUpperCase();
                        valB = b.nominativo.toUpperCase();
                    } else {
                        valA = a.anagrafiche ? `${a.anagrafiche.cognome} ${a.anagrafiche.nome}`.toUpperCase() : '';
                        valB = b.anagrafiche ? `${b.anagrafiche.cognome} ${b.anagrafiche.nome}`.toUpperCase() : '';
                    }
                } else if (field === 'codice_fiscale') {
                    if (a.codice_fiscale && b.codice_fiscale) {
                        valA = a.codice_fiscale.toUpperCase();
                        valB = b.codice_fiscale.toUpperCase();
                    } else {
                        valA = a.anagrafiche ? a.anagrafiche.codice_fiscale.toUpperCase() : '';
                        valB = b.anagrafiche ? b.anagrafiche.codice_fiscale.toUpperCase() : '';
                    }
                } else if (field === 'data_domanda') {
                    valA = a.data_domanda || '';
                    valB = b.data_domanda || '';
                } else if (field === 'quota_scadenza') {
                    valA = a.quota_scadenza || '';
                    valB = b.quota_scadenza || '';
                } else if (field === 'stato_socio') {
                    valA = a.stato_socio || '';
                    valB = b.stato_socio || '';
                } else if (field === 'numero_tessera_csen') {
                    valA = a.numero_tessera_csen || '';
                    valB = b.numero_tessera_csen || '';
                } else if (field === 'livello_copertura') {
                    valA = a.livello_copertura || '';
                    valB = b.livello_copertura || '';
                } else if (field === 'stato_tesseramento') {
                    valA = a.stato_tesseramento || '';
                    valB = b.stato_tesseramento || '';
                } else if (field === 'certificato') {
                    const cA = getCertInfo(a.anagrafiche);
                    const cB = getCertInfo(b.anagrafiche);
                    const certA = cA ? cA.data_scadenza : '1970-01-01';
                    const certB = cB ? cB.data_scadenza : '1970-01-01';
                    valA = certA;
                    valB = certB;
                } else if (field === 'tipo_adesione') {
                    valA = a.tipo_adesione || '';
                    valB = b.tipo_adesione || '';
                } else if (field === 'stato') {
                    valA = String(a.stato || '') || '';
                    valB = String(b.stato || '') || '';
                } else if (field === 'email') {
                    valA = a.email || '';
                    valB = b.email || '';
                } else if (field === 'ruolo') {
                    valA = a.ruolo ? a.ruolo.join(',') : '';
                    valB = b.ruolo ? b.ruolo.join(',') : '';
                } else if (field === 'titolo') {
                    valA = a.titolo || '';
                    valB = b.titolo || '';
                } else if (field === 'tipo') {
                    valA = a.tipo || '';
                    valB = b.tipo || '';
                } else if (field === 'causale') {
                    valA = a.causale || '';
                    valB = b.causale || '';
                } else if (field === 'soggetto') {
                    valA = a.soggetto || '';
                    valB = b.soggetto || '';
                } else if (field === 'data') {
                    valA = a.data || '';
                    valB = b.data || '';
                }

                if (valA < valB) return -1 * dir;
                if (valA > valB) return 1 * dir;
                return 0;
            });
        }

        // Helper per aggiornare visivamente le frecce di ordinamento
        function updateSortIcon(prefix, activeField, activeDirection) {
            const spans = document.querySelectorAll(`span[id^="${prefix}-"]`);
            spans.forEach(span => {
                const field = span.id.replace(`${prefix}-`, '');
                if (field === activeField) {
                    span.textContent = activeDirection === 'asc' ? ' ▲' : ' ▼';
                    span.className = 'text-primary font-bold ml-1';
                } else {
                    span.textContent = '';
                }
            });
        }

        // Funzioni di Trigger per l'ordinamento
        function sortSoci(field) {
            if (sociSort.field === field) {
                sociSort.direction = sociSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sociSort.field = field;
                sociSort.direction = 'asc';
            }
            sortArray(sociData, sociSort.field, sociSort.direction);
            updateSortIcon('sort-icon-soci', sociSort.field, sociSort.direction);
            renderSociTable();
        }

        function sortTesserati(field) {
            if (tesseratiSort.field === field) {
                tesseratiSort.direction = tesseratiSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                tesseratiSort.field = field;
                tesseratiSort.direction = 'asc';
            }
            sortArray(tesseratiData, tesseratiSort.field, tesseratiSort.direction);
            updateSortIcon('sort-icon-tess', tesseratiSort.field, tesseratiSort.direction);
            renderTesseratiTable();
        }

        function sortQuote(field) {
            if (quoteSort.field === field) {
                quoteSort.direction = quoteSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                quoteSort.field = field;
                quoteSort.direction = 'asc';
            }
            sortArray(quoteData, quoteSort.field, quoteSort.direction);
            updateSortIcon('sort-icon-quote', quoteSort.field, quoteSort.direction);
            renderQuoteTable();
        }

        function sortDirettivo(field) {
            if (direttivoSort.field === field) {
                direttivoSort.direction = direttivoSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                direttivoSort.field = field;
                direttivoSort.direction = 'asc';
            }
            sortArray(direttivoData, direttivoSort.field, direttivoSort.direction);
            updateSortIcon('sort-icon-direttivo', direttivoSort.field, direttivoSort.direction);
            renderDirettivoTable();
        }

        function sortBilanci(field) {
            if (bilanciSort.field === field) {
                bilanciSort.direction = bilanciSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                bilanciSort.field = field;
                bilanciSort.direction = 'asc';
            }
            sortArray(bilanciData, bilanciSort.field, bilanciSort.direction);
            updateSortIcon('sort-icon-bilanci', bilanciSort.field, bilanciSort.direction);
            renderBilanciTable();
        }

        function sortContabilita(field) {
            if (contabilitaSort.field === field) {
                contabilitaSort.direction = contabilitaSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                contabilitaSort.field = field;
                contabilitaSort.direction = 'asc';
            }
            sortArray(contabilitaData, contabilitaSort.field, contabilitaSort.direction);
            updateSortIcon('sort-icon-contabilita', contabilitaSort.field, contabilitaSort.direction);
            renderContabilitaTable();
        }

        // Caricamento e rendering Registro Soci
        async function loadSoci() {
            try {
                const { data, error } = await supabaseClient
                    .from('registro_soci')
                    .select(`
                        id_socio,
                        numero_registro,
                        stato_socio,
                        data_domanda,
                        data_delibera_direttivo,
                        numero_verbale,
                        quota_scadenza,
                        anagrafiche (
                            id,
                            utente_id,
                            nome,
                            cognome,
                            codice_fiscale,
                            data_nascita,
                            comune_nascita,
                            provincia_nascita,
                            indirizzi_residenza (
                                via_piazza,
                                civico,
                                comune,
                                provincia,
                                cap
                            )
                        )
                    `);

                if (error) throw error;
                sociData = data || [];
                
                // Ordina in base allo stato iniziale e visualizza
                sortArray(sociData, sociSort.field, sociSort.direction);
                updateSortIcon('sort-icon-soci', sociSort.field, sociSort.direction);
                renderSociTable();
            } catch (err) {
                console.error("Errore caricamento soci:", err);
                document.getElementById('soci-list-body').innerHTML = `<tr><td colspan="7" class="p-4 text-center text-primary font-bold">Errore nel caricamento del database soci.</td></tr>`;
            }
        }

        function renderSociTable() {
            const body = document.getElementById('soci-list-body');
            body.innerHTML = '';

            if (sociData.length === 0) {
                body.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nessuna domanda di associazione presente.</td></tr>';
                return;
            }

            sociData.forEach(socio => {
                const row = document.createElement('tr');
                
                const nomeComp = socio.anagrafiche ? escapeHtml(`${socio.anagrafiche.nome} ${socio.anagrafiche.cognome}`) : 'N/D';
                const cf = socio.anagrafiche ? escapeHtml(socio.anagrafiche.codice_fiscale) : 'N/D';
                const dataNascita = socio.anagrafiche ? escapeHtml(socio.anagrafiche.data_nascita) : 'N/D';
                const comuneNascita = socio.anagrafiche ? escapeHtml(`${socio.anagrafiche.comune_nascita} (${socio.anagrafiche.provincia_nascita})`) : 'N/D';
                
                let indirizzoHtml = 'N/D';
                if (socio.anagrafiche && socio.anagrafiche.indirizzi_residenza) {
                    const ind = socio.anagrafiche.indirizzi_residenza;
                    indirizzoHtml = escapeHtml(`${ind.via_piazza} ${ind.civico}, ${ind.comune} (${ind.provincia}), CAP ${ind.cap}`);
                }
                
                let badgeColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
                if (socio.stato_socio === 'ATTIVO') badgeColor = 'text-green-500 bg-green-500/10 border-green-500/30';
                if (socio.stato_socio === 'RESPINTO') badgeColor = 'text-primary bg-primary/10 border-primary/30';

                let actionBtn = '';
                if (socio.stato_socio === 'IN_ATTESA_DELIBERA') {
                    actionBtn = '<span class="text-[9px] text-yellow-500 font-bold uppercase tracking-wider bg-yellow-500/10 border border-yellow-500/20 px-2 py-1">In attesa delibera</span>';
                } else if (socio.stato_socio === 'ATTIVO') {
                    actionBtn = '<span class="text-[9px] text-green-500 font-bold uppercase tracking-wider bg-green-500/10 border border-green-500/20 px-2 py-1">Approvato</span>';
                } else if (socio.stato_socio === 'RESPINTO') {
                    actionBtn = `<span class="text-[9px] text-primary font-bold uppercase tracking-wider bg-primary/10 border border-primary/20 px-2 py-1" title="${escapeHtml(socio.motivo_rifiuto || '')}">Respinto</span>`;
                } else {
                    actionBtn = '<span class="text-[9px] text-gray-500 uppercase">Gestito</span>';
                }

                if (userRoles.some(r => ['presidente', 'vice_presidente'].includes(r)) && socio.anagrafiche) {
                    actionBtn = `<div class="flex items-center justify-end gap-2">
                        ${actionBtn}
                        <button onclick="eliminaUtente('${socio.anagrafiche.id}', '${nomeComp.replace(/'/g, "\\'")}')" class="bg-primary/20 border border-primary/40 text-primary hover:bg-primary hover:text-white font-headline text-[10px] font-bold px-3 py-1 transition-all uppercase">ELIMINA</button>
                    </div>`;
                }

                const deliberaHtml = socio.data_delibera_direttivo 
                    ? `Delibera: ${escapeHtml(socio.data_delibera_direttivo)}<br><span class="text-[10px] text-gray-500">Verbale: ${escapeHtml(socio.numero_verbale || 'N/D')}</span>`
                    : 'In attesa delibera';

                row.innerHTML = `
                    <td class="p-4 font-mono font-bold text-gray-500">${escapeHtml(socio.numero_registro || 'S-PND')}</td>
                    <td class="p-4 text-white">
                        <span class="font-bold">${nomeComp}</span>
                        <div class="text-[10px] text-gray-400 mt-0.5">Nascita: ${dataNascita} a ${comuneNascita}</div>
                        <div class="text-[10px] text-gray-500 mt-0.5">Residenza: ${indirizzoHtml}</div>
                    </td>
                    <td class="p-4 text-gray-400 font-mono">${cf}</td>
                    <td class="p-4 text-gray-400">
                        Domanda: ${escapeHtml(socio.data_domanda)}<br>
                        <span class="text-white">${deliberaHtml}</span>
                    </td>
                    <td class="p-4 text-gray-400 font-mono">${escapeHtml(socio.quota_scadenza)}</td>
                    <td class="p-4">
                        <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase ${badgeColor}">${escapeHtml(socio.stato_socio).replace(/_/g, ' ')}</span>
                    </td>
                    <td class="p-4 text-right">${actionBtn}</td>
                `;
                body.appendChild(row);
            });
        }

        // Caricamento e rendering Registro Tesserati
        async function loadTesserati() {
            try {
                const { data, error } = await supabaseClient
                    .from('registro_tesserati')
                    .select(`
                        id_tesserato,
                        numero_registro,
                        numero_tessera_csen,
                        stato_tesseramento,
                        livello_copertura,
                        data_richiesta_tesseramento,
                        anagrafiche (
                            id,
                            utente_id,
                            nome,
                            cognome,
                            codice_fiscale,
                            data_nascita,
                            comune_nascita,
                            provincia_nascita,
                            sesso,
                            indirizzi_residenza (
                                via_piazza,
                                civico,
                                comune,
                                provincia,
                                cap
                            ),
                            contatti (
                                telefono,
                                email
                            ),
                            certificati_medici (
                                id,
                                tipologia,
                                data_rilascio,
                                data_scadenza,
                                medico_rilascio,
                                file_url,
                                stato_validazione,
                                note_ai,
                                confidence_score
                            )
                        )
                    `);

                if (error) throw error;
                tesseratiData = data || [];

                // Ordina in base allo stato iniziale e visualizza
                sortArray(tesseratiData, tesseratiSort.field, tesseratiSort.direction);
                updateSortIcon('sort-icon-tess', tesseratiSort.field, tesseratiSort.direction);
                renderTesseratiTable();
                renderGialloCertificati();
            } catch (err) {
                console.error("Errore caricamento tesserati:", err);
                document.getElementById('tesserati-list-body').innerHTML = `<tr><td colspan="7" class="p-4 text-center text-primary font-bold">Errore nel caricamento del database tesserati.</td></tr>`;
            }
        }

        let approvazioniData = [];

        async function loadApprovazioni() {
            try {
                const { data, error } = await supabaseClient
                    .from('registro_approvazioni')
                    .select(`
                        id,
                        anagrafica_id,
                        tipo,
                        stato,
                        livello_copertura,
                        data_richiesta,
                        data_decisione,
                        numero_verbale,
                        motivo_rifiuto,
                        anagrafiche (
                            id,
                            nome,
                            cognome,
                            codice_fiscale,
                            data_nascita,
                            comune_nascita,
                            provincia_nascita,
                            certificati_medici (
                                id,
                                tipologia,
                                data_rilascio,
                                data_scadenza,
                                medico_rilascio,
                                file_url,
                                stato_validazione,
                                note_ai
                            )
                        )
                    `)
                    .order('created_at', { ascending: false });

                window.attivaTesseramentoApprovazioni = async (anagraficaId) => {
            if (!confirm("Confermi l'attivazione immediata di questo Tesserato?")) return;
            try {
                const { error } = await supabaseClient.rpc('attiva_tesserato', { target_anagrafica_id: anagraficaId });
                if (error) throw error;
                alert("Tesserato attivato con successo! Il profilo è ora visibile nel Registro Tesserati.");
                loadApprovazioni();
            } catch (error) {
                console.error("Errore durante l'attivazione:", error);
                alert("Errore durante l'attivazione: " + error.message);
            }
        };

        window.eliminaRegistrazioneIncompleta = async (utenteId) => {
            if (!confirm("ATTENZIONE: Stai per eliminare definitivamente questa registrazione incompleta. Questo sbloccherà l'indirizzo email permettendo all'utente di registrarsi nuovamente. Confermi?")) return;
            try {
                const { error } = await supabaseClient.rpc('elimina_utente_fantasma', { p_utente_id: utenteId });
                if (error) throw error;
                alert("Registrazione incompleta eliminata. L'email è stata sbloccata.");
                loadApprovazioni();
            } catch (error) {
                console.error("Errore eliminazione utente fantasma:", error);
                alert("Errore durante l'eliminazione: " + error.message);
            }
        };

                if (error) throw error;
                approvazioniData = data || [];
                renderApprovazioniTables();
            } catch (err) {
                console.error("Errore caricamento approvazioni:", err);
            }
        }

        async function renderApprovazioniTables() {
            const sociBody = document.getElementById('approvazioni-soci-list');
            const tessBody = document.getElementById('approvazioni-tesserati-list');
            const storicoBody = document.getElementById('approvazioni-storico-list');

            if (!sociBody || !tessBody || !storicoBody) return;

            sociBody.innerHTML = '';
            tessBody.innerHTML = '';
            storicoBody.innerHTML = '';

            const pendingSoci = approvazioniData.filter(x => x.stato === 'IN_ATTESA' && (x.tipo === 'SOCIO' || x.tipo === 'SOCIO_TESSERATO'));
            const pendingTess = approvazioniData.filter(x => x.stato === 'IN_ATTESA' && (x.tipo === 'TESSERATO' || x.tipo === 'SOCIO_TESSERATO'));
            const storico = approvazioniData.filter(x => x.stato !== 'IN_ATTESA');

            // Render Pending Soci
            if (pendingSoci.length === 0) {
                sociBody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-500">Nessuna richiesta di socio in attesa.</td></tr>';
            } else {
                pendingSoci.forEach(item => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-white/5';
                    const anag = item.anagrafiche || {};
                    const nome = escapeHtml(`${anag.nome || ''} ${anag.cognome || ''}`);
                    const cf = escapeHtml(anag.codice_fiscale || '');
                    const dataN = escapeHtml(anag.data_nascita || '');
                    row.innerHTML = `
                        <td class="p-3 font-bold text-white">
                            ${nome}<br>
                            <span class="text-[9px] text-gray-500 font-light">Nascita: ${dataN} a ${escapeHtml(anag.comune_nascita || '')} (${escapeHtml(anag.provincia_nascita || '')})</span>
                        </td>
                        <td class="p-3 text-gray-400 font-mono">${cf}</td>
                        <td class="p-3 text-gray-400">${escapeHtml(item.data_richiesta)}</td>
                        <td class="p-3 text-gray-400">${escapeHtml(item.tipo)}</td>
                        <td class="p-3 text-right">
                            <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase text-yellow-500 bg-yellow-500/10 border-yellow-500/30">IN ATTESA CD</span>
                        </td>
                    `;
                    sociBody.appendChild(row);
                });
            }

            // Render Pending Tesserati
            if (pendingTess.length === 0) {
                tessBody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-500">Nessuna richiesta di tesserato in attesa.</td></tr>';
            } else {
                pendingTess.forEach(item => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-white/5';
                    const anag = item.anagrafiche || {};
                    const nome = escapeHtml(`${anag.nome || ''} ${anag.cognome || ''}`);
                    const cf = escapeHtml(anag.codice_fiscale || '');
                    
                    const certInfo = getCertInfo(anag);
                    let certHtml = '<span class="text-primary font-bold">MANCANTE</span>';
                    let isCertVerde = false;
                    if (certInfo) {
                        const scaduto = new Date(certInfo.data_scadenza) < new Date();
                        isCertVerde = certInfo.stato_validazione === 'VERDE' && !scaduto;
                        let color = scaduto ? 'text-primary' : 'text-green-500';
                        let statusLabel = '';
                        if (certInfo.stato_validazione === 'ROSSO') {
                            color = 'text-primary';
                            statusLabel = '<span class="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded uppercase font-bold">RIFIUTATO</span>';
                        } else if (certInfo.stato_validazione === 'GIALLO') {
                            color = 'text-yellow-500';
                            statusLabel = '<span class="text-[9px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1 py-0.5 rounded uppercase font-bold">REVISIONE</span>';
                        } else if (certInfo.stato_validazione === 'IN_ATTESA') {
                            color = 'text-gray-400';
                            statusLabel = '<span class="text-[9px] bg-white/5 text-gray-400 border border-white/10 px-1 py-0.5 rounded uppercase font-bold">ATTESA AI</span>';
                        } else {
                            statusLabel = '<span class="text-[9px] bg-green-500/10 text-green-500 border border-green-500/20 px-1 py-0.5 rounded uppercase font-bold">VALIDATO</span>';
                        }
                        certHtml = `
                            <div class="flex flex-col items-center gap-1">
                                <a href="#" data-file-url="${escapeHtml(certInfo.file_url)}" class="approvazioni-view-cert-btn underline ${color} font-bold">${escapeHtml(certInfo.tipologia)}</a>
                                ${statusLabel}
                                <span class="text-[9px] text-gray-500 font-mono">Scad: ${escapeHtml(certInfo.data_scadenza)}</span>
                            </div>
                        `;
                    }

                    let actionBtn = '';
                    if (userRoles.some(r => ['presidente', 'vice_presidente', 'segretario'].includes(r))) {
                        let mainBtn = '';
                        if (isCertVerde) {
                            mainBtn = `<button onclick="attivaTesseramentoApprovazioni('${item.anagrafica_id}')" class="bg-white text-black font-headline text-[9px] font-bold px-3 py-1 hover:bg-primary hover:text-white transition-all uppercase">ATTIVA</button>`;
                        } else if (certInfo && certInfo.stato_validazione === 'GIALLO') {
                            mainBtn = `<button onclick="if(confirm('Procedere con l\\'approvazione manuale del certificato medico?')) validaCertificatoManual('${certInfo.id}', 'VERDE')" class="bg-yellow-500 text-black font-headline text-[9px] font-bold px-3 py-1 hover:bg-green-500 hover:text-white transition-all uppercase">APPROVA CERT.</button>`;
                        } else {
                            mainBtn = `<button disabled class="bg-gray-800 text-gray-500 font-headline text-[9px] font-bold px-3 py-1 cursor-not-allowed uppercase" title="Richiede Certificato Medico VERDE per l'attivazione">ATTIVA</button>`;
                        }
                        
                        let eliminaBtn = '';
                        if (userRoles.some(r => ['presidente', 'vice_presidente'].includes(r))) {
                            eliminaBtn = `<button onclick="eliminaUtente('${item.anagrafica_id}', '${nome.replace(/'/g, "\\'")}')" class="bg-primary/20 border border-primary/40 text-primary hover:bg-primary hover:text-white font-headline text-[9px] font-bold px-2 py-1 transition-all uppercase">ELIMINA</button>`;
                        }
                        
                        actionBtn = `<div class="flex items-center justify-end gap-2">${mainBtn}${eliminaBtn}</div>`;
                    } else {
                        actionBtn = '-';
                    }

                    row.innerHTML = `
                        <td class="p-3 font-bold text-white">${nome}</td>
                        <td class="p-3 text-gray-400 font-mono">${cf}</td>
                        <td class="p-3 text-gray-400">${escapeHtml(item.livello_copertura || 'BASE')}</td>
                        <td class="p-3 text-center">${certHtml}</td>
                        <td class="p-3 text-gray-400">${escapeHtml(item.data_richiesta)}</td>
                        <td class="p-3 text-right">${actionBtn}</td>
                    `;
                    const viewBtn = row.querySelector('.approvazioni-view-cert-btn');
                    if (viewBtn) {
                        viewBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            const url = e.currentTarget.getAttribute('data-file-url');
                            openSignedFile('certificati_medici', url);
                        });
                    }
                    tessBody.appendChild(row);
                });
            }

            // Render Registrazioni Incomplete
            const incompleteBody = document.getElementById('approvazioni-incomplete-list');
            incompleteBody.innerHTML = '';
            
            const { data: ghosts, error: ghostError } = await supabaseClient
                .from('vw_registrazioni_incomplete')
                .select('*')
                .order('data_creazione', { ascending: false });
                
            if (ghostError) {
                console.error("Errore recupero registrazioni incomplete:", ghostError);
            } else if (!ghosts || ghosts.length === 0) {
                incompleteBody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-500">Nessuna registrazione incompleta.</td></tr>';
            } else {
                ghosts.forEach(ghost => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-red-500/5 hover:bg-red-900/10 transition-colors';
                    
                    let actionBtn = '';
                    if (userRoles.some(r => ['presidente', 'vice_presidente'].includes(r))) {
                        actionBtn = `<button onclick="eliminaRegistrazioneIncompleta('${ghost.utente_id}')" class="bg-red-600 text-white font-headline text-[9px] font-bold px-3 py-1 hover:bg-red-500 transition-all uppercase">ELIMINA SBLOCCA</button>`;
                    } else {
                        actionBtn = `<span class="text-[9px] text-gray-500" title="Solo il Presidente o Vice possono sbloccare">NON AUTORIZZATO</span>`;
                    }
                    
                    row.innerHTML = `
                        <td class="p-3 font-bold text-red-400">${escapeHtml(ghost.nome)} ${escapeHtml(ghost.cognome)}</td>
                        <td class="p-3 text-gray-300 lowercase font-sans">${escapeHtml(ghost.email)}</td>
                        <td class="p-3 text-gray-400 font-mono">${escapeHtml(ghost.codice_fiscale)}</td>
                        <td class="p-3 text-gray-500">${escapeHtml(ghost.data_creazione ? ghost.data_creazione.split('T')[0] : '')}</td>
                        <td class="p-3 text-right">${actionBtn}</td>
                    `;
                    incompleteBody.appendChild(row);
                });
            }

            // Render Storico
            if (storico.length === 0) {
                storicoBody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-500">Nessuna decisione recente.</td></tr>';
            } else {
                storico.forEach(item => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-white/5';
                    const anag = item.anagrafiche || {};
                    const nome = escapeHtml(`${anag.nome || ''} ${anag.cognome || ''}`);
                    const badgeClass = item.stato === 'APPROVATO' 
                        ? 'text-green-500 bg-green-500/10 border-green-500/30' 
                        : 'text-primary bg-primary/10 border-primary/30';
                    const details = item.stato === 'APPROVATO'
                        ? (item.numero_verbale ? `Verbale: ${escapeHtml(item.numero_verbale)}` : 'Attivato con Certificato')
                        : `Motivo: ${escapeHtml(item.motivo_rifiuto || 'Requisiti assenti')}`;

                    row.innerHTML = `
                        <td class="p-3 font-bold text-white">${nome}</td>
                        <td class="p-3 uppercase text-xs">${escapeHtml(item.tipo)}</td>
                        <td class="p-3">${escapeHtml(item.data_decisione || '')}</td>
                        <td class="p-3">
                            <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase ${badgeClass}">${escapeHtml(item.stato)}</span>
                        </td>
                        <td class="p-3 text-right text-[10px] font-mono">${details}</td>
                    `;
                    storicoBody.appendChild(row);
                });
            }
        }

        async function attivaTesseramentoApprovazioni(anagraficaId) {
            try {
                if (!currentUser) return;
                const { data, error } = await supabaseClient.rpc('approva_tesserato', {
                    p_anagrafica_id: anagraficaId,
                    p_deciso_da: currentUser.id
                });
                if (error) throw error;
                alert("Tesseramento approvato ed inserito con successo nel Registro Ufficiale.");
                
                await scriviAuditLog('ATTIVAZIONE_TESSERAMENTO_REGISTRO_APPROVAZIONI', 'registro_tesserati', anagraficaId, {
                    anagrafica_id: anagraficaId
                });

                loadApprovazioni();
                loadTesserati();
                loadStats();
            } catch (err) {
                alert("Errore durante l'attivazione: " + err.message);
            }
        }

        function renderGialloCertificati() {
            const container = document.getElementById('giallo-certificati-container');
            const body = document.getElementById('giallo-certificati-list');
            if (!body) return;
            body.innerHTML = '';

            // Trova tutti i tesserati che hanno un certificato con stato_validazione = 'GIALLO'
            const gialloTesserati = tesseratiData.filter(tess => {
                const cert = getCertInfo(tess.anagrafiche);
                return cert && cert.stato_validazione === 'GIALLO';
            });

            if (gialloTesserati.length === 0) {
                container.classList.add('hidden');
                return;
            }

            container.classList.remove('hidden');

            gialloTesserati.forEach(tess => {
                const cert = getCertInfo(tess.anagrafiche);
                const nomeComp = escapeHtml(`${tess.anagrafiche.nome} ${tess.anagrafiche.cognome}`);
                const cf = escapeHtml(tess.anagrafiche.codice_fiscale);
                const row = document.createElement('tr');
                row.className = 'border-b border-yellow-500/10';

                row.innerHTML = `
                    <td class="p-3 text-white font-bold">${nomeComp}</td>
                    <td class="p-3 text-gray-400 font-mono">${cf}</td>
                    <td class="p-3 text-yellow-500 font-bold">${escapeHtml(cert.tipologia)}</td>
                    <td class="p-3 text-gray-400">${escapeHtml(cert.data_rilascio || 'N/D')}</td>
                    <td class="p-3 text-center">
                        <a href="#" data-file-url="${escapeHtml(cert.file_url)}" class="giallo-view-cert-btn bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[9px] px-2 py-1 hover:bg-yellow-500 hover:text-black font-bold uppercase transition-all flex items-center gap-1 justify-center max-w-[120px] mx-auto">
                            <span class="material-symbols-outlined text-[12px]">visibility</span> VEDI FILE
                        </a>
                    </td>
                    <td class="p-3 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="validaCertificatoManual('${cert.id}', 'VERDE')" class="bg-green-500 text-white font-headline text-[9px] font-bold px-3 py-1 hover:bg-green-600 transition-all uppercase">APPROVA</button>
                            <button onclick="validaCertificatoManual('${cert.id}', 'ROSSO')" class="bg-primary text-white font-headline text-[9px] font-bold px-3 py-1 hover:bg-primary-dim transition-all uppercase">RIFIUTA</button>
                        </div>
                    </td>
                `;
                // Add event listener to avoid inline onclick with quote escaping issues
                row.querySelector('.giallo-view-cert-btn').addEventListener('click', (e) => {
                    e.preventDefault();
                    const url = e.currentTarget.getAttribute('data-file-url');
                    openSignedFile('certificati_medici', url);
                });
                body.appendChild(row);
            });
        }

        async function validaCertificatoManual(certId, nuovoStato) {
            let note = null;
            if (nuovoStato === 'ROSSO') {
                note = prompt("Inserisci il motivo del rifiuto del certificato (sarà mostrato all'utente):");
                if (note === null) return; // Annullato
                if (!note.trim()) note = "File illeggibile o documento non conforme.";
            }

            try {
                const { error } = await supabaseClient
                    .from('certificati_medici')
                    .update({
                        stato_validazione: nuovoStato,
                        note_ai: note
                    })
                    .eq('id', certId);

                if (error) throw error;

                // Scrivi audit log
                await scriviAuditLog('DELIBERA_CERTIFICATO_MEDICO', 'certificati_medici', certId, {
                    stato_validazione: nuovoStato,
                    note: note
                });

                alert(`Certificato medico aggiornato a ${nuovoStato} con successo!`);
                loadTesserati();
                loadApprovazioni();
            } catch (err) {
                alert("Errore aggiornamento certificato: " + err.message);
            }
        }

        function renderTesseratiTable() {
            const body = document.getElementById('tesserati-list-body');
            body.innerHTML = '';

            if (tesseratiData.length === 0) {
                body.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nessun tesseramento presente.</td></tr>';
                return;
            }

            tesseratiData.forEach(tess => {
                const row = document.createElement('tr');
                const nomeComp = tess.anagrafiche ? escapeHtml(`${tess.anagrafiche.nome} ${tess.anagrafiche.cognome}`) : 'N/D';
                const cf = tess.anagrafiche ? escapeHtml(tess.anagrafiche.codice_fiscale) : 'N/D';
                const birthInfo = tess.anagrafiche ? escapeHtml(`${tess.anagrafiche.data_nascita} a ${tess.anagrafiche.comune_nascita} (${tess.anagrafiche.provincia_nascita})`) : 'N/D';
                
                const certInfo = getCertInfo(tess.anagrafiche);

                let certHtml = '<span class="text-primary font-bold">MANCANTE</span>';
                let isCertVerde = false;
                if (certInfo) {
                    const scaduto = new Date(certInfo.data_scadenza) < new Date();
                    isCertVerde = certInfo.stato_validazione === 'VERDE' && !scaduto;
                    let color = scaduto ? 'text-primary' : 'text-green-500';
                    let statusLabel = '';
                    if (certInfo.stato_validazione === 'ROSSO') {
                        color = 'text-primary';
                        statusLabel = '<br><span class="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded uppercase font-bold">RIFIUTATO</span>';
                    } else if (certInfo.stato_validazione === 'GIALLO') {
                        color = 'text-yellow-500';
                        statusLabel = '<br><span class="text-[9px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1 py-0.5 rounded uppercase font-bold">ATTESA REVISIONE</span>';
                    } else if (certInfo.stato_validazione === 'IN_ATTESA') {
                        color = 'text-gray-400';
                        statusLabel = '<br><span class="text-[9px] bg-white/5 text-gray-400 border border-white/10 px-1 py-0.5 rounded uppercase font-bold">ATTESA AI</span>';
                    } else {
                        statusLabel = '<br><span class="text-[9px] bg-green-500/10 text-green-500 border border-green-500/20 px-1 py-0.5 rounded uppercase font-bold">VALIDATO</span>';
                    }
                    certHtml = `<a href="#" data-file-url="${escapeHtml(certInfo.file_url)}" class="tess-view-cert-btn underline ${color} font-bold">${escapeHtml(certInfo.tipologia)}</a>${statusLabel}<br>
                                <span class="text-[10px] text-gray-400">Scadenza: ${escapeHtml(certInfo.data_scadenza)}</span><br>
                                <span class="text-[9px] text-gray-500">Med.: ${escapeHtml(certInfo.medico_rilascio || 'N/D')}</span>`;
                }

                let badgeColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
                if (tess.stato_tesseramento === 'ATTIVO') badgeColor = 'text-green-500 bg-green-500/10 border-green-500/30';
                if (tess.stato_tesseramento === 'SOSPESO') badgeColor = 'text-primary bg-primary/10 border-primary/30';

                let actionBtn = '';
                if (tess.stato_tesseramento === 'IN_ELABORAZIONE' && userRoles.some(r => ['presidente', 'vice_presidente', 'segretario'].includes(r))) {
                    if (isCertVerde) {
                        actionBtn = `<button onclick="attivaTesseramento(${tess.id_tesserato})" class="bg-white text-black font-headline text-[9px] font-bold px-2 py-0.5 hover:bg-primary hover:text-white transition-all uppercase">ATTIVA</button>`;
                    } else if (certInfo && certInfo.stato_validazione === 'GIALLO') {
                        actionBtn = `<button onclick="if(confirm('Procedere con l\\'approvazione manuale del certificato medico?')) validaCertificatoManual('${certInfo.id}', 'VERDE')" class="bg-yellow-500 text-black font-headline text-[9px] font-bold px-2 py-0.5 hover:bg-green-500 hover:text-white transition-all uppercase">APPROVA CERT.</button>`;
                    } else {
                        actionBtn = `<button disabled class="bg-gray-800 text-gray-500 font-headline text-[9px] font-bold px-2 py-0.5 cursor-not-allowed uppercase" title="Attivazione disabilitata: certificato medico non valido o in attesa di approvazione.">ATTIVA</button>`;
                    }
                } else {
                    actionBtn = '-';
                }

                if (userRoles.some(r => ['presidente', 'vice_presidente'].includes(r)) && tess.anagrafiche) {
                    const actionContent = actionBtn === '-' ? '' : actionBtn;
                    actionBtn = `<div class="flex items-center justify-end gap-2">
                        ${actionContent}
                        <button onclick="eliminaUtente('${tess.anagrafiche.id}', '${nomeComp.replace(/'/g, "\\'")}')" class="bg-primary/20 border border-primary/40 text-primary hover:bg-primary hover:text-white font-headline text-[9px] font-bold px-2 py-0.5 transition-all uppercase">ELIMINA</button>
                    </div>`;
                }

                row.innerHTML = `
                    <td class="p-4 font-mono font-bold text-gray-500">${escapeHtml(tess.numero_registro || 'T-PND')}</td>
                    <td class="p-4 text-white">
                        <span class="font-bold">${nomeComp}</span>
                        <div class="text-[10px] text-gray-400 mt-0.5">CF: ${cf}</div>
                        <div class="text-[10px] text-gray-500 mt-0.5">Nascita: ${birthInfo}</div>
                    </td>
                    <td class="p-4 text-gray-400 font-mono">
                        ${escapeHtml(tess.numero_tessera_csen || 'ASSEGNAZIONE IN CORSO')}<br>
                        <span class="text-[10px] text-gray-500">Richiesta: ${escapeHtml(tess.data_richiesta_tesseramento)}</span>
                    </td>
                    <td class="p-4 text-gray-400">${escapeHtml(tess.livello_copertura)}</td>
                    <td class="p-4">${certHtml}</td>
                    <td class="p-4">
                        <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase ${badgeColor}">${escapeHtml(tess.stato_tesseramento)}</span>
                    </td>
                    <td class="p-4 text-right">${actionBtn}</td>
                `;
                // Add event listener to view certificate safely
                const viewBtn = row.querySelector('.tess-view-cert-btn');
                if (viewBtn) {
                    viewBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const url = e.currentTarget.getAttribute('data-file-url');
                        openSignedFile('certificati_medici', url);
                    });
                }
                body.appendChild(row);
            });
        }

        // Caricamento Tabella Quote Associative
        async function loadQuote() {
            try {
                // 1. Carica gli utenti
                const { data: users, error: usersError } = await supabaseClient
                    .from('utenti')
                    .select('id, nome, cognome, tipo_adesione, quota_totale');

                if (usersError) throw usersError;

                if (!users || users.length === 0) {
                    quoteData = [];
                    renderQuoteTable();
                    return;
                }

                // 2. Carica le ricevute emesse
                const { data: receipts, error: receiptsError } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .select('id, numero_ricevuta, anno_fiscale, importo, data_pagamento, utente_id, metodo_pagamento')
                    .order('numero_ricevuta', { ascending: false });

                const receiptsList = receipts || [];

                const tempQuoteData = [];
                users.forEach(userRow => {
                    if (!userRow.tipo_adesione) return;

                    const nomeComp = `${userRow.nome} ${userRow.cognome}`;
                    const quotaVal = parseFloat(userRow.quota_totale) || 0;
                    const userReceipt = receiptsList.find(r => r.utente_id === userRow.id);
                    const stato = quotaVal <= 0 ? 1 : 0; // 1 = SALDATO, 0 = DA SALDARE

                    tempQuoteData.push({
                        id: userRow.id,
                        nominativo: `${userRow.cognome} ${userRow.nome}`.toUpperCase(),
                        nomeComp: nomeComp,
                        tipo_adesione: userRow.tipo_adesione,
                        quota_totale: quotaVal,
                        quota_scadenza: '31-12-2026',
                        stato: stato,
                        userReceipt: userReceipt
                    });
                });

                quoteData = tempQuoteData;
                sortArray(quoteData, quoteSort.field, quoteSort.direction);
                updateSortIcon('sort-icon-quote', quoteSort.field, quoteSort.direction);
                renderQuoteTable();
            } catch (err) {
                console.error("Errore caricamento quote:", err);
            }
        }

        function renderQuoteTable() {
            const body = document.getElementById('quote-list-body');
            if (!body) return;
            body.innerHTML = '';

            if (quoteData.length === 0) {
                body.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nessuna transazione registrata.</td></tr>';
                return;
            }

            quoteData.forEach(item => {
                const row = document.createElement('tr');
                let actionHtml = '';
                if (item.stato === 1) {
                    if (item.userReceipt) {
                        actionHtml = `
                            <div class="flex flex-col items-end gap-0.5">
                                <span class="px-2 py-0.5 border border-green-500/30 text-[9px] font-bold rounded uppercase text-green-500 bg-green-500/10">SALDATO</span>
                                <span class="text-[8px] text-gray-400 font-headline uppercase mt-0.5">RICEVUTA N. ${escapeHtml(item.userReceipt.numero_ricevuta)}/${escapeHtml(item.userReceipt.anno_fiscale)}</span>
                                <span class="text-[8px] text-gray-500 font-mono">${escapeHtml(item.userReceipt.data_pagamento.substring(0, 10))} via ${escapeHtml(item.userReceipt.metodo_pagamento || 'BONIFICO')}</span>
                            </div>
                        `;
                    } else {
                        actionHtml = `
                            <div class="flex flex-col items-end gap-0.5">
                                <span class="px-2 py-0.5 border border-green-500/30 text-[9px] font-bold rounded uppercase text-green-500 bg-green-500/10">SALDATO</span>
                                <span class="text-[8px] text-gray-500 font-headline uppercase mt-0.5">REGISTRAZIONE MANUALE</span>
                            </div>
                        `;
                    }
                } else if (userRoles.some(r => ['presidente', 'vice_presidente', 'tesoriere'].includes(r))) {
                    actionHtml = `<button onclick="registraPagamento('${escapeHtml(item.id)}')" class="bg-white text-black font-headline text-[9px] font-bold px-2 py-0.5 hover:bg-primary hover:text-white transition-all uppercase">SALDA</button>`;
                } else {
                    actionHtml = '<span class="text-[9px] text-gray-500 uppercase">Sola lettura</span>';
                }

                row.innerHTML = `
                    <td class="p-4 font-bold text-white">${escapeHtml(item.nomeComp)}</td>
                    <td class="p-4 text-gray-400 uppercase">${escapeHtml(item.tipo_adesione).replace(/_/g, ' ')}</td>
                    <td class="p-4 text-primary font-bold">€${item.quota_totale.toFixed(2)}</td>
                    <td class="p-4 text-gray-400">${escapeHtml(item.quota_scadenza)}</td>
                    <td class="p-4 text-right">${actionHtml}</td>
                `;
                body.appendChild(row);
            });
        }

        // Caricamento Contabilità (Prima Nota ed Entrate/Uscite)
        async function loadContabilita() {
            try {
                // 1. Carica le entrate (ricevute)
                const { data: entrate, error: errEntrate } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .select(`
                        id,
                        numero_ricevuta,
                        anno_fiscale,
                        importo,
                        causale,
                        data_pagamento,
                        utenti ( nome, cognome )
                    `);
                
                if (errEntrate) throw errEntrate;

                // 2. Carica le uscite (spese)
                const { data: uscite, error: errUscite } = await supabaseClient
                    .from('registro_spese')
                    .select(`
                        id,
                        titolo,
                        importo,
                        categoria,
                        data_spesa,
                        utenti:registrato_da ( nome, cognome )
                    `);

                if (errUscite) throw errUscite;

                const primaNota = [];
                let totEntrate = 0;
                let totUscite = 0;

                entrate.forEach(e => {
                    const sogg = e.utenti ? `${e.utenti.nome} ${e.utenti.cognome}` : 'N/D';
                    totEntrate += parseFloat(e.importo) || 0;
                    primaNota.push({
                        data: e.data_pagamento,
                        tipo: 'ENTRATA',
                        causale: e.causale,
                        soggetto: sogg,
                        importo: parseFloat(e.importo) || 0,
                        dettagli: `Ricevuta n. ${e.numero_ricevuta}/${e.anno_fiscale}`
                    });
                });

                uscite.forEach(u => {
                    const sogg = u.utenti ? `${u.utenti.nome} ${u.utenti.cognome}` : 'N/D';
                    totUscite += parseFloat(u.importo) || 0;
                    primaNota.push({
                        data: u.data_spesa,
                        tipo: 'USCITA',
                        causale: `[${u.categoria}] ${u.titolo}`,
                        soggetto: sogg,
                        importo: parseFloat(u.importo) || 0,
                        dettagli: 'Spesa registrata'
                    });
                });

                document.getElementById('cont-totale-entrate').textContent = `€${totEntrate.toFixed(2)}`;
                document.getElementById('cont-totale-uscite').textContent = `€${totUscite.toFixed(2)}`;
                const saldo = totEntrate - totUscite;
                const saldoEl = document.getElementById('cont-saldo-cassa');
                saldoEl.textContent = `€${saldo.toFixed(2)}`;
                if (saldo < 0) {
                    saldoEl.className = 'text-2xl font-headline font-black text-primary mt-1';
                } else {
                    saldoEl.className = 'text-2xl font-headline font-black text-green-500 mt-1';
                }

                contabilitaData = primaNota;
                sortArray(contabilitaData, contabilitaSort.field, contabilitaSort.direction);
                updateSortIcon('sort-icon-contabilita', contabilitaSort.field, contabilitaSort.direction);
                renderContabilitaTable();

            } catch (err) {
                console.error("Errore contabilità:", err);
                const body = document.getElementById('contabilita-list-body');
                if (body) body.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-primary font-bold">Errore nel caricamento della contabilità.</td></tr>';
            }
        }

        function renderContabilitaTable() {
            const body = document.getElementById('contabilita-list-body');
            if (!body) return;
            body.innerHTML = '';

            if (contabilitaData.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Nessuna transazione registrata in prima nota.</td></tr>';
                return;
            }

            contabilitaData.forEach(item => {
                const row = document.createElement('tr');
                const tipoColor = item.tipo === 'ENTRATA' ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-primary bg-primary/10 border-primary/30';
                const impPrefix = item.tipo === 'ENTRATA' ? '+' : '-';
                const impColor = item.tipo === 'ENTRATA' ? 'text-green-500' : 'text-primary';

                row.innerHTML = `
                    <td class="p-4 text-gray-400 font-mono">${escapeHtml(item.data)}</td>
                    <td class="p-4">
                        <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase ${tipoColor}">${escapeHtml(item.tipo)}</span>
                    </td>
                    <td class="p-4 text-white">${escapeHtml(item.causale)}</td>
                    <td class="p-4 text-gray-400 font-bold">${escapeHtml(item.soggetto)}</td>
                    <td class="p-4 font-bold ${impColor}">${impPrefix}€${item.importo.toFixed(2)}</td>
                    <td class="p-4 text-gray-500 text-[10px]">${escapeHtml(item.dettagli)}</td>
                `;
                body.appendChild(row);
            });
        }

        function showNuovaSpesaModal() {
            document.getElementById('spesa-titolo').value = '';
            document.getElementById('spesa-importo').value = '';
            document.getElementById('spesa-data').value = new Date().toISOString().substring(0, 10);
            document.getElementById('modal-spesa').classList.remove('hidden');
        }

        function closeModalSpesa() {
            document.getElementById('modal-spesa').classList.add('hidden');
        }

        async function submitSpesa() {
            const titolo = document.getElementById('spesa-titolo').value;
            const importo = parseFloat(document.getElementById('spesa-importo').value);
            const data = document.getElementById('spesa-data').value;
            const categoria = document.getElementById('spesa-categoria').value;

            if (!titolo || isNaN(importo) || !data) {
                alert("Tutti i campi con l'asterisco sono obbligatori.");
                return;
            }

            try {
                const { error } = await supabaseClient
                    .from('registro_spese')
                    .insert({
                        titolo: titolo,
                        importo: importo,
                        data_spesa: data,
                        categoria: categoria,
                        registrato_da: currentUser.id
                    });

                if (error) throw error;

                await scriviAuditLog('REGISTRAZIONE_SPESA_USCITA', 'registro_spese', 'N/A', {
                    titolo: titolo,
                    importo: importo,
                    categoria: categoria,
                    data_spesa: data
                });

                alert("Spesa registrata correttamente!");
                closeModalSpesa();
                loadContabilita();
            } catch (err) {
                alert("Errore registrazione spesa: " + err.message);
            }
        }

        // Caricamento Verbali
        async function loadVerbali() {
            const container = document.getElementById('verbali-container');
            container.innerHTML = '';

            try {
                const { data, error } = await supabaseClient
                    .from('verbali_consiglio')
                    .select('*')
                    .order('data_riunione', { ascending: false });

                if (error) throw error;

                if (!data || data.length === 0) {
                    container.innerHTML = '<div class="border border-dashed border-white/20 p-8 text-center text-gray-500 uppercase text-xs">Nessun verbale depositato in archivio.</div>';
                    return;
                }

                data.forEach(verb => {
                    const el = document.createElement('div');
                    el.className = 'border border-white/10 p-5 bg-black/30 space-y-3';
                    
                    el.innerHTML = `
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-headline text-xs font-bold text-primary uppercase">${escapeHtml(verb.numero_verbale)}</h4>
                                <p class="text-[10px] text-gray-500 uppercase">Data Riunione: ${escapeHtml(verb.data_riunione)}</p>
                            </div>
                            <span class="text-[9px] bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded font-bold uppercase">DEPOSITATO</span>
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed uppercase whitespace-pre-wrap font-mono">${escapeHtml(verb.delibera_testo)}</p>
                    `;
                    container.appendChild(el);
                });
            } catch (err) {
                console.error("Errore caricamento verbali:", err);
            }
        }

        // Attivazione Tesseramento
        async function attivaTesseramento(tessId) {
            try {
                if (!currentUser) return;
                // Fetch the anagrafica_id for the given tessId
                const { data: row, error: fetchErr } = await supabaseClient
                    .from('registro_tesserati')
                    .select('anagrafica_id')
                    .eq('id_tesserato', tessId)
                    .single();
                if (fetchErr) throw fetchErr;

                const { data, error } = await supabaseClient.rpc('approva_tesserato', {
                    p_anagrafica_id: row.anagrafica_id,
                    p_deciso_da: currentUser.id
                });

                if (error) throw error;

                await scriviAuditLog('ATTIVAZIONE_TESSERAMENTO', 'registro_tesserati', tessId, {
                    stato_tesseramento: 'ATTIVO'
                });

                alert(`Tesseramento attivato con successo.`);
                loadTesserati();
                loadApprovazioni();
                loadStats();
            } catch (err) {
                alert("Errore durante l'attivazione: " + err.message);
            }
        }

        // Eliminazione Utente
        async function eliminaUtente(anagraficaId, nominativo) {
            const confirmed = confirm(`ATTENZIONE! Sei sicuro di voler eliminare DEFINITIVAMENTE l'utente ${nominativo} e tutti i suoi dati dal database? Questa operazione è irreversibile.`);
            if (!confirmed) return;

            try {
                const { data, error } = await supabaseClient
                    .rpc('elimina_utente_completo', { target_anagrafica_id: anagraficaId });

                if (error) throw error;

                alert(`Utente ${nominativo} eliminato con successo.`);
                // Ricarica tutti i pannelli per aggiornare i dati
                loadSoci();
                loadTesserati();
                loadQuote();
                if (typeof loadContabilita === 'function') loadContabilita();
                if (typeof loadApprovazioni === 'function') loadApprovazioni();
                loadStats();
            } catch (err) {
                alert("Errore durante l'eliminazione dell'utente: " + err.message);
            }
        }

        // Registrazione Pagamento (con emissione ricevuta progressiva e audit log)
        async function registraPagamento(userId) {
            try {
                // 1. Recupera dettagli dell'utente per la ricevuta
                const { data: userProfile, error: userError } = await supabaseClient
                    .from('utenti')
                    .select('nome, cognome, quota_totale, tipo_adesione')
                    .eq('id', userId)
                    .single();
                if (userError || !userProfile) throw new Error("Utente non trovato");

                const importo = userProfile.quota_totale || 0;
                const annoFiscale = new Date().getFullYear();

                // 2. Calcola il numero di ricevuta progressivo per l'anno corrente
                const { data: maxReceipt, error: maxError } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .select('numero_ricevuta')
                    .eq('anno_fiscale', annoFiscale)
                    .order('numero_ricevuta', { ascending: false })
                    .limit(1);

                let nextNum = 1;
                if (!maxError && maxReceipt && maxReceipt.length > 0) {
                    nextNum = maxReceipt[0].numero_ricevuta + 1;
                }

                // 3. Inserisce la ricevuta nel database
                const { data: recData, error: recError } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .insert({
                        numero_ricevuta: nextNum,
                        anno_fiscale: annoFiscale,
                        utente_id: userId,
                        importo: importo,
                        causale: `Quota associativa annuale - ${userProfile.tipo_adesione ? userProfile.tipo_adesione.replace(/_/g, ' ') : 'Socio'}`,
                        metodo_pagamento: 'BONIFICO'
                    })
                    .select()
                    .single();

                if (recError) throw recError;

                // 4. Salda la quota impostando a 0.00
                const { error } = await supabaseClient
                    .from('utenti')
                    .update({
                        quota_totale: 0.00
                    })
                    .eq('id', userId);

                if (error) throw error;

                // 5. Scrivi l'audit log
                await scriviAuditLog('EMISSIONE_RICEVUTA_PAGAMENTO', 'ricevute_pagamenti', recData.id, {
                    numero_ricevuta: nextNum,
                    anno_fiscale: annoFiscale,
                    utente_id: userId,
                    importo: importo
                });

                alert(`Quota associativa/tesseramento saldata correttamente! Generata Ricevuta n. ${nextNum}/${annoFiscale}`);
                loadQuote();
            } catch (err) {
                alert("Errore registrazione pagamento: " + err.message);
            }
        }

        // Modal Delibera Socio
        function openModalApprovazione(socioId) {
            document.getElementById('approvazione-socio-id').value = socioId;
            document.getElementById('delibera-data').value = new Date().toISOString().substring(0, 10);
            document.getElementById('modal-approvazione').classList.remove('hidden');
        }

        function closeModalApprovazione() {
            document.getElementById('modal-approvazione').classList.add('hidden');
        }

        async function submitApprovazione() {
            const id = document.getElementById('approvazione-socio-id').value;
            const verbale = document.getElementById('delibera-numero-verbale').value;
            const dataVerbale = document.getElementById('delibera-data').value;

            if (!verbale || !dataVerbale) {
                alert("Tutti i campi contrassegnati con l'asterisco sono obbligatori.");
                return;
            }

            try {
                // 1. Aggiorna lo stato del socio nel database
                const { error } = await supabaseClient
                    .from('registro_soci')
                    .update({
                        stato_socio: 'ATTIVO',
                        data_delibera_direttivo: dataVerbale,
                        numero_verbale: verbale
                    })
                    .eq('id_socio', id);

                if (error) throw error;

                await scriviAuditLog('DELIBERA_SOCIO', 'registro_soci', id, {
                    stato_socio: 'ATTIVO',
                    data_delibera_direttivo: dataVerbale,
                    numero_verbale: verbale
                });

                alert("Socio deliberato ed ammesso ufficialmente a libro soci!");
                closeModalApprovazione();
                loadSoci();
            } catch (err) {
                alert("Errore: " + err.message);
            }
        }

        // Wizard Board Minutes Variables
        let wizardCurrentStep = 1;
        let wizardPendingSoci = [];
        let autoSuggestedVerbaleNumero = "";

        // Global toggle helper for inline HTML onchange events
        window.toggleMotivoRifiuto = function(anagraficaId, show) {
            const wrapper = document.getElementById(`motivo-wrapper-${anagraficaId}`);
            if (wrapper) {
                wrapper.classList.toggle('hidden', !show);
                const input = document.getElementById(`motivo-${anagraficaId}`);
                if (!show && input) {
                    input.value = '';
                }
            }
        };

        // Listen for manual number overrides
        document.addEventListener('DOMContentLoaded', () => {
            const inputNum = document.getElementById('verbale-numero');
            if (inputNum) {
                inputNum.addEventListener('input', () => {
                    const warning = document.getElementById('manual-number-warning');
                    if (warning) {
                        if (inputNum.value.trim() !== autoSuggestedVerbaleNumero) {
                            warning.classList.remove('hidden');
                        } else {
                            warning.classList.add('hidden');
                        }
                    }
                });
            }
        });

        // Handle attendance changes to dynamically enable/disable and populate proxy targets
        window.handlePresenzaChange = function(memberId) {
            const state = document.querySelector(`input[name="presenza-${memberId}"]:checked`)?.value;
            const delegaSelect = document.getElementById(`delega-${memberId}`);
            
            if (state === 'PRESENTE') {
                if (delegaSelect) {
                    delegaSelect.value = '';
                    delegaSelect.disabled = true;
                }
            } else {
                if (delegaSelect) {
                    delegaSelect.disabled = false;
                }
            }
            
            // Re-populate all delegation selects to only list members who are marked 'PRESENTE'
            repopulateDelegheDropdowns();
            updateQuorum();
        };

        function repopulateDelegheDropdowns() {
            // Find all members who are physically PRESENT
            const presentMembers = [];
            direttivoData.forEach(m => {
                const state = document.querySelector(`input[name="presenza-${m.id}"]:checked`)?.value;
                if (state === 'PRESENTE') {
                    presentMembers.push(m);
                }
            });

            // Populate delega selects for those who are absent
            direttivoData.forEach(m => {
                const delegaSelect = document.getElementById(`delega-${m.id}`);
                if (!delegaSelect) return;

                const currentVal = delegaSelect.value;
                delegaSelect.innerHTML = '<option value="">Nessuna delega</option>';

                presentMembers.forEach(p => {
                    if (p.id !== m.id) {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = p.nomeComp;
                        if (p.id === currentVal) {
                            opt.selected = true;
                        }
                        delegaSelect.appendChild(opt);
                    }
                });
            });
        }

        // Modal Nuovo Verbale Wizard
        async function showNewVerbaleModal() {
            try {
                wizardCurrentStep = 1;
                customPointsCount = 0;
                document.getElementById('wizard-punti-aggiuntivi-container').innerHTML = '';
                document.getElementById('discussione-varie').value = '';
                document.getElementById('voti-punto-1-favorevoli').value = '0';
                document.getElementById('voti-punto-1-contrari').value = '0';
                document.getElementById('voti-punto-1-astenuti').value = '0';
                document.getElementById('votazione-punto-1-tipo').value = 'UNANIMITA';
                document.getElementById('voti-punto-1-dettaglio').classList.add('hidden');
                document.getElementById('manual-number-warning').classList.add('hidden');

                // 1. Set dates
                const todayStr = new Date().toISOString().substring(0, 10);
                document.getElementById('verbale-data').value = todayStr;
                
                // Convocazione: default 5 days ago
                const fiveDaysAgo = new Date();
                fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                document.getElementById('verbale-convocazione-data').value = fiveDaysAgo.toISOString().substring(0, 10);

                // 2. Fetch max verbale number to auto-suggest next
                const { data: maxVerb, error: maxErr } = await supabaseClient
                    .from('verbali_consiglio')
                    .select('numero_verbale')
                    .order('created_at', { ascending: false })
                    .limit(1);

                let nextNum = 1;
                const currentYear = new Date().getFullYear();
                if (!maxErr && maxVerb && maxVerb.length > 0) {
                    const match = maxVerb[0].numero_verbale.match(/(\d+)\/(\d+)/);
                    if (match && parseInt(match[2]) === currentYear) {
                        nextNum = parseInt(match[1]) + 1;
                    }
                }
                autoSuggestedVerbaleNumero = `${nextNum}/${currentYear}`;
                document.getElementById('verbale-numero').value = autoSuggestedVerbaleNumero;

                // 3. Make sure board members are loaded
                if (!direttivoData || direttivoData.length === 0) {
                    await loadDirettivo();
                }

                // 4. Populate Presidente and Segretario dropdowns
                const presSelect = document.getElementById('verbale-presidente-select');
                const segSelect = document.getElementById('verbale-segretario-select');
                presSelect.innerHTML = '';
                segSelect.innerHTML = '';

                direttivoData.forEach(m => {
                    const optPres = document.createElement('option');
                    optPres.value = m.id;
                    optPres.textContent = `${m.nomeComp} (${m.ruolo.replace(/_/g, ' ').toUpperCase()})`;
                    if (m.ruolo === 'presidente') optPres.selected = true;
                    presSelect.appendChild(optPres);

                    const optSeg = document.createElement('option');
                    optSeg.value = m.id;
                    optSeg.textContent = `${m.nomeComp} (${m.ruolo.replace(/_/g, ' ').toUpperCase()})`;
                    if (m.ruolo === 'segretario') optSeg.selected = true;
                    segSelect.appendChild(optSeg);
                });

                // 5. Populate attendance table with Delega selector
                const tbody = document.getElementById('presenze-list-body');
                tbody.innerHTML = '';
                direttivoData.forEach(m => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-white/5';
                    row.innerHTML = `
                        <td class="p-3 font-bold text-white uppercase text-xs">
                            ${m.nomeComp} 
                            <span class="text-gray-500 font-normal">(${m.ruolo.replace(/_/g, ' ')})</span>
                        </td>
                        <td class="p-3 text-center">
                            <input type="radio" name="presenza-${m.id}" value="PRESENTE" checked onchange="handlePresenzaChange('${m.id}')" class="accent-primary">
                        </td>
                        <td class="p-3 text-center">
                            <input type="radio" name="presenza-${m.id}" value="ASSENTE_GIUSTIFICATO" onchange="handlePresenzaChange('${m.id}')" class="accent-primary">
                        </td>
                        <td class="p-3 text-center">
                            <input type="radio" name="presenza-${m.id}" value="ASSENTE_INGIUSTIFICATO" onchange="handlePresenzaChange('${m.id}')" class="accent-primary">
                        </td>
                        <td class="p-3 text-center">
                            <select id="delega-${m.id}" onchange="updateQuorum()" disabled class="bg-black text-white text-[10px] border border-white/20 px-1 py-0.5 font-mono focus:ring-0 w-full max-w-[150px] disabled:opacity-40 disabled:cursor-not-allowed">
                                <option value="">Nessuna delega</option>
                            </select>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
                repopulateDelegheDropdowns();
                updateQuorum();

                // 6. Fetch pending members for Libro Soci integration
                const { data: pendingSoci, error: errSoci } = await supabaseClient
                    .from('registro_approvazioni')
                    .select(`
                        anagrafica_id,
                        anagrafiche (
                            nome,
                            cognome,
                            data_nascita,
                            comune_nascita,
                            provincia_nascita,
                            codice_fiscale
                        )
                    `)
                    .eq('stato', 'IN_ATTESA')
                    .or('tipo.eq.SOCIO,tipo.eq.SOCIO_TESSERATO');

                if (errSoci) throw errSoci;
                wizardPendingSoci = pendingSoci || [];

                document.getElementById('soci-pending-count').textContent = `${wizardPendingSoci.length} IN ATTESA`;
                const pendingListDiv = document.getElementById('soci-pending-list-wizard');
                pendingListDiv.innerHTML = '';

                if (wizardPendingSoci.length === 0) {
                    pendingListDiv.innerHTML = '<p class="text-[10px] text-gray-500 uppercase p-2">Nessun nuovo socio in attesa di approvazione.</p>';
                } else {
                    wizardPendingSoci.forEach(s => {
                        const anag = s.anagrafiche ? (Array.isArray(s.anagrafiche) ? s.anagrafiche[0] : s.anagrafiche) : null;
                        const birth = anag?.data_nascita || 'N/D';
                        const place = `${anag?.comune_nascita || 'N/D'} (${anag?.provincia_nascita || 'N/D'})`;
                        const div = document.createElement('div');
                        div.className = 'p-3 border-b border-white/5 text-[10px] text-gray-300 font-mono space-y-2 bg-black/20';
                        div.innerHTML = `
                            <div class="flex justify-between items-start gap-4">
                                <span class="uppercase font-bold text-white flex-1">
                                    ${anag?.cognome || 'N/D'} ${anag?.nome || 'N/D'} 
                                    <span class="text-gray-500 font-normal block mt-0.5 text-[9px]">Nascita: ${birth} a ${place} | CF: ${anag?.codice_fiscale || 'N/D'}</span>
                                </span>
                                <div class="flex items-center gap-4 border border-white/10 p-1.5 bg-black">
                                    <label class="flex items-center gap-1 cursor-pointer">
                                        <input type="radio" name="decisione-socio-${s.anagrafica_id}" data-socio-id="${s.anagrafica_id}" value="APPROVATO" checked class="accent-green-500" onchange="toggleMotivoRifiuto('${s.anagrafica_id}', false)">
                                        <span class="text-green-500 text-[9px] font-bold uppercase">APPROVA</span>
                                    </label>
                                    <label class="flex items-center gap-1 cursor-pointer">
                                        <input type="radio" name="decisione-socio-${s.anagrafica_id}" data-socio-id="${s.anagrafica_id}" value="RESPINTO" class="accent-primary" onchange="toggleMotivoRifiuto('${s.anagrafica_id}', true)">
                                        <span class="text-primary text-[9px] font-bold uppercase">RESPINGI</span>
                                    </label>
                                </div>
                            </div>
                            <div id="motivo-wrapper-${s.anagrafica_id}" class="hidden">
                                <label class="block text-[8px] font-headline font-bold text-primary uppercase mb-1">Motivazione Rifiuto *</label>
                                <input type="text" id="motivo-${s.anagrafica_id}" class="w-full brutalist-input text-[10px] py-1 px-2 bg-black text-white border border-white/20 focus:outline-none" placeholder="E.g. Mancanza di versamento quota o requisiti statutari assenti">
                            </div>
                        `;
                        pendingListDiv.appendChild(div);
                    });
                }

                goToStep(1);
                document.getElementById('modal-nuovo-verbale').classList.remove('hidden');
            } catch (err) {
                alert("Errore inizializzazione wizard: " + err.message);
            }
        }

        function closeModalVerbale() {
            document.getElementById('modal-nuovo-verbale').classList.add('hidden');
        }

        function goToStep(step) {
            wizardCurrentStep = step;
            document.getElementById('wizard-step-indicator').textContent = `Step ${step} di 4`;

            // Toggle step divs
            for (let i = 1; i <= 4; i++) {
                const el = document.getElementById(`wizard-step-${i}`);
                const tab = document.getElementById(`step-tab-${i}`);
                if (i === step) {
                    el.classList.remove('hidden');
                    tab.className = 'flex-1 text-center py-2 text-[10px] font-headline font-bold border-b-2 border-primary text-primary cursor-pointer uppercase';
                } else {
                    el.classList.add('hidden');
                    tab.className = 'flex-1 text-center py-2 text-[10px] font-headline font-bold border-b-2 border-transparent text-gray-500 cursor-pointer uppercase';
                }
            }

            // Navigation buttons
            document.getElementById('btn-wizard-prev').classList.toggle('hidden', step === 1);
            document.getElementById('btn-wizard-next').classList.toggle('hidden', step === 4);
            document.getElementById('btn-wizard-submit').classList.toggle('hidden', step !== 4);

            if (step === 4) {
                compileVerbaleConforme();
            }
        }

        function navigateWizard(direction) {
            const nextStep = wizardCurrentStep + direction;
            if (nextStep >= 1 && nextStep <= 4) {
                // Validation for step 1
                if (wizardCurrentStep === 1 && direction > 0) {
                    const numero = document.getElementById('verbale-numero').value;
                    const data = document.getElementById('verbale-data').value;
                    const luogo = document.getElementById('verbale-luogo').value;
                    if (!numero || !data || !luogo) {
                        alert("Tutti i campi contrassegnati con l'asterisco sono obbligatori.");
                        return;
                    }
                }
                // Validation for step 3 rejections motivation
                if (wizardCurrentStep === 3 && direction > 0) {
                    let missingMotivations = false;
                    const decisionRadios = document.querySelectorAll('#soci-pending-list-wizard input[type="radio"]:checked');
                    decisionRadios.forEach(radio => {
                        if (radio.value === 'RESPINTO') {
                            const socioId = radio.getAttribute('data-socio-id');
                            const motivoVal = document.getElementById(`motivo-${socioId}`).value;
                            if (!motivoVal || motivoVal.trim() === '') {
                                missingMotivations = true;
                            }
                        }
                    });
                    if (missingMotivations) {
                        alert("Fornisci una motivazione per ogni socio respinto.");
                        return;
                    }
                }
                goToStep(nextStep);
            }
        }

        function updateQuorum() {
            let presentiFisici = 0;
            let delegheCount = 0;
            const totale = direttivoData.length;

            direttivoData.forEach(m => {
                const state = document.querySelector(`input[name="presenza-${m.id}"]:checked`)?.value;
                if (state === 'PRESENTE') {
                    presentiFisici++;
                } else {
                    const proxy = document.getElementById(`delega-${m.id}`)?.value;
                    if (proxy && proxy !== '') {
                        delegheCount++;
                    }
                }
            });

            const totalQuorum = presentiFisici + delegheCount;
            const meetsQuorum = totalQuorum > (totale / 2);
            
            const ind = document.getElementById('quorum-constitutivo-indicator');
            if (ind) {
                if (meetsQuorum) {
                    ind.innerHTML = `VALIDO (${totalQuorum} su ${totale})<br><span class="text-[8px] font-normal lowercase opacity-80">Fisici: ${presentiFisici} | Deleghe: ${delegheCount}</span>`;
                    ind.className = 'px-4 py-2 border font-headline text-xs font-bold rounded uppercase border-green-500/30 text-green-500 bg-green-500/10 text-center';
                } else {
                    ind.innerHTML = `NON VALIDO (${totalQuorum} su ${totale})<br><span class="text-[8px] font-normal lowercase opacity-80">Fisici: ${presentiFisici} | Deleghe: ${delegheCount}</span>`;
                    ind.className = 'px-4 py-2 border font-headline text-xs font-bold rounded uppercase border-primary/30 text-primary bg-primary/10 text-center';
                }
            }
        }

        function toggleVotiPunto1(val) {
            document.getElementById('voti-punto-1-dettaglio').classList.toggle('hidden', val === 'UNANIMITA');
        }

        let customPointsCount = 0;
        function aggiungiPuntoAggiuntivo() {
            customPointsCount++;
            const container = document.getElementById('wizard-punti-aggiuntivi-container');
            const pointDiv = document.createElement('div');
            pointDiv.id = `custom-point-row-${customPointsCount}`;
            pointDiv.className = 'border border-white/10 p-4 bg-black/40 space-y-3 relative';
            pointDiv.innerHTML = `
                <button type="button" onclick="rimuoviPuntoAggiuntivo(${customPointsCount})" class="absolute top-2 right-2 text-primary hover:text-white text-[9px] font-headline font-bold uppercase">Rimuovi</button>
                <h4 class="font-headline text-[10px] font-bold text-white uppercase">ODG Punto Aggiuntivo</h4>
                <div class="group">
                    <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Titolo Punto ODG *</label>
                    <input type="text" class="w-full brutalist-input text-xs custom-point-titolo bg-black text-white p-2 border border-white/20 focus:outline-none" placeholder="E.g. Approvazione rendiconto economico / Pianificazione eventi" required>
                </div>
                <div class="group">
                    <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Discussione *</label>
                    <textarea class="w-full brutalist-input text-xs custom-point-discussione bg-black text-white p-2 border border-white/20 focus:outline-none" rows="3" placeholder="Descrivi qui la discussione svolta..." required></textarea>
                </div>
                <div class="group">
                    <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Testo Deliberato *</label>
                    <textarea class="w-full brutalist-input text-xs custom-point-delibera bg-black text-white p-2 border border-white/20 focus:outline-none" rows="2" placeholder="Scrivi il testo della delibera approvata..." required></textarea>
                </div>
                <div class="grid grid-cols-4 gap-4 items-end bg-white/5 p-3 rounded">
                    <div>
                        <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Favorevoli</label>
                        <input type="number" class="w-full brutalist-input text-xs custom-point-favorevoli bg-black text-white p-2 border border-white/20 focus:outline-none" value="0">
                    </div>
                    <div>
                        <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Contrari</label>
                        <input type="number" class="w-full brutalist-input text-xs custom-point-contrari bg-black text-white p-2 border border-white/20 focus:outline-none" value="0">
                    </div>
                    <div>
                        <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Astenuti</label>
                        <input type="number" class="w-full brutalist-input text-xs custom-point-astenuti bg-black text-white p-2 border border-white/20 focus:outline-none" value="0">
                    </div>
                    <div>
                        <label class="block font-headline text-[9px] font-bold text-gray-400 uppercase mb-1">Esito</label>
                        <select class="w-full brutalist-input bg-black text-white text-xs custom-point-esito p-2 border border-white/20 focus:outline-none">
                            <option value="APPROVATO" selected>APPROVATO</option>
                            <option value="RESPINTO">RESPINTO</option>
                            <option value="NON_DELIBERATO">NON DELIBERATO</option>
                        </select>
                    </div>
                </div>
            `;
            container.appendChild(pointDiv);
        }

        function rimuoviPuntoAggiuntivo(id) {
            const el = document.getElementById(`custom-point-row-${id}`);
            if (el) el.remove();
        }

        function getCustomPoints() {
            const points = [];
            const titles = document.querySelectorAll('.custom-point-titolo');
            const discussions = document.querySelectorAll('.custom-point-discussione');
            const deliberas = document.querySelectorAll('.custom-point-delibera');
            const favs = document.querySelectorAll('.custom-point-favorevoli');
            const conts = document.querySelectorAll('.custom-point-contrari');
            const asts = document.querySelectorAll('.custom-point-astenuti');
            const esitos = document.querySelectorAll('.custom-point-esito');

            titles.forEach((el, idx) => {
                points.push({
                    ordine: idx + 2,
                    titolo: el.value,
                    discussione: discussions[idx].value,
                    delibera_tipo: 'ALTRO',
                    delibera_testo: deliberas[idx].value,
                    votazione: {
                        favorevoli: parseInt(favs[idx].value) || 0,
                        contrari: parseInt(conts[idx].value) || 0,
                        astenuti: parseInt(asts[idx].value) || 0,
                        esito: esitos[idx].value
                    }
                });
            });
            return points;
        }

        function compileVerbaleConforme() {
            const numero = document.getElementById('verbale-numero').value;
            const data = document.getElementById('verbale-data').value;
            const oraInizio = document.getElementById('verbale-ora-inizio').value;
            const oraFine = document.getElementById('verbale-ora-fine').value;
            const luogo = document.getElementById('verbale-luogo').value;
            const tipo = document.getElementById('verbale-tipo').value;
            const convocazioneMezzo = document.getElementById('verbale-convocazione-mezzo').value;
            const convocazioneData = document.getElementById('verbale-convocazione-data').value;

            const presId = document.getElementById('verbale-presidente-select').value;
            const segId = document.getElementById('verbale-segretario-select').value;
            const presidenteNome = direttivoData.find(m => m.id === presId)?.nomeComp || 'N/D';
            const segretarioNome = direttivoData.find(m => m.id === segId)?.nomeComp || 'N/D';

            let presentiList = [];
            let assentiGiustList = [];
            let assentiIngiustList = [];

            direttivoData.forEach(m => {
                const stato = document.querySelector(`input[name="presenza-${m.id}"]:checked`)?.value;
                const proxyId = document.getElementById(`delega-${m.id}`)?.value;
                let displayStr = `${m.nomeComp.toUpperCase()} - ${m.ruolo.replace(/_/g, ' ').toUpperCase()}`;
                
                if (stato === 'PRESENTE') {
                    presentiList.push(displayStr);
                } else {
                    if (proxyId && proxyId !== '') {
                        const proxyName = direttivoData.find(x => x.id === proxyId)?.nomeComp || 'N/D';
                        displayStr += ` (ASSENTE RAPPRESENTATO PER DELEGA DA ${proxyName.toUpperCase()})`;
                        presentiList.push(displayStr);
                    } else if (stato === 'ASSENTE_GIUSTIFICATO') {
                        assentiGiustList.push(displayStr);
                    } else {
                        assentiIngiustList.push(displayStr);
                    }
                }
            });

            const countPresenti = presentiList.length;
            const countTotale = direttivoData.length;

            let odgTxt = `ORDINE DEL GIORNO (ODG):\n`;
            odgTxt += `1. ESAME E APPROVAZIONE DELLE DOMANDE DI AMMISSIONE DI NUOVI SOCI;\n`;
            
            const customPoints = getCustomPoints();
            customPoints.forEach((p, idx) => {
                odgTxt += `${idx + 2}. ${p.titolo.toUpperCase()};\n`;
            });
            odgTxt += `${customPoints.length + 2}. VARIE ED EVENTUALI.`;

            let text = `REGISTRO DELLE DELIBERAZIONI DEL CONSIGLIO DIRETTIVO\n`;
            text += `ASD ADRENALINA CLUB APS\n\n`;
            text += `Verbale n. ${numero}\n\n`;
            text += `Il giorno ${data} alle ore ${oraInizio}, presso la sede sociale sita in ${luogo} (oppure: tramite piattaforma di videoconferenza, come previsto dallo Statuto), si è riunito in seduta ${tipo} il Consiglio Direttivo dell'Associazione Sportiva Dilettantistica e Associazione di Promozione Sociale "ADRENALINA CLUB APS", per discutere e deliberare sul seguente\n\n`;
            text += `${odgTxt}\n\n`;
            text += `Assume la presidenza della riunione il Signor ${presidenteNome.toUpperCase()}, in qualità di Presidente del Consiglio Direttivo, il quale chiama a svolgere le funzioni di Segretario verbalizzante il Signor ${segretarioNome.toUpperCase()}.\n\n`;
            text += `Il Presidente, constatata la regolarità della convocazione inviata in data ${convocazioneData} tramite ${convocazioneMezzo}, procede alla verifica delle presenze.\n\n`;
            
            text += `RISULTANO PRESENTI I SEGUENTI COMPONENTI DEL DIRETTIVO:\n`;
            presentiList.forEach(p => { text += `- ${p}\n`; });
            if (presentiList.length === 0) text += `- Nessuno\n`;
            
            text += `\nRISULTANO ASSENTI GIUSTIFICATI:\n`;
            assentiGiustList.forEach(a => { text += `- ${a}\n`; });
            if (assentiGiustList.length === 0) text += `- Nessuno\n`;
            
            text += `\nRISULTANO ASSENTI INGIUSTIFICATI:\n`;
            assentiIngiustList.forEach(a => { text += `- ${a}\n`; });
            if (assentiIngiustList.length === 0) text += `- Nessuno\n`;

            text += `\nIl Presidente dichiara che la riunione è validamente costituita essendo presente la maggioranza dei consiglieri in carica (${countPresenti} su ${countTotale}), idonea a deliberare a norma di legge e di Statuto.\n\n`;
            text += `DISCUSSIONE DEI PUNTI ALL'ORDINE DEL GIORNO:\n\n`;

            // Sul punto 1
            const vTipo1 = document.getElementById('votazione-punto-1-tipo').value;
            const vTxt1 = vTipo1 === 'UNANIMITA' ? 'all\'unanimità dei presenti' : 'a maggioranza dei presenti';
            text += `Sul punto 1 (Esame e approvazione delle domande di ammissione di nuovi soci):\n`;
            text += `Il Presidente presenta al Consiglio le domande di ammissione a socio ricevute. Il Consiglio Direttivo, verificate le generalità dei richiedenti, il versamento della quota associativa e la conformità ai requisiti previsti dallo Statuto e dalle norme ETS/ASD, ${vTxt1}\n\n`;
            text += `DELIBERA\n`;
            
            let approvedSociText = '';
            let rejectedSociText = '';
            
            const decisionRadios = document.querySelectorAll('#soci-pending-list-wizard input[type="radio"]:checked');
            decisionRadios.forEach(radio => {
                const socioId = radio.getAttribute('data-socio-id');
                const s = wizardPendingSoci.find(x => x.anagrafica_id === socioId);
                if (s) {
                    const anag = s.anagrafiche ? (Array.isArray(s.anagrafiche) ? s.anagrafiche[0] : s.anagrafiche) : null;
                    const birth = anag?.data_nascita || 'N/D';
                    const place = `${anag?.comune_nascita || 'N/D'} (${anag?.provincia_nascita || 'N/D'})`;
                    if (radio.value === 'APPROVATO') {
                        approvedSociText += `- ${anag?.cognome?.toUpperCase() || 'N/D'}, ${anag?.nome?.toUpperCase() || 'N/D'}, NATA/O IL ${birth} A ${place.toUpperCase()}, C.F. ${anag?.codice_fiscale || 'N/D'}\n`;
                    } else if (radio.value === 'RESPINTO') {
                        const motivoVal = document.getElementById(`motivo-${socioId}`).value || 'Motivazione non specificata';
                        rejectedSociText += `- ${anag?.cognome?.toUpperCase() || 'N/D'}, ${anag?.nome?.toUpperCase() || 'N/D'}, NATA/O IL ${birth} A ${place.toUpperCase()}, C.F. ${anag?.codice_fiscale || 'N/D'} (MOTIVO RIFIUTO: ${motivoVal.toUpperCase()})\n`;
                    }
                }
            });

            if (approvedSociText === '') {
                approvedSociText = `- NESSUN NUOVO SOCIO APPROVATO.\n`;
            }
            
            text += `di approvare l'ammissione dei seguenti nuovi soci, i quali vengono contestualmente iscritti nel Libro Soci dell'Associazione:\n`;
            text += approvedSociText;

            if (rejectedSociText !== '') {
                text += `\nIl Consiglio Direttivo delibera altresì di respingere le seguenti domande di ammissione per le motivazioni a fianco di ciascuna indicate:\n`;
                text += rejectedSociText;
            }

            // Custom points
            customPoints.forEach((p, idx) => {
                text += `\nSul punto ${idx + 2} (${p.titolo.toUpperCase()}):\n`;
                text += `${p.discussione || 'Nessuna discussione.'}\n\n`;
                text += `DELIBERA\n`;
                text += `${p.delibera_testo || 'Nessuna delibera adottata.'} (Voti favorevoli: ${p.votazione.favorevoli}, contrari: ${p.votazione.contrari}, astenuti: ${p.votazione.astenuti} - Esito: ${p.votazione.esito}).\n`;
            });

            // Varie ed eventuali
            const varieText = document.getElementById('discussione-varie').value || 'Nulla da segnalare.';
            text += `\nSul punto ${customPoints.length + 2} (Varie ed eventuali):\n`;
            text += `${varieText}\n\n`;

            text += `Null'altro essendovi da deliberare e nessuno chiedendo la parola, la seduta viene tolta alle ore ${oraFine}, previa lettura e approvazione del presente verbale.\n\n`;
            text += `Il Segretario verbalizzante                        Il Presidente\n`;
            text += `___________________________                        _____________________\n`;
            text += `(Sergio Paoletti)                                  (Tito Fabio Paoletti)\n`;

            document.getElementById('verbale-anteprevia-testo').value = text;
        }

        window.stampaVerbale = function() {
            const text = document.getElementById('verbale-anteprevia-testo').value;
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                    <head>
                        <title>Stampa Verbale</title>
                        <style>
                            body {
                                font-family: monospace;
                                white-space: pre-wrap;
                                font-size: 11px;
                                line-height: 1.4;
                                color: #000;
                                background: #fff;
                                padding: 40px;
                            }
                            @media print {
                                body {
                                    padding: 0;
                                }
                            }
                        </style>
                    </head>
                    <body>${text}</body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            }
        };

        async function concludiEInviaVerbale() {
            const numero = document.getElementById('verbale-numero').value;
            const data = document.getElementById('verbale-data').value;
            const oraInizio = document.getElementById('verbale-ora-inizio').value;
            const oraFine = document.getElementById('verbale-ora-fine').value;
            const luogo = document.getElementById('verbale-luogo').value;
            const tipo = document.getElementById('verbale-tipo').value;
            const convocazioneMezzo = document.getElementById('verbale-convocazione-mezzo').value;
            const convocazioneData = document.getElementById('verbale-convocazione-data').value;

            const presId = document.getElementById('verbale-presidente-select').value;
            const segId = document.getElementById('verbale-segretario-select').value;

            // Gather presence including delegation (delega_a)
            const presenze = [];
            let presentiConteggio = 0;
            direttivoData.forEach(m => {
                const stato = document.querySelector(`input[name="presenza-${m.id}"]:checked`)?.value;
                const proxyId = document.getElementById(`delega-${m.id}`)?.value || null;
                
                if (stato === 'PRESENTE' || (proxyId && proxyId !== '')) {
                    presentiConteggio++;
                }

                presenze.push({
                    utente_id: m.id,
                    presenza: stato,
                    delegato_a: proxyId
                });
            });

            const quorumCostitutivo = presentiConteggio > (direttivoData.length / 2);

            // Gather approved and rejected soci details
            const approvedSoci = [];
            const rejectedSoci = [];
            let missingMotivations = false;
            
            const decisionRadios = document.querySelectorAll('#soci-pending-list-wizard input[type="radio"]:checked');
            decisionRadios.forEach(radio => {
                const socioId = radio.getAttribute('data-socio-id');
                if (radio.value === 'APPROVATO') {
                    approvedSoci.push(socioId);
                } else {
                    const motivoVal = document.getElementById(`motivo-${socioId}`).value;
                    if (!motivoVal || motivoVal.trim() === '') {
                        missingMotivations = true;
                    }
                    rejectedSoci.push({
                        anagrafica_id: socioId,
                        motivo: motivoVal
                    });
                }
            });

            if (missingMotivations) {
                alert("Inserisci una motivazione per tutti i soci respinti.");
                return;
            }

            // Gather points
            const punti = [];
            // Point 1 (Nuovi Soci)
            const vTipo1 = document.getElementById('votazione-punto-1-tipo').value;
            let fav1 = presentiConteggio, cont1 = 0, ast1 = 0;
            if (vTipo1 === 'MAGGIORANZA') {
                fav1 = parseInt(document.getElementById('voti-punto-1-favorevoli').value) || 0;
                cont1 = parseInt(document.getElementById('voti-punto-1-contrari').value) || 0;
                ast1 = parseInt(document.getElementById('voti-punto-1-astenuti').value) || 0;
            }
            punti.push({
                ordine: 1,
                titolo: "Esame e approvazione delle domande di ammissione di nuovi soci",
                discussione: `Presentazione delle domande di ammissione ricevute.`,
                delibera_tipo: "APPROVAZIONE_NUOVI_SOCI",
                delibera_testo: `Approvazione e ammissione a Libro Soci di ${approvedSoci.length} candidati e rigetto di ${rejectedSoci.length} domande.`,
                votazione: {
                    favorevoli: fav1,
                    contrari: cont1,
                    astenuti: ast1,
                    esito: "APPROVATO"
                }
            });

            // Custom points
            const customPoints = getCustomPoints();
            customPoints.forEach(p => punti.push(p));

            // Final text
            compileVerbaleConforme();
            const testoCompleto = document.getElementById('verbale-anteprevia-testo').value;

            try {
                // Call atomic transaction procedure salva_verbale_relazionale
                const { data: result, error } = await supabaseClient.rpc('salva_verbale_relazionale', {
                    p_numero_verbale: numero,
                    p_data_riunione: data,
                    p_ora_inizio: oraInizio + ":00",
                    p_ora_fine: oraFine + ":00",
                    p_luogo: luogo,
                    p_tipo: tipo,
                    p_data_convocazione: convocazioneData,
                    p_mezzo_convocazione: convocazioneMezzo,
                    p_id_presidente: presId,
                    p_id_segretario: segId,
                    p_quorum_costitutivo: quorumCostitutivo,
                    p_presenti_conteggio: presentiConteggio,
                    p_totale_membri_conteggio: direttivoData.length,
                    p_delibera_testo_completo: testoCompleto,
                    p_presenze: presenze,
                    p_punti: punti,
                    p_soci_da_approvare: approvedSoci,
                    p_soci_da_respingere: rejectedSoci
                });

                if (error) throw error;

                // Log audit action
                await scriviAuditLog('REDATTO_VERBALE_RELAZIONALE', 'riunioni_consiglio', result, {
                    numero_verbale: numero,
                    soci_approvati_count: approvedSoci.length,
                    soci_respinti_count: rejectedSoci.length
                });

                alert("Verbale del Consiglio registrato con successo e Libro Soci aggiornato!");
                closeModalVerbale();
                
                // Reload dashboard segments to reflect active statuses
                loadVerbali();
                loadSoci();
                loadApprovazioni();
                loadStats();
            } catch (err) {
                alert("Errore salvataggio verbale: " + err.message);
            }
        }

        // Caricamento Componenti Direttivo
        async function loadDirettivo() {
            try {
                const { data, error } = await supabaseClient
                    .from('utenti')
                    .select('id, nome, cognome, codice_fiscale, email, ruolo')
                    .overlaps('ruolo', ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'])
                    .order('cognome', { ascending: true });

                if (error) throw error;

                if (!data || data.length === 0) {
                    direttivoData = [];
                    renderDirettivoTable();
                    return;
                }

                direttivoData = data.map(member => ({
                    id: member.id,
                    nominativo: `${member.cognome} ${member.nome}`.toUpperCase(),
                    nomeComp: escapeHtml(`${member.nome} ${member.cognome}`),
                    codice_fiscale: escapeHtml(member.codice_fiscale || 'N/D'),
                    email: escapeHtml(member.email || 'N/D'),
                    ruolo: Array.isArray(member.ruolo) ? member.ruolo : []
                }));

                sortArray(direttivoData, direttivoSort.field, direttivoSort.direction);
                updateSortIcon('sort-icon-direttivo', direttivoSort.field, direttivoSort.direction);
                renderDirettivoTable();
            } catch (err) {
                console.error("Errore caricamento direttivo:", err);
            }
        }

        function renderDirettivoTable() {
            const body = document.getElementById('direttivo-list-body');
            if (!body) return;
            body.innerHTML = '';

            if (direttivoData.length === 0) {
                body.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nessun membro del direttivo trovato.</td></tr>';
                return;
            }

            direttivoData.forEach(member => {
                const row = document.createElement('tr');
                const ruoliDisponibili = [
                    { val: 'presidente', label: 'Presidente' },
                    { val: 'vice_presidente', label: 'Vice Presidente' },
                    { val: 'segretario', label: 'Segretario' },
                    { val: 'tesoriere', label: 'Tesoriere' },
                    { val: 'consigliere', label: 'Consigliere' }
                ];

                let actionHtml = '';
                if (userRoles.some(r => ['presidente', 'vice_presidente'].includes(r))) {
                    actionHtml = `
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="apriModificaRuoli('${member.id}', '${member.ruolo.join(',')}')" class="bg-primary/20 text-primary border border-primary/30 text-[9px] px-2 py-1 hover:bg-primary hover:text-white font-bold uppercase transition-all">MODIFICA RUOLI</button>
                        </div>
                    `;
                } else {
                    actionHtml = '<span class="text-[9px] text-gray-500 uppercase">Sola lettura</span>';
                }

                row.innerHTML = `
                    <td class="p-4 font-bold text-white">${member.nomeComp}</td>
                    <td class="p-4 text-gray-400 font-mono">${member.codice_fiscale}</td>
                    <td class="p-4 text-gray-400 lowercase font-mono">${member.email}</td>
                    <td class="p-4">
                        <span class="px-2 py-0.5 border border-primary/30 text-[9px] font-bold rounded uppercase text-primary bg-primary/10">${member.ruolo.join(', ').replace(/_/g, ' ')}</span>
                    </td>
                    <td class="p-4 text-right">${actionHtml}</td>
                `;
                body.appendChild(row);
            });
        }

        async function showNominaDirettivoModal() {
            const selectEl = document.getElementById('nomina-socio-select');
            selectEl.innerHTML = '<option value="" disabled selected>Caricamento soci...</option>';
            document.getElementById('modal-nomina-direttivo').classList.remove('hidden');

            try {
                // Seleziona tutti gli utenti con ruolo 'socio_approvato'
                const { data, error } = await supabaseClient
                    .from('utenti')
                    .select('id, nome, cognome, codice_fiscale')
                    .contains('ruolo', ['socio_approvato'])
                    .order('cognome', { ascending: true });

                if (error) throw error;

                if (!data || data.length === 0) {
                    selectEl.innerHTML = '<option value="" disabled>Nessun socio approvato disponibile</option>';
                    return;
                }

                selectEl.innerHTML = '<option value="" disabled selected>Seleziona socio...</option>';
                data.forEach(socio => {
                    const opt = document.createElement('option');
                    opt.value = socio.id;
                    opt.textContent = `${socio.cognome} ${socio.nome} (${socio.codice_fiscale})`;
                    selectEl.appendChild(opt);
                });
            } catch (err) {
                console.error("Errore caricamento soci per nomina:", err);
                selectEl.innerHTML = '<option value="" disabled>Errore nel caricamento dei soci</option>';
            }
        }

        
        function apriModificaRuoli(userId, ruoliAttualiStr) {
            const ruoliAttuali = ruoliAttualiStr.split(',');
            // We can reuse the nomina-direttivo modal for this
            document.getElementById('modal-nomina-direttivo').classList.remove('hidden');
            
            // Popoliamo la select utente con un finto se non presente oppure la teniamo disabilitata
            const selectEl = document.getElementById('nomina-socio-select');
            selectEl.innerHTML = `<option value="${userId}" selected>Modifica ruoli utente corrente</option>`;
            
            // Imposta checkboxes
            const checkboxes = document.querySelectorAll('#nomina-ruolo-select input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = ruoliAttuali.includes(cb.value);
            });
        }

        function closeModalNominaDirettivo() {
            document.getElementById('modal-nomina-direttivo').classList.add('hidden');
        }

        async function submitNominaDirettivo() {
            const userId = document.getElementById('nomina-socio-select').value;
            const checkboxes = document.querySelectorAll('#nomina-ruolo-select input[type="checkbox"]:checked');
            const ruolo = Array.from(checkboxes).map(cb => cb.value);

            if (!userId || ruolo.length === 0) {
                alert("Seleziona un socio e almeno un ruolo da assegnare.");
                return;
            }

            try {
                const { error } = await supabaseClient
                    .from('utenti')
                    .update({ ruolo: ruolo })
                    .eq('id', userId);

                if (error) throw error;

                await scriviAuditLog('NOMINA_DIRETTIVO', 'utenti', userId, {
                    ruolo_assegnato: ruolo
                });

                alert("Nuovo componente nominato correttamente nel direttivo!");
                closeModalNominaDirettivo();
                loadDirettivo();
            } catch (err) {
                alert("Errore durante la nomina: " + err.message);
            }
        }

        // Caricamento Verbali Assemblea
        async function loadVerbaliAssemblea() {
            const container = document.getElementById('verbali-assemblea-container');
            container.innerHTML = '';

            try {
                const { data, error } = await supabaseClient
                    .from('verbali_assemblea')
                    .select('*')
                    .order('data_assemblea', { ascending: false });

                if (error) throw error;

                if (!data || data.length === 0) {
                    container.innerHTML = '<div class="border border-dashed border-white/20 p-8 text-center text-gray-500 uppercase text-xs">Nessun verbale assemblea registrato in archivio.</div>';
                    return;
                }

                data.forEach(verb => {
                    const el = document.createElement('div');
                    el.className = 'border border-white/10 p-5 bg-black/30 space-y-3';
                    el.innerHTML = `
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-headline text-xs font-bold text-primary uppercase">${verb.numero_verbale}</h4>
                                <p class="text-[10px] text-gray-500 uppercase">Data Assemblea: ${verb.data_assemblea}</p>
                            </div>
                            <span class="text-[9px] bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded font-bold uppercase">DEPOSITATO</span>
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed uppercase whitespace-pre-wrap font-mono">${verb.delibera_testo}</p>
                    `;
                    container.appendChild(el);
                });
            } catch (err) {
                console.error("Errore caricamento verbali assemblea:", err);
            }
        }

        function showNewVerbaleAssembleaModal() {
            document.getElementById('verbale-ass-data').value = new Date().toISOString().substring(0, 10);
            document.getElementById('modal-verbale-assemblea').classList.remove('hidden');
        }

        function closeModalVerbaleAssemblea() {
            document.getElementById('modal-verbale-assemblea').classList.add('hidden');
        }

        async function submitVerbaleAssemblea() {
            const numero = document.getElementById('verbale-ass-numero').value;
            const data = document.getElementById('verbale-ass-data').value;
            const testo = document.getElementById('verbale-ass-testo').value;

            if (!numero || !data || !testo) {
                alert("Tutti i campi sono obbligatori.");
                return;
            }

            try {
                const { error } = await supabaseClient
                    .from('verbali_assemblea')
                    .insert({
                        numero_verbale: numero,
                        data_assemblea: data,
                        delibera_testo: testo,
                        redatto_da: currentUser.id
                    });

                if (error) throw error;
                alert("Verbale dell'Assemblea inserito correttamente!");
                closeModalVerbaleAssemblea();
                loadVerbaliAssemblea();
            } catch (err) {
                alert("Errore salvataggio verbale assemblea: " + err.message);
            }
        }

        // Caricamento Bilanci
        async function loadBilanci() {
            try {
                const { data, error } = await supabaseClient
                    .from('bilanci')
                    .select('*')
                    .order('anno', { ascending: false });

                if (error) throw error;

                if (!data || data.length === 0) {
                    bilanciData = [];
                    renderBilanciTable();
                    return;
                }

                bilanciData = data;
                sortArray(bilanciData, bilanciSort.field, bilanciSort.direction);
                updateSortIcon('sort-icon-bilanci', bilanciSort.field, bilanciSort.direction);
                renderBilanciTable();
            } catch (err) {
                console.error("Errore caricamento bilanci:", err);
            }
        }

        function renderBilanciTable() {
            const body = document.getElementById('bilanci-list-body');
            if (!body) return;
            body.innerHTML = '';

            if (bilanciData.length === 0) {
                body.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nessun rendiconto caricato in archivio.</td></tr>';
                return;
            }

            bilanciData.forEach(bil => {
                const row = document.createElement('tr');
                let statusColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
                if (bil.stato === 'APPROVATO_ASSEMBLEA') statusColor = 'text-green-500 bg-green-500/10 border-green-500/30';
                if (bil.stato === 'APPROVATO_CONSIGLIO') statusColor = 'text-blue-500 bg-blue-500/10 border-blue-500/30';

                let actionHtml = '-';
                if (userRoles.some(r => ['presidente', 'vice_presidente', 'tesoriere'].includes(r)) && bil.stato !== 'APPROVATO_ASSEMBLEA') {
                    actionHtml = `
                        <select onchange="aggiornaStatoBilancio('${bil.id}', this.value)" class="bg-black text-white text-[10px] border border-white/20 px-1 py-0.5 font-mono focus:ring-0">
                            <option value="IN_REDAZIONE" ${bil.stato === 'IN_REDAZIONE' ? 'selected' : ''}>REDIGI</option>
                            <option value="APPROVATO_CONSIGLIO" ${bil.stato === 'APPROVATO_CONSIGLIO' ? 'selected' : ''}>APPROVA CD</option>
                            <option value="APPROVATO_ASSEMBLEA" ${bil.stato === 'APPROVATO_ASSEMBLEA' ? 'selected' : ''}>APPROVA ASS</option>
                        </select>
                    `;
                }

                row.innerHTML = `
                    <td class="p-4 font-bold text-white">${escapeHtml(bil.anno)}</td>
                    <td class="p-4 text-gray-400 font-bold">${escapeHtml(bil.titolo)}</td>
                    <td class="p-4 text-green-500 font-bold">€${parseFloat(bil.totale_entrate || 0).toFixed(2)}</td>
                    <td class="p-4 text-primary font-bold">€${parseFloat(bil.totale_uscite || 0).toFixed(2)}</td>
                    <td class="p-4 font-bold text-white">€${parseFloat(bil.avanzo_disavanzo || 0).toFixed(2)}</td>
                    <td class="p-4">
                        <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase ${statusColor}">${escapeHtml(bil.stato).replace(/_/g, ' ')}</span>
                    </td>
                    <td class="p-4 text-right">${actionHtml}</td>
                `;
                body.appendChild(row);
            });
        }

        async function aggiornaStatoBilancio(bilId, nuovoStato) {
            try {
                const { error } = await supabaseClient
                    .from('bilanci')
                    .update({ stato: nuovoStato })
                    .eq('id', bilId);

                if (error) throw error;
                alert("Stato del rendiconto aggiornato!");
                loadBilanci();
            } catch (err) {
                alert("Errore aggiornamento stato bilancio: " + err.message);
            }
        }

        function showNuovoBilancioModal() {
            document.getElementById('bilancio-anno').value = new Date().getFullYear();
            document.getElementById('modal-bilancio').classList.remove('hidden');
        }

        function closeModalBilancio() {
            document.getElementById('modal-bilancio').classList.add('hidden');
        }

        function calcolaAvanzo() {
            const entrate = parseFloat(document.getElementById('bilancio-entrate').value) || 0;
            const uscite = parseFloat(document.getElementById('bilancio-uscite').value) || 0;
            document.getElementById('bilancio-avanzo').value = (entrate - uscite).toFixed(2);
        }

        async function submitBilancio() {
            const anno = parseInt(document.getElementById('bilancio-anno').value);
            const titolo = document.getElementById('bilancio-titolo').value;
            const entrate = parseFloat(document.getElementById('bilancio-entrate').value);
            const uscite = parseFloat(document.getElementById('bilancio-uscite').value);
            const avanzo = parseFloat(document.getElementById('bilancio-avanzo').value);
            const stato = document.getElementById('bilancio-stato').value;

            if (!anno || !titolo || isNaN(entrate) || isNaN(uscite)) {
                alert("Tutti i campi obbligatori contrassegnati con l'asterisco devono essere compilati correttamente.");
                return;
            }

            try {
                const { error } = await supabaseClient
                    .from('bilanci')
                    .insert({
                        anno: anno,
                        titolo: titolo,
                        totale_entrate: entrate,
                        totale_uscite: uscite,
                        avanzo_disavanzo: avanzo,
                        stato: stato
                    });

                if (error) throw error;
                alert("Rendiconto economico salvato correttamente!");
                closeModalBilancio();
                loadBilanci();
            } catch (err) {
                alert("Errore salvataggio rendiconto: " + err.message);
            }
        }

        // Tab Switching Logic
        function switchTab(tabId) {
            // Nasconde tutti i pannelli
            const panels = document.querySelectorAll('.tab-panel');
            panels.forEach(p => p.classList.add('hidden'));

            // Mostra il pannello attivo
            document.getElementById(`panel-${tabId}`).classList.remove('hidden');

            // Reset stile bottoni navigation
            const navButtons = document.querySelectorAll('aside button');
            navButtons.forEach(btn => {
                btn.classList.remove('border-primary/30', 'bg-primary/10', 'text-white');
                btn.classList.add('border-transparent', 'text-gray-400', 'hover:text-white', 'hover:bg-white/5');
            });

            // Imposta lo stile del bottone attivo
            const activeBtn = document.getElementById(`tab-btn-${tabId}`);
            if (activeBtn) {
                activeBtn.classList.remove('border-transparent', 'text-gray-400', 'hover:text-white', 'hover:bg-white/5');
                activeBtn.classList.add('border-primary/30', 'bg-primary/10', 'text-white');
            }
        }

        // Gestione Caricamento Certificato Medico da Dashboard
        let dashUploadedCertFile = null;
        
        // Timeout per dare il tempo al DOM di caricarsi
        setTimeout(() => {
            const dashFileInput = document.getElementById('dash_cert_file');
            if (dashFileInput) {
                dashFileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    const nameLabel = document.getElementById('dash-cert-file-name');
                    const statusLabel = document.getElementById('dash-cert-file-status');
                    if (!file) {
                        dashUploadedCertFile = null;
                        nameLabel.textContent = "SELEZIONA O TRASCINA IL CERTIFICATO";
                        statusLabel.textContent = "Nessun file selezionato";
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        alert("Il file supera la dimensione massima consentita di 5MB.");
                        dashFileInput.value = "";
                        dashUploadedCertFile = null;
                        return;
                    }
                    dashUploadedCertFile = file;
                    nameLabel.textContent = file.name.toUpperCase();
                    statusLabel.textContent = `✓ PRONTO (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
                });
            }
        }, 1000);

        async function uploadCertificatoDashboard() {
            const tipologia = document.getElementById('dash-cert-tipologia').value;
            const emissionDate = document.getElementById('dash-cert-data-emissione').value;
            const btn = document.getElementById('btn-upload-cert-dash');
            
            if (!tipologia || !emissionDate || !dashUploadedCertFile) {
                alert("Per favore seleziona la tipologia, la data di emissione e carica un file.");
                return;
            }
            
            btn.disabled = true;
            btn.textContent = "CARICAMENTO...";
            
            try {
                const userId = currentUser.id;
                const fileExt = dashUploadedCertFile.name.split('.').pop();
                const filePath = `${userId}/certificato_${Date.now()}.${fileExt}`;
                
                // 1. Carica il file nello storage
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('certificati_medici')
                    .upload(filePath, dashUploadedCertFile, {
                        contentType: dashUploadedCertFile.type,
                        upsert: true
                    });
                if (uploadError) throw uploadError;
                
                const { data: urlData, error: signedUrlError } = await supabaseClient.storage
                    .from('certificati_medici')
                    .createSignedUrl(filePath, 300);
                if (signedUrlError) throw signedUrlError;
                const publicUrl = urlData.signedUrl;
                
                // 2. Aggiorna tabella utenti per scatenare il trigger trigger db
                const { error: updateError } = await supabaseClient
                    .from('utenti')
                    .update({
                        certificato_medico_url: publicUrl,
                        certificato_tipologia: tipologia,
                        certificato_data_emissione: emissionDate
                    })
                    .eq('id', userId);
                if (updateError) throw updateError;
                
                // Imposta lo stato di validazione a IN_ATTESA per attivare la coda dei controlli
                const { data: userAnag } = await supabaseClient
                    .from('anagrafiche')
                    .select('id')
                    .eq('utente_id', userId)
                    .maybeSingle();
                
                if (userAnag) {
                    await supabaseClient
                        .from('certificati_medici')
                        .update({
                            stato_validazione: 'IN_ATTESA',
                            note_ai: 'In attesa di analisi.',
                            confidence_score: null
                        })
                        .eq('anagrafica_id', userAnag.id);
                }
                
                alert("Certificato medico inviato correttamente in elaborazione!");
                window.location.reload();
                
            } catch (err) {
                console.error("Errore caricamento:", err);
                alert("Si è verificato un errore durante l'invio: " + err.message);
                btn.disabled = false;
                btn.textContent = "INVIA DOCUMENTO";
            }
        }

        function esportaCSEN() {
            if (tesseratiData.length === 0) {
                alert("Nessun dato tesserati disponibile per l'esportazione.");
                return;
            }

            // Headers del CSV per CSEN
            const headers = [
                "Cognome", "Nome", "Sesso", "Data Nascita", "Codice Fiscale", 
                "Comune Nascita", "Provincia Nascita", "Indirizzo Residenza", 
                "Comune Residenza", "Provincia Residenza", "CAP Residenza",
                "Telefono", "Email", "Copertura Assicurativa", 
                "Tipo Certificato", "Scadenza Certificato", "Stato Tesseramento"
            ];

            const rows = [];
            rows.push(headers.join(";"));

            tesseratiData.forEach(tess => {
                const anag = tess.anagrafiche || {};
                const cert = getCertInfo(anag);
                
                const ind = anag.indirizzi_residenza || {};
                const cont = anag.contatti || {};
                
                const viaCompleta = ind.via_piazza ? `${ind.via_piazza} ${ind.civico || ''}`.trim() : 'N/D';
                const certTipo = cert ? cert.tipologia : 'MANCANTE';
                const certScadenza = cert ? cert.data_scadenza : 'N/D';

                const line = [
                    anag.cognome || 'N/D',
                    anag.nome || 'N/D',
                    anag.sesso || 'N/D',
                    anag.data_nascita || 'N/D',
                    anag.codice_fiscale || 'N/D',
                    anag.comune_nascita || 'N/D',
                    anag.provincia_nascita || 'N/D',
                    viaCompleta,
                    ind.comune || 'N/D',
                    ind.provincia || 'N/D',
                    ind.cap || 'N/D',
                    cont.telefono || 'N/D',
                    cont.email || 'N/D',
                    tess.livello_copertura || 'BASE',
                    certTipo,
                    certScadenza,
                    tess.stato_tesseramento || 'IN_ELABORAZIONE'
                ];

                // Pulisci i valori per evitare conflitti con il punto e virgola
                const cleanLine = line.map(val => String(val).replace(/;/g, ',').trim());
                rows.push(cleanLine.join(";"));
            });

            const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(rows.join("\n"));
            const link = document.createElement("a");
            link.setAttribute("href", csvContent);
            link.setAttribute("download", `esportazione_csen_${new Date().toISOString().substring(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // =========================================================================
        // USER DASHBOARD LOGIC (TESSERATI ED ATLETI)
        // =========================================================================
        
        let userUploadedCertFile = null;

        async function loadUserDashboard() {
            const isBoardMember = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
            if (!isBoardMember) {
                document.getElementById('user-panoramica-widgets').classList.remove('hidden');
                await populateUserPanoramicaSummary();
                await loadUserBacheca();
            }
            
            await loadUserProfilo();
            await loadUserCertificato();
            await loadUserEventi();
            await loadUserPagamenti();
        }

        async function populateUserPanoramicaSummary() {
            try {
                if (!currentUserProfile) return;
                
                const dataAppr = currentUserProfile.data_creazione 
                    ? new Date(currentUserProfile.data_creazione).toLocaleDateString('it-IT')
                    : 'N/D';
                document.getElementById('user-info-data-approvazione').textContent = dataAppr;
                
                let dataScadenzaStr = 'N/D';
                let scaduto = false;

                const anagId = currentUserProfile.anagrafiche?.[0]?.id || currentUserProfile.anagrafiche?.id;

                if (anagId) {
                    const { data: socioReg } = await supabaseClient
                        .from('registro_soci')
                        .select('quota_scadenza')
                        .eq('anagrafica_id', anagId)
                        .maybeSingle();

                    if (socioReg && socioReg.quota_scadenza) {
                        dataScadenzaStr = new Date(socioReg.quota_scadenza).toLocaleDateString('it-IT');
                        scaduto = new Date(socioReg.quota_scadenza) < new Date();
                    } else if (currentUserProfile.tipo_adesione) {
                        dataScadenzaStr = '31/12/2026';
                    }
                } else if (currentUserProfile.tipo_adesione) {
                    dataScadenzaStr = '31/12/2026';
                }

                const badge = document.getElementById('user-info-scadenza-status');
                document.getElementById('user-info-scadenza-iscrizione').textContent = dataScadenzaStr;
                
                if (dataScadenzaStr !== 'N/D') {
                    badge.classList.remove('hidden');
                    if (scaduto) {
                        badge.textContent = 'SCADUTO';
                        badge.className = 'px-1.5 py-0.5 text-[8px] font-headline font-bold rounded bg-primary text-white';
                    } else {
                        badge.textContent = 'ATTIVO';
                        badge.className = 'px-1.5 py-0.5 text-[8px] font-headline font-bold rounded bg-green-500 text-white';
                    }
                } else {
                    badge.classList.add('hidden');
                }

                const anag = Array.isArray(currentUserProfile.anagrafiche) ? currentUserProfile.anagrafiche[0] : currentUserProfile.anagrafiche;
                const cert = anag && anag.certificati_medici ? (Array.isArray(anag.certificati_medici) ? anag.certificati_medici[0] : anag.certificati_medici) : null;
                
                if (cert && cert.data_scadenza) {
                    document.getElementById('user-info-scadenza-certificato').textContent = new Date(cert.data_scadenza).toLocaleDateString('it-IT');
                } else {
                    document.getElementById('user-info-scadenza-certificato').textContent = 'NON DISPONIBILE';
                }

                let livello = 'TESSERATO BASE';
                if (anagId) {
                    const { data: tessReg } = await supabaseClient
                        .from('registro_tesserati')
                        .select('livello_copertura')
                        .eq('anagrafica_id', anagId)
                        .maybeSingle();

                    if (tessReg && tessReg.livello_copertura) {
                        livello = `TESSERATO - ${tessReg.livello_copertura}`;
                    } else if (currentUserProfile.tipo_tessera) {
                        livello = `TESSERATO - ${currentUserProfile.tipo_tessera.replace(/_/g, ' ')}`;
                    } else if (userRoles.includes('socio_approvato')) {
                        livello = 'SOCIO ATTIVO';
                    }
                } else if (currentUserProfile.tipo_tessera) {
                    livello = `TESSERATO - ${currentUserProfile.tipo_tessera.replace(/_/g, ' ')}`;
                } else if (userRoles.includes('socio_approvato')) {
                    livello = 'SOCIO ATTIVO';
                }
                document.getElementById('user-info-livello').textContent = livello.toUpperCase();

                const emergenzaNome = currentUserProfile.emergenza_nome || '-';
                const emergenzaTel = currentUserProfile.emergenza_telefono || '';
                document.getElementById('user-info-contatto-emergenza').textContent = emergenzaTel 
                    ? `${emergenzaNome} (${emergenzaTel})`
                    : emergenzaNome;

            } catch (err) {
                console.error("Errore popolamento summary utente:", err);
            }
        }

        async function loadUserBacheca() {
            try {
                const { data, error } = await supabaseClient
                    .from('comunicazioni')
                    .select('*')
                    .order('data_creazione', { ascending: false })
                    .limit(5);

                const container = document.getElementById('user-bacheca-notizie');
                if (!container) return;
                
                if (error) throw error;
                if (!data || data.length === 0) {
                    container.innerHTML = `<p class="text-xs text-gray-500 uppercase font-mono">Nessun avviso in bacheca.</p>`;
                    return;
                }

                container.innerHTML = data.map(notizia => {
                    const dataFormat = new Date(notizia.data_creazione).toLocaleDateString('it-IT', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    let badgeColor = 'bg-white/10 text-white';
                    if (notizia.tipo === 'URGENTE') badgeColor = 'bg-primary text-white';
                    if (notizia.tipo === 'AVVISO') badgeColor = 'bg-yellow-500 text-black';

                    return `
                        <div class="border border-white/5 p-4 bg-white/5 space-y-2">
                            <div class="flex justify-between items-center flex-wrap gap-2">
                                <h4 class="font-headline text-xs font-bold text-white uppercase">${escapeHtml(notizia.titolo)}</h4>
                                <div class="flex items-center gap-2">
                                    <span class="px-1.5 py-0.5 text-[8px] font-headline font-bold rounded ${badgeColor}">${notizia.tipo}</span>
                                    <span class="text-[9px] text-gray-500 font-mono">${dataFormat}</span>
                                </div>
                            </div>
                            <p class="text-xs text-gray-300 uppercase leading-relaxed font-mono whitespace-pre-wrap">${escapeHtml(notizia.testo)}</p>
                        </div>
                    `;
                }).join('');
            } catch (err) {
                console.error("Errore caricamento bacheca:", err);
            }
        }

        async function loadUserProfilo() {
            try {
                if (!currentUserProfile) return;
                
                document.getElementById('user-profilo-nome').value = currentUserProfile.nome || '';
                document.getElementById('user-profilo-cognome').value = currentUserProfile.cognome || '';
                document.getElementById('user-profilo-cf').value = currentUserProfile.codice_fiscale || '';
                document.getElementById('user-profilo-data-nascita').value = currentUserProfile.data_nascita || '';

                document.getElementById('user-profilo-email').value = currentUserProfile.email || '';
                document.getElementById('user-profilo-cellulare').value = currentUserProfile.cellulare || '';
                document.getElementById('user-profilo-indirizzo').value = currentUserProfile.indirizzo || '';
                document.getElementById('user-profilo-comune').value = currentUserProfile.comune || '';
                document.getElementById('user-profilo-provincia').value = currentUserProfile.provincia || '';
                document.getElementById('user-profilo-cap').value = currentUserProfile.cap || '';

                document.getElementById('user-profilo-emergenza-nome').value = currentUserProfile.emergenza_nome || '';
                document.getElementById('user-profilo-emergenza-telefono').value = currentUserProfile.emergenza_telefono || '';

                document.getElementById('user-consenso-marketing').checked = !!currentUserProfile.consenso_marketing;
                document.getElementById('user-consenso-audiovisivi').checked = !!currentUserProfile.consenso_audiovisivi;

                const img = document.getElementById('user-avatar-preview');
                const placeholder = document.getElementById('user-avatar-placeholder');
                
                if (currentUserProfile.avatar_url) {
                    img.src = currentUserProfile.avatar_url;
                    img.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                } else {
                    img.src = "";
                    img.classList.add('hidden');
                    placeholder.classList.remove('hidden');
                }
            } catch (err) {
                console.error("Errore caricamento dati profilo:", err);
            }
        }

        async function saveUserProfilo(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = "SALVATAGGIO...";

            try {
                const email = document.getElementById('user-profilo-email').value;
                const cellulare = document.getElementById('user-profilo-cellulare').value;
                const indirizzo = document.getElementById('user-profilo-indirizzo').value;
                const comune = document.getElementById('user-profilo-comune').value;
                const provincia = document.getElementById('user-profilo-provincia').value;
                const cap = document.getElementById('user-profilo-cap').value;
                const emergenzaNome = document.getElementById('user-profilo-emergenza-nome').value;
                const emergenzaTelefono = document.getElementById('user-profilo-emergenza-telefono').value;
                const consensoMarketing = document.getElementById('user-consenso-marketing').checked;
                const consensoAudiovisivi = document.getElementById('user-consenso-audiovisivi').checked;

                const { error } = await supabaseClient
                    .from('utenti')
                    .update({
                        email: email,
                        cellulare: cellulare,
                        indirizzo: indirizzo,
                        comune: comune,
                        provincia: provincia,
                        cap: cap,
                        emergenza_nome: emergenzaNome,
                        emergenza_telefono: emergenzaTelefono,
                        consenso_marketing: consensoMarketing,
                        consenso_audiovisivi: consensoAudiovisivi
                    })
                    .eq('id', currentUser.id);

                if (error) throw error;

                await scriviAuditLog('AGGIORNAMENTO_PROFILO', 'utenti', currentUser.id, {
                    campi_modificati: ['email', 'cellulare', 'indirizzo', 'comune', 'provincia', 'cap', 'emergenza']
                });

                currentUserProfile.email = email;
                currentUserProfile.cellulare = cellulare;
                currentUserProfile.indirizzo = indirizzo;
                currentUserProfile.comune = comune;
                currentUserProfile.provincia = provincia;
                currentUserProfile.cap = cap;
                currentUserProfile.emergenza_nome = emergenzaNome;
                currentUserProfile.emergenza_telefono = emergenzaTelefono;
                currentUserProfile.consenso_marketing = consensoMarketing;
                currentUserProfile.consenso_audiovisivi = consensoAudiovisivi;

                alert("Dati personali salvati con successo!");
                await populateUserPanoramicaSummary();
            } catch (err) {
                console.error("Errore salvataggio profilo:", err);
                alert("Errore durante il salvataggio dei dati: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = "SALVA MODIFICHE PROFILO";
            }
        }

        async function previewAndUploadAvatar() {
            const fileInput = document.getElementById('user-avatar-file');
            const file = fileInput.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                alert("L'immagine del profilo supera il limite di 2MB consentito.");
                fileInput.value = "";
                return;
            }

            try {
                const userId = currentUser.id;
                const fileExt = file.name.split('.').pop();
                const filePath = `avatars/${userId}/avatar_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from('certificati_medici')
                    .upload(filePath, file, {
                        contentType: file.type,
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: urlData, error: signedUrlError } = await supabaseClient.storage
                    .from('certificati_medici')
                    .createSignedUrl(filePath, 31536000 * 5); // 5 anni
                if (signedUrlError) throw signedUrlError;

                const publicUrl = urlData.signedUrl;

                const { error: updateError } = await supabaseClient
                    .from('utenti')
                    .update({
                        avatar_url: publicUrl
                    })
                    .eq('id', userId);

                if (updateError) throw updateError;

                currentUserProfile.avatar_url = publicUrl;

                const img = document.getElementById('user-avatar-preview');
                const placeholder = document.getElementById('user-avatar-placeholder');
                img.src = publicUrl;
                img.classList.remove('hidden');
                placeholder.classList.add('hidden');

                alert("Immagine profilo aggiornata!");
            } catch (err) {
                console.error("Errore upload avatar:", err);
                alert("Impossibile caricare l'immagine: " + err.message);
            }
        }

        async function updateUserPassword(e) {
            e.preventDefault();
            const newPwd = document.getElementById('user-new-password').value;
            const confPwd = document.getElementById('user-confirm-password').value;

            if (newPwd !== confPwd) {
                alert("Le password non coincidono.");
                return;
            }

            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = "AGGIORNAMENTO...";

            try {
                const { error } = await supabaseClient.auth.updateUser({ password: newPwd });
                if (error) throw error;

                alert("Password aggiornata correttamente!");
                document.getElementById('form-user-password').reset();
            } catch (err) {
                console.error("Errore aggiornamento password:", err);
                alert("Errore nell'aggiornamento password: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = "AGGIORNA PASSWORD";
            }
        }

        async function loadUserCertificato() {
            try {
                if (!currentUserProfile) return;
                
                const anag = Array.isArray(currentUserProfile.anagrafiche) ? currentUserProfile.anagrafiche[0] : currentUserProfile.anagrafiche;
                if (!anag) return;

                const { data: certs, error } = await supabaseClient
                    .from('certificati_medici')
                    .select('*')
                    .eq('anagrafica_id', anag.id)
                    .order('data_rilascio', { ascending: false });

                if (error) throw error;

                const currentCert = certs?.[0] || null;
                const badgeBox = document.getElementById('user-cert-badge-box');
                const badgeText = document.getElementById('user-cert-badge-text');
                
                if (!currentCert) {
                    badgeBox.className = "p-3 border-l-4 border-primary bg-primary/5 text-primary font-mono text-xs uppercase";
                    badgeText.textContent = "Mancante o non inserito";
                    document.getElementById('user-cert-info-tipo').textContent = '-';
                    document.getElementById('user-cert-info-scadenza').textContent = '-';
                    document.getElementById('user-cert-info-medico').textContent = '-';
                } else {
                    const status = currentCert.stato_validazione;
                    const scaduto = new Date(currentCert.data_scadenza) < new Date();
                    
                    document.getElementById('user-cert-info-tipo').textContent = currentCert.tipologia;
                    document.getElementById('user-cert-info-scadenza').textContent = new Date(currentCert.data_scadenza).toLocaleDateString('it-IT');
                    document.getElementById('user-cert-info-medico').textContent = currentCert.medico_rilascio;

                    if (scaduto) {
                        badgeBox.className = "p-3 border-l-4 border-primary bg-primary/5 text-primary font-mono text-xs uppercase";
                        badgeText.textContent = "Scaduto il " + new Date(currentCert.data_scadenza).toLocaleDateString('it-IT');
                    } else if (status === 'IN_ATTESA') {
                        badgeBox.className = "p-3 border-l-4 border-yellow-500 bg-yellow-500/5 text-yellow-500 font-mono text-xs uppercase";
                        badgeText.textContent = "Elaborazione / Verifica in corso...";
                    } else if (status === 'GIALLO') {
                        badgeBox.className = "p-3 border-l-4 border-yellow-500 bg-yellow-500/5 text-yellow-500 font-mono text-xs uppercase";
                        badgeText.textContent = "In attesa di convalida manuale";
                    } else if (status === 'ROSSO') {
                        badgeBox.className = "p-3 border-l-4 border-primary bg-primary/5 text-primary font-mono text-xs uppercase";
                        badgeText.textContent = "Rifiutato: " + (currentCert.note_ai || 'Documento non valido');
                    } else if (status === 'VERDE') {
                        badgeBox.className = "p-3 border-l-4 border-green-500 bg-green-500/5 text-green-500 font-mono text-xs uppercase";
                        badgeText.textContent = "Valido e conforme";
                    }
                }

                const historyBody = document.getElementById('user-cert-history-body');
                if (!certs || certs.length === 0) {
                    historyBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-500">Nessun certificato in archivio.</td></tr>`;
                    return;
                }

                historyBody.innerHTML = certs.map(c => {
                    const dataRel = new Date(c.data_rilascio).toLocaleDateString('it-IT');
                    const dataScad = new Date(c.data_scadenza).toLocaleDateString('it-IT');
                    let badgeClass = 'text-yellow-500';
                    if (c.stato_validazione === 'VERDE') badgeClass = 'text-green-500';
                    if (c.stato_validazione === 'ROSSO') badgeClass = 'text-primary';

                    return `
                        <tr>
                            <td class="p-3 font-mono">${dataRel}</td>
                            <td class="p-3">${c.tipologia}</td>
                            <td class="p-3 font-mono">${dataScad}</td>
                            <td class="p-3 font-bold ${badgeClass}">${c.stato_validazione}</td>
                            <td class="p-3 text-right">
                                <button onclick="openSignedFile('certificati_medici', '${c.file_url}')" class="text-primary hover:underline font-headline font-bold text-[10px]">VISUALIZZA</button>
                            </td>
                        </tr>
                    `;
                }).join('');

            } catch (err) {
                console.error("Errore caricamento storico certificati:", err);
            }
        }

        function handleNewCertFileSelected() {
            const input = document.getElementById('user-new-cert-file');
            const file = input.files[0];
            const nameLabel = document.getElementById('user-new-cert-file-name');
            const statusLabel = document.getElementById('user-new-cert-file-status');

            if (!file) {
                userUploadedCertFile = null;
                nameLabel.textContent = "SELEZIONA FILE CERTIFICATO";
                statusLabel.textContent = "Nessun file (PDF, PNG, JPG)";
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                alert("Il certificato supera la dimensione consentita di 5MB.");
                input.value = "";
                userUploadedCertFile = null;
                return;
            }

            userUploadedCertFile = file;
            nameLabel.textContent = file.name.toUpperCase();
            statusLabel.textContent = `✓ SELEZIONATO (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        }

        async function uploadNewCertificate() {
            const tipologia = document.getElementById('user-new-cert-tipo').value;
            const emissionDate = document.getElementById('user-new-cert-data').value;
            const medico = "N/D";
            const btn = document.getElementById('btn-user-upload-cert');

            if (!tipologia || !emissionDate || !userUploadedCertFile) {
                alert("Tutti i campi (tipo, emissione e file) sono obbligatori.");
                return;
            }

            btn.disabled = true;
            btn.textContent = "CARICAMENTO...";

            try {
                const userId = currentUser.id;
                const fileExt = userUploadedCertFile.name.split('.').pop();
                const filePath = `${userId}/certificato_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from('certificati_medici')
                    .upload(filePath, userUploadedCertFile, {
                        contentType: userUploadedCertFile.type,
                        upsert: true
                    });
                if (uploadError) throw uploadError;

                const { data: urlData, error: signedUrlError } = await supabaseClient.storage
                    .from('certificati_medici')
                    .createSignedUrl(filePath, 31536000 * 5); // 5 anni
                if (signedUrlError) throw signedUrlError;

                const publicUrl = urlData.signedUrl;
                const anagId = currentUserProfile.anagrafiche?.[0]?.id || currentUserProfile.anagrafiche?.id;

                const { error: insertError } = await supabaseClient
                    .from('certificati_medici')
                    .insert({
                        anagrafica_id: anagId,
                        tipologia: tipologia,
                        medico_rilascio: medico,
                        data_rilascio: emissionDate,
                        data_scadenza: new Date(new Date(emissionDate).setFullYear(new Date(emissionDate).getFullYear() + 1)).toISOString().split('T')[0],
                        file_url: publicUrl,
                        stato_validazione: 'IN_ATTESA',
                        note_ai: 'Nuovo certificato caricato. In attesa di elaborazione.'
                    });

                if (insertError) throw insertError;

                await scriviAuditLog('CARICAMENTO_CERTIFICATO', 'certificati_medici', anagId, {
                    tipologia: tipologia,
                    data_rilascio: emissionDate
                });

                alert("Nuovo certificato medico caricato con successo ed inviato per l'approvazione!");
                document.getElementById('user-new-cert-file').value = "";
                document.getElementById('user-new-cert-data').value = "";
                userUploadedCertFile = null;
                document.getElementById('user-new-cert-file-name').textContent = "SELEZIONA FILE CERTIFICATO";
                document.getElementById('user-new-cert-file-status').textContent = "Nessun file (PDF, PNG, JPG)";

                await loadUserCertificato();
                await populateUserPanoramicaSummary();
            } catch (err) {
                console.error("Errore caricamento certificato:", err);
                alert("Si è verificato un errore durante l'invio: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = "INVIA PER APPROVAZIONE";
            }
        }

        async function loadUserEventi() {
            try {
                const { data: eventi, error: eventiError } = await supabaseClient
                    .from('eventi')
                    .select('*')
                    .order('data_evento', { ascending: true });

                if (eventiError) throw eventiError;

                const { data: iscrizioni, error: iscrError } = await supabaseClient
                    .from('iscrizioni_eventi')
                    .select('*, eventi(*)')
                    .eq('utente_id', currentUser.id);

                if (iscrError) throw iscrError;

                const activeIscr = iscrizioni || [];
                const eventiList = eventi || [];

                const corsiList = eventiList.filter(e => e.tipo === 'corso');
                const eventiInProg = eventiList.filter(e => e.tipo === 'evento');

                const renderCard = (ev) => {
                    const dataFormat = new Date(ev.data_evento).toLocaleDateString('it-IT');
                    const isIscritto = activeIscr.some(i => i.evento_id === ev.id);
                    
                    let prezzo = parseFloat(ev.prezzo) || 0;
                    let selectHtml = '';

                    if (ev.piani_abbonamento && Array.isArray(ev.piani_abbonamento) && ev.piani_abbonamento.length > 0) {
                        const firstPiano = ev.piani_abbonamento[0];
                        prezzo = parseFloat(firstPiano.prezzo) || 0;

                        selectHtml = `
                            <div class="mt-2 flex flex-col space-y-1">
                                <label class="text-[8px] text-gray-500 font-mono uppercase tracking-wider">PIANO ABBONAMENTO</label>
                                <select id="plan-select-${ev.id}" onchange="aggiornaPrezzoCard('${ev.id}')" class="w-full bg-black text-white text-[11px] p-2 border border-white/20 font-mono uppercase focus:outline-none focus:border-primary rounded-none">
                                    ${ev.piani_abbonamento.map(p => `<option value="${p.nome}" data-price="${p.prezzo}">${p.nome} - €${p.prezzo}</option>`).join('')}
                                </select>
                            </div>
                        `;
                    }

                    const prezzoLabel = prezzo === 0 ? 'GRATUITO' : `€${prezzo.toFixed(2)}`;

                    let actionBtn = '';
                    if (isIscritto) {
                        actionBtn = `<span class="bg-green-500/10 text-green-500 font-headline text-[10px] font-bold px-3 py-1.5 border border-green-500/30 uppercase">ISCRITTO</span>`;
                    } else {
                        actionBtn = `
                            <button onclick="iscrivitiEvento('${ev.id}', ${prezzo})" class="bg-white text-black hover:bg-primary hover:text-white font-headline text-[10px] font-bold px-3 py-1.5 transition-all uppercase">
                                ${prezzo === 0 ? 'REGISTRATI' : 'ISCRIVITI'}
                            </button>
                        `;
                    }

                    return `
                        <div class="border border-white/10 p-5 bg-black/40 flex flex-col justify-between space-y-4">
                            <div class="space-y-2">
                                <div class="flex justify-between items-start">
                                    <span class="text-[9px] text-gray-500 font-mono">${dataFormat} ${ev.ora_evento ? ev.ora_evento.substring(0, 5) : ''}</span>
                                    <span id="price-display-${ev.id}" class="text-[9px] font-headline font-bold text-primary">${prezzoLabel}</span>
                                </div>
                                <h4 class="font-headline text-xs font-bold text-white uppercase">${escapeHtml(ev.titolo)}</h4>
                                <p class="text-[11px] text-gray-400 uppercase leading-relaxed font-mono">${escapeHtml(ev.descrizione || '')}</p>
                                ${selectHtml}
                                <div class="text-[10px] text-gray-500 font-mono uppercase">LUOGO: ${escapeHtml(ev.luogo || 'Sede Club')}</div>
                            </div>
                            <div>
                                ${actionBtn}
                            </div>
                        </div>
                    `;
                };

                const catalogCorsi = document.getElementById('user-corsi-catalogo');
                if (corsiList.length === 0) {
                    catalogCorsi.innerHTML = `<p class="text-xs text-gray-500 uppercase col-span-2">Nessun corso in programma al momento.</p>`;
                } else {
                    catalogCorsi.innerHTML = corsiList.map(renderCard).join('');
                }

                const catalogEventi = document.getElementById('user-eventi-catalogo');
                if (eventiInProg.length === 0) {
                    catalogEventi.innerHTML = `<p class="text-xs text-gray-500 uppercase col-span-2">Nessun evento in programma al momento.</p>`;
                } else {
                    catalogEventi.innerHTML = eventiInProg.map(renderCard).join('');
                }

                const activeCorsiIscr = activeIscr.filter(i => i.eventi && i.eventi.tipo === 'corso');
                const activeEventiIscr = activeIscr.filter(i => i.eventi && i.eventi.tipo === 'evento');

                const containerCorsiIscr = document.getElementById('user-corsi-iscrizioni');
                if (containerCorsiIscr) {
                    if (activeCorsiIscr.length === 0) {
                        containerCorsiIscr.innerHTML = `<p class="text-xs text-gray-500 uppercase font-mono">Non sei iscritto a nessun corso.</p>`;
                    } else {
                        containerCorsiIscr.innerHTML = activeCorsiIscr.map(iscr => {
                            const ev = iscr.eventi;
                            if (!ev) return '';
                            const dataFormat = new Date(ev.data_evento).toLocaleDateString('it-IT');
                            return `
                                <div class="border-l-4 border-green-500 bg-white/5 p-4 space-y-2 uppercase font-mono">
                                    <div class="flex justify-between items-center text-[10px]">
                                        <span class="text-gray-400 font-bold">${dataFormat}</span>
                                        <span class="text-green-500 font-bold">${iscr.stato_pagamento}</span>
                                    </div>
                                    <h4 class="font-headline text-xs font-bold text-white">${escapeHtml(ev.titolo)}</h4>
                                    <p class="text-[9px] text-gray-500">Luogo: ${escapeHtml(ev.luogo || 'Sede Club')}</p>
                                </div>
                            `;
                        }).join('');
                    }
                }

                const containerEventiIscr = document.getElementById('user-eventi-iscrizioni');
                if (containerEventiIscr) {
                    if (activeEventiIscr.length === 0) {
                        containerEventiIscr.innerHTML = `<p class="text-xs text-gray-500 uppercase font-mono">Non sei iscritto a nessun evento.</p>`;
                    } else {
                        containerEventiIscr.innerHTML = activeEventiIscr.map(iscr => {
                            const ev = iscr.eventi;
                            if (!ev) return '';
                            const dataFormat = new Date(ev.data_evento).toLocaleDateString('it-IT');
                            return `
                                <div class="border-l-4 border-green-500 bg-white/5 p-4 space-y-2 uppercase font-mono">
                                    <div class="flex justify-between items-center text-[10px]">
                                        <span class="text-gray-400 font-bold">${dataFormat}</span>
                                        <span class="text-green-500 font-bold">${iscr.stato_pagamento}</span>
                                    </div>
                                    <h4 class="font-headline text-xs font-bold text-white">${escapeHtml(ev.titolo)}</h4>
                                    <p class="text-[9px] text-gray-500">Luogo: ${escapeHtml(ev.luogo || 'Sede Club')}</p>
                                </div>
                            `;
                        }).join('');
                    }
                }

            } catch (err) {
                console.error("Errore caricamento eventi:", err);
            }
        }

        window.aggiornaPrezzoCard = function(eventoId) {
            const select = document.getElementById(`plan-select-${eventoId}`);
            if (!select) return;
            const selectedOption = select.options[select.selectedIndex];
            const price = parseFloat(selectedOption.getAttribute('data-price')) || 0;
            const priceLabel = price === 0 ? 'GRATUITO' : `€${price.toFixed(2)}`;
            const display = document.getElementById(`price-display-${eventoId}`);
            if (display) {
                display.textContent = priceLabel;
            }
        };

        async function iscrivitiEvento(eventoId, prezzo) {
            try {
                const select = document.getElementById(`plan-select-${eventoId}`);
                let prezzoCorrente = prezzo;
                let nomePiano = null;
                if (select) {
                    nomePiano = select.value;
                    const selectedOption = select.options[select.selectedIndex];
                    prezzoCorrente = parseFloat(selectedOption.getAttribute('data-price')) || 0;
                }

                if (prezzoCorrente === 0) {
                    if (!confirm("Confermi l'iscrizione a questo corso/evento gratuito?")) return;
                }

                const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
                if (!token) {
                    alert("Sessione non valida. Effettua nuovamente il login.");
                    return;
                }

                const res = await fetch(`${APP_CONFIG.API_BASE_URL || ""}/api/create-event-checkout-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ eventId: eventoId, nomePiano: nomePiano })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Errore di rete nell\'avviare il pagamento.');
                }

                if (data.free) {
                    alert("Ti sei registrato correttamente all'evento gratuito!");
                    await loadUserEventi();
                    await loadUserPagamenti();
                } else if (data.url) {
                    window.location.href = data.url;
                }
            } catch (err) {
                console.error("Errore iscrizione evento:", err);
                alert("Errore iscrizione: " + err.message);
            }
        }

        async function loadUserPagamenti() {
            try {
                const { data: receipts, error } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .select('*')
                    .eq('utente_id', currentUser.id)
                    .order('numero_ricevuta', { ascending: false });

                if (error) throw error;

                const body = document.getElementById('user-pagamenti-body');
                if (!receipts || receipts.length === 0) {
                    body.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">Nessun pagamento registrato.</td></tr>`;
                    return;
                }

                body.innerHTML = receipts.map(r => {
                    const dataFormat = r.data_pagamento 
                        ? new Date(r.data_pagamento).toLocaleDateString('it-IT')
                        : new Date().toLocaleDateString('it-IT');

                    return `
                        <tr>
                            <td class="p-4 font-mono font-bold text-white">${r.numero_ricevuta}/${r.anno_fiscale}</td>
                            <td class="p-4 font-mono">${dataFormat}</td>
                            <td class="p-4 font-mono text-primary font-bold">€${parseFloat(r.importo).toFixed(2)}</td>
                            <td class="p-4">${r.metodo_pagamento}</td>
                            <td class="p-4 text-gray-300 uppercase">${escapeHtml(r.causale || 'Quota sociale')}</td>
                            <td class="p-4 text-right">
                                <button onclick="printUserReceipt('${r.id}')" class="text-white hover:text-primary hover:underline font-headline font-bold text-[10px] flex items-center gap-1 ml-auto">
                                    <span class="material-symbols-outlined text-sm">print</span> STAMPA RICEVUTA
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');

            } catch (err) {
                console.error("Errore caricamento pagamenti utente:", err);
            }
        }

        window.printUserReceipt = async function(receiptId) {
            try {
                const { data: receipt, error } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .select('*, utenti(*)')
                    .eq('id', receiptId)
                    .maybeSingle();

                if (error || !receipt) {
                    alert("Impossibile caricare i dati della ricevuta.");
                    return;
                }

                const user = receipt.utenti;
                const dataFormat = receipt.data_pagamento
                    ? new Date(receipt.data_pagamento).toLocaleDateString('it-IT')
                    : new Date().toLocaleDateString('it-IT');

                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    const html = `
                        <html>
                        <head>
                            <title>Ricevuta n. ${receipt.numero_ricevuta}/${receipt.anno_fiscale}</title>
                            <style>
                                body {
                                    font-family: monospace;
                                    color: #000;
                                    background: #fff;
                                    padding: 40px;
                                    font-size: 12px;
                                    line-height: 1.5;
                                }
                                .header {
                                    text-align: center;
                                    margin-bottom: 30px;
                                    border-bottom: 2px solid #000;
                                    padding-bottom: 10px;
                                }
                                .receipt-title {
                                    font-size: 16px;
                                    font-weight: bold;
                                    margin-top: 10px;
                                }
                                .details-table {
                                    width: 100%;
                                    border-collapse: collapse;
                                    margin: 30px 0;
                                }
                                .details-table td {
                                    padding: 8px 0;
                                }
                                .footer {
                                    margin-top: 55px;
                                    border-top: 1px dashed #000;
                                    padding-top: 20px;
                                    text-align: center;
                                    font-size: 10px;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h3>ADRENALINA CLUB A.S.D.</h3>
                                <p>Sede Legale: Via dello Sport, 12 - Roma | P.IVA / CF: 97812345678</p>
                                <div class="receipt-title">RICEVUTA DI PAGAMENTO N. ${receipt.numero_ricevuta}/${receipt.anno_fiscale}</div>
                            </div>
                            
                            <table class="details-table">
                                <tr>
                                    <td><strong>Data Ricevuta:</strong></td>
                                    <td>${dataFormat}</td>
                                </tr>
                                <tr>
                                    <td><strong>Soggetto:</strong></td>
                                    <td>${user.nome.toUpperCase()} ${user.cognome.toUpperCase()} (C.F. ${user.codice_fiscale.toUpperCase()})</td>
                                </tr>
                                <tr>
                                    <td><strong>Importo Versato:</strong></td>
                                    <td><strong>€${parseFloat(receipt.importo).toFixed(2)}</strong></td>
                                </tr>
                                <tr>
                                    <td><strong>Metodo Pagamento:</strong></td>
                                    <td>${receipt.metodo_pagamento}</td>
                                </tr>
                                <tr>
                                    <td><strong>Causale:</strong></td>
                                    <td>${receipt.causale.toUpperCase()}</td>
                                </tr>
                                ${receipt.codice_transazione ? `
                                <tr>
                                    <td><strong>Codice Transazione:</strong></td>
                                    <td>${receipt.codice_transazione}</td>
                                </tr>` : ''}
                            </table>
                            
                            <div class="footer">
                                <p>La quota istituzionale versata all'Associazione non è soggetta ad IVA ai sensi dell'Art. 148 del TUIR.</p>
                                <p>ASD Adrenalina Club - Registro Nazionale Attività Sportive Dilettantistiche n. 128472</p>
                            </div>
                        </body>
                        </html>
                    `;
                    printWindow.document.write(html);
                    printWindow.document.close();
                    printWindow.focus();
                    setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                    }, 250);
                }
            } catch (err) {
                console.error("Errore stampa ricevuta:", err);
                alert("Errore stampa: " + err.message);
            }
        };

        // Logout
        async function handleLogout() {
            await supabaseClient.auth.signOut();
            window.location.href = "login.html";
        }

        // Start checking session immediately
        checkSession();
    
