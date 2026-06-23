-- Supabase Migration Patch Istruttori v2
-- This file implements corrections to RLS policies, views and functions.

-- BUG-01: Update public.get_user_role in repository schema representation
-- (Note: in DB it already returns ruolo_utente[], we recreate it here to ensure consistency)
CREATE OR REPLACE FUNCTION public.get_user_role(user_uid UUID)
RETURNS public.ruolo_utente[] AS $$
    SELECT ruolo FROM public.utenti WHERE id = user_uid;
$$ LANGUAGE sql SECURITY DEFINER;

-- BUG-06: UPDATE policy on iscrizioni_eventi
DROP POLICY IF EXISTS update_own_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY update_own_iscrizioni ON public.iscrizioni_eventi FOR UPDATE
    USING (utente_id = auth.uid())
    WITH CHECK (utente_id = auth.uid());

DROP POLICY IF EXISTS update_board_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY update_board_iscrizioni ON public.iscrizioni_eventi FOR UPDATE
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere']::public.ruolo_utente[]
    );

-- RLS-03 & BUG-02: Recreate select_iscrizioni with explicit parentheses
DROP POLICY IF EXISTS select_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY select_iscrizioni ON public.iscrizioni_eventi FOR SELECT
    USING (
        ((SELECT ruolo FROM public.utenti WHERE id = auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[])
        OR (utente_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = iscrizioni_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

-- RLS-01: RLS updates on joined tables to allow instructors to see their athletes' details
-- 1. utenti SELECT
DROP POLICY IF EXISTS select_consiglio_utenti ON public.utenti;
CREATE POLICY select_consiglio_utenti ON public.utenti FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            WHERE ist.istruttore_id = auth.uid()
            AND ie.utente_id = utenti.id
        )
    );

-- 2. anagrafiche SELECT
DROP POLICY IF EXISTS select_consiglio_anagrafiche ON public.anagrafiche;
CREATE POLICY select_consiglio_anagrafiche ON public.anagrafiche FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (utente_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            WHERE ist.istruttore_id = auth.uid()
            AND ie.utente_id = anagrafiche.utente_id
        )
    );

-- 3. registro_soci SELECT
DROP POLICY IF EXISTS select_consiglio_registro_soci ON public.registro_soci;
CREATE POLICY select_consiglio_registro_soci ON public.registro_soci FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            JOIN public.anagrafiche a ON a.utente_id = ie.utente_id
            WHERE ist.istruttore_id = auth.uid()
            AND a.id = registro_soci.anagrafica_id
        )
    );

-- 4. registro_tesserati SELECT
DROP POLICY IF EXISTS select_consiglio_registro_tesserati ON public.registro_tesserati;
CREATE POLICY select_consiglio_registro_tesserati ON public.registro_tesserati FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            JOIN public.anagrafiche a ON a.utente_id = ie.utente_id
            WHERE ist.istruttore_id = auth.uid()
            AND a.id = registro_tesserati.anagrafica_id
        )
    );

-- 5. certificati_medici SELECT
DROP POLICY IF EXISTS select_consiglio_certificati ON public.certificati_medici;
CREATE POLICY select_consiglio_certificati ON public.certificati_medici FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            JOIN public.anagrafiche a ON a.utente_id = ie.utente_id
            WHERE ist.istruttore_id = auth.uid()
            AND a.id = certificati_medici.anagrafica_id
        )
    );
