-- Drop old policies
DROP POLICY IF EXISTS select_consiglio_anagrafiche ON public.anagrafiche;
DROP POLICY IF EXISTS select_consiglio_indirizzi ON public.indirizzi_residenza;
DROP POLICY IF EXISTS select_consiglio_contatti ON public.contatti;
DROP POLICY IF EXISTS select_consiglio_registro_soci ON public.registro_soci;
DROP POLICY IF EXISTS select_consiglio_registro_tesserati ON public.registro_tesserati;
DROP POLICY IF EXISTS select_consiglio_certificati ON public.certificati_medici;
DROP POLICY IF EXISTS select_consiglio_verbali ON public.verbali_consiglio;

DROP POLICY IF EXISTS all_admin_anagrafiche ON public.anagrafiche;
DROP POLICY IF EXISTS all_admin_indirizzi ON public.indirizzi_residenza;
DROP POLICY IF EXISTS all_admin_contatti ON public.contatti;
DROP POLICY IF EXISTS all_admin_registro_soci ON public.registro_soci;
DROP POLICY IF EXISTS all_admin_registro_tesserati ON public.registro_tesserati;
DROP POLICY IF EXISTS all_admin_certificati ON public.certificati_medici;
DROP POLICY IF EXISTS all_admin_verbali ON public.verbali_consiglio;

DROP POLICY IF EXISTS segretario_manage_anagrafiche ON public.anagrafiche;
DROP POLICY IF EXISTS segretario_update_anagrafiche ON public.anagrafiche;
DROP POLICY IF EXISTS segretario_manage_indirizzi ON public.indirizzi_residenza;
DROP POLICY IF EXISTS segretario_update_indirizzi ON public.indirizzi_residenza;
DROP POLICY IF EXISTS segretario_manage_contatti ON public.contatti;
DROP POLICY IF EXISTS segretario_update_contatti ON public.contatti;
DROP POLICY IF EXISTS segretario_manage_verbali ON public.verbali_consiglio;
DROP POLICY IF EXISTS segretario_update_verbali ON public.verbali_consiglio;

DROP POLICY IF EXISTS tesoriere_update_soci ON public.registro_soci;
DROP POLICY IF EXISTS tesoriere_update_tesserati ON public.registro_tesserati;

-- Recreate with array overlap (&&) and ANY() operators
CREATE POLICY select_consiglio_anagrafiche ON public.anagrafiche FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[] OR utente_id = auth.uid());

CREATE POLICY select_consiglio_indirizzi ON public.indirizzi_residenza FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[] OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_contatti ON public.contatti FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[] OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_registro_soci ON public.registro_soci FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[] OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_registro_tesserati ON public.registro_tesserati FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[] OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_certificati ON public.certificati_medici FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[] OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_verbali ON public.verbali_consiglio FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]);

CREATE POLICY all_admin_anagrafiche ON public.anagrafiche FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY all_admin_indirizzi ON public.indirizzi_residenza FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY all_admin_contatti ON public.contatti FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY all_admin_registro_soci ON public.registro_soci FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY all_admin_registro_tesserati ON public.registro_tesserati FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY all_admin_certificati ON public.certificati_medici FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY all_admin_verbali ON public.verbali_consiglio FOR ALL
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY segretario_manage_anagrafiche ON public.anagrafiche FOR INSERT WITH CHECK ('segretario' = ANY(public.get_user_role(auth.uid())));
CREATE POLICY segretario_update_anagrafiche ON public.anagrafiche FOR UPDATE USING ('segretario' = ANY(public.get_user_role(auth.uid())));

CREATE POLICY segretario_manage_indirizzi ON public.indirizzi_residenza FOR INSERT WITH CHECK ('segretario' = ANY(public.get_user_role(auth.uid())));
CREATE POLICY segretario_update_indirizzi ON public.indirizzi_residenza FOR UPDATE USING ('segretario' = ANY(public.get_user_role(auth.uid())));

CREATE POLICY segretario_manage_contatti ON public.contatti FOR INSERT WITH CHECK ('segretario' = ANY(public.get_user_role(auth.uid())));
CREATE POLICY segretario_update_contatti ON public.contatti FOR UPDATE USING ('segretario' = ANY(public.get_user_role(auth.uid())));

CREATE POLICY segretario_manage_verbali ON public.verbali_consiglio FOR INSERT WITH CHECK ('segretario' = ANY(public.get_user_role(auth.uid())));
CREATE POLICY segretario_update_verbali ON public.verbali_consiglio FOR UPDATE USING ('segretario' = ANY(public.get_user_role(auth.uid())));

CREATE POLICY tesoriere_update_soci ON public.registro_soci FOR UPDATE USING ('tesoriere' = ANY(public.get_user_role(auth.uid())));
CREATE POLICY tesoriere_update_tesserati ON public.registro_tesserati FOR UPDATE USING ('tesoriere' = ANY(public.get_user_role(auth.uid())));
