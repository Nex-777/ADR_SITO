-- ===========================================================================
-- MIGRAZIONE EPIKA: Fase 1 - Creazione Struttura e Isolamento Dati
-- ===========================================================================

-- 1.1 Tabella Gruppi Storici (lookup con seed)
CREATE TABLE IF NOT EXISTS public.epika_gruppi_storici (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    popolo TEXT, -- Romani, Greci, Celti, Liguri, Sanniti, Germani, o NULL per Mercenari
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.2 Tabella Gruppi di Lavoro (lookup gerarchico)
CREATE TABLE IF NOT EXISTS public.epika_gruppi_lavoro (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    ordine INT DEFAULT 0,
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.3 Tabella Opzioni (allenatori)
CREATE TABLE IF NOT EXISTS public.epika_opzioni (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo TEXT NOT NULL DEFAULT 'allenatore',
    valore TEXT NOT NULL,
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.4 Tabella Profilo Storico Tesserati (FK a utenti)
CREATE TABLE IF NOT EXISTS public.epika_profili (
    id UUID PRIMARY KEY REFERENCES public.utenti(id) ON DELETE CASCADE,
    nome_di_battaglia TEXT,
    ruolo_combattimento TEXT CHECK (ruolo_combattimento IN ('combattente', 'non_combattente')),
    popolo TEXT,
    gruppo_storico_id BIGINT REFERENCES public.epika_gruppi_storici(id),
    allenatore_id BIGINT REFERENCES public.epika_opzioni(id),
    gruppo_lavoro_id BIGINT REFERENCES public.epika_gruppi_lavoro(id), -- NULL = nessun incarico
    is_admin_epika BOOLEAN DEFAULT FALSE,
    primo_anno_partecipazione INT DEFAULT EXTRACT(YEAR FROM NOW()),
    profilo_completato BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.5 Tabella Eventi Rievocativi (completamente separati)
CREATE TABLE IF NOT EXISTS public.epika_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo TEXT NOT NULL,
    descrizione TEXT,
    data_evento DATE NOT NULL,
    luogo TEXT,
    tipo_evento TEXT CHECK (tipo_evento IN ('campo_marzio', 'torneo', 'altro')),
    max_partecipanti INT,
    attivo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.6 Tabella Iscrizioni Eventi
CREATE TABLE IF NOT EXISTS public.epika_iscrizioni_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.epika_eventi(id) ON DELETE CASCADE,
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_iscrizione TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(evento_id, utente_id)
);

-- 1.7 Tabella Presenze Eventi
CREATE TABLE IF NOT EXISTS public.epika_presenze_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.epika_eventi(id) ON DELETE CASCADE,
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    presente BOOLEAN DEFAULT FALSE,
    confermato_da UUID REFERENCES public.utenti(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(evento_id, utente_id)
);

-- ===========================================================================
-- TRIGGER: updated_at su epika_profili
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.epika_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_epika_profili_updated_at ON public.epika_profili;
CREATE TRIGGER trg_epika_profili_updated_at
BEFORE UPDATE ON public.epika_profili
FOR EACH ROW EXECUTE FUNCTION public.epika_set_updated_at();

-- ===========================================================================
-- SEED DATI INIZIALI
-- ===========================================================================

-- Seed Gruppi Storici
INSERT INTO public.epika_gruppi_storici (nome, popolo) VALUES
('Kaitorikes', 'Celti'),
('Lega Panellenica', 'Greci'),
('Legio Malasorte', 'Romani'),
('Torc Na Moire', 'Celti'),
('Drukos Liguri', 'Liguri'),
('Lega Italica', 'Sanniti'),
('Aes Cranna', 'Celti'),
('Villhest Folk', 'Germani'),
('Mercenari', NULL)
ON CONFLICT (nome) DO UPDATE SET popolo = EXCLUDED.popolo;

-- Seed Gruppi di Lavoro
INSERT INTO public.epika_gruppi_lavoro (nome, ordine) VALUES
('Direttivo EPIKA', 1),
('Direttivo SCAB', 2),
('Direttivo Logistica', 3),
('Direttivo Marketing', 4),
('Gruppo Capi Gruppo', 5),
('Gruppo Responsabili Iscrizioni', 6),
('Gruppo Validatori', 7),
('Coordinamento Allenatori Validatori', 8)
ON CONFLICT (nome) DO UPDATE SET ordine = EXCLUDED.ordine;

-- Seed Opzioni Allenatori
INSERT INTO public.epika_opzioni (tipo, valore) VALUES
('allenatore', 'Beleno'),
('allenatore', 'Canturios'),
('allenatore', 'Cunagato'),
('allenatore', 'Garid'),
('allenatore', 'Kratos'),
('allenatore', 'Lisando'),
('allenatore', 'Minor'),
('allenatore', 'Tito'),
('allenatore', 'Nevio'),
('allenatore', 'Mirco');

-- ===========================================================================
-- ABILITAZIONE ROW LEVEL SECURITY (RLS)
-- ===========================================================================
ALTER TABLE public.epika_gruppi_storici ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_gruppi_lavoro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_opzioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_profili ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_eventi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_iscrizioni_eventi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epika_presenze_eventi ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- RLS POLICIES
-- ===========================================================================

-- 1. RLS epika_gruppi_storici
CREATE POLICY select_epika_gruppi_storici ON public.epika_gruppi_storici
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY all_admin_epika_gruppi_storici ON public.epika_gruppi_storici
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 2. RLS epika_gruppi_lavoro
CREATE POLICY select_epika_gruppi_lavoro ON public.epika_gruppi_lavoro
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY all_admin_epika_gruppi_lavoro ON public.epika_gruppi_lavoro
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 3. RLS epika_opzioni
CREATE POLICY select_epika_opzioni ON public.epika_opzioni
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY all_admin_epika_opzioni ON public.epika_opzioni
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 4. RLS epika_profili
CREATE POLICY select_epika_profili ON public.epika_profili
    FOR SELECT USING (
        id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

CREATE POLICY insert_epika_profili ON public.epika_profili
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY update_epika_profili ON public.epika_profili
    FOR UPDATE USING (
        id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 5. RLS epika_eventi
CREATE POLICY select_epika_eventi ON public.epika_eventi
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY all_admin_epika_eventi ON public.epika_eventi
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 6. RLS epika_iscrizioni_eventi
CREATE POLICY select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi
    FOR SELECT USING (
        utente_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

CREATE POLICY insert_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi
    FOR INSERT WITH CHECK (utente_id = auth.uid());

CREATE POLICY delete_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi
    FOR DELETE USING (
        utente_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 7. RLS epika_presenze_eventi
CREATE POLICY select_epika_presenze_eventi ON public.epika_presenze_eventi
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY all_admin_epika_presenze_eventi ON public.epika_presenze_eventi
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );
