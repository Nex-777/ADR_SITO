-- 1. Aggiunta colonna allenatore_id a epika_storico_organico
ALTER TABLE public.epika_storico_organico 
  ADD COLUMN IF NOT EXISTS allenatore_id BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL;

-- 2. Vincolo di integrità: se non_combattente, allenatore_id deve essere NULL
ALTER TABLE public.epika_storico_organico
  DROP CONSTRAINT IF EXISTS check_storico_allenatore_ruolo;

ALTER TABLE public.epika_storico_organico
  ADD CONSTRAINT check_storico_allenatore_ruolo 
  CHECK (
      (ruolo_combattimento = 'non_combattente' AND allenatore_id IS NULL) OR 
      (ruolo_combattimento = 'combattente') OR
      (ruolo_combattimento IS NULL)
  );
