-- Supabase Migration Patch Istruttori v3 (Recursion Fix)
-- This patch replaces (SELECT ruolo FROM public.utenti WHERE id = auth.uid()) with public.get_user_role(auth.uid()) in RLS policies to prevent infinite recursion.

-- 1. Table: public.eventi
DROP POLICY IF EXISTS all_admin_eventi ON public.eventi;
CREATE POLICY all_admin_eventi ON public.eventi FOR ALL
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[])
    );

-- 2. Table: public.iscrizioni_eventi
DROP POLICY IF EXISTS select_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY select_iscrizioni ON public.iscrizioni_eventi FOR SELECT
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[])
        OR (utente_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = iscrizioni_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS delete_admin_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY delete_admin_iscrizioni ON public.iscrizioni_eventi FOR DELETE
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[])
    );

DROP POLICY IF EXISTS update_board_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY update_board_iscrizioni ON public.iscrizioni_eventi FOR UPDATE
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere']::public.ruolo_utente[])
    );

-- 3. Table: public.istruttori_eventi
DROP POLICY IF EXISTS select_istruttori_eventi ON public.istruttori_eventi;
CREATE POLICY select_istruttori_eventi ON public.istruttori_eventi FOR SELECT
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[])
        OR (istruttore_id = auth.uid())
    );

DROP POLICY IF EXISTS all_admin_istruttori_eventi ON public.istruttori_eventi;
CREATE POLICY all_admin_istruttori_eventi ON public.istruttori_eventi FOR ALL
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[])
    );

-- 4. Table: public.presenze_eventi
DROP POLICY IF EXISTS select_presenze_eventi ON public.presenze_eventi;
CREATE POLICY select_presenze_eventi ON public.presenze_eventi FOR SELECT
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = presenze_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS delete_admin_presenze ON public.presenze_eventi;
CREATE POLICY delete_admin_presenze ON public.presenze_eventi FOR DELETE
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[])
    );
