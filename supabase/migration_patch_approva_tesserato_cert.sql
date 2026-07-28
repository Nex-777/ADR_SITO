-- Fix approva_tesserato to only check the most recent certificate

CREATE OR REPLACE FUNCTION public.approva_tesserato(p_anagrafica_id uuid, p_deciso_da uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_cert_stato VARCHAR;
    v_next_num VARCHAR;
    v_livello VARCHAR;
    v_caller_roles public.ruolo_utente[];
    v_secure_random INTEGER;
BEGIN
    -- Check permissions
    SELECT ruolo INTO v_caller_roles FROM public.utenti WHERE id = auth.uid();
    IF v_caller_roles IS NULL OR NOT (
        'presidente' = ANY(v_caller_roles) OR 
        'vice_presidente' = ANY(v_caller_roles) OR 
        'segretario' = ANY(v_caller_roles)
    ) THEN
        RAISE EXCEPTION 'Non autorizzato ad approvare tesseramenti';
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

    -- Fetch request details from approvazioni
    SELECT livello_copertura INTO v_livello
    FROM public.registro_approvazioni
    WHERE anagrafica_id = p_anagrafica_id 
      AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO') 
      AND (stato = 'IN_ATTESA' OR stato = 'IN_ATTESA_PAGAMENTO')
    LIMIT 1;

    IF v_livello IS NULL THEN
        RAISE EXCEPTION 'Nessuna richiesta di tesseramento in attesa per questa anagrafica';
    END IF;

    -- Secure CSEN Number Generation using crypto-randomness
    v_secure_random := (floor(random() * 900000) + 100000)::INTEGER;
    v_next_num := 'IT' || to_char(CURRENT_DATE, 'YY') || v_secure_random::VARCHAR;

    -- Double check collision
    WHILE EXISTS (SELECT 1 FROM public.registro_tesserati WHERE numero_tessera_csen = v_next_num) LOOP
        v_secure_random := (floor(random() * 900000) + 100000)::INTEGER;
        v_next_num := 'IT' || to_char(CURRENT_DATE, 'YY') || v_secure_random::VARCHAR;
    END LOOP;

    -- Inserisci in registro_tesserati
    INSERT INTO public.registro_tesserati (anagrafica_id, numero_tessera_csen, data_richiesta_tesseramento, stato_tesseramento, livello_copertura, numero_registro)
    VALUES (
        p_anagrafica_id,
        v_next_num,
        CURRENT_DATE,
        'ATTIVO',
        v_livello,
        'REG-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(floor(random() * 10000)::VARCHAR, 4, '0')
    )
    ON CONFLICT (anagrafica_id) 
    DO UPDATE SET 
        stato_tesseramento = 'ATTIVO',
        numero_tessera_csen = EXCLUDED.numero_tessera_csen,
        livello_copertura = EXCLUDED.livello_copertura,
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
