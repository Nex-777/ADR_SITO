-- Aggiunta della policy RLS per permettere a un utente di leggere il proprio record istruttore
CREATE POLICY select_own_registro_istruttori ON public.registro_istruttori
    FOR SELECT
    USING (
        anagrafica_id IN (
            SELECT a.id FROM public.anagrafiche a WHERE a.utente_id = auth.uid()
        )
    );
