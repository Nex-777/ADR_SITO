/**
 * portal/dashboard-feedback.js
 * 
 * Modulo Bacheca Segnalazioni & Feedback Utenti (Adrenalina Club)
 * Riservato alla Presidenza (Presidente e Vice Presidente).
 * 
 * Caratteristiche:
 * - Query token/data-efficient: attachment_base64 caricato SOLO on-demand
 * - Optimistic UI (<16ms) per transizione stato DA_LEGGERE -> LETTA su click/apertura
 * - Badge contatore dinamico con split visivo Bug vs Idee
 * - Filtri completi per stato (Attive default, Da leggere, Lette, Risolte, Archivio), categoria e ricerca
 * - Azioni rapide: "✓ Segna Risolta", "📦 Archivia", "↩ Ripristina"
 * - Tasto "Copia per Antigravity" ultra-ottimizzato per LLM (zero fronzoli/emoticon)
 */

export function formatForAntigravity(report) {
    const lines = [];
    
    // 1. Header line: [CATEGORY] vX.X.X route:/path
    const v = report.app_version ? `v${report.app_version}` : 'v?';
    const r = report.page_url ? ` route:${report.page_url}` : '';
    lines.push(`[${report.category || 'BUG'}] ${v}${r}`);

    // 2. Client line: client:Nome Azienda/Utente (email)
    const company = report.company_name || 'Adrenalina Club ASD';
    const email = report.user_email || 'sconosciuto';
    lines.push(`client:${company} (${email})`);

    // 3. Title & Desc (linee compresse senza newlines interne superflue)
    const cleanTitle = (report.title || '').replace(/\r?\n+/g, ' ').trim();
    const cleanDesc = (report.message || '').replace(/\r?\n+/g, ' ').trim();
    lines.push(`title:${cleanTitle}`);
    lines.push(`desc:${cleanDesc}`);

    // 4. Env line (solo se presente e rilevante)
    const diag = report.diagnostic_data || {};
    if (diag.browser || diag.os || diag.viewport) {
        const b = (diag.browser || '').split(' ')[0];
        const o = diag.os || '';
        const vp = diag.viewport || '';
        const envStr = `${b}/${o} ${vp}`.trim();
        if (envStr && envStr !== '/') {
            lines.push(`env:${envStr}`);
        }
    }

    // 5. Err line (solo se presenti errori runtime intercettati)
    if (Array.isArray(diag.errors) && diag.errors.length > 0) {
        diag.errors.forEach(e => {
            const time = e.time ? `[${e.time}] ` : '';
            const src = e.source ? `${e.source}` : '';
            const line = e.lineno ? `:${e.lineno}` : '';
            const col = e.colno ? `:${e.colno}` : '';
            const loc = (src || line) ? ` (${src}${line}${col})` : '';
            lines.push(`err:-${time}${e.message || 'Error'}${loc}`);
        });
    }

    // 6. File line (solo se presente allegato)
    if (report.attachment_name) {
        lines.push(`file:${report.attachment_name}`);
    }

    return lines.join('\n');
}

