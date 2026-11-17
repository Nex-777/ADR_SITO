/**
 * portal/dashboard-safeguarding.js
 *
 * Modulo amministrativo Dashboard Presidenza per la gestione Safeguarding (D.Lgs. 36/2021 e 39/2021).
 * Riservato a Presidente e Vice Presidente.
 * Gestisce esclusivamente nomina pubblica, estremi delibera e bozze documentali (nessun dato di segnalazione).
 */
(function () {
    'use strict';

    let _roles = [];
    let _user = null;
    let _sb = null;
    let _auditFn = null;
    let _initialized = false;
    let _activeRecordId = null;

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function showStatusBanner(message, isError) {
        const box = document.getElementById('sf-admin-status');
        if (!box) return;
        box.classList.remove('hidden', 'border-red-500/40', 'bg-red-500/10', 'text-red-300', 'border-green-500/40', 'bg-green-500/10', 'text-green-300');
        if (isError) {
            box.classList.add('border-red-500/40', 'bg-red-500/10', 'text-red-300');
        } else {
            box.classList.add('border-green-500/40', 'bg-green-500/10', 'text-green-300');
        }
        box.textContent = message;
    }

    function hideStatusBanner() {
        const box = document.getElementById('sf-admin-status');
        if (box) box.classList.add('hidden');
    }

    function readFormNomina() {
        const val = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        return {
            id: _activeRecordId,
            nome_responsabile: val('sf-nome'),
            cognome_responsabile: val('sf-cognome'),
            email_contatto: val('sf-email'),
            qualifica: val('sf-qualifica') || 'Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer)',
            numero_verbale: val('sf-verbale'),
            data_nomina: val('sf-data-nomina'),
            data_scadenza: val('sf-data-scadenza'),
            presidente_verbalizzante: val('sf-presidente'),
            segretario_verbalizzante: val('sf-segretario'),
            testo_mocas_custom: val('sf-draft-mocas'),
            testo_codice_custom: val('sf-draft-codice'),
            testo_verbale_custom: val('sf-draft-verbale')
        };
    }

    function updateDraftBadges() {
        ['mocas', 'codice', 'verbale'].forEach((docType) => {
            const textarea = document.getElementById(`sf-draft-${docType}`);
            const badge = document.getElementById(`sf-badge-${docType}`);
            if (!textarea || !badge) return;
            const hasCustom = textarea.value.trim().length > 0;
            badge.textContent = hasCustom ? 'TESTO PERSONALIZZATO' : 'BOZZA LEGALE AUTO-COMPILATA';
            badge.className = hasCustom
                ? 'text-[9px] font-mono font-bold px-2 py-0.5 rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-300 uppercase'
                : 'text-[9px] font-mono font-bold px-2 py-0.5 rounded-sm border border-green-500/40 bg-green-500/10 text-green-300 uppercase';
        });
    }

    function populateForm(record) {
        const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v || '';
        };

        _activeRecordId = record ? record.id : null;
        setVal('sf-nome', record ? record.nome_responsabile : '');
        setVal('sf-cognome', record ? record.cognome_responsabile : '');
        setVal('sf-email', record ? record.email_contatto : '');
        setVal('sf-qualifica', record && record.qualifica ? record.qualifica : 'Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer)');
        setVal('sf-verbale', record ? record.numero_verbale : '');
        setVal('sf-data-nomina', record && record.data_nomina ? record.data_nomina : new Date().toISOString().slice(0, 10));
        setVal('sf-data-scadenza', record ? record.data_scadenza : '');
        setVal('sf-presidente', record ? record.presidente_verbalizzante : '');
        setVal('sf-segretario', record ? record.segretario_verbalizzante : '');
        setVal('sf-draft-mocas', record ? record.testo_mocas_custom : '');
        setVal('sf-draft-codice', record ? record.testo_codice_custom : '');
        setVal('sf-draft-verbale', record ? record.testo_verbale_custom : '');
        updateDraftBadges();

        const summaryBadge = document.getElementById('sf-active-badge');
        if (summaryBadge) {
            if (record && record.attivo) {
                summaryBadge.textContent = `INCARICO ATTIVO: ${record.nome_responsabile} ${record.cognome_responsabile}`;
                summaryBadge.className = 'text-[10px] font-mono font-bold px-2.5 py-1 border border-green-500/40 bg-green-500/10 text-green-300 uppercase rounded-sm';
            } else {
                summaryBadge.textContent = 'NESSUNA NOMINA PUBBLICATA';
                summaryBadge.className = 'text-[10px] font-mono font-bold px-2.5 py-1 border border-amber-500/40 bg-amber-500/10 text-amber-300 uppercase rounded-sm';
            }
        }
    }

    function renderHistoryTable(rows) {
        const tbody = document.getElementById('sf-history-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Nessuna nomina registrata. Compila il modulo sopra per pubblicare il Safeguarding Officer.</td></tr>';
            return;
        }

        rows.forEach((r) => {
            const tr = document.createElement('tr');
            const statoBadge = r.attivo
                ? '<span class="px-2 py-0.5 text-[9px] font-bold border border-green-500/40 bg-green-500/10 text-green-400 rounded-sm">ATTIVO</span>'
                : '<span class="px-2 py-0.5 text-[9px] font-bold border border-white/15 bg-white/5 text-gray-400 rounded-sm">STORICO</span>';
            const dataNom = window.SafeguardingDocs ? window.SafeguardingDocs.formatDateIt(r.data_nomina) : (r.data_nomina || '-');
            const dataFine = r.attivo
                ? (r.data_scadenza ? window.SafeguardingDocs.formatDateIt(r.data_scadenza) : 'In corso')
                : (r.data_fine_incarico ? `Cessato il ${window.SafeguardingDocs.formatDateIt(r.data_fine_incarico)}` : 'Archiviato');

            tr.innerHTML = `
                <td class="p-3 font-bold text-white">${escapeHtml(r.nome_responsabile)} ${escapeHtml(r.cognome_responsabile)}</td>
                <td class="p-3 text-gray-300 lowercase font-mono">${escapeHtml(r.email_contatto)}</td>
                <td class="p-3 text-gray-400 font-mono">${escapeHtml(r.numero_verbale || '-')}</td>
                <td class="p-3 text-gray-400 font-mono">${escapeHtml(dataNom)}</td>
                <td class="p-3 text-gray-400 font-mono">${escapeHtml(dataFine)}</td>
                <td class="p-3 text-right">${statoBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function loadSafeguardingData() {
        if (!_sb) return;
        if (!_roles.some((r) => ['presidente', 'vice_presidente'].includes(r))) return;

        try {
            const { data, error } = await _sb
                .from('safeguarding_nomine')
                .select('id, nome_responsabile, cognome_responsabile, email_contatto, qualifica, numero_verbale, data_nomina, data_scadenza, presidente_verbalizzante, segretario_verbalizzante, testo_mocas_custom, testo_codice_custom, testo_verbale_custom, attivo, data_fine_incarico, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const rows = Array.isArray(data) ? data : [];
            const active = rows.find((r) => r.attivo === true) || null;
            populateForm(active);
            renderHistoryTable(rows);
        } catch (err) {
            console.error('Errore caricamento Safeguarding:', err);
            showStatusBanner('Impossibile caricare i dati Safeguarding. Riprova tra poco.', true);
        }
    }

    async function saveSafeguarding(asNewAppointment) {
        if (!_sb) return;
        hideStatusBanner();

        const form = readFormNomina();
        if (!form.nome_responsabile || !form.cognome_responsabile || !form.email_contatto) {
            showStatusBanner('Compila Nome, Cognome ed Email di contatto del Responsabile Safeguarding.', true);
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_contatto)) {
            showStatusBanner('Inserisci un indirizzo email valido.', true);
            return;
        }

        const btnSave = document.getElementById('sf-btn-save');
        const btnNew = document.getElementById('sf-btn-new');
        if (btnSave) btnSave.disabled = true;
        if (btnNew) btnNew.disabled = true;

        try {
            const { data: savedId, error } = await _sb.rpc('salva_nomina_safeguarding', {
                p_nome: form.nome_responsabile,
                p_cognome: form.cognome_responsabile,
                p_email: form.email_contatto,
                p_qualifica: form.qualifica,
                p_numero_verbale: form.numero_verbale || null,
                p_data_nomina: form.data_nomina || null,
                p_data_scadenza: form.data_scadenza || null,
                p_presidente_verbalizzante: form.presidente_verbalizzante || null,
                p_segretario_verbalizzante: form.segretario_verbalizzante || null,
                p_testo_mocas_custom: form.testo_mocas_custom || null,
                p_testo_codice_custom: form.testo_codice_custom || null,
                p_testo_verbale_custom: form.testo_verbale_custom || null,
                p_nuova_nomina: Boolean(asNewAppointment)
            });

            if (error) throw error;

            if (typeof _auditFn === 'function') {
                await _auditFn(
                    asNewAppointment ? 'NUOVA_NOMINA_SAFEGUARDING' : 'AGGIORNAMENTO_NOMINA_SAFEGUARDING',
                    'safeguarding_nomine',
                    savedId || 'active',
                    {
                        responsabile: `${form.nome_responsabile} ${form.cognome_responsabile}`,
                        numero_verbale: form.numero_verbale || null,
                        data_nomina: form.data_nomina || null
                    }
                );
            }

            await loadSafeguardingData();
            showStatusBanner(
                asNewAppointment
                    ? 'Nuova nomina Safeguarding pubblicata e precedente incarico archiviato nello storico.'
                    : 'Dati Safeguarding salvati e pubblicati immediatamente sul portale pubblico.',
                false
            );
        } catch (err) {
            console.error('Errore salvataggio Safeguarding:', err);
            showStatusBanner('Salvataggio non riuscito. Verifica i campi e i permessi della Presidenza.', true);
        } finally {
            if (btnSave) btnSave.disabled = false;
            if (btnNew) btnNew.disabled = false;
        }
    }

    function bindEvents() {
        if (_initialized) return;
        _initialized = true;

        const formEl = document.getElementById('sf-admin-form');
        if (formEl) {
            formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                saveSafeguarding(false);
            });
        }

        const btnNew = document.getElementById('sf-btn-new');
        if (btnNew) {
            btnNew.addEventListener('click', () => {
                saveSafeguarding(true);
            });
        }

        ['mocas', 'codice', 'verbale'].forEach((docType) => {
            const textarea = document.getElementById(`sf-draft-${docType}`);
            if (textarea) {
                textarea.addEventListener('input', updateDraftBadges);
            }

            const loadBtn = document.getElementById(`sf-load-default-${docType}`);
            if (loadBtn && textarea) {
                loadBtn.addEventListener('click', () => {
                    if (window.SafeguardingDocs) {
                        textarea.value = window.SafeguardingDocs.getDefaultDraft(docType, readFormNomina());
                        updateDraftBadges();
                    }
                });
            }

            const resetBtn = document.getElementById(`sf-reset-default-${docType}`);
            if (resetBtn && textarea) {
                resetBtn.addEventListener('click', () => {
                    textarea.value = '';
                    updateDraftBadges();
                });
            }

            const previewBtn = document.getElementById(`sf-preview-${docType}`);
            if (previewBtn) {
                previewBtn.addEventListener('click', async () => {
                    try {
                        if (window.SafeguardingDocs) {
                            const form = readFormNomina();
                            const custom = form[`testo_${docType}_custom`];
                            await window.SafeguardingDocs.openPdfPreview(docType, form, custom);
                        }
                    } catch (err) {
                        console.error('Errore anteprima PDF:', err);
                        showStatusBanner('Errore durante la generazione dell\'anteprima PDF.', true);
                    }
                });
            }

            const downloadBtn = document.getElementById(`sf-download-${docType}`);
            if (downloadBtn) {
                downloadBtn.addEventListener('click', async () => {
                    try {
                        if (window.SafeguardingDocs) {
                            const form = readFormNomina();
                            const custom = form[`testo_${docType}_custom`];
                            await window.SafeguardingDocs.downloadPdf(docType, form, custom);
                        }
                    } catch (err) {
                        console.error('Errore download PDF:', err);
                        showStatusBanner('Errore durante il download del PDF.', true);
                    }
                });
            }
        });
    }

    window.initDashboardSafeguarding = function (userRoles, currentUser, supabaseClient, scriviAuditLogFn) {
        _roles = Array.isArray(userRoles) ? userRoles : [];
        _user = currentUser || null;
        _sb = supabaseClient || null;
        _auditFn = scriviAuditLogFn || null;

        if (!_roles.some((r) => ['presidente', 'vice_presidente'].includes(r))) {
            return;
        }
        bindEvents();
    };

    window.loadSafeguardingAdmin = function () {
        bindEvents();
        loadSafeguardingData();
    };
})();
