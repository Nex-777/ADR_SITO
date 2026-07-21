/**
 * password-validator.js
 * Modulo centralizzato per la validazione della complessità delle password e la gestione della checklist dinamica UI.
 */

function checkPasswordComplexity(password) {
    const pwd = password || '';
    const minLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

    const errors = [];
    if (!minLength) errors.push("Almeno 8 caratteri");
    if (!hasUpper) errors.push("Almeno una lettera maiuscola (A-Z)");
    if (!hasLower) errors.push("Almeno una lettera minuscola (a-z)");
    if (!hasNumber) errors.push("Almeno un numero (0-9)");
    if (!hasSpecial) errors.push("Almeno un carattere speciale (!@#$%...)");

    const ok = minLength && hasUpper && hasLower && hasNumber && hasSpecial;

    return {
        ok,
        minLength,
        hasUpper,
        hasLower,
        hasNumber,
        hasSpecial,
        errors
    };
}

function setupPasswordChecklist(inputEl, containerEl) {
    if (!inputEl || !containerEl) return;

    // Render HTML structure if container is empty
    if (!containerEl.dataset.initialized) {
        containerEl.innerHTML = `
            <div class="mt-2 space-y-1 text-[10px] font-mono tracking-wider uppercase bg-black/30 p-2.5 border border-white/10 rounded-sm">
                <div class="text-[9px] font-bold text-gray-400 mb-1">Requisiti Password:</div>
                <div id="rule-length" class="flex items-center gap-1.5 text-gray-500 transition-colors">
                    <span class="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Almeno 8 caratteri</span>
                </div>
                <div id="rule-upper" class="flex items-center gap-1.5 text-gray-500 transition-colors">
                    <span class="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Almeno una lettera maiuscola (A-Z)</span>
                </div>
                <div id="rule-lower" class="flex items-center gap-1.5 text-gray-500 transition-colors">
                    <span class="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Almeno una lettera minuscola (a-z)</span>
                </div>
                <div id="rule-number" class="flex items-center gap-1.5 text-gray-500 transition-colors">
                    <span class="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Almeno un numero (0-9)</span>
                </div>
                <div id="rule-special" class="flex items-center gap-1.5 text-gray-500 transition-colors">
                    <span class="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Almeno un carattere speciale (!@#$%...)</span>
                </div>
            </div>
        `;
        containerEl.dataset.initialized = 'true';
    }

    const updateUI = () => {
        const val = inputEl.value;
        const res = checkPasswordComplexity(val);

        const updateRule = (ruleId, isOk) => {
            const el = containerEl.querySelector('#' + ruleId);
            if (!el) return;
            const icon = el.querySelector('.material-symbols-outlined');
            if (isOk) {
                el.className = 'flex items-center gap-1.5 text-green-400 font-bold transition-colors';
                if (icon) icon.textContent = 'check_circle';
            } else {
                el.className = 'flex items-center gap-1.5 text-gray-500 transition-colors';
                if (icon) icon.textContent = 'cancel';
            }
        };

        updateRule('rule-length', res.minLength);
        updateRule('rule-upper', res.hasUpper);
        updateRule('rule-lower', res.hasLower);
        updateRule('rule-number', res.hasNumber);
        updateRule('rule-special', res.hasSpecial);
    };

    inputEl.addEventListener('input', updateUI);
    // Initial evaluation
    updateUI();
}

if (typeof window !== 'undefined') {
    window.checkPasswordComplexity = checkPasswordComplexity;
    window.setupPasswordChecklist = setupPasswordChecklist;
}
if (typeof globalThis !== 'undefined') {
    globalThis.checkPasswordComplexity = checkPasswordComplexity;
    globalThis.setupPasswordChecklist = setupPasswordChecklist;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { checkPasswordComplexity, setupPasswordChecklist };
}
