-- Migration: Fix Numero Registro Tesserati format (T_XXX_YYYY)
-- Corregge il formato di numero_registro nella funzione approva_tesserato() e risana i record con prefisso REG-

-- 1. Aggiornamento funzione public.approva_tesserato()
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
    v_seq INTEGER;
    v_anno VARCHAR;
    v_num_reg VARCHAR;
BEGIN
    -- Check permissions
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
$function$;

-- 2. Sanatoria atomica record esistenti con prefisso REG- (es. Daniele Oronzo Stefanelli)
DO $$
DECLARE
    v_r RECORD;
    v_seq INTEGER;
    v_anno VARCHAR;
    v_new_num VARCHAR;
BEGIN
    FOR v_r IN 
        SELECT anagrafica_id, numero_registro, data_richiesta_tesseramento 
        FROM public.registro_tesserati 
        WHERE numero_registro LIKE 'REG-%' 
        ORDER BY data_richiesta_tesseramento ASC
    LOOP
        v_anno := to_char(COALESCE(v_r.data_richiesta_tesseramento, CURRENT_DATE), 'YYYY');
        
        SELECT COALESCE(MAX(
            CASE 
                WHEN numero_registro ~ ('^T_[0-9]+_' || v_anno || '$') 
                THEN split_part(numero_registro, '_', 2)::INTEGER
                ELSE 0
            END
        ), 0) + 1
        INTO v_seq
        FROM public.registro_tesserati;

        v_new_num := 'T_' || LPAD(v_seq::TEXT, 3, '0') || '_' || v_anno;

        UPDATE public.registro_tesserati
        SET numero_registro = v_new_num
        WHERE anagrafica_id = v_r.anagrafica_id;
    END LOOP;
END $$;
