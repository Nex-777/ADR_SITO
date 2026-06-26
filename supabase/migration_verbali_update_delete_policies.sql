-- ===========================================================================
-- MIGRAZIONE RLS: Aggiunta Policy UPDATE/DELETE per Tabelle Verbali (2026-06-26)
-- ===========================================================================

-- 1. riunioni_consiglio
DROP POLICY IF EXISTS "update_riunioni_consiglio" ON public.riunioni_consiglio;
CREATE POLICY "update_riunioni_consiglio" ON public.riunioni_consiglio
    FOR UPDATE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "delete_riunioni_consiglio" ON public.riunioni_consiglio;
CREATE POLICY "delete_riunioni_consiglio" ON public.riunioni_consiglio
    FOR DELETE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

-- 2. presenze_riunione
DROP POLICY IF EXISTS "update_presenze_riunione" ON public.presenze_riunione;
CREATE POLICY "update_presenze_riunione" ON public.presenze_riunione
    FOR UPDATE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "delete_presenze_riunione" ON public.presenze_riunione;
CREATE POLICY "delete_presenze_riunione" ON public.presenze_riunione
    FOR DELETE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

-- 3. punti_odg
DROP POLICY IF EXISTS "update_punti_odg" ON public.punti_odg;
CREATE POLICY "update_punti_odg" ON public.punti_odg
    FOR UPDATE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "delete_punti_odg" ON public.punti_odg;
CREATE POLICY "delete_punti_odg" ON public.punti_odg
    FOR DELETE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

-- 4. votazioni_odg
DROP POLICY IF EXISTS "update_votazioni_odg" ON public.votazioni_odg;
CREATE POLICY "update_votazioni_odg" ON public.votazioni_odg
    FOR UPDATE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "delete_votazioni_odg" ON public.votazioni_odg;
CREATE POLICY "delete_votazioni_odg" ON public.votazioni_odg
    FOR DELETE USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );
