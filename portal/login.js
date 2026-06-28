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
});

if (typeof APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {
        SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
        SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
        API_BASE_URL: "https://portal.adrenalinaclub.it",
        VERSION: "1.00.74"
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

            // Reindirizzamento alla dashboard per visualizzare lo status
            window.location.href = "dashboard.html";

        } catch (err) {
            console.error("Login error:", err);
            const safeMsg = (typeof err.message === 'string' && (err.message.toLowerCase().includes('supabase') || err.message.toLowerCase().includes('postgres') || err.message.toLowerCase().includes('jwt') || err.message.toLowerCase().includes('rls'))) ? 'CREDENZIALI NON VALIDE. RIPROVA.' : err.message.toUpperCase();
            errorEl.textContent = safeMsg;
            errorEl.classList.remove('hidden');
        }
    });
}
