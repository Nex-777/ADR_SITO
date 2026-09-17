-- ==============================================================================
-- MIGRATION: NESTORE — Assegnazione Programmi Libreria ad Atleti
-- ==============================================================================
-- Aggiunge la chiave esterna programma_libreria_id a nestore_schede_allenamento
-- per consentire il collegamento diretto tra una scheda assegnata e un programma ufficiale
-- con timer e parametri interattivi.

ALTER TABLE public.nestore_schede_allenamento
ADD COLUMN IF NOT EXISTS programma_libreria_id UUID REFERENCES public.nestore_programmi_libreria(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nst_schede_prog_lib ON public.nestore_schede_allenamento(programma_libreria_id);

COMMENT ON COLUMN public.nestore_schede_allenamento.programma_libreria_id IS 'FK opzionale verso nestore_programmi_libreria. Se presente, abilita il timer e gli esercizi strutturati.';

-- Aggiorna policy SELECT su nestore_programmi_libreria per garantire che l'atleta
-- possa sempre leggere il programma collegato alle sue schede, anche se archiviato dal coach.
DROP POLICY IF EXISTS nst_prog_select ON public.nestore_programmi_libreria;
CREATE POLICY nst_prog_select ON public.nestore_programmi_libreria
    FOR SELECT USING (
        attivo = true
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.registro_istruttori ri
            JOIN public.anagrafiche an ON an.id = ri.anagrafica_id
            WHERE an.utente_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.istruttore_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.nestore_schede_allenamento nsa
            WHERE nsa.programma_libreria_id = nestore_programmi_libreria.id AND nsa.atleta_id = auth.uid()
        )
    );
