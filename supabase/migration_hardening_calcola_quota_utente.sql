-- ==============================================================================
-- Migrazione: migration_hardening_calcola_quota_utente.sql
-- Scopo (Audit /4-audit):
-- 1. Estendere trigger_calcola_quota a BEFORE INSERT OR UPDATE su public.utenti
-- 2. Calcolare sempre lato database quota_totale da public.configurazioni_tariffe
--    alla creazione o prima compilazione profilo (ignorando importi client)
-- 3. Impedire modifiche client a quota_totale, tipo_adesione e tipo_tessera
--    per utenti non amministrativi dopo la registrazione iniziale
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calcola_quota_utente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_quota NUMERIC(10,2) := 0;
    v_quota_socio NUMERIC(10,2) := 0;
    v_quota_tessera NUMERIC(10,2) := 0;
    v_caller_roles public.ruolo_utente[];
    v_is_admin BOOLEAN := false;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_roles := public.get_user_role(auth.uid());
        v_is_admin := (
            v_caller_roles IS NOT NULL
            AND (v_caller_roles && ARRAY['presidente', 'vice_presidente', 'tesoriere']::public.ruolo_utente[])
        );
    END IF;

    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.tipo_adesione IS NULL AND NEW.tipo_adesione IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND auth.uid() = NEW.id AND NOT v_is_admin AND COALESCE(OLD.quota_totale, 0) <= 0 AND COALESCE(NEW.quota_totale, 0) > 0) THEN

        IF NEW.tipo_adesione IS NOT NULL THEN
            IF NEW.tipo_adesione IN ('socio', 'socio_tesserato') THEN
                SELECT COALESCE(valore::NUMERIC(10,2), 0) INTO v_quota_socio
                FROM public.configurazioni_tariffe
                WHERE chiave = 'quota_socio';
                v_quota := v_quota + COALESCE(v_quota_socio, 0);
            END IF;

            IF NEW.tipo_adesione IN ('tesserato', 'socio_tesserato') AND NEW.tipo_tessera IS NOT NULL THEN
                SELECT COALESCE(valore::NUMERIC(10,2), 0) INTO v_quota_tessera
                FROM public.configurazioni_tariffe
                WHERE chiave = NEW.tipo_tessera;
                v_quota := v_quota + COALESCE(v_quota_tessera, 0);
            END IF;

            NEW.quota_totale := v_quota;
        ELSE
            NEW.quota_totale := 0;
        END IF;

    ELSIF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NOT v_is_admin THEN
        NEW.quota_totale := OLD.quota_totale;
        NEW.tipo_adesione := OLD.tipo_adesione;
        NEW.tipo_tessera := OLD.tipo_tessera;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_calcola_quota ON public.utenti;

CREATE TRIGGER trigger_calcola_quota
BEFORE INSERT OR UPDATE ON public.utenti
FOR EACH ROW
EXECUTE FUNCTION public.calcola_quota_utente();
