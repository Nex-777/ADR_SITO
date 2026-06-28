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
        API_BASE_URL: "https://portal.adrenalinaclub.it",
        VERSION: "1.00.75"
    };
}
const supabaseClient = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

// Controlla se siamo arrivati qui con un hash (token di recupero)
window.addEventListener('DOMContentLoaded', () => {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) {
        // Se non c'è token nell'url, l'utente è arrivato per sbaglio qui
        const msgEl = document.getElementById('message');
        if (msgEl) {
            msgEl.textContent = 'LINK NON VALIDO O SCADUTO. RICHIEDI UN NUOVO RECUPERO.';
            msgEl.className = 'text-xs text-primary font-bold uppercase block text-center mb-4';
            msgEl.classList.remove('hidden');
        }
        const formEl = document.getElementById('reset-form');
        if (formEl) {
            formEl.style.display = 'none';
        }
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
            // Supabase ha già gestito la sessione grazie all'hash nell'URL
            const { data, error } = await supabaseClient.auth.updateUser({
                password: p1
            });

            if (error) throw error;

            messageEl.textContent = "PASSWORD AGGIORNATA CON SUCCESSO! REINDIRIZZAMENTO AL LOGIN...";
            messageEl.className = 'text-xs text-green-500 font-bold uppercase';
            
            // Redirect dopo 2 secondi
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);

        } catch (err) {
            console.error("Update password error:", err);
            messageEl.textContent = "ERRORE DURANTE L'AGGIORNAMENTO. IL LINK POTREBBE ESSERE SCADUTO.";
            messageEl.className = 'text-xs text-primary font-bold uppercase';
        } finally {
            messageEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

