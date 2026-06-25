-- SQL Migration: RLS Hardening and Cryptographically Secure CSEN Number Generation

-- 1. Enable RLS on rate_limits (no public policies, fully blocked from client)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- 2. Setup RLS Policies for bilanci
DROP POLICY IF EXISTS select_bilanci ON public.bilanci;
CREATE POLICY select_bilanci ON public.bilanci FOR SELECT
    USING (
        'socio_approvato' = ANY(public.get_user_role(auth.uid()))
        OR public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS write_bilanci ON public.bilanci;
CREATE POLICY write_bilanci ON public.bilanci FOR ALL
    USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'tesoriere']::public.ruolo_utente[]
    );

-- 3. Setup RLS Policies for verbali_assemblea
DROP POLICY IF EXISTS select_verbali_assemblea ON public.verbali_assemblea;
CREATE POLICY select_verbali_assemblea ON public.verbali_assemblea FOR SELECT
    USING (
        'socio_approvato' = ANY(public.get_user_role(auth.uid()))
        OR public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS insert_verbali_assemblea ON public.verbali_assemblea;
CREATE POLICY insert_verbali_assemblea ON public.verbali_assemblea FOR INSERT
    WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario']::public.ruolo_utente[]
    );

-- 4. Setup RLS Policies for ricevute_pagamenti
DROP POLICY IF EXISTS user_read_ricevute ON public.ricevute_pagamenti;
CREATE POLICY user_read_ricevute ON public.ricevute_pagamenti FOR SELECT
    USING (
        auth.uid() = utente_id
        OR public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]
    );

-- 5. Hardening CSEN number generation in approva_tesserato
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
    WHERE anagrafica_id = p_anagrafica_id AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO') AND stato = 'IN_ATTESA'
    LIMIT 1;

    -- Default if not found (direct activation fallback)
    IF v_livello IS NULL THEN
        v_livello := 'BASE';
    END IF;

    -- Genera numero registro
    v_next_num := next_registro_number('TESSERATO', EXTRACT(YEAR FROM CURRENT_DATE)::integer);

    -- Genera numero CSEN crittograficamente sicuro (100000 - 999999)
    v_secure_random := (abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::integer) % 900000 + 100000);

    -- Inserisci nel registro tesserati
    INSERT INTO public.registro_tesserati (anagrafica_id, numero_tessera_csen, data_richiesta_tesseramento, stato_tesseramento, livello_copertura, numero_registro)
    VALUES (
        p_anagrafica_id, 
        'CSEN-' || v_secure_random, 
        CURRENT_DATE, 
        'ATTIVO', 
        v_livello, 
        v_next_num
    )
    ON CONFLICT (anagrafica_id) DO UPDATE SET
        stato_tesseramento = 'ATTIVO',
        livello_copertura = v_livello,
        numero_registro = COALESCE(public.registro_tesserati.numero_registro, v_next_num);

    -- Update approvazioni
    UPDATE public.registro_approvazioni
    SET stato = 'APPROVATO',
        data_decisione = CURRENT_DATE,
        deciso_da = p_deciso_da
    WHERE anagrafica_id = p_anagrafica_id AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO') AND stato = 'IN_ATTESA';

    RETURN TRUE;
END;
$function$;
