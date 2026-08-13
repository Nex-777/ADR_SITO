-- Migration: POTENZA Gruppi, Scheda Battaglie & Campioni SCAB

-- 1. Aggiungi colonna esercito_vincente a epika_eserciti_eventi
ALTER TABLE public.epika_eserciti_eventi
ADD COLUMN IF NOT EXISTS esercito_vincente TEXT DEFAULT NULL
    CONSTRAINT epika_eserciti_vincente_check CHECK (esercito_vincente IN ('A', 'B', 'PAREGGIO'));

-- 2. Nuova tabella epika_battaglie_eventi
CREATE TABLE IF NOT EXISTS public.epika_battaglie_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.epika_eventi(id) ON DELETE CASCADE,
    numero_battaglia INT NOT NULL,
    vincitore TEXT NOT NULL CONSTRAINT epika_battaglia_vincitore_check CHECK (vincitore IN ('A', 'B', 'PAREGGIO')),
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT epika_battaglie_unique UNIQUE(evento_id, numero_battaglia)
);

ALTER TABLE public.epika_battaglie_eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_battaglie ON public.epika_battaglie_eventi;
CREATE POLICY select_epika_battaglie ON public.epika_battaglie_eventi
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS write_admin_epika_battaglie ON public.epika_battaglie_eventi;
CREATE POLICY write_admin_epika_battaglie ON public.epika_battaglie_eventi
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 3. Nuova tabella epika_campioni_scab
CREATE TABLE IF NOT EXISTS public.epika_campioni_scab (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    anno INT NOT NULL UNIQUE,
    profilo_id UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL,
    nome_campione TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.epika_campioni_scab ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_campioni_scab ON public.epika_campioni_scab;
CREATE POLICY select_epika_campioni_scab ON public.epika_campioni_scab
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS write_admin_epika_campioni_scab ON public.epika_campioni_scab;
CREATE POLICY write_admin_epika_campioni_scab ON public.epika_campioni_scab
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 4. Nuova tabella epika_cm_gruppi_vincenti (Storico Vittorie)
CREATE TABLE IF NOT EXISTS public.epika_cm_gruppi_vincenti (
    anno INT NOT NULL,
    nome_gruppo TEXT NOT NULL,
    PRIMARY KEY (anno, nome_gruppo)
);

ALTER TABLE public.epika_cm_gruppi_vincenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_cm_gruppi_vincenti ON public.epika_cm_gruppi_vincenti;
CREATE POLICY select_epika_cm_gruppi_vincenti ON public.epika_cm_gruppi_vincenti
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS write_admin_epika_cm_gruppi_vincenti ON public.epika_cm_gruppi_vincenti;
CREATE POLICY write_admin_epika_cm_gruppi_vincenti ON public.epika_cm_gruppi_vincenti
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 5. Seed dati Campioni SCAB (Allegato 3)
INSERT INTO public.epika_campioni_scab (anno, nome_campione) VALUES
    (2024, 'MORS'),
    (2025, 'ARGOS'),
    (2026, 'MINOR')
ON CONFLICT (anno) DO UPDATE SET nome_campione = EXCLUDED.nome_campione;

-- 6. Seed dati storico vittorie gruppi (Allegato 2)
INSERT INTO public.epika_cm_gruppi_vincenti (anno, nome_gruppo) VALUES
    -- 2023: Gruppi nell'esercito vincente (+1 pt Gloria nel 2026)
    (2023, 'Aes Cranna'),
    (2023, 'Lega Panellenica'),
    (2023, 'Legio Malasorte'),
    (2023, 'Torc Na Moire'),
    -- 2024: Gruppi nell'esercito vincente (+2 pt Gloria nel 2026)
    (2024, 'Aes Cranna'),
    (2024, 'Kaitorikes'),
    (2024, 'Legio Malasorte'),
    (2024, 'Torc Na Moire'),
    -- 2025: Gruppi nell'esercito vincente (+3 pt Gloria nel 2026)
    (2025, 'Baren Clan'),
    (2025, 'Drukos Liguri'),
    (2025, 'Lega Panellenica'),
    (2025, 'Torc Na Moire')
ON CONFLICT (anno, nome_gruppo) DO NOTHING;
