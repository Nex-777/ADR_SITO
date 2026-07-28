        if (typeof APP_CONFIG === 'undefined') {
            window.APP_CONFIG = {
                SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
                SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
                API_BASE_URL: window.location.origin,
                VERSION: "1.03.45"
            };
        }
        const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
        const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // Security override for window.alert to prevent raw database/exception leak
        const _originalAlert = window.alert;
        window.alert = function(message) {
            if (typeof message === 'string' && (message.toLowerCase().includes('errore') || message.toLowerCase().includes('exception') || message.toLowerCase().includes('failed') || message.toLowerCase().includes('supabase'))) {
                console.error("Technical error alert intercepted:", message);
                _originalAlert("Si è verificato un errore durante l'elaborazione del pagamento. Riprova più tardi.");
            } else {
                _originalAlert(message);
            }
        };

        let utenteId = null;
        let quota = 0;

        async function init() {
            // Check active session first
            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError || !session) {
                showError("Effettua il login per accedere al pagamento.");
                return;
            }

            const params = new URLSearchParams(window.location.search);
            const isCancel = params.get('payment') === 'cancel';

            if (isCancel) {
                document.getElementById('cancel-notification').classList.remove('hidden');
            }

            // Secure user identity retrieval from active session to prevent IDOR
            utenteId = session.user.id;

            try {
                // Fetch utente details directly from Supabase
                const { data: userProfile, error } = await supabaseClient
                    .from('utenti')
                    .select('nome, cognome, email, quota_totale, tipo_adesione, anagrafiche(id, registro_soci(stato_socio), certificati_medici(*))')
                    .eq('id', utenteId)
                    .maybeSingle();

                if (error || !userProfile) {
                    showError("Impossibile recuperare i dettagli dell'associato.");
                    return;
                }

                const anag = Array.isArray(userProfile.anagrafiche) ? userProfile.anagrafiche[0] : userProfile.anagrafiche;
                const regSocio = anag && anag.registro_soci ? (Array.isArray(anag.registro_soci) ? anag.registro_soci[0] : anag.registro_soci) : null;
                let cert = null;
                if (anag && anag.certificati_medici) {
                    if (Array.isArray(anag.certificati_medici)) {
                        const sorted = [...anag.certificati_medici].sort((a, b) => {
                            const valA = a.created_at || a.data_scadenza || a.data_rilascio || '1970-01-01';
                            const valB = b.created_at || b.data_scadenza || b.data_rilascio || '1970-01-01';
                            return new Date(valB) - new Date(valA);
                        });
                        cert = sorted[0];
                    } else {
                        cert = anag.certificati_medici;
                    }
                }

                // Check governance status if they are registering as a member (socio or socio_tesserato)
                if ((userProfile.tipo_adesione === 'socio' || userProfile.tipo_adesione === 'socio_tesserato') && regSocio && regSocio.stato_socio === 'IN_ATTESA_DELIBERA') {
                    showError("La tua domanda di ammissione socio è in attesa di delibera da parte del Consiglio Direttivo. Potrai procedere al pagamento non appena la delibera sarà ratificata.");
                    return;
                }

                // Check medical certificate validation status for sport users
                if (userProfile.tipo_adesione === 'tesserato' || userProfile.tipo_adesione === 'socio_tesserato') {
                    if (!cert) {
                        showError("Certificato medico mancante. Accedi al portale atleti per caricare il certificato medico ed abilitare il pagamento.");
                        return;
                    }
                    const status = cert.stato_validazione;
                    const now = new Date();
                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const scaduto = cert.data_scadenza < todayStr;
                    
                    if (scaduto) {
                        showError("Il tuo certificato medico risulta scaduto. Accedi al portale atleti per caricare un certificato in corso di validità.");
                        return;
                    }
                    if (status === 'ROSSO') {
                        showError(`Il tuo certificato medico è stato rifiutato. Motivo: ${cert.note_ai || 'File non leggibile'}. Ricarica un certificato valido nel portale.`);
                        return;
                    }
                    if (status === 'IN_ATTESA') {
                        showError("Verifica del certificato medico tramite scansione AI in corso. Ricarica questa pagina tra qualche istante per procedere.");
                        return;
                    }
                    if (status === 'GIALLO') {
                        showError("Il tuo certificato medico richiede approvazione manuale da parte della segreteria. Potrai pagare non appena sarà validato.");
                        return;
                    }
                }

                quota = parseFloat(userProfile.quota_totale) || 0;
                if (quota <= 0) {
                    showError("Questa quota è già stata saldata o non presenta importi insoluti.");
                    return;
                }

                // Render page content
                document.getElementById('user-name').textContent = `${userProfile.nome} ${userProfile.cognome}`.toUpperCase();
                document.getElementById('user-email').textContent = userProfile.email;
                document.getElementById('membership-type').textContent = userProfile.tipo_adesione ? userProfile.tipo_adesione.replace(/_/g, ' ') : 'Socio';
                document.getElementById('total-amount').textContent = `€${quota.toFixed(2)}`;

                // Determina la modalità rateale in base all'importo della quota:
                // - Trimestrale (€180): max 3 rate da €60/mese (+ €1,20 spese = €61,20/mese)
                // - Semestrale (€330): max 6 rate da €55/mese (+ €1,10 spese = €56,10/mese)
                // - Annuale (€600): max 12 rate da €50/mese (+ €1,00 spese = €51,00/mese)
                let maxRate = 12;
                let tipoAbbonamento = "Annuale";

                if (quota <= 250) {
                    maxRate = 3;
                    tipoAbbonamento = "Trimestrale";
                } else if (quota <= 450) {
                    maxRate = 6;
                    tipoAbbonamento = "Semestrale";
                } else {
                    maxRate = 12;
                    tipoAbbonamento = "Annuale";
                }
                window.currentMaxRate = maxRate;

                // Se la quota consente la rateizzazione (>= 90€)
                const selectorContainer = document.getElementById('installment-selector-container');
                if (quota >= 90 && selectorContainer) {
                    const monthlyBase = (quota / maxRate);
                    const monthlyFee = monthlyBase * 0.02;
                    const monthlyTotal = monthlyBase + monthlyFee;

                    const ratealeTitle = document.getElementById('plan-rateale-title');
                    if (ratealeTitle) {
                        ratealeTitle.textContent = `Abbonamento Rateale ${tipoAbbonamento} (${maxRate} Rate)`;
                    }

                    const ratealeLabel = document.getElementById('plan-rateale-label');
                    if (ratealeLabel) {
                        ratealeLabel.textContent = `Addebito automatico mensile di €${monthlyTotal.toFixed(2)}/mese (€${monthlyBase.toFixed(2)} quota + €${monthlyFee.toFixed(2)} spese) per ${maxRate} mesi. Cancellazione automatica alla fine del contratto.`;
                    }
                    selectorContainer.classList.remove('hidden');
                }

                document.getElementById('loader').classList.add('hidden');
                document.getElementById('payment-content').classList.remove('hidden');

            } catch (err) {
                console.error("Initialization error:", err);
                showError("Errore di connessione al database.");
            }
        }

        function showError(msg) {
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('payment-content').classList.add('hidden');
            document.getElementById('error-message').textContent = msg;
            document.getElementById('error-box').classList.remove('hidden');
        }

        window.startStripeCheckout = async function startStripeCheckout() {
            const payBtn = document.getElementById('pay-btn');
            payBtn.disabled = true;
            payBtn.innerHTML = `ELABORAZIONE IN CORSO... <div class="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>`;

            try {
                const { data: sessionData } = await supabaseClient.auth.getSession();
                const session = sessionData?.session;
                const token = session?.access_token;
                
                if (!token) {
                    throw new Error("Sessione utente scaduta o non valida. Effettua nuovamente l'accesso.");
                }

                const selectedPlan = document.querySelector('input[name="payment_plan"]:checked')?.value || 'unico';
                const isInstallment = selectedPlan === 'rateale';
                const numRate = isInstallment ? (window.currentMaxRate || 12) : 1;

                const apiBase = APP_CONFIG.API_BASE_URL || "";
                const response = await fetch(`${apiBase}/api/create-checkout-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        is_installment: isInstallment,
                        num_rate: numRate
                    })
                });

                const data = await response.json();
                if (data.url) {
                    // Redirect to Stripe checkout
                    window.location.href = data.url;
                } else {
                    throw new Error(data.error || "Impossibile avviare il checkout.");
                }
            } catch (err) {
                console.error("Stripe Checkout Error:", err);
                alert("Errore nell'avviare il pagamento. Riprova più tardi.");
                payBtn.disabled = false;
                payBtn.innerHTML = `PAGA CON STRIPE <span class="material-symbols-outlined text-xl">credit_card</span>`;
            }
        };

        // Initialize Page
        document.addEventListener('DOMContentLoaded', init);

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('pay-btn');
    if (el) {
        el.addEventListener('click', function(event) {
            startStripeCheckout()
        });
    }
});




