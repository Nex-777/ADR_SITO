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

document.addEventListener('DOMContentLoaded', () => {
    const togglePassword = document.getElementById('toggle-password');
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            togglePasswordVisibility('password', this);
        });
    }

    const toggleConfirm = document.getElementById('toggle-confirm-password');
    if (toggleConfirm) {
        toggleConfirm.addEventListener('click', function() {
            togglePasswordVisibility('confirm-password', this);
        });
    }
});

if (typeof APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {
        SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
        SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
        API_BASE_URL: window.location.origin,
        VERSION: "1.03.80"
    };
}
const supabaseClient = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

// Controlla se siamo arrivati qui con i parametri giusti o con una sessione attiva
window.addEventListener('DOMContentLoaded', async () => {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(window.location.search);
    const hasAccessToken = hash && hash.includes('access_token');
    const hasCode = urlParams.has('code');
    const tokenHash = urlParams.get('token_hash');
    const type = urlParams.get('type');

    let hasSession = false;

    // Controlliamo se c'è già una sessione attiva (es. se Supabase ha già elaborato il token via hash o code PKCE)
    try {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session) {
            hasSession = true;
        }
    } catch (e) {
        console.error("Errore recupero sessione:", e);
    }

    // Se non abbiamo una sessione attiva e non ci sono parametri nell'URL, mostriamo l'errore
    if (!hasAccessToken && !hasCode && !hasSession && !(tokenHash && (type === 'recovery' || type === 'invite' || type === 'signup'))) {
        showErrorMessage('LINK NON VALIDO O SCADUTO. RICHIEDI UN NUOVO RECUPERO.');
    }
});

function showErrorMessage(msg) {
    const msgEl = document.getElementById('message');
    if (msgEl) {
        msgEl.textContent = msg;
        msgEl.className = 'text-xs text-primary font-bold uppercase block text-center mb-4';
        msgEl.classList.remove('hidden');
    }
    const formEl = document.getElementById('reset-form');
    if (formEl) {
        formEl.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const pwdInput = document.getElementById('password');
    const pwdContainer = document.getElementById('password-checklist');
    if (pwdInput && pwdContainer && typeof setupPasswordChecklist === 'function') {
        setupPasswordChecklist(pwdInput, pwdContainer);
    }
});

const form = document.getElementById('reset-form');
const messageEl = document.getElementById('message');
const btn = document.getElementById('submit-btn');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageEl.classList.add('hidden');
        
        const p1 = document.getElementById('password').value;
        const p2 = document.getElementById('confirm-password').value;

        if (typeof checkPasswordComplexity === 'function') {
            const pwdRes = checkPasswordComplexity(p1);
            if (!pwdRes.ok) {
                messageEl.textContent = 'LA PASSWORD NON RISPETTA I REQUISITI: ' + pwdRes.errors.join(', ').toUpperCase();
                messageEl.className = 'text-xs text-primary font-bold uppercase block text-center mb-4';
                messageEl.classList.remove('hidden');
                return;
            }
        }

        if (p1 !== p2) {
            messageEl.textContent = 'LE PASSWORD NON COINCIDONO.';
            messageEl.className = 'text-xs text-primary font-bold uppercase';
            messageEl.classList.remove('hidden');
            return;
        }

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `ATTENDERE... <span class="material-symbols-outlined text-xl">hourglass_empty</span>`;

        try {
            // Se siamo arrivati tramite token_hash (dal nuovo link email), dobbiamo prima effettuare il login/verifica OTP
            const urlParams = new URLSearchParams(window.location.search);
            const tokenHash = urlParams.get('token_hash');
            const type = urlParams.get('type');

            if (tokenHash && (type === 'recovery' || type === 'invite' || type === 'signup')) {
                const { error: otpError } = await supabaseClient.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: type
                });
                if (otpError) throw new Error("IL LINK È SCADUTO O GIÀ UTILIZZATO. RICHIEDINE UNO NUOVO.");
            }

            // Una volta verificato (o se c'era già una sessione attiva), aggiorniamo la password dell'utente
            const { data, error } = await supabaseClient.auth.updateUser({
                password: p1
            });

            if (error) throw error;

            // Rimuoviamo i parametri dall'URL per sicurezza
            window.history.replaceState({}, document.title, window.location.pathname);

            messageEl.textContent = "PASSWORD AGGIORNATA CON SUCCESSO! REINDIRIZZAMENTO AL LOGIN...";
            messageEl.className = 'text-xs text-green-500 font-bold uppercase';
            
            // Redirect dopo 2 secondi
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);

        } catch (err) {
            console.error("Update password error:", err);
            const friendlyMsg = err.message || "ERRORE DURANTE L'AGGIORNAMENTO. IL LINK POTREBBE ESSERE SCADUTO.";
            messageEl.textContent = friendlyMsg.toUpperCase();
            messageEl.className = 'text-xs text-primary font-bold uppercase';
        } finally {
            messageEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}




