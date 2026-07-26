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
    const toggleBtn = document.getElementById('toggle-password');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            togglePasswordVisibility('password', this);
        });
    }

    // === FALLBACK ROBUSTO: Intercettazione token di recupero ===
    // Se Supabase non ha rispettato il redirectTo e ha forzato il fallback al Site URL (login.html)
    // intercettiamo il token_hash o il code e reindirizziamo manualmente l'utente alla pagina corretta.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    
    if ((type === 'recovery' || type === 'invite' || type === 'signup') && tokenHash) {
        window.location.href = `reset-password.html?token_hash=${tokenHash}&type=${type}`;
        return; // Blocchiamo l'esecuzione del resto
    }

    // Gestione degli errori provenienti dai reindirizzamenti di Supabase Auth (es. link di recupero scaduti)
    const errorEl = document.getElementById('error-message');
    if (params.has('error') || params.has('error_description')) {
        const errorCode = params.get('error_code');
        let msg = "ERRORE DI AUTENTICAZIONE. IL LINK DI RECUPERO POTREBBE ESSERE SCADUTO.";
        if (errorCode === 'otp_expired' || params.get('error_description')?.toLowerCase().includes('expired')) {
            msg = "IL LINK DI RECUPERO PASSWORD È SCADUTO O GIÀ UTILIZZATO. RICHIEDI UN NUOVO RECUPERO DALLA SCHERMATA SOTTO.";
        }
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.classList.remove('hidden');
        }
    }
});

if (typeof APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {
        SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
        SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
        API_BASE_URL: window.location.origin,
        VERSION: "1.03.28"
    };
}
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL;
const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// === Security: Intercept alerts to prevent technical error leaks ===
const _originalAlert = window.alert;
window.alert = function(msg) {
    if (typeof msg === 'string') {
        const lower = msg.toLowerCase();
        if (lower.includes('supabase') || lower.includes('exception') || lower.includes('failed') || lower.includes('postgres') || lower.includes('rls') || lower.includes('jwt') || lower.includes('token')) {
            return _originalAlert.call(window, 'Si è verificato un errore. Riprova più tardi.');
        }
    }
    return _originalAlert.call(window, msg);
};

const form = document.getElementById('login-form');
const errorEl = document.getElementById('error-message');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.classList.add('hidden');

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            // Controllo del ruolo utente nel database pubblico
            const { data: profile, error: profileError } = await supabaseClient
                .from('utenti')
                .select('ruolo')
                .eq('id', data.user.id)
                .maybeSingle();

            if (profileError || !profile) {
                throw new Error("Profilo utente non trovato nel database.");
            }

            const ruolo = profile.ruolo;

            // Reindirizzamento alla dashboard o alla pagina richiesta
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect');
            if (redirect) {
                window.location.href = redirect;
            } else {
                window.location.href = "dashboard.html";
            }

        } catch (err) {
            console.error("Login error:", err);
            const safeMsg = (typeof err.message === 'string' && (err.message.toLowerCase().includes('supabase') || err.message.toLowerCase().includes('postgres') || err.message.toLowerCase().includes('jwt') || err.message.toLowerCase().includes('rls'))) ? 'CREDENZIALI NON VALIDE. RIPROVA.' : err.message.toUpperCase();
            errorEl.textContent = safeMsg;
            errorEl.classList.remove('hidden');
        }
    });
}




