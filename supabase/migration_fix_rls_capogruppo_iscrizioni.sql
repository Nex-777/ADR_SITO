-- ===========================================================================
-- MIGRAZIONE: Fix RLS — Visibilità iscrizioni eventi per Capogruppo / Vice Capogruppo
-- Problema: La policy select_epika_iscrizioni_eventi (v3) non include
--           Capogruppo e Vice Capogruppo, che vedono solo la propria iscrizione.
-- Soluzione: Aggiungere una clausola OR EXISTS che autorizza esplicitamente
--            capogruppo_id e vice_capogruppo_id a leggere le righe
--            dei membri del proprio gruppo storico.
-- ===========================================================================

DROP POLICY IF EXISTS select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi;

CREATE POLICY select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi
  FOR SELECT USING (
    -- 1. L'atleta può sempre vedere la propria iscrizione
    utente_id = auth.uid()

    -- 2. Admin Epika e membri del direttivo (gruppo_lavoro_ids popolato)
    OR EXISTS (
      SELECT 1 FROM public.epika_profili p
      WHERE p.id = auth.uid()
        AND (
          p.is_admin_epika = TRUE
          OR (p.gruppo_lavoro_ids IS NOT NULL AND cardinality(p.gruppo_lavoro_ids) > 0)
        )
    )

    -- 3. Ruolo istituzionale Presidente
    OR 'presidente' = ANY(public.get_user_role(auth.uid()))

    -- 4. Ruoli SCAB (allenatore, validatore, allievo allenatore)
    OR EXISTS (
      SELECT 1 FROM public.epika_opzioni o
      WHERE o.utente_id = auth.uid()
        AND o.tipo IN ('allenatore', 'scab_validatore', 'scab_allievo_allenatore')
    )

    -- 5. Capogruppo o Vice Capogruppo del gruppo dell'atleta iscritto
    --    Doppio percorso: prima via gruppo_storico_id sull'iscrizione (caso normale),
    --    poi via join su epika_profili (fallback per iscrizioni con gruppo_storico_id NULL)
    OR EXISTS (
      SELECT 1
      FROM public.epika_gruppi_storici g
      WHERE
        (g.capogruppo_id = auth.uid() OR g.vice_capogruppo_id = auth.uid())
        AND (
          -- Percorso 1: la colonna gruppo_storico_id sull'iscrizione punta al gruppo
          g.id = public.epika_iscrizioni_eventi.gruppo_storico_id
          OR
          -- Percorso 2: fallback tramite profilo dell'atleta iscritto
          EXISTS (
            SELECT 1
            FROM public.epika_profili p2
            WHERE p2.id = public.epika_iscrizioni_eventi.utente_id
              AND p2.gruppo_storico_id = g.id
          )
        )
    )
  );
