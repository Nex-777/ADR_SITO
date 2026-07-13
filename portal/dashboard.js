// Supabase Initialization
        if (typeof APP_CONFIG === 'undefined') {
            window.APP_CONFIG = {
                SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
                SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
                API_BASE_URL: window.location.origin,
                VERSION: "1.01.75"
            };
        }
        const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
        const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        function showLoader() {
            document.body.style.cursor = 'wait';
        }
        function hideLoader() {
            document.body.style.cursor = 'default';
        }

        // Helper per formattare le date in GG/MM/AA
        function formatToItalianDate(dateStr) {
            if (!dateStr) return '';
            try {
                const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
                const parts = cleanDate.split('-');
                if (parts.length === 3) {
                    return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
                }
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = String(d.getFullYear()).slice(-2);
                return `${day}/${month}/${year}`;
            } catch (e) {
                return dateStr;
            }
        }

        function isCertificatoScaduto(data_scadenza) {
            if (!data_scadenza) return true;
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            return data_scadenza < todayStr;
        }

        // Security override for window.alert to prevent raw database/exception leak
        const _originalAlert = window.alert;
        window.alert = function(message) {
            if (typeof message === 'string' && (
                message.toLowerCase().includes('exception') || 
                message.toLowerCase().includes('supabase') ||
                message.toLowerCase().includes('postgres') ||
                message.toLowerCase().includes('db_') ||
                message.toLowerCase().includes('database') ||
                message.toLowerCase().includes('relation "') ||
                message.toLowerCase().includes('column "')
            )) {
                console.error("Technical error alert intercepted:", message);
                _originalAlert("Si è verificato un errore durante l'operazione. Riprova più tardi o contatta il direttivo per assistenza.");
            } else {
                _originalAlert(message);
            }
        };

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
                if (anag.certificati_medici.length === 0) return null;
                // Ordina primariamente per created_at (data caricamento) decrescente per ottenere l'ultimo caricato
                const sorted = [...anag.certificati_medici].sort((a, b) => {
                    const valA = a.created_at || a.data_scadenza || a.data_rilascio || '1970-01-01';
                    const valB = b.created_at || b.data_scadenza || b.data_rilascio || '1970-01-01';
                    return new Date(valB) - new Date(valA);
                });
                return sorted[0];
            }
            return anag.certificati_medici;
        }

        function getIdDocInfo(anag) {
            if (!anag) return null;
            if (!anag.documenti_identita) return null;
            if (Array.isArray(anag.documenti_identita)) {
                if (anag.documenti_identita.length === 0) return null;
                // Ordina per created_at decrescente per ottenere l'ultimo caricato
                const sorted = [...anag.documenti_identita].sort((a, b) => {
                    const valA = a.created_at || a.data_caricamento || '1970-01-01';
                    const valB = b.created_at || b.data_caricamento || '1970-01-01';
                    return new Date(valB) - new Date(valA);
                });
                return sorted[0];
            }
            return anag.documenti_identita;
        }

        function generateProgressBarHtml(dateStr) {
            if (!dateStr) {
                let stepsHtml = '';
                for (let i = 1; i <= 12; i++) {
                    stepsHtml += `<div class="h-1 flex-grow" style="min-width: 4px; background-color: rgba(255, 255, 255, 0.1);"></div>`;
                }
                return `<div class="flex gap-[2px] mt-1.5 w-full max-w-[110px] mx-auto">${stepsHtml}</div>`;
            }

            const expiry = new Date(dateStr);
            const today = new Date();
            expiry.setHours(0,0,0,0);
            today.setHours(0,0,0,0);

            const diffTime = expiry - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let monthsRemaining = 0;
            if (diffDays > 0) {
                monthsRemaining = Math.min(12, Math.ceil(diffDays / 30));
            }

            let stepsHtml = '';
            for (let i = 1; i <= 12; i++) {
                let bgColor = 'rgba(255, 255, 255, 0.1)';
                if (i <= monthsRemaining) {
                    if (i === 1) {
                        bgColor = '#ef4444';
                    } else if (i === 2) {
                        bgColor = '#eab308';
                    } else {
                        bgColor = '#22c55e';
                    }
                }
                stepsHtml += `<div class="h-1 flex-grow" style="min-width: 4px; background-color: ${bgColor};"></div>`;
            }
            return `<div class="flex gap-[2px] mt-1.5 w-full max-w-[110px] mx-auto" title="${monthsRemaining} mesi rimanenti">${stepsHtml}</div>`;
        }

        async function openSignedFile(bucket, filePath) {
            try {
                if (!filePath) {
                    alert("Percorso file non valido.");
                    return;
                }
                const allowedBuckets = ['certificati_medici', 'documenti_identita', 'documenti_tutori', 'documenti_adesione'];
                if (!allowedBuckets.includes(bucket)) {
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
        let tesseratiSort = { field: 'id_tesserato', direction: 'desc' };
        let quoteSort = { field: 'stato', direction: 'desc' };
        let direttivoSort = { field: 'nominativo', direction: 'asc' };
        let bilanciSort = { field: 'anno', direction: 'desc' };
        let contabilitaSort = { field: 'dettagli', direction: 'desc' };

        // Helper per la scrittura dei log di audit (Tracciabilità RUNTS - DM 2/2026)
        async function scriviAuditLog(azione, tabellaTarget, recordTargetId, dettagli = {}) {
            try {
                if (!currentUser) return;
                let ip = 'N/A';
                try {
                    const res = await fetch('/api/get-ip');
                    const data = await res.json();
                    ip = data.ip;
                } catch (e) {
                    console.warn("Impossibile rilevare IP localmente:", e);
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
        let currentViewContext = localStorage.getItem('currentViewContext') || 'athlete';
        
        function switchContext(view) {
            currentViewContext = view;
            localStorage.setItem('currentViewContext', view);
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
                    'approvazioni', 'soci', 'tesserati', 'quote', 'contabilita', 'direttivo', 'verbali', 'verbali_assemblea', 'bilanci', 'gestione_corsi', 'logiche', 'taratura_pdf', 'sandbox',
                    'registro_istruttori', 'registro_volontari'
                ];
                tabs.forEach(tab => {
                    const el = document.getElementById(`tab-btn-${tab}`);
                    if (el) el.classList.add('hidden');
                });
            }

            hideAllTabs();

            if (currentViewContext === 'athlete') {
                document.body.classList.add('theme-tesserato');
                
                document.getElementById('welcome-title').textContent = "Benvenuto in Adrenalina Club";
                document.getElementById('welcome-subtitle').textContent = "Adrenalina Club - Portale Atleti Ufficiale";
                document.getElementById('board-stats-grid').classList.add('hidden');
                document.getElementById('board-alert-board').classList.add('hidden');
                
                // Mostra pulsanti atleti base
                document.getElementById('tab-btn-user_profilo').classList.remove('hidden');
                document.getElementById('tab-btn-user_certificato').classList.remove('hidden');
                document.getElementById('tab-btn-user_corsi').classList.remove('hidden');
                document.getElementById('tab-btn-user_eventi').classList.remove('hidden');

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
                document.getElementById('tab-btn-tesserati').classList.remove('hidden');
                document.getElementById('tab-btn-registro_istruttori').classList.remove('hidden');

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
                
                const boardRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
                const activeBoardRole = userRoles.find(r => boardRoles.includes(r));
                const formattedRole = activeBoardRole ? activeBoardRole.replace(/_/g, ' ').toUpperCase() : '';
                document.getElementById('welcome-title').textContent = formattedRole ? `AREA DIRETTIVO | INCARICO: ${formattedRole}` : "AREA DIRETTIVO";
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
                document.getElementById('tab-btn-registro_istruttori').classList.remove('hidden');
                document.getElementById('tab-btn-registro_volontari').classList.remove('hidden');
                document.getElementById('tab-btn-quote').classList.remove('hidden');
                document.getElementById('tab-btn-contabilita').classList.remove('hidden');
                document.getElementById('tab-btn-logiche').classList.remove('hidden');
                
                const isPresidentOrVP = userRoles.some(r => ['presidente', 'vice_presidente'].includes(r));
                if (isPresidentOrVP) {
                    document.getElementById('tab-btn-gestione_corsi').classList.remove('hidden');
                    document.getElementById('tab-btn-taratura_pdf').classList.remove('hidden');
                    document.getElementById('tab-btn-sandbox').classList.remove('hidden');
                }

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
                const isAthlete = userRoles.some(r => ['tesserato', 'tesserato_esterno', 'minore'].includes(r));
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
                localStorage.setItem('currentViewContext', currentViewContext);
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
                    const cert = getCertInfo(anag);
                    
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
                        const scaduto = isCertificatoScaduto(cert.data_scadenza);
                        
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
                    const numA = a.userReceipt ? (parseInt(a.userReceipt.numero_ricevuta) || 0) : -1;
                    const numB = b.userReceipt ? (parseInt(b.userReceipt.numero_ricevuta) || 0) : -1;
                    if (numA !== numB) {
                        return (numA - numB) * dir;
                    }
                    return (a.stato - b.stato) * dir;
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
                } else if (field === 'dettagli') {
                    return ((a.sortDettagli || 0) - (b.sortDettagli || 0)) * dir;
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
                        sync_csen_status,
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
                            utente_id,
                            nome,
                            cognome,
                            codice_fiscale,
                            data_nascita,
                            comune_nascita,
                            provincia_nascita,
                            utenti (
                                quota_totale
                            ),
                            certificati_medici (
                                id,
                                tipologia,
                                data_rilascio,
                                data_scadenza,
                                medico_rilascio,
                                file_url,
                                stato_validazione,
                                note_ai
                            ),
                            documenti_identita (
                                id,
                                tipologia,
                                file_url
                            )
                        )
                    `)
                    .order('created_at', { ascending: false });

        window.triggerCsenSync = async () => {
            const btn = document.getElementById('btn-sync-csen');
            const icon = document.getElementById('btn-sync-csen-icon');
            if (btn) btn.disabled = true;
            if (icon) icon.classList.add('animate-spin');

            try {
                const { data: sessionData } = await supabaseClient.auth.getSession();
                const token = sessionData?.session?.access_token;
                
                if (!token) throw new Error("Sessione scaduta.");

                const res = await fetch(`${APP_CONFIG.API_BASE_URL}/api/trigger-csen`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: res.statusText }));
                    throw new Error(`Errore API: ${res.status} - ${errData.error || res.statusText}`);
                }

                alert("✅ Sincronizzazione CSEN avviata! Il sistema elaborerà gli atleti in background. Controlla il pannello CSEN Status tra 10-15 minuti.");
                setTimeout(() => window.loadCsenStatus && window.loadCsenStatus(), 5000);
            } catch (err) {
                alert("❌ Errore nell'avvio della sincronizzazione: " + err.message);
            } finally {
                if (btn) btn.disabled = false;
                if (icon) icon.classList.remove('animate-spin');
            }
        };

        window.loadCsenStatus = async () => {
            const container = document.getElementById('csen-status-panel');
            if (!container) return;

            container.innerHTML = `<div class="text-gray-500 text-xs animate-pulse p-4">Caricamento stato CSEN...</div>`;

            try {
                const { data: sessionData } = await supabaseClient.auth.getSession();
                const token = sessionData?.session?.access_token;
                if (!token) throw new Error("Sessione scaduta.");

                const res = await fetch(`${APP_CONFIG.API_BASE_URL}/api/csen-status`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const data = await res.json();

                const { counts, pending_da_sincronizzare, renewal_submitted, errori, pendingConTessera } = data;
                const totalPending = pending_da_sincronizzare?.length || 0;
                const totalRenewal = renewal_submitted?.length || 0;
                const totalErrors = errori?.length || 0;

                const statusColor = totalErrors > 0 ? '#df293e' : (totalPending + totalRenewal) > 0 ? '#eab308' : '#22c55e';
                const statusLabel = totalErrors > 0 ? '⚠️ ERRORI PRESENTI'
                    : totalRenewal > 0 ? '🟠 RINNOVI IN ATTESA CONFERMA CSEN'
                    : totalPending > 0 ? '🟡 IN ATTESA DI SYNC'
                    : '✅ TUTTO SINCRONIZZATO';

                const pendingRows = (pending_da_sincronizzare || []).map(p => `
                    <tr class="border-b border-white/5">
                        <td class="py-2 px-3 text-xs text-white font-bold">${escapeHtml(p.anagrafiche?.nome || '')} ${escapeHtml(p.anagrafiche?.cognome || '')}</td>
                        <td class="py-2 px-3 text-xs text-gray-400 font-mono">${escapeHtml(p.anagrafiche?.codice_fiscale || '')}</td>
                        <td class="py-2 px-3 text-xs text-primary">${escapeHtml(p.livello_copertura || '')}</td>
                        <td class="py-2 px-3 text-xs text-gray-500">${formatToItalianDate(p.data_richiesta_tesseramento)}</td>
                    </tr>
                `).join('');

                const renewalRows = (renewal_submitted || []).map(r => `
                    <tr class="border-b border-white/5">
                        <td class="py-2 px-3 text-xs text-orange-300 font-bold">${escapeHtml(r.anagrafiche?.nome || '')} ${escapeHtml(r.anagrafiche?.cognome || '')}</td>
                        <td class="py-2 px-3 text-xs text-gray-400 font-mono">${escapeHtml(r.anagrafiche?.codice_fiscale || '')}</td>
                        <td class="py-2 px-3 text-xs text-orange-400">${escapeHtml(r.livello_copertura || '')}</td>
                        <td class="py-2 px-3 text-xs text-gray-500 max-w-xs" style="word-break:break-word">${escapeHtml(r.sync_csen_log || '')}</td>
                    </tr>
                `).join('');

                const errorRows = (errori || []).map(e => `
                    <tr class="border-b border-white/5">
                        <td class="py-2 px-3 text-xs text-red-400 font-bold">${escapeHtml(e.nome || '')}</td>
                        <td class="py-2 px-3 text-xs text-gray-400 font-mono">${escapeHtml(e.cf || '')}</td>
                        <td class="py-2 px-3 text-xs text-red-300" style="max-width:300px;word-break:break-word">${escapeHtml(e.log || 'Errore sconosciuto')}</td>
                    </tr>
                `).join('');

                container.innerHTML = `
                    <div class="mb-4 flex flex-wrap gap-3">
                        <div class="bg-black/40 border border-green-500/30 px-4 py-3 rounded flex flex-col items-center min-w-[80px]">
                            <span class="text-2xl font-black text-green-400">${counts.SYNCED || 0}</span>
                            <span class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">SYNCED</span>
                        </div>
                        <div class="bg-black/40 border border-yellow-500/30 px-4 py-3 rounded flex flex-col items-center min-w-[80px]">
                            <span class="text-2xl font-black text-yellow-400">${totalPending}</span>
                            <span class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">DA SYNC</span>
                        </div>
                        <div class="bg-black/40 border border-orange-500/30 px-4 py-3 rounded flex flex-col items-center min-w-[80px]">
                            <span class="text-2xl font-black text-orange-400">${totalRenewal}</span>
                            <span class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">RINNOVI</span>
                        </div>
                        <div class="bg-black/40 border border-blue-500/30 px-4 py-3 rounded flex flex-col items-center min-w-[80px]">
                            <span class="text-2xl font-black text-blue-400">${counts.SYNCED_NO_NUM || 0}</span>
                            <span class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">SENZA N.</span>
                        </div>
                        <div class="bg-black/40 border border-red-500/30 px-4 py-3 rounded flex flex-col items-center min-w-[80px]">
                            <span class="text-2xl font-black text-red-400">${totalErrors}</span>
                            <span class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">ERRORI</span>
                        </div>
                        <div class="flex-1 flex items-center justify-end">
                            <span class="font-headline text-xs font-bold px-3 py-1 rounded border" style="color:${statusColor};border-color:${statusColor}40;background:${statusColor}10">${statusLabel}</span>
                        </div>
                    </div>

                    ${totalRenewal > 0 ? `
                    <div class="mb-4 p-3 border border-orange-500/30 bg-orange-500/5 rounded">
                        <h4 class="font-headline text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">🟠 Rinnovi inviati su CSEN — In attesa di nuovo numero (${totalRenewal})</h4>
                        <p class="text-[10px] text-gray-500 mb-3">Il sistema aggiornerà il numero tessera automaticamente stanotte alle 02:00 quando CSEN avrà elaborato il rinnovo.</p>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead><tr class="border-b border-white/10">
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Nome</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">CF</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Copertura</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Log</th>
                                </tr></thead>
                                <tbody>${renewalRows}</tbody>
                            </table>
                        </div>
                    </div>` : ''}

                    ${totalPending > 0 ? `
                    <div class="mb-4">
                        <h4 class="font-headline text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2">🟡 In attesa di sincronizzazione CSEN (${totalPending})</h4>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead><tr class="border-b border-white/10">
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Nome</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">CF</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Copertura</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Data</th>
                                </tr></thead>
                                <tbody>${pendingRows}</tbody>
                            </table>
                        </div>
                    </div>` : ''}

                    ${totalErrors > 0 ? `
                    <div class="mb-4">
                        <h4 class="font-headline text-xs font-bold text-red-400 uppercase tracking-widest mb-2">🔴 Errori di sincronizzazione (${totalErrors})</h4>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead><tr class="border-b border-white/10">
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Nome</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">CF</th>
                                    <th class="py-2 px-3 text-[10px] text-gray-500 uppercase tracking-wider">Errore</th>
                                </tr></thead>
                                <tbody>${errorRows}</tbody>
                            </table>
                        </div>
                    </div>` : ''}

                    <div class="text-right text-[10px] text-gray-600 mt-2">Aggiornato: ${new Date(data.timestamp).toLocaleString('it-IT')}</div>
                `;

            } catch (err) {
                container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore caricamento stato CSEN: ${escapeHtml(err.message)}</div>`;
            }
        };



        window.attivaTesseramentoApprovazioni = async (anagraficaId) => {
            if (!confirm("Confermi l'attivazione immediata di questo Tesserato?")) return;
            try {
                const { error } = await supabaseClient.rpc('approva_tesserato', { 
                    p_anagrafica_id: anagraficaId,
                    p_deciso_da: currentUser?.id 
                });
                if (error) throw error;
                alert("Tesserato attivato con successo! Il profilo è ora visibile nel Registro Tesserati.");
                loadApprovazioni();
                loadTesserati();
                loadStats();
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
                
                // Fetch atti_adesione per ottenere i PDF CSEN
                const utenteIds = (data || []).map(x => x.anagrafiche?.utente_id).filter(Boolean);
                if (utenteIds.length > 0) {
                    const { data: attiData } = await supabaseClient
                        .from('atti_adesione')
                        .select('utente_id, url_pdf_csen_informativa, url_pdf_csen_iscrizione')
                        .in('utente_id', utenteIds);
                    if (attiData) {
                        data.forEach(item => {
                            if (item.anagrafiche?.utente_id) {
                                item.atti_adesione = attiData.find(a => a.utente_id === item.anagrafiche.utente_id);
                            }
                        });
                    }
                }

                approvazioniData = data || [];
                renderApprovazioniTables();
            } catch (err) {
                console.error("Errore caricamento approvazioni:", err);
            }
        }

        async function renderApprovazioniTables() {
            const sociBody = document.getElementById('approvazioni-soci-list');
            const tessBody = document.getElementById('approvazioni-tesserati-list');
            const pagBody = document.getElementById('approvazioni-pagamenti-list');
            const storicoBody = document.getElementById('approvazioni-storico-list');

            if (!sociBody || !tessBody || !storicoBody) return;

            sociBody.innerHTML = '';
            tessBody.innerHTML = '';
            if (pagBody) pagBody.innerHTML = '';
            storicoBody.innerHTML = '';

            const pendingSoci = approvazioniData.filter(x => x.stato === 'IN_ATTESA' && (x.tipo === 'SOCIO' || x.tipo === 'SOCIO_TESSERATO'));
            const pendingTess = approvazioniData.filter(x => x.stato === 'IN_ATTESA' && (x.tipo === 'TESSERATO' || x.tipo === 'SOCIO_TESSERATO'));
            const pendingPag = approvazioniData.filter(x => x.stato === 'IN_ATTESA_PAGAMENTO');
            const storico = approvazioniData.filter(x => x.stato !== 'IN_ATTESA' && x.stato !== 'IN_ATTESA_PAGAMENTO');

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
                        <td class="p-3 text-gray-400">${escapeHtml(formatToItalianDate(item.data_richiesta))}</td>
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
                    let docIdHtml = '<span class="text-gray-500 font-bold text-[9px]">-</span>';
                    const docId = getIdDocInfo(anag);
                    if (docId) {
                        docIdHtml = `
                            <div class="mt-2 text-center border-t border-white/10 pt-2">
                                <a href="#" data-file-url="${escapeHtml(docId.file_url)}" class="approvazioni-view-id-btn underline text-blue-400 font-bold text-[9px] uppercase"><span class="material-symbols-outlined text-[10px] mr-1 align-middle">badge</span>DOC. IDENTITÀ</a>
                            </div>
                        `;
                    }

                    let csenFormsHtml = '';
                    if (item.atti_adesione) {
                        const urlInfo = item.atti_adesione.url_pdf_csen_informativa;
                        const urlIscr = item.atti_adesione.url_pdf_csen_iscrizione;
                        if (urlInfo || urlIscr) {
                            csenFormsHtml = `
                                <div class="mt-2 flex flex-col items-center gap-1 border-t border-white/10 pt-2">
                                    ${urlInfo ? `<a href="${urlInfo}" target="_blank" class="underline text-purple-400 font-bold text-[9px] uppercase"><span class="material-symbols-outlined text-[10px] mr-1 align-middle">description</span>INFORMATIVA CSEN</a>` : ''}
                                    ${urlIscr ? `<a href="${urlIscr}" target="_blank" class="underline text-purple-400 font-bold text-[9px] uppercase"><span class="material-symbols-outlined text-[10px] mr-1 align-middle">description</span>ISCRIZIONE CSEN</a>` : ''}
                                </div>
                            `;
                        }
                    }

                    if (certInfo) {
                        const scaduto = isCertificatoScaduto(certInfo.data_scadenza);
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
                            <div class="flex flex-col items-center gap-1 pb-2">
                                <a href="#" data-file-url="${escapeHtml(certInfo.file_url)}" class="approvazioni-view-cert-btn underline ${color} font-bold">${escapeHtml(certInfo.tipologia)}</a>
                                ${statusLabel}
                                <span class="text-[9px] text-gray-500 font-mono">Scad: ${escapeHtml(formatToItalianDate(certInfo.data_scadenza))}</span>
                            </div>
                            ${docIdHtml}
                            ${csenFormsHtml}
                        `;
                    }

                    let actionBtn = '';
                    if (userRoles.some(r => ['presidente', 'vice_presidente', 'segretario'].includes(r))) {
                        let mainBtn = '';
                        if (isCertVerde) {
                            mainBtn = `<button onclick="attivaTesseramentoApprovazioni('${item.anagrafica_id}')" class="bg-white text-black font-headline text-[9px] font-bold px-3 py-1 hover:bg-primary hover:text-white transition-all uppercase">ATTIVA</button>`;
                        } else if (certInfo && certInfo.stato_validazione !== 'VERDE') {
                            mainBtn = `
                                <div class="flex flex-col gap-1">
                                    <button onclick="if(confirm('Procedere con l\\'approvazione manuale del certificato medico?')) validaCertificatoManual('${certInfo.id}', 'VERDE')" class="bg-yellow-500 text-black font-headline text-[9px] font-bold px-3 py-1 hover:bg-green-500 hover:text-white transition-all uppercase">APPROVA CERT.</button>
                                    <button onclick="validaCertificatoManual('${certInfo.id}', 'ROSSO')" class="bg-primary text-white font-headline text-[9px] font-bold px-3 py-1 hover:bg-red-600 transition-all uppercase">RIFIUTA CERT.</button>
                                </div>
                            `;
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
                        <td class="p-3 text-gray-400">${escapeHtml(formatToItalianDate(item.data_richiesta))}</td>
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
                    const viewIdBtn = row.querySelector('.approvazioni-view-id-btn');
                    if (viewIdBtn) {
                        viewIdBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            const url = e.currentTarget.getAttribute('data-file-url');
                            openSignedFile('documenti_identita', url);
                        });
                    }
                    tessBody.appendChild(row);
                });
            }

            // Render Pending Payments
            if (pagBody) {
                if (pendingPag.length === 0) {
                    pagBody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-500">Nessun utente in attesa di pagamento.</td></tr>';
                } else {
                    pendingPag.forEach(item => {
                        const row = document.createElement('tr');
                        row.className = 'border-b border-white/5 hover:bg-white/5 transition-colors';
                        const anag = item.anagrafiche || {};
                        const nome = escapeHtml(`${anag.nome || ''} ${anag.cognome || ''}`);
                        const cf = escapeHtml(anag.codice_fiscale || '');
                        
                        let quotaStr = '€0.00';
                        if (anag.utenti) {
                            const quota = parseFloat(anag.utenti.quota_totale) || 0;
                            quotaStr = `€${quota.toFixed(2)}`;
                        }
                        
                        row.innerHTML = `
                            <td class="p-3 font-bold text-white">${nome}</td>
                            <td class="p-3 text-gray-400 font-mono">${cf}</td>
                            <td class="p-3 text-gray-400">${escapeHtml(item.tipo)}</td>
                            <td class="p-3 text-yellow-500 font-bold">${quotaStr}</td>
                            <td class="p-3 text-gray-400">${escapeHtml(formatToItalianDate(item.data_decisione || item.data_richiesta))}</td>
                            <td class="p-3 text-right">
                                <span class="px-2 py-0.5 border text-[9px] font-bold rounded uppercase text-yellow-500 bg-yellow-500/10 border-yellow-500/30">ATTESA PAGAMENTO</span>
                            </td>
                        `;
                        pagBody.appendChild(row);
                    });
                }
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
                        <td class="p-3 text-gray-500">${escapeHtml(formatToItalianDate(ghost.data_creazione))}</td>
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
                        <td class="p-3">${escapeHtml(formatToItalianDate(item.data_decisione))}</td>
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
                const { data: sessionData } = await supabaseClient.auth.getSession();
                const session = sessionData?.session;
                const token = session?.access_token;
                
                if (!token) {
                    throw new Error("Sessione scaduta o non valida.");
                }

                const response = await fetch(`${APP_CONFIG.API_BASE_URL}/api/validate-cert`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        cert_id: certId,
                        is_manual: true,
                        nuovo_stato: nuovoStato,
                        note: note
                    })
                });

                const resData = await response.json();
                if (!response.ok) {
                    throw new Error(resData.error || "Errore durante la validazione manuale.");
                }

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

            const searchInput = document.getElementById('tesserati-search');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

            const filteredData = tesseratiData.filter(tess => {
                if (!query) return true;
                const nomeComp = tess.anagrafiche ? `${tess.anagrafiche.nome} ${tess.anagrafiche.cognome}`.toLowerCase() : '';
                const cf = tess.anagrafiche ? String(tess.anagrafiche.codice_fiscale).toLowerCase() : '';
                const csen = tess.numero_tessera_csen ? String(tess.numero_tessera_csen).toLowerCase() : '';
                const reg = tess.numero_registro ? String(tess.numero_registro).toLowerCase() : '';
                return nomeComp.includes(query) || cf.includes(query) || csen.includes(query) || reg.includes(query);
            });

            // Update result counter
            const counterEl = document.getElementById('tesserati-search-count');
            if (counterEl) {
                counterEl.textContent = `${filteredData.length} RISULTATI`;
            }

            // Update CSEN pending counter (PENDING + RENEWAL_SUBMITTED = tessere ancora da completare)
            const pendingCount = tesseratiData.filter(t =>
                ['PENDING', 'RENEWAL_SUBMITTED'].includes(t.sync_csen_status) &&
                t.stato_tesseramento === 'ATTIVO'
            ).length;
            const btnSync = document.getElementById('btn-sync-csen');
            const spanSyncCount = document.getElementById('csen-pending-count');
            if (btnSync && spanSyncCount) {
                spanSyncCount.textContent = pendingCount;
                if (pendingCount > 0) {
                    btnSync.disabled = false;
                    btnSync.classList.remove('opacity-50', 'cursor-not-allowed');
                } else {
                    btnSync.disabled = true;
                    btnSync.classList.add('opacity-50', 'cursor-not-allowed');
                }
            }

            if (filteredData.length === 0) {
                body.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nessun tesseramento corrispondente ai criteri di ricerca.</td></tr>';
                return;
            }

            filteredData.forEach(tess => {
                const row = document.createElement('tr');
                const nomeComp = tess.anagrafiche ? escapeHtml(`${tess.anagrafiche.nome} ${tess.anagrafiche.cognome}`) : 'N/D';
                const cf = tess.anagrafiche ? escapeHtml(tess.anagrafiche.codice_fiscale) : 'N/D';
                const birthInfo = tess.anagrafiche ? escapeHtml(`${tess.anagrafiche.data_nascita} a ${tess.anagrafiche.comune_nascita} (${tess.anagrafiche.provincia_nascita})`) : 'N/D';
                
                const certInfo = getCertInfo(tess.anagrafiche);

                let certHtml = '<span class="text-primary font-bold">MANCANTE</span>';
                let isCertVerde = false;
                if (certInfo) {
                    const scaduto = isCertificatoScaduto(certInfo.data_scadenza);
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
                    const certBarHtml = generateProgressBarHtml(certInfo.data_scadenza);
                    certHtml = `<a href="#" data-file-url="${escapeHtml(certInfo.file_url)}" class="tess-view-cert-btn underline ${color} font-bold">${escapeHtml(certInfo.tipologia)}</a>${statusLabel}<br>
                                <span class="text-[10px] text-gray-400">Scadenza: ${escapeHtml(formatToItalianDate(certInfo.data_scadenza))}</span>
                                ${certBarHtml}`;
                }

                let badgeColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
                if (tess.stato_tesseramento === 'ATTIVO') badgeColor = 'text-green-500 bg-green-500/10 border-green-500/30';
                if (tess.stato_tesseramento === 'SOSPESO') badgeColor = 'text-primary bg-primary/10 border-primary/30';

                // ---- Colore e testo badge tessera CSEN (tabella) ----
                let csenTextColor = 'text-yellow-500';  // PENDING default
                let csenTextStr = 'DA COMUNICARE';
                if (tess.numero_tessera_csen && tess.numero_tessera_csen !== '0') {
                    // Tessera assegnata → verde
                    csenTextColor = 'text-green-500';
                    csenTextStr = tess.numero_tessera_csen;
                } else {
                    switch (tess.sync_csen_status) {
                        case 'RENEWAL_SUBMITTED':
                            csenTextColor = 'text-orange-400';
                            csenTextStr = 'RINNOVO INVIATO';
                            break;
                        case 'SYNCED_NO_NUM':
                            csenTextColor = 'text-blue-400';
                            csenTextStr = 'IN ATTESA N. CSEN';
                            break;
                        case 'ERROR':
                            csenTextColor = 'text-primary';
                            csenTextStr = 'ERRORE SYNC';
                            break;
                        case 'PENDING':
                        default:
                            csenTextColor = 'text-yellow-500';
                            csenTextStr = 'DA COMUNICARE';
                    }
                }

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
                        <button onclick="apriDossierTesserato('${tess.anagrafiche.utente_id}')" class="bg-blue-600/20 border border-blue-500/40 text-blue-400 hover:bg-blue-600 hover:text-white font-headline text-[9px] font-bold px-2 py-0.5 transition-all uppercase" title="Dossier Tesserato">DOSSIER</button>
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
                    <td class="p-4 font-mono font-bold ${csenTextColor}">
                        ${escapeHtml(csenTextStr)}<br>
                        <span class="text-[10px] text-gray-500 font-normal">Richiesta: ${escapeHtml(formatToItalianDate(tess.data_richiesta_tesseramento))}</span>
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

            // === MOBILE CARD VIEW RENDERING ===
            renderTesseratiMobileCards(filteredData);
        }

        function renderTesseratiMobileCards(filteredData) {
            // Find or create mobile card container
            let cardContainer = document.getElementById('tesserati-mobile-cards');
            if (!cardContainer) {
                // Create the container and insert it after the table wrapper
                const tableWrapper = document.querySelector('#panel-tesserati .overflow-x-auto');
                if (!tableWrapper) return;
                cardContainer = document.createElement('div');
                cardContainer.id = 'tesserati-mobile-cards';
                cardContainer.className = 'mobile-card-list';
                tableWrapper.parentNode.insertBefore(cardContainer, tableWrapper.nextSibling);
                // Add class to table wrapper for mobile hiding
                tableWrapper.classList.add('mobile-table-hidden-target');
            }
            cardContainer.innerHTML = '';

            // On desktop, hide the card container
            if (window.innerWidth >= 1024) {
                cardContainer.style.display = 'none';
                const tableWrapper = document.querySelector('#panel-tesserati .overflow-x-auto');
                if (tableWrapper) tableWrapper.style.display = '';
                return;
            }

            // On mobile, hide table and show cards
            const tableWrapper = document.querySelector('#panel-tesserati .overflow-x-auto');
            if (tableWrapper) tableWrapper.style.display = 'none';
            cardContainer.style.display = '';

            if (filteredData.length === 0) {
                cardContainer.innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280;text-transform:uppercase;font-size:12px;">Nessun tesseramento trovato.</div>';
                return;
            }

            filteredData.forEach(tess => {
                const nomeComp = tess.anagrafiche ? `${tess.anagrafiche.nome} ${tess.anagrafiche.cognome}` : 'N/D';
                const cf = tess.anagrafiche ? tess.anagrafiche.codice_fiscale : 'N/D';
                const certInfo = getCertInfo(tess.anagrafiche);

                // Certificate status
                let certStatus = 'MANCANTE';
                let certColor = '#df293e';
                if (certInfo) {
                    const scaduto = isCertificatoScaduto(certInfo.data_scadenza);
                    if (certInfo.stato_validazione === 'VERDE' && !scaduto) {
                        certStatus = 'VALIDO';
                        certColor = '#22c55e';
                    } else if (certInfo.stato_validazione === 'GIALLO') {
                        certStatus = 'DA VERIFICARE';
                        certColor = '#eab308';
                    } else if (certInfo.stato_validazione === 'ROSSO') {
                        certStatus = 'RIFIUTATO';
                        certColor = '#df293e';
                    } else if (certInfo.stato_validazione === 'IN_ATTESA') {
                        certStatus = 'IN ATTESA';
                        certColor = '#9ca3af';
                    } else if (scaduto) {
                        certStatus = 'SCADUTO';
                        certColor = '#df293e';
                    } else {
                        certStatus = 'VALIDATO';
                        certColor = '#22c55e';
                    }
                }

                // Tesseramento badge
                let tessColor = '#eab308';
                if (tess.stato_tesseramento === 'ATTIVO') tessColor = '#22c55e';
                if (tess.stato_tesseramento === 'SOSPESO') tessColor = '#df293e';

                // ---- Colore e testo badge tessera CSEN (card) ----
                let csenTextColorHex = '#eab308'; // yellow — PENDING default
                let csenTextStr = 'DA COMUNICARE';
                if (tess.numero_tessera_csen && tess.numero_tessera_csen !== '0') {
                    csenTextColorHex = '#22c55e'; // verde — tessera assegnata
                    csenTextStr = tess.numero_tessera_csen;
                } else {
                    switch (tess.sync_csen_status) {
                        case 'RENEWAL_SUBMITTED':
                            csenTextColorHex = '#f97316'; // orange
                            csenTextStr = 'RINNOVO INVIATO';
                            break;
                        case 'SYNCED_NO_NUM':
                            csenTextColorHex = '#3b82f6'; // blue
                            csenTextStr = 'IN ATTESA N. CSEN';
                            break;
                        case 'ERROR':
                            csenTextColorHex = '#df293e'; // red
                            csenTextStr = 'ERRORE SYNC';
                            break;
                        case 'PENDING':
                        default:
                            csenTextColorHex = '#eab308'; // yellow
                            csenTextStr = 'DA COMUNICARE';
                    }
                }

                // Action button
                let actionHtml = '';
                const isCertVerde = certInfo && certInfo.stato_validazione === 'VERDE' && !isCertificatoScaduto(certInfo.data_scadenza);
                if (tess.stato_tesseramento === 'IN_ELABORAZIONE' && typeof userRoles !== 'undefined' && userRoles.some(r => ['presidente', 'vice_presidente', 'segretario'].includes(r))) {
                    if (isCertVerde) {
                        actionHtml += `<button onclick="attivaTesseramento(${tess.id_tesserato})" style="background:#fff;color:#000;border:none;padding:10px 20px;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;cursor:pointer;min-height:44px;">ATTIVA</button>`;
                    } else if (certInfo && certInfo.stato_validazione === 'GIALLO') {
                        actionHtml += `<button onclick="if(confirm('Approvare il certificato?')) validaCertificatoManual('${certInfo.id}', 'VERDE')" style="background:#eab308;color:#000;border:none;padding:10px 20px;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;cursor:pointer;min-height:44px;">APPROVA CERT.</button>`;
                    }
                }
                
                if (typeof userRoles !== 'undefined' && userRoles.some(r => ['presidente', 'vice_presidente'].includes(r)) && tess.anagrafiche) {
                    actionHtml += `<button onclick="apriDossierTesserato('${tess.anagrafiche.utente_id}')" style="background:rgba(37,99,235,0.2);color:#60a5fa;border:1px solid rgba(59,130,246,0.4);padding:10px 20px;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;cursor:pointer;min-height:44px;margin-left:8px;">DOSSIER</button>`;
                }

                const card = document.createElement('div');
                card.className = 'mobile-card-item';
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-name">${escapeHtml(nomeComp)}</span>
                        <span style="padding:4px 10px;border:1px solid ${tessColor}33;background:${tessColor}1a;color:${tessColor};font-size:10px;font-weight:700;text-transform:uppercase;border-radius:4px;font-family:'Orbitron',sans-serif;">${escapeHtml(tess.stato_tesseramento)}</span>
                    </div>
                    <div class="card-details">
                        <div class="card-detail">
                            <span class="card-detail-label">C.F.</span>
                            <span class="card-detail-value" style="font-size:11px;">${escapeHtml(cf)}</span>
                        </div>
                        <div class="card-detail">
                            <span class="card-detail-label">Tessera CSEN</span>
                            <span class="card-detail-value" style="color: ${csenTextColorHex}; font-weight: 700;">${escapeHtml(csenTextStr)}</span>
                        </div>
                        <div class="card-detail">
                            <span class="card-detail-label">Copertura</span>
                            <span class="card-detail-value">${escapeHtml(tess.livello_copertura)}</span>
                        </div>
                        <div class="card-detail">
                            <span class="card-detail-label">Certificato</span>
                            <span class="card-detail-value" style="color:${certColor};font-weight:700;">${certStatus}</span>
                        </div>
                    </div>
                    ${actionHtml ? `<div class="card-actions">${actionHtml}</div>` : ''}
                `;
                cardContainer.appendChild(card);
            });
        }

        // Re-render mobile cards on resize (desktop <-> mobile switch)
        window.addEventListener('resize', function() {
            const cardContainer = document.getElementById('tesserati-mobile-cards');
            const tableWrapper = document.querySelector('#panel-tesserati .overflow-x-auto');
            if (window.innerWidth >= 1024) {
                if (cardContainer) cardContainer.style.display = 'none';
                if (tableWrapper) tableWrapper.style.display = '';
            } else {
                if (cardContainer) cardContainer.style.display = '';
                if (tableWrapper) tableWrapper.style.display = 'none';
            }
        });

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
                        dettagli: `<a href="#" onclick="stampaRicevuta('${e.id}'); return false;" class="underline hover:text-white transition-all font-bold">Ricevuta n. ${e.numero_ricevuta}/${e.anno_fiscale}</a>`,
                        isHtmlDettagli: true,
                        sortDettagli: parseInt(e.numero_ricevuta) || 0
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
                        dettagli: 'Spesa registrata',
                        sortDettagli: 0
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
                    <td class="p-4 text-gray-500 text-[10px]">${item.isHtmlDettagli ? item.dettagli : escapeHtml(item.dettagli)}</td>
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
                    .select('nome, cognome, quota_totale, tipo_adesione, anagrafiche(id, registro_tesserati(livello_copertura), registro_approvazioni(livello_copertura))')
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

                // Determina la causale dinamica del tesseramento/adesione
                let causale = `Quota associativa annuale - ${userProfile.tipo_adesione ? userProfile.tipo_adesione.replace(/_/g, ' ') : 'Socio'}`;
                if (userProfile.tipo_adesione === 'tesserato' || userProfile.tipo_adesione === 'tesserato_esterno') {
                    let livelloCopertura = 'BASE';
                    const anag = Array.isArray(userProfile.anagrafiche) ? userProfile.anagrafiche[0] : userProfile.anagrafiche;
                    if (anag) {
                        const rt = Array.isArray(anag.registro_tesserati) ? anag.registro_tesserati[0] : anag.registro_tesserati;
                        const ra = Array.isArray(anag.registro_approvazioni) ? anag.registro_approvazioni : [anag.registro_approvazioni];
                        if (rt && rt.livello_copertura) {
                            livelloCopertura = rt.livello_copertura;
                        } else {
                            const pendingTess = ra?.find(r => r && r.livello_copertura);
                            if (pendingTess && pendingTess.livello_copertura) {
                                livelloCopertura = pendingTess.livello_copertura;
                            }
                        }
                    }
                    causale = `Quota tesseramento annuale - ${livelloCopertura.replace(/_/g, ' ').toUpperCase()}`;
                }

                // 3. Inserisce la ricevuta nel database
                const { data: recData, error: recError } = await supabaseClient
                    .from('ricevute_pagamenti')
                    .insert({
                        numero_ricevuta: nextNum,
                        anno_fiscale: annoFiscale,
                        utente_id: userId,
                        importo: importo,
                        causale: causale,
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

            // Exclusivity rule for board roles (Presidente, Vice Presidente, Segretario, Tesoriere, Consigliere)
            const boardRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
            const checkboxes = document.querySelectorAll('#nomina-ruolo-select input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', (e) => {
                    if (boardRoles.includes(e.target.value) && e.target.checked) {
                        checkboxes.forEach(otherCb => {
                            if (otherCb !== e.target && boardRoles.includes(otherCb.value)) {
                                otherCb.checked = false;
                            }
                        });
                    }
                });
            });

            // Live search for tesserati
            const searchInput = document.getElementById('tesserati-search');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    renderTesseratiTable();
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

            const boardRolesSelected = ruolo.filter(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'].includes(r));
            if (boardRolesSelected.length > 1) {
                alert("Non è possibile assegnare più cariche nel direttivo contemporaneamente.");
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

        // ==========================================
        // GESTIONE CORSI E ASSEGNAZIONE ISTRUTTORI
        // ==========================================
        let currentCorsiSubTab = 'corso';

        async function switchSubTabCorsi(tipo) {
            currentCorsiSubTab = tipo;
            const corsiBtn = document.getElementById('subtab-btn-corsi');
            const eventiBtn = document.getElementById('subtab-btn-eventi');
            const orariHeader = document.getElementById('col-orari-header');
            const istruttoriHeader = document.getElementById('col-istruttori-header');
            
            if (tipo === 'corso') {
                if (corsiBtn) corsiBtn.className = "pb-2 font-headline text-xs font-bold uppercase border-b-2 border-primary text-white tracking-wide";
                if (eventiBtn) eventiBtn.className = "pb-2 font-headline text-xs font-bold uppercase border-b-2 border-transparent text-gray-500 hover:text-white tracking-wide";
                if (orariHeader) { orariHeader.classList.remove('hidden'); orariHeader.textContent = 'ORARI SETTIMANALI'; }
                if (istruttoriHeader) istruttoriHeader.textContent = 'ISTRUTTORI';
            } else {
                if (corsiBtn) corsiBtn.className = "pb-2 font-headline text-xs font-bold uppercase border-b-2 border-transparent text-gray-500 hover:text-white tracking-wide";
                if (eventiBtn) eventiBtn.className = "pb-2 font-headline text-xs font-bold uppercase border-b-2 border-primary text-white tracking-wide";
                if (orariHeader) { orariHeader.classList.remove('hidden'); orariHeader.textContent = 'GIORNATE'; }
                if (istruttoriHeader) istruttoriHeader.textContent = 'RESPONSABILI';
            }
            await loadGestioneCorsi();
        }

        async function loadGestioneCorsi() {
            const tbody = document.getElementById('corsi-list-body');
            if (!tbody) return;
            const numCols = 6;
            tbody.innerHTML = `<tr><td colspan="${numCols}" class="p-4 text-center text-gray-500">Caricamento in corso...</td></tr>`;
            try {
                // Fetch events/courses
                const { data: eventi, error } = await supabaseClient
                    .from('eventi')
                    .select('*')
                    .eq('tipo', currentCorsiSubTab)
                    .order('titolo', { ascending: true });

                if (error) throw error;
                if (!eventi || eventi.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="${numCols}" class="p-4 text-center text-gray-500">Nessun ${currentCorsiSubTab === 'corso' ? 'corso attivo' : 'evento in programma'} trovato.</td></tr>`;
                    return;
                }

                // Per visualizzare istruttori/responsabili ed iscritti facciamo fetch di supporto
                let istruttori = [];
                if (currentCorsiSubTab === 'corso') {
                    const { data: istrData, error: errIst } = await supabaseClient
                        .from('istruttori_eventi')
                        .select('*, utenti(id, nome, cognome)');
                    if (errIst) throw errIst;
                    istruttori = istrData || [];
                } else {
                    const { data: respData, error: errResp } = await supabaseClient
                        .from('responsabili_eventi')
                        .select('*, utenti(id, nome, cognome)');
                    if (errResp) throw errResp;
                    istruttori = respData || [];
                }

                const { data: iscrizioni, error: errIsc } = await supabaseClient
                    .from('iscrizioni_eventi')
                    .select('evento_id');
                if (errIsc) throw errIsc;

                tbody.innerHTML = '';
                eventi.forEach(evt => {
                    // Trova istruttori/responsabili assegnati a questo evento
                    const assegnati = istruttori
                        .filter(ie => ie.evento_id === evt.id && ie.utenti)
                        .map(ie => `${ie.utenti.nome} ${ie.utenti.cognome}`.toUpperCase());
                    
                    const istruttoriBadge = assegnati.length > 0 
                        ? assegnati.map(name => `<span class="bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 text-[9px] font-bold mr-1 inline-block">${name}</span>`).join('')
                        : '<span class="text-gray-500">NESSUNO</span>';

                    // Trova numero iscritti
                    const nIscritti = iscrizioni.filter(i => i.evento_id === evt.id).length;

                    // Formatta orari o date
                    let orariStr = '-';
                    if (evt.tipo === 'corso' && evt.orari_settimanali) {
                        try {
                            const orari = typeof evt.orari_settimanali === 'string' ? JSON.parse(evt.orari_settimanali) : evt.orari_settimanali;
                            if (Array.isArray(orari)) {
                                orariStr = orari.map(o => `${o.giorno} ${o.ora || ''}`).join(', ');
                            }
                        } catch (e) {
                            console.error("Errore parse orari:", e);
                        }
                    } else if (evt.tipo === 'evento') {
                        try {
                            if (evt.giornate && evt.giornate.length > 0) {
                                const giornate = typeof evt.giornate === 'string' ? JSON.parse(evt.giornate) : evt.giornate;
                                if (giornate.length === 1) {
                                    orariStr = `${formatDate(giornate[0].data)} ${giornate[0].ora_inizio || ''}`;
                                } else {
                                    orariStr = `${formatDate(giornate[0].data)} (+${giornate.length - 1} date)`;
                                }
                            } else if (evt.data_evento) {
                                orariStr = `${formatDate(evt.data_evento)} ${evt.ora_evento || ''}`;
                            }
                        } catch(e) {
                            console.error("Errore parse giornate:", e);
                        }
                    }

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-white/5 transition-all";
                    tr.innerHTML = `
                        <td class="p-4 font-bold text-white">
                            ${evt.titolo.toUpperCase()}
                            ${evt.link_sito ? `<a href="${evt.link_sito}" target="_blank" class="ml-2 text-primary hover:underline" title="Visita il sito dell'evento"><span class="material-symbols-outlined text-[10px] align-middle">language</span></a>` : ''}
                        </td>
                        <td class="p-4 text-gray-300">${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'}</td>
                        <td class="p-4 text-gray-400 font-mono text-[11px]">${orariStr}</td>
                        <td class="p-4">${istruttoriBadge}</td>
                        <td class="p-4 text-center font-bold text-white">${nIscritti}</td>
                        <td class="p-4 text-right">
                            <div class="flex justify-end gap-2">
                                ${currentCorsiSubTab === 'corso' ? `
                                <button onclick="openRegistroDaAdmin('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}', '${evt.luogo ? evt.luogo.replace(/'/g, "\\'") : ''}', '${orariStr.replace(/'/g, "\\'")}')" class="border border-green-500/30 bg-green-500/10 text-green-500 px-3 py-1 font-headline font-bold text-[10px] hover:bg-green-500 hover:text-white transition-all uppercase">
                                    Partecipanti
                                </button>
                                <button onclick="openModalAssegnaIstruttori('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')" class="border border-primary/30 bg-primary/10 text-primary px-3 py-1 font-headline font-bold text-[10px] hover:bg-primary hover:text-white transition-all uppercase">
                                    Istruttori
                                </button>
                                ` : `
                                <button onclick="openModalAssegnaResponsabili('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}')" class="border border-primary/30 bg-primary/10 text-primary px-3 py-1 font-headline font-bold text-[10px] hover:bg-primary hover:text-white transition-all uppercase">
                                    Responsabili
                                </button>
                                `}
                                <button onclick="editCorso('${evt.id}')" class="border border-white/20 hover:border-white text-gray-400 hover:text-white px-3 py-1 font-headline font-bold text-[10px] transition-all uppercase">
                                    Modifica
                                </button>
                                <button onclick="deleteCorso('${evt.id}')" class="border border-red-500/30 hover:border-red-500 text-red-500 px-3 py-1 font-headline font-bold text-[10px] transition-all uppercase">
                                    Elimina
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Errore loadGestioneCorsi:", err);
                const numCols = currentCorsiSubTab === 'corso' ? 6 : 5;
                tbody.innerHTML = `<tr><td colspan="${numCols}" class="p-4 text-center text-red-500">Errore: ${escapeHtml(err.message)}</td></tr>`;
            }
        }

        function openModalCorso(tipo) {
            document.getElementById('modal-corso-id').value = '';
            document.getElementById('modal-corso-tipo').value = tipo;
            document.getElementById('modal-corso-title').textContent = tipo === 'corso' ? 'NUOVO CORSO' : 'NUOVO EVENTO';
            
            document.getElementById('modal-corso-titolo').value = '';
            document.getElementById('modal-corso-descrizione').value = '';
            document.getElementById('modal-corso-luogo').value = '';
            document.getElementById('modal-corso-max-partecipanti').value = '';
            document.getElementById('modal-corso-prezzo').value = '';
            document.getElementById('modal-corso-stripe-id').value = '';
            document.getElementById('modal-corso-is-sportivo').checked = true; // Default sportivo
            
            const linkEl = document.getElementById('modal-corso-link');
            if(linkEl) linkEl.value = '';
            
            const contattiEl = document.getElementById('modal-corso-contatti');
            if(contattiEl) contattiEl.value = '';
            
            // Reset data/ora evento
            const dataEventoCont = document.getElementById('modal-evento-data-container');
            const giornateList = document.getElementById('modal-evento-giornate-list');
            if (giornateList) {
                giornateList.innerHTML = '';
            }
            if (document.getElementById('modal-evento-data')) document.getElementById('modal-evento-data').value = '';
            if (document.getElementById('modal-evento-ora')) document.getElementById('modal-evento-ora').value = '';
            
            // Popola responsabili
            loadResponsabiliSelect();

            // Reset checkbox giorni
            const checkboxes = document.querySelectorAll('.giorno-checkbox');
            checkboxes.forEach(c => c.checked = false);
            document.getElementById('modal-corso-ora').value = '';

            // Reset piani
            document.getElementById('abbonamenti-list-container').innerHTML = '';

            const orariCont = document.getElementById('modal-corso-orari-container');
            const pianiCont = document.getElementById('modal-corso-piani-container');
            
            if (tipo === 'corso') {
                if (orariCont) orariCont.classList.remove('hidden');
                if (pianiCont) pianiCont.classList.remove('hidden');
                if (dataEventoCont) dataEventoCont.classList.add('hidden');
            } else {
                if (orariCont) orariCont.classList.add('hidden');
                if (pianiCont) pianiCont.classList.add('hidden');
                if (dataEventoCont) dataEventoCont.classList.remove('hidden');
            }

            document.getElementById('modal-corso').classList.remove('hidden');
        }

        function closeModalCorso() {
            document.getElementById('modal-corso').classList.add('hidden');
        }

        function addAbbonamentoInput(nome = '', prezzo = '') {
            const container = document.getElementById('abbonamenti-list-container');
            const div = document.createElement('div');
            div.className = "flex gap-2 items-center abbonamento-row";
            div.innerHTML = `
                <input type="text" placeholder="NOME PIANO (ES. MENSILE)" value="${nome}" class="flex-1 bg-black border border-white/20 text-white p-1 text-[11px] font-mono plan-name">
                <input type="number" step="0.01" placeholder="PREZZO" value="${prezzo}" class="w-20 bg-black border border-white/20 text-white p-1 text-[11px] font-mono plan-price">
                <button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-400 font-bold px-1 text-xs">X</button>
            `;
            container.appendChild(div);
        }

        // --- NEW LOGIC FOR GIORNATE EVENTO ---
        function addGiornataInput(data = '', inizio = '', fine = '') {
            const container = document.getElementById('modal-evento-giornate-list');
            if (!container) return;
            const div = document.createElement('div');
            div.className = "flex gap-2 items-center giornata-row bg-white/5 p-2 border border-white/10 rounded-sm";
            div.innerHTML = `
                <div class="flex-1">
                    <label class="text-[8px] text-gray-500 block mb-0.5 uppercase">DATA *</label>
                    <input type="date" value="${data}" class="w-full bg-black border border-white/20 text-white p-1 text-[11px] font-mono g-data">
                </div>
                <div class="w-20">
                    <label class="text-[8px] text-gray-500 block mb-0.5 uppercase">INIZIO *</label>
                    <input type="time" value="${inizio}" class="w-full bg-black border border-white/20 text-white p-1 text-[11px] font-mono g-inizio">
                </div>
                <div class="w-20">
                    <label class="text-[8px] text-gray-500 block mb-0.5 uppercase">FINE</label>
                    <input type="time" value="${fine}" class="w-full bg-black border border-white/20 text-white p-1 text-[11px] font-mono g-fine">
                </div>
                <button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-400 font-bold px-2 mt-3 text-xs" title="Rimuovi Giornata">X</button>
            `;
            container.appendChild(div);
        }
        
        // --- NEW LOGIC FOR RESPONSABILI EVENTO ---
        function addResponsabileRow(selectedId = null) {
            const container = document.getElementById('modal-evento-responsabili-list');
            if (!container) return;

            const div = document.createElement('div');
            div.className = "flex gap-2 items-center responsabile-row bg-white/5 p-1 border border-white/10 rounded-sm mt-1";
            
            // Build options
            let optionsHtml = '<option value="">SELEZIONA RESPONSABILE</option>';
            sociDisponibiliList.forEach(s => {
                const isSelected = s.id === selectedId ? 'selected' : '';
                optionsHtml += `<option value="${s.id}" data-tel="${s.cellulare || ''}" data-email="${s.email || ''}" ${isSelected}>${(s.nome + ' ' + s.cognome).toUpperCase()}</option>`;
            });

            div.innerHTML = `
                <select class="flex-1 bg-black border border-white/20 text-white p-1 text-[11px] font-mono resp-select">
                    ${optionsHtml}
                </select>
                <button type="button" onclick="this.parentElement.remove(); updateContattiFromResponsabili();" class="text-red-500 hover:text-red-400 font-bold px-2 text-xs" title="Rimuovi Responsabile">X</button>
            `;

            container.appendChild(div);

            // Add change listener to newly created select
            const selectEl = div.querySelector('.resp-select');
            selectEl.addEventListener('change', updateContattiFromResponsabili);
        }

        window.updateContattiFromResponsabili = function() {
            const contattiEl = document.getElementById('modal-corso-contatti');
            if (!contattiEl) return;
            
            const selects = document.querySelectorAll('.resp-select');
            let text = '';
            selects.forEach(selectEl => {
                if (selectEl.selectedIndex > 0) {
                    const opt = selectEl.options[selectEl.selectedIndex];
                    const tel = opt.getAttribute('data-tel');
                    const email = opt.getAttribute('data-email');
                    if (tel || email) {
                        text += `${opt.text}: ${tel ? tel : ''} ${email ? '('+email+')' : ''}\n`;
                    }
                }
            });
            if (text) {
                contattiEl.value = text.trim();
            }
        };

        // Add listeners for + buttons
        setTimeout(() => {
            const btnAdd = document.getElementById('btn-add-giornata');
            if (btnAdd) {
                btnAdd.addEventListener('click', () => addGiornataInput());
            }
            const btnAddResp = document.getElementById('btn-add-responsabile');
            if (btnAddResp) {
                btnAddResp.addEventListener('click', () => addResponsabileRow());
            }
        }, 1000);
        
        // Load Soci for Responsabili Multi-select
        let sociDisponibiliList = [];
        async function loadResponsabiliSelect(eventoId = null) {
            const container = document.getElementById('modal-evento-responsabili-list');
            if (!container) return;
            container.innerHTML = '<p class="text-xs text-gray-500">Caricamento soci...</p>';
            
            try {
                // Prendi tutti i soci attivi
                if (sociDisponibiliList.length === 0) {
                    const { data: sociData, error } = await supabaseClient
                        .from('utenti')
                        .select('id, nome, cognome, cellulare, email, ruolo')
                        .contains('ruolo', ['socio_approvato']);
                    if (error) throw error;
                    sociDisponibiliList = sociData || [];
                    sociDisponibiliList.sort((a,b) => (a.cognome||'').localeCompare(b.cognome||''));
                }
                
                let assignedIds = [];
                if (eventoId) {
                    const { data: rel, error: relErr } = await supabaseClient
                        .from('responsabili_eventi')
                        .select('utente_id')
                        .eq('evento_id', eventoId);
                    if (!relErr && rel) {
                        assignedIds = rel.map(r => r.utente_id);
                    }
                }
                
                container.innerHTML = '';
                if (assignedIds.length > 0) {
                    assignedIds.forEach(id => addResponsabileRow(id));
                } else {
                    addResponsabileRow();
                }
                
            } catch (err) {
                console.error("Errore caricamento soci per responsabili:", err);
                container.innerHTML = '<p class="text-xs text-red-500">Errore caricamento</p>';
            }
        }

        async function editCorso(id) {
            try {
                const { data: evt, error } = await supabaseClient
                    .from('eventi')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error) throw error;

                document.getElementById('modal-corso-id').value = evt.id;
                document.getElementById('modal-corso-tipo').value = evt.tipo;
                document.getElementById('modal-corso-title').textContent = evt.tipo === 'corso' ? 'MODIFICA CORSO' : 'MODIFICA EVENTO';
                
                document.getElementById('modal-corso-titolo').value = evt.titolo;
                document.getElementById('modal-corso-descrizione').value = evt.descrizione || '';
                document.getElementById('modal-corso-luogo').value = evt.luogo || '';
                document.getElementById('modal-corso-max-partecipanti').value = evt.max_partecipanti || '';
                document.getElementById('modal-corso-prezzo').value = evt.prezzo || '';
                document.getElementById('modal-corso-stripe-id').value = evt.stripe_price_id || '';
                document.getElementById('modal-corso-is-sportivo').checked = evt.is_sportivo !== false;

                const orariCont = document.getElementById('modal-corso-orari-container');
                const pianiCont = document.getElementById('modal-corso-piani-container');
                const dataEventoCont = document.getElementById('modal-evento-data-container');

                // Reset checkbox giorni
                const checkboxes = document.querySelectorAll('.giorno-checkbox');
                checkboxes.forEach(c => c.checked = false);
                document.getElementById('modal-corso-ora').value = '';

                // Reset piani
                document.getElementById('abbonamenti-list-container').innerHTML = '';

                if (evt.tipo === 'corso') {
                    if (orariCont) orariCont.classList.remove('hidden');
                    if (pianiCont) pianiCont.classList.remove('hidden');
                    if (dataEventoCont) dataEventoCont.classList.add('hidden');

                    // Popola orari
                    if (evt.orari_settimanali) {
                        try {
                            const orari = typeof evt.orari_settimanali === 'string' ? JSON.parse(evt.orari_settimanali) : evt.orari_settimanali;
                            if (Array.isArray(orari) && orari.length > 0) {
                                orari.forEach(o => {
                                    const cb = Array.from(checkboxes).find(c => c.value === o.giorno);
                                    if (cb) cb.checked = true;
                                });
                                document.getElementById('modal-corso-ora').value = orari[0].ora || '';
                            }
                        } catch (e) {
                            console.error("Errore parse orari in edit:", e);
                        }
                    }

                    // Popola piani
                    if (evt.piani_abbonamento) {
                        try {
                            const piani = typeof evt.piani_abbonamento === 'string' ? JSON.parse(evt.piani_abbonamento) : evt.piani_abbonamento;
                            if (Array.isArray(piani)) {
                                piani.forEach(p => {
                                    addAbbonamentoInput(p.nome, p.prezzo);
                                });
                            }
                        } catch (e) {
                            console.error("Errore parse piani in edit:", e);
                        }
                    }
                } else {
                    if (orariCont) orariCont.classList.add('hidden');
                    if (pianiCont) pianiCont.classList.add('hidden');
                    if (dataEventoCont) dataEventoCont.classList.remove('hidden');
                    
                    if (document.getElementById('modal-evento-data')) document.getElementById('modal-evento-data').value = evt.data_evento || '';
                    if (document.getElementById('modal-evento-ora')) document.getElementById('modal-evento-ora').value = evt.ora_evento || '';
                    
                    const giornateList = document.getElementById('modal-evento-giornate-list');
                    if (giornateList) {
                        giornateList.innerHTML = '';
                        if (evt.giornate && evt.giornate.length > 0) {
                            const giornate = typeof evt.giornate === 'string' ? JSON.parse(evt.giornate) : evt.giornate;
                            giornate.forEach(g => addGiornataInput(g.data, g.ora_inizio, g.ora_fine));
                        } else if (evt.data_evento) {
                            addGiornataInput(evt.data_evento, evt.ora_evento || '', '');
                        }
                    }
                }
                
                const linkEl = document.getElementById('modal-corso-link');
                if (linkEl) linkEl.value = evt.link_sito || '';
                
                const contattiEl = document.getElementById('modal-corso-contatti');
                if (contattiEl) contattiEl.value = evt.contatti || '';
                
                await loadResponsabiliSelect(evt.id);

                document.getElementById('modal-corso').classList.remove('hidden');
            } catch (err) {
                alert("Errore caricamento dati corso: " + err.message);
            }
        }

        async function saveCorso() {
            const id = document.getElementById('modal-corso-id').value;
            const tipo = document.getElementById('modal-corso-tipo').value;
            const titolo = document.getElementById('modal-corso-titolo').value.trim();
            const descrizione = document.getElementById('modal-corso-descrizione').value.trim();
            const luogo = document.getElementById('modal-corso-luogo').value.trim();
            const maxPartecipantiVal = document.getElementById('modal-corso-max-partecipanti').value;
            const prezzoVal = document.getElementById('modal-corso-prezzo').value;
            const stripePriceId = document.getElementById('modal-corso-stripe-id').value.trim();
            const is_sportivo = document.getElementById('modal-corso-is-sportivo').checked;

            if (!titolo || !luogo) {
                alert("Titolo e Luogo sono obbligatori.");
                return;
            }

            const max_partecipanti = maxPartecipantiVal ? parseInt(maxPartecipantiVal) : null;
            const prezzo = prezzoVal ? parseFloat(prezzoVal) : null;

            let orari_settimanali = null;
            let piani_abbonamento = null;

            if (tipo === 'corso') {
                // Costruisci orari settimanali
                const cbs = document.querySelectorAll('.giorno-checkbox:checked');
                const ora = document.getElementById('modal-corso-ora').value;
                if (cbs.length > 0) {
                    orari_settimanali = Array.from(cbs).map(cb => ({
                        giorno: cb.value,
                        ora: ora || '00:00'
                    }));
                }

                // Costruisci piani abbonamento
                const rows = document.querySelectorAll('.abbonamento-row');
                const piani = [];
                rows.forEach(r => {
                    const nomePiano = r.querySelector('.plan-name').value.trim();
                    const prezzoPiano = parseFloat(r.querySelector('.plan-price').value);
                    if (nomePiano && !isNaN(prezzoPiano)) {
                        piani.push({ nome: nomePiano, prezzo: prezzoPiano });
                    }
                });
                if (piani.length > 0) {
                    piani_abbonamento = piani;
                }
            }

            let giornate_evento = null;
            let data_evento = null;
            let ora_evento = null;
            
            if (tipo === 'evento') {
                const giornateRows = document.querySelectorAll('.giornata-row');
                const giornate = [];
                giornateRows.forEach(r => {
                    const data = r.querySelector('.g-data').value;
                    const inizio = r.querySelector('.g-inizio').value;
                    const fine = r.querySelector('.g-fine').value;
                    if (data) {
                        giornate.push({ data, ora_inizio: inizio, ora_fine: fine });
                    }
                });
                
                if (giornate.length === 0) {
                    alert("Almeno una giornata è obbligatoria per gli eventi.");
                    return;
                }
                
                giornate_evento = giornate;
                // Mantieni data_evento e ora_evento per retrocompatibilità (usa la prima giornata)
                data_evento = giornate[0].data;
                ora_evento = giornate[0].ora_inizio || null;
            }
            
            const responsabili_selezionati = [];
            document.querySelectorAll('.resp-select').forEach(sel => {
                if (sel.value) {
                    responsabili_selezionati.push(sel.value);
                }
            });

            const link_sito = document.getElementById('modal-corso-link') ? document.getElementById('modal-corso-link').value.trim() : null;
            const contatti = document.getElementById('modal-corso-contatti') ? document.getElementById('modal-corso-contatti').value.trim() : null;

            const payload = {
                titolo,
                descrizione,
                tipo,
                luogo,
                max_partecipanti,
                prezzo,
                stripe_price_id: stripePriceId || null,
                orari_settimanali,
                piani_abbonamento,
                is_sportivo,
                data_evento,
                ora_evento,
                giornate: giornate_evento,
                link_sito,
                contatti
            };

            try {
                let savedId = id;
                if (id) {
                    // Update
                    const { error } = await supabaseClient
                        .from('eventi')
                        .update(payload)
                        .eq('id', id);
                    if (error) throw error;
                    await scriviAuditLog("MODIFICA_EVENTO", "eventi", id, payload);
                } else {
                    // Insert
                    const { data, error } = await supabaseClient
                        .from('eventi')
                        .insert(payload)
                        .select('id')
                        .single();
                    if (error) throw error;
                    savedId = data.id;
                    await scriviAuditLog("CREAZIONE_EVENTO", "eventi", data.id, payload);
                }
                
                // --- Save Responsabili ---
                if (savedId) {
                    // Delete existing first
                    await supabaseClient.from('responsabili_eventi').delete().eq('evento_id', savedId);
                    
                    // Insert new ones
                    if (responsabili_selezionati.length > 0) {
                        const relPayload = responsabili_selezionati.map(socio_id => ({
                            evento_id: savedId,
                            utente_id: socio_id
                        }));
                        const { error: relErr } = await supabaseClient.from('responsabili_eventi').insert(relPayload);
                        if (relErr) {
                            console.error("Errore salvataggio responsabili:", relErr);
                            // don't throw, let event save succeed
                        }
                    }
                }

                alert("Corso/Evento salvato con successo!");
                closeModalCorso();
                await loadGestioneCorsi();
            } catch (err) {
                alert("Errore durante il salvataggio: " + err.message);
            }
        }

        async function deleteCorso(id) {
            if (!confirm("Sei sicuro di voler eliminare questo corso/evento? Verranno eliminate tutte le iscrizioni, presenze e assegnazioni istruttori associate.")) {
                return;
            }
            try {
                const { error } = await supabaseClient
                    .from('eventi')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
                await scriviAuditLog("ELIMINAZIONE_EVENTO", "eventi", id, { id });
                alert("Corso/Evento eliminato con successo!");
                await loadGestioneCorsi();
            } catch (err) {
                alert("Errore durante l'eliminazione: " + err.message);
            }
        }

        async function openModalAssegnaIstruttori(eventoId, eventoTitolo) {
            document.getElementById('modal-assegna-evento-id').value = eventoId;
            document.getElementById('modal-assegna-istruttori-subtitle').textContent = `CORSO: ${eventoTitolo.toUpperCase()}`;
            
            const container = document.getElementById('assegna-istruttori-list');
            container.innerHTML = '<p class="text-xs text-gray-500">Caricamento istruttori...</p>';
            
            try {
                const { data: utenti, error: errUtenti } = await supabaseClient
                    .from('utenti')
                    .select('id, nome, cognome, ruolo')
                    .contains('ruolo', ['istruttore']);
                
                if (errUtenti) throw errUtenti;
                
                const istruttori = utenti || [];

                if (istruttori.length === 0) {
                    container.innerHTML = '<p class="text-xs text-gray-500">Nessun utente con ruolo Istruttore registrato.</p>';
                    document.getElementById('modal-assegna-istruttori').classList.remove('hidden');
                    return;
                }

                const { data: assegnazioni, error: errAssegna } = await supabaseClient
                    .from('istruttori_eventi')
                    .select('istruttore_id')
                    .eq('evento_id', eventoId);
                
                if (errAssegna) throw errAssegna;

                const assegnatiIds = assegnazioni.map(a => a.istruttore_id);

                container.innerHTML = '';
                istruttori.forEach(ist => {
                    const isChecked = assegnatiIds.includes(ist.id) ? 'checked' : '';
                    const label = document.createElement('label');
                    label.className = "flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-all";
                    label.innerHTML = `
                        <input type="checkbox" value="${ist.id}" ${isChecked} class="istruttore-checkbox bg-black border-white/20 text-primary focus:ring-primary">
                        <span>${ist.nome.toUpperCase()} ${ist.cognome.toUpperCase()}</span>
                    `;
                    container.appendChild(label);
                });

                document.getElementById('modal-assegna-istruttori').classList.remove('hidden');
            } catch (err) {
                alert("Errore caricamento modale assegnazione: " + err.message);
            }
        }

        function closeModalAssegnaIstruttori() {
            document.getElementById('modal-assegna-istruttori').classList.add('hidden');
        }

        async function submitAssegnaIstruttori() {
            const eventoId = document.getElementById('modal-assegna-evento-id').value;
            const checkBoxes = document.querySelectorAll('.istruttore-checkbox');
            const selectedIds = Array.from(checkBoxes).filter(cb => cb.checked).map(cb => cb.value);

            try {
                const { data: assegnazioni, error: errAssegna } = await supabaseClient
                    .from('istruttori_eventi')
                    .select('istruttore_id')
                    .eq('evento_id', eventoId);
                
                if (errAssegna) throw errAssegna;

                const currentIds = assegnazioni.map(a => a.istruttore_id);

                const daAggiungere = selectedIds.filter(id => !currentIds.includes(id));
                const daRimuovere = currentIds.filter(id => !selectedIds.includes(id));

                if (daAggiungere.length > 0) {
                    const inserts = daAggiungere.map(istId => ({
                        evento_id: eventoId,
                        istruttore_id: istId
                    }));
                    const { error } = await supabaseClient
                        .from('istruttori_eventi')
                        .insert(inserts);
                    if (error) throw error;
                }

                if (daRimuovere.length > 0) {
                    const { error } = await supabaseClient
                        .from('istruttori_eventi')
                        .delete()
                        .eq('evento_id', eventoId)
                        .in('istruttore_id', daRimuovere);
                    if (error) throw error;
                }

                await scriviAuditLog("ASSEGNAZIONE_ISTRUTTORI", "istruttori_eventi", eventoId, { aggiunti: daAggiungere, rimossi: daRimuovere });
                alert("Assegnazione istruttori salvata con successo!");
                closeModalAssegnaIstruttori();
                await loadGestioneCorsi();
            } catch (err) {
                alert("Errore salvataggio assegnazione istruttori: " + err.message);
            }
        }

        async function openModalAssegnaResponsabili(eventoId, eventoTitolo) {
            document.getElementById('modal-assegna-resp-evento-id').value = eventoId;
            document.getElementById('modal-assegna-responsabili-subtitle').textContent = `EVENTO: ${eventoTitolo.toUpperCase()}`;
            
            const container = document.getElementById('assegna-responsabili-list');
            container.innerHTML = '<p class="text-xs text-gray-500">Caricamento soci...</p>';
            
            try {
                const { data: utenti, error: errUtenti } = await supabaseClient
                    .from('utenti')
                    .select('id, nome, cognome, ruolo')
                    .contains('ruolo', ['socio_approvato']);
                
                if (errUtenti) throw errUtenti;
                
                const soci = utenti || [];

                if (soci.length === 0) {
                    container.innerHTML = '<p class="text-xs text-gray-500">Nessun utente con ruolo Socio Approvato trovato.</p>';
                    document.getElementById('modal-assegna-responsabili').classList.remove('hidden');
                    return;
                }

                const { data: assegnazioni, error: errAssegna } = await supabaseClient
                    .from('responsabili_eventi')
                    .select('utente_id')
                    .eq('evento_id', eventoId);
                
                if (errAssegna) throw errAssegna;

                const assegnatiIds = assegnazioni.map(a => a.utente_id);

                container.innerHTML = '';
                soci.forEach(soc => {
                    const isChecked = assegnatiIds.includes(soc.id) ? 'checked' : '';
                    const label = document.createElement('label');
                    label.className = "flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-all";
                    label.innerHTML = `
                        <input type="checkbox" value="${soc.id}" ${isChecked} class="responsabile-checkbox bg-black border-white/20 text-primary focus:ring-primary">
                        <span>${soc.nome.toUpperCase()} ${soc.cognome.toUpperCase()}</span>
                    `;
                    container.appendChild(label);
                });

                document.getElementById('modal-assegna-responsabili').classList.remove('hidden');
            } catch (err) {
                alert("Errore caricamento modale responsabili: " + err.message);
            }
        }

        function closeModalAssegnaResponsabili() {
            document.getElementById('modal-assegna-responsabili').classList.add('hidden');
        }

        async function submitAssegnaResponsabili() {
            const eventoId = document.getElementById('modal-assegna-resp-evento-id').value;
            const checkBoxes = document.querySelectorAll('.responsabile-checkbox');
            const selectedIds = Array.from(checkBoxes).filter(cb => cb.checked).map(cb => cb.value);

            try {
                const { data: assegnazioni, error: errAssegna } = await supabaseClient
                    .from('responsabili_eventi')
                    .select('utente_id')
                    .eq('evento_id', eventoId);
                
                if (errAssegna) throw errAssegna;

                const currentIds = assegnazioni.map(a => a.utente_id);

                const daAggiungere = selectedIds.filter(id => !currentIds.includes(id));
                const daRimuovere = currentIds.filter(id => !selectedIds.includes(id));

                if (daAggiungere.length > 0) {
                    const inserts = daAggiungere.map(uId => ({
                        evento_id: eventoId,
                        utente_id: uId
                    }));
                    const { error } = await supabaseClient
                        .from('responsabili_eventi')
                        .insert(inserts);
                    if (error) throw error;
                }

                if (daRimuovere.length > 0) {
                    const { error } = await supabaseClient
                        .from('responsabili_eventi')
                        .delete()
                        .eq('evento_id', eventoId)
                        .in('utente_id', daRimuovere);
                    if (error) throw error;
                }

                await scriviAuditLog("ASSEGNAZIONE_RESPONSABILI", "responsabili_eventi", eventoId, { aggiunti: daAggiungere, rimossi: daRimuovere });
                alert("Assegnazione responsabili salvata con successo!");
                closeModalAssegnaResponsabili();
                await loadGestioneCorsi();
            } catch (err) {
                alert("Errore salvataggio assegnazione responsabili: " + err.message);
            }
        }

        // ==========================================
        // AREA ISTRUTTORI (CORSI E REGISTRO PRESENZE)
        // ==========================================
        let instructorSelectedCourseId = null;
        let instructorStudentsData = [];
        let instructorPresencesData = {};
        let registryOpenedFromAdmin = false;

        async function loadInstructorCorsi() {
            const grid = document.getElementById('instructor-courses-grid');
            if (!grid) return;
            grid.innerHTML = '<p class="text-xs text-gray-500 uppercase col-span-full">Caricamento corsi in corso...</p>';

            try {
                if (!currentUser) return;

                // 1. Fetch assigned events
                const { data: assegnati, error: errAssegna } = await supabaseClient
                    .from('istruttori_eventi')
                    .select('*, eventi(*)')
                    .eq('istruttore_id', currentUser.id);

                if (errAssegna) throw errAssegna;

                if (!assegnati || assegnati.length === 0) {
                    grid.innerHTML = `
                        <div class="col-span-full border border-white/10 bg-black/40 p-8 text-center text-gray-500">
                            <span class="material-symbols-outlined text-3xl mb-2 text-gray-600">info</span>
                            <p class="font-headline font-bold uppercase tracking-wider text-xs">Nessun corso assegnato</p>
                            <p class="text-[10px] mt-1">Non sei stato assegnato ad alcun corso dal Consiglio Direttivo.</p>
                        </div>
                    `;
                    return;
                }

                // 2. Fetch enrollment stats for count
                const eventiIds = assegnati.map(a => a.eventi?.id).filter(Boolean);
                const { data: iscrizioni, error: errIsc } = await supabaseClient
                    .from('iscrizioni_eventi')
                    .select('evento_id, orario_libero')
                    .in('evento_id', eventiIds);
                if (errIsc) throw errIsc;

                grid.innerHTML = '';
                assegnati.forEach(a => {
                    const evt = a.eventi;
                    if (!evt) return;

                    const totalIscritti = iscrizioni.filter(i => i.evento_id === evt.id).length;
                    const orarioLiberoCount = iscrizioni.filter(i => i.evento_id === evt.id && i.orario_libero).length;

                    // Formatta orari
                    let orariStr = 'ORARIO NON SPECIFICATO';
                    if (evt.orari_settimanali) {
                        try {
                            const orari = typeof evt.orari_settimanali === 'string' ? JSON.parse(evt.orari_settimanali) : evt.orari_settimanali;
                            if (Array.isArray(orari)) {
                                orariStr = orari.map(o => `${o.giorno} ${o.ora || ''}`).join(' | ');
                            }
                        } catch (e) {
                            console.error("Errore parse orari:", e);
                        }
                    }

                    const card = document.createElement('div');
                    card.className = "border border-white/10 p-5 bg-black/40 space-y-4 hover:border-primary/50 transition-all flex flex-col justify-between";
                    card.innerHTML = `
                        <div class="space-y-2">
                            <span class="bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest">${evt.tipo}</span>
                            <h3 class="font-headline text-sm font-bold uppercase text-white">${evt.titolo.toUpperCase()}</h3>
                            <p class="text-[10px] text-gray-400 font-mono flex items-center gap-1 uppercase">
                                <span class="material-symbols-outlined text-xs">schedule</span> ${orariStr}
                            </p>
                            <p class="text-[10px] text-gray-400 font-mono flex items-center gap-1 uppercase">
                                <span class="material-symbols-outlined text-xs">location_on</span> LUOGO: ${evt.luogo ? evt.luogo.toUpperCase() : 'N/D'}
                            </p>
                            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                                <div>
                                    <span class="text-[8px] text-gray-500 font-headline">ISCRITTI TOTALI</span>
                                    <p class="font-headline font-bold text-white text-xs">${totalIscritti}</p>
                                </div>
                                <div>
                                    <span class="text-[8px] text-gray-500 font-headline">ORARIO LIBERO</span>
                                    <p class="font-headline font-bold text-yellow-500 text-xs">${orarioLiberoCount}</p>
                                </div>
                            </div>
                        </div>
                        <button onclick="openRegistroCorso('${evt.id}', '${evt.titolo.replace(/'/g, "\\'")}', '${evt.luogo ? evt.luogo.replace(/'/g, "\\'") : ''}', '${orariStr.replace(/'/g, "\\'")}')" class="w-full bg-white text-black font-headline text-xs font-bold py-2 hover:bg-primary hover:text-white transition-all uppercase tracking-wider">
                            APRI REGISTRO
                        </button>
                    `;
                    grid.appendChild(card);
                });

            } catch (err) {
                console.error("Errore loadInstructorCorsi:", err);
                grid.innerHTML = `<p class="text-xs text-red-500 uppercase col-span-full">Errore nel caricamento: ${escapeHtml(err.message)}</p>`;
            }
        }

        async function openRegistroCorso(eventoId, title, luogo, orariStr) {
            instructorSelectedCourseId = eventoId;
            document.getElementById('instructor-widget-courses').classList.add('hidden');
            document.getElementById('instructor-widget-registro').classList.remove('hidden');

            const backBtn = document.getElementById('auto-dashboard-click-46');
            if (backBtn) {
                if (registryOpenedFromAdmin) {
                    backBtn.innerHTML = `<span class="material-symbols-outlined text-xs">arrow_back</span> TORNA A GESTIONE CORSI`;
                } else {
                    backBtn.innerHTML = `<span class="material-symbols-outlined text-xs">arrow_back</span> TORNA AI MIEI CORSI`;
                }
            }

            document.getElementById('instructor-course-detail-title').textContent = title.toUpperCase();
            document.getElementById('instructor-course-detail-subtitle').textContent = `ORARIO: ${orariStr.toUpperCase()} | LUOGO: ${luogo.toUpperCase()}`;

            // Reset tabs
            toggleInstructorRegistroTab('registro');

            // Imposta data a oggi se vuota o non settata
            const dateInput = document.getElementById('instructor-presence-date');
            if (dateInput && !dateInput.value) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.value = today;
            }

            await loadRegistroIscritti();
        }

        function closeRegistroCorso() {
            instructorSelectedCourseId = null;
            document.getElementById('instructor-widget-registro').classList.add('hidden');
            if (registryOpenedFromAdmin) {
                switchTab('gestione_corsi');
                registryOpenedFromAdmin = false;
            } else {
                document.getElementById('instructor-widget-courses').classList.remove('hidden');
                loadInstructorCorsi();
            }
        }

        function toggleInstructorRegistroTab(tab) {
            const regTab = document.getElementById('instructor-tab-registro');
            const storTab = document.getElementById('instructor-tab-storico');
            const regBtn = document.getElementById('instructor-registro-tab-btn');
            const storBtn = document.getElementById('instructor-storico-tab-btn');

            if (tab === 'registro') {
                if (regTab) regTab.classList.remove('hidden');
                if (storTab) storTab.classList.add('hidden');
                if (regBtn) regBtn.className = "px-3 py-1.5 font-headline text-xs font-bold uppercase bg-primary text-white transition-all";
                if (storBtn) storBtn.className = "px-3 py-1.5 font-headline text-xs font-bold uppercase text-gray-400 hover:text-white transition-all";
                loadRegistroIscritti();
            } else {
                if (regTab) regTab.classList.add('hidden');
                if (storTab) storTab.classList.remove('hidden');
                if (regBtn) regBtn.className = "px-3 py-1.5 font-headline text-xs font-bold uppercase text-gray-400 hover:text-white transition-all";
                if (storBtn) storBtn.className = "px-3 py-1.5 font-headline text-xs font-bold uppercase bg-primary text-white transition-all";
                loadStoricoPresenze();
            }
        }

        window.modificaScadenzaCorso = async function(iscrizioneId, nuovaData) {
            try {
                const { error } = await supabaseClient
                    .from('iscrizioni_eventi')
                    .update({
                        data_scadenza_corso: nuovaData || null,
                        scadenza_modificata_a_mano: true
                    })
                    .eq('id', iscrizioneId);

                if (error) throw error;
                await loadRegistroIscritti();
            } catch (err) {
                console.error("Errore aggiornamento scadenza:", err);
                alert("Errore durante l'aggiornamento: " + err.message);
            }
        };

        async function onPresenceDateChange() {
            await loadRegistroIscritti();
        }

        async function loadRegistroIscritti() {
            if (!instructorSelectedCourseId) return;

            const tbody = document.getElementById('instructor-iscritti-body');
            const countDisplay = document.getElementById('instructor-presence-count');
            const dateInput = document.getElementById('instructor-presence-date');

            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">Caricamento iscritti...</td></tr>';

            const dataSelezionata = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

            try {
                // 1. Fetch from VIEW
                const { data: atleti, error: errAtleti } = await supabaseClient
                    .from('vw_stato_atleta_corso')
                    .select('*')
                    .eq('evento_id', instructorSelectedCourseId)
                    .order('cognome', { ascending: true });

                if (errAtleti) throw errAtleti;

                // 2. Fetch presences for selected date
                const { data: presenze, error: errPresenze } = await supabaseClient
                    .from('presenze_eventi')
                    .select('utente_id, presente')
                    .eq('evento_id', instructorSelectedCourseId)
                    .eq('data_lezione', dataSelezionata);

                if (errPresenze) throw errPresenze;

                instructorStudentsData = atleti || [];
                instructorPresencesData = {};
                presenze.forEach(p => {
                    instructorPresencesData[p.utente_id] = p.presente;
                });

                if (instructorStudentsData.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500">Nessun atleta iscritto a questo corso.</td></tr>';
                    if (countDisplay) countDisplay.textContent = '0 / 0';
                    return;
                }

                tbody.innerHTML = '';
                let presentiCount = 0;

                instructorStudentsData.forEach(atl => {
                    const isPresente = instructorPresencesData[atl.utente_id] === true;
                    if (isPresente) presentiCount++;

                    // Warning per certificato non valido
                    const warningStyle = !atl.cert_valido ? 'border-l-4 border-red-500 bg-red-500/5' : '';
                    const certTooltip = !atl.cert_valido ? 'title="⚠ CERTIFICATO MEDICO NON IN REGOLA O SCADUTO"' : '';

                    // Badge Rendering
                    const badgeOrario = atl.orario_libero 
                        ? '<span class="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 text-[9px] font-bold">ORARIO LIBERO</span>'
                        : '<span class="bg-gray-500/10 text-gray-400 border border-gray-500/20 px-2 py-0.5 text-[9px] font-bold">ORARIO CORSO</span>';

                    const badgeQuotaCorso = atl.stato_pagamento === 'PAGATO'
                        ? '<span class="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 text-[9px] font-bold">PAGATO</span>'
                        : (atl.stato_pagamento === 'GRATUITO' ? '<span class="bg-gray-500/10 text-gray-400 border border-gray-500/20 px-2 py-0.5 text-[9px] font-bold">GRATUITO</span>' : '<span class="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 text-[9px] font-bold">DA PAGARE</span>');

                    const badgeCsen = atl.stato_tesseramento === 'ATTIVO'
                        ? '<span class="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 text-[9px] font-bold">ATTIVO</span>'
                        : (atl.stato_tesseramento === 'SOSPESO' ? '<span class="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 text-[9px] font-bold">SOSPESO</span>' : '<span class="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 text-[9px] font-bold">SCADUTO</span>');

                    // Scadenza corso editabile per istruttore
                    const scadenzaVal = atl.data_scadenza_corso || '';
                    const handIcon = atl.scadenza_modificata_a_mano ? ' ✋' : '';
                    const courseBarHtml = generateProgressBarHtml(scadenzaVal);
                    const scadenzaHtml = `
                        <div class="flex flex-col items-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="date" value="${scadenzaVal}" onchange="modificaScadenzaCorso('${atl.iscrizione_id}', this.value)" class="bg-black text-white text-[10px] p-1 border border-white/20 font-mono focus:outline-none focus:border-primary rounded-none" />
                                <span title="Modificata a mano" class="text-xs font-sans">${handIcon}</span>
                            </div>
                            ${courseBarHtml}
                        </div>
                    `;

                    // Certificato Semaforo
                    let semaforoCert = '';
                    let testoScadenza = 'MANCANTE';
                    if (atl.cert_scadenza) {
                        const parts = atl.cert_scadenza.split('-');
                        if (parts.length === 3) {
                            testoScadenza = `${parts[2]}/${parts[1]}/${parts[0]}`;
                        } else {
                            testoScadenza = atl.cert_scadenza;
                        }
                    }
                    
                    const certBarHtml = generateProgressBarHtml(atl.cert_scadenza);

                    if (atl.cert_stato === 'VERDE' && atl.cert_valido) {
                        semaforoCert = `
                            <div class="flex flex-col items-center">
                                <span class="text-green-500 font-bold" title="VALIDO">🟢 ${testoScadenza}</span>
                                ${certBarHtml}
                            </div>
                        `;
                    } else if (atl.cert_stato === 'GIALLO' || atl.cert_stato === 'IN_ATTESA') {
                        semaforoCert = `
                            <div class="flex flex-col items-center">
                                <span class="text-yellow-500 font-bold" title="IN VALIDAZIONE / SOSPESO">🟡 ${testoScadenza}</span>
                                ${certBarHtml}
                            </div>
                        `;
                    } else {
                        semaforoCert = `
                            <div class="flex flex-col items-center">
                                <span class="text-red-500 font-bold" title="SCADUTO O MANCANTE">🔴 ${testoScadenza}</span>
                                ${certBarHtml}
                            </div>
                        `;
                    }

                    const checked = isPresente ? 'checked' : '';

                    const tr = document.createElement('tr');
                    tr.className = `hover:bg-white/5 transition-all ${warningStyle}`;
                    tr.setAttribute('data-atleta-id', atl.utente_id);
                    tr.innerHTML = `
                        <td class="p-4 font-bold text-white uppercase flex items-center gap-2" ${certTooltip}>
                            ${!atl.cert_valido ? '<span class="text-red-500 font-bold">⚠</span>' : ''}
                            ${atl.nome.toUpperCase()} ${atl.cognome.toUpperCase()}
                        </td>
                        <td class="p-4 text-center">${badgeOrario}</td>
                        <td class="p-4 text-center">${badgeQuotaCorso}</td>
                        <td class="p-4 text-center">${badgeCsen}</td>
                        <td class="p-4 text-center">${scadenzaHtml}</td>
                        <td class="p-4 text-center font-mono text-[11px]">${semaforoCert}</td>
                        <td class="p-4 text-center">
                            <input type="checkbox" ${checked} onchange="updatePresenceCount()" class="presence-toggle-chk form-checkbox h-4 w-4 bg-black border-white/20 text-primary focus:ring-primary">
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                if (countDisplay) countDisplay.textContent = `${presentiCount} / ${instructorStudentsData.length}`;

            } catch (err) {
                console.error("Errore loadRegistroIscritti:", err);
                tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">Errore: ${escapeHtml(err.message)}</td></tr>`;
            }
        }

        function updatePresenceCount() {
            const chks = document.querySelectorAll('.presence-toggle-chk');
            const total = chks.length;
            const checked = Array.from(chks).filter(c => c.checked).length;
            const countDisplay = document.getElementById('instructor-presence-count');
            if (countDisplay) {
                countDisplay.textContent = `${checked} / ${total}`;
            }
        }

        async function savePresenze() {
            if (!instructorSelectedCourseId) return;

            const dateInput = document.getElementById('instructor-presence-date');
            if (!dateInput || !dateInput.value) {
                alert("Data lezione non valida.");
                return;
            }

            const btn = document.querySelector('button[onclick="savePresenze()"]');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'SALVATAGGIO IN CORSO...';
            }

            const dataLezione = dateInput.value;
            const rows = document.querySelectorAll('#instructor-iscritti-body tr[data-atleta-id]');
            const upserts = [];

            rows.forEach(r => {
                const utenteId = r.getAttribute('data-atleta-id');
                const presente = r.querySelector('.presence-toggle-chk').checked;
                upserts.push({
                    evento_id: instructorSelectedCourseId,
                    utente_id: utenteId,
                    data_lezione: dataLezione,
                    presente: presente,
                    registrato_da: currentUser.id
                });
            });

            try {
                const { error } = await supabaseClient
                    .from('presenze_eventi')
                    .upsert(upserts, { onConflict: 'evento_id,utente_id,data_lezione' });

                if (error) throw error;

                await scriviAuditLog("REGISTRAZIONE_PRESENZE", "presenze_eventi", instructorSelectedCourseId, { data: dataLezione, count: upserts.length });
                alert("Presenze registrate con successo!");
                await loadRegistroIscritti();
            } catch (err) {
                alert("Errore nel salvataggio delle presenze: " + err.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'SALVA PRESENZE';
                }
            }
        }

        async function loadStoricoPresenze() {
            if (!instructorSelectedCourseId) return;

            const tbody = document.getElementById('instructor-storico-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Caricamento storico...</td></tr>';

            try {
                const { data: presenze, error } = await supabaseClient
                    .from('presenze_eventi')
                    .select('data_lezione, presente, registrato_da, utenti:utenti!presenze_eventi_registrato_da_fkey(nome, cognome)')
                    .eq('evento_id', instructorSelectedCourseId)
                    .order('data_lezione', { ascending: false });

                if (error) throw error;

                if (!presenze || presenze.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nessuna lezione registrata in precedenza.</td></tr>';
                    return;
                }

                const dateGroup = {};
                presenze.forEach(p => {
                    const d = p.data_lezione;
                    if (!dateGroup[d]) {
                        dateGroup[d] = {
                            presenti: 0,
                            assenti: 0,
                            registratoDa: p.utenti ? `${p.utenti.nome} ${p.utenti.cognome}`.toUpperCase() : 'N/D'
                        };
                    }
                    if (p.presente) dateGroup[d].presenti++;
                    else dateGroup[d].assenti++;
                });

                tbody.innerHTML = '';
                Object.keys(dateGroup).forEach(dateStr => {
                    const stat = dateGroup[dateStr];
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-white/5 transition-all";
                    tr.innerHTML = `
                        <td class="p-4 font-bold text-white font-mono">${dateStr}</td>
                        <td class="p-4 text-center text-green-500 font-bold">${stat.presenti}</td>
                        <td class="p-4 text-center text-gray-500">${stat.assenti}</td>
                        <td class="p-4 text-gray-400">${stat.registratoDa}</td>
                        <td class="p-4 text-right">
                            <button onclick="loadPresenzaDataStorico('${dateStr}')" class="border border-white/20 text-white font-headline text-[10px] font-bold px-3 py-1 hover:bg-white hover:text-black transition-all uppercase">
                                Modifica Presenze
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

            } catch (err) {
                console.error("Errore loadStoricoPresenze:", err);
                tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Errore: ${escapeHtml(err.message)}</td></tr>`;
            }
        }

        function loadPresenzaDataStorico(dataStr) {
            const dateInput = document.getElementById('instructor-presence-date');
            if (dateInput) {
                dateInput.value = dataStr;
            }
            toggleInstructorRegistroTab('registro');
        }

        // Tab Switching Logic
        function switchTab(tabId) {
            // Nasconde tutti i pannelli
            const panels = document.querySelectorAll('.tab-panel');
            panels.forEach(p => p.classList.add('hidden'));

            // Mostra il pannello attivo
            document.getElementById(`panel-${tabId}`).classList.remove('hidden');

            // Hook per caricamento dati
            if (tabId === 'gestione_corsi') {
                loadGestioneCorsi();
            } else if (tabId === 'instructor_corsi') {
                loadInstructorCorsi();
            } else if (tabId === 'registro_istruttori') {
                loadRegistroIstruttori();
            } else if (tabId === 'registro_volontari') {
                loadRegistroVolontari();
            } else if (tabId === 'user_corsi' || tabId === 'user_eventi') {
                loadUserEventi();
            } else if (tabId === 'logiche') {
                setTimeout(() => {
                    if (window.mermaid) {
                        try {
                            window.mermaid.init(undefined, ".mermaid");
                        } catch (e) {
                            console.error("Mermaid render error:", e);
                        }
                    }
                }, 50);
            }

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
                const cert = getCertInfo(anag);
                
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
                    const scaduto = isCertificatoScaduto(currentCert.data_scadenza);
                    
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

                let filteredEventiList = eventiList;
                if (currentViewContext === 'member') {
                    filteredEventiList = eventiList.filter(e => !e.is_sportivo);
                }

                const corsiList = filteredEventiList.filter(e => e.tipo === 'corso');
                const eventiInProg = filteredEventiList.filter(e => e.tipo === 'evento');

                const renderCard = (ev) => {
                    const dataFormat = new Date(ev.data_evento).toLocaleDateString('it-IT');
                    const isIscritto = activeIscr.some(i => i.evento_id === ev.id);
                    
                    let prezzo = parseFloat(ev.prezzo) || 0;
                    let selectHtml = '';

                    if (ev.piani_abbonamento && Array.isArray(ev.piani_abbonamento) && ev.piani_abbonamento.length > 0) {
                        const firstPiano = ev.piani_abbonamento[0];
                        prezzo = parseFloat(firstPiano.prezzo) || 0;

                        const todayStr = new Date().toISOString().split('T')[0];
                        selectHtml = `
                            <div class="mt-2 flex flex-col space-y-1">
                                <label class="text-[8px] text-gray-500 font-mono uppercase tracking-wider">PIANO ABBONAMENTO</label>
                                <select id="plan-select-${ev.id}" onchange="aggiornaPrezzoCard('${ev.id}')" class="w-full bg-black text-white text-[11px] p-2 border border-white/20 font-mono uppercase focus:outline-none focus:border-primary rounded-none">
                                    ${ev.piani_abbonamento.map(p => `<option value="${p.nome}" data-price="${p.prezzo}">${p.nome} - €${p.prezzo}</option>`).join('')}
                                </select>
                            </div>
                            <div class="mt-2 flex flex-col space-y-1">
                                <label class="text-[8px] text-gray-500 font-mono uppercase tracking-wider">DATA INIZIO CORSO</label>
                                <input type="date" id="course-start-${ev.id}" value="${todayStr}" class="w-full bg-black text-white text-[11px] p-2 border border-white/20 font-mono focus:outline-none focus:border-primary rounded-none" />
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
                            const currentExpiry = iscr.data_scadenza_corso;
                            let nextStartStr = '';
                            if (currentExpiry) {
                                const d = new Date(currentExpiry);
                                d.setDate(d.getDate() + 1);
                                nextStartStr = d.toISOString().split('T')[0];
                            } else {
                                nextStartStr = new Date().toISOString().split('T')[0];
                            }

                            const scadenzaLabel = currentExpiry 
                                ? new Date(currentExpiry).toLocaleDateString('it-IT')
                                : 'DA DEFINIRE';

                            return `
                                <div class="border-l-4 border-green-500 bg-white/5 p-4 space-y-2 uppercase font-mono">
                                    <div class="flex justify-between items-center text-[10px]">
                                        <span class="text-gray-400 font-bold">Scadenza: ${scadenzaLabel}</span>
                                        <span class="text-green-500 font-bold">${iscr.stato_pagamento}</span>
                                    </div>
                                    <h4 class="font-headline text-xs font-bold text-white">${escapeHtml(ev.titolo)}</h4>
                                    <p class="text-[9px] text-gray-500">Luogo: ${escapeHtml(ev.luogo || 'Sede Club')}</p>
                                    <label class="flex items-center gap-2 mt-2 text-[10px] text-gray-300 cursor-pointer hover:text-white transition-all normal-case font-sans">
                                        <input type="checkbox" onchange="toggleOrarioLibero('${ev.id}', this.checked)" ${iscr.orario_libero ? 'checked' : ''} class="bg-black border-white/20 text-primary focus:ring-primary">
                                        <span>Orario Libero (svolgo il programma fuori orario)</span>
                                    </label>
                                    <div class="mt-2 flex flex-col space-y-1">
                                        <label class="text-[8px] text-gray-500 font-mono uppercase tracking-wider">DATA INIZIO RINNOVO</label>
                                        <input type="date" id="course-start-renew-${ev.id}" value="${nextStartStr}" class="bg-black text-white text-[10px] p-1 border border-white/20 font-mono focus:outline-none focus:border-primary rounded-none" />
                                    </div>
                                    <div class="mt-4 flex gap-2 pt-2 border-t border-white/5">
                                        <button onclick="iscrivitiEvento('${ev.id}', ${parseFloat(ev.prezzo) || 0}, true)" class="flex-1 bg-white text-black text-[9px] font-headline font-bold py-1.5 uppercase hover:bg-green-500 hover:text-white transition-all tracking-wider">RINNOVA</button>
                                        <button onclick="disiscriviCorso('${iscr.id}', '${escapeHtml(ev.titolo).replace(/'/g, "\\'")}')" class="flex-1 bg-primary/10 border border-primary/30 text-primary text-[9px] font-headline font-bold py-1.5 uppercase hover:bg-primary hover:text-white transition-all tracking-wider">CANCELLATI</button>
                                    </div>
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

        window.toggleOrarioLibero = async function(eventoId, value) {
            try {
                if (!currentUser) return;
                const { error } = await supabaseClient
                    .from('iscrizioni_eventi')
                    .update({ orario_libero: value })
                    .eq('evento_id', eventoId)
                    .eq('utente_id', currentUser.id);
                if (error) throw error;
            } catch (err) {
                console.error("Errore salvataggio orario libero:", err);
                alert("Errore durante il salvataggio: " + err.message);
            }
        };

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

        async function iscrivitiEvento(eventoId, prezzo, renew = false) {
            try {
                const select = document.getElementById(`plan-select-${eventoId}`);
                let prezzoCorrente = prezzo;
                let nomePiano = null;
                if (select) {
                    nomePiano = select.value;
                    const selectedOption = select.options[select.selectedIndex];
                    prezzoCorrente = parseFloat(selectedOption.getAttribute('data-price')) || 0;
                }

                // Get the start date input value (either for renewal or new registration)
                const dateInput = document.getElementById(renew ? `course-start-renew-${eventoId}` : `course-start-${eventoId}`);
                const dataInizioCorso = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

                if (prezzoCorrente === 0) {
                    if (!confirm("Confermi l'iscrizione a questo corso/evento gratuito?")) return;
                }

                const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
                if (!token) {
                    alert("Sessione non valida. Effettua nuovamente il login.");
                    return;
                }

                // If a date input was present, it's a course, so let's validate against tesseramento date
                if (dateInput) {
                    const isBoard = userRoles.some(r => ['presidente', 'vice_presidente', 'segretario', 'tesoriere'].includes(r));
                    if (!isBoard) {
                        // Fetch user's profile and tesseramento details
                        const { data: profile } = await supabaseClient
                            .from('utenti')
                            .select('anagrafiche(id, registro_tesserati(data_richiesta_tesseramento, stato_tesseramento))')
                            .eq('id', currentUser.id)
                            .maybeSingle();

                        const anag = Array.isArray(profile?.anagrafiche) ? profile.anagrafiche[0] : profile?.anagrafiche;
                        const rt = anag?.registro_tesserati;
                        if (!rt || rt.stato_tesseramento !== 'ATTIVO') {
                            alert("Devi avere un tesseramento attivo per iscriverti a questo corso.");
                            return;
                        }

                        if (rt.data_richiesta_tesseramento) {
                            const startD = new Date(dataInizioCorso);
                            const tessD = new Date(rt.data_richiesta_tesseramento);
                            if (startD < tessD) {
                                alert(`La data di inizio corso (${dataInizioCorso}) non può essere antecedente alla data del tesseramento (${rt.data_richiesta_tesseramento}).`);
                                return;
                            }
                        }
                    }
                }

                const res = await fetch(`${APP_CONFIG.API_BASE_URL || ""}/api/create-event-checkout-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ eventId: eventoId, nomePiano: nomePiano, renew: renew, dataInizioCorso: dataInizioCorso })
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

        async function disiscriviCorso(iscrizioneId, titolo) {
            if (!confirm(`Sei sicuro di volerti cancellare dal corso "${titolo}"?`)) return;
            try {
                const { error } = await supabaseClient
                    .from('iscrizioni_eventi')
                    .delete()
                    .eq('id', iscrizioneId);

                if (error) throw error;

                alert(`Cancellazione dal corso "${titolo}" completata con successo.`);
                await loadUserEventi();
            } catch (err) {
                console.error("Errore disiscrizione corso:", err);
                alert("Errore durante la cancellazione: " + err.message);
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

        // Carica stato tessere CSEN
        async function triggerCsenScraper() {
            try {
                const icon = document.getElementById('csen-sync-icon');
                if (icon) icon.classList.add('animate-spin');
                
                alert("Ho inviato il comando di aggiornamento! L'operazione richiede circa 45 secondi. I dati si aggiorneranno automaticamente alla fine.");
                
                // Chiama la nostra serverless function su Vercel
                const res = await fetch('/api/trigger-csen', { method: 'POST' });
                if (!res.ok) throw new Error("Errore nell'API trigger-csen");

                // Aspetta 50 secondi e poi aggiorna i dati a schermo
                setTimeout(() => {
                    fetchCsenStatus();
                    if (icon) icon.classList.remove('animate-spin');
                    alert("Aggiornamento CSEN completato!");
                }, 50000);

            } catch(e) {
                console.error(e);
                alert("Si è verificato un errore durante l'avvio dell'aggiornamento.");
                const icon = document.getElementById('csen-sync-icon');
                if (icon) icon.classList.remove('animate-spin');
            }
        }
        async function fetchCsenStatus() {
            try {
                // Nessun blocco dev mode qui
                const { data, error } = await supabaseClient.from('csen_status').select('*').eq('id', 1).single();
                if (error && error.code !== 'PGRST116') {
                    console.error("Errore fetch CSEN status:", error);
                    return;
                }
                
                const silverEl = document.getElementById('csen-silver');
                const goldEl = document.getElementById('csen-gold');
                const intaEl = document.getElementById('csen-inta');
                const intbEl = document.getElementById('csen-intb');

                if (data) {
                    silverEl.textContent = data.base_silver;
                    goldEl.textContent = data.base_gold;
                    intaEl.textContent = data.integrativa_a;
                    intbEl.textContent = data.integrativa_b;
                } else {
                    silverEl.textContent = '0';
                    goldEl.textContent = '0';
                    intaEl.textContent = '0';
                    intbEl.textContent = '0';
                }
                silverEl.classList.remove('animate-pulse');
                goldEl.classList.remove('animate-pulse');
                intaEl.classList.remove('animate-pulse');
                intbEl.classList.remove('animate-pulse');
            } catch (err) {
                console.error("Errore fetch CSEN status catch:", err);
            }
        }

        // Start checking session immediately
        fetchCsenStatus();
        checkSession();
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('context-switcher');
    if (el) {
        el.addEventListener('change', function(event) {
            switchContext(this.value)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-1');
    if (el) {
        el.addEventListener('click', function(event) {
            handleLogout()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-panoramica');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('panoramica')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-user_profilo');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('user_profilo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-user_certificato');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('user_certificato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-user_corsi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('user_corsi')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-user_eventi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('user_eventi')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-instructor_corsi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('instructor_corsi')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-volunteer_eventi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('volunteer_eventi')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-user_pagamenti');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('user_pagamenti')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-approvazioni');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('approvazioni')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-soci');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('soci')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-tesserati');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('tesserati')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-registro_istruttori');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('registro_istruttori')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-registro_volontari');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('registro_volontari')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-quote');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('quote')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-gestione_corsi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('gestione_corsi')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-contabilita');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('contabilita')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-direttivo');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('direttivo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-verbali');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('verbali')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-verbali_assemblea');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('verbali_assemblea')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-bilanci');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('bilanci')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-logiche');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('logiche')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-taratura_pdf');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('taratura_pdf');
            initTunerPDF();
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tab-btn-sandbox');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('sandbox');
            initSandboxDocumenti();
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-2');
    if (el) {
        el.addEventListener('click', function(event) {
            switchTab('approvazioni')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-3');
    if (el) {
        el.addEventListener('click', function(event) {
            document.getElementById('dash_cert_file').click()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-upload-cert-dash');
    if (el) {
        el.addEventListener('click', function(event) {
            uploadCertificatoDashboard()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-4');
    if (el) {
        el.addEventListener('click', function(event) {
            vaiAlPagamento()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-5');
    if (el) {
        el.addEventListener('click', function(event) {
            alert('File Statuto in corso di caricamento sul server.')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-6');
    if (el) {
        el.addEventListener('click', function(event) {
            alert('File Regolamento in corso di caricamento sul server.')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-7');
    if (el) {
        el.addEventListener('click', function(event) {
            alert('File Scarico Responsabilità in corso di caricamento sul server.')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-8');
    if (el) {
        el.addEventListener('click', function(event) {
            sortSoci('id_socio')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-9');
    if (el) {
        el.addEventListener('click', function(event) {
            sortSoci('nominativo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-10');
    if (el) {
        el.addEventListener('click', function(event) {
            sortSoci('codice_fiscale')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-11');
    if (el) {
        el.addEventListener('click', function(event) {
            sortSoci('data_domanda')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-12');
    if (el) {
        el.addEventListener('click', function(event) {
            sortSoci('quota_scadenza')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-13');
    if (el) {
        el.addEventListener('click', function(event) {
            sortSoci('stato_socio')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-14');
    if (el) {
        el.addEventListener('click', function(event) {
            triggerCsenScraper()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-15');
    if (el) {
        el.addEventListener('click', function(event) {
            esportaCSEN()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-16');
    if (el) {
        el.addEventListener('click', function(event) {
            sortTesserati('id_tesserato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-17');
    if (el) {
        el.addEventListener('click', function(event) {
            sortTesserati('nominativo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-18');
    if (el) {
        el.addEventListener('click', function(event) {
            sortTesserati('numero_tessera_csen')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-19');
    if (el) {
        el.addEventListener('click', function(event) {
            sortTesserati('livello_copertura')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-20');
    if (el) {
        el.addEventListener('click', function(event) {
            sortTesserati('certificato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-21');
    if (el) {
        el.addEventListener('click', function(event) {
            sortTesserati('stato_tesseramento')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-22');
    if (el) {
        el.addEventListener('click', function(event) {
            sortQuote('nominativo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-23');
    if (el) {
        el.addEventListener('click', function(event) {
            sortQuote('tipo_adesione')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-24');
    if (el) {
        el.addEventListener('click', function(event) {
            sortQuote('quota_totale')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-25');
    if (el) {
        el.addEventListener('click', function(event) {
            sortQuote('quota_scadenza')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-26');
    if (el) {
        el.addEventListener('click', function(event) {
            sortQuote('stato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-crea-verbale-toggle');
    if (el) {
        el.addEventListener('click', function(event) {
            showNewVerbaleModal()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-nomina-direttivo-toggle');
    if (el) {
        el.addEventListener('click', function(event) {
            showNominaDirettivoModal()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-27');
    if (el) {
        el.addEventListener('click', function(event) {
            sortDirettivo('nominativo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-28');
    if (el) {
        el.addEventListener('click', function(event) {
            sortDirettivo('codice_fiscale')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-29');
    if (el) {
        el.addEventListener('click', function(event) {
            sortDirettivo('email')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-30');
    if (el) {
        el.addEventListener('click', function(event) {
            sortDirettivo('ruolo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-crea-verbale-assemblea-toggle');
    if (el) {
        el.addEventListener('click', function(event) {
            showNewVerbaleAssembleaModal()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-nuovo-bilancio-toggle');
    if (el) {
        el.addEventListener('click', function(event) {
            showNuovoBilancioModal()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-31');
    if (el) {
        el.addEventListener('click', function(event) {
            sortBilanci('anno')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-32');
    if (el) {
        el.addEventListener('click', function(event) {
            sortBilanci('titolo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-33');
    if (el) {
        el.addEventListener('click', function(event) {
            sortBilanci('entrate')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-34');
    if (el) {
        el.addEventListener('click', function(event) {
            sortBilanci('uscite')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-35');
    if (el) {
        el.addEventListener('click', function(event) {
            sortBilanci('avanzo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-36');
    if (el) {
        el.addEventListener('click', function(event) {
            sortBilanci('stato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-nuova-spesa-toggle');
    if (el) {
        el.addEventListener('click', function(event) {
            showNuovaSpesaModal()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-37');
    if (el) {
        el.addEventListener('click', function(event) {
            sortContabilita('data')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-38');
    if (el) {
        el.addEventListener('click', function(event) {
            sortContabilita('tipo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-39');
    if (el) {
        el.addEventListener('click', function(event) {
            sortContabilita('causale')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-40');
    if (el) {
        el.addEventListener('click', function(event) {
            sortContabilita('soggetto')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-41');
    if (el) {
        el.addEventListener('click', function(event) {
            sortContabilita('importo')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-66');
    if (el) {
        el.addEventListener('click', function(event) {
            sortContabilita('dettagli')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-42');
    if (el) {
        el.addEventListener('click', function(event) {
            openModalCorso('corso')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-43');
    if (el) {
        el.addEventListener('click', function(event) {
            openModalCorso('evento')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('subtab-btn-corsi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchSubTabCorsi('corso')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('subtab-btn-eventi');
    if (el) {
        el.addEventListener('click', function(event) {
            switchSubTabCorsi('evento')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('user-avatar-file');
    if (el) {
        el.addEventListener('change', function(event) {
            previewAndUploadAvatar()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-44');
    if (el) {
        el.addEventListener('click', function(event) {
            document.getElementById('user-avatar-file').click()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('form-user-password');
    if (el) {
        el.addEventListener('submit', function(event) {
            event.preventDefault();
            updateUserPassword(event)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('form-user-profilo');
    if (el) {
        el.addEventListener('submit', function(event) {
            event.preventDefault();
            saveUserProfilo(event)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-45');
    if (el) {
        el.addEventListener('click', function(event) {
            document.getElementById('user-new-cert-file').click()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('user-new-cert-file');
    if (el) {
        el.addEventListener('change', function(event) {
            handleNewCertFileSelected()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-user-upload-cert');
    if (el) {
        el.addEventListener('click', function(event) {
            uploadNewCertificate()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-46');
    if (el) {
        el.addEventListener('click', function(event) {
            closeRegistroCorso()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('instructor-registro-tab-btn');
    if (el) {
        el.addEventListener('click', function(event) {
            toggleInstructorRegistroTab('registro')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('instructor-storico-tab-btn');
    if (el) {
        el.addEventListener('click', function(event) {
            toggleInstructorRegistroTab('storico')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('instructor-presence-date');
    if (el) {
        el.addEventListener('change', function(event) {
            onPresenceDateChange()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-47');
    if (el) {
        el.addEventListener('click', function(event) {
            savePresenze()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-48');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalApprovazione()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-49');
    if (el) {
        el.addEventListener('click', function(event) {
            submitApprovazione()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('step-tab-1');
    if (el) {
        el.addEventListener('click', function(event) {
            goToStep(1)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('step-tab-2');
    if (el) {
        el.addEventListener('click', function(event) {
            goToStep(2)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('step-tab-3');
    if (el) {
        el.addEventListener('click', function(event) {
            goToStep(3)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('step-tab-4');
    if (el) {
        el.addEventListener('click', function(event) {
            goToStep(4)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('votazione-punto-1-tipo');
    if (el) {
        el.addEventListener('change', function(event) {
            toggleVotiPunto1(this.value)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-50');
    if (el) {
        el.addEventListener('click', function(event) {
            aggiungiPuntoAggiuntivo()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-51');
    if (el) {
        el.addEventListener('click', function(event) {
            stampaVerbale()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-52');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalVerbale()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-wizard-prev');
    if (el) {
        el.addEventListener('click', function(event) {
            navigateWizard(-1)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-wizard-next');
    if (el) {
        el.addEventListener('click', function(event) {
            navigateWizard(1)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('btn-wizard-submit');
    if (el) {
        el.addEventListener('click', function(event) {
            concludiEInviaVerbale()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-53');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalVerbaleAssemblea()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-54');
    if (el) {
        el.addEventListener('click', function(event) {
            submitVerbaleAssemblea()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('bilancio-entrate');
    if (el) {
        el.addEventListener('input', function(event) {
            calcolaAvanzo()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('bilancio-uscite');
    if (el) {
        el.addEventListener('input', function(event) {
            calcolaAvanzo()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-55');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalBilancio()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-56');
    if (el) {
        el.addEventListener('click', function(event) {
            submitBilancio()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-57');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalNominaDirettivo()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-58');
    if (el) {
        el.addEventListener('click', function(event) {
            submitNominaDirettivo()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-59');
    if (el) {
        el.addEventListener('click', function(event) {
            addAbbonamentoInput()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-60');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalCorso()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-61');
    if (el) {
        el.addEventListener('click', function(event) {
            saveCorso()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-62');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalAssegnaIstruttori()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-63');
    if (el) {
        el.addEventListener('click', function(event) {
            submitAssegnaIstruttori()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-64');
    if (el) {
        el.addEventListener('click', function(event) {
            closeModalSpesa()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-dashboard-click-65');
    if (el) {
        el.addEventListener('click', function(event) {
            submitSpesa()
        });
    }
});

// --- GESTIONE STAMPA RICEVUTE ---

function formattaValuta(valore) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(valore);
}

function generaTemplateRicevutaHTML(r) {
    const utente = r.utenti || {};
    const dataPag = r.data_pagamento ? new Date(r.data_pagamento).toLocaleDateString('it-IT') : 'N/D';
    const numRic = r.numero_ricevuta || 'N/D';
    const annoFis = r.anno_fiscale || new Date().getFullYear();
    const imp = parseFloat(r.importo) || 0;
    
    return `
    <div class='ricevuta-container' style='page-break-after: always; max-width: 800px; margin: 0 auto; font-family: sans-serif; padding: 40px; color: #000; background: #fff;'>
        <div style='display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px;'>
            <div style='display: flex; align-items: center; gap: 15px;'>
                <img src='../assets/logo_icon.png' alt='Logo' style='height: 60px; width: auto;' />
                <div>
                    <h1 style='margin: 0; font-size: 20px; font-weight: 900; text-transform: uppercase;'>ASD ADRENALINA CLUB APS</h1>
                    <p style='margin: 5px 0 0 0; font-size: 14px;'>Via A. Rigantè 44<br>63100 Ascoli Piceno (AP)</p>
                    <p style='margin: 5px 0 0 0; font-size: 14px;'>CF: 92042260445 | PI: 02014060442 | SDI: J6URRTW</p>
                </div>
            </div>
            <div style='text-align: right;'>
                <h2 style='margin: 0; font-size: 20px; color: #df293e;'>RICEVUTA N. ${numRic} / ${annoFis}</h2>
                <p style='margin: 5px 0 0 0; font-size: 14px;'>Data: <strong>${dataPag}</strong></p>
            </div>
        </div>
        
        <div style='margin-bottom: 30px;'>
            <p style='margin: 0 0 10px 0; font-size: 16px;'>L'Associazione <strong>ADRENALINA CLUB A.S.D.</strong> dichiara di aver ricevuto da:</p>
            <div style='background: #f9f9f9; padding: 15px; border: 1px solid #ddd; border-radius: 4px;'>
                <p style='margin: 0 0 5px 0; font-size: 16px;'><strong>${escapeHtml(utente.nome || '')} ${escapeHtml(utente.cognome || '')}</strong></p>
                <p style='margin: 0 0 5px 0; font-size: 14px;'>C.F.: ${escapeHtml(utente.codice_fiscale || 'Non specificato')}</p>
                <p style='margin: 0; font-size: 14px;'>Residente in: ${escapeHtml(utente.indirizzo || '')}, ${escapeHtml(utente.cap || '')} ${escapeHtml(utente.comune || '')} (${escapeHtml(utente.provincia || '')})</p>
            </div>
        </div>
        
        <div style='margin-bottom: 30px;'>
            <p style='margin: 0 0 10px 0; font-size: 16px;'>La somma di: <strong style='font-size: 18px;'>${formattaValuta(imp)}</strong></p>
            <p style='margin: 0; font-size: 16px;'>Per la seguente causale: <strong>${escapeHtml(r.causale || '')}</strong></p>
        </div>
        
        <div style='margin-bottom: 40px;'>
            <p style='margin: 0; font-size: 14px;'>Metodo di pagamento: ${escapeHtml(r.metodo_pagamento || 'N/A')}</p>
            ${r.codice_transazione ? `<p style='margin: 2px 0 0 0; font-size: 12px; color: #666;'>Rif. Transazione: ${escapeHtml(r.codice_transazione)}</p>` : ''}
        </div>
    </div>`;
}

async function stampaRicevuta(id) {
    try {
        const { data: r, error } = await supabaseClient
            .from('ricevute_pagamenti')
            .select('*, utenti (nome, cognome, codice_fiscale, indirizzo, comune, provincia, cap)')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!r) throw new Error("Ricevuta non trovata");

        const html = generaTemplateRicevutaHTML(r);
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Per favore abilita i popup per visualizzare la ricevuta.");
            return;
        }
        printWindow.document.write("<!DOCTYPE html><html><head><title>Ricevuta N. " + r.numero_ricevuta + "</title>");
        printWindow.document.write("<style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .ricevuta-container { page-break-after: always; } }</style>");
        printWindow.document.write("</head><body style='margin:0; padding:0; background: #fff;'>");
        printWindow.document.write(html);
        printWindow.document.write("</body></html>");
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
    } catch (err) {
        console.error(err);
        alert("Errore durante l'apertura della ricevuta: " + err.message);
    }
}

async function generaExportRicevute() {
    const type = document.querySelector('input[name="export-type"]:checked').value;
    let query = supabaseClient.from('ricevute_pagamenti').select('*, utenti (nome, cognome, codice_fiscale, indirizzo, comune, provincia, cap)');

    if (type === 'date') {
        const startDate = document.getElementById('export-date-start').value;
        const endDate = document.getElementById('export-date-end').value;
        if (!startDate || !endDate) {
            alert("Inserisci entrambe le date.");
            return;
        }
        query = query.gte('data_pagamento', startDate).lte('data_pagamento', endDate).order('data_pagamento', { ascending: true }).order('numero_ricevuta', { ascending: true });
    } else {
        const anno = document.getElementById('export-num-anno').value || new Date().getFullYear();
        const startNum = document.getElementById('export-num-start').value;
        const endNum = document.getElementById('export-num-end').value;
        if (!startNum || !endNum) {
            alert("Inserisci il numero di partenza e di fine.");
            return;
        }
        query = query.eq('anno_fiscale', anno).gte('numero_ricevuta', parseInt(startNum)).lte('numero_ricevuta', parseInt(endNum)).order('numero_ricevuta', { ascending: true });
    }

    try {
        const { data: ricevute, error } = await query;
        if (error) throw error;

        if (!ricevute || ricevute.length === 0) {
            alert("Nessuna ricevuta trovata per i criteri selezionati.");
            return;
        }

        let fullHtml = "";
        ricevute.forEach(r => {
            fullHtml += generaTemplateRicevutaHTML(r);
        });

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Abilita i popup per visualizzare l'esportazione.");
            return;
        }
        printWindow.document.write("<!DOCTYPE html><html><head><title>Esportazione Ricevute</title>");
        printWindow.document.write("<style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .ricevuta-container { page-break-after: always; } }</style>");
        printWindow.document.write("</head><body style='margin:0; padding:0; background: #fff;'>");
        printWindow.document.write(fullHtml);
        printWindow.document.write("</body></html>");
        printWindow.document.close();
        printWindow.focus();
        
        document.getElementById('modal-esporta-ricevute').classList.add('hidden');

        setTimeout(() => { printWindow.print(); }, 1000);
    } catch (err) {
        console.error(err);
        alert("Errore durante l'esportazione: " + err.message);
    }
}

// --- DOSSIER TESSERATO ---

async function apriDossierTesserato(utente_id) {
    if (!utente_id) {
        alert("ID Utente non valido.");
        return;
    }

    try {
        const { data: ut, error: errUt } = await supabaseClient
            .from('utenti')
            .select('nome, cognome, documento_identita_url')
            .eq('id', utente_id)
            .single();
        if (errUt) throw errUt;

        document.getElementById('dossier-nome').textContent = `${ut.nome} ${ut.cognome}`;

        const idContainer = document.getElementById('dossier-identita-container');
        if (ut.documento_identita_url) {
            idContainer.innerHTML = `
                <span class="text-white text-xs">Documento d'Identità salvato</span>
                <button onclick="openSignedFile('documenti_identita', '${escapeHtml(ut.documento_identita_url)}')" class="bg-primary text-white font-headline text-xs font-bold px-4 py-2 hover:bg-primary-dim transition-all uppercase">VEDI FILE</button>
            `;
        } else {
            idContainer.innerHTML = `<span class="text-gray-500 text-xs italic">Nessun documento caricato</span>`;
        }

        const modContainer = document.getElementById('dossier-modulistica-container');
        const { data: atti, error: errAtti } = await supabaseClient
            .from('atti_adesione')
            .select('*')
            .eq('utente_id', utente_id)
            .single();
        
        let modHtml = '';
        if (atti) {
            if (atti.url_pdf_csen_iscrizione) {
                modHtml += `
                    <div class="flex items-center justify-between border-b border-white/5 pb-2">
                        <span class="text-white text-xs">Modulo Iscrizione CSEN</span>
                        <button onclick="openSignedFile('documenti_adesione', '${escapeHtml(atti.url_pdf_csen_iscrizione)}')" class="bg-primary text-white font-headline text-xs font-bold px-4 py-2 hover:bg-primary-dim transition-all uppercase">VEDI FILE</button>
                    </div>`;
            }
            if (atti.url_pdf_csen_informativa) {
                modHtml += `
                    <div class="flex items-center justify-between">
                        <span class="text-white text-xs">Informativa CSEN</span>
                        <button onclick="openSignedFile('documenti_adesione', '${escapeHtml(atti.url_pdf_csen_informativa)}')" class="bg-primary text-white font-headline text-xs font-bold px-4 py-2 hover:bg-primary-dim transition-all uppercase">VEDI FILE</button>
                    </div>`;
            }
        }
        if (!modHtml) modHtml = `<span class="text-gray-500 text-xs italic">Nessuna modulistica firmata digitalmente trovata</span>`;
        modContainer.innerHTML = modHtml;

        const certContainer = document.getElementById('dossier-certificati-container');
        const { data: ana, error: errAna } = await supabaseClient.from('anagrafiche').select('id').eq('utente_id', utente_id).maybeSingle();
        
        let certHtml = '';
        if (ana) {
            const { data: certs, error: errCerts } = await supabaseClient
                .from('certificati_medici')
                .select('*')
                .eq('anagrafica_id', ana.id)
                .order('created_at', { ascending: false });
            
            if (certs && certs.length > 0) {
                certs.forEach(c => {
                    const scaduto = isCertificatoScaduto(c.data_scadenza);
                    const statusStr = scaduto ? '<span class="text-primary font-bold ml-2">(SCADUTO)</span>' : '<span class="text-green-500 font-bold ml-2">(ATTIVO)</span>';
                    certHtml += `
                        <div class="flex items-center justify-between border-b border-white/5 pb-2">
                            <div>
                                <span class="text-white text-xs">${escapeHtml(c.tipologia)}</span>
                                ${statusStr}
                                <div class="text-[10px] text-gray-400 mt-1">Scadenza: ${escapeHtml(formatToItalianDate(c.data_scadenza))}</div>
                            </div>
                            <button onclick="openSignedFile('certificati_medici', '${escapeHtml(c.file_url)}')" class="bg-primary text-white font-headline text-xs font-bold px-4 py-2 hover:bg-primary-dim transition-all uppercase">VEDI FILE</button>
                        </div>`;
                });
            }
        }
        if (!certHtml) certHtml = `<span class="text-gray-500 text-xs italic">Nessun certificato medico caricato</span>`;
        certContainer.innerHTML = certHtml;

        const ricContainer = document.getElementById('dossier-ricevute-container');
        const { data: ricevute, error: errRic } = await supabaseClient
            .from('ricevute_pagamenti')
            .select('*')
            .eq('utente_id', utente_id)
            .order('data_pagamento', { ascending: false });
            
        let ricHtml = '';
        if (ricevute && ricevute.length > 0) {
            ricevute.forEach(r => {
                ricHtml += `
                    <div class="flex items-center justify-between border-b border-white/5 pb-2">
                        <div>
                            <span class="text-white text-xs font-bold">Ricevuta n. ${r.numero_ricevuta}/${r.anno_fiscale}</span>
                            <span class="text-gray-400 text-[10px] ml-2">(${r.data_pagamento})</span>
                            <div class="text-[10px] text-gray-400 mt-1">Causale: ${escapeHtml(r.causale)}</div>
                            <div class="text-[11px] text-green-500 font-bold mt-1">€${parseFloat(r.importo).toFixed(2)}</div>
                        </div>
                        <button onclick="stampaRicevuta('${r.id}')" class="bg-white text-black font-headline text-xs font-bold px-4 py-2 hover:bg-gray-200 transition-all uppercase flex items-center gap-2">
                            <span class="material-symbols-outlined text-[14px]">print</span>
                            STAMPA
                        </button>
                    </div>`;
            });
        }
        if (!ricHtml) ricHtml = `<span class="text-gray-500 text-xs italic">Nessuna ricevuta trovata</span>`;
        ricContainer.innerHTML = ricHtml;

        document.getElementById('modal-dossier-socio').classList.remove('hidden');

    } catch (err) {
        console.error("Errore apertura dossier:", err);
        alert("Errore nell'apertura del dossier: " + err.message);
    }
}

        async function popolaSelectTesserati() {
            const select = document.getElementById('modal-registro-tesserati-select');
            if (!select) return;
            select.innerHTML = '<option value="">-- Seleziona un tesserato --</option>';
            try {
                const { data, error } = await supabaseClient
                    .from('anagrafiche')
                    .select('id, nome, cognome, codice_fiscale')
                    .order('cognome', { ascending: true });
                if (error) throw error;
                (data || []).forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.dataset.nome = a.nome;
                    opt.dataset.cognome = a.cognome;
                    opt.dataset.cf = a.codice_fiscale;
                    opt.textContent = `${a.cognome.toUpperCase()} ${a.nome.toUpperCase()} (${a.codice_fiscale})`;
                    select.appendChild(opt);
                });
            } catch (err) {
                console.error("Errore popolaSelectTesserati:", err);
            }
        }

        window.onToggleSoggettoEsterno = function() {
            const isEsterno = document.getElementById('modal-registro-is-esterno').checked;
            const selectContainer = document.getElementById('modal-registro-interno-container');
            const nomeInput = document.getElementById('modal-registro-nome');
            const cognomeInput = document.getElementById('modal-registro-cognome');
            const cfInput = document.getElementById('modal-registro-cf');

            if (isEsterno) {
                if (selectContainer) selectContainer.classList.add('hidden');
                nomeInput.value = '';
                cognomeInput.value = '';
                cfInput.value = '';
                nomeInput.removeAttribute('disabled');
                cognomeInput.removeAttribute('disabled');
                cfInput.removeAttribute('disabled');
            } else {
                if (selectContainer) selectContainer.classList.remove('hidden');
                nomeInput.value = '';
                cognomeInput.value = '';
                cfInput.value = '';
                nomeInput.setAttribute('disabled', 'true');
                cognomeInput.setAttribute('disabled', 'true');
                cfInput.setAttribute('disabled', 'true');
                document.getElementById('modal-registro-tesserati-select').value = '';
            }
        };

        window.onSelectInternalTesserato = function() {
            const select = document.getElementById('modal-registro-tesserati-select');
            const selectedOpt = select.options[select.selectedIndex];
            
            const nomeInput = document.getElementById('modal-registro-nome');
            const cognomeInput = document.getElementById('modal-registro-cognome');
            const cfInput = document.getElementById('modal-registro-cf');

            if (selectedOpt && selectedOpt.value) {
                nomeInput.value = selectedOpt.dataset.nome || '';
                cognomeInput.value = selectedOpt.dataset.cognome || '';
                cfInput.value = selectedOpt.dataset.cf || '';
            } else {
                nomeInput.value = '';
                cognomeInput.value = '';
                cfInput.value = '';
            }
        };

        window.openModalNuovoIstruttoreRegistro = async function() {
            document.getElementById('modal-registro-nominativo-title').textContent = 'AGGIUNGI ISTRUTTORE A REGISTRO CSEN';
            document.getElementById('modal-registro-nominativo-tipo').value = 'istruttore';
            resetFormModalRegistro();
            await popolaSelectTesserati();
            document.getElementById('modal-registro-nominativo').classList.remove('hidden');
        };

        window.openModalNuovoVolontarioRegistro = async function() {
            document.getElementById('modal-registro-nominativo-title').textContent = 'AGGIUNGI VOLONTARIO A REGISTRO CSEN';
            document.getElementById('modal-registro-nominativo-tipo').value = 'volontario';
            resetFormModalRegistro();
            await popolaSelectTesserati();
            document.getElementById('modal-registro-nominativo').classList.remove('hidden');
        };

        window.closeModalRegistroNominativo = function() {
            document.getElementById('modal-registro-nominativo').classList.add('hidden');
        };

        function resetFormModalRegistro() {
            document.getElementById('modal-registro-is-esterno').checked = false;
            document.getElementById('modal-registro-nome').value = '';
            document.getElementById('modal-registro-cognome').value = '';
            document.getElementById('modal-registro-cf').value = '';
            document.getElementById('modal-registro-data-csen').value = new Date().toISOString().split('T')[0];
            
            const select = document.getElementById('modal-registro-tesserati-select');
            if (select) select.value = '';

            const selectContainer = document.getElementById('modal-registro-interno-container');
            if (selectContainer) selectContainer.classList.remove('hidden');

            document.getElementById('modal-registro-nome').setAttribute('disabled', 'true');
            document.getElementById('modal-registro-cognome').setAttribute('disabled', 'true');
            document.getElementById('modal-registro-cf').setAttribute('disabled', 'true');
        }

        window.submitRegistroNominativo = async function() {
            const tipo = document.getElementById('modal-registro-nominativo-tipo').value;
            const isEsterno = document.getElementById('modal-registro-is-esterno').checked;
            const tesseratoId = isEsterno ? null : document.getElementById('modal-registro-tesserati-select').value;
            const nome = document.getElementById('modal-registro-nome').value.trim();
            const cognome = document.getElementById('modal-registro-cognome').value.trim();
            const cf = document.getElementById('modal-registro-cf').value.trim();
            const dataCsen = document.getElementById('modal-registro-data-csen').value;

            if (!nome || !cognome || !cf || !dataCsen) {
                alert("Compila tutti i campi obbligatori!");
                return;
            }
            if (!isEsterno && !tesseratoId) {
                alert("Seleziona un tesserato interno o spunta Soggetto Esterno!");
                return;
            }

            try {
                const table = tipo === 'istruttore' ? 'registro_istruttori' : 'registro_volontari';
                const payload = {
                    anagrafica_id: tesseratoId || null,
                    nome: nome,
                    cognome: cognome,
                    codice_fiscale: cf,
                    data_iscrizione_csen: dataCsen
                };

                const { data, error } = await supabaseClient
                    .from(table)
                    .insert([payload])
                    .select();

                if (error) throw error;

                if (tesseratoId) {
                    const { data: anag, error: errAnag } = await supabaseClient
                        .from('anagrafiche')
                        .select('utente_id')
                        .eq('id', tesseratoId)
                        .single();

                    if (errAnag) throw errAnag;

                    if (anag && anag.utente_id) {
                        const { data: utente, error: errUt } = await supabaseClient
                            .from('utenti')
                            .select('ruolo')
                            .eq('id', anag.utente_id)
                            .single();
                        if (errUt) throw errUt;

                        let ruoli = utente.ruolo || [];
                        const nuovoRuolo = tipo === 'istruttore' ? 'istruttore' : 'volontario';
                        if (!ruoli.includes(nuovoRuolo)) {
                            ruoli.push(nuovoRuolo);
                            const { error: errUp } = await supabaseClient
                                .from('utenti')
                                .update({ ruolo: ruoli })
                                .eq('id', anag.utente_id);
                            if (errUp) throw errUp;
                        }
                    }
                }

                alert("Salvataggio completato con successo!");
                closeModalRegistroNominativo();
                
                if (tipo === 'istruttore') {
                    await loadRegistroIstruttori();
                } else {
                    await loadRegistroVolontari();
                }
            } catch (err) {
                console.error("Errore salvataggio registro:", err);
                alert("Errore durante il salvataggio: " + err.message);
            }
        };

        async function loadRegistroIstruttori() {
            const tbody = document.getElementById('registro-istruttori-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Caricamento istruttori...</td></tr>';

            try {
                const boardRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
                const activeBoardRole = userRoles.find(r => boardRoles.includes(r));
                const isPresidentOrVP = ['presidente', 'vice_presidente'].includes(activeBoardRole);

                const btnAdd = document.getElementById('btn-aggiungi-istruttore-registro');
                if (btnAdd) {
                    if (isPresidentOrVP) btnAdd.classList.remove('hidden');
                    else btnAdd.classList.add('hidden');
                }
                const actionHeaders = document.querySelectorAll('.action-col-istruttori');
                actionHeaders.forEach(th => {
                    if (isPresidentOrVP) th.classList.remove('hidden');
                    else th.classList.add('hidden');
                });

                const { data, error } = await supabaseClient
                    .from('registro_istruttori')
                    .select('*')
                    .order('cognome', { ascending: true });

                if (error) throw error;

                if (!data || data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nessun istruttore registrato.</td></tr>';
                    return;
                }

                tbody.innerHTML = '';
                data.forEach(ist => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-white/5 transition-all";
                    
                    const tipoText = ist.anagrafica_id ? 'TESSERATO INTERNO' : 'SOGGETTO ESTERNO';
                    const tipoClass = ist.anagrafica_id ? 'text-primary' : 'text-yellow-500';

                    tr.innerHTML = `
                        <td class="p-4 font-bold text-white">${ist.cognome.toUpperCase()} ${ist.nome.toUpperCase()}</td>
                        <td class="p-4 text-gray-300 font-mono">${ist.codice_fiscale.toUpperCase()}</td>
                        <td class="p-4"><span class="font-bold ${tipoClass}">${tipoText}</span></td>
                        <td class="p-4 text-gray-400">${ist.data_iscrizione_csen}</td>
                        ${isPresidentOrVP ? `
                        <td class="p-4 text-right action-col-istruttori">
                            <button onclick="eliminaRegistroNominativo('${ist.id}', 'istruttore', '${ist.anagrafica_id || ''}')" class="border border-red-500/30 hover:border-red-500 text-red-500 px-3 py-1 font-headline font-bold text-[10px] transition-all uppercase">
                                Rimuovi
                            </button>
                        </td>
                        ` : ''}
                    `;
                    tbody.appendChild(tr);
                });

            } catch (err) {
                console.error("Errore loadRegistroIstruttori:", err);
                tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Errore: ${escapeHtml(err.message)}</td></tr>`;
            }
        }

        async function loadRegistroVolontari() {
            const tbody = document.getElementById('registro-volontari-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Caricamento volontari...</td></tr>';

            try {
                const boardRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
                const activeBoardRole = userRoles.find(r => boardRoles.includes(r));
                const isPresidentOrVP = ['presidente', 'vice_presidente'].includes(activeBoardRole);

                const btnAdd = document.getElementById('btn-aggiungi-volontario-registro');
                if (btnAdd) {
                    if (isPresidentOrVP) btnAdd.classList.remove('hidden');
                    else btnAdd.classList.add('hidden');
                }
                const actionHeaders = document.querySelectorAll('.action-col-volontari');
                actionHeaders.forEach(th => {
                    if (isPresidentOrVP) th.classList.remove('hidden');
                    else th.classList.add('hidden');
                });

                const { data, error } = await supabaseClient
                    .from('registro_volontari')
                    .select('*')
                    .order('cognome', { ascending: true });

                if (error) throw error;

                if (!data || data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nessun volontario registrato.</td></tr>';
                    return;
                }

                tbody.innerHTML = '';
                data.forEach(vol => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-white/5 transition-all";
                    
                    const tipoText = vol.anagrafica_id ? 'TESSERATO INTERNO' : 'SOGGETTO ESTERNO';
                    const tipoClass = vol.anagrafica_id ? 'text-primary' : 'text-yellow-500';

                    tr.innerHTML = `
                        <td class="p-4 font-bold text-white">${vol.cognome.toUpperCase()} ${vol.nome.toUpperCase()}</td>
                        <td class="p-4 text-gray-300 font-mono">${vol.codice_fiscale.toUpperCase()}</td>
                        <td class="p-4"><span class="font-bold ${tipoClass}">${tipoText}</span></td>
                        <td class="p-4 text-gray-400">${vol.data_iscrizione_csen}</td>
                        ${isPresidentOrVP ? `
                        <td class="p-4 text-right action-col-volontari">
                            <button onclick="eliminaRegistroNominativo('${vol.id}', 'volontario', '${vol.anagrafica_id || ''}')" class="border border-red-500/30 hover:border-red-500 text-red-500 px-3 py-1 font-headline font-bold text-[10px] transition-all uppercase">
                                Rimuovi
                            </button>
                        </td>
                        ` : ''}
                    `;
                    tbody.appendChild(tr);
                });

            } catch (err) {
                console.error("Errore loadRegistroVolontari:", err);
                tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Errore: ${escapeHtml(err.message)}</td></tr>`;
            }
        }

        window.eliminaRegistroNominativo = async function(id, tipo, anagraficaId) {
            if (!confirm(`Sei sicuro di voler rimuovere questo nominativo dal registro ${tipo}?`)) return;

            try {
                const table = tipo === 'istruttore' ? 'registro_istruttori' : 'registro_volontari';
                const { error } = await supabaseClient
                    .from(table)
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                if (anagraficaId) {
                    const { data: anag, error: errAnag } = await supabaseClient
                        .from('anagrafiche')
                        .select('utente_id')
                        .eq('id', anagraficaId)
                        .single();

                    if (errAnag) throw errAnag;

                    if (anag && anag.utente_id) {
                        const { data: utente, error: errUt } = await supabaseClient
                            .from('utenti')
                            .select('ruolo')
                            .eq('id', anag.utente_id)
                            .single();
                        if (errUt) throw errUt;

                        let ruoli = utente.ruolo || [];
                        const ruoloDaRimuovere = tipo === 'istruttore' ? 'istruttore' : 'volontario';
                        const index = ruoli.indexOf(ruoloDaRimuovere);
                        if (index > -1) {
                            ruoli.splice(index, 1);
                            const { error: errUp } = await supabaseClient
                                .from('utenti')
                                .update({ ruolo: ruoli })
                                .eq('id', anag.utente_id);
                            if (errUp) throw errUp;
                        }
                    }
                }

                alert("Rimozione completata con successo!");
                if (tipo === 'istruttore') {
                    await loadRegistroIstruttori();
                } else {
                    await loadRegistroVolontari();
                }
            } catch (err) {
                console.error("Errore rimozione registro:", err);
                alert("Errore durante la rimozione: " + err.message);
            }
        };

window.openRegistroDaAdmin = function(eventoId, title, luogo, orariStr) {
    registryOpenedFromAdmin = true;
    switchTab('instructor_corsi');
    openRegistroCorso(eventoId, title, luogo, orariStr);
};

// PDF TUNER CALIBRATION PANEL LOGIC
let tunerCoords = {};
let cachedPdfs = {};

const tunerDefaults = {
    informativa: {
        nome_cognome:        { x: 110, y: 634, font_size: 11, pagina: 3 },
        codice_fiscale:      { x: 110, y: 320, font_size: 10, pagina: 3 },
        firma:               { x: 40,  y: 86,  font_size: 12, pagina: 0 },
        crocetta_acconsento: { x: 151, y: 520, font_size: 15, pagina: 3 }
    },
    iscrizione: {
        cognome:                    { x: 120, y: 635, font_size: 10, pagina: 0 },
        nome:                       { x: 365, y: 635, font_size: 10, pagina: 0 },
        nato_a:                     { x: 120, y: 610, font_size: 10, pagina: 0 },
        prov_nascita:               { x: 345, y: 610, font_size: 10, pagina: 0 },
        data_nascita:               { x: 405, y: 610, font_size: 10, pagina: 0 },
        residente_via:              { x: 120, y: 585, font_size: 10, pagina: 0 },
        civico:                     { x: 290, y: 585, font_size: 10, pagina: 0 },
        comune:                     { x: 365, y: 585, font_size: 10, pagina: 0 },
        provincia:                  { x: 365, y: 565, font_size: 10, pagina: 0 },
        cap:                        { x: 120, y: 565, font_size: 10, pagina: 0 },
        telefono:                   { x: 120, y: 545, font_size: 10, pagina: 0 },
        cellulare:                  { x: 365, y: 545, font_size: 10, pagina: 0 },
        email:                      { x: 120, y: 520, font_size: 10, pagina: 0 },
        firma_1:                    { x: 40,  y: 86,  font_size: 12, pagina: 0 },
        firma_2:                    { x: 40,  y: 86,  font_size: 12, pagina: 1 },
        crocetta_iscritto_dichiara: { x: 61,  y: 233, font_size: 12, pagina: 0 },
        associazione_logo:          { x: 35,  y: 755, font_size: 10, pagina: 0 },
        associazione_denominazione: { x: 35,  y: 780, font_size: 9,  pagina: 0 },
        associazione_indirizzo:     { x: 35,  y: 769, font_size: 7,  pagina: 0 },
        associazione_cf_pi:         { x: 35,  y: 759, font_size: 7,  pagina: 0 }
    }
};

async function getPdfBuffer(modulo) {
    if (cachedPdfs[modulo]) return cachedPdfs[modulo];
    const path = modulo === 'informativa' 
        ? '/CSEN_moduli/INFORMATIVA PER SINGOLI TESSERATI (1).pdf'
        : '/CSEN_moduli/Modulo_Iscrizione_2024(1)(1) - aggiornato silver e gold (2).pdf';
    
    console.log("Fetching PDF from:", path);
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`Impossibile caricare il template PDF (HTTP ${res.status}) da ${path}`);
    }
    const buf = await res.arrayBuffer();
    cachedPdfs[modulo] = buf;
    return buf;
}

window.initTunerPDF = async function() {
    showLoader();
    try {
        const { data: rows, error } = await supabaseClient
            .from('configurazioni_pdf')
            .select('modulo, campo, x, y, font_size, pagina');
        
        if (error) throw error;

        tunerCoords = {};
        if (rows) {
            rows.forEach(r => {
                if (!tunerCoords[r.modulo]) tunerCoords[r.modulo] = {};
                tunerCoords[r.modulo][r.campo] = { x: r.x, y: r.y, font_size: r.font_size, pagina: r.pagina };
            });
        }

        cambiaModuloTuner();
    } catch (err) {
        console.error("Errore init tuner:", err);
        alert("Errore nel caricamento delle coordinate: " + err.message);
    } finally {
        hideLoader();
    }
};

window.cambiaModuloTuner = function() {
    const modulo = document.getElementById('tuner-select-modulo').value;
    const container = document.getElementById('pdf-tuner-controls-container');
    container.innerHTML = '';

    const defaultFields = tunerDefaults[modulo];
    
    // Mappa le chiavi dei campi a testi amichevoli per l'utente
    const labelsMap = {
        nome_cognome:               "NOME COMPLETO",
        codice_fiscale:             "CODICE FISCALE",
        firma:                      "FIRMA DIGITALE",
        crocetta_acconsento:        "X CASELLA ACCONSENTO",
        cognome:                    "COGNOME",
        nome:                       "NOME",
        nato_a:                     "NATO A (COMUNE)",
        prov_nascita:               "PROVINCIA NASCITA",
        data_nascita:               "DATA NASCITA (GG/MM/AAAA)",
        residente_via:              "VIA/PIAZZA RESIDENZA",
        civico:                     "NUMERO CIVICO",
        comune:                     "COMUNE RESIDENZA",
        provincia:                  "PROVINCIA RESIDENZA",
        cap:                        "C.A.P. RESIDENZA",
        telefono:                   "TELEFONO ABITAZIONE",
        cellulare:                  "CELLULARE",
        email:                      "E-MAIL",
        firma_1:                    "FIRMA PAGINA 1",
        firma_2:                    "FIRMA PAGINA 2",
        crocetta_iscritto_dichiara: "X CASELLA L'ISCRITTO DICHIARA",
        associazione_logo:          "LOGO ASSOCIAZIONE (SOLO X/Y)",
        associazione_denominazione: "ASSOCIAZIONE - DENOMINAZIONE",
        associazione_indirizzo:     "ASSOCIAZIONE - INDIRIZZO",
        associazione_cf_pi:         "ASSOCIAZIONE - CF / P.IVA"
    };

    Object.keys(defaultFields).forEach(fieldKey => {
        const currentVal = tunerCoords[modulo]?.[fieldKey] || defaultFields[fieldKey];
        const isImage = fieldKey === 'associazione_logo';
        
        const card = document.createElement('div');
        card.className = "border border-white/5 bg-white/5 p-3 space-y-2";
        card.innerHTML = `
            <div class="flex justify-between items-center border-b border-white/5 pb-1">
                <span class="text-[10px] font-headline font-bold text-gray-300 uppercase">${labelsMap[fieldKey] || fieldKey.replace(/_/g, ' ')}</span>
                <span class="text-[8px] text-gray-500 font-mono">PAGINA: ${currentVal.pagina + 1}</span>
            </div>
            <div class="grid ${isImage ? 'grid-cols-2' : 'grid-cols-3'} gap-2">
                <div>
                    <label class="block text-[8px] text-gray-500 font-mono">COOR X</label>
                    <input type="number" value="${currentVal.x}" oninput="updateFieldCoord('${modulo}', '${fieldKey}', 'x', this.value)" class="w-full bg-black text-white text-xs border border-white/10 p-1 font-mono focus:outline-none focus:border-primary" />
                </div>
                <div>
                    <label class="block text-[8px] text-gray-500 font-mono">COOR Y</label>
                    <input type="number" value="${currentVal.y}" oninput="updateFieldCoord('${modulo}', '${fieldKey}', 'y', this.value)" class="w-full bg-black text-white text-xs border border-white/10 p-1 font-mono focus:outline-none focus:border-primary" />
                </div>
                ${isImage ? '' : `
                <div>
                    <label class="block text-[8px] text-gray-500 font-mono">FONT SIZE</label>
                    <input type="number" value="${currentVal.font_size}" oninput="updateFieldCoord('${modulo}', '${fieldKey}', 'font_size', this.value)" class="w-full bg-black text-white text-xs border border-white/10 p-1 font-mono focus:outline-none focus:border-primary" />
                </div>
                `}
            </div>
            ${isImage ? '<div class="text-[8px] text-gray-500 font-mono italic mt-1">Dimensione logo: 40x40 pt (fissa)</div>' : ''}
        `;
        container.appendChild(card);
    });

    aggiornaAnteprimaPdf();
};

let autoSaveTimeout = null;
window.updateFieldCoord = function(modulo, campo, asse, valore) {
    const valInt = parseInt(valore) || 0;
    if (!tunerCoords[modulo]) tunerCoords[modulo] = {};
    if (!tunerCoords[modulo][campo]) {
        tunerCoords[modulo][campo] = { ...tunerDefaults[modulo][campo] };
    }
    tunerCoords[modulo][campo][asse] = valInt;
    
    // Aggiorna l'anteprima in tempo reale
    aggiornaAnteprimaPdf();

    // Mostra indicatore di salvataggio
    let statusIndicator = document.getElementById('tuner-save-status');
    if (!statusIndicator) {
        statusIndicator = document.createElement('span');
        statusIndicator.id = 'tuner-save-status';
        statusIndicator.className = 'text-[10px] font-mono text-amber-400 animate-pulse uppercase ml-3';
        // Inseriamo l'indicatore vicino al titolo del pannello
        const headerContainer = document.querySelector('#panel-taratura_pdf h2');
        if (headerContainer && headerContainer.parentElement) {
            headerContainer.parentElement.appendChild(statusIndicator);
        }
    }
    statusIndicator.innerText = "● Salvataggio automatico...";
    statusIndicator.className = 'text-[10px] font-mono text-amber-400 animate-pulse uppercase ml-3';

    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        try {
            const val = tunerCoords[modulo][campo];
            const { error } = await supabaseClient
                .from('configurazioni_pdf')
                .upsert({
                    modulo: modulo,
                    campo: campo,
                    x: val.x,
                    y: val.y,
                    font_size: val.font_size,
                    pagina: val.pagina
                }, { onConflict: 'modulo, campo' });

            if (error) throw error;
            statusIndicator.innerText = "● Coordinate Salvate ✓";
            statusIndicator.className = 'text-[10px] font-mono text-emerald-400 uppercase ml-3';
        } catch (err) {
            console.error("Errore salvataggio automatico:", err);
            statusIndicator.innerText = "● Errore di salvataggio ❌";
            statusIndicator.className = 'text-[10px] font-mono text-red-500 uppercase ml-3';
        }
    }, 1000);
};

let cachedLogo = null;
async function getLogoBuffer() {
    if (cachedLogo) return cachedLogo;
    const res = await fetch('../assets/logo_icon.png');
    if (!res.ok) throw new Error("Impossibile caricare il logo dell'associazione");
    cachedLogo = await res.arrayBuffer();
    return cachedLogo;
}

window.aggiornaAnteprimaPdf = async function() {
    try {
        const modulo = document.getElementById('tuner-select-modulo').value;
        const buf = await getPdfBuffer(modulo);
        const doc = await PDFLib.PDFDocument.load(buf);
        const pages = doc.getPages();
        
        // Dati fittizi di test
        const profile = {
            nome: "Loris",
            cognome: "Benedetti",
            comune: "Chiaravalle",
            provincia: "AN",
            cap: "60033",
            data_nascita: "1977-05-19",
            luogo_nascita_comune: "Chiaravalle",
            luogo_nascita_provincia: "AN",
            cellulare: "3382576434",
            email: "benexloris@gmail.com"
        };
        const cf = "BNDLRS77P19E388O";
        const streetName = "VIA PIETRO MASCAGNI";
        const streetNumber = "5";
        const otp = "491624";
        const clientIp = "79.44.190.201";
        const signatureText = `Firmato Digitalmente (OTP: ${otp} | IP: ${clientIp} | Data: 03/07/2026, 11:02:45)`;
        const signatureColor = PDFLib.rgb(0.8, 0, 0);

        const getVal = (field) => {
            return tunerCoords[modulo]?.[field] || tunerDefaults[modulo][field];
        };

        if (modulo === 'informativa') {
            const infNome = getVal('nome_cognome');
            const infCF   = getVal('codice_fiscale');
            const infFirma= getVal('firma');
            const infCons = getVal('crocetta_acconsento');

            // Dati anagrafici sulla pagina configurata (default: pagina 4, indice 3)
            const pgNome = pages[infNome.pagina] ?? pages[pages.length - 1];
            pgNome.drawText(
                `${profile.nome.toUpperCase()} ${profile.cognome.toUpperCase()}`,
                { x: infNome.x, y: infNome.y, size: infNome.font_size }
            );

            const pgCF = pages[infCF.pagina] ?? pages[pages.length - 1];
            pgCF.drawText(cf, { x: infCF.x, y: infCF.y, size: infCF.font_size });

            // X nella casella "Acconsento"
            if (infCons) {
                const pgCons = pages[infCons.pagina] ?? pages[pages.length - 1];
                pgCons.drawText('X', { x: infCons.x, y: infCons.y, size: infCons.font_size, color: PDFLib.rgb(0,0,0) });
            }

            // Timbro digitale su tutte le pagine
            pages.forEach(p => {
                p.drawText(signatureText, { x: infFirma.x, y: infFirma.y, size: infFirma.font_size, color: signatureColor });
            });
        } else {
            const p1 = pages[0];
            const p2 = pages[1];

            const fields = ['cognome', 'nome', 'nato_a', 'prov_nascita', 'data_nascita', 'residente_via', 'civico', 'comune', 'provincia', 'cap', 'telefono', 'cellulare', 'email', 'firma_1', 'firma_2'];
            
            let dataNascitaFormatted = "19/05/1977";

            const values = {
                cognome: profile.cognome.toUpperCase(),
                nome: profile.nome.toUpperCase(),
                nato_a: profile.luogo_nascita_comune.toUpperCase(),
                prov_nascita: profile.luogo_nascita_provincia.toUpperCase(),
                data_nascita: dataNascitaFormatted,
                residente_via: streetName.toUpperCase(),
                civico: streetNumber.toUpperCase(),
                comune: profile.comune.toUpperCase(),
                provincia: profile.provincia.toUpperCase(),
                cap: profile.cap,
                telefono: profile.telefono || '',
                cellulare: profile.cellulare || '',
                email: profile.email || '',
                firma_1: signatureText,
                firma_2: signatureText
            };

            fields.forEach(f => {
                const cfg = getVal(f);
                if (!cfg) return;
                const page = cfg.pagina === 1 ? p2 : p1;
                if (!page) return;
                
                const opt = { x: cfg.x, y: cfg.y, size: cfg.font_size };
                if (f === 'firma_1' || f === 'firma_2') opt.color = signatureColor;
                
                page.drawText(values[f], opt);
            });

            // X nella casella "L'iscritto dichiara"
            const dich = getVal('crocetta_iscritto_dichiara');
            if (dich && p1) {
                p1.drawText('X', { x: dich.x, y: dich.y, size: dich.font_size, color: PDFLib.rgb(0,0,0) });
            }

            // Logo dell'Associazione
            const logoPos = getVal('associazione_logo');
            if (logoPos && p1) {
                try {
                    const logoBuf = await getLogoBuffer();
                    const logoImage = await doc.embedPng(logoBuf);
                    p1.drawImage(logoImage, {
                        x: logoPos.x,
                        y: logoPos.y,
                        width: 40,
                        height: 40
                    });
                } catch (e) {
                    console.warn("Impossibile disegnare il logo dell'associazione:", e);
                }
            }

            // Dati statici associazione
            const denPos = getVal('associazione_denominazione');
            const indPos = getVal('associazione_indirizzo');
            const cfPos  = getVal('associazione_cf_pi');
            
            const assFont = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
            if (denPos && p1) {
                p1.drawText('ASD Adrenalina Club APS', { x: denPos.x, y: denPos.y, size: denPos.font_size, font: assFont });
            }
            if (indPos && p1) {
                p1.drawText('Via Rigantè 44 - 63100 Ascoli Piceno', { x: indPos.x, y: indPos.y, size: indPos.font_size, font: assFont });
            }
            if (cfPos && p1) {
                p1.drawText('CF: 92042260445 - P.IVA: 02014060442', { x: cfPos.x, y: cfPos.y, size: cfPos.font_size, font: assFont });
            }
        }

        const pdfBytes = await doc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob) + '#toolbar=0&navpanes=0&scrollbar=1&view=FitH';
        document.getElementById('pdf-tuner-preview-frame').src = url;
    } catch (err) {
        console.error("Errore aggiornamento anteprima PDF:", err);
        const iframe = document.getElementById('pdf-tuner-preview-frame');
        if (iframe) {
            iframe.srcdoc = `
                <div style="color: #df293e; background: #1a1a1a; padding: 20px; font-family: monospace; height: 100%; box-sizing: border-box; border: 1px solid #df293e;">
                    <h3 style="margin-top:0;">❌ Errore Caricamento/Compilazione PDF</h3>
                    <p style="font-size:12px;">${err.message}</p>
                    <p style="color: #888; font-size: 11px;">Verifica la console del browser o la rete (Network) per maggiori dettagli.</p>
                </div>
            `;
        }
    }
};

window.salvaTaraturaPDF = async function() {
    const modulo = document.getElementById('tuner-select-modulo').value;
    const currentCoords = tunerCoords[modulo];
    if (!currentCoords) {
        alert("Nessuna modifica da salvare per questo modulo.");
        return;
    }

    showLoader();
    try {
        const promises = Object.keys(currentCoords).map(async (campo) => {
            const val = currentCoords[campo];
            const { error } = await supabaseClient
                .from('configurazioni_pdf')
                .upsert({
                    modulo: modulo,
                    campo: campo,
                    x: val.x,
                    y: val.y,
                    font_size: val.font_size,
                    pagina: val.pagina
                }, { onConflict: 'modulo, campo' });
            
            if (error) throw error;
        });

        await Promise.all(promises);
        alert("Configurazione taratura PDF salvata con successo!");
    } catch (err) {
        console.error("Errore salvataggio taratura:", err);
        alert("Errore durante il salvataggio della taratura: " + err.message);
    } finally {
        hideLoader();
    }
};

let sandboxFronteFile = null;
let sandboxRetroFile = null;
let sandboxMergedBlob = null;

window.initSandboxDocumenti = function() {
    sandboxFronteFile = null;
    sandboxRetroFile = null;
    sandboxMergedBlob = null;
    
    document.getElementById('sandbox_file_fronte').value = '';
    document.getElementById('sandbox_file_retro').value = '';
    
    document.getElementById('sandbox-fronte-name').textContent = 'SELEZIONA O TRASCINA IL FRONTE';
    document.getElementById('sandbox-fronte-status').textContent = 'Nessun file selezionato';
    document.getElementById('sandbox-fronte-status').className = 'text-[9px] text-gray-400 mt-1 uppercase';
    
    document.getElementById('sandbox-retro-name').textContent = 'SELEZIONA O TRASCINA IL RETRO';
    document.getElementById('sandbox-retro-status').textContent = 'Nessun file selezionato';
    document.getElementById('sandbox-retro-status').className = 'text-[9px] text-gray-400 mt-1 uppercase';
    
    document.getElementById('sandbox-console-log').innerHTML = '<div>🔬 Sandbox Documenti pronta per il test. Seleziona i file e avvia il merge.</div>';
    document.getElementById('sandbox-preview-container').classList.add('hidden');
    
    // Bind listeners once
    const inputFronte = document.getElementById('sandbox_file_fronte');
    const inputRetro = document.getElementById('sandbox_file_retro');
    
    inputFronte.replaceWith(inputFronte.cloneNode(true));
    inputRetro.replaceWith(inputRetro.cloneNode(true));
    
    const newInputFronte = document.getElementById('sandbox_file_fronte');
    const newInputRetro = document.getElementById('sandbox_file_retro');
    
    newInputFronte.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            sandboxFronteFile = file;
            document.getElementById('sandbox-fronte-name').textContent = file.name.toUpperCase();
            document.getElementById('sandbox-fronte-status').textContent = `✓ SELEZIONATO (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            document.getElementById('sandbox-fronte-status').className = 'text-[9px] text-green-500 mt-1 uppercase font-bold';
            logSandbox(`File 1 caricato: ${file.name} (${(file.size / 1024).toFixed(0)} KB, tipo: ${file.type})`);
        }
    });

    newInputRetro.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            sandboxRetroFile = file;
            document.getElementById('sandbox-retro-name').textContent = file.name.toUpperCase();
            document.getElementById('sandbox-retro-status').textContent = `✓ SELEZIONATO (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            document.getElementById('sandbox-retro-status').className = 'text-[9px] text-green-500 mt-1 uppercase font-bold';
            logSandbox(`File 2 caricato: ${file.name} (${(file.size / 1024).toFixed(0)} KB, tipo: ${file.type})`);
        }
    });
};

function logSandbox(msg) {
    const consoleLog = document.getElementById('sandbox-console-log');
    if (consoleLog) {
        consoleLog.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnRun = document.getElementById('btn-run-sandbox');
    if (btnRun) {
        btnRun.addEventListener('click', async () => {
            if (!sandboxFronteFile) {
                alert("Devi selezionare almeno il File 1 (Fronte).");
                return;
            }
            
            logSandbox("=== Inizio elaborazione unione e compressione ===");
            btnRun.disabled = true;
            btnRun.textContent = "Elaborazione in corso...";
            
            try {
                // Se c'è solo il fronte, lo lasciamo così com'è (se PDF) o lo convertiamo in PDF (se immagine)
                if (!sandboxRetroFile) {
                    if (sandboxFronteFile.type === 'application/pdf') {
                        logSandbox("Trovato file unico PDF. Nessun merge necessario. Elaborazione terminata.");
                        sandboxMergedBlob = sandboxFronteFile;
                    } else if (sandboxFronteFile.type.startsWith('image/')) {
                        logSandbox("Trovato file unico immagine. Conversione in PDF compresso...");
                        const compBlob = await compressImageSandbox(sandboxFronteFile, 1200, 1200, 0.8);
                        logSandbox("Conversione immagine singola completata.");
                        
                        const pdfDoc = await window.PDFLib.PDFDocument.create();
                        const imageBytes = await compBlob.arrayBuffer();
                        const embeddedImage = await pdfDoc.embedJpg(imageBytes);
                        const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
                        page.drawImage(embeddedImage, { x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height });
                        const pdfBytes = await pdfDoc.save();
                        sandboxMergedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                    } else {
                        throw new Error("Formato file non supportato. Caricare JPG, PNG o PDF.");
                    }
                } else {
                    // C'è sia Fronte che Retro.
                    logSandbox("Trovati due file. Avvio unione universale...");
                    
                    const pdfDoc = await window.PDFLib.PDFDocument.create();
                    const files = [sandboxFronteFile, sandboxRetroFile];
                    
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const label = i === 0 ? "FRONTE" : "RETRO";
                        
                        if (file.type === 'application/pdf') {
                            logSandbox(`Elaborazione ${label} come PDF...`);
                            const fileBytes = await file.arrayBuffer();
                            const donorPdf = await window.PDFLib.PDFDocument.load(fileBytes);
                            const copiedPages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
                            copiedPages.forEach(page => pdfDoc.addPage(page));
                            logSandbox(`Importate ${copiedPages.length} pagine da PDF ${label}.`);
                        } else if (file.type.startsWith('image/')) {
                            logSandbox(`Compressione ${label} come immagine...`);
                            const compBlob = await compressImageSandbox(file, 1200, 1200, 0.8);
                            const imageBytes = await compBlob.arrayBuffer();
                            
                            let embeddedImage;
                            if (file.type === 'image/png') {
                                embeddedImage = await pdfDoc.embedPng(imageBytes).catch(async () => await pdfDoc.embedJpg(imageBytes));
                            } else {
                                embeddedImage = await pdfDoc.embedJpg(imageBytes);
                            }
                            
                            const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
                            page.drawImage(embeddedImage, { x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height });
                            logSandbox(`Aggiunta pagina da immagine ${label}.`);
                        } else {
                            throw new Error(`Tipo file per ${label} non supportato.`);
                        }
                    }
                    
                    const pdfBytes = await pdfDoc.save();
                    sandboxMergedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                    logSandbox("Unione universale PDF-lib completata con successo!");
                }
                
                const sizeKb = (sandboxMergedBlob.size / 1024).toFixed(1);
                document.getElementById('sandbox-pdf-size').textContent = `${sizeKb} KB`;
                document.getElementById('sandbox-preview-container').classList.remove('hidden');
                logSandbox(`✅ PDF Generato con successo. Peso totale: ${sizeKb} KB.`);
                
            } catch (err) {
                logSandbox(`❌ ERRORE: ${err.message}`);
                console.error(err);
                alert("Errore durante l'elaborazione del test: " + err.message);
            } finally {
                btnRun.disabled = false;
                btnRun.textContent = "Unisci e Comprimi (Locali)";
            }
        });
    }
    
    const btnView = document.getElementById('btn-sandbox-view');
    if (btnView) {
        btnView.addEventListener('click', () => {
            if (sandboxMergedBlob) {
                const fileUrl = URL.createObjectURL(sandboxMergedBlob);
                window.open(fileUrl, '_blank');
            }
        });
    }
    
    const btnDownload = document.getElementById('btn-sandbox-download');
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            if (sandboxMergedBlob) {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(sandboxMergedBlob);
                link.download = `test_documento_unito_${Date.now()}.pdf`;
                link.click();
            }
        });
    }
});

function compressImageSandbox(file, maxWidth, maxHeight, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Errore Canvas to Blob"));
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}






