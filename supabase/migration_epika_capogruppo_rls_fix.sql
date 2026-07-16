-- ===========================================================================
-- MIGRAZIONE EPIKA: Fix Ricorsione Infinita RLS
-- ===========================================================================

-- 1. Rimuovere le policy ridondanti su epika_profili che causavano la ricorsione
-- La policy select_epika_profili ha già "auth.uid() IS NOT NULL" che garantisce la lettura a tutti gli autenticati.
DROP POLICY IF EXISTS select_capo_membri_attuali ON public.epika_profili;
DROP POLICY IF EXISTS select_capo_membri_storici ON public.epika_profili;

-- 2. Correggere all_admin_epika_gruppi_storici per usare la funzione Security Definer get_user_role()
-- Questo impedisce di triggerare le policy sulla tabella utenti (rompendo il ciclo)
DROP POLICY IF EXISTS all_admin_epika_gruppi_storici ON public.epika_gruppi_storici;
CREATE POLICY all_admin_epika_gruppi_storici ON public.epika_gruppi_storici
    FOR ALL USING (
        get_user_role(auth.uid()) && ARRAY['presidente'::ruolo_utente]
    );

-- 3. Correggere update_epika_profili per usare la funzione Security Definer get_user_role()
DROP POLICY IF EXISTS update_epika_profili ON public.epika_profili;
CREATE POLICY update_epika_profili ON public.epika_profili
    FOR UPDATE USING (
        id = auth.uid() OR get_user_role(auth.uid()) && ARRAY['presidente'::ruolo_utente]
    );
