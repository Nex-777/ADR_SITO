if (typeof APP_CONFIG === 'undefined') {
    window.APP_CONFIG = {
        SUPABASE_URL: "https://zpategmkelqmexetpaot.supabase.co",
        SUPABASE_KEY: "sb_publishable_hiNKo7e_8AKZm64nWou6zQ_YtSOaGQF",
        API_BASE_URL: window.location.origin,
        VERSION: "1.01.39"
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
    // Build absolute URL for redirection
    const resetUrl = window.location.origin + window.location.pathname.replace('forgot-password.html', 'reset-password.html');

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: resetUrl
        });

        if (error) throw error;

        messageEl.textContent = "SE L'EMAIL È REGISTRATA NEL SISTEMA, RICEVERAI UN LINK PER IMPOSTARE LA TUA PASSWORD ENTRO POCHI MINUTI.";
        messageEl.className = 'text-xs text-green-500 font-bold uppercase';
        
    } catch (err) {
        console.error("Reset password error:", err);
        messageEl.textContent = "SI È VERIFICATO UN ERRORE DURANTE L'INVIO. RIPROVA PIÙ TARDI.";
        messageEl.className = 'text-xs text-primary font-bold uppercase';
    } finally {
        messageEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});




