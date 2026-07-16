-- ===========================================================================
-- MIGRAZIONE EPIKA: Vista Capogruppo - RLS Policies
-- ===========================================================================

-- 1. Consentire al Capogruppo/Vice Capogruppo di leggere i profili dei membri attuali
CREATE POLICY select_capo_membri_attuali ON public.epika_profili
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.epika_gruppi_storici g
            WHERE g.id = public.epika_profili.gruppo_storico_id
              AND (g.capogruppo_id = auth.uid() OR g.vice_capogruppo_id = auth.uid())
        )
    );

-- 2. Consentire al Capogruppo/Vice Capogruppo di leggere i profili dei membri storici (per la cronologia mandati)
CREATE POLICY select_capo_membri_storici ON public.epika_profili
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.epika_storico_ruoli_gruppi srg
            JOIN public.epika_gruppi_storici eg ON eg.id = srg.gruppo_storico_id
            WHERE srg.profilo_id = epika_profili.id
              AND (eg.capogruppo_id = auth.uid() OR eg.vice_capogruppo_id = auth.uid())
        )
    );

-- 3. Consentire al Capogruppo/Vice Capogruppo di leggere l'anagrafica utente dei membri (attuali e storici)
CREATE POLICY select_capo_utenti ON public.utenti
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.epika_profili ep
            JOIN public.epika_gruppi_storici eg ON eg.id = ep.gruppo_storico_id
            WHERE ep.id = utenti.id
              AND (eg.capogruppo_id = auth.uid() OR eg.vice_capogruppo_id = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.epika_storico_ruoli_gruppi srg
            JOIN public.epika_gruppi_storici eg ON eg.id = srg.gruppo_storico_id
            WHERE srg.profilo_id = utenti.id
              AND (eg.capogruppo_id = auth.uid() OR eg.vice_capogruppo_id = auth.uid())
        )
    );
