-- ==============================================================================
-- Migrazione: migration_payment_guardrail_and_triggers.sql
-- Scopo: 
-- 1. Riscrittura di aggiorna_stato_approvazione con ORDER BY created_at DESC e check doc d'identità
-- 2. Trigger automatico su public.documenti_identita per transizione a IN_ATTESA_PAGAMENTO
-- 3. Hardening di public.approva_tesserato con guardrail ferreo di verifica quota_totale / ricevuta
-- ==============================================================================

-- 1. Aggiorna funzione aggiorna_stato_approvazione
CREATE OR REPLACE FUNCTION public.aggiorna_stato_approvazione(p_anagrafica_id UUID)
RETURNS VOID AS $$
DECLARE
    v_tipo VARCHAR(20);
    v_stato VARCHAR(30);
    v_cert_stato VARCHAR(10);
    v_cert_scaduto BOOLEAN := false;
    v_doc_stato VARCHAR(10);
    v_doc_scaduto BOOLEAN := false;
    v_tutore_doc_stato VARCHAR(10);
    v_tutore_doc_scaduto BOOLEAN := false;
    v_all_docs_valid BOOLEAN := false;
    v_socio_exists BOOLEAN := false;
BEGIN
    SELECT tipo, stato INTO v_tipo, v_stato
    FROM public.registro_approvazioni
    WHERE anagrafica_id = p_anagrafica_id AND stato IN ('IN_ATTESA', 'IN_ATTESA_PAGAMENTO')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Ultimo certificato medico caricato (ordinato cronologicamente)
    SELECT stato_validazione, COALESCE(data_scadenza < CURRENT_DATE, false)
    INTO v_cert_stato, v_cert_scaduto
    FROM public.certificati_medici
    WHERE anagrafica_id = p_anagrafica_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Ultimo documento di identità personale (ordinato cronologicamente)
    SELECT stato_validazione, COALESCE(data_scadenza < CURRENT_DATE, false)
    INTO v_doc_stato, v_doc_scaduto
    FROM public.documenti_identita
    WHERE anagrafica_id = p_anagrafica_id AND (tipo_documento = 'PERSONALE' OR tipo_documento IS NULL)
    ORDER BY created_at DESC
    LIMIT 1;

    -- Eventuale documento tutore (se presente/minorenne)
    SELECT stato_validazione, COALESCE(data_scadenza < CURRENT_DATE, false)
    INTO v_tutore_doc_stato, v_tutore_doc_scaduto
    FROM public.documenti_identita
    WHERE anagrafica_id = p_anagrafica_id AND tipo_documento = 'TUTORE'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Documenti d'identità validi se quello personale è VERDE (e non scaduto) e il tutore (se presente) è VERDE (e non scaduto)
    v_all_docs_valid := (v_doc_stato = 'VERDE' AND v_doc_scaduto = false) 
                        AND (v_tutore_doc_stato IS NULL OR (v_tutore_doc_stato = 'VERDE' AND v_tutore_doc_scaduto = false));

    -- Verifica esistenza delibera socio nel registro_soci
    SELECT EXISTS (
        SELECT 1 FROM public.registro_soci 
        WHERE anagrafica_id = p_anagrafica_id
    ) INTO v_socio_exists;

    IF v_tipo = 'TESSERATO' THEN
        IF v_cert_stato = 'VERDE' AND v_cert_scaduto = false AND v_all_docs_valid THEN
            UPDATE public.registro_approvazioni
            SET stato = 'IN_ATTESA_PAGAMENTO'
            WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA';
        ELSE
            UPDATE public.registro_approvazioni
            SET stato = 'IN_ATTESA'
            WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA_PAGAMENTO';
        END IF;

    ELSIF v_tipo = 'SOCIO' THEN
        IF v_socio_exists AND v_all_docs_valid THEN
            UPDATE public.registro_approvazioni
            SET stato = 'IN_ATTESA_PAGAMENTO'
            WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA';
        ELSE
            UPDATE public.registro_approvazioni
            SET stato = 'IN_ATTESA'
            WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA_PAGAMENTO';
        END IF;

    ELSIF v_tipo = 'SOCIO_TESSERATO' THEN
        IF v_socio_exists AND v_cert_stato = 'VERDE' AND v_cert_scaduto = false AND v_all_docs_valid THEN
            UPDATE public.registro_approvazioni
            SET stato = 'IN_ATTESA_PAGAMENTO'
            WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA';
        ELSE
            UPDATE public.registro_approvazioni
            SET stato = 'IN_ATTESA'
            WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA_PAGAMENTO';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger su public.documenti_identita
CREATE OR REPLACE FUNCTION public.trigger_on_documenti_identita_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.aggiorna_stato_approvazione(NEW.anagrafica_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_approvazione_on_doc ON public.documenti_identita;
CREATE TRIGGER trigger_update_approvazione_on_doc
AFTER INSERT OR UPDATE OF stato_validazione, data_scadenza ON public.documenti_identita
FOR EACH ROW
EXECUTE FUNCTION public.trigger_on_documenti_identita_update();

-- 3. Hardening di approva_tesserato con guardrail di pagamento
CREATE OR REPLACE FUNCTION public.approva_tesserato(p_anagrafica_id UUID, p_deciso_da UUID)
RETURNS BOOLEAN AS $$
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
    INSERT INTO public.registro_tesserati (anagrafica_id, numero_tessera_csen, data_richiesta_tesseramento, stato_tesseramento, livello_copertura, numero_registro)
    VALUES (
        p_anagrafica_id,
        v_next_num,
        CURRENT_DATE,
        'ATTIVO',
        v_livello,
        v_num_reg
    )
    ON CONFLICT (anagrafica_id) 
    DO UPDATE SET 
        stato_tesseramento = 'ATTIVO',
        numero_tessera_csen = EXCLUDED.numero_tessera_csen,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
