-- ==============================================================================
-- Migrazione: migration_tariffe_presidenza_rls.sql
-- Scopo:
-- 1. Restringere la modifica di public.configurazioni_tariffe ai soli ruoli
--    presidente e vice_presidente
-- 2. Aggiungere vincolo di integrita valore > 0 sulle quote configurate
-- ==============================================================================

DROP POLICY IF EXISTS "Modifica tariffe riservata admin" ON public.configurazioni_tariffe;
DROP POLICY IF EXISTS "Modifica tariffe riservata presidenza" ON public.configurazioni_tariffe;

CREATE POLICY "Modifica tariffe riservata presidenza"
ON public.configurazioni_tariffe
FOR ALL
USING (
    public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
)
WITH CHECK (
    public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
);

ALTER TABLE public.configurazioni_tariffe
DROP CONSTRAINT IF EXISTS configurazioni_tariffe_valore_positivo;

ALTER TABLE public.configurazioni_tariffe
ADD CONSTRAINT configurazioni_tariffe_valore_positivo CHECK (valore > 0);
