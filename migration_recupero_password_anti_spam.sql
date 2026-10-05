-- Anti-spam recupero password: l'INSERT anonimo diretto è sostituito da una RPC
-- che traccia solo email di utenti censiti (nessun duplicato in attesa).
CREATE OR REPLACE FUNCTION public.richiedi_recupero_password(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' OR length(v_email) > 254 THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.utenti WHERE lower(email) = v_email)
     AND NOT EXISTS (SELECT 1 FROM public.richieste_recupero_password WHERE lower(email) = v_email AND stato = 'in_attesa') THEN
    INSERT INTO public.richieste_recupero_password (email, stato) VALUES (v_email, 'in_attesa');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.richiedi_recupero_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.richiedi_recupero_password(text) TO anon, authenticated;
DROP POLICY IF EXISTS "Allow public insert on richieste_recupero_password" ON public.richieste_recupero_password;
-- Storicizzazione dello spam pregresso (soft delete, non DELETE fisico)
UPDATE public.richieste_recupero_password SET stato='archiviato', risolto_il=now()
WHERE stato='in_attesa' AND lower(email) NOT IN (SELECT lower(email) FROM public.utenti WHERE email IS NOT NULL);
