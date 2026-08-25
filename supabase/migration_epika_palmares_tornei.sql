-- ===========================================================================
-- MIGRAZIONE EPIKA: Palmarès Storico Atleti & Tornei Passati
-- Regole di sicurezza SECURITY.md & Storicizzazione EPIKA
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.epika_palmares_atleti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
    anno INT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'torneo' CHECK (tipo IN ('torneo', 'titolo', 'onorificenza', 'speciale')),
    titolo_evento TEXT NOT NULL,
    posizione INT DEFAULT NULL,
    dettagli TEXT DEFAULT '',
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query e performance
CREATE INDEX IF NOT EXISTS idx_epika_palmares_atleta ON public.epika_palmares_atleti(atleta_id, anno);
CREATE INDEX IF NOT EXISTS idx_epika_palmares_attivo ON public.epika_palmares_atleti(attivo);

-- Abilitazione Row Level Security (RLS)
ALTER TABLE public.epika_palmares_atleti ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy (Accessibile a tutti gli utenti autenticati)
DROP POLICY IF EXISTS select_epika_palmares_atleti ON public.epika_palmares_atleti;
CREATE POLICY select_epika_palmares_atleti ON public.epika_palmares_atleti
    FOR SELECT USING (auth.role() = 'authenticated');

-- 2. INSERT Policy (Solo Admin Epika o Presidente)
DROP POLICY IF EXISTS insert_admin_epika_palmares_atleti ON public.epika_palmares_atleti;
CREATE POLICY insert_admin_epika_palmares_atleti ON public.epika_palmares_atleti
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 3. UPDATE Policy (Solo Admin Epika o Presidente)
DROP POLICY IF EXISTS update_admin_epika_palmares_atleti ON public.epika_palmares_atleti;
CREATE POLICY update_admin_epika_palmares_atleti ON public.epika_palmares_atleti
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 4. DELETE Policy (Solo Admin Epika o Presidente)
DROP POLICY IF EXISTS delete_admin_epika_palmares_atleti ON public.epika_palmares_atleti;
CREATE POLICY delete_admin_epika_palmares_atleti ON public.epika_palmares_atleti
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- Trigger per updated_at
DROP TRIGGER IF EXISTS trg_epika_palmares_atleti_updated_at ON public.epika_palmares_atleti;
CREATE TRIGGER trg_epika_palmares_atleti_updated_at
BEFORE UPDATE ON public.epika_palmares_atleti
FOR EACH ROW EXECUTE FUNCTION public.epika_set_updated_at();

-- Seed iniziale per Valerio Mannocchi (MINOR):
-- 2025 TORNEO SCAB MODENA TAPPA 1 ( POS 3 )
-- 2026 TORNEO SCAB ASCOLI TAPPA 2 ( POS 1 )
DO $$
DECLARE
    v_atleta_id UUID;
BEGIN
    SELECT id INTO v_atleta_id FROM public.epika_profili WHERE nome_di_battaglia ILIKE 'MINOR' LIMIT 1;
    IF v_atleta_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.epika_palmares_atleti WHERE atleta_id = v_atleta_id AND anno = 2025 AND titolo_evento ILIKE '%MODENA%') THEN
            INSERT INTO public.epika_palmares_atleti (atleta_id, anno, tipo, titolo_evento, posizione, dettagli, attivo)
            VALUES (v_atleta_id, 2025, 'torneo', 'TORNEO SCAB MODENA', 3, 'TAPPA 1', true);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.epika_palmares_atleti WHERE atleta_id = v_atleta_id AND anno = 2026 AND titolo_evento ILIKE '%ASCOLI%') THEN
            INSERT INTO public.epika_palmares_atleti (atleta_id, anno, tipo, titolo_evento, posizione, dettagli, attivo)
            VALUES (v_atleta_id, 2026, 'torneo', 'TORNEO SCAB ASCOLI', 1, 'TAPPA 2', true);
        END IF;
    END IF;
END $$;
