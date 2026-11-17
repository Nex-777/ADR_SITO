/**
 * portal/safeguarding-docs.js
 *
 * Modulo condiviso (Dashboard Presidenza + Pagina Pubblica Safeguarding) per:
 * 1. Template legali autocompilanti (MOCAS, Codice di Condotta, Verbale Nomina CD) ex D.Lgs. 36/2021 e 39/2021.
 * 2. Generatore PDF A4 multipagina client-side via pdf-lib (zero storage pubblico necessario).
 * 3. Offuscamento/decodifica client-side dell'email del Responsabile Safeguarding contro spambot.
 *
 * Script classico da browser (compatibile con <script src="..."> e con import/test Vitest).
 */
(function () {
    'use strict';

    var CLUB_INFO = {
        name: 'ASD ADRENALINA CLUB APS',
        address: 'Via Rigante 44, 63100 Ascoli Piceno (AP)',
        cf: '92042260445',
        piva: '02014060442',
        eps: 'CSEN (Centro Sportivo Educativo Nazionale)'
    };

    function formatDateIt(dateStr) {
        if (!dateStr) return 'Da definire';
        var s = String(dateStr).trim();
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        if (m) {
            return m[3] + '/' + m[2] + '/' + m[1];
        }
        return s;
    }

    function normalizeNomina(nomina) {
        var n = nomina || {};
        var nome = (n.nome_responsabile || '').trim();
        var cognome = (n.cognome_responsabile || '').trim();
        var fullName = (nome + ' ' + cognome).trim();
        var isConfigured = Boolean(fullName && (n.email_contatto || '').trim());

        return {
            id: n.id || null,
            isConfigured: isConfigured,
            nome: nome || 'In fase di nomina',
            cognome: cognome || '',
            fullName: fullName || 'In fase di nomina da parte del Consiglio Direttivo',
            email: (n.email_contatto || '').trim() || 'Canale in fase di attivazione',
            qualifica: (n.qualifica || '').trim() || 'Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer)',
            numeroVerbale: (n.numero_verbale || '').trim() || 'In corso di verbalizzazione',
            dataNomina: n.data_nomina ? formatDateIt(n.data_nomina) : 'Da definire',
            dataNominaRaw: n.data_nomina || '',
            dataScadenza: n.data_scadenza ? formatDateIt(n.data_scadenza) : 'Fino a fine mandato quadriennale / revoca',
            dataScadenzaRaw: n.data_scadenza || '',
            presidente: (n.presidente_verbalizzante || '').trim() || 'Il Presidente pro tempore',
            segretario: (n.segretario_verbalizzante || '').trim() || 'Il Segretario pro tempore',
            testoMocasCustom: n.testo_mocas_custom || '',
            testoCodiceCustom: n.testo_codice_custom || '',
            testoVerbaleCustom: n.testo_verbale_custom || ''
        };
    }

    function applyPlaceholders(template, info) {
        return String(template || '')
            .replace(/\{\{CLUB_NAME\}\}/g, CLUB_INFO.name)
            .replace(/\{\{CLUB_ADDRESS\}\}/g, CLUB_INFO.address)
            .replace(/\{\{CLUB_CF\}\}/g, CLUB_INFO.cf)
            .replace(/\{\{CLUB_PIVA\}\}/g, CLUB_INFO.piva)
            .replace(/\{\{CLUB_EPS\}\}/g, CLUB_INFO.eps)
            .replace(/\{\{RESPONSABILE_NOME\}\}/g, info.fullName)
            .replace(/\{\{QUALIFICA\}\}/g, info.qualifica)
            .replace(/\{\{EMAIL_CONTATTO\}\}/g, info.email)
            .replace(/\{\{NUMERO_VERBALE\}\}/g, info.numeroVerbale)
            .replace(/\{\{DATA_NOMINA\}\}/g, info.dataNomina)
            .replace(/\{\{DATA_SCADENZA\}\}/g, info.dataScadenza)
            .replace(/\{\{PRESIDENTE\}\}/g, info.presidente)
            .replace(/\{\{SEGRETARIO\}\}/g, info.segretario);
    }

    var TEMPLATES = {
        mocas: [
            'ART. 1 - FINALITA E RIFERIMENTI NORMATIVI',
            'Il presente Modello Organizzativo e di Controllo dell\'Attivita Sportiva (di seguito "MOCAS") e adottato da {{CLUB_NAME}} (CF {{CLUB_CF}} - P.IVA {{CLUB_PIVA}}, con sede in {{CLUB_ADDRESS}}), affiliata all\'Ente di Promozione Sportiva {{CLUB_EPS}}, in attuazione dell\'art. 16 del D.Lgs. 28 febbraio 2021, n. 39, del D.Lgs. 36/2021, dei Principi Fondamentali emanati dall\'Osservatorio Permanente del CONI per le Politiche di Safeguarding (Delibera Giunta Nazionale CONI n. 255/2023) e delle Linee Guida CSEN.',
            'Il MOCAS persegue l\'obiettivo di prevenire e contrastare ogni tipo di abuso, violenza, molestia e discriminazione nei confronti dei tesserati, con particolare tutela per i minori, garantendo un ambiente sportivo sicuro, inclusivo e rispettoso della dignita della persona.',
            '',
            'ART. 2 - AMBITO DI APPLICAZIONE',
            'Il presente Modello si applica a tutti i soggetti che operano o partecipano a qualsiasi titolo alle attivita dell\'Associazione:',
            '- Atleti, soci, tesserati e praticanti di tutte le discipline (forza, combattimento, fitness, rievocazione storica);',
            '- Istruttori, tecnici, preparatori atletici e responsabili di gruppo o settore;',
            '- Membri del Consiglio Direttivo, dirigenti, volontari e collaboratori a qualsiasi titolo;',
            '- Genitori, tutori o esercenti la responsabilita genitoriale per gli atleti minorenni.',
            '',
            'ART. 3 - FATTISPECIE RILEVANTI',
            'Costituiscono condotte rilevanti ai fini del presente Modello, anche se commesse in forma digitale:',
            '- Abuso psicologico: qualunque atto indesiderato (isolamento, umiliazione, denigrazione, pressione psicologica eccessiva) idoneo a compromettere l\'equilibrio e l\'autostima dell\'atleta;',
            '- Abuso fisico: qualunque condotta consumata o tentata che comporti lesioni, percosse, costrizioni fisiche o somministrazione impropria di carichi/sostanze;',
            '- Molestia sessuale e abuso sessuale: ogni comportamento verbale, non verbale o fisico a connotazione sessuale non desiderato o lesivo della dignita;',
            '- Negligenza e incuria: mancata garanzia delle condizioni minime di sicurezza, vigilanza sui minori e assistenza medica obbligatoria;',
            '- Bullismo, cyberbullismo e discriminazione per razza, origine etnica, religione, sesso, orientamento sessuale, eta o disabilita.',
            '',
            'ART. 4 - MISURE PREVENTIVE E ORGANIZZATIVE',
            '{{CLUB_NAME}} adotta protocolli operativi concreti proporzionati alle proprie discipline:',
            '- Verifica preventiva dell\'idoneita morale e acquisizione del certificato penale del casellario giudiziale (art. 25-bis D.P.R. 313/2002) per tecnici, istruttori e volontari impegnati in attivita con minori;',
            '- Gestione sicura di spogliatoi e docce: accesso regolamentato e vigilanza esterna; divieto assoluto di utilizzo di smartphone, fotocamere o dispositivi di registrazione all\'interno degli spogliatoi;',
            '- Discipline di combattimento e contatto fisico: ogni contatto tecnico deve essere strettamente funzionale all\'apprendimento, previamente spiegato e proporzionato all\'eta ed esperienza dell\'atleta;',
            '- Trasferte, gare e raduni: presenza di almeno due accompagnatori adulti autorizzati in caso di minori e divieto di pernottamento promiscuo tra adulti e minori;',
            '- Tutela sanitaria e assicurativa: verifica costante del certificato medico valido e della copertura assicurativa CSEN prima di ogni seduta.',
            '',
            'ART. 5 - RESPONSABILE SAFEGUARDING (NOMINA E AUTONOMIA)',
            'Con delibera del Consiglio Direttivo (Verbale n. {{NUMERO_VERBALE}} del {{DATA_NOMINA}}), l\'Associazione ha nominato quale {{QUALIFICA}}:',
            '- Nominativo: {{RESPONSABILE_NOME}}',
            '- Canale diretto e riservato di segnalazione: {{EMAIL_CONTATTO}}',
            '- Durata dell\'incarico: fino al {{DATA_SCADENZA}}',
            'Il Responsabile opera in posizione di piena autonomia, terzieta e indipendenza rispetto al Consiglio Direttivo e ai tecnici, con libero accesso alle strutture sociali e alla documentazione di prevenzione.',
            '',
            'ART. 6 - GESTIONE DELLE SEGNALAZIONI E TUTELA DELLA RISERVATEZZA',
            'Al fine di garantire l\'assoluta terzieta e impedire che amministratori di sistema, dirigenti o terzi possano accedere al contenuto delle denunce, le segnalazioni NON transitano attraverso form web, API server o database dell\'Associazione.',
            'Chiunque venga a conoscenza di comportamenti rilevanti puo contattare direttamente ed esclusivamente la casella personale del Responsabile Safeguarding all\'indirizzo {{EMAIL_CONTATTO}}.',
            'Il Responsabile garantisce la riservatezza dell\'identita del segnalante, attiva le verifiche immediate, adotta o propone al Direttivo misure cautelari d\'urgenza e trasmette senza ritardo le segnalazioni fondate al Safeguarding Office CSEN e, nei casi previsti dalla legge, all\'Autorita Giudiziaria.',
            'E vietata qualsiasi forma di ritorsione o discriminazione verso il segnalante o i testimoni.',
            '',
            'ART. 7 - SANZIONI, FORMAZIONE E AGGIORNAMENTO',
            'Le violazioni del MOCAS comportano l\'applicazione di sanzioni disciplinari progressive (richiamo formale, sospensione temporanea, esclusione/radiazione dall\'Associazione), fermo restando l\'obbligo di denuncia alle autorita competenti.',
            'Il presente Modello viene aggiornato con cadenza almeno quadriennale (o al variare delle disposizioni CONI/CSEN) ed e pubblicato permanentemente nella sezione pubblica Safeguarding del sito istituzionale.'
        ].join('\n'),

        codice: [
            'ART. 1 - PRINCIPI GENERALI DI CONDOTTA',
            'Il presente Codice di Condotta integra il MOCAS di {{CLUB_NAME}} e stabilisce gli standard etici e comportamentali obbligatori per tutti i tesserati, atleti, tecnici, dirigenti, volontari e accompagnatori, ai sensi del D.Lgs. 39/2021.',
            'Ogni persona appartenente alla comunita sportiva si impegna a promuovere il rispetto reciproco, la lealta sportiva, la non violenza e la piena inclusione sociale, rifiutando ogni forma di discriminazione o prevaricazione.',
            '',
            'ART. 2 - DOVERI DI ISTRUTTORI, TECNICI E DIRIGENTI',
            'I tecnici, gli istruttori, i responsabili di settore e i membri del Consiglio Direttivo sono tenuti a:',
            '- Mantenere un comportamento esemplare, utilizzando un linguaggio rispettoso ed evitando urla umilianti, sarcasmo offensivo o pressioni psicologiche sproporzionate;',
            '- Garantire che la correzione tecnica o l\'allenamento nelle discipline di combattimento e forza avvenga nel pieno rispetto dell\'integrita fisica e della volonta dell\'atleta;',
            '- Evitare contatti fisici non necessari o inappropriati, privilegiando dimostrazioni verbali e visive;',
            '- Non intrattenere rapporti esclusivi o comunicazioni private sui social network o app di messaggistica con atleti minorenni al di fuori dei canali ufficiali condivisi con i genitori/tutori;',
            '- Vigilare costantemente sugli spazi comuni, impedendo riprese video non autorizzate o episodi di derisione e bullismo;',
            '- Segnalare tempestivamente qualsiasi sospetto abuso o situazione di disagio al Responsabile Safeguarding.',
            '',
            'ART. 3 - DOVERI DEGLI ATLETI E DEI SOCI',
            'Gli atleti e i soci di {{CLUB_NAME}} devono:',
            '- Rispettare i compagni di allenamento, gli avversari, i tecnici, gli arbitri e i volontari;',
            '- Astenersi da qualsiasi forma di violenza verbale o fisica, body shaming, esclusione dal gruppo o cyberbullismo;',
            '- Utilizzare correttamente attrezzature e spogliatoi, rispettando la privacy altrui e il divieto assoluto di fotografare o filmare nei locali riservati;',
            '- Segnalare immediatamente comportamenti scorretti propri o altrui.',
            '',
            'ART. 4 - RUOLO DEI GENITORI E ACCOMPAGNATORI',
            'I genitori e gli esercenti la responsabilita genitoriale collaborano con l\'Associazione nel promuovere i valori educativi dello sport, evitando interferenze tecniche offensive o pressioni eccessive sui minori e comunicando tempestivamente al Responsabile Safeguarding ogni situazione critica.',
            '',
            'ART. 5 - CANALE DI SEGNALAZIONE E SISTEMA DISCIPLINARE',
            'Ogni violazione del presente Codice di Condotta puo essere segnalata in forma diretta, riservata e protetta al {{QUALIFICA}}, {{RESPONSABILE_NOME}}, scrivendo esclusivamente all\'indirizzo email {{EMAIL_CONTATTO}}.',
            'L\'Associazione assicura che nessuna segnalazione venga archiviata nei server o nei database gestiti dall\'amministrazione IT del club. La violazione delle presenti norme comporta l\'avvio di procedimento disciplinare interno e la segnalazione agli organi competenti CSEN.'
        ].join('\n'),

        verbale: [
            'VERBALE DEL CONSIGLIO DIRETTIVO N. {{NUMERO_VERBALE}}',
            'Oggetto: Adozione del MOCAS e del Codice di Condotta (D.Lgs. 39/2021) e Nomina del Responsabile Safeguarding',
            '',
            'Il giorno {{DATA_NOMINA}}, presso la sede sociale di {{CLUB_NAME}} sita in {{CLUB_ADDRESS}} (CF {{CLUB_CF}} - P.IVA {{CLUB_PIVA}}), si e riunito il Consiglio Direttivo dell\'Associazione regolarmente convocato.',
            'Assume la presidenza della seduta {{PRESIDENTE}}, che chiama a svolgere le funzioni di Segretario verbalizzante {{SEGRETARIO}}.',
            'Constatata la validita della seduta e la presenza della maggioranza dei componenti del Consiglio Direttivo, il Presidente apre la discussione sul seguente Ordine del Giorno:',
            '1. Adozione del Modello Organizzativo e di Controllo dell\'Attivita Sportiva (MOCAS) e del Codice di Condotta ai sensi dell\'art. 16 del D.Lgs. 39/2021 e delle Linee Guida CSEN;',
            '2. Nomina del Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer);',
            '3. Attivazione del canale di segnalazione terzo e pubblicazione nella sezione pubblica del portale web.',
            '',
            'ESPOSIZIONE E DELIBERAZIONI',
            'Il Presidente illustra gli obblighi previsti dal D.Lgs. 36/2021, dal D.Lgs. 39/2021, dalle delibere CONI e dalle Linee Guida dell\'Ente affiliante {{CLUB_EPS}} per la prevenzione di abusi, violenze e discriminazioni negli enti sportivi.',
            'Dopo ampio esame dei testi predisposti, il Consiglio Direttivo, all\'unanimita dei presenti,',
            '',
            'DELIBERA',
            '1) Di approvare e adottare integralmente il Modello Organizzativo e di Controllo dell\'Attivita Sportiva (MOCAS) e il Codice di Condotta a tutela dei minori e per la prevenzione di molestie, violenza di genere e discriminazioni di {{CLUB_NAME}};',
            '2) Di nominare quale {{QUALIFICA}} il/la Sig./Sig.ra {{RESPONSABILE_NOME}}, previa verifica dei requisiti di autonomia, indipendenza, terzieta e onorabilita richiesti dalla normativa vigente;',
            '3) Di stabilire la durata dell\'incarico a decorrere dal {{DATA_NOMINA}} e fino al {{DATA_SCADENZA}} (salvo rinnovo o revoca motivata);',
            '4) Di individuare quale unico canale di ricezione delle segnalazioni l\'indirizzo email diretto ed esclusivo del Responsabile nominato: {{EMAIL_CONTATTO}}, stabilendo espressamente che il portale web associativo non raccolga, registri o conservi sui propri server o database alcuna segnalazione, al fine di garantire l\'assoluta riservatezza e terzieta rispetto al Consiglio Direttivo e agli amministratori di sistema;',
            '5) Di disporre l\'immediata pubblicazione permanente del presente verbale, del MOCAS, del Codice di Condotta e dei recapiti del Responsabile nella pagina pubblica Safeguarding del sito istituzionale dell\'Associazione e la trasmissione della nomina all\'EPS {{CLUB_EPS}}.',
            '',
            'Nulla essendovi altro da deliberare, la seduta viene sciolta previa lettura e approvazione del presente verbale.',
            '',
            'Ascoli Piceno, {{DATA_NOMINA}}',
            'Il Presidente: {{PRESIDENTE}}',
            'Il Segretario: {{SEGRETARIO}}',
            'Per accettazione dell\'incarico (Safeguarding Officer): {{RESPONSABILE_NOME}}'
        ].join('\n')
    };

    var DOC_META = {
        mocas: {
            code: 'MOCAS',
            title: 'Modello Organizzativo e di Controllo dell\'Attivita Sportiva',
            subtitle: 'Adottato ai sensi dell\'art. 16 D.Lgs. 39/2021 e Linee Guida CSEN',
            filename: 'ADR_MOCAS_Safeguarding.pdf'
        },
        codice: {
            code: 'CODICE DI CONDOTTA',
            title: 'Codice di Condotta per la Tutela dei Minori e la Prevenzione delle Discriminazioni',
            subtitle: 'Standard comportamentali per tecnici, dirigenti, atleti, soci e genitori',
            filename: 'ADR_Codice_Condotta_Safeguarding.pdf'
        },
        verbale: {
            code: 'VERBALE DI NOMINA',
            title: 'Verbale del Consiglio Direttivo - Adozione Modelli e Nomina Safeguarding',
            subtitle: 'Delibera ufficiale di nomina del Responsabile contro abusi, violenze e discriminazioni',
            filename: 'ADR_Verbale_Nomina_Safeguarding.pdf'
        }
    };

    function getDefaultDraft(docType, nomina) {
        var tpl = TEMPLATES[docType] || '';
        var info = normalizeNomina(nomina);
        return applyPlaceholders(tpl, info);
    }

    function getResolvedText(docType, nomina, customOverride) {
        var info = normalizeNomina(nomina);
        var override = customOverride;
        if (override === undefined) {
            if (docType === 'mocas') override = info.testoMocasCustom;
            else if (docType === 'codice') override = info.testoCodiceCustom;
            else if (docType === 'verbale') override = info.testoVerbaleCustom;
        }
        if (override && String(override).trim().length > 0) {
            return applyPlaceholders(String(override).trim(), info);
        }
        return getDefaultDraft(docType, info);
    }

    /**
     * Normalizza caratteri potenzialmente fuori dal set WinAnsi usato dai StandardFonts di pdf-lib.
     */
    function sanitizePdfText(str) {
        return String(str || '')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u2026/g, '...')
            .replace(/\u2022/g, '-')
            .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ');
    }

    function wrapLines(text, font, fontSize, maxWidth) {
        var words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
        if (words.length === 0) return [''];
        var lines = [];
        var current = words[0];
        for (var i = 1; i < words.length; i++) {
            var candidate = current + ' ' + words[i];
            if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
                current = candidate;
            } else {
                lines.push(current);
                current = words[i];
            }
        }
        lines.push(current);
        return lines;
    }

    function isHeadingLine(line) {
        var trimmed = line.trim();
        if (!trimmed) return false;
        if (/^(ART\.|ARTICOLO|VERBALE DEL CONSIGLIO|ESPOSIZIONE E DELIBERAZIONI|DELIBERA$)/i.test(trimmed)) return true;
        if (trimmed === trimmed.toUpperCase() && trimmed.length >= 6 && /[A-Z]/.test(trimmed)) return true;
        return false;
    }

    async function generateSafeguardingPdfBytes(docType, nomina, customOverride) {
        var pdfLib = typeof window !== 'undefined' ? window.PDFLib : globalThis.PDFLib;
        if (!pdfLib || !pdfLib.PDFDocument) {
            throw new Error('Libreria pdf-lib non disponibile.');
        }

        var meta = DOC_META[docType];
        if (!meta) {
            throw new Error('Tipologia documento Safeguarding non valida: ' + docType);
        }

        var info = normalizeNomina(nomina);
        var fullText = getResolvedText(docType, info, customOverride);
        var pdfDoc = await pdfLib.PDFDocument.create();

        pdfDoc.setTitle(sanitizePdfText(meta.title + ' - ' + CLUB_INFO.name));
        pdfDoc.setAuthor(CLUB_INFO.name);
        pdfDoc.setSubject('Safeguarding D.Lgs. 36/2021 e 39/2021');

        var fontRegular = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
        var fontBold = await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);

        var PAGE_W = 595.28;
        var PAGE_H = 841.89;
        var MARGIN_X = 48;
        var CONTENT_W = PAGE_W - MARGIN_X * 2;
        var TOP_START = PAGE_H - 52;
        var BOTTOM_LIMIT = 56;

        var colorDark = pdfLib.rgb(0.08, 0.08, 0.09);
        var colorMuted = pdfLib.rgb(0.38, 0.40, 0.44);
        var colorRed = pdfLib.rgb(0.87, 0.16, 0.24);
        var colorBorder = pdfLib.rgb(0.84, 0.85, 0.87);
        var colorLightBg = pdfLib.rgb(0.96, 0.96, 0.97);
        var colorWhite = pdfLib.rgb(1, 1, 1);

        var pages = [];
        var page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        pages.push(page);

        // Intestazione ufficiale Prima Pagina
        page.drawRectangle({
            x: MARGIN_X,
            y: PAGE_H - 96,
            width: CONTENT_W,
            height: 54,
            color: colorDark
        });
        page.drawRectangle({
            x: MARGIN_X,
            y: PAGE_H - 96,
            width: 5,
            height: 54,
            color: colorRed
        });
        page.drawText(sanitizePdfText(CLUB_INFO.name), {
            x: MARGIN_X + 16,
            y: PAGE_H - 63,
            size: 13,
            font: fontBold,
            color: colorWhite
        });
        page.drawText(sanitizePdfText(CLUB_INFO.address + '  |  CF ' + CLUB_INFO.cf + ' - P.IVA ' + CLUB_INFO.piva), {
            x: MARGIN_X + 16,
            y: PAGE_H - 78,
            size: 7.5,
            font: fontRegular,
            color: pdfLib.rgb(0.78, 0.80, 0.84)
        });
        page.drawText(sanitizePdfText('AFFILIATA ' + CLUB_INFO.eps + '  |  D.LGS. 36/2021 & 39/2021'), {
            x: MARGIN_X + 16,
            y: PAGE_H - 89,
            size: 7,
            font: fontBold,
            color: colorRed
        });

        var cursorY = PAGE_H - 118;

        // Titolo documento
        var titleLines = wrapLines(meta.title.toUpperCase(), fontBold, 12.5, CONTENT_W);
        for (var t = 0; t < titleLines.length; t++) {
            page.drawText(titleLines[t], {
                x: MARGIN_X,
                y: cursorY,
                size: 12.5,
                font: fontBold,
                color: colorDark
            });
            cursorY -= 16;
        }
        var subLines = wrapLines(meta.subtitle, fontRegular, 9, CONTENT_W);
        for (var s = 0; s < subLines.length; s++) {
            page.drawText(subLines[s], {
                x: MARGIN_X,
                y: cursorY,
                size: 9,
                font: fontRegular,
                color: colorMuted
            });
            cursorY -= 12;
        }

        cursorY -= 6;

        // Box Riepilogo Nomina
        var boxHeight = 52;
        page.drawRectangle({
            x: MARGIN_X,
            y: cursorY - boxHeight,
            width: CONTENT_W,
            height: boxHeight,
            color: colorLightBg,
            borderColor: colorBorder,
            borderWidth: 0.75
        });
        page.drawText(sanitizePdfText('RESPONSABILE SAFEGUARDING: ' + info.fullName), {
            x: MARGIN_X + 10,
            y: cursorY - 16,
            size: 8.5,
            font: fontBold,
            color: colorDark
        });
        page.drawText(sanitizePdfText('CANALE DIRETTO SEGNALAZIONI: ' + info.email), {
            x: MARGIN_X + 10,
            y: cursorY - 29,
            size: 8,
            font: fontRegular,
            color: colorDark
        });
        page.drawText(sanitizePdfText('VERBALE CD: ' + info.numeroVerbale + '  |  DATA NOMINA: ' + info.dataNomina + '  |  SCADENZA: ' + info.dataScadenza), {
            x: MARGIN_X + 10,
            y: cursorY - 42,
            size: 7.5,
            font: fontRegular,
            color: colorMuted
        });

        cursorY -= (boxHeight + 18);

        function ensureSpace(neededHeight) {
            if (cursorY - neededHeight < BOTTOM_LIMIT) {
                page = pdfDoc.addPage([PAGE_W, PAGE_H]);
                pages.push(page);
                page.drawText(sanitizePdfText(CLUB_INFO.name + ' - ' + meta.code), {
                    x: MARGIN_X,
                    y: PAGE_H - 32,
                    size: 7.5,
                    font: fontBold,
                    color: colorMuted
                });
                page.drawLine({
                    start: { x: MARGIN_X, y: PAGE_H - 38 },
                    end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 38 },
                    thickness: 0.5,
                    color: colorBorder
                });
                cursorY = TOP_START;
            }
        }

        var paragraphs = fullText.split(/\r?\n/);
        for (var p = 0; p < paragraphs.length; p++) {
            var rawLine = paragraphs[p].trim();
            if (!rawLine) {
                cursorY -= 7;
                continue;
            }

            if (isHeadingLine(rawLine)) {
                cursorY -= 4;
                var hLines = wrapLines(rawLine, fontBold, 10, CONTENT_W);
                ensureSpace(hLines.length * 14 + 6);
                for (var h = 0; h < hLines.length; h++) {
                    page.drawText(hLines[h], {
                        x: MARGIN_X,
                        y: cursorY,
                        size: 10,
                        font: fontBold,
                        color: /^ART\./i.test(rawLine) ? colorRed : colorDark
                    });
                    cursorY -= 14;
                }
                cursorY -= 2;
            } else if (/^[-•]\s+/.test(rawLine)) {
                var bulletBody = rawLine.replace(/^[-•]\s+/, '');
                var bLines = wrapLines(bulletBody, fontRegular, 9.2, CONTENT_W - 14);
                ensureSpace(bLines.length * 12.5 + 3);
                for (var b = 0; b < bLines.length; b++) {
                    if (b === 0) {
                        page.drawText('-', {
                            x: MARGIN_X + 4,
                            y: cursorY,
                            size: 9.2,
                            font: fontBold,
                            color: colorRed
                        });
                    }
                    page.drawText(bLines[b], {
                        x: MARGIN_X + 14,
                        y: cursorY,
                        size: 9.2,
                        font: fontRegular,
                        color: colorDark
                    });
                    cursorY -= 12.5;
                }
                cursorY -= 2;
            } else {
                var pLines = wrapLines(rawLine, fontRegular, 9.5, CONTENT_W);
                ensureSpace(pLines.length * 13 + 4);
                for (var k = 0; k < pLines.length; k++) {
                    page.drawText(pLines[k], {
                        x: MARGIN_X,
                        y: cursorY,
                        size: 9.5,
                        font: fontRegular,
                        color: colorDark
                    });
                    cursorY -= 13;
                }
                cursorY -= 3;
            }
        }

        // Footer con numerazione su tutte le pagine
        var totalPages = pages.length;
        for (var idx = 0; idx < totalPages; idx++) {
            var pg = pages[idx];
            pg.drawLine({
                start: { x: MARGIN_X, y: 38 },
                end: { x: PAGE_W - MARGIN_X, y: 38 },
                thickness: 0.5,
                color: colorBorder
            });
            pg.drawText(sanitizePdfText(CLUB_INFO.name + ' - Documento Pubblico Safeguarding (D.Lgs. 36/2021 e 39/2021)'), {
                x: MARGIN_X,
                y: 25,
                size: 7.5,
                font: fontRegular,
                color: colorMuted
            });
            var pageLabel = 'Pagina ' + (idx + 1) + ' di ' + totalPages;
            var labelWidth = fontBold.widthOfTextAtSize(pageLabel, 7.5);
            pg.drawText(pageLabel, {
                x: PAGE_W - MARGIN_X - labelWidth,
                y: 25,
                size: 7.5,
                font: fontBold,
                color: colorMuted
            });
        }

        return await pdfDoc.save();
    }

    async function openPdfPreview(docType, nomina, customOverride) {
        var bytes = await generateSafeguardingPdfBytes(docType, nomina, customOverride);
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
            var meta = DOC_META[docType] || { filename: 'safeguarding.pdf' };
            var a = document.createElement('a');
            a.href = url;
            a.download = meta.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 60000);
    }

    async function downloadPdf(docType, nomina, customOverride) {
        var bytes = await generateSafeguardingPdfBytes(docType, nomina, customOverride);
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var meta = DOC_META[docType] || { filename: 'safeguarding.pdf' };
        var a = document.createElement('a');
        a.href = url;
        a.download = meta.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 15000);
    }

    /**
     * Offusca l'indirizzo email come sequenza di codici carattere invertiti + offset
     * in modo da non esporre la stringa in chiaro nel DOM o negli attributi HTML statici.
     */
    function encodeEmailPayload(email) {
        var clean = String(email || '').trim();
        if (!clean || clean.indexOf('@') === -1) return '';
        var codes = [];
        for (var i = clean.length - 1; i >= 0; i--) {
            codes.push(clean.charCodeAt(i) + 7);
        }
        return codes.join('.');
    }

    function decodeEmailPayload(encoded) {
        if (!encoded) return '';
        var parts = String(encoded).split('.');
        var out = [];
        for (var i = parts.length - 1; i >= 0; i--) {
            var num = parseInt(parts[i], 10);
            if (isNaN(num)) return '';
            out.push(String.fromCharCode(num - 7));
        }
        return out.join('');
    }

    function maskEmailForDisplay(email) {
        var clean = String(email || '').trim();
        var atIdx = clean.indexOf('@');
        if (atIdx <= 0) return 'Canale riservato protetto';
        var local = clean.slice(0, atIdx);
        var domain = clean.slice(atIdx + 1);
        var dotIdx = domain.lastIndexOf('.');
        var host = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
        var tld = dotIdx > 0 ? domain.slice(dotIdx) : '';
        var maskedLocal = local.slice(0, Math.min(2, local.length)) + '***';
        var maskedHost = host.slice(0, Math.min(2, host.length)) + '***';
        return maskedLocal + ' [at] ' + maskedHost + tld;
    }

    function buildMailtoHref(email, responsabilitaNome) {
        var clean = String(email || '').trim();
        if (!clean || clean.indexOf('@') === -1) return '#';
        var subject = '[SAFEGUARDING] Segnalazione Riservata - ASD Adrenalina Club APS';
        var bodyLines = [
            'Alla cortese attenzione del Responsabile Safeguarding' + (responsabilitaNome ? ' (' + responsabilitaNome + ')' : '') + ',',
            '',
            'Con la presente intendo sottoporre in via strettamente riservata la seguente segnalazione ai sensi del MOCAS e del D.Lgs. 39/2021:',
            '',
            '- Data e luogo dei fatti (se noti): ',
            '- Persone coinvolte: ',
            '- Descrizione sintetica dei fatti: ',
            '',
            'Recapito preferito per eventuale riscontro (facoltativo in caso di segnalazione anonima): '
        ];
        return 'mailto:' + clean
            + '?subject=' + encodeURIComponent(subject)
            + '&body=' + encodeURIComponent(bodyLines.join('\n'));
    }

    var api = {
        CLUB_INFO: CLUB_INFO,
        DOC_META: DOC_META,
        formatDateIt: formatDateIt,
        normalizeNomina: normalizeNomina,
        getDefaultDraft: getDefaultDraft,
        getResolvedText: getResolvedText,
        sanitizePdfText: sanitizePdfText,
        generateSafeguardingPdfBytes: generateSafeguardingPdfBytes,
        openPdfPreview: openPdfPreview,
        downloadPdf: downloadPdf,
        encodeEmailPayload: encodeEmailPayload,
        decodeEmailPayload: decodeEmailPayload,
        maskEmailForDisplay: maskEmailForDisplay,
        buildMailtoHref: buildMailtoHref
    };

    if (typeof window !== 'undefined') {
        window.SafeguardingDocs = api;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.SafeguardingDocs = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
