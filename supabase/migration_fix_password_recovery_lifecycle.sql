-- Migration: migration_fix_password_recovery_lifecycle.sql
-- Obiettivo:
-- 1. Risolvere retroattivamente le richieste di recupero password già superate da un login successivo in auth.users
-- 2. Creare trigger automatico su auth.users per risolvere richieste in_attesa al login o cambio password

-- 1. Backfill richieste superate da login successivo
UPDATE public.richieste_recupero_password r
SET stato = 'risolto',
    risolto_il = COALESCE(u.last_sign_in_at, now())
FROM auth.users u
WHERE lower(u.email) = lower(r.email)
  AND r.stato = 'in_attesa'
  AND u.last_sign_in_at IS NOT NULL
  AND u.last_sign_in_at > r.created_at;

-- 2. Funzione trigger per auto-risoluzione al login o cambio password
CREATE OR REPLACE FUNCTION public.fn_auto_resolve_password_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NEW.email IS NOT NULL AND (
        NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
        OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
    ) THEN
        UPDATE public.richieste_recupero_password
        SET stato = 'risolto',
            risolto_il = now()
        WHERE lower(email) = lower(NEW.email)
          AND stato = 'in_attesa';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_resolve_password_recovery ON auth.users;

CREATE TRIGGER trg_auto_resolve_password_recovery
AFTER UPDATE OF last_sign_in_at, encrypted_password ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_resolve_password_recovery();
