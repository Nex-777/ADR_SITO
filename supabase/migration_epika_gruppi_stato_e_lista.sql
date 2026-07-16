-- 1. Aggiunta campi stato e data_stato a epika_gruppi_storici
ALTER TABLE public.epika_gruppi_storici
  ADD COLUMN IF NOT EXISTS stato TEXT CHECK (stato IN ('in_formazione', 'ufficiale', 'sospeso')) DEFAULT 'ufficiale',
  ADD COLUMN IF NOT EXISTS data_stato DATE DEFAULT NULL;

-- Imposta stato 'in_formazione' per 'Villhest Folk' e 'ufficiale' per gli altri
UPDATE public.epika_gruppi_storici
SET stato = 'in_formazione'
WHERE nome = 'Villhest Folk';

-- 2. Creazione della tabella epika_storico_organico (Lista Generale 2026-2028)
CREATE TABLE IF NOT EXISTS public.epika_storico_organico (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profilo_id UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
    anno_sociale INT NOT NULL CHECK (anno_sociale >= 2026 AND anno_sociale <= 2028),
    ruolo_combattimento TEXT CHECK (ruolo_combattimento IN ('combattente', 'non_combattente')),
    gruppo_storico_id BIGINT REFERENCES public.epika_gruppi_storici(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_profilo_anno UNIQUE (profilo_id, anno_sociale)
);

-- RLS per epika_storico_organico
ALTER TABLE public.epika_storico_organico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_storico_organico ON public.epika_storico_organico;
CREATE POLICY select_epika_storico_organico ON public.epika_storico_organico
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS all_admin_epika_storico_organico ON public.epika_storico_organico;
CREATE POLICY all_admin_epika_storico_organico ON public.epika_storico_organico
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );
