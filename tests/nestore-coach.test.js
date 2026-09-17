import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock browser globals before requiring nestore.js in Node
global.APP_CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key' };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
global.window = global.window || {
    supabase: { createClient: () => ({ from: () => ({ select: () => ({}) }) }) },
    addEventListener: () => {},
    location: { search: '', hash: '' },
    requestAnimationFrame: () => {}
};
global.document = global.document || {
    addEventListener: () => {},
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, textContent: '', innerHTML: '' })
};

describe('Nestore Coach & Admin Dashboard (Fase 2)', () => {
    const htmlPath = path.resolve(__dirname, '../portal/nestore.html');
    const cssPath = path.resolve(__dirname, '../portal/nestore.css');
    const jsPath = path.resolve(__dirname, '../portal/nestore.js');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');

    it('contains coach view switcher in header', () => {
        expect(html).toContain('id="nst-view-switcher"');
        expect(html).toContain('onchange="switchNestoreView(this.value)"');
    });

    it('contains athlete SCHEDE panel and navigation buttons', () => {
        expect(html).toContain('id="nst-schede-panel"');
        expect(html).toContain('id="nst-tab-btn-schede"');
        expect(html).toContain('id="nst-nav-schede"');
        expect(html).toContain('id="nst-atleta-schede-container"');
    });

    it('contains coach and admin container and views', () => {
        expect(html).toContain('id="nst-coach-container"');
        expect(html).toContain('id="nst-coach-list-view"');
        expect(html).toContain('id="nst-coach-atleta-view"');
        expect(html).toContain('id="nst-coach-course-select"');
        expect(html).toContain('id="nst-coach-search-input"');
        expect(html).toContain('id="nst-coach-atleti-container"');
    });

    it('contains athlete inspection subpanels in coach view', () => {
        expect(html).toContain('id="nst-coach-subpanel-schede"');
        expect(html).toContain('id="nst-coach-subpanel-peso"');
        expect(html).toContain('id="nst-coach-subpanel-allenamenti"');
        expect(html).toContain('id="nst-coach-subpanel-dieta"');
        expect(html).toContain('id="nst-coach-subpanel-profilo"');
        expect(html).toContain('chiudiDettaglioAtletaPerCoach()');
    });

    it('contains workout plan creation form with text and word upload modes', () => {
        expect(html).toContain('id="nst-scheda-titolo"');
        expect(html).toContain('id="nst-scheda-periodo"');
        expect(html).toContain('id="nst-scheda-obiettivo"');
        expect(html).toContain('id="nst-scheda-testo-content"');
        expect(html).toContain('id="nst-scheda-word-file"');
        expect(html).toContain('inviaNuovaSchedaCoach()');
        expect(html).toContain('id="nst-modal-scheda-view"');
    });

    it('contains necessary CSS classes in nestore.css', () => {
        expect(css).toContain('.nst-coach-container');
        expect(css).toContain('.nst-coach-athlete-card');
        expect(css).toContain('.nst-scheda-card');
        expect(css).toContain('.nst-file-dropzone');
        expect(css).toContain('.nst-btn-open-atleta');
        expect(css).toContain('.nst-modal-overlay');
    });

    it('exports coach and schede functions in nestore.js', () => {
        require('../portal/nestore.js');
        const target = global.window;
        expect(typeof target.switchNestoreView).toBe('function');
        expect(typeof target.switchNestorePanel).toBe('function');
        expect(typeof target.caricaCoachDashboard).toBe('function');
        expect(typeof target.caricaAdminDashboard).toBe('function');
        expect(typeof target.caricaSchedeAtleta).toBe('function');
        expect(typeof target.escapeHtml).toBe('function');
        expect(typeof target.isIscrizioneAttiva).toBe('function');
    });

    it('escapeHtml safely sanitizes strings in Node without relying on DOM', () => {
        require('../portal/nestore.js');
        const escapeHtml = global.window.escapeHtml;
        expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        expect(escapeHtml("Mario O'Connor & Sons")).toBe('Mario O&#39;Connor &amp; Sons');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('isIscrizioneAttiva correctly evaluates course expiration and remaining entries', () => {
        require('../portal/nestore.js');
        const isIscrizioneAttiva = global.window.isIscrizioneAttiva;
        const today = '2026-09-16';

        // Course with expiration date
        expect(isIscrizioneAttiva({ data_scadenza_corso: '2026-09-20' }, today)).toBe(true);
        expect(isIscrizioneAttiva({ data_scadenza_corso: '2026-09-16' }, today)).toBe(true);
        expect(isIscrizioneAttiva({ data_scadenza_corso: '2026-09-15' }, today)).toBe(false);

        // Course with entries (carnet ingressi)
        expect(isIscrizioneAttiva({ ingressi_totali: 10, ingressi_usati: 5 }, today)).toBe(true);
        expect(isIscrizioneAttiva({ ingressi_totali: 10, ingressi_usati: 10 }, today)).toBe(false);
        expect(isIscrizioneAttiva({ ingressi_totali: 10, ingressi_usati: 11 }, today)).toBe(false);

        // Invalid / null
        expect(isIscrizioneAttiva(null, today)).toBe(false);
    });

    it('prevents XSS by avoiding inline onclick for athlete opening and schede modal in dynamic HTML', () => {
        expect(js).not.toContain('onclick="apriModalSchedaTesto(');
        expect(js).not.toContain('onclick="apriAtletaPerAllenatore(');
        expect(js).toContain('data-atleta-id');
        expect(js).toContain('data-scheda-id');
    });

    it('enforces strict admin check only for presidente', () => {
        // Checking JS source logic to ensure only presidente gets isAuthorizedAdmin
        expect(js).toContain("isAuthorizedAdmin = Array.isArray(profile.ruolo) && profile.ruolo.includes('presidente')");
        expect(js).not.toContain("['presidente', 'vice_presidente'].includes(r)");
    });

    it('switcher only displays options according to specific roles', () => {
        // Verification of switcher generation logic
        expect(js).toContain("if (isIstruttore) {");
        expect(js).toContain("optCoach.value = 'coach'");
        expect(js).toContain("if (isAuthorizedAdmin) {");
        expect(js).toContain("optAdmin.value = 'admin'");
        expect(js).toContain("if (switcher.options.length > 1)");
    });

    it('contains assistance banner in nestore.html and manages it in nestore.js', () => {
        expect(html).toContain('id="nst-assistenza-banner"');
        expect(html).toContain('id="nst-assistenza-target-nome"');
        expect(html).toContain('MODALITÀ ASSISTENZA ATTIVA');
        expect(js).toContain("document.getElementById('nst-assistenza-banner')");
        expect(js).toContain("document.getElementById('nst-assistenza-target-nome')");
    });

    it('recalculates permissions strictly during impersonation without privilege leakage', () => {
        // Must fetch anagrafiche for targetProfile to check registro_istruttori
        expect(js).toContain("select('id, nome, cognome, ruolo, anagrafiche(id, registro_approvazioni(stato))')");
        // Must recalculate isAuthorizedAdmin strictly for targetProfile
        expect(js).toContain("// Ricalcolo permessi per l'utente impersonato (simulazione al 100% dell'utente reale)");
        // Must evaluate hasUnconditionalAccess after the impersonation block
        const impersonateBlockIdx = js.indexOf('if (impersonateId && isAuthorizedAdmin)');
        const unconditionalIdx = js.indexOf('const hasUnconditionalAccess = isBoardMember || isIstruttore;');
        expect(impersonateBlockIdx).toBeGreaterThan(-1);
        expect(unconditionalIdx).toBeGreaterThan(impersonateBlockIdx);
    });

    it('contains IBRIDO BASE programs catalog with exactly 8 programs (Metcon 1-4 and Forza 1-4)', () => {
        require('../portal/nestore.js');
        const catalog = global.window.IBRIDO_PROGRAMMI_CATALOGO;
        expect(Array.isArray(catalog)).toBe(true);
        expect(catalog.length).toBe(8);

        const metcons = catalog.filter(p => p.tipo === 'metcon');
        const forze = catalog.filter(p => p.tipo === 'forza');
        expect(metcons.length).toBe(4);
        expect(forze.length).toBe(4);

        // Metcon 1, 2, 4 use tabata with configurable work and rest
        const m1 = catalog.find(p => p.id === 'ibrido_metcon_1');
        const m2 = catalog.find(p => p.id === 'ibrido_metcon_2');
        const m4 = catalog.find(p => p.id === 'ibrido_metcon_4');
        expect(m1.timer_mode).toBe('tabata');
        expect(m1.work_default).toBe(30);
        expect(m1.rest_default).toBe(30);
        expect(m2.timer_mode).toBe('tabata');
        expect(m4.timer_mode).toBe('tabata');
        expect(m4.work_default).toBe(25);
        expect(m4.rest_default).toBe(35);

        // Metcon 3 and all Forza use stopwatch (with pause and lap)
        const m3 = catalog.find(p => p.id === 'ibrido_metcon_3');
        expect(m3.timer_mode).toBe('stopwatch');
        forze.forEach(f => {
            expect(f.timer_mode).toBe('stopwatch');
            expect(f.esercizi.length).toBeGreaterThanOrEqual(3);
        });
    });

    it('contains HTML components for Ibrido catalog and interactive workout execution', () => {
        expect(html).toContain('id="nst-ibrido-programmi-section"');
        expect(html).toContain('id="nst-ibrido-programmi-grid"');
        expect(html).toContain('id="nst-ibrido-preview-modal"');
        expect(html).toContain('id="nst-ibrido-active-modal"');
        expect(html).toContain('id="nst-ibrido-final-duration-input"');
        expect(html).toContain('id="nst-ibrido-timer-warning"');
        expect(html).toContain('confermaSalvaIbridoSeduta()');
    });

    it('exports all Ibrido interactive workflow functions', () => {
        require('../portal/nestore.js');
        const target = global.window;
        expect(typeof target.renderCatalogoIbrido).toBe('function');
        expect(typeof target.apriAnteprimaIbrido).toBe('function');
        expect(typeof target.chiudiAnteprimaIbrido).toBe('function');
        expect(typeof target.avviaIbridoSeduta).toBe('function');
        expect(typeof target.terminaIbridoSeduta).toBe('function');
        expect(typeof target.annullaSalvataggioIbrido).toBe('function');
        expect(typeof target.confermaSalvaIbridoSeduta).toBe('function');
        expect(typeof target.chiudiIbridoActiveModal).toBe('function');
        expect(typeof target.apriAnteprimaInvictus).toBe('function');
        expect(typeof target.chiudiAnteprimaInvictus).toBe('function');
    });

    it('contains compact card and preview modal for INVICTUS', () => {
        expect(html).toContain('nst-standard-card-compact');
        expect(html).toContain('onclick="apriAnteprimaInvictus()"');
        expect(html).toContain('id="nst-invictus-preview-modal"');
    });

    it('contains coach 2-tab main navigation bar (Atleti vs Libreria Allenamenti)', () => {
        expect(html).toContain('class="nst-coach-main-tabs-bar"');
        expect(html).toContain('id="nst-coach-tab-athletes"');
        expect(html).toContain('id="nst-coach-tab-library"');
        expect(html).toContain('onclick="switchCoachMainTab(\'athletes\')"');
        expect(html).toContain('onclick="switchCoachMainTab(\'library\')"');
        expect(html).toContain('id="nst-coach-athletes-wrapper"');
        expect(html).toContain('id="nst-coach-library-view"');
        expect(css).toContain('.nst-coach-main-tabs-bar');
        expect(css).toContain('.nst-coach-main-tab');
        expect(css).toContain('.nst-coach-library-grid');
    });

    it('contains coach library view controls and program editor modal', () => {
        expect(html).toContain('id="nst-coach-library-grid"');
        expect(html).toContain('id="nst-lib-filter-tipo"');
        expect(html).toContain('id="nst-lib-search-input"');
        expect(html).toContain('id="nst-coach-programma-modal"');
        expect(html).toContain('id="nst-prog-edit-nome"');
        expect(html).toContain('id="nst-prog-edit-tipo"');
        expect(html).toContain('id="nst-prog-edit-categoria"');
        expect(html).toContain('id="nst-prog-edit-timer-mode"');
        expect(html).toContain('id="nst-prog-edit-tabata-row"');
        expect(html).toContain('id="nst-prog-edit-esercizi-container"');
        expect(html).toContain('salvaProgrammaLibreriaDaModal()');
    });

    it('exports all coach library CRUD, duplicate, and assignment functions', () => {
        require('../portal/nestore.js');
        const target = global.window;
        expect(typeof target.switchCoachMainTab).toBe('function');
        expect(typeof target.caricaLibreriaProgrammi).toBe('function');
        expect(typeof target.caricaLibreriaProgrammiCoach).toBe('function');
        expect(typeof target.filtraProgrammiLibreriaCoach).toBe('function');
        expect(typeof target.apriModalEditorProgramma).toBe('function');
        expect(typeof target.chiudiModalEditorProgramma).toBe('function');
        expect(typeof target.gestisciCambioTimerMode).toBe('function');
        expect(typeof target.gestisciCambioTipoProgramma).toBe('function');
        expect(typeof target.aggiungiRigaEsercizioModal).toBe('function');
        expect(typeof target.salvaProgrammaLibreriaDaModal).toBe('function');
        expect(typeof target.disattivaProgrammaLibreria).toBe('function');
        expect(typeof target.duplicaProgrammaLibreria).toBe('function');
        expect(typeof target.apriModalAssegnaProgramma).toBe('function');
        expect(typeof target.chiudiModalAssegnaProgramma).toBe('function');
        expect(typeof target.confermaAssegnazioneProgrammaDaModal).toBe('function');
        expect(typeof target.popolaSelectProgrammiLibreriaPerScheda).toBe('function');
        expect(typeof target.gestisciSelezioneProgrammaPerScheda).toBe('function');
    });

    it('enforces EPIKA soft-delete rule in disattivaProgrammaLibreria (attivo = false, no DELETE)', () => {
        expect(js).toContain("update({ attivo: false");
        expect(js).not.toContain(".from('nestore_programmi_libreria').delete()");
    });

    it('contains UI components for program duplication and assignment', () => {
        // Modal for assigning directly from library
        expect(html).toContain('id="nst-modal-assegna-programma"');
        expect(html).toContain('id="nst-assegna-modal-prog-id"');
        expect(html).toContain('id="nst-assegna-modal-atleta-select"');
        expect(html).toContain('id="nst-btn-conferma-assegna-modal"');

        // Third mode pill in coach subpanel schede
        expect(html).toContain('id="nst-pill-mode-lib"');
        expect(html).toContain('id="nst-scheda-input-library-area"');
        expect(html).toContain('id="nst-scheda-select-programma-lib"');
        expect(html).toContain('id="nst-scheda-programma-lib-preview"');

        // Library cards actions include DUPLICA and ASSEGNA
        expect(js).toContain("duplicaProgrammaLibreria('${p.id}')");
        expect(js).toContain("apriModalAssegnaProgramma('${p.id}')");

        // Styling for athlete launch workout button
        expect(css).toContain('.nst-btn-launch-workout');
        expect(css).toContain('.nst-scheda-card.has-program');
    });

    it('duplicaProgrammaLibreria correctly sets up a duplicate with blank ID and (Copia) in name', () => {
        const nestore = require('../portal/nestore.js');
        global.window.libreriaProgrammiTotali = [
            {
                id: 'prog-test-123',
                nome: 'Forza 1: Heavy Deadlift',
                tipo: 'ibrido',
                categoria: 'forza',
                timer_mode: 'stopwatch',
                ordine: 5,
                descrizione: 'Test workout',
                esercizi: [{ nome: 'Stacco', target: '4x5' }]
            }
        ];

        // Mock DOM elements
        const idInput = { value: 'prog-test-123' };
        const nomeInput = { value: '' };
        const titleText = { textContent: '' };
        const ordineInput = { value: '0' };
        const modal = { classList: { remove: vi.fn(), add: vi.fn() } };

        document.getElementById = vi.fn((id) => {
            if (id === 'nst-prog-edit-id') return idInput;
            if (id === 'nst-prog-edit-nome') return nomeInput;
            if (id === 'nst-prog-modal-title-text') return titleText;
            if (id === 'nst-prog-edit-ordine') return ordineInput;
            if (id === 'nst-coach-programma-modal') return modal;
            if (id === 'nst-prog-edit-esercizi-container') return { innerHTML: '', appendChild: vi.fn() };
            return { value: '', classList: { remove: vi.fn(), add: vi.fn() } };
        });

        global.window.duplicaProgrammaLibreria('prog-test-123');

        // ID must be blank to ensure INSERT instead of UPDATE
        expect(idInput.value).toBe('');
        // Name must append (Copia)
        expect(nomeInput.value).toBe('Forza 1: Heavy Deadlift (Copia)');
        // Title must show DUPLICA
        expect(titleText.textContent).toContain('DUPLICA: FORZA 1: HEAVY DEADLIFT (COPIA)');
        // Order must increment
        expect(Number(ordineInput.value)).toBe(6);
    });

    it('caricaSchedeAtleta renders AVVIA PROGRAMMA button when sheet has linked library program', () => {
        expect(js).toContain(".select('*, allenatore:allenatore_id(nome, cognome), programma:programma_libreria_id(*)')");
        expect(js).toContain("class=\"nst-btn-launch-workout\"");
        expect(js).toContain("<span>AVVIA PROGRAMMA</span>");
        expect(js).toContain("apriAnteprimaIbrido(progId)");
    });

    it('popolaSelectProgrammiLibreriaPerScheda correctly populates options from active library programs', () => {
        const selectMock = {
            value: '',
            innerHTML: '',
            appendChild: vi.fn()
        };
        document.getElementById = vi.fn((id) => {
            if (id === 'nst-scheda-select-programma-lib') return selectMock;
            return null;
        });

        global.window.libreriaProgrammiTotali = [
            { id: 'prog-1', nome: 'Programma 1', attivo: true, categoria: 'metcon' },
            { id: 'prog-2', nome: 'Programma Archiviato', attivo: false, categoria: 'forza' },
            { id: 'prog-3', nome: 'Programma 3', attivo: true, categoria: 'standard' }
        ];

        global.window.popolaSelectProgrammiLibreriaPerScheda();

        // Should append only active programs (prog-1 and prog-3)
        expect(selectMock.appendChild).toHaveBeenCalledTimes(2);
    });

    describe('Forza Program Series Editor & PR Fallback (Fase 3)', () => {
        it('has DEFAULT_FORZA_SERIE matching 10@60%, 5@70%, 3@80%, 1@90%, 1@100%', () => {
            const nestore = require('../portal/nestore.js');
            const defaults = nestore.DEFAULT_FORZA_SERIE || global.window.DEFAULT_FORZA_SERIE;
            expect(defaults).toBeDefined();
            expect(defaults.length).toBe(5);
            expect(defaults[0]).toEqual({ rip: 10, pct: 60 });
            expect(defaults[1]).toEqual({ rip: 5, pct: 70 });
            expect(defaults[2]).toEqual({ rip: 3, pct: 80 });
            expect(defaults[3]).toEqual({ rip: 1, pct: 90 });
            expect(defaults[4]).toEqual({ rip: 1, pct: 100 });
        });

        it('isModalInForzaMode detects forza from either tipo or categoria', () => {
            const nestore = require('../portal/nestore.js');
            const isModalInForzaMode = nestore.isModalInForzaMode || global.window.isModalInForzaMode;

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-prog-edit-tipo') return { value: 'ibrido' };
                if (id === 'nst-prog-edit-categoria') return { value: 'forza' };
                return null;
            });
            expect(isModalInForzaMode()).toBe(true);

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-prog-edit-tipo') return { value: 'forza' };
                if (id === 'nst-prog-edit-categoria') return { value: 'metcon' };
                return null;
            });
            expect(isModalInForzaMode()).toBe(true);

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-prog-edit-tipo') return { value: 'ibrido' };
                if (id === 'nst-prog-edit-categoria') return { value: 'metcon' };
                return null;
            });
            expect(isModalInForzaMode()).toBe(false);
        });

        it('ottieniBaseMassimaleEsercizio uses athlete PR when available', async () => {
            const nestore = require('../portal/nestore.js');
            const ottieniBase = nestore.ottieniBaseMassimaleEsercizio || global.window.ottieniBaseMassimaleEsercizio;

            global.window.currentUserPrList = [
                { nome: 'Panca Piana', peso_kg: 100 }
            ];

            const res = await ottieniBase('Panca Piana');
            expect(res.baseKg).toBe(100);
            expect(res.fonte).toContain('PR');
        });

        it('ottieniBaseMassimaleEsercizio falls back to athlete body weight if PR missing', async () => {
            const nestore = require('../portal/nestore.js');
            const ottieniBase = nestore.ottieniBaseMassimaleEsercizio || global.window.ottieniBaseMassimaleEsercizio;

            global.window.currentUserPrList = [];
            document.getElementById = vi.fn((id) => {
                if (id === 'nst-current-weight') return { textContent: '82.5' };
                return null;
            });

            const res = await ottieniBase('Squat Sconosciuto');
            expect(res.baseKg).toBe(82.5);
            expect(res.fonte).toContain('Peso atleta');
        });

        it('ottieniBaseMassimaleEsercizio falls back to 70 kg if both PR and body weight are missing', async () => {
            const nestore = require('../portal/nestore.js');
            const ottieniBase = nestore.ottieniBaseMassimaleEsercizio || global.window.ottieniBaseMassimaleEsercizio;

            global.window.currentUserPrList = [];
            global.window.currentUserPesoKg = null;
            document.getElementById = vi.fn(() => null);

            const res = await ottieniBase('Stacco Sconosciuto');
            expect(res.baseKg).toBe(70);
            expect(res.fonte).toContain('Default');
        });

        it('salvaProgrammaLibreriaDaModal formats structured series for forza programs', async () => {
            const nestore = require('../portal/nestore.js');
            let insertPayload = null;
            const chainOrder = () => ({
                order: vi.fn(() => ({
                    order: vi.fn(async () => ({ data: [], error: null }))
                }))
            });
            global.window.supabaseClient = {
                from: () => ({
                    insert: vi.fn(async (payload) => {
                        insertPayload = payload;
                        return { error: null };
                    }),
                    update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
                    select: vi.fn(() => ({
                        eq: vi.fn(() => chainOrder()),
                        ...chainOrder()
                    }))
                })
            };

            const mockNomeInput = { value: 'Forza Test Programma' };
            const mockTipoInput = { value: 'forza' };
            const mockCatInput = { value: 'forza' };

            const fakeRow = {
                querySelector: vi.fn((sel) => {
                    if (sel === '.ex-nome') return { value: 'Back Squat' };
                    return null;
                }),
                querySelectorAll: vi.fn((sel) => {
                    if (sel === '.nst-serie-row') {
                        return [
                            {
                                querySelector: (s) => (s === '.serie-rip' ? { value: '10' } : { value: '60' })
                            },
                            {
                                querySelector: (s) => (s === '.serie-rip' ? { value: '5' } : { value: '70' })
                            }
                        ];
                    }
                    return [];
                })
            };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-prog-edit-id') return { value: '' };
                if (id === 'nst-prog-edit-nome') return mockNomeInput;
                if (id === 'nst-prog-edit-tipo') return mockTipoInput;
                if (id === 'nst-prog-edit-categoria') return mockCatInput;
                if (id === 'nst-prog-edit-timer-mode') return { value: 'stopwatch' };
                if (id === 'nst-prog-edit-ordine') return { value: '10' };
                return { value: '' };
            });

            document.querySelectorAll = vi.fn((sel) => {
                if (sel.includes('.nst-ex-row-edit')) return [fakeRow];
                return [];
            });

            await global.window.salvaProgrammaLibreriaDaModal();

            expect(insertPayload).toBeDefined();
            expect(insertPayload.nome).toBe('Forza Test Programma');
            expect(insertPayload.esercizi).toBeDefined();
            expect(insertPayload.esercizi.length).toBe(1);
            expect(insertPayload.esercizi[0].nome).toBe('Back Squat');
            expect(insertPayload.esercizi[0].serie).toBeDefined();
            expect(insertPayload.esercizi[0].serie.length).toBe(2);
            expect(insertPayload.esercizi[0].serie[0]).toEqual({ rip: 10, pct: 60, percentuale: 60 });
            expect(insertPayload.esercizi[0].serie[1]).toEqual({ rip: 5, pct: 70, percentuale: 70 });
            expect(insertPayload.esercizi[0].target).toContain('10 rip @ 60%');
        });

        it('aggiungiRigaSerie creates formatted row and rimuoviRigaSerie reindexes badges', () => {
            const nestore = require('../portal/nestore.js');
            const aggiungi = nestore.aggiungiRigaSerie || global.window.aggiungiRigaSerie;
            const rimuovi = nestore.rimuoviRigaSerie || global.window.rimuoviRigaSerie;

            const listEl = {
                classList: { contains: () => true },
                rows: [],
                appendChild(r) { this.rows.push(r); r.parentElement = this; },
                querySelectorAll(sel) {
                    if (sel === '.nst-serie-row') return this.rows;
                    return [];
                }
            };

            document.createElement = vi.fn((tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    className: '',
                    innerHTML: '',
                    remove() {
                        if (this.parentElement) {
                            const idx = this.parentElement.rows.indexOf(this);
                            if (idx >= 0) this.parentElement.rows.splice(idx, 1);
                        }
                    },
                    querySelector(s) {
                        if (s === '.nst-serie-idx-badge') return this.badgeMock || { textContent: '' };
                        return null;
                    },
                    closest(s) {
                        if (s === '.nst-serie-row') return this;
                        return null;
                    }
                };
                el.badgeMock = { textContent: '' };
                return el;
            });

            aggiungi(listEl, 10, 60);
            aggiungi(listEl, 5, 70);
            aggiungi(listEl, 3, 80);

            expect(listEl.rows.length).toBe(3);

            // Remove middle row
            const secondRow = listEl.rows[1];
            rimuovi(secondRow);

            expect(listEl.rows.length).toBe(2);
            expect(listEl.rows[0].badgeMock.textContent).toBe('Serie 1');
            expect(listEl.rows[1].badgeMock.textContent).toBe('Serie 2');
        });

        it('apriAnteprimaIbrido renders formatted series text for strength program with ex.serie', () => {
            const nestore = require('../portal/nestore.js');
            const apriAnteprima = nestore.apriAnteprimaIbrido || global.window.apriAnteprimaIbrido;

            global.window.libreriaProgrammiTotali = [
                {
                    id: 'forza-anteprima-test',
                    nome: 'Forza Max Power',
                    tipo: 'forza',
                    categoria: 'forza',
                    descrizione: 'Test anteprima forza',
                    esercizi: [
                        {
                            nome: 'Panca Piana',
                            serie: [
                                { rip: 10, pct: 60 },
                                { rip: 5, pct: 70 },
                                { rip: 3, pct: 80 }
                            ]
                        }
                    ]
                }
            ];

            const exListMock = { innerHTML: '' };
            const titleMock = { textContent: '' };
            const descMock = { textContent: '' };
            const cardMock = { classList: { add: vi.fn(), remove: vi.fn() } };
            const modalMock = { classList: { add: vi.fn(), remove: vi.fn() } };

            document.getElementById = vi.fn((id) => {
                if (id === 'nst-ibrido-preview-ex-list') return exListMock;
                if (id === 'nst-ibrido-preview-title') return titleMock;
                if (id === 'nst-ibrido-preview-desc') return descMock;
                if (id === 'nst-ibrido-preview-card') return cardMock;
                if (id === 'nst-ibrido-preview-modal') return modalMock;
                return null;
            });

            apriAnteprima('forza-anteprima-test');

            expect(exListMock.innerHTML).toContain('Panca Piana');
            expect(exListMock.innerHTML).toContain('10 rip @ 60% · 5 rip @ 70% · 3 rip @ 80%');
        });
    });
});





