-- ===========================================================================
-- MIGRAZIONE EPIKA: Date Evento, Dettagli Iscrizione JSONB e RLS Direttivi
-- ===========================================================================

-- 1. Modifica della tabella epika_eventi (data_inizio e data_fine)
ALTER TABLE public.epika_eventi
  ADD COLUMN IF NOT EXISTS data_inizio DATE NULL,
  ADD COLUMN IF NOT EXISTS data_fine DATE NULL;

-- Copia dei dati storici
UPDATE public.epika_eventi
SET data_inizio = data_evento,
    data_fine = data_evento
WHERE data_inizio IS NULL;

-- Rendi NOT NULL dopo il popolamento
ALTER TABLE public.epika_eventi
  ALTER COLUMN data_inizio SET NOT NULL,
  ALTER COLUMN data_fine SET NOT NULL;

-- Rimuovi la vecchia colonna data_evento se esiste
ALTER TABLE public.epika_eventi
  DROP COLUMN IF EXISTS data_evento;

-- 2. Modifica della tabella epika_iscrizioni_eventi (giorni_presenza e dettagli JSONB)
ALTER TABLE public.epika_iscrizioni_eventi
  ADD COLUMN IF NOT EXISTS giorni_presenza DATE[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dettagli JSONB DEFAULT '{}'::jsonb;

-- 3. Aggiornamento policy RLS per consentire la lettura delle iscrizioni ai direttivi
DROP POLICY IF EXISTS select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi;
CREATE POLICY select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi
    FOR SELECT USING (
        utente_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.epika_profili p
            WHERE p.id = auth.uid() 
            AND (p.is_admin_epika = TRUE OR (p.gruppo_lavoro_ids IS NOT NULL AND cardinality(p.gruppo_lavoro_ids) > 0))
        )
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 4. Aggiornamento policy RLS per consentire la lettura dei profili ai direttivi
DROP POLICY IF EXISTS select_epika_profili ON public.epika_profili;
CREATE POLICY select_epika_profili ON public.epika_profili
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 5. Aggiornamento policy RLS per consentire la lettura degli utenti ai direttivi Epika
DROP POLICY IF EXISTS select_consiglio_utenti ON public.utenti;
CREATE POLICY select_consiglio_utenti ON public.utenti FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (id = auth.uid())
        OR (
            EXISTS (
                SELECT 1 FROM public.epika_profili p
                WHERE p.id = auth.uid() 
                AND (p.is_admin_epika = TRUE OR (p.gruppo_lavoro_ids IS NOT NULL AND cardinality(p.gruppo_lavoro_ids) > 0))
            )
            AND EXISTS (
                SELECT 1 FROM public.epika_iscrizioni_eventi eie
                WHERE eie.utente_id = utenti.id
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            WHERE ist.istruttore_id = auth.uid()
            AND ie.utente_id = utenti.id
        )
    );

-- 6. Aggiornamento policy RLS per consentire la lettura delle anagrafiche ai direttivi Epika
DROP POLICY IF EXISTS select_consiglio_anagrafiche ON public.anagrafiche;
CREATE POLICY select_consiglio_anagrafiche ON public.anagrafiche FOR SELECT
    USING (
        ((public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]))
        OR (id = auth.uid())
        OR (
            EXISTS (
                SELECT 1 FROM public.epika_profili p
                WHERE p.id = auth.uid() 
                AND (p.is_admin_epika = TRUE OR (p.gruppo_lavoro_ids IS NOT NULL AND cardinality(p.gruppo_lavoro_ids) > 0))
            )
            AND EXISTS (
                SELECT 1 FROM public.epika_iscrizioni_eventi eie
                WHERE eie.utente_id = anagrafiche.id
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.iscrizioni_eventi ie
            JOIN public.istruttori_eventi ist ON ist.evento_id = ie.evento_id
            WHERE ist.istruttore_id = auth.uid()
            AND ie.utente_id = anagrafiche.id
        )
    );
