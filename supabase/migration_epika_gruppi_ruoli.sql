-- ===========================================================================
-- MIGRAZIONE EPIKA: Gestione Gruppi Storici, Ruoli e Storicizzazione
-- ===========================================================================

-- 1. Aggiunta Colonne a epika_gruppi_storici
ALTER TABLE public.epika_gruppi_storici
  ADD COLUMN IF NOT EXISTS capogruppo_id UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vice_capogruppo_id UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsabile_iscrizioni_id UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_inizio_formazione DATE,
  ADD COLUMN IF NOT EXISTS data_fine_formazione DATE,
  ADD COLUMN IF NOT EXISTS data_inizio_ufficiale DATE,
  ADD COLUMN IF NOT EXISTS data_fine_ufficiale DATE;

-- 2. Creazione Tabella di Storicizzazione
CREATE TABLE IF NOT EXISTS public.epika_storico_ruoli_gruppi (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gruppo_storico_id BIGINT NOT NULL REFERENCES public.epika_gruppi_storici(id) ON DELETE CASCADE,
    profilo_id UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
    ruolo TEXT NOT NULL CHECK (ruolo IN ('capogruppo', 'vice_capogruppo', 'responsabile_iscrizioni')),
    data_inizio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_fine TIMESTAMPTZ NULL,   -- NULL = mandato attivo
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.epika_storico_ruoli_gruppi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_storico_ruoli ON public.epika_storico_ruoli_gruppi;
CREATE POLICY select_epika_storico_ruoli ON public.epika_storico_ruoli_gruppi
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS all_admin_epika_storico_ruoli ON public.epika_storico_ruoli_gruppi;
CREATE POLICY all_admin_epika_storico_ruoli ON public.epika_storico_ruoli_gruppi
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 3. Aggiunta "Gruppo Vice Capi Gruppo" in epika_gruppi_lavoro
-- Cerchiamo di posizionarlo dopo "Gruppo Capi Gruppo" (ordine 5) aggiornando gli ordini degli altri
UPDATE public.epika_gruppi_lavoro
SET ordine = ordine + 1
WHERE ordine >= 5;

INSERT INTO public.epika_gruppi_lavoro (nome, ordine)
VALUES ('Gruppo Vice Capi Gruppo', 5)
ON CONFLICT (nome) DO NOTHING;
