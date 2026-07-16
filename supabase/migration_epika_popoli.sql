-- ===========================================================================
-- MIGRAZIONE EPIKA: Creazione Tabella Popoli
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.epika_popoli (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed iniziale dei popoli
INSERT INTO public.epika_popoli (nome) VALUES
('Romani'),
('Greci'),
('Celti'),
('Liguri'),
('Sanniti'),
('Germani')
ON CONFLICT (nome) DO NOTHING;

-- RLS
ALTER TABLE public.epika_popoli ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_popoli ON public.epika_popoli;
CREATE POLICY select_epika_popoli ON public.epika_popoli
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS all_admin_epika_popoli ON public.epika_popoli;
CREATE POLICY all_admin_epika_popoli ON public.epika_popoli
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );
