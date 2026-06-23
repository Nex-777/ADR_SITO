-- Policy for ricevute_pagamenti
CREATE POLICY user_read_ricevute ON public.ricevute_pagamenti FOR SELECT USING (
  auth.uid() = utente_id OR
  'presidente' = ANY(public.get_user_role(auth.uid())) OR
  'tesoriere' = ANY(public.get_user_role(auth.uid()))
);

-- Policies for registro_spese
CREATE POLICY read_registro_spese ON public.registro_spese
  FOR SELECT USING (
    'presidente' = ANY(public.get_user_role(auth.uid())) OR
    'tesoriere' = ANY(public.get_user_role(auth.uid()))
  );
  
CREATE POLICY write_registro_spese ON public.registro_spese
  FOR ALL USING (
    'presidente' = ANY(public.get_user_role(auth.uid())) OR
    'tesoriere' = ANY(public.get_user_role(auth.uid()))
  );
