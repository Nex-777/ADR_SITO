-- ===========================================================================
-- MIGRAZIONE: Risoluzione Ricorsione RLS su Utenti e Tabelle correlate
-- ===========================================================================

-- 1. Funzioni helper SECURITY DEFINER per bypassare RLS e rompere la catena di ricorsione
CREATE OR REPLACE FUNCTION public.has_epika_event_registration(p_utente_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.epika_iscrizioni_eventi
        WHERE utente_id = p_utente_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_epika_staff(p_uid uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.epika_profili
        WHERE id = p_uid AND (is_admin_epika = true OR (gruppo_lavoro_ids IS NOT NULL AND cardinality(gruppo_lavoro_ids) > 0))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aggiornamento policy select_consiglio_utenti sulla tabella utenti
DROP POLICY IF EXISTS select_consiglio_utenti ON public.utenti;
CREATE POLICY select_consiglio_utenti ON public.utenti
  FOR SELECT USING (
    (get_user_role(auth.uid()) && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente]) 
    OR (id = auth.uid()) 
    OR (public.is_epika_staff(auth.uid()) AND public.has_epika_event_registration(id))
    OR (EXISTS ( 
      SELECT 1 FROM (public.iscrizioni_eventi ie JOIN public.istruttori_eventi ist ON ((ist.evento_id = ie.evento_id))) 
      WHERE ((ist.istruttore_id = auth.uid()) AND (ie.utente_id = utenti.id))
    ))
  );
