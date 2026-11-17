-- ==============================================================================
-- Migrazione: migration_audit_fixes_csen_2027.sql
-- Scopo (Audit /4-audit):
-- 1. Hardening RLS: rimozione policy permissive legacy self_insert_socio e self_insert_tesserato
-- 2. RPC SECURITY DEFINER dichiara_socio_decaduto per consentire a Presidente, Vice Presidente
--    e Segretario di deliberare la decadenza per morosità senza bypassare RLS
-- ==============================================================================

-- 1. Rimozione policy legacy permissive (le attivazioni legittime usano RPC / service_role)
DROP POLICY IF EXISTS self_insert_socio ON public.registro_soci;
DROP POLICY IF EXISTS self_insert_tesserato ON public.registro_tesserati;

-- 2. RPC SECURITY DEFINER per deliberare decadenza socio per morosità
CREATE OR REPLACE FUNCTION public.dichiara_socio_decaduto(
    p_id_socio INTEGER,
    p_verbale_decadenza VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_verbale TEXT := btrim(COALESCE(p_verbale_decadenza, ''));
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_roles := public.get_user_role(auth.uid());
        IF v_caller_roles IS NULL OR NOT (
            v_caller_roles && ARRAY['presidente', 'vice_presidente', 'segretario']::public.ruolo_utente[]
        ) THEN
            RAISE EXCEPTION 'Non autorizzato a deliberare la decadenza dei soci';
        END IF;
    END IF;

    IF v_verbale = '' THEN
        RAISE EXCEPTION 'Il riferimento del verbale di decadenza è obbligatorio';
    END IF;

    UPDATE public.registro_soci
    SET stato_socio = 'DECADUTO',
        data_decadenza = CURRENT_DATE,
        verbale_decadenza = v_verbale
    WHERE id_socio = p_id_socio
      AND stato_socio = 'ATTIVO'
      AND quota_scadenza < CURRENT_DATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Socio non trovato, non attivo o non in stato di morosità.';
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dichiara_socio_decaduto(INTEGER, VARCHAR) TO authenticated, service_role;
