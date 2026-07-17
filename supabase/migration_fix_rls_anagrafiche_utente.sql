-- Migration: Fix select_consiglio_anagrafiche RLS Policy
-- Sostituisce l'uso errato di anagrafiche.id con anagrafiche.utente_id per consentire la corretta associazione con auth.uid()

DROP POLICY IF EXISTS select_consiglio_anagrafiche ON public.anagrafiche;

CREATE POLICY select_consiglio_anagrafiche ON public.anagrafiche FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (utente_id = auth.uid())
        OR (
            EXISTS (
                SELECT 1 FROM public.epika_profili p
                WHERE p.id = auth.uid() 
                AND (p.is_admin_epika = TRUE OR (p.gruppo_lavoro_ids IS NOT NULL AND cardinality(p.gruppo_lavoro_ids) > 0))
            )
            AND EXISTS (
                SELECT 1 FROM public.epika_iscrizioni_eventi eie
                WHERE eie.utente_id = anagrafiche.utente_id
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            WHERE ist.istruttore_id = auth.uid()
            AND ie.utente_id = anagrafiche.utente_id
        )
    );
