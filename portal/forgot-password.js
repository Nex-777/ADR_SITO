if (typeof APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {
        SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
        SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
        API_BASE_URL: window.location.origin,
        VERSION: "1.04.28"
    };
}
const supabaseClient = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

const form = document.getElementById('forgot-form');
const messageEl = document.getElementById('message');
const btn = document.getElementById('submit-btn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.classList.add('hidden');
    
    // UI feedback
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `ATTENDERE... <span class="material-symbols-outlined text-xl">hourglass_empty</span>`;

    const email = document.getElementById('email').value.trim();
    // URL fisso assoluto: evita qualsiasi mismatch con la whitelist di Supabase.
    // NOTA: se l'URL del template Reset Password su Supabase usa {{ .RedirectTo }},
    // questo valore deve essere ESATTAMENTE identico a quello inserito nella whitelist
    // di Supabase (Authentication -> URL Configuration -> Redirect URLs).
    const resetUrl = 'https://portal.adrenalinaclub.it/portal/reset-password.html';

        let success = false;
        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: resetUrl
            });

            if (error) throw error;

            success = true;
            messageEl.textContent = "SE L'EMAIL È REGISTRATA NEL SISTEMA, RICEVERAI UN LINK. CONTROLLA ANCHE LO SPAM.";
            messageEl.className = 'text-xs text-green-500 font-bold uppercase';
            
            // Inizia il cooldown di 60 secondi
            let timeLeft = 60;
            btn.innerHTML = `ATTENDI ${timeLeft}s <span class="material-symbols-outlined text-xl">timer</span>`;
            
            const cooldownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(cooldownTimer);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                } else {
                    btn.innerHTML = `ATTENDI ${timeLeft}s <span class="material-symbols-outlined text-xl">timer</span>`;
                }
            }, 1000);

        } catch (err) {
            console.error("Reset password error:", err);
            messageEl.textContent = "SI È VERIFICATO UN ERRORE DURANTE L'INVIO. RIPROVA PIÙ TARDI.";
            messageEl.className = 'text-xs text-primary font-bold uppercase';
        } finally {
            messageEl.classList.remove('hidden');
            if (!success) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    });




