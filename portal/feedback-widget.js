/**
 * portal/feedback-widget.js
 * 
 * Widget Globale di Segnalazioni & Feedback Utenti per Adrenalina Club.
 * - Floating Action Button desktop / Edge Bookmark laterale a destra su mobile (22px con dismiss)
 * - Ring buffer passivo per errori runtime (window.onerror, unhandledrejection e console.error)
 * - Switch interattivo tra "Suggerimento / Nuova Funzione" e "Errore / Blocco Tecnico"
 * - Cattura Screenshot 1-Click con html2canvas lazy-loaded on-demand con SRI
 * - Compressione automatica client-side via HTML5 Canvas (max 1600px, JPEG 0.75 ~150-250KB)
 * - Raccolta silenziosa dei metadati ambiente (tab attivo, contesto, connessione, durata sessione)
 * - Invio all'endpoint /api/feedback con autenticazione Supabase
 * - Nascosto in stampa (@media print) e con anti-collisione automatica per Timer Dock
 */

(function () {
    'use strict';

    // Evita inizializzazioni multiple
    if (window.__ADR_FEEDBACK_WIDGET_INIT__) return;
    window.__ADR_FEEDBACK_WIDGET_INIT__ = true;

    const VERSION = "1.06.22";

    // Pagine di autenticazione da escludere tassativamente
    const EXCLUDED_PATHS = ['login.html', 'forgot-password.html', 'reset-password.html'];
    const currentPath = window.location.pathname.toLowerCase();
    if (EXCLUDED_PATHS.some(p => currentPath.endsWith(p))) {
        return;
    }

    // ==========================================
    // 1. RING BUFFER PASSIVO ERRORI RUNTIME JS
    // ==========================================
    const MAX_ERRORS = 10;
    const errorRingBuffer = [];

    function pushRuntimeError(err) {
        if (errorRingBuffer.length >= MAX_ERRORS) {
            errorRingBuffer.shift();
        }
        errorRingBuffer.push(err);
    }

    window.addEventListener('error', function (e) {
        try {
            const timeStr = new Date().toTimeString().split(' ')[0];
            const filename = e.filename ? e.filename.split('/').pop().split('?')[0] : 'inline';
            pushRuntimeError({
                message: (e.message || 'Unknown Error').substring(0, 400),
                source: filename,
                lineno: e.lineno || 0,
                colno: e.colno || 0,
                time: timeStr
            });
        } catch (_) {}
    });

    window.addEventListener('unhandledrejection', function (e) {
        try {
            const timeStr = new Date().toTimeString().split(' ')[0];
            let msg = 'Unhandled Promise Rejection';
            if (e.reason) {
                msg = e.reason.message || String(e.reason);
            }
            pushRuntimeError({
                message: msg.substring(0, 400),
                source: 'promise',
                lineno: 0,
                colno: 0,
                time: timeStr
            });
        } catch (_) {}
    });

    // Intercettazione passiva di console.error per catturare errori API/Supabase silenti
    const _origConsoleError = console.error;
    console.error = function (...args) {
        try {
            const timeStr = new Date().toTimeString().split(' ')[0];
            const text = args.map(a => {
                if (typeof a === 'string') return a;
                if (a instanceof Error) return a.message || String(a);
                try { return JSON.stringify(a); } catch (_) { return String(a); }
            }).join(' ');

            pushRuntimeError({
                message: `[console.error] ${text}`.substring(0, 400),
                source: 'console',
                lineno: 0,
                colno: 0,
                time: timeStr
            });
        } catch (_) {}
        _origConsoleError.apply(console, args);
    };

    // ==========================================
    // 2. METADATI AMBIENTE
    // ==========================================
    function getEnvironmentData() {
        const ua = navigator.userAgent || '';
        let browser = 'Unknown';
        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg/')) browser = 'Edge';
        else if (ua.includes('Chrome/')) browser = 'Chrome';
        else if (ua.includes('Safari/')) browser = 'Safari';

        let os = 'Unknown OS';
        if (ua.includes('Win')) os = 'Windows';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';

        // Rileva tab attivo in Dashboard, Nestore o Epika
        let activeTab = null;
        try {
            const visiblePanel = document.querySelector('.tab-panel:not(.hidden)');
            if (visiblePanel && visiblePanel.id) {
                activeTab = visiblePanel.id.replace(/^panel-/, '');
            } else {
                const activeNestore = document.querySelector('[id^="nst-tab-"].active');
                if (activeNestore) activeTab = activeNestore.id.replace(/^nst-tab-/, '');
            }
        } catch (_) {}

        // Rileva contesto ruolo attivo
        let roleContext = null;
        try {
            roleContext = localStorage.getItem('currentViewContext') || null;
        } catch (_) {}

        // Connessione di rete
        let connectionType = null;
        try {
            if (navigator.connection) {
                connectionType = navigator.connection.effectiveType || (navigator.connection.saveData ? 'save-data' : null);
            }
        } catch (_) {}

        return {
            browser: `${browser} (${navigator.userAgentData?.brands?.[0]?.brand || browser})`,
            os: os,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            online: navigator.onLine !== false,
            lang: navigator.language || 'it-IT',
            active_tab: activeTab,
            role_context: roleContext,
            connection: connectionType,
            dpr: window.devicePixelRatio || 1,
            session_sec: Math.round(performance.now() / 1000),
            scroll_y: Math.round(window.scrollY || 0)
        };
    }

    // ==========================================
    // 3. RECUPERO SESSIONE E TOKEN AUTH
    // ==========================================
    async function getAuthToken() {
        if (window.supabaseClient && window.supabaseClient.auth) {
            try {
                const { data } = await window.supabaseClient.auth.getSession();
                if (data?.session?.access_token) return data.session.access_token;
            } catch (_) {}
        }
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    if (parsed?.access_token) return parsed.access_token;
                }
            }
        } catch (_) {}
        return null;
    }

    // ==========================================
    // 4. COMPRESSIONE CLIENT-SIDE IMMAGINI (CANVAS)
    // ==========================================
    function compressImageFile(file, maxDimension = 1600, quality = 0.75) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                return reject(new Error('Formato non valido: carica uno screenshot o un\'immagine.'));
            }
            if (file.size > 5 * 1024 * 1024) {
                return reject(new Error('Il file supera la dimensione massima consentita di 5MB.'));
            }

            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Errore di lettura del file locale.'));
            reader.onload = (ev) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Impossibile decodificare l\'immagine caricata.'));
                img.onload = () => {
                    let w = img.naturalWidth || img.width;
                    let h = img.naturalHeight || img.height;

                    if (w > maxDimension || h > maxDimension) {
                        if (w > h) {
                            h = Math.round((h * maxDimension) / w);
                            w = maxDimension;
                        } else {
                            w = Math.round((w * maxDimension) / h);
                            h = maxDimension;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    const cleanName = (file.name || 'screenshot.jpg').replace(/\.[^.]+$/, '') + '.jpg';
                    const approxBytes = Math.round((base64.length * 3) / 4);

                    resolve({
                        base64,
                        name: cleanName,
                        width: w,
                        height: h,
                        sizeKb: Math.round(approxBytes / 1024)
                    });
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Caricamento on-demand di html2canvas con verifica di integrità crittografica SRI
    function loadHtml2Canvas() {
        if (window.html2canvas) return Promise.resolve(window.html2canvas);
        return new Promise((resolve, reject) => {
            const existing = document.getElementById('adr-html2canvas-script');
            if (existing) {
                existing.addEventListener('load', () => resolve(window.html2canvas));
                existing.addEventListener('error', () => reject(new Error('Impossibile caricare il modulo screenshot.')));
                return;
            }
            const s = document.createElement('script');
            s.id = 'adr-html2canvas-script';
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.integrity = 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA==';
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve(window.html2canvas);
            s.onerror = () => reject(new Error('Impossibile caricare il modulo screenshot dal CDN.'));
            document.head.appendChild(s);
        });
    }

    // ==========================================
    // 5. INIEZIONE STILI CSS DEL WIDGET
    // ==========================================
    function injectWidgetStyles() {
        if (document.getElementById('adr-feedback-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'adr-feedback-widget-styles';
        style.textContent = `
            #adr-feedback-fab {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99980;
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(14, 14, 14, 0.85);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(223, 41, 62, 0.35);
                color: #ffffff;
                padding: 8px 14px 8px 10px;
                border-radius: 9999px;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(223, 41, 62, 0.2);
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s, border-color 0.2s, bottom 0.25s ease;
                user-select: none;
                font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            #adr-feedback-fab:hover {
                transform: translateY(-2px) scale(1.02);
                border-color: #df293e;
                box-shadow: 0 6px 24px rgba(223, 41, 62, 0.35);
            }
            #adr-feedback-fab:active {
                transform: translateY(0) scale(0.98);
            }
            #adr-feedback-fab .fab-icon {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: linear-gradient(135deg, #df293e 0%, #b91c1c 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                box-shadow: 0 2px 8px rgba(223, 41, 62, 0.5);
                font-size: 16px;
            }
            #adr-feedback-fab .fab-label {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: #e5e5e5;
            }
            #adr-feedback-fab .fab-edge-dismiss {
                display: none;
            }

            /* Responsive: Edge Bookmark Laterale sul Bordo Destro su Mobile */
            @media (max-width: 768px) {
                #adr-feedback-fab {
                    position: fixed;
                    top: 36%;
                    bottom: auto !important;
                    right: 0 !important;
                    width: 22px;
                    min-height: 58px;
                    padding: 8px 0 6px 0;
                    flex-direction: column;
                    justify-content: space-between;
                    align-items: center;
                    background: rgba(14, 14, 14, 0.72);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(223, 41, 62, 0.45);
                    border-right: none;
                    border-radius: 8px 0 0 8px;
                    box-shadow: -2px 4px 14px rgba(0, 0, 0, 0.6), 0 0 8px rgba(223, 41, 62, 0.2);
                    gap: 6px;
                }
                #adr-feedback-fab:hover {
                    transform: translateX(-2px);
                    border-color: #df293e;
                }
                #adr-feedback-fab .fab-icon {
                    width: 18px;
                    height: 18px;
                    background: transparent;
                    box-shadow: none;
                    color: #ff4d61;
                    font-size: 14px;
                }
                #adr-feedback-fab .fab-icon span {
                    font-size: 14px !important;
                }
                #adr-feedback-fab .fab-label {
                    display: none;
                }
                #adr-feedback-fab .fab-edge-dismiss {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: none;
                    color: #888888;
                    font-size: 11px;
                    line-height: 1;
                    cursor: pointer;
                    padding: 2px;
                    transition: color 0.15s;
                }
                #adr-feedback-fab .fab-edge-dismiss:hover {
                    color: #ffffff;
                }
            }

            /* Anti-collisione con timer dock aperto solo su desktop */
            @media (min-width: 769px) {
                body.adr-has-dock #adr-feedback-fab {
                    bottom: 96px;
                }
            }

            /* Nascosto in stampa */
            @media print {
                #adr-feedback-fab,
                #adr-feedback-modal-overlay {
                    display: none !important;
                }
            }

            /* Modal Overlay */
            #adr-feedback-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                z-index: 99995;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                animation: adrFadeIn 0.2s ease;
            }
            #adr-feedback-modal-overlay.hidden { display: none !important; }

            @keyframes adrFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes adrSlideUp {
                from { opacity: 0; transform: translateY(16px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            #adr-feedback-card {
                background: #111111;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                width: 100%;
                max-width: 540px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9), 0 0 20px rgba(223, 41, 62, 0.15);
                animation: adrSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                color: #ffffff;
                font-family: 'Manrope', -apple-system, sans-serif;
            }

            .adr-fb-header {
                padding: 18px 22px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .adr-fb-title {
                font-family: 'Orbitron', monospace, sans-serif;
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                color: #ffffff;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .adr-fb-close {
                background: none;
                border: none;
                color: #888888;
                font-size: 20px;
                cursor: pointer;
                transition: color 0.15s;
                padding: 4px;
                line-height: 1;
            }
            .adr-fb-close:hover { color: #ffffff; }

            .adr-fb-body {
                padding: 20px 22px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            /* Switch Tabs Categoria */
            .adr-fb-tabs {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                background: rgba(0, 0, 0, 0.4);
                padding: 4px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.06);
            }
            .adr-fb-tab-btn {
                background: transparent;
                border: 1px solid transparent;
                padding: 8px 12px;
                border-radius: 6px;
                color: #999999;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }
            .adr-fb-tab-btn.active.suggerimento {
                background: rgba(234, 179, 8, 0.15);
                color: #facc15;
                border-color: rgba(234, 179, 8, 0.35);
            }
            .adr-fb-tab-btn.active.bug {
                background: rgba(223, 41, 62, 0.18);
                color: #ff4d61;
                border-color: rgba(223, 41, 62, 0.45);
            }

            /* Diagnostic Banner */
            .adr-fb-diag-banner {
                background: rgba(223, 41, 62, 0.08);
                border: 1px solid rgba(223, 41, 62, 0.25);
                border-radius: 6px;
                padding: 10px 12px;
                font-size: 11px;
                line-height: 1.5;
                color: #fca5a5;
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }

            .adr-fb-field {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .adr-fb-label {
                font-size: 10px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: #888888;
                font-family: 'Orbitron', monospace, sans-serif;
            }
            .adr-fb-input, .adr-fb-textarea {
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 6px;
                padding: 10px 12px;
                color: #ffffff;
                font-family: inherit;
                font-size: 13px;
                transition: border-color 0.2s, background 0.2s;
            }
            .adr-fb-input:focus, .adr-fb-textarea:focus {
                outline: none;
                border-color: #df293e;
                background: rgba(223, 41, 62, 0.04);
            }
            .adr-fb-textarea {
                resize: vertical;
                min-height: 90px;
            }

            /* Screenshot 1-Click e Fallback Upload */
            .adr-fb-capture-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                background: rgba(223, 41, 62, 0.12);
                border: 1px dashed rgba(223, 41, 62, 0.45);
                color: #ffffff;
                padding: 12px 16px;
                border-radius: 6px;
                font-family: inherit;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: background 0.2s, border-color 0.2s, transform 0.1s;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }
            .adr-fb-capture-btn:hover:not(:disabled) {
                background: rgba(223, 41, 62, 0.22);
                border-color: #df293e;
                transform: translateY(-1px);
            }
            .adr-fb-capture-btn:disabled {
                opacity: 0.6;
                cursor: wait;
            }
            .adr-fb-upload-fallback-row {
                display: flex;
                justify-content: center;
                margin-top: 6px;
            }
            .adr-fb-fallback-link {
                background: none;
                border: none;
                color: #888888;
                font-size: 11px;
                font-family: inherit;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 6px;
                transition: color 0.15s;
                text-decoration: underline;
                text-underline-offset: 3px;
            }
            .adr-fb-fallback-link:hover {
                color: #df293e;
            }

            .adr-fb-preview-wrap {
                position: relative;
                display: flex;
                align-items: center;
                gap: 12px;
                background: rgba(255, 255, 255, 0.04);
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .adr-fb-preview-thumb {
                width: 48px;
                height: 48px;
                object-fit: cover;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .adr-fb-preview-info {
                flex: 1;
                font-size: 11px;
                color: #cccccc;
                line-height: 1.4;
            }
            .adr-fb-preview-remove {
                background: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: #ef4444;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                cursor: pointer;
                font-weight: 700;
            }

            /* Submit & Toast */
            .adr-fb-actions {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                padding-top: 4px;
            }
            .adr-fb-btn-cancel {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #888888;
                padding: 9px 16px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                text-transform: uppercase;
            }
            .adr-fb-btn-cancel:hover { color: #ffffff; border-color: rgba(255, 255, 255, 0.3); }
            .adr-fb-btn-submit {
                background: #df293e;
                border: none;
                color: #ffffff;
                padding: 9px 20px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 2px 10px rgba(223, 41, 62, 0.4);
                transition: background 0.15s, transform 0.1s;
            }
            .adr-fb-btn-submit:hover:not(:disabled) {
                background: #b91c1c;
                transform: translateY(-1px);
            }
            .adr-fb-btn-submit:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .adr-fb-toast {
                padding: 10px 14px;
                border-radius: 6px;
                font-size: 12px;
                line-height: 1.4;
                display: none;
            }
            .adr-fb-toast.success {
                display: block;
                background: rgba(16, 185, 129, 0.15);
                border: 1px solid rgba(16, 185, 129, 0.35);
                color: #6ee7b7;
            }
            .adr-fb-toast.error {
                display: block;
                background: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.35);
                color: #fca5a5;
            }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // 6. RENDER FAB E MODALE
    // ==========================================
    let currentCategory = 'SUGGERIMENTO';
    let currentAttachment = null; // { base64, name, sizeKb, width, height }

    function createDOM() {
        // FAB Button / Edge Bookmark
        const fab = document.createElement('div');
        fab.id = 'adr-feedback-fab';
        fab.setAttribute('role', 'button');
        fab.setAttribute('title', 'Segnala un errore o proponi un miglioramento');
        fab.innerHTML = `
            <div class="fab-icon">
                <span class="material-symbols-outlined" style="font-size: 16px;">bug_report</span>
            </div>
            <span class="fab-label">Feedback</span>
            <button type="button" class="fab-edge-dismiss" id="adr-fb-edge-dismiss" title="Nascondi per questa sessione">&times;</button>
        `;
        document.body.appendChild(fab);

        // Se l'utente ha precedentemente chiuso la linguetta su mobile in questa sessione, nascondila
        if (window.innerWidth <= 768 && sessionStorage.getItem('adr_fb_edge_dismissed') === '1') {
            fab.style.display = 'none';
        }

        // Modal Overlay
        const overlay = document.createElement('div');
        overlay.id = 'adr-feedback-modal-overlay';
        overlay.className = 'hidden';
        overlay.innerHTML = `
            <div id="adr-feedback-card" role="dialog" aria-modal="true">
                <div class="adr-fb-header">
                    <div class="adr-fb-title">
                        <span class="material-symbols-outlined" style="color: #df293e; font-size: 18px;">chat_bubble</span>
                        <span>Bacheca Segnalazioni</span>
                    </div>
                    <button type="button" class="adr-fb-close" id="adr-fb-close-btn" aria-label="Chiudi">&times;</button>
                </div>

                <div class="adr-fb-body">
                    <!-- Switch Categoria -->
                    <div class="adr-fb-tabs">
                        <button type="button" class="adr-fb-tab-btn active suggerimento" id="adr-tab-suggerimento">
                            <span>💡</span> Suggerimento
                        </button>
                        <button type="button" class="adr-fb-tab-btn" id="adr-tab-bug">
                            <span>🚨</span> Errore / Blocco
                        </button>
                    </div>

                    <!-- Banner Diagnostico (solo per BUG) -->
                    <div class="adr-fb-diag-banner" id="adr-fb-diag-banner" style="display: none;">
                        <span style="font-size: 15px;">🛡️</span>
                        <div>
                            <b>Diagnosi tecnica attiva:</b> metadati di contesto (tab attivo, browser, errori JS silenti e sessione) verranno allegati per facilitare la risoluzione immediata.
                        </div>
                    </div>

                    <div id="adr-fb-toast" class="adr-fb-toast"></div>

                    <!-- Form Fields -->
                    <div class="adr-fb-field">
                        <label class="adr-fb-label" id="adr-lbl-title">Titolo dell'idea o funzione *</label>
                        <input type="text" class="adr-fb-input" id="adr-fb-input-title" placeholder="Es. Filtro rapido soci per data iscrizione..." maxlength="160" required>
                    </div>

                    <div class="adr-fb-field">
                        <label class="adr-fb-label" id="adr-lbl-message">Descrizione dettagliata *</label>
                        <textarea class="adr-fb-textarea" id="adr-fb-input-message" placeholder="Descrivi il miglioramento che vorresti vedere..." maxlength="4000" required></textarea>
                    </div>

                    <!-- Screenshot 1-Click e Fallback Upload -->
                    <div class="adr-fb-field">
                        <label class="adr-fb-label">Schermata della Pagina o Allegato (facoltativo)</label>
                        
                        <div id="adr-fb-upload-container">
                            <button type="button" class="adr-fb-capture-btn" id="adr-fb-capture-btn">
                                <span class="material-symbols-outlined" style="font-size: 18px;">photo_camera</span>
                                <span>Cattura Schermata della Pagina (1-Click)</span>
                            </button>
                            <div class="adr-fb-upload-fallback-row">
                                <button type="button" class="adr-fb-fallback-link" id="adr-fb-upload-fallback-btn">
                                    <span class="material-symbols-outlined" style="font-size: 14px;">attach_file</span>
                                    <span>oppure carica un'immagine dal dispositivo</span>
                                </button>
                                <input type="file" id="adr-fb-file-input" accept="image/*" style="display: none;">
                            </div>
                        </div>

                        <div id="adr-fb-preview-wrap" class="adr-fb-preview-wrap" style="display: none;">
                            <img id="adr-fb-preview-thumb" class="adr-fb-preview-thumb" src="" alt="Anteprima">
                            <div class="adr-fb-preview-info">
                                <div id="adr-fb-preview-name" style="font-weight: 700; color: #fff;">screenshot.jpg</div>
                                <div id="adr-fb-preview-size" style="color: #888888; font-size: 10px;">~180 KB</div>
                            </div>
                            <button type="button" id="adr-fb-preview-remove" class="adr-fb-preview-remove" title="Rimuovi schermata">Rimuovi</button>
                        </div>
                    </div>

                    <!-- Azioni -->
                    <div class="adr-fb-actions">
                        <button type="button" class="adr-fb-btn-cancel" id="adr-fb-cancel-btn">Annulla</button>
                        <button type="button" class="adr-fb-btn-submit" id="adr-fb-submit-btn">
                            <span class="material-symbols-outlined" style="font-size: 15px;">send</span>
                            <span>Invia Segnalazione</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // ==========================================
        // 7. GESTIONE EVENTI UI
        // ==========================================
        const modalOverlay = document.getElementById('adr-feedback-modal-overlay');
        const closeBtn = document.getElementById('adr-fb-close-btn');
        const cancelBtn = document.getElementById('adr-fb-cancel-btn');
        const tabSuggerimento = document.getElementById('adr-tab-suggerimento');
        const tabBug = document.getElementById('adr-tab-bug');
        const diagBanner = document.getElementById('adr-fb-diag-banner');
        const lblTitle = document.getElementById('adr-lbl-title');
        const lblMessage = document.getElementById('adr-lbl-message');
        const inputTitle = document.getElementById('adr-fb-input-title');
        const inputMessage = document.getElementById('adr-fb-input-message');
        const uploadContainer = document.getElementById('adr-fb-upload-container');
        const captureBtn = document.getElementById('adr-fb-capture-btn');
        const uploadFallbackBtn = document.getElementById('adr-fb-upload-fallback-btn');
        const fileInput = document.getElementById('adr-fb-file-input');
        const previewWrap = document.getElementById('adr-fb-preview-wrap');
        const previewThumb = document.getElementById('adr-fb-preview-thumb');
        const previewName = document.getElementById('adr-fb-preview-name');
        const previewSize = document.getElementById('adr-fb-preview-size');
        const previewRemove = document.getElementById('adr-fb-preview-remove');
        const submitBtn = document.getElementById('adr-fb-submit-btn');
        const toast = document.getElementById('adr-fb-toast');
        const dismissBtn = document.getElementById('adr-fb-edge-dismiss');

        function openModal() {
            modalOverlay.classList.remove('hidden');
            inputTitle.focus();
        }

        function closeModal() {
            modalOverlay.classList.add('hidden');
            resetForm();
        }

        function resetForm() {
            inputTitle.value = '';
            inputMessage.value = '';
            currentAttachment = null;
            previewWrap.style.display = 'none';
            if (uploadContainer) uploadContainer.style.display = 'block';
            fileInput.value = '';
            toast.className = 'adr-fb-toast';
            toast.textContent = '';
            setCategory('SUGGERIMENTO');
        }

        function setCategory(cat) {
            currentCategory = cat;
            if (cat === 'SUGGERIMENTO') {
                tabSuggerimento.className = 'adr-fb-tab-btn active suggerimento';
                tabBug.className = 'adr-fb-tab-btn';
                diagBanner.style.display = 'none';
                lblTitle.textContent = 'Titolo dell\'idea o funzione *';
                inputTitle.placeholder = 'Es. Filtro rapido soci per data iscrizione...';
                lblMessage.textContent = 'Descrizione dettagliata *';
                inputMessage.placeholder = 'Descrivi il miglioramento o la nuova funzione che vorresti vedere...';
            } else {
                tabSuggerimento.className = 'adr-fb-tab-btn';
                tabBug.className = 'adr-fb-tab-btn active bug';
                diagBanner.style.display = 'flex';
                lblTitle.textContent = 'Cosa stavi cercando di fare? *';
                inputTitle.placeholder = 'Es. Salvataggio profilo, apertura verbale, caricamento certificato...';
                lblMessage.textContent = 'Cosa è successo esattamente? *';
                inputMessage.placeholder = 'Descrivi il blocco tecnico, eventuali messaggi di errore visualizzati o comportamenti imprevisti...';
            }
        }

        fab.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        if (dismissBtn) {
            dismissBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                sessionStorage.setItem('adr_fb_edge_dismissed', '1');
                fab.style.display = 'none';
            });
        }

        modalOverlay.addEventListener('click', function (e) {
            if (e.target === modalOverlay) closeModal();
        });

        tabSuggerimento.addEventListener('click', () => setCategory('SUGGERIMENTO'));
        tabBug.addEventListener('click', () => setCategory('BUG'));

        // Gestione Cattura Screenshot Automatica 1-Click
        async function capturePageScreenshot() {
            if (!captureBtn) return;
            const origHtml = captureBtn.innerHTML;
            captureBtn.disabled = true;
            captureBtn.innerHTML = `
                <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 16px;">sync</span>
                <span>Cattura in corso...</span>
            `;
            toast.className = 'adr-fb-toast';
            toast.textContent = '';

            try {
                await loadHtml2Canvas();

                // Nasconde temporaneamente la modale e il FAB per fotografare la pagina sottostante pulita
                modalOverlay.style.visibility = 'hidden';
                fab.style.visibility = 'hidden';

                // Doppio frame per consentire al browser di eseguire il render pulito
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

                const canvas = await window.html2canvas(document.body, {
                    useCORS: true,
                    allowTaint: false,
                    logging: false,
                    scale: Math.min(window.devicePixelRatio || 1, 1.5),
                    windowWidth: document.documentElement.clientWidth,
                    windowHeight: window.innerHeight,
                    x: window.scrollX,
                    y: window.scrollY,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    backgroundColor: '#0a0a0a',
                    ignoreElements: (el) => el.id === 'adr-feedback-modal-overlay' || el.id === 'adr-feedback-fab'
                });

                // Ridimensionamento su Canvas
                let w = canvas.width;
                let h = canvas.height;
                const maxDim = 1600;
                let finalCanvas = canvas;

                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                    const resized = document.createElement('canvas');
                    resized.width = w;
                    resized.height = h;
                    const ctx = resized.getContext('2d');
                    ctx.drawImage(canvas, 0, 0, w, h);
                    finalCanvas = resized;
                }

                const base64 = finalCanvas.toDataURL('image/jpeg', 0.75);
                const approxBytes = Math.round((base64.length * 3) / 4);
                const sizeKb = Math.round(approxBytes / 1024);

                currentAttachment = {
                    base64,
                    name: 'screenshot-automatico.jpg',
                    width: w,
                    height: h,
                    sizeKb
                };

                previewThumb.src = base64;
                previewName.textContent = 'screenshot-automatico.jpg';
                previewSize.textContent = `~${sizeKb} KB (Cattura Automatica ${w}x${h}px)`;
                if (uploadContainer) uploadContainer.style.display = 'none';
                previewWrap.style.display = 'flex';

                toast.className = 'adr-fb-toast success';
                toast.textContent = '📸 Schermata della pagina catturata con successo!';

            } catch (err) {
                console.warn('[FEEDBACK] Cattura automatica fallita, fallback:', err);
                toast.className = 'adr-fb-toast error';
                toast.textContent = 'Impossibile catturare automaticamente lo schermo. Puoi caricare un file manualmente.';
            } finally {
                modalOverlay.style.visibility = '';
                fab.style.visibility = '';
                captureBtn.disabled = false;
                captureBtn.innerHTML = origHtml;
            }
        }

        if (captureBtn) {
            captureBtn.addEventListener('click', capturePageScreenshot);
        }

        // File upload trigger fallback
        if (uploadFallbackBtn) {
            uploadFallbackBtn.addEventListener('click', () => fileInput.click());
        }

        fileInput.addEventListener('change', () => {
            if (fileInput.files?.[0]) {
                handleFileSelection(fileInput.files[0]);
            }
        });

        async function handleFileSelection(file) {
            try {
                toast.className = 'adr-fb-toast';
                const compressed = await compressImageFile(file);
                currentAttachment = compressed;
                previewThumb.src = compressed.base64;
                previewName.textContent = compressed.name;
                previewSize.textContent = `~${compressed.sizeKb} KB (Canvas ${compressed.width}x${compressed.height}px)`;
                if (uploadContainer) uploadContainer.style.display = 'none';
                previewWrap.style.display = 'flex';
            } catch (err) {
                toast.className = 'adr-fb-toast error';
                toast.textContent = err.message || 'Errore durante la compressione dell\'allegato.';
            }
        }

        previewRemove.addEventListener('click', () => {
            currentAttachment = null;
            fileInput.value = '';
            previewWrap.style.display = 'none';
            if (uploadContainer) uploadContainer.style.display = 'block';
        });

        // ==========================================
        // 8. INVIO REPORT AL BACKEND
        // ==========================================
        submitBtn.addEventListener('click', async () => {
            const title = inputTitle.value.trim();
            const message = inputMessage.value.trim();

            if (title.length < 3) {
                toast.className = 'adr-fb-toast error';
                toast.textContent = 'Il titolo deve contenere almeno 3 caratteri.';
                inputTitle.focus();
                return;
            }
            if (message.length < 5) {
                toast.className = 'adr-fb-toast error';
                toast.textContent = 'La descrizione deve contenere almeno 5 caratteri.';
                inputMessage.focus();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size: 15px;">sync</span>
                <span>Invio in corso...</span>
            `;
            toast.className = 'adr-fb-toast';
            toast.textContent = '';

            try {
                const token = await getAuthToken();
                if (!token) {
                    throw new Error('Sessione non valida o scaduta. Effettua nuovamente l\'accesso per inviare la segnalazione.');
                }

                const envData = getEnvironmentData();
                const routeUrl = window.location.pathname + window.location.search + window.location.hash;

                // Allega il ring buffer degli errori JS runtime solo in caso di BUG
                const diagPayload = {
                    ...envData,
                    errors: currentCategory === 'BUG' ? errorRingBuffer.slice(-10) : []
                };

                const payload = {
                    category: currentCategory,
                    title: title,
                    message: message,
                    page_url: routeUrl,
                    app_version: VERSION,
                    diagnostic_data: diagPayload,
                    attachment_name: currentAttachment ? currentAttachment.name : null,
                    attachment_base64: currentAttachment ? currentAttachment.base64 : null
                };

                const apiBase = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.API_BASE_URL)
                    ? APP_CONFIG.API_BASE_URL
                    : window.location.origin;

                const response = await fetch(`${apiBase}/api/feedback`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Errore durante la registrazione della segnalazione.');
                }

                toast.className = 'adr-fb-toast success';
                toast.textContent = '✅ Segnalazione inviata con successo! Grazie per il tuo contributo.';

                setTimeout(() => {
                    closeModal();
                }, 1600);

            } catch (err) {
                toast.className = 'adr-fb-toast error';
                toast.textContent = err.message || 'Si è verificato un errore di connessione.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 15px;">send</span>
                    <span>Invia Segnalazione</span>
                `;
            }
        });

        // Anti-collision observer con Timer Dock su Desktop
        function checkTimerDockCollision() {
            const dock = document.getElementById('nst-timer-dock-global');
            const hasDock = dock && !dock.classList.contains('dock-hidden') && dock.style.display !== 'none';
            if (hasDock) {
                document.body.classList.add('adr-has-dock');
            } else {
                document.body.classList.remove('adr-has-dock');
            }
        }
        setInterval(checkTimerDockCollision, 1000);
    }

    // Inizializzazione condizionata all'autenticazione
    async function initWidget() {
        injectWidgetStyles();

        // Verifica se l'utente ha una sessione attiva prima di mostrare il FAB
        let hasSession = false;
        for (let attempt = 0; attempt < 5; attempt++) {
            const token = await getAuthToken();
            if (token) {
                hasSession = true;
                break;
            }
            await new Promise(r => setTimeout(r, 400));
        }

        if (hasSession) {
            createDOM();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }

})();
