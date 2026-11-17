/**
 * portal/safeguarding-public.js
 *
 * Controller client-side completamente stateless per safeguarding.html.
 * - Legge esclusivamente i metadati pubblici della nomina attiva da Supabase (nessun login richiesto).
 * - Non invia né salva alcuna segnalazione su database o API server.
 * - Offusca l'email del Safeguarding Officer contro scraping automatico, ricostruendola solo su azione utente.
 */
(function () {
    'use strict';

    var _currentNomina = null;
    var _encodedEmail = '';

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showActionFeedback(msg, isError) {
        var box = document.getElementById('sf-public-feedback');
        if (!box) return;
        box.classList.remove('hidden', 'border-red-500/40', 'bg-red-500/10', 'text-red-300', 'border-green-500/40', 'bg-green-500/10', 'text-green-300');
        if (isError) {
            box.classList.add('border-red-500/40', 'bg-red-500/10', 'text-red-300');
        } else {
            box.classList.add('border-green-500/40', 'bg-green-500/10', 'text-green-300');
        }
        box.textContent = msg;
    }

    function renderPublicState(rawRecord) {
        var docs = window.SafeguardingDocs;
        if (!docs) return;

        _currentNomina = rawRecord || null;
        var info = docs.normalizeNomina(_currentNomina);

        setText('sf-pub-nome', info.fullName);
        setText('sf-pub-qualifica', info.qualifica);
        setText('sf-pub-verbale', info.numeroVerbale);
        setText('sf-pub-data-nomina', info.dataNomina);
        setText('sf-pub-data-scadenza', info.dataScadenza);

        var badgeEl = document.getElementById('sf-pub-status-badge');
        if (badgeEl) {
            if (info.isConfigured) {
                badgeEl.textContent = 'INCARICO ATTIVO E PUBBLICATO';
                badgeEl.className = 'inline-block text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm border border-green-500/40 bg-green-500/10 text-green-400';
            } else {
                badgeEl.textContent = 'NOMINA IN FASE DI PUBBLICAZIONE';
                badgeEl.className = 'inline-block text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-300';
            }
        }

        ['mocas', 'codice', 'verbale'].forEach(function (docType) {
            var tag = document.getElementById('sf-doc-meta-' + docType);
            if (tag) {
                tag.textContent = info.isConfigured
                    ? ('Delibera ' + info.numeroVerbale + ' del ' + info.dataNomina)
                    : 'Documento predisposto - In attesa di nomina';
            }
        });

        var contactControls = document.getElementById('sf-contact-actions');
        var notConfiguredNotice = document.getElementById('sf-contact-pending');

        if (info.isConfigured) {
            _encodedEmail = docs.encodeEmailPayload(info.email);
            setText('sf-pub-email-masked', docs.maskEmailForDisplay(info.email));
            if (contactControls) contactControls.classList.remove('hidden');
            if (notConfiguredNotice) notConfiguredNotice.classList.add('hidden');
        } else {
            _encodedEmail = '';
            setText('sf-pub-email-masked', 'Canale in fase di attivazione da parte del Direttivo');
            if (contactControls) contactControls.classList.add('hidden');
            if (notConfiguredNotice) notConfiguredNotice.classList.remove('hidden');
        }
    }

    async function loadActiveNomina() {
        try {
            if (typeof window.supabase === 'undefined' || typeof APP_CONFIG === 'undefined') {
                renderPublicState(null);
                return;
            }
            var client = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY, {
                auth: { persistSession: false, autoRefreshToken: false }
            });
            var res = await client
                .from('safeguarding_nomine')
                .select('id, nome_responsabile, cognome_responsabile, email_contatto, qualifica, numero_verbale, data_nomina, data_scadenza, presidente_verbalizzante, segretario_verbalizzante, testo_mocas_custom, testo_codice_custom, testo_verbale_custom, attivo')
                .eq('attivo', true)
                .maybeSingle();

            if (res.error) throw res.error;
            renderPublicState(res.data || null);
        } catch (err) {
            console.error('Errore caricamento Safeguarding pubblico:', err);
            renderPublicState(null);
        }
    }

    function bindActions() {
        var docs = window.SafeguardingDocs;
        if (!docs) return;

        ['mocas', 'codice', 'verbale'].forEach(function (docType) {
            var btnView = document.getElementById('sf-pub-view-' + docType);
            if (btnView) {
                btnView.addEventListener('click', async function () {
                    try {
                        await docs.openPdfPreview(docType, _currentNomina);
                    } catch (err) {
                        console.error('Errore apertura PDF:', err);
                        showActionFeedback('Impossibile generare il PDF in questo momento. Riprova.', true);
                    }
                });
            }

            var btnDown = document.getElementById('sf-pub-dl-' + docType);
            if (btnDown) {
                btnDown.addEventListener('click', async function () {
                    try {
                        await docs.downloadPdf(docType, _currentNomina);
                    } catch (err) {
                        console.error('Errore download PDF:', err);
                        showActionFeedback('Impossibile scaricare il PDF in questo momento. Riprova.', true);
                    }
                });
            }
        });

        var btnMailto = document.getElementById('sf-btn-mailto');
        if (btnMailto) {
            btnMailto.addEventListener('click', function () {
                var email = docs.decodeEmailPayload(_encodedEmail);
                if (!email) {
                    showActionFeedback('Canale email non ancora configurato.', true);
                    return;
                }
                var info = docs.normalizeNomina(_currentNomina);
                window.location.href = docs.buildMailtoHref(email, info.fullName);
            });
        }

        var btnReveal = document.getElementById('sf-btn-reveal-email');
        if (btnReveal) {
            btnReveal.addEventListener('click', function () {
                var email = docs.decodeEmailPayload(_encodedEmail);
                if (!email) return;
                setText('sf-pub-email-masked', email);
                btnReveal.classList.add('hidden');
            });
        }

        var btnCopy = document.getElementById('sf-btn-copy-email');
        if (btnCopy) {
            btnCopy.addEventListener('click', async function () {
                var email = docs.decodeEmailPayload(_encodedEmail);
                if (!email) return;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(email);
                    } else {
                        var tmp = document.createElement('input');
                        tmp.value = email;
                        document.body.appendChild(tmp);
                        tmp.select();
                        document.execCommand('copy');
                        document.body.removeChild(tmp);
                    }
                    setText('sf-pub-email-masked', email);
                    showActionFeedback('Indirizzo email del Responsabile Safeguarding copiato negli appunti.', false);
                } catch (err) {
                    console.error('Errore copia email:', err);
                    setText('sf-pub-email-masked', email);
                    showActionFeedback('Email mostrata sopra: puoi copiarla manualmente.', false);
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindActions();
        loadActiveNomina();
    });
})();
