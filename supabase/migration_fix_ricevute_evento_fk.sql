-- Migrazione: Fix vincolo FK su ricevute_pagamenti.evento_id
-- Data: 2026-09-11 (v1.05.11)

ALTER TABLE public.ricevute_pagamenti
  DROP CONSTRAINT IF EXISTS "ricevute_pagamenti_evento_id_fkey";

CREATE OR REPLACE FUNCTION public.validate_ricevuta_evento_id()
RETURNS TRIGGER AS 
BEGIN
  IF NEW.evento_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.eventi WHERE id = NEW.evento_id)
   AND NOT EXISTS (SELECT 1 FROM public.epika_eventi WHERE id = NEW.evento_id)
    THEN
      RAISE EXCEPTION 'evento_id % non trovato né in public.eventi né in public.epika_eventi', NEW.evento_id;
    END IF;
  END IF;
  RETURN NEW;
END;
 LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_ricevuta_evento_id ON public.ricevute_pagamenti;
CREATE TRIGGER trg_validate_ricevuta_evento_id
  BEFORE INSERT OR UPDATE OF evento_id ON public.ricevute_pagamenti
  FOR EACH ROW EXECUTE FUNCTION public.validate_ricevuta_evento_id();
