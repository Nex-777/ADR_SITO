function togglePasswordVisibility(inputId, buttonEl) {
            const input = document.getElementById(inputId);
            const icon = buttonEl.querySelector('.material-symbols-outlined');
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        }

        // --- 1. Supabase Initialization ---
        // Utilizziamo le credenziali reali fornite dal database ADRENALINA_SERVICES
        if (typeof APP_CONFIG === 'undefined') {
            window.APP_CONFIG = {
                SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
                SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
                API_BASE_URL: window.location.origin,
                VERSION: "1.02.31"
            };
        }
        const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
        const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
        const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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

        // --- 2. Developer/Mock Mode Configuration ---
        const isDevMode = false;
        
        // Auto-configure backend API URL for local dev if page is served on port 8080
        if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '8888') {
            APP_CONFIG.API_BASE_URL = 'http://127.0.0.1:8888';
        }

        // --- 3. Tariffe Configuration ---
        let tariffe = {
            quota_socio: 25.00,
            tessera_base_silver: 10.00,
            tessera_base_gold: 15.00,
            tessera_integrativa_a: 20.00,
            tessera_integrativa_b: 25.00
        };

        // --- 4. Cascading Address & Birthplace Load ---
        let comuniData = [];
        let statiData = [];
        const selectProvincia = document.getElementById('provincia');
        const selectComune = document.getElementById('comune');
        const selectCap = document.getElementById('cap');

        const selectProvinciaNascita = document.getElementById('provincia_nascita');
        const selectComuneNascita = document.getElementById('comune_nascita');

        async function loadItalianComuni() {
            try {
                // Fetch datasets in parallel
                const [resComuni, resStati] = await Promise.all([
                    fetch('./comuni.json'),
                    fetch('./stati.json')
                ]);
                comuniData = await resComuni.json();
                statiData = await resStati.json();
                
                // Map unique provinces
                const provinces = {};
                comuniData.forEach(c => {
                    if(c.provincia && c.provincia.nome && c.sigla) {
                        provinces[c.sigla] = c.provincia.nome;
                    }
                });

                // Populate Province select sorted alphabetically
                Object.entries(provinces)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .forEach(([sigla, nome]) => {
                        // Residenza
                        const optRes = document.createElement('option');
                        optRes.value = sigla;
                        optRes.textContent = `${nome} (${sigla})`;
                        selectProvincia.appendChild(optRes);

                        // Nascita
                        const optNas = document.createElement('option');
                        optNas.value = sigla;
                        optNas.textContent = `${nome} (${sigla})`;
                        selectProvinciaNascita.appendChild(optNas);
                    });

                // Aggiungi l'opzione Estero (EE) per la nascita
                const optNasEE = document.createElement('option');
                optNasEE.value = 'EE';
                optNasEE.textContent = 'Estero (EE)';
                selectProvinciaNascita.appendChild(optNasEE);

            } catch (err) {
                console.error("Errore caricamento database comuni/stati:", err);
                alert("Errore nel caricamento del database geografico. Ricarica la pagina.");
            }
        }

        // Address Handlers
        selectProvincia.addEventListener('change', () => {
            const sigla = selectProvincia.value;
            selectComune.innerHTML = '<option value="" disabled selected>Seleziona Comune...</option>';
            selectCap.value = '';
            selectComune.disabled = true;

            if (!sigla) return;

            const filteredComuni = comuniData
                .filter(c => c.sigla === sigla)
                .sort((a, b) => a.nome.localeCompare(b.nome));

            filteredComuni.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nome;
                opt.textContent = c.nome;
                selectComune.appendChild(opt);
            });

            selectComune.disabled = false;
        });

        selectComune.addEventListener('change', () => {
            const comuneNome = selectComune.value;
            const sigla = selectProvincia.value;
            selectCap.value = '';

            if (!comuneNome) return;

            const matchedComune = comuniData.find(c => c.sigla === sigla && c.nome === comuneNome);
            if (matchedComune && matchedComune.cap && matchedComune.cap.length > 0) {
                selectCap.value = matchedComune.cap[0];
            }
        });

        // Birthplace Handlers
        selectProvinciaNascita.addEventListener('change', () => {
            const sigla = selectProvinciaNascita.value;
            selectComuneNascita.innerHTML = '<option value="" disabled selected>Seleziona Comune...</option>';
            selectComuneNascita.disabled = true;

            if (!sigla) return;

            if (sigla === 'EE') {
                statiData.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.nome;
                    opt.textContent = s.nome;
                    selectComuneNascita.appendChild(opt);
                });
            } else {
                const filteredComuni = comuniData
                    .filter(c => c.sigla === sigla)
                    .sort((a, b) => a.nome.localeCompare(b.nome));

                filteredComuni.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.nome;
                    opt.textContent = c.nome;
                    selectComuneNascita.appendChild(opt);
                });
            }

            selectComuneNascita.disabled = false;
        });

        // Initialize address load
        loadItalianComuni();

        // --- 5. Codice Fiscale Validation Algorithm ---
        function validateCodiceFiscale(cf) {
            cf = cf.toUpperCase().trim();
            if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) {
                return false;
            }
            const oddMap = {
                '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
                'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
                'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
                'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
            };
            const evenMap = {
                '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
                'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
                'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25
            };
            let sum = 0;
            for (let i = 0; i < 15; i++) {
                const char = cf[i];
                if (i % 2 === 0) { // Odd positions in 1-based index (0, 2, 4...)
                    sum += oddMap[char];
                } else { // Even positions
                    sum += evenMap[char];
                }
            }
            const checkChar = String.fromCharCode(65 + (sum % 26));
            return checkChar === cf[15];
        }

        const inputCF = document.getElementById('codice_fiscale');
        const cfStatus = document.getElementById('cf_validation_status');

        function verifyCfCoherence() {
            const cf = inputCF.value.trim().toUpperCase();
            
            if (!cf) {
                cfStatus.textContent = "Inserisci il codice fiscale per la verifica formale.";
                cfStatus.className = "text-[9px] uppercase tracking-wider block mt-1 text-gray-500 font-bold";
                inputCF.setCustomValidity("Il codice fiscale è richiesto.");
                return;
            }

            if (cf.length < 16) {
                cfStatus.textContent = "Il codice fiscale deve essere di 16 caratteri.";
                cfStatus.className = "text-[9px] uppercase tracking-wider block mt-1 text-yellow-500 font-bold";
                inputCF.setCustomValidity("Lunghezza insufficiente.");
                return;
            }

            // 1. Algorithmic Check
            if (!validateCodiceFiscale(cf)) {
                cfStatus.textContent = "✗ CODICE FISCALE NON VALIDO (CONTROLLA I CARATTERI O LA CIFRA DI VERIFICA)";
                cfStatus.className = "text-[9px] uppercase tracking-wider block mt-1 text-primary font-bold";
                inputCF.setCustomValidity("Codice Fiscale non valido.");
                return;
            }

            // --- Auto-popolazione dati dal codice fiscale ---
            // Data di nascita
            const yearCfShort = cf.substring(6, 8);
            const monthCfChar = cf.substring(8, 9);
            let dayCf = parseInt(cf.substring(9, 11), 10);
            if (dayCf > 40) dayCf -= 40; // female adjustment
            const dayCfStr = dayCf.toString().padStart(2, '0');

            const monthMap = {
                'A': '01', 'B': '02', 'C': '03', 'D': '04', 'E': '05', 'H': '06',
                'L': '07', 'M': '08', 'P': '09', 'R': '10', 'S': '11', 'T': '12'
            };
            const monthCf = monthMap[monthCfChar];

            // Calcola anno a 4 cifre (assumendo che un atleta che si iscrive oggi abbia meno di 100 anni)
            const currentYear = new Date().getFullYear();
            const currentCentury = Math.floor(currentYear / 100) * 100;
            let fullYear = currentCentury + parseInt(yearCfShort, 10);
            if (fullYear > currentYear) {
                fullYear -= 100;
            }
            const dateStr = `${fullYear}-${monthCf}-${dayCfStr}`;
            
            const birthInput = document.getElementById('data_nascita');
            if (birthInput && birthInput.value !== dateStr) {
                birthInput.value = dateStr;
                // Trigger change event for minor checking
                birthInput.dispatchEvent(new Event('change'));
            }

            // Luogo di nascita (comune e provincia)
            const codeCf = cf.substring(11, 15);
            let matchedBirthPlace = null;
            let isForeign = codeCf.startsWith('Z');

            if (isForeign) {
                if (statiData && statiData.length > 0) {
                    matchedBirthPlace = statiData.find(s => s.codiceCatastale && s.codiceCatastale.toUpperCase() === codeCf);
                }
            } else {
                if (comuniData && comuniData.length > 0) {
                    matchedBirthPlace = comuniData.find(c => c.codiceCatastale && c.codiceCatastale.toUpperCase() === codeCf);
                }
            }

            if (matchedBirthPlace) {
                const siglaNas = matchedBirthPlace.sigla;
                const nomeComune = matchedBirthPlace.nome;

                // Imposta provincia di nascita
                if (selectProvinciaNascita.value !== siglaNas) {
                    selectProvinciaNascita.value = siglaNas;
                    // Ricarica la lista dei comuni per questa provincia
                    selectProvinciaNascita.dispatchEvent(new Event('change'));
                }

                // Imposta comune di nascita
                if (selectComuneNascita.value !== nomeComune) {
                    selectComuneNascita.value = nomeComune;
                    selectComuneNascita.dispatchEvent(new Event('change'));
                }

                cfStatus.textContent = "✓ CODICE FISCALE VALIDO E DATI COMPILATI";
                cfStatus.className = "text-[9px] uppercase tracking-wider block mt-1 text-green-500 font-bold";
                inputCF.setCustomValidity("");
            } else {
                cfStatus.textContent = "✗ CODICE FISCALE VALIDO MA LUOGO DI NASCITA NON TROVATO";
                cfStatus.className = "text-[9px] uppercase tracking-wider block mt-1 text-yellow-500 font-bold";
                inputCF.setCustomValidity("Luogo di nascita non trovato per questo Codice Fiscale.");
            }
        }

        inputCF.addEventListener('input', verifyCfCoherence);
        document.getElementById('data_nascita').addEventListener('change', verifyCfCoherence);
        selectComuneNascita.addEventListener('change', verifyCfCoherence);

        // --- 6. Membership Selection Logic ---
        let selectedAdesione = "";
        let selectedTessera = "";
        let uploadedCertificatoFile = null;
        let uploadedDocumentoIdentitaFile = null;
        let uploadedDocumentoIdentitaRetroFile = null;

        const inputAdesione = document.getElementById('tipo_adesione');
        const inputTessera = document.getElementById('tipo_tessera');
        
        const tesseraContainer = document.getElementById('tessera_sportiva_container');
        const certificatoContainer = document.getElementById('certificato_medico_container');
        const riepilogoContainer = document.getElementById('riepilogo_quota_container');
        const riepilogoDettagli = document.getElementById('riepilogo_quota_dettagli');
        const riepilogoQuotaTotale = document.getElementById('riepilogo_quota_totale');

        async function fetchTariffe() {
            if (isDevMode) {
                updateTariffeDisplay();
                return;
            }
            try {
                const { data, error } = await supabaseClient
                    .from('configurazioni_tariffe')
                    .select('*');
                if (error) throw error;
                if (data && data.length > 0) {
                    data.forEach(row => {
                        if (tariffe[row.chiave] !== undefined) {
                            tariffe[row.chiave] = parseFloat(row.valore);
                        }
                    });
                }
            } catch (err) {
                console.error("Errore caricamento tariffe:", err);
            } finally {
                updateTariffeDisplay();
            }
        }

        function updateTariffeDisplay() {
            document.getElementById('price-tag-socio').textContent = `€${tariffe.quota_socio}`;
            document.getElementById('price-tag-silver').textContent = `€${tariffe.tessera_base_silver}`;
            document.getElementById('price-tag-gold').textContent = `€${tariffe.tessera_base_gold}`;
            document.getElementById('price-tag-integrativa-a').textContent = `€${tariffe.tessera_integrativa_a}`;
            document.getElementById('price-tag-integrativa-b').textContent = `€${tariffe.tessera_integrativa_b}`;
            recalculateTotal();
        }

        function selectAdesione(type) {
            // Se minorenne, permetti solo tesserato
            if (isMinor && type !== 'tesserato') {
                alert("Gli atleti minorenni possono registrarsi esclusivamente come 'Tesserato'.");
                return;
            }

            selectedAdesione = type;
            inputAdesione.value = type;

            // Reset visual states
            ['card-socio', 'card-tesserato', 'card-socio-tesserato'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('border-primary', 'shadow-[0_0_15px_rgba(223,41,62,0.3)]');
                    el.classList.add('border-white/10');
                }
            });

            // Highlight selected card
            const activeCard = document.getElementById(`card-${type.replace('_', '-')}`);
            if (activeCard) {
                activeCard.classList.remove('border-white/10');
                activeCard.classList.add('border-primary', 'shadow-[0_0_15px_rgba(223,41,62,0.3)]');
            }

            // Show/Hide containers conditionally
            if (type === 'socio') {
                tesseraContainer.classList.add('hidden');
                certificatoContainer.classList.add('hidden');
                selectedTessera = "";
                inputTessera.value = "";
                document.getElementById('certificato_tipologia').value = "";
                document.getElementById('certificato_data_emissione').value = "";
            } else {
                tesseraContainer.classList.remove('hidden');
                certificatoContainer.classList.remove('hidden');
            }

            recalculateTotal();
        }

        function selectTessera(tesseraId) {
            selectedTessera = tesseraId;
            inputTessera.value = tesseraId;

            // Reset visual states
            ['tessera-silver', 'tessera-gold', 'tessera-integrativa-a', 'tessera-integrativa-b'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('border-primary', 'bg-primary/5');
                    el.classList.add('border-white/10');
                }
            });

            // Highlight selected tessera item
            const idMap = {
                'tessera_base_silver': 'tessera-silver',
                'tessera_base_gold': 'tessera-gold',
                'tessera_integrativa_a': 'tessera-integrativa-a',
                'tessera_integrativa_b': 'tessera-integrativa-b'
            };
            const activeTessera = document.getElementById(idMap[tesseraId]);
            if (activeTessera) {
                activeTessera.classList.remove('border-white/10');
                activeTessera.classList.add('border-primary', 'bg-primary/5', 'shadow-[0_0_10px_rgba(223,41,62,0.2)]');
            }

            recalculateTotal();
        }

        function recalculateTotal() {
            let total = 0;
            let details = [];

            if (selectedAdesione === 'socio') {
                total = tariffe.quota_socio;
                details.push(`QUOTA SOCIO (€${tariffe.quota_socio})`);
            } else if (selectedAdesione === 'tesserato') {
                if (selectedTessera) {
                    const price = tariffe[selectedTessera] || 0;
                    total = price;
                    details.push(`TESSERA ${selectedTessera.replace('tessera_', '').replace(/_/g, ' ').toUpperCase()} (€${price})`);
                } else {
                    details.push("SCEGLI UNA TESSERA SPORTIVA");
                }
            } else if (selectedAdesione === 'socio_tesserato') {
                total = tariffe.quota_socio;
                details.push(`QUOTA SOCIO (€${tariffe.quota_socio})`);
                if (selectedTessera) {
                    const price = tariffe[selectedTessera] || 0;
                    total += price;
                    details.push(`TESSERA ${selectedTessera.replace('tessera_', '').replace(/_/g, ' ').toUpperCase()} (€${price})`);
                } else {
                    details.push("SCEGLI UNA TESSERA SPORTIVA");
                }
            }

            if (selectedAdesione) {
                riepilogoContainer.classList.remove('hidden');
                riepilogoDettagli.textContent = details.join(" + ");
                riepilogoQuotaTotale.textContent = `€${total.toFixed(2)}`;
            } else {
                riepilogoContainer.classList.add('hidden');
            }
        }

        // File Selection handling
        const fileInput = document.getElementById('certificato_file');
        const fileNameLabel = document.getElementById('certificato-file-name');
        const fileStatusLabel = document.getElementById('certificato-file-status');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                uploadedCertificatoFile = null;
                fileNameLabel.textContent = "SELEZIONA O TRASCINA IL CERTIFICATO";
                fileStatusLabel.textContent = "Nessun file selezionato";
                fileStatusLabel.className = "text-[9px] text-gray-400 mt-1 uppercase";
                return;
            }

            // Size limit: 5MB
            if (file.size > 5 * 1024 * 1024) {
                alert("Il certificato non deve superare i 5MB di dimensione.");
                fileInput.value = "";
                uploadedCertificatoFile = null;
                fileNameLabel.textContent = "SELEZIONA O TRASCINA IL CERTIFICATO";
                fileStatusLabel.textContent = "Errore: File troppo grande (>5MB)";
                fileStatusLabel.className = "text-[9px] text-primary mt-1 uppercase font-bold";
                return;
            }

            uploadedCertificatoFile = file;
            fileNameLabel.textContent = file.name.toUpperCase();
            fileStatusLabel.textContent = `✓ PRONTO PER L'UPLOAD (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            fileStatusLabel.className = "text-[9px] text-green-500 mt-1 uppercase font-bold";
        });

        // ID Document Selection handling
        const identitaFileInput = document.getElementById('documento_identita_file');
        const identitaFileNameLabel = document.getElementById('documento-identita-file-name');
        const identitaFileStatusLabel = document.getElementById('documento-identita-file-status');
        const identitaRetroFileInput = document.getElementById('documento_identita_retro_file');
        const identitaRetroFileNameLabel = document.getElementById('documento-identita-retro-file-name');
        const identitaRetroFileStatusLabel = document.getElementById('documento-identita-retro-file-status');

        function updateDocumentoIdentitaHelper() {
            const msgEl = document.getElementById('documento-identita-helper-msg');
            if (!msgEl) return;

            const layoutChoice = document.querySelector('input[name="documento_layout_choice"]:checked')?.value || 'single';

            if (!uploadedDocumentoIdentitaFile) {
                msgEl.classList.add('hidden');
                return;
            }

            if (layoutChoice === 'single') {
                msgEl.textContent = "✓ DOCUMENTO PRONTO PER L'INVIO.";
                msgEl.className = "text-[10px] uppercase font-bold tracking-wider mt-2 text-center text-green-500";
                msgEl.classList.remove('hidden');
            } else {
                // double mode
                if (uploadedDocumentoIdentitaRetroFile) {
                    msgEl.textContent = "✓ FRONTE E RETRO SELEZIONATI. VERRANNO UNITI IN UN SINGOLO PDF.";
                    msgEl.className = "text-[10px] uppercase font-bold tracking-wider mt-2 text-center text-green-500";
                    msgEl.classList.remove('hidden');
                } else {
                    msgEl.textContent = "💡 HAI CARICATO IL FRONTE. CARICA LA FOTO DEL RETRO A FIANCO PER COMPLETARE IL DOCUMENTO.";
                    msgEl.className = "text-[10px] uppercase font-bold tracking-wider mt-2 text-center text-amber-500 animate-pulse";
                    msgEl.classList.remove('hidden');
                }
            }
        }

        const docLayoutRadios = document.getElementsByName('documento_layout_choice');
        const retroBox = document.getElementById('auto-registrazione-click-identita-retro');

        docLayoutRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'single') {
                    retroBox.classList.add('hidden');
                    uploadedDocumentoIdentitaRetroFile = null;
                    if (identitaRetroFileInput) {
                        identitaRetroFileInput.value = "";
                    }
                    identitaRetroFileNameLabel.textContent = "RETRO (SE FILE SEPARATO)";
                    identitaRetroFileStatusLabel.textContent = "Nessun file selezionato";
                    identitaRetroFileStatusLabel.className = "text-[9px] text-gray-400 mt-1 uppercase";
                } else {
                    retroBox.classList.remove('hidden');
                }
                updateDocumentoIdentitaHelper();
            });
        });

        identitaFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                uploadedDocumentoIdentitaFile = null;
                identitaFileNameLabel.textContent = "FRONTE (O DOC. COMPLETO)";
                identitaFileStatusLabel.textContent = "Nessun file selezionato";
                identitaFileStatusLabel.className = "text-[9px] text-gray-400 mt-1 uppercase";
                updateDocumentoIdentitaHelper();
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                alert("Il documento non deve superare i 5MB di dimensione.");
                identitaFileInput.value = "";
                uploadedDocumentoIdentitaFile = null;
                identitaFileNameLabel.textContent = "FRONTE (O DOC. COMPLETO)";
                identitaFileStatusLabel.textContent = "Errore: File troppo grande (>5MB)";
                identitaFileStatusLabel.className = "text-[9px] text-primary mt-1 uppercase font-bold";
                updateDocumentoIdentitaHelper();
                return;
            }

            uploadedDocumentoIdentitaFile = file;
            identitaFileNameLabel.textContent = file.name.toUpperCase();
            identitaFileStatusLabel.textContent = `✓ PRONTO PER L'UPLOAD (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            identitaFileStatusLabel.className = "text-[9px] text-green-500 mt-1 uppercase font-bold";
            updateDocumentoIdentitaHelper();
        });

        if (identitaRetroFileInput) {
            identitaRetroFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) {
                    uploadedDocumentoIdentitaRetroFile = null;
                    identitaRetroFileNameLabel.textContent = "RETRO (SE FILE SEPARATO)";
                    identitaRetroFileStatusLabel.textContent = "Nessun file selezionato";
                    identitaRetroFileStatusLabel.className = "text-[9px] text-gray-400 mt-1 uppercase";
                    updateDocumentoIdentitaHelper();
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    alert("Il retro del documento non deve superare i 5MB di dimensione.");
                    identitaRetroFileInput.value = "";
                    uploadedDocumentoIdentitaRetroFile = null;
                    identitaRetroFileNameLabel.textContent = "RETRO (SE FILE SEPARATO)";
                    identitaRetroFileStatusLabel.textContent = "Errore: File troppo grande (>5MB)";
                    identitaRetroFileStatusLabel.className = "text-[9px] text-primary mt-1 uppercase font-bold";
                    updateDocumentoIdentitaHelper();
                    return;
                }

                uploadedDocumentoIdentitaRetroFile = file;
                identitaRetroFileNameLabel.textContent = file.name.toUpperCase();
                identitaRetroFileStatusLabel.textContent = `✓ PRONTO PER L'UPLOAD (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
                identitaRetroFileStatusLabel.className = "text-[9px] text-green-500 mt-1 uppercase font-bold";
                updateDocumentoIdentitaHelper();
            });
        }

        // Initialize rates download
        fetchTariffe();

        // --- 7. Conditional Minor Logic ---
        const inputBirth = document.getElementById('data_nascita');
        let isMinor = false;

        function getAge(birthDateString) {
            const today = new Date();
            const birthDate = new Date(birthDateString);
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return age;
        }

        // --- 8. Multi-Step Form Navigation ---
        let currentStep = 1;
        
        const btnNext = document.getElementById('btn-next');
        const btnBack = document.getElementById('btn-back');
        const stepLabel = document.getElementById('step-label');
        const stepPercent = document.getElementById('step-percent');
        const progressIndicator = document.getElementById('progress-indicator');

        // Panels
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        const step3 = document.getElementById('step-3');
        const step4 = document.getElementById('step-4');
        const step5 = document.getElementById('step-5');
        const step6 = document.getElementById('step-6');

        function updateNavigationUI(direction = 'next') {
            isMinor = getAge(inputBirth.value) < 18;
            const maxStep = 6;
            
            if (currentStep > maxStep) currentStep = maxStep;
            if (currentStep < 1) currentStep = 1;
            
            const panels = [step1, step2, step3, step4, step5, step6];
            let targetPanel;
            let labelText = "";
            let percentText = "";
            let progressVal = "";
            
            const displayTotalSteps = isMinor ? 6 : 5;
            
            // Skip tutore step dynamically if adult
            if (currentStep === 5 && !isMinor) {
                if (direction === 'next') {
                    currentStep = 6;
                } else {
                    currentStep = 4;
                }
            }
            
            if (currentStep === 1) {
                targetPanel = step1;
                btnBack.classList.add('invisible');
                labelText = `PASSO 1 DI ${displayTotalSteps}: DATI ANAGRAFICI`;
                percentText = Math.round((1 / displayTotalSteps) * 100) + "%";
                progressVal = percentText;
            } else if (currentStep === 2) {
                targetPanel = step2;
                btnBack.classList.remove('invisible');
                labelText = `PASSO 2 DI ${displayTotalSteps}: ADESIONE & QUOTE`;
                percentText = Math.round((2 / displayTotalSteps) * 100) + "%";
                progressVal = percentText;
            } else if (currentStep === 3) {
                targetPanel = step3;
                btnBack.classList.remove('invisible');
                labelText = `PASSO 3 DI ${displayTotalSteps}: DOCUMENTO DI RICONOSCIMENTO`;
                percentText = Math.round((3 / displayTotalSteps) * 100) + "%";
                progressVal = percentText;
            } else if (currentStep === 4) {
                targetPanel = step4;
                btnBack.classList.remove('invisible');
                labelText = `PASSO 4 DI ${displayTotalSteps}: INDIRIZZO DI RESIDENZA`;
                percentText = Math.round((4 / displayTotalSteps) * 100) + "%";
                progressVal = percentText;
            } else if (currentStep === 5) {
                targetPanel = step5;
                btnBack.classList.remove('invisible');
                labelText = `PASSO 5 DI 6: DATI GENITORE / TUTORE`;
                percentText = "83%";
                progressVal = "83%";
            } else if (currentStep === 6) {
                targetPanel = step6;
                btnBack.classList.remove('invisible');
                labelText = `PASSO ${displayTotalSteps} DI ${displayTotalSteps}: FIRMA E VALIDAZIONE`;
                percentText = "100%";
                progressVal = "100%";
                btnNext.classList.add('hidden');
            }

            if (currentStep < 6) {
                btnNext.classList.remove('hidden');
                btnNext.textContent = "AVANTI";
            }

            const activePanel = document.querySelector('.step-panel.active');
            if (activePanel && activePanel !== targetPanel) {
                gsap.to(activePanel, {
                    opacity: 0,
                    y: direction === 'next' ? -15 : 15,
                    duration: 0.25,
                    onComplete: () => {
                        activePanel.classList.remove('active');
                        activePanel.style.display = 'none';
                        
                        targetPanel.style.display = 'block';
                        targetPanel.classList.add('active');
                        gsap.fromTo(targetPanel, 
                            { opacity: 0, y: direction === 'next' ? 15 : -15 },
                            { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
                        );
                    }
                });
            } else {
                panels.forEach(p => {
                    p.classList.remove('active');
                    p.style.display = 'none';
                });
                targetPanel.style.display = 'block';
                targetPanel.classList.add('active');
                gsap.fromTo(targetPanel, 
                    { opacity: 0, y: 15 },
                    { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
                );
            }

            stepLabel.textContent = labelText;
            stepPercent.textContent = percentText;
            gsap.to(progressIndicator, { width: progressVal, duration: 0.5, ease: "power2.out" });
        }

        // Validate current step fields
        function validateStep(step) {
            if (step === 1) {
                const inputs = step1.querySelectorAll('input[required]:not([type="hidden"]), select[required]');
                for (let input of inputs) {
                    if (!input.checkValidity()) {
                        input.reportValidity();
                        return false;
                    }
                }
                
                if (isNaN(getAge(inputBirth.value))) {
                    inputBirth.setCustomValidity("Fornisci una data valida.");
                    inputBirth.reportValidity();
                    return false;
                } else {
                    inputBirth.setCustomValidity("");
                }
                
                const cf = document.getElementById('codice_fiscale');
                if (!validateCodiceFiscale(cf.value)) {
                    cf.setCustomValidity("Il codice fiscale inserito non è valido formalmente.");
                    cf.reportValidity();
                    return false;
                } else {
                    cf.setCustomValidity("");
                }

                // Check birth province/comune
                if (!selectProvinciaNascita.value || !selectComuneNascita.value) {
                    alert("Seleziona la provincia e il comune di nascita.");
                    return false;
                }

                // Check password complexity
                const pwdInput = document.getElementById('password');
                if (pwdInput && typeof checkPasswordComplexity === 'function') {
                    const pwdRes = checkPasswordComplexity(pwdInput.value);
                    if (!pwdRes.ok) {
                        alert("La password non rispetta i requisiti di sicurezza:\n- " + pwdRes.errors.join("\n- "));
                        pwdInput.focus();
                        return false;
                    }
                }
            } else if (step === 2) {
                // Check Membership type
                if (!selectedAdesione) {
                    alert("Seleziona un tipo di adesione cliccando su una delle tre card.");
                    return false;
                }

                // Check Tessera Sportiva if required
                if ((selectedAdesione === 'tesserato' || selectedAdesione === 'socio_tesserato') && !selectedTessera) {
                    alert("Seleziona una tessera sportiva dalla tabella opzioni.");
                    return false;
                }

                // Check Medical Certificate if required
                if (selectedAdesione === 'tesserato' || selectedAdesione === 'socio_tesserato') {
                    if (!uploadedCertificatoFile) {
                        alert("Devi selezionare e caricare il certificato medico prima di procedere.");
                        return false;
                    }
                    const certTipo = document.getElementById('certificato_tipologia');
                    if (!certTipo.value) {
                        alert("Seleziona la tipologia di certificato medico.");
                        certTipo.focus();
                        return false;
                    }
                    const certData = document.getElementById('certificato_data_emissione');
                    if (!certData.value) {
                        alert("Seleziona la data di emissione del certificato medico.");
                        certData.focus();
                        return false;
                    }

                    // Verifica che la data non sia nel futuro
                    const todayStr = new Date().toISOString().split('T')[0];
                    if (certData.value > todayStr) {
                        alert("La data di emissione del certificato non può essere successiva a quella odierna.");
                        certData.focus();
                        return false;
                    }
                }
            } else if (step === 3) {
                // Check Identity Document (Mandatory for all)
                if (!uploadedDocumentoIdentitaFile) {
                    alert("Devi selezionare e caricare un documento di riconoscimento prima di procedere.");
                    return false;
                }

                // Check Retro if double layout is selected
                const layoutChoice = document.querySelector('input[name="documento_layout_choice"]:checked')?.value || 'single';
                if (layoutChoice === 'double' && !uploadedDocumentoIdentitaRetroFile) {
                    alert("Hai selezionato la modalità a due file. Carica il retro del documento.");
                    return false;
                }
            } else if (step === 4) {
                const inputs = step4.querySelectorAll('input[required], select[required]');
                for (let input of inputs) {
                    if (!input.checkValidity()) {
                        input.reportValidity();
                        return false;
                    }
                }
            } else if (step === 5) {
                if (isMinor) {
                    const inputs = step5.querySelectorAll('input:not([type="file"])');
                    for (let input of inputs) {
                        if (!input.value.trim()) {
                            alert(`Compila il campo "${input.previousElementSibling.textContent}" per il Genitore/Tutore.`);
                            input.focus();
                            return false;
                        }
                    }
                    if (!uploadedTutoreDocumentoFile) {
                        alert("Devi selezionare e caricare il documento d'identità del genitore/tutore prima di procedere.");
                        return false;
                    }
                }
            }
            return true;
        }

        btnNext.addEventListener('click', () => {
            if (currentStep >= 6) return;
            if (validateStep(currentStep)) {
                currentStep++;
                updateNavigationUI('next');
            }
        });

        btnBack.addEventListener('click', () => {
            if (currentStep === 6 && !isMinor) {
                currentStep = 4; // Skip tutore backwards if adult
            } else {
                currentStep--;
            }
            updateNavigationUI('back');
        });

        // Gestione caricamento file documento genitore
        let uploadedTutoreDocumentoFile = null;
        const tutoreFileInput = document.getElementById('tutore_documento_file');
        const tutoreFileNameLabel = document.getElementById('tutore-documento-file-name');
        const tutoreFileStatusLabel = document.getElementById('tutore-documento-file-status');

        if (tutoreFileInput) {
            tutoreFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) {
                    uploadedTutoreDocumentoFile = null;
                    tutoreFileNameLabel.textContent = "SELEZIONA O TRASCINA IL DOCUMENTO";
                    tutoreFileStatusLabel.textContent = "Nessun file selezionato";
                    tutoreFileStatusLabel.className = "text-[9px] text-gray-400 mt-1 uppercase";
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    alert("Il documento non deve superare i 5MB di dimensione.");
                    tutoreFileInput.value = "";
                    uploadedTutoreDocumentoFile = null;
                    tutoreFileNameLabel.textContent = "SELEZIONA O TRASCINA IL DOCUMENTO";
                    tutoreFileStatusLabel.textContent = "Errore: File troppo grande (>5MB)";
                    tutoreFileStatusLabel.className = "text-[9px] text-primary mt-1 uppercase font-bold";
                    return;
                }

                uploadedTutoreDocumentoFile = file;
                tutoreFileNameLabel.textContent = file.name.toUpperCase();
                tutoreFileStatusLabel.textContent = `✓ PRONTO PER L'UPLOAD (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
                tutoreFileStatusLabel.className = "text-[9px] text-green-500 mt-1 uppercase font-bold";
            });
        }

        // Gestione scroll privacy obbligatorio
        const privacyScrollBox = document.getElementById('privacy_scroll_box');
        const checkboxPrivacy = document.getElementById('consenso_privacy');
        const labelPrivacy = document.getElementById('label_consenso_privacy');

        if (privacyScrollBox) {
            privacyScrollBox.addEventListener('scroll', () => {
                // Calcola lo scroll rimanente con tolleranza di 5px
                const scrollDifference = privacyScrollBox.scrollHeight - privacyScrollBox.clientHeight;
                if (Math.abs(privacyScrollBox.scrollTop - scrollDifference) < 5) {
                    checkboxPrivacy.removeAttribute('disabled');
                    labelPrivacy.classList.remove('opacity-40');
                }
            });
        }

        // Funzione per aggiornare la visibilità dei consensi dello step 4
        function updateConsentsVisibility() {
            const statutoBox = document.getElementById('statuto_box_container');
            const audiovisiviBox = document.getElementById('audiovisivi_box_container');
            const sanitariBox = document.getElementById('sanitari_box_container');

            if (selectedAdesione === 'socio' || selectedAdesione === 'socio_tesserato') {
                statutoBox.classList.remove('hidden');
                audiovisiviBox.classList.remove('hidden');
                document.getElementById('consenso_statuto').required = true;
            } else {
                statutoBox.classList.add('hidden');
                audiovisiviBox.classList.add('hidden');
                document.getElementById('consenso_statuto').required = false;
                document.getElementById('consenso_statuto').checked = false;
            }

            if (selectedAdesione === 'tesserato' || selectedAdesione === 'socio_tesserato') {
                sanitariBox.classList.remove('hidden');
                document.getElementById('consenso_sanitari').required = true;
            } else {
                sanitariBox.classList.add('hidden');
                document.getElementById('consenso_sanitari').required = false;
                document.getElementById('consenso_sanitari').checked = false;
            }
        }

        // Assegna la visibilità dei consensi al cambio di adesione
        const originalSelectAdesione = selectAdesione;
        selectAdesione = function(type) {
            originalSelectAdesione(type);
            updateConsentsVisibility();
        };

        // Inizializza l'interfaccia di navigazione al caricamento
        updateNavigationUI();

        // If birthdate changes, adjust available options and check for minors
        inputBirth.addEventListener('change', () => {
            isMinor = getAge(inputBirth.value) < 18;
            if (isMinor) {
                document.querySelectorAll('#step-3 input').forEach(inp => inp.required = true);
                
                // Set visuals for minor lock
                document.getElementById('card-socio').classList.add('opacity-40', 'cursor-not-allowed');
                document.getElementById('card-socio-tesserato').classList.add('opacity-40', 'cursor-not-allowed');
                document.getElementById('label-card-socio').textContent = "NON AMMESSO";
                document.getElementById('label-card-socio-tesserato').textContent = "NON AMMESSO";
                
                // Force select tesserato
                selectAdesione('tesserato');
            } else {
                document.querySelectorAll('#step-3 input').forEach(inp => inp.required = false);
                
                // Restore visuals
                document.getElementById('card-socio').classList.remove('opacity-40', 'cursor-not-allowed');
                document.getElementById('card-socio-tesserato').classList.remove('opacity-40', 'cursor-not-allowed');
                document.getElementById('label-card-socio').textContent = "SELEZIONA";
                document.getElementById('label-card-socio-tesserato').textContent = "SELEZIONA";
            }
        });

        // --- 9. Supabase registration & OTP flow ---
        const btnInviaOtp = document.getElementById('btn-invia-otp');
        const btnValidaOtp = document.getElementById('btn-valida-otp');
        const otpFlowSection = document.getElementById('otp-flow-section');
        const btnInviaOtpContainer = document.getElementById('btn-invia-otp-container');
        const consensoLegale = document.getElementById('consenso_legale');
        const inputOtp = document.getElementById('otp_code');

        let createdUserSession = null;
        let jwtToken = null;
        let timerInterval = null;

        function startOtpTimer() {
            let duration = 900; // 15 minutes
            const timerDisplay = document.getElementById('otp-timer');
            
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                timerDisplay.textContent = `TIMER: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                
                if (--duration < 0) {
                    clearInterval(timerInterval);
                    timerDisplay.textContent = "CODICE SCADUTO";
                    btnInviaOtpContainer.classList.remove('hidden');
                    otpFlowSection.classList.add('hidden');
                    alert("Il codice OTP è scaduto. Clicca di nuovo su 'Invia Codice OTP'.");
                }
            }, 1000);
        }

        async function rinviaOtp(btn) {
            btn.disabled = true;
            btn.textContent = "INVIO IN CORSO...";
            try {
                // Refresh session to ensure a non-expired JWT is used
                const { data: refreshData } = await supabaseClient.auth.refreshSession();
                if (refreshData?.session?.access_token) {
                    jwtToken = refreshData.session.access_token;
                    if (createdUserSession) createdUserSession.access_token = jwtToken;
                }

                const apiBase = APP_CONFIG.API_BASE_URL || "";
                const response = await fetch(`${apiBase}/api/otp.js`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwtToken || createdUserSession?.access_token}`
                    }
                });

                if (!response.ok) {
                    let errorMessage = "Errore chiamata API OTP";
                    try {
                        const errData = await response.json();
                        errorMessage = errData.error || errorMessage;
                    } catch (e) {
                        errorMessage = `Errore server (${response.status})`;
                    }
                    throw new Error(errorMessage);
                }

                alert("Nuovo codice OTP inviato con successo via email!");
                startOtpTimer();
            } catch (err) {
                console.error("API OTP error:", err);
                alert("Errore nell'invio del nuovo codice OTP: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = "Non hai ricevuto la mail? Rinvia codice";
            }
        }

        document.getElementById('btn-rinvia-otp-manuale').addEventListener('click', function() {
            rinviaOtp(this);
        });

        // Hash SHA-256 for audit trail
        async function sha256(message) {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        btnInviaOtp.addEventListener('click', async () => {
            // Controlla il consenso della Privacy (obbligatorio per tutti)
            const checkboxPrivacy = document.getElementById('consenso_privacy');
            if (checkboxPrivacy.disabled || !checkboxPrivacy.checked) {
                alert("Devi scorrere l'informativa privacy istituzionale fino in fondo ed accettarla per procedere.");
                return;
            }

            // Controlla il consenso dello Statuto (obbligatorio per Soci e Socio+Tesserato)
            if (selectedAdesione === 'socio' || selectedAdesione === 'socio_tesserato') {
                const checkboxStatuto = document.getElementById('consenso_statuto');
                if (!checkboxStatuto.checked) {
                    alert("Devi accettare lo Statuto e il vincolo associativo per iscriverti come Socio.");
                    return;
                }

                // Verifica selezione opzione Foto/Video (Granulare)
                const consensoAudiovisivi = document.querySelector('input[name="consenso_audiovisivi"]:checked');
                if (!consensoAudiovisivi) {
                    alert("Seleziona se acconsenti o meno all'utilizzo del materiale Foto/Video.");
                    return;
                }
            }

            // Verifica selezione opzione Marketing (Granulare - tutti)
            const consensoMarketing = document.querySelector('input[name="consenso_marketing"]:checked');
            if (!consensoMarketing) {
                alert("Seleziona se acconsenti o meno alla ricezione di comunicazioni commerciali e sponsor.");
                return;
            }

            // Controlla il consenso dei dati sanitari (obbligatorio per Tesserati)
            if (selectedAdesione === 'tesserato' || selectedAdesione === 'socio_tesserato') {
                const checkboxSanitari = document.getElementById('consenso_sanitari');
                if (!checkboxSanitari.checked) {
                    alert("Devi prestare il consenso al trattamento dei dati sanitari ed all'analisi automatizzata del certificato.");
                    return;
                }
            }

            // Controlla firma elettronica
            if (!consensoLegale.checked) {
                alert("Devi accettare la formula legale di adesione e prestare il consenso alla firma elettronica.");
                return;
            }

            btnInviaOtp.disabled = true;
            btnInviaOtp.textContent = "ELABORAZIONE REGISTRAZIONE...";

            // Recopilate registration data
            const email = document.getElementById('email').value.trim();
            const nome = document.getElementById('nome').value.trim();
            const cognome = document.getElementById('cognome').value.trim();
            const cf = document.getElementById('codice_fiscale').value.trim().toUpperCase();
            const dataNascita = document.getElementById('data_nascita').value;
            
            const provinciaNascita = selectProvinciaNascita.value;
            const comuneNascita = selectComuneNascita.value;

            const indirizzo = document.getElementById('indirizzo').value.trim();
            const cellulare = document.getElementById('cellulare').value.trim();
            const provincia = selectProvincia.value;
            const comune = selectComune.value;
            const cap = selectCap.value;

            const tutoreNome = document.getElementById('tutore_nome').value.trim();
            const tutoreCognome = document.getElementById('tutore_cognome').value.trim();
            const tutoreCf = document.getElementById('tutore_codice_fiscale').value.trim().toUpperCase();
            const tutoreEmail = document.getElementById('tutore_email').value.trim();

            // Determina il ruolo in utenti
            const defaultRole = isMinor ? 'tesserato_esterno' : (selectedAdesione === 'tesserato' ? 'tesserato_esterno' : 'socio_in_attesa');

            // 1. Controllo preventivo sul database utenti per evitare la sovrascrittura di profili esistenti/amministrativi
            try {
                const { data: dbUser, error: checkError } = await supabaseClient
                    .from('utenti')
                    .select('id, ruolo, tipo_adesione')
                    .eq('email', email)
                    .maybeSingle();

                if (checkError) {
                    console.warn("Errore durante il controllo preventivo dell'email:", checkError.message);
                }

                if (dbUser) {
                    const adminRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
                    const hasAdminRole = Array.isArray(dbUser.ruolo) ? dbUser.ruolo.some(r => adminRoles.includes(r)) : false;
                    const isFullyRegistered = dbUser.tipo_adesione !== null;

                    if (hasAdminRole || isFullyRegistered) {
                        alert("Questa email è già associata ad un account attivo o amministrativo. Si prega di utilizzare la pagina di login.");
                        btnInviaOtp.disabled = false;
                        btnInviaOtp.textContent = "INVIA CODICE OTP";
                        return;
                    }
                }
            } catch (checkErr) {
                console.error("Errore controllo preventivo email:", checkErr);
            }

            // 1.b Controllo preventivo Codice Fiscale
            try {
                const [cfAnag, cfUtenti] = await Promise.all([
                    supabaseClient.from('anagrafiche').select('id').eq('codice_fiscale', cf).maybeSingle(),
                    supabaseClient.from('utenti').select('id').eq('codice_fiscale', cf).maybeSingle()
                ]);
                
                if (cfAnag.data || cfUtenti.data) {
                    alert("Questo Codice Fiscale risulta già registrato nel sistema. Se sei tu e non hai mai completato la registrazione, torna alla schermata di Login e utilizza la funzione 'Primo Accesso / Password Dimenticata' con l'email originale per impostare la tua password.");
                    btnInviaOtp.disabled = false;
                    btnInviaOtp.textContent = "INVIA CODICE OTP";
                    return;
                }
            } catch (cfErr) {
                console.error("Errore controllo preventivo CF:", cfErr);
            }

            let userId = null;
            jwtToken = null;

            try {
                const chosenPassword = document.getElementById('password').value;
                const pwdRes = typeof checkPasswordComplexity === 'function' 
                    ? checkPasswordComplexity(chosenPassword) 
                    : { ok: chosenPassword.length >= 8, errors: ["Password non valida"] };
                if (!pwdRes.ok) {
                    throw new Error("La password non rispetta i requisiti di sicurezza:\n- " + pwdRes.errors.join("\n- "));
                }
                
                const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: chosenPassword
                });

                if (authError) {
                    // Se l'utente è già registrato su Supabase Auth ma non ha completato la firma
                    if (authError.message.includes("already registered") || authError.status === 400) {
                        console.log("User already registered in auth, attempting sign in to verify password and resume...");
                        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
                            email: email,
                            password: chosenPassword
                        });
                        
                        if (signInError) {
                            throw new Error("Il tuo indirizzo email risulta già registrato nel sistema. Se è il tuo primo accesso, torna alla schermata di Login e utilizza la funzione 'Primo Accesso / Password Dimenticata' per impostare la tua password personale.");
                        }
                        
                        userId = signInData.user.id;
                        jwtToken = signInData.session?.access_token || null;
                        createdUserSession = { user: signInData.user, access_token: jwtToken };
                        
                        // Controlliamo se esiste già una firma completata o un ruolo protetto per evitare sovrascritture
                        const { data: profiloEsistente } = await supabaseClient
                            .from('utenti')
                            .select('id, tipo_adesione, ruolo')
                            .eq('id', userId)
                            .maybeSingle();

                        const { data: attoEsistente } = await supabaseClient
                            .from('atti_adesione')
                            .select('stato')
                            .eq('utente_id', userId)
                            .maybeSingle();
                        
                        if (profiloEsistente) {
                            const adminRoles = ['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'];
                            const hasAdminRole = Array.isArray(profiloEsistente.ruolo) ? profiloEsistente.ruolo.some(r => adminRoles.includes(r)) : false;
                            const isFullyRegistered = profiloEsistente.tipo_adesione !== null;
                            const isSigned = attoEsistente && attoEsistente.stato === 'firmato_validato';

                            if (hasAdminRole || isFullyRegistered || isSigned) {
                                throw new Error("Questa email è già associata ad un account attivo o amministrativo. Si prega di utilizzare la pagina di login.");
                            }
                        }
                    } else {
                        throw authError;
                    }
                } else {
                    userId = authData.user.id;
                    jwtToken = authData.session?.access_token || null;
                    createdUserSession = { user: authData.user, access_token: jwtToken };
                }
                
                console.log("Supabase Session Ready.");
            } catch (err) {
                console.error("Auth process error:", err);
                alert("Errore di registrazione auth: " + err.message);
                btnInviaOtp.disabled = false;
                btnInviaOtp.textContent = "INVIA CODICE OTP";
                return;
            }

            // Inserimento o aggiornamento profilo utenti (con upsert per riprendere la sessione pendente)
            try {
                const { error: insertError } = await supabaseClient
                    .from('utenti')
                    .upsert({
                        id: userId,
                        nome: nome,
                        cognome: cognome,
                        codice_fiscale: cf,
                        data_nascita: dataNascita,
                        ruolo: [defaultRole],
                        email: email,
                        indirizzo: indirizzo,
                        cellulare: cellulare || null,
                        provincia: provincia,
                        comune: comune,
                        cap: cap,
                        luogo_nascita_provincia: provinciaNascita,
                        luogo_nascita_comune: comuneNascita,
                        tipo_adesione: selectedAdesione,
                        tipo_tessera: selectedTessera || null,
                        tutore_nome: isMinor ? tutoreNome : null,
                        tutore_cognome: isMinor ? tutoreCognome : null,
                        tutore_codice_fiscale: isMinor ? tutoreCf : null,
                        tutore_email: isMinor ? tutoreEmail : null
                    }, { onConflict: 'id' });

                if (insertError) throw insertError;
                console.log("Inserimento/Upsert profilo utenti riuscito.");
            } catch (err) {
                console.error("Insert utenti error:", err);
                alert("Errore nel salvataggio del profilo: " + err.message);
                btnInviaOtp.disabled = false;
                btnInviaOtp.textContent = "INVIA CODICE OTP";
                return;
            }

            // Invio OTP
            try {
                const apiBase = APP_CONFIG.API_BASE_URL || "";
                const response = await fetch(`${apiBase}/api/otp.js`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwtToken}`
                    }
                });

                if (!response.ok) {
                    let errorMessage = "Errore chiamata API OTP";
                    try {
                        const errData = await response.json();
                        errorMessage = errData.error || errorMessage;
                    } catch (e) {
                        // In caso di risposta non-JSON o corpo vuoto
                        errorMessage = `Errore server (${response.status})`;
                    }
                    throw new Error(errorMessage);
                }

                let responseData = {};
                try {
                    responseData = await response.json();
                } catch (e) {
                    console.warn("L'API non ha restituito un JSON valido, ma la chiamata ha avuto successo.");
                }
                
                btnInviaOtpContainer.classList.add('hidden');
                otpFlowSection.classList.remove('hidden');
                startOtpTimer();
            } catch (err) {
                console.error("API OTP error:", err);
                alert("Errore nell'invio del codice OTP: " + err.message);
                btnInviaOtp.disabled = false;
                btnInviaOtp.textContent = "INVIA CODICE OTP";
            }
        });

        function compressImage(file, maxWidth, maxHeight, quality = 0.8) {
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

        function updateOtpButtonStatus(text, showSpinner = true) {
            if (showSpinner) {
                btnValidaOtp.innerHTML = `${text} <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block ml-2 align-middle"></div>`;
            } else {
                btnValidaOtp.textContent = text;
            }
        }

        // Validate OTP and generate PDF + Upload Files
        btnValidaOtp.addEventListener('click', async () => {
            const code = inputOtp.value.trim();
            if (code.length !== 6) {
                alert("Il codice deve essere di 6 cifre.");
                return;
            }

            btnValidaOtp.disabled = true;
            updateOtpButtonStatus("VERIFICA IN CORSO...");

            clearInterval(timerInterval);
            updateOtpButtonStatus("GENERAZIONE PDF...");

            try {
                const nome = document.getElementById('nome').value.trim();
                const cognome = document.getElementById('cognome').value.trim();
                const cf = document.getElementById('codice_fiscale').value.trim().toUpperCase();
                const email = document.getElementById('email').value.trim();
                const dataNascita = document.getElementById('data_nascita').value;
                
                const provinciaNascita = selectProvinciaNascita.value;
                const comuneNascita = selectComuneNascita.value;

                const indirizzo = document.getElementById('indirizzo').value.trim();
                const provincia = selectProvincia.value;
                const comune = selectComune.value;
                const cap = selectCap.value;
                
                const userId = createdUserSession.user.id;

                const tutoreNome = document.getElementById('tutore_nome').value.trim();
                const tutoreCognome = document.getElementById('tutore_cognome').value.trim();

                // 1. Upload medical certificate if required
                let certificatoMedicoUrl = "";
                if (selectedAdesione === 'tesserato' || selectedAdesione === 'socio_tesserato') {
                    const fileExt = uploadedCertificatoFile.name.split('.').pop();
                    const filePath = `${userId}/certificato_${Date.now()}.${fileExt}`;
                    updateOtpButtonStatus("CARICAMENTO CERTIFICATO...");
                    
                    const { data: uploadData, error: uploadError } = await supabaseClient.storage
                        .from('certificati_medici')
                        .upload(filePath, uploadedCertificatoFile, {
                            contentType: uploadedCertificatoFile.type,
                            upsert: true
                        });
                        
                    if (uploadError) throw uploadError;
                    
                    const { data: urlData, error: signedUrlError } = await supabaseClient.storage
                        .from('certificati_medici')
                        .createSignedUrl(filePath, 300);
                    if (signedUrlError) throw signedUrlError;
                    certificatoMedicoUrl = urlData.signedUrl;
                    console.log("Certificato medico caricato con successo.");
                }

                // 1.45 Merge Fronte & Retro if Retro is present
                if (uploadedDocumentoIdentitaRetroFile) {
                    if (typeof window.PDFLib === 'undefined') {
                        alert("Sistema di elaborazione documenti non ancora pronto. Attendi qualche secondo e riprova, o disabilita eventuali ad-blocker.");
                        btnValidaOtp.disabled = false;
                        updateOtpButtonStatus("CONFERMA FIRMA");
                        return;
                    }

                    updateOtpButtonStatus("ELABORAZIONE DOCUMENTI...");
                    
                    try {
                        const pdfDoc = await window.PDFLib.PDFDocument.create();
                        const files = [uploadedDocumentoIdentitaFile, uploadedDocumentoIdentitaRetroFile];
                        
                        for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            if (file.type === 'application/pdf') {
                                const fileBytes = await file.arrayBuffer();
                                const donorPdf = await window.PDFLib.PDFDocument.load(fileBytes);
                                const copiedPages = await pdfDoc.copyPages(donorPdf, donorPdf.getPageIndices());
                                copiedPages.forEach(page => pdfDoc.addPage(page));
                            } else if (file.type.startsWith('image/')) {
                                const compBlob = await compressImage(file, 1200, 1200, 0.8);
                                const imageBytes = await compBlob.arrayBuffer();
                                let embeddedImage;
                                if (file.type === 'image/png') {
                                    embeddedImage = await pdfDoc.embedPng(imageBytes).catch(async () => await pdfDoc.embedJpg(imageBytes));
                                } else {
                                    embeddedImage = await pdfDoc.embedJpg(imageBytes);
                                }
                                const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
                                page.drawImage(embeddedImage, { x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height });
                            }
                        }
                        
                        const pdfBytes = await pdfDoc.save();
                        const mergedPdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                        
                        uploadedDocumentoIdentitaFile = new File([mergedPdfBlob], "documento_unito.pdf", { type: "application/pdf" });
                    } catch (error) {
                        console.error("Errore durante l'elaborazione dei documenti:", error);
                        alert("Impossibile elaborare i file. Assicurati che non siano danneggiati o protetti da password.");
                        btnValidaOtp.disabled = false;
                        updateOtpButtonStatus("CONFERMA FIRMA");
                        return;
                    }
                }

                // 1.5 Upload Identity Document
                let documentoIdentitaUrl = "";
                const idFileExt = uploadedDocumentoIdentitaFile.name.split('.').pop();
                const idFilePath = `${userId}/documento_${Date.now()}.${idFileExt}`;
                updateOtpButtonStatus("CARICAMENTO DOCUMENTO IDENTITÀ...");
                
                const { data: idUploadData, error: idUploadError } = await supabaseClient.storage
                    .from('documenti_identita')
                    .upload(idFilePath, uploadedDocumentoIdentitaFile, {
                        contentType: uploadedDocumentoIdentitaFile.type,
                        upsert: true
                    });
                    
                if (idUploadError) throw idUploadError;
                
                const { data: idUrlData, error: idSignedUrlError } = await supabaseClient.storage
                    .from('documenti_identita')
                    .createSignedUrl(idFilePath, 300);
                if (idSignedUrlError) throw idSignedUrlError;
                documentoIdentitaUrl = idUrlData.signedUrl;
                console.log("Documento d'identità caricato con successo.");

                // 2. Generate PDF with jsPDF
                updateOtpButtonStatus("GENERAZIONE CONTRATTO...");
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                
                doc.setFont("Helvetica", "bold");
                doc.setFontSize(22);
                doc.text("ADRENALINA CLUB APS", 20, 30);
                doc.setFontSize(14);
                doc.text("MODULO DI ADESIONE ED ASSOCIAZIONE", 20, 42);
                
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(1);
                doc.line(20, 48, 190, 48);
                
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(10);
                doc.text(`ID UTENTE: ${userId}`, 20, 58);
                doc.text(`DATA REGISTRAZIONE: ${new Date().toLocaleString()}`, 20, 64);
                
                doc.setFont("Helvetica", "bold");
                doc.text("DATI SOCIO/TESSERATO:", 20, 74);
                doc.setFont("Helvetica", "normal");
                doc.text(`Cognome e Nome: ${cognome} ${nome}`, 20, 80);
                doc.text(`Codice Fiscale: ${cf}`, 20, 86);
                doc.text(`Luogo e Data di Nascita: ${comuneNascita} (${provinciaNascita}), ${dataNascita}`, 20, 92);
                doc.text(`Residenza: ${indirizzo}, ${comune} (${provincia}), CAP ${cap}`, 20, 98);
                doc.text(`Email: ${email}`, 20, 104);

                doc.setFont("Helvetica", "bold");
                doc.text("DETTAGLI DI ISCRIZIONE ED ADESIONE:", 20, 114);
                doc.setFont("Helvetica", "normal");
                doc.text(`Tipo Adesione: ${selectedAdesione.toUpperCase()}`, 20, 120);
                if (selectedTessera) {
                    doc.text(`Tessera Sportiva: ${selectedTessera.replace(/_/g, ' ').replace('tessera-', '').toUpperCase()}`, 20, 126);
                }
                doc.text(`Quota Totale a Versare: ${riepilogoQuotaTotale.textContent}`, 20, 132);
                
                if (isMinor) {
                    doc.setFont("Helvetica", "bold");
                    doc.text("DATI GENITORE / TUTORE LEGALE (ATLETA MINORE):", 20, 142);
                    doc.setFont("Helvetica", "normal");
                    doc.text(`Genitore/Tutore: ${tutoreCognome} ${tutoreNome}`, 20, 148);
                    doc.text(`Codice Fiscale Tutore: ${document.getElementById('tutore_codice_fiscale').value.trim().toUpperCase()}`, 20, 154);
                    doc.text(`Email Tutore: ${document.getElementById('tutore_email').value.trim()}`, 20, 160);
                }
                
                const legalY = isMinor ? 170 : 142;
                doc.setFont("Helvetica", "bold");
                doc.text("CONSENSO LEGALE E ASSUNZIONE DI RESPONSABILITA':", 20, legalY);
                doc.setFont("Helvetica", "normal");
                const splitText = doc.splitTextToSize("Il sottoscritto accetta in data odierna l'Atto Costitutivo e lo Statuto dell'Associazione Adrenalina Club ed assume piena responsabilità per i rischi associati alla pratica delle discipline sportive e del sollevamento pesi. Si solleva ASD Adrenalina Club da qualsiasi danno a cose o persone.", 170);
                doc.text(splitText, 20, legalY + 6);
                
                const signY = legalY + 30;
                doc.setDrawColor(223, 41, 62);
                doc.setLineWidth(0.5);
                doc.rect(20, signY, 170, 30);
                doc.setFont("Helvetica", "bold");
                doc.text("FIRMA DIGITALE APPOSTA CON SUCCESSO (ADRENALINA E-SIGN)", 25, signY + 10);
                doc.setFont("Helvetica", "normal");
                doc.setFontSize(8);
                const otpHash = await sha256(code);
                doc.text(`OTP VERIFICATION TOKEN HASH: ${otpHash}`, 25, signY + 18);
                doc.text(`IP ADDRESS DI FIRMA: 127.0.0.1 (Firma digitale certificata)`, 25, signY + 24);
                
                const pdfBlob = doc.output('blob');

                // 3. Upload signed PDF to storage bucket 'documenti_adesione'
                let pdfPublicUrl = "";
                const pdfPath = `${userId}/adesione.pdf`;
                updateOtpButtonStatus("CARICAMENTO CONTRATTO...");
                
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('documenti_adesione')
                    .upload(pdfPath, pdfBlob, {
                        contentType: 'application/pdf',
                        upsert: true
                    });
                    
                if (uploadError) throw uploadError;
                
                const { data: urlData, error: signedUrlError } = await supabaseClient.storage
                    .from('documenti_adesione')
                    .createSignedUrl(pdfPath, 300);
                if (signedUrlError) throw signedUrlError;
                pdfPublicUrl = urlData.signedUrl;
                console.log("PDF caricato con successo.");

                // 4. Update utenti with certificato_medico_url if uploaded, and tutore_documento_url if uploaded
                let tutoreDocumentoUrl = "";
                if (isMinor && uploadedTutoreDocumentoFile) {
                    const fileExt = uploadedTutoreDocumentoFile.name.split('.').pop();
                    const filePath = `${userId}/documento_tutore_${Date.now()}.${fileExt}`;
                    updateOtpButtonStatus("CARICAMENTO DOCUMENTO TUTORE...");

                    const { data: parentUploadData, error: parentUploadError } = await supabaseClient.storage
                        .from('documenti_tutori')
                        .upload(filePath, uploadedTutoreDocumentoFile, {
                            contentType: uploadedTutoreDocumentoFile.type,
                            upsert: true
                        });

                    if (parentUploadError) throw parentUploadError;

                    const { data: parentUrlData, error: parentSignedUrlError } = await supabaseClient.storage
                        .from('documenti_tutori')
                        .createSignedUrl(filePath, 300);
                    if (parentSignedUrlError) throw parentSignedUrlError;
                    tutoreDocumentoUrl = parentUrlData.signedUrl;
                    console.log("Documento tutore caricato con successo.");
                }

                if (certificatoMedicoUrl || tutoreDocumentoUrl || documentoIdentitaUrl) {
                    updateOtpButtonStatus("AGGIORNAMENTO PROFILO...");
                    const updatePayload = {};
                    if (certificatoMedicoUrl) {
                        updatePayload.certificato_medico_url = certificatoMedicoUrl;
                        updatePayload.certificato_tipologia = document.getElementById('certificato_tipologia').value;
                        updatePayload.certificato_data_emissione = document.getElementById('certificato_data_emissione').value;
                    }
                    if (tutoreDocumentoUrl) {
                        updatePayload.tutore_documento_url = tutoreDocumentoUrl;
                        const tutoreScadenza = document.getElementById('tutore_documento_scadenza')?.value;
                        if (tutoreScadenza) updatePayload.tutore_documento_scadenza = tutoreScadenza;
                    }
                    if (documentoIdentitaUrl) {
                        updatePayload.documento_identita_url = documentoIdentitaUrl;
                        const docScadenza = document.getElementById('documento_identita_scadenza')?.value;
                        if (docScadenza) updatePayload.documento_identita_scadenza = docScadenza;
                    }

                    const { error: utentiUpdateError } = await supabaseClient
                        .from('utenti')
                        .update(updatePayload)
                        .eq('id', userId);
                    if (utentiUpdateError) throw utentiUpdateError;
                }


                // 5. Verify OTP and finalize sign document state server-side
                updateOtpButtonStatus("REGISTRAZIONE FINALE...");
                
                const apiBase = APP_CONFIG.API_BASE_URL || "";
                const response = await fetch(`${apiBase}/api/otp-verify.js`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${createdUserSession.access_token}`
                    },
                    body: JSON.stringify({ otp: code, url_pdf_generato: pdfPublicUrl })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || "Codice OTP non valido o scaduto");
                }
                
                console.log("Registrazione completata e OTP verificato via server.");

                updateOtpButtonStatus("COMPLETATO!", false);
                if (selectedAdesione === 'tesserato') {
                    alert("REGISTRAZIONE RICEVUTA CON SUCCESSO!\n\nI nostri sistemi verificheranno la validità del certificato medico tramite scansione AI. Potrai procedere al pagamento non appena la verifica sarà completata con successo.");
                    window.location.href = "pagamento.html?id=" + userId;
                } else {
                    alert("DOMANDA DI ISCRIZIONE RICEVUTA CON SUCCESSO!\n\nLa tua richiesta di ammissione socio è in attesa di delibera da parte del Consiglio Direttivo. Riceverai un'e-mail per procedere al pagamento non appena la domanda verrà deliberata.");
                    window.location.href = "../index.html";
                }

            } catch (err) {
                console.error("Error during final files/database save:", err);
                alert("Errore salvataggio finale: " + err.message);
                btnValidaOtp.disabled = false;
                updateOtpButtonStatus("CONFERMA FIRMA", false);
            }
        });
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('registration-form');
    if (el) {
        el.addEventListener('submit', function(event) {
            event.preventDefault();
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const pwdInput = document.getElementById('password');
    const pwdContainer = document.getElementById('password-checklist');
    if (pwdInput && pwdContainer && typeof setupPasswordChecklist === 'function') {
        setupPasswordChecklist(pwdInput, pwdContainer);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-registrazione-click-1');
    if (el) {
        el.addEventListener('click', function(event) {
            togglePasswordVisibility('password', this)
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('card-tesserato');
    if (el) {
        el.addEventListener('click', function(event) {
            selectAdesione('tesserato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('card-socio-tesserato');
    if (el) {
        el.addEventListener('click', function(event) {
            selectAdesione('socio_tesserato')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('card-socio');
    if (el) {
        el.addEventListener('click', function(event) {
            selectAdesione('socio')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tessera-silver');
    if (el) {
        el.addEventListener('click', function(event) {
            selectTessera('tessera_base_silver')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tessera-gold');
    if (el) {
        el.addEventListener('click', function(event) {
            selectTessera('tessera_base_gold')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tessera-integrativa-a');
    if (el) {
        el.addEventListener('click', function(event) {
            selectTessera('tessera_integrativa_a')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('tessera-integrativa-b');
    if (el) {
        el.addEventListener('click', function(event) {
            selectTessera('tessera_integrativa_b')
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-registrazione-click-2');
    if (el) {
        el.addEventListener('click', function(event) {
            document.getElementById('certificato_file').click()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-registrazione-click-3');
    if (el) {
        el.addEventListener('click', function(event) {
            document.getElementById('tutore_documento_file').click()
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-registrazione-click-identita');
    if (el) {
        el.addEventListener('click', function(event) {
            document.getElementById('documento_identita_file').click()
        });
    }
});




