-- Migration: Tabella Gestione Eserciti per Epika Eventi
CREATE TABLE IF NOT EXISTS public.epika_eserciti_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.epika_eventi(id) ON DELETE CASCADE,
    nome_esercito_a TEXT DEFAULT 'ESERCITO A',
    grido_esercito_a TEXT DEFAULT '',
    nome_esercito_b TEXT DEFAULT 'ESERCITO B',
    grido_esercito_b TEXT DEFAULT '',
    coefficienti_forza JSONB DEFAULT '{"non_combattente": 0, "combattente": 1.0, "armatura_leggera": 1.2, "armatura_pesante": 1.3, "arciere_puro": 0.75, "arciere_ibrido": 1.0}'::jsonb,
    assegnazione_gruppi JSONB DEFAULT '{}'::jsonb,
    assegnazione_mercenari JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT epika_eserciti_evento_unique UNIQUE(evento_id)
);

ALTER TABLE public.epika_eserciti_eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS write_admin_epika_eserciti ON public.epika_eserciti_eventi;
CREATE POLICY write_admin_epika_eserciti ON public.epika_eserciti_eventi
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

DROP POLICY IF EXISTS select_epika_eserciti ON public.epika_eserciti_eventi;
CREATE POLICY select_epika_eserciti ON public.epika_eserciti_eventi
    FOR SELECT USING (auth.role() = 'authenticated');
