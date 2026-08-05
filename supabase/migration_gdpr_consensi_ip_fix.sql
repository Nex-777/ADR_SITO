-- ============================================================================
-- MIGRAZIONE GDPR: Fix IP Address per Registrazione OTP
-- Data: 2026-08-03
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_log_consensi_utenti()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_fonte VARCHAR(50);
    v_ip VARCHAR(45);
    v_jwt_claims JSON;
    v_headers JSON;
    v_versione VARCHAR(20);
BEGIN
    -- Recupera il ruolo dal JWT di Supabase per determinare la fonte
    BEGIN
        v_jwt_claims := current_setting('request.jwt.claims', true)::json;
        v_role := v_jwt_claims->>'role';
    EXCEPTION WHEN OTHERS THEN
        v_role := NULL;
    END;

    IF v_role = 'service_role' THEN
        v_fonte := 'registrazione_otp';
        -- Preleva IP reale salvato dal backend in atti_adesione (ignora l'IP Vercel)
        SELECT ip_address INTO v_ip 
        FROM public.atti_adesione 
        WHERE utente_id = NEW.id 
        ORDER BY created_at DESC 
        LIMIT 1;
    ELSE
        v_fonte := 'dashboard_utente';
        -- Recupera l'IP della richiesta se disponibile dalle intestazioni HTTP PostgREST
        BEGIN
            v_headers := current_setting('request.headers', true)::json;
            v_ip := split_part(v_headers->>'x-forwarded-for', ',', 1);
        EXCEPTION WHEN OTHERS THEN
            v_ip := NULL;
        END;
    END IF;

    -- Versione della policy privacy
    v_versione := COALESCE(NEW.versione_privacy_accettata, '1.03.86');

    -- Log del consenso marketing se modificato
    IF OLD.consenso_marketing IS DISTINCT FROM NEW.consenso_marketing THEN
        INSERT INTO public.registro_consensi (
            utente_id,
            tipo_consenso,
            stato_consenso,
            fonte_modifica,
            versione_policy,
            ip_address
        ) VALUES (
            NEW.id,
            'consenso_marketing',
            COALESCE(NEW.consenso_marketing, false),
            v_fonte,
            v_versione,
            v_ip
        );
    END IF;

    -- Log del consenso audiovisivi se modificato
    IF OLD.consenso_audiovisivi IS DISTINCT FROM NEW.consenso_audiovisivi THEN
        INSERT INTO public.registro_consensi (
            utente_id,
            tipo_consenso,
            stato_consenso,
            fonte_modifica,
            versione_policy,
            ip_address
        ) VALUES (
            NEW.id,
            'consenso_audiovisivi',
            COALESCE(NEW.consenso_audiovisivi, false),
            v_fonte,
            v_versione,
            v_ip
        );
    END IF;

    RETURN NEW;
END;
$$;
