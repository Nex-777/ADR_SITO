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
BEGIN
    -- Check permissions (only check if auth.uid() is not null, indicating a client call. Webhooks/service role will have auth.uid() = null)
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

    -- Check if certificate exists and is VERDE
    SELECT stato_validazione INTO v_cert_stato 
    FROM public.certificati_medici 
    WHERE anagrafica_id = p_anagrafica_id;

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

    -- Default if not found (direct activation fallback)
    IF v_livello IS NULL THEN
        v_livello := 'BASE';
    END IF;

    -- Genera numero registro
    v_next_num := next_registro_number('TESSERATO', EXTRACT(YEAR FROM CURRENT_DATE)::integer);

    -- Inserisci nel registro tesserati
    INSERT INTO public.registro_tesserati (anagrafica_id, data_richiesta_tesseramento, stato_tesseramento, livello_copertura, numero_registro, sync_csen_status)
    VALUES (
        p_anagrafica_id, 
        CURRENT_DATE, 
        'ATTIVO', 
        v_livello, 
        v_next_num,
        'PENDING'
    )
    ON CONFLICT (anagrafica_id) DO UPDATE SET
        stato_tesseramento = 'ATTIVO',
        livello_copertura = v_livello,
        numero_registro = COALESCE(public.registro_tesserati.numero_registro, v_next_num),
        sync_csen_status = 'PENDING';

    -- Update approvazioni
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
