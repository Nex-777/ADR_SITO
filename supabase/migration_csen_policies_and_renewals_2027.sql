-- ==============================================================================
-- Migrazione: migration_csen_policies_and_renewals_2027.sql
-- Scopo:
-- 1. Aggiungere data_scadenza_tessera su public.registro_tesserati
-- 2. Aggiungere data_decadenza e verbale_decadenza su public.registro_soci
-- 3. Funzione deterministica calcola_scadenza_tessera_csen(data, livello)
-- 4. Backfill scadenze tessere esistenti secondo le nuove politiche CSEN
-- 5. Aggiornamento approva_tesserato e salva_verbale_relazionale
-- ==============================================================================

-- 1. Colonna data_scadenza_tessera su registro_tesserati
ALTER TABLE public.registro_tesserati
ADD COLUMN IF NOT EXISTS data_scadenza_tessera DATE;

-- 2. Colonne storicizzazione decadenza su registro_soci
ALTER TABLE public.registro_soci
ADD COLUMN IF NOT EXISTS data_decadenza DATE,
ADD COLUMN IF NOT EXISTS verbale_decadenza VARCHAR(50);

-- 3. Funzione deterministica di calcolo scadenza tessera CSEN
-- Regole:
-- - INTEGRATIVA_A / INTEGRATIVA_B: scade dopo 365 giorni dalla data di iscrizione
-- - BASE (Silver / Gold):
--     - tra 01/01/N e 31/08/N -> scade il 31/12/N
--     - tra 01/09/N e 31/12/N -> scade il 31/12/(N+1)
CREATE OR REPLACE FUNCTION public.calcola_scadenza_tessera_csen(
    p_data_iscrizione DATE,
    p_livello_copertura VARCHAR
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_data DATE := COALESCE(p_data_iscrizione, CURRENT_DATE);
    v_livello VARCHAR := UPPER(COALESCE(p_livello_copertura, 'BASE'));
    v_anno INTEGER;
    v_mese INTEGER;
BEGIN
    IF v_livello IN ('INTEGRATIVA_A', 'INTEGRATIVA_B') THEN
        RETURN (v_data + 365);
    END IF;

    v_anno := EXTRACT(YEAR FROM v_data)::INTEGER;
    v_mese := EXTRACT(MONTH FROM v_data)::INTEGER;

    IF v_mese >= 9 THEN
        RETURN MAKE_DATE(v_anno + 1, 12, 31);
    ELSE
        RETURN MAKE_DATE(v_anno, 12, 31);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcola_scadenza_tessera_csen(DATE, VARCHAR) TO authenticated, service_role, anon;

-- 4. Backfill data_scadenza_tessera su tutti i record esistenti
UPDATE public.registro_tesserati
SET data_scadenza_tessera = public.calcola_scadenza_tessera_csen(data_richiesta_tesseramento, livello_copertura)
WHERE data_scadenza_tessera IS NULL
  AND data_richiesta_tesseramento IS NOT NULL;

-- Aggiorna stato_tesseramento a SCADUTO per eventuali tessere già oltre la scadenza
UPDATE public.registro_tesserati
SET stato_tesseramento = 'SCADUTO'
WHERE stato_tesseramento = 'ATTIVO'
  AND data_scadenza_tessera IS NOT NULL
  AND data_scadenza_tessera < CURRENT_DATE;

-- 5. Aggiornamento public.approva_tesserato per calcolare e salvare data_scadenza_tessera
CREATE OR REPLACE FUNCTION public.approva_tesserato(p_anagrafica_id uuid, p_deciso_da uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_cert_stato VARCHAR;
    v_doc_stato VARCHAR;
    v_next_num VARCHAR;
    v_livello VARCHAR;
    v_caller_roles public.ruolo_utente[];
    v_secure_random INTEGER;
    v_seq INTEGER;
    v_anno VARCHAR;
    v_num_reg VARCHAR;
    v_utente_id UUID;
    v_quota_totale NUMERIC;
    v_has_receipt BOOLEAN := false;
    v_data_scadenza DATE;
BEGIN
    -- Check permissions (bypass if caller is service_role or server-side webhook where auth.uid() is null)
    IF auth.uid() IS NOT NULL THEN
        SELECT ruolo INTO v_caller_roles FROM public.utenti WHERE id = auth.uid();
        IF v_caller_roles IS NULL OR NOT (
            'presidente' = ANY(v_caller_roles) OR 
            'vice_presidente' = ANY(v_caller_roles) OR 
            'segretario' = ANY(v_caller_roles)
        ) THEN
            RAISE EXCEPTION 'Non autorizzato ad approvare tesseramenti';
        END IF;
    END IF;

    -- Check if certificate exists and is VERDE (get the most recent one!)
    SELECT stato_validazione INTO v_cert_stato 
    FROM public.certificati_medici 
    WHERE anagrafica_id = p_anagrafica_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_cert_stato IS NULL OR v_cert_stato != 'VERDE' THEN
        RAISE EXCEPTION 'Impossibile attivare il tesseramento: certificato medico non valido o non approvato (Stato attuale: %)', COALESCE(v_cert_stato, 'MANCANTE');
    END IF;

    -- Check if identity document exists and is VERDE
    SELECT stato_validazione INTO v_doc_stato
    FROM public.documenti_identita
    WHERE anagrafica_id = p_anagrafica_id AND (tipo_documento = 'PERSONALE' OR tipo_documento IS NULL)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_doc_stato IS NULL OR v_doc_stato != 'VERDE' THEN
        RAISE EXCEPTION 'Impossibile attivare il tesseramento: documento d''identità non valido o non approvato (Stato attuale: %)', COALESCE(v_doc_stato, 'MANCANTE');
    END IF;

    -- Guardrail Pagamento: recupera utente e quota totale
    SELECT a.utente_id, COALESCE(u.quota_totale, 0)
    INTO v_utente_id, v_quota_totale
    FROM public.anagrafiche a
    JOIN public.utenti u ON u.id = a.utente_id
    WHERE a.id = p_anagrafica_id;

    -- Verifica se esiste una ricevuta per l'anno in corso (esclusi eventi specifici)
    IF v_utente_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.ricevute_pagamenti
            WHERE utente_id = v_utente_id
              AND evento_id IS NULL
              AND anno_fiscale = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
        ) INTO v_has_receipt;
    END IF;

    -- Se la quota è maggiore di zero E non c'è una ricevuta valida: BLOCCA
    IF v_quota_totale > 0 AND NOT v_has_receipt THEN
        RAISE EXCEPTION 'ERRORE SICUREZZA: Impossibile attivare il tesseramento senza pagamento registrato (Quota insoluta: €%). Registrare prima il pagamento o attendere il saldo Stripe.', v_quota_totale;
    END IF;

    -- Fetch request details from approvazioni
    SELECT livello_copertura INTO v_livello
    FROM public.registro_approvazioni
    WHERE anagrafica_id = p_anagrafica_id 
      AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO') 
      AND (stato = 'IN_ATTESA' OR stato = 'IN_ATTESA_PAGAMENTO')
    LIMIT 1;

    IF v_livello IS NULL THEN
        v_livello := 'BASE';
    END IF;

    v_data_scadenza := public.calcola_scadenza_tessera_csen(CURRENT_DATE, v_livello);

    -- Secure CSEN Number Generation using crypto-randomness
    v_secure_random := (floor(random() * 900000) + 100000)::INTEGER;
    v_next_num := 'IT' || to_char(CURRENT_DATE, 'YY') || v_secure_random::VARCHAR;

    -- Double check collision
    WHILE EXISTS (SELECT 1 FROM public.registro_tesserati WHERE numero_tessera_csen = v_next_num) LOOP
        v_secure_random := (floor(random() * 900000) + 100000)::INTEGER;
        v_next_num := 'IT' || to_char(CURRENT_DATE, 'YY') || v_secure_random::VARCHAR;
    END LOOP;

    -- Calcola il prossimo numero di registro sequenziale (formato T_XXX_YYYY)
    v_anno := to_char(CURRENT_DATE, 'YYYY');
    SELECT COALESCE(MAX(
        CASE 
            WHEN numero_registro ~ ('^T_[0-9]+_' || v_anno || '$') 
            THEN split_part(numero_registro, '_', 2)::INTEGER
            ELSE 0
        END
    ), 0) + 1
    INTO v_seq
    FROM public.registro_tesserati;

    v_num_reg := 'T_' || LPAD(v_seq::TEXT, 3, '0') || '_' || v_anno;

    -- Inserisci in registro_tesserati
    INSERT INTO public.registro_tesserati (
        anagrafica_id,
        numero_tessera_csen,
        data_richiesta_tesseramento,
        data_scadenza_tessera,
        stato_tesseramento,
        livello_copertura,
        numero_registro
    )
    VALUES (
        p_anagrafica_id,
        v_next_num,
        CURRENT_DATE,
        v_data_scadenza,
        'ATTIVO',
        v_livello,
        v_num_reg
    )
    ON CONFLICT (anagrafica_id) 
    DO UPDATE SET 
        stato_tesseramento = 'ATTIVO',
        numero_tessera_csen = EXCLUDED.numero_tessera_csen,
        data_richiesta_tesseramento = CURRENT_DATE,
        data_scadenza_tessera = EXCLUDED.data_scadenza_tessera,
        livello_copertura = EXCLUDED.livello_copertura,
        numero_registro = COALESCE(public.registro_tesserati.numero_registro, EXCLUDED.numero_registro),
        sync_csen_status = 'PENDING';

    -- Aggiorna registro_approvazioni
    UPDATE public.registro_approvazioni
    SET stato = 'APPROVATO',
        data_decisione = CURRENT_DATE,
        deciso_da = p_deciso_da
    WHERE anagrafica_id = p_anagrafica_id 
      AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO') 
      AND (stato = 'IN_ATTESA' OR stato = 'IN_ATTESA_PAGAMENTO');

    RETURN TRUE;
END;
$function$;

-- 6. Aggiornamento salva_verbale_relazionale per impostare dinamicamente quota_scadenza al 31/12 dell'anno di delibera
CREATE OR REPLACE FUNCTION public.salva_verbale_relazionale(
    p_numero_verbale character varying,
    p_data_riunione date,
    p_ora_inizio time without time zone,
    p_ora_fine time without time zone,
    p_luogo text,
    p_tipo character varying,
    p_data_convocazione date,
    p_mezzo_convocazione character varying,
    p_id_presidente uuid,
    p_id_segretario uuid,
    p_quorum_costitutivo boolean,
    p_presenti_conteggio integer,
    p_totale_membri_conteggio integer,
    p_delibera_testo_completo text,
    p_presenze jsonb,
    p_punti jsonb,
    p_soci_da_approvare uuid[],
    p_soci_da_respingere jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_verbale_id UUID;
    v_riunione_id UUID;
    v_pres_record JSONB;
    v_punto_record JSONB;
    v_new_punto_id UUID;
    v_socio_anagrafica_id UUID;
    v_rifiuto_record JSONB;
BEGIN
    -- AUTH CHECK - Solo presidente, vice, segretario
    v_caller_roles := public.get_user_role(auth.uid());
    IF NOT (v_caller_roles && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]) THEN
        RAISE EXCEPTION 'Non autorizzato: ruolo insufficiente per questa operazione.';
    END IF;

    -- Step A: Insert or Update verbali_consiglio
    INSERT INTO public.verbali_consiglio (numero_verbale, data_riunione, delibera_testo, redatto_da, approvato_da)
    VALUES (p_numero_verbale, p_data_riunione, p_delibera_testo_completo, p_id_segretario, p_id_presidente)
    ON CONFLICT (numero_verbale) DO UPDATE
    SET data_riunione = EXCLUDED.data_riunione,
        delibera_testo = EXCLUDED.delibera_testo,
        redatto_da = EXCLUDED.redatto_da,
        approvato_da = EXCLUDED.approvato_da
    RETURNING id INTO v_verbale_id;

    -- Step B: Insert or Update riunioni_consiglio
    INSERT INTO public.riunioni_consiglio (
        numero_verbale, data_riunione, ora_inizio, ora_fine, luogo, tipo,
        data_convocazione, mezzo_convocazione, id_presidente, id_segretario,
        quorum_costitutivo, presenti_conteggio, totale_membri_conteggio
    )
    VALUES (
        p_numero_verbale, p_data_riunione, p_ora_inizio, p_ora_fine, p_luogo, p_tipo,
        p_data_convocazione, p_mezzo_convocazione, p_id_presidente, p_id_segretario,
        p_quorum_costitutivo, p_presenti_conteggio, p_totale_membri_conteggio
    )
    ON CONFLICT (numero_verbale) DO UPDATE
    SET data_riunione = EXCLUDED.data_riunione,
        ora_inizio = EXCLUDED.ora_inizio,
        ora_fine = EXCLUDED.ora_fine,
        luogo = EXCLUDED.luogo,
        tipo = EXCLUDED.tipo,
        data_convocazione = EXCLUDED.data_convocazione,
        mezzo_convocazione = EXCLUDED.mezzo_convocazione,
        id_presidente = EXCLUDED.id_presidente,
        id_segretario = EXCLUDED.id_segretario,
        quorum_costitutivo = EXCLUDED.quorum_costitutivo,
        presenti_conteggio = EXCLUDED.presenti_conteggio,
        totale_membri_conteggio = EXCLUDED.totale_membri_conteggio
    RETURNING id INTO v_riunione_id;

    -- Step C: Clear and insert presenze
    DELETE FROM public.presenze_riunione WHERE riunione_id = v_riunione_id;
    FOR v_pres_record IN SELECT * FROM jsonb_array_elements(p_presenze) LOOP
        INSERT INTO public.presenze_riunione (riunione_id, utente_id, presenza)
        VALUES (v_riunione_id, (v_pres_record->>'utente_id')::UUID, (v_pres_record->>'presenza')::BOOLEAN);
    END LOOP;

    -- Step D: Clear and insert punti_odg & votazioni
    DELETE FROM public.punti_odg WHERE riunione_id = v_riunione_id;
    FOR v_punto_record IN SELECT * FROM jsonb_array_elements(p_punti) LOOP
        INSERT INTO public.punti_odg (riunione_id, ordine, titolo, discussione, delibera_tipo, delibera_testo)
        VALUES (
            v_riunione_id,
            (v_punto_record->>'ordine')::INTEGER,
            v_punto_record->>'titolo',
            v_punto_record->>'discussione',
            v_punto_record->>'delibera_tipo',
            v_punto_record->>'delibera_testo'
        )
        RETURNING id INTO v_new_punto_id;

        IF v_punto_record ? 'votazione' THEN
            INSERT INTO public.votazioni_odg (punto_odg_id, favorevoli, contrari, astenuti, esito)
            VALUES (
                v_new_punto_id,
                (v_punto_record->'votazione'->>'favorevoli')::INTEGER,
                (v_punto_record->'votazione'->>'contrari')::INTEGER,
                (v_punto_record->'votazione'->>'astenuti')::INTEGER,
                v_punto_record->'votazione'->>'esito'
            );
        END IF;
    END LOOP;

    -- Step E: ATOMIC MEMBER BOOK INTEGRATION - APPROVALS
    IF p_soci_da_approvare IS NOT NULL AND array_length(p_soci_da_approvare, 1) > 0 THEN
        FOREACH v_socio_anagrafica_id IN ARRAY p_soci_da_approvare LOOP
            DECLARE
                v_num_reg VARCHAR(20) := next_registro_number('SOCIO', CAST(EXTRACT(YEAR FROM p_data_riunione) AS INTEGER));
            BEGIN
                INSERT INTO public.registro_soci (
                    anagrafica_id, 
                    stato_socio, 
                    data_delibera_direttivo,
                    numero_verbale,
                    numero_registro,
                    quota_scadenza
                ) VALUES (
                    v_socio_anagrafica_id,
                    'ATTIVO',
                    p_data_riunione,
                    p_numero_verbale,
                    v_num_reg,
                    MAKE_DATE(EXTRACT(YEAR FROM p_data_riunione)::INTEGER, 12, 31)
                );

                UPDATE public.registro_approvazioni
                SET data_decisione = p_data_riunione,
                    numero_verbale = p_numero_verbale,
                    deciso_da = p_id_presidente
                WHERE anagrafica_id = v_socio_anagrafica_id 
                  AND (tipo = 'SOCIO' OR tipo = 'SOCIO_TESSERATO');
            END;
        END LOOP;
    END IF;

    -- Step F: ATOMIC MEMBER BOOK INTEGRATION - REJECTIONS & CASCADE TO PENDING DOCS
    IF p_soci_da_respingere IS NOT NULL AND jsonb_array_length(p_soci_da_respingere) > 0 THEN
        FOR v_rifiuto_record IN SELECT * FROM jsonb_array_elements(p_soci_da_respingere) LOOP
            v_socio_anagrafica_id := (v_rifiuto_record->>'anagrafica_id')::UUID;
            
            UPDATE public.registro_approvazioni
            SET stato = 'RESPINTO',
                data_decisione = p_data_riunione,
                numero_verbale = p_numero_verbale,
                deciso_da = p_id_presidente,
                motivo_rifiuto = v_rifiuto_record->>'motivo'
            WHERE anagrafica_id = v_socio_anagrafica_id AND stato = 'IN_ATTESA' 
              AND (tipo = 'SOCIO' OR tipo = 'SOCIO_TESSERATO');

            -- Cascade rejection on unreviewed certs
            UPDATE public.certificati_medici
            SET stato_validazione = 'ROSSO',
                revisionato_manualmente = true,
                note_ai = COALESCE(v_rifiuto_record->>'motivo', 'Iscrizione socio respinta dal Consiglio Direttivo.')
            WHERE anagrafica_id = v_socio_anagrafica_id
              AND revisionato_manualmente = false;

            -- Cascade rejection on unreviewed ID documents
            UPDATE public.documenti_identita
            SET stato_validazione = 'ROSSO',
                revisionato_manualmente = true,
                note_ai = COALESCE(v_rifiuto_record->>'motivo', 'Iscrizione socio respinta dal Consiglio Direttivo.')
            WHERE anagrafica_id = v_socio_anagrafica_id
              AND revisionato_manualmente = false;
        END LOOP;
    END IF;

    RETURN v_riunione_id;
END;
$function$;
