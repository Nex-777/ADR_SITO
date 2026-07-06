-- Patch RLS for public.atti_adesione to allow board/council members to view all files
DROP POLICY IF EXISTS "Consiglio può visualizzare tutti gli atti" ON public.atti_adesione;

CREATE POLICY "Consiglio può visualizzare tutti gli atti" ON public.atti_adesione
    FOR SELECT TO authenticated
    USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.public.ruolo_utente, 'consigliere'::public.ruolo_utente])
    );
