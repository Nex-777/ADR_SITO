-- Migration: Trigger per sincronizzare automaticamente auth.users e public.utenti
-- Previene la creazione di utenti orfani in auth.users se il client si interrompe post-signUp.

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.utenti (id, email, ruolo)
  VALUES (NEW.id, NEW.email, ARRAY['tesserato_esterno'::ruolo_utente])
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger su auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
