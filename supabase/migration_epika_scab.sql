-- ===========================================================================
-- MIGRAZIONE EPIKA: SCAB - Strutture, Ruoli e Abbinamenti
-- ===========================================================================

-- 1. Tabella delle Strutture SCAB (Palestre e Centri Pratica)
CREATE TABLE IF NOT EXISTS public.epika_scab_strutture (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('palestra', 'centro_pratica')),
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabella degli Abbinamenti SCAB con Campi Array
CREATE TABLE IF NOT EXISTS public.epika_scab_abbinamenti (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    struttura_id BIGINT NOT NULL UNIQUE REFERENCES public.epika_scab_strutture(id) ON DELETE CASCADE,
    allenatore_ref_id BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL,
    validatore_id BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL,
    allenatori_co_ids BIGINT[] DEFAULT '{}', -- Allenatore 2nda, 3za ecc. in formato Array
    allievo_ref_id BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL, -- Allievo ALL di riferimento per i Centri Pratica
    allievi_ids BIGINT[] DEFAULT '{}', -- Allievi ALL associati in formato Array
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Abilitazione Row Level Security (RLS)
ALTER TABLE public.epika_scab_strutture ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_scab_abbinamenti ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies per epika_scab_strutture
DROP POLICY IF EXISTS select_epika_scab_strutture ON public.epika_scab_strutture;
CREATE POLICY select_epika_scab_strutture ON public.epika_scab_strutture
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS all_admin_epika_scab_strutture ON public.epika_scab_strutture;
CREATE POLICY all_admin_epika_scab_strutture ON public.epika_scab_strutture
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 5. RLS Policies per epika_scab_abbinamenti
DROP POLICY IF EXISTS select_epika_scab_abbinamenti ON public.epika_scab_abbinamenti;
CREATE POLICY select_epika_scab_abbinamenti ON public.epika_scab_abbinamenti
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS all_admin_epika_scab_abbinamenti ON public.epika_scab_abbinamenti;
CREATE POLICY all_admin_epika_scab_abbinamenti ON public.epika_scab_abbinamenti
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 6. Trigger per updated_at su epika_scab_abbinamenti
DROP TRIGGER IF EXISTS trg_epika_scab_abbinamenti_updated_at ON public.epika_scab_abbinamenti;
CREATE TRIGGER trg_epika_scab_abbinamenti_updated_at
BEFORE UPDATE ON public.epika_scab_abbinamenti
FOR EACH ROW EXECUTE FUNCTION public.epika_set_updated_at();

-- ===========================================================================
-- SEED DATI INIZIALI
-- ===========================================================================

-- 7. Inserimento Soggetti SCAB (Senza Duplicazioni) in epika_opzioni
-- Usiamo 'soggetto_scab' come tipo unificato per evitare duplicati fisici.
-- Eseguiamo l'operazione solo se non esistono già per evitare duplicati in inserimento.
INSERT INTO public.epika_opzioni (tipo, valore)
SELECT 'soggetto_scab', val
FROM (
    VALUES 
    ('Beleno'), ('Cunagato'), ('Kratos'), ('Tito'), -- Validatori / Allenatori
    ('Canturios'), ('Garid'), ('Lisando'), ('Minor'), ('Nevio'), ('Mirco'), -- Allenatori
    ('Alcor'), ('Aspies'), ('Bledinus'), ('Bran'), ('Cadmo'), ('Eutidemo'), 
    ('Ferret'), ('Lykos'), ('Maponos'), ('Vinnoviro'), ('Virosagos'), ('Zobo') -- Allievi Allenatori
) AS temp(val)
WHERE NOT EXISTS (
    SELECT 1 FROM public.epika_opzioni 
    WHERE tipo = 'soggetto_scab' AND valore = temp.val
);

-- 8. Seeding delle Strutture SCAB
INSERT INTO public.epika_scab_strutture (nome, tipo)
VALUES
-- Palestre
('Itinerante', 'palestra'),
('Ancona', 'palestra'),
('Ascoli ADR', 'palestra'),
('Fano', 'palestra'),
('Itinere', 'palestra'),
('Milano', 'palestra'),
('Modena', 'palestra'),
('Pescara ADR', 'palestra'),
('SML', 'palestra'),
('Mediolacense', 'palestra'),
-- Centri Pratica
('Imperia', 'centro_pratica'),
('Pescara', 'centro_pratica'),
('Roma ADR', 'centro_pratica'),
('Torino', 'centro_pratica')
ON CONFLICT (nome) DO UPDATE SET tipo = EXCLUDED.tipo;
