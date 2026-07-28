-- Backfill per popolare allenatore_id in epika_storico_organico (2026) per i record pregressi
UPDATE public.epika_storico_organico s
SET allenatore_id = p.allenatore_id
FROM public.epika_profili p
WHERE s.profilo_id = p.id
  AND s.allenatore_id IS NULL
  AND s.anno_sociale = 2026
  AND (s.ruolo_combattimento = 'combattente' OR (s.ruolo_combattimento IS NULL AND p.ruolo_combattimento = 'combattente'))
  AND p.allenatore_id IS NOT NULL;