// In ambiente browser, esponi l'inizializzatore sul window
if (typeof window !== 'undefined') {
    window.formatForAntigravity = formatForAntigravity;

    window.initDashboardFeedback = function (userRoles, currentUser, supabaseClient) {
        const isPresidenza = Array.isArray(userRoles) && 
            (userRoles.includes('presidente') || userRoles.includes('vice_presidente'));

        if (!isPresidenza) return;

        // Unhide Sidebar Button
        const sidebarBtn = document.getElementById('tab-btn-feedback_reports');
        if (sidebarBtn) {
            sidebarBtn.classList.remove('hidden');
            sidebarBtn.addEventListener('click', () => {
                if (typeof window.switchTab === 'function') {
                    window.switchTab('feedback_reports');
                }
            });
        }

        // Cache locale dei dati
        let allReports = [];
        let filterStatus = 'attive'; // 'attive' (default: nasconde archiviate), 'da_leggere', 'letta', 'risolta', 'archivio'
        let filterCategory = 'all'; // 'all', 'BUG', 'SUGGERIMENTO'
        let searchQuery = '';
        const attachmentCache = new Map(); // id -> base64

        // 1. Carica conteggio Da Leggere per il badge
        async function updateBadgeCounters() {
            try {
                const { data, error } = await supabaseClient
                    .from('feedback_reports')
                    .select('id, category')
                    .eq('status', 'DA_LEGGERE');

                if (error) throw error;

                const bugCount = (data || []).filter(r => r.category === 'BUG').length;
                const ideaCount = (data || []).filter(r => r.category === 'SUGGERIMENTO').length;
                const total = bugCount + ideaCount;

                const badgeWrap = document.getElementById('badge-feedback-counter-wrap');
                const badgeBugs = document.getElementById('badge-feedback-bugs');
                const badgeIdeas = document.getElementById('badge-feedback-ideas');

                if (badgeWrap && badgeBugs && badgeIdeas) {
                    if (total > 0) {
                        badgeWrap.classList.remove('hidden');
                        badgeBugs.textContent = bugCount;
                        badgeIdeas.textContent = ideaCount;
                    } else {
                        badgeWrap.classList.add('hidden');
                    }
                }

                // Aggiorna anche contatori nella testata del pannello se presenti
                const statBugs = document.getElementById('fb-stat-bug-count');
                const statIdeas = document.getElementById('fb-stat-idea-count');
                const statTotal = document.getElementById('fb-stat-total-count');
                if (statBugs) statBugs.textContent = bugCount;
                if (statIdeas) statIdeas.textContent = ideaCount;
                if (statTotal) statTotal.textContent = total;

            } catch (err) {
                console.warn('[FEEDBACK] Impossibile aggiornare contatori badge:', err.message);
            }
        }

        // 2. Carica la lista completa delle segnalazioni (escludendo attachment_base64 per risparmiare banda)
        async function fetchReports() {
            const container = document.getElementById('feedback-cards-container');
            if (container) {
                container.innerHTML = `
                    <div class="p-8 text-center text-gray-400 font-headline text-xs uppercase flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined animate-spin text-sm text-primary">sync</span>
                        Caricamento segnalazioni...
                    </div>
                `;
            }

            try {
                const { data, error } = await supabaseClient
                    .from('feedback_reports')
                    .select('id, client_id, company_name, user_email, user_role, category, title, message, page_url, app_version, diagnostic_data, attachment_name, status, admin_notes, created_at, updated_at')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                allReports = data || [];
                renderCards();
                updateBadgeCounters();
            } catch (err) {
                if (container) {
                    container.innerHTML = `
                        <div class="p-6 text-center text-red-400 font-headline text-xs border border-red-500/30 bg-red-950/20">
                            Errore durante il caricamento: ${escapeHtml(err.message)}
                        </div>
                    `;
                }
            }
        }

        // 3. Render delle Card con filtri
        function renderCards() {
            const container = document.getElementById('feedback-cards-container');
            if (!container) return;

            let filtered = allReports.slice();

            // Filtro Stato
            if (filterStatus === 'attive') {
                filtered = filtered.filter(r => r.status !== 'ARCHIVIATA');
            } else if (filterStatus === 'da_leggere') {
                filtered = filtered.filter(r => r.status === 'DA_LEGGERE');
            } else if (filterStatus === 'letta') {
                filtered = filtered.filter(r => r.status === 'LETTA');
            } else if (filterStatus === 'risolta') {
                filtered = filtered.filter(r => r.status === 'RISOLTA');
            } else if (filterStatus === 'archivio') {
                filtered = filtered.filter(r => r.status === 'ARCHIVIATA');
            }

            // Filtro Categoria
            if (filterCategory !== 'all') {
                filtered = filtered.filter(r => r.category === filterCategory);
            }

            // Filtro Ricerca
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                filtered = filtered.filter(r => 
                    (r.title && r.title.toLowerCase().includes(q)) ||
                    (r.message && r.message.toLowerCase().includes(q)) ||
                    (r.company_name && r.company_name.toLowerCase().includes(q)) ||
                    (r.user_email && r.user_email.toLowerCase().includes(q)) ||
                    (r.page_url && r.page_url.toLowerCase().includes(q))
                );
            }

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="border border-white/10 bg-black/40 p-12 text-center text-gray-500 font-headline text-xs uppercase space-y-2">
                        <span class="material-symbols-outlined text-3xl text-gray-600 block">inbox</span>
                        <p>Nessuna segnalazione trovata con i filtri correnti.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = filtered.map(r => renderSingleCardHtml(r)).join('');
            attachCardEventListeners(filtered);
        }

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        function formatDate(isoStr) {
            if (!isoStr) return '-';
            const dt = new Date(isoStr);
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
        }

        function renderSingleCardHtml(r) {
            const isBug = r.category === 'BUG';
            const isUnread = r.status === 'DA_LEGGERE';
            const dateStr = formatDate(r.created_at);

            let statusBadge = '';
            if (r.status === 'DA_LEGGERE') {
                statusBadge = `<span class="bg-red-500/20 text-red-400 border border-red-500/50 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> DA LEGGERE</span>`;
            } else if (r.status === 'LETTA') {
                statusBadge = `<span class="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm">LETTA</span>`;
            } else if (r.status === 'RISOLTA') {
                statusBadge = `<span class="bg-green-500/20 text-green-400 border border-green-500/40 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm">✓ RISOLTA</span>`;
            } else {
                statusBadge = `<span class="bg-gray-700/30 text-gray-400 border border-gray-600/40 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm">📦 ARCHIVIATA</span>`;
            }

            const catBadge = isBug
                ? `<span class="bg-red-950/80 text-red-300 border border-red-500/40 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm">🚨 BUG</span>`
                : `<span class="bg-yellow-950/80 text-yellow-300 border border-yellow-500/40 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm">💡 IDEA</span>`;

            const cardBorder = isUnread ? 'border-primary/50 bg-black/60 shadow-[0_0_15px_rgba(223,41,62,0.15)]' : 'border-white/10 bg-black/40';

            const diag = r.diagnostic_data || {};
            const errors = Array.isArray(diag.errors) ? diag.errors : [];

            return `
                <div class="border ${cardBorder} p-5 space-y-4 transition-all rounded-sm card-feedback-item" id="fb-card-${r.id}" data-report-id="${r.id}" data-status="${r.status}">
                    <!-- Header Card -->
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                        <div class="flex items-center gap-2">
                            ${catBadge}
                            <span class="status-badge-container">${statusBadge}</span>
                            <span class="text-[10px] text-gray-500 font-mono">${dateStr}</span>
                        </div>
                        <div class="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                            ${r.app_version ? `<span>v${escapeHtml(r.app_version)}</span> •` : ''}
                            <span class="text-gray-300 truncate max-w-[200px]" title="${escapeHtml(r.page_url)}">${escapeHtml(r.page_url || '-')}</span>
                        </div>
                    </div>

                    <!-- Titolo e Utente -->
                    <div>
                        <h3 class="font-headline text-sm font-bold text-white uppercase tracking-wider">${escapeHtml(r.title)}</h3>
                        <p class="text-[11px] text-gray-400 mt-1 font-mono">
                            <span class="text-primary font-bold">${escapeHtml(r.company_name)}</span> 
                            (${escapeHtml(r.user_email)}) • Ruolo: <i>${escapeHtml(r.user_role)}</i>
                        </p>
                    </div>

                    <!-- Messaggio -->
                    <div class="bg-white/[0.02] border border-white/5 p-3 rounded-sm text-xs text-gray-200 leading-relaxed font-sans whitespace-pre-wrap">
                        ${escapeHtml(r.message)}
                    </div>

                    <!-- Sezione Diagnostica Tecnico (se presente) -->
                    ${(diag.browser || diag.os || errors.length > 0) ? `
                        <div class="bg-black/50 border border-white/5 p-3 space-y-2 text-[11px] font-mono text-gray-400 rounded-sm">
                            <div class="flex flex-wrap items-center gap-3 text-gray-300">
                                <span>🖥️ ${escapeHtml(diag.browser || '-')} / ${escapeHtml(diag.os || '-')}</span>
                                <span>📐 ${escapeHtml(diag.viewport || '-')}</span>
                                <span>🌐 ${diag.online ? 'Online' : 'Offline'}</span>
                            </div>
                            ${errors.length > 0 ? `
                                <div class="mt-2 pt-2 border-t border-white/5 space-y-1">
                                    <span class="text-red-400 font-bold block text-[10px] uppercase">⚠️ Errori JS Intercettati (${errors.length}):</span>
                                    ${errors.slice(-3).map(e => `
                                        <div class="text-[10px] text-red-300/80 bg-red-950/30 p-1.5 border border-red-900/30 rounded-sm overflow-x-auto">
                                            • ${escapeHtml(e.message)} <span class="text-gray-500">(${escapeHtml(e.source || 'inline')}:${e.lineno || 0}:${e.colno || 0})</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    <!-- Allegato (se presente) -->
                    ${r.attachment_name ? `
                        <div class="flex items-center gap-3 p-2 bg-white/5 border border-white/10 rounded-sm">
                            <span class="material-symbols-outlined text-sm text-primary">image</span>
                            <span class="text-xs text-gray-300 font-mono flex-1 truncate">${escapeHtml(r.attachment_name)}</span>
                            <button type="button" class="btn-view-attachment text-[10px] font-headline font-bold text-primary hover:text-white uppercase transition-colors" data-report-id="${r.id}">
                                Visualizza Screenshot
                            </button>
                        </div>
                    ` : ''}

                    <!-- Note Amministratore (se presenti) -->
                    ${r.admin_notes ? `
                        <div class="text-[11px] text-yellow-300/90 bg-yellow-950/20 border border-yellow-500/20 p-2.5 rounded-sm font-mono">
                            <b class="text-yellow-400">Note Direttivo:</b> ${escapeHtml(r.admin_notes)}
                        </div>
                    ` : ''}

                    <!-- Barra Azioni -->
                    <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <button type="button" class="btn-copy-antigravity bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 text-[10px] font-headline font-bold px-3 py-1.5 uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer rounded-sm" data-report-id="${r.id}">
                            <span class="material-symbols-outlined text-sm">content_copy</span>
                            <span>Copia per Antigravity</span>
                        </button>

                        <div class="flex items-center gap-2">
                            ${r.status !== 'RISOLTA' ? `
                                <button type="button" class="btn-mark-resolved bg-green-950/40 hover:bg-green-900/60 text-green-300 border border-green-500/40 text-[10px] font-headline font-bold px-2.5 py-1.5 uppercase transition-colors cursor-pointer rounded-sm" data-report-id="${r.id}">
                                    ✓ Segna Risolta
                                </button>
                            ` : ''}

                            ${r.status !== 'ARCHIVIATA' ? `
                                <button type="button" class="btn-archive bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 text-[10px] font-headline font-bold px-2.5 py-1.5 uppercase transition-colors cursor-pointer rounded-sm" data-report-id="${r.id}">
                                    📦 Archivia
                                </button>
                            ` : `
                                <button type="button" class="btn-restore bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 border border-blue-500/40 text-[10px] font-headline font-bold px-2.5 py-1.5 uppercase transition-colors cursor-pointer rounded-sm" data-report-id="${r.id}">
                                    ↩ Ripristina
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }

        // 4. Event Listener delle Card & Optimistic UI (<16ms)
        function attachCardEventListeners(filteredList) {
            const reportMap = new Map(filteredList.map(r => [r.id, r]));

            // A. Optimistic UI su click card (se DA_LEGGERE passa a LETTA in <16ms)
            document.querySelectorAll('.card-feedback-item').forEach(cardEl => {
                cardEl.addEventListener('click', (e) => {
                    // Non intercettare se si clicca direttamente sui bottoni azione
                    if (e.target.closest('button')) return;

                    const reportId = cardEl.getAttribute('data-report-id');
                    const rep = reportMap.get(reportId);
                    if (rep && rep.status === 'DA_LEGGERE') {
                        // 1. Optimistic DOM Update (<16ms)
                        rep.status = 'LETTA';
                        cardEl.setAttribute('data-status', 'LETTA');
                        cardEl.classList.remove('border-primary/50', 'shadow-[0_0_15px_rgba(223,41,62,0.15)]');
                        cardEl.classList.add('border-white/10');
                        const badgeContainer = cardEl.querySelector('.status-badge-container');
                        if (badgeContainer) {
                            badgeContainer.innerHTML = `<span class="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-headline font-bold px-2 py-0.5 rounded-sm">LETTA</span>`;
                        }

                        // 2. Decrementa contatori subito
                        updateBadgeCounters();

                        // 3. Persistenza asincrona nel DB
                        supabaseClient
                            .from('feedback_reports')
                            .update({ status: 'LETTA' })
                            .eq('id', reportId)
                            .then(({ error }) => {
                                if (error) console.error('[FEEDBACK] Errore update LETTA:', error.message);
                            });
                    }
                });
            });

            // B. Tasto "Copia per Antigravity"
            document.querySelectorAll('.btn-copy-antigravity').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const reportId = btn.getAttribute('data-report-id');
                    const rep = reportMap.get(reportId);
                    if (!rep) return;

                    const formattedText = formatForAntigravity(rep);
                    navigator.clipboard.writeText(formattedText).then(() => {
                        const originalHtml = btn.innerHTML;
                        btn.innerHTML = `<span class="material-symbols-outlined text-sm text-green-400">check</span><span class="text-green-300">Copiato per Antigravity!</span>`;
                        setTimeout(() => {
                            btn.innerHTML = originalHtml;
                        }, 1800);
                    }).catch(err => {
                        console.error('Errore clipboard:', err);
                    });
                });
            });

            // C. Tasto "✓ Segna Risolta"
            document.querySelectorAll('.btn-mark-resolved').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reportId = btn.getAttribute('data-report-id');
                    const rep = reportMap.get(reportId);
                    if (!rep) return;

                    btn.disabled = true;
                    rep.status = 'RISOLTA';
                    renderCards();

                    await supabaseClient
                        .from('feedback_reports')
                        .update({ status: 'RISOLTA' })
                        .eq('id', reportId);

                    updateBadgeCounters();
                });
            });

            // D. Tasto "📦 Archivia"
            document.querySelectorAll('.btn-archive').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reportId = btn.getAttribute('data-report-id');
                    const rep = reportMap.get(reportId);
                    if (!rep) return;

                    btn.disabled = true;
                    rep.status = 'ARCHIVIATA';
                    renderCards();

                    await supabaseClient
                        .from('feedback_reports')
                        .update({ status: 'ARCHIVIATA' })
                        .eq('id', reportId);

                    updateBadgeCounters();
                });
            });

            // E. Tasto "↩ Ripristina"
            document.querySelectorAll('.btn-restore').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reportId = btn.getAttribute('data-report-id');
                    const rep = reportMap.get(reportId);
                    if (!rep) return;

                    btn.disabled = true;
                    rep.status = 'LETTA';
                    renderCards();

                    await supabaseClient
                        .from('feedback_reports')
                        .update({ status: 'LETTA' })
                        .eq('id', reportId);

                    updateBadgeCounters();
                });
            });

            // F. Visualizza Screenshot On-Demand con Lightbox Modal
            document.querySelectorAll('.btn-view-attachment').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reportId = btn.getAttribute('data-report-id');
                    const rep = reportMap.get(reportId);
                    if (!rep) return;

                    let base64 = attachmentCache.get(reportId);
                    if (!base64) {
                        btn.textContent = 'Caricamento...';
                        const { data, error } = await supabaseClient
                            .from('feedback_reports')
                            .select('attachment_base64')
                            .eq('id', reportId)
                            .single();

                        if (error || !data?.attachment_base64) {
                            alert('Impossibile caricare l\'immagine allegata.');
                            btn.textContent = 'Visualizza Screenshot';
                            return;
                        }
                        base64 = data.attachment_base64;
                        attachmentCache.set(reportId, base64);
                        btn.textContent = 'Visualizza Screenshot';
                    }

                    showScreenshotLightbox(rep.attachment_name || 'Screenshot', base64);
                });
            });
        }

        // 5. Lightbox Modal per Screenshot
        function showScreenshotLightbox(title, base64Src) {
            let lightbox = document.getElementById('fb-screenshot-lightbox');
            if (!lightbox) {
                lightbox = document.createElement('div');
                lightbox.id = 'fb-screenshot-lightbox';
                lightbox.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4';
                lightbox.innerHTML = `
                    <div class="relative max-w-4xl max-h-[90vh] bg-surface-container border border-white/20 p-2 rounded-sm flex flex-col items-center">
                        <div class="w-full flex justify-between items-center px-2 py-1 mb-2 border-b border-white/10">
                            <span id="fb-lightbox-title" class="font-headline text-xs font-bold text-white uppercase"></span>
                            <button type="button" id="fb-lightbox-close" class="text-gray-400 hover:text-white text-lg">&times;</button>
                        </div>
                        <img id="fb-lightbox-img" src="" alt="Screenshot" class="max-h-[80vh] max-w-full object-contain rounded-sm border border-white/5">
                    </div>
                `;
                document.body.appendChild(lightbox);
                document.getElementById('fb-lightbox-close').addEventListener('click', () => {
                    lightbox.classList.add('hidden');
                });
                lightbox.addEventListener('click', (e) => {
                    if (e.target === lightbox) lightbox.classList.add('hidden');
                });
            }

            document.getElementById('fb-lightbox-title').textContent = title;
            document.getElementById('fb-lightbox-img').src = base64Src;
            lightbox.classList.remove('hidden');
        }

        // 6. Hook Filtri UI
        function setupFiltersUI() {
            // Filtri Stato
            const statusBtns = document.querySelectorAll('.fb-filter-status-btn');
            statusBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    statusBtns.forEach(b => {
                        b.classList.remove('bg-primary/20', 'text-white', 'border-primary/50');
                        b.classList.add('text-gray-400', 'border-transparent');
                    });
                    btn.classList.remove('text-gray-400', 'border-transparent');
                    btn.classList.add('bg-primary/20', 'text-white', 'border-primary/50');
                    filterStatus = btn.getAttribute('data-status-filter');
                    renderCards();
                });
            });

            // Filtri Categoria
            const catBtns = document.querySelectorAll('.fb-filter-cat-btn');
            catBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    catBtns.forEach(b => {
                        b.classList.remove('bg-white/10', 'text-white');
                        b.classList.add('text-gray-400');
                    });
                    btn.classList.remove('text-gray-400');
                    btn.classList.add('bg-white/10', 'text-white');
                    filterCategory = btn.getAttribute('data-cat-filter');
                    renderCards();
                });
            });

            // Barra di ricerca
            const searchInput = document.getElementById('fb-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    searchQuery = e.target.value;
                    renderCards();
                });
            }

            // Tasto Ricarica
            const refreshBtn = document.getElementById('fb-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    fetchReports();
                });
            }
        }

        // Esponi hook per caricamento tab
        window.loadFeedbackReports = function () {
            setupFiltersUI();
            fetchReports();
        };

        // Inizializza subito il badge contatore
        updateBadgeCounters();
    };
}
