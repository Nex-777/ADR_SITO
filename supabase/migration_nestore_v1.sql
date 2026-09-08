-- ==============================================================================
-- MIGRATION: NESTORE V1 - Database Schema & Row Level Security
-- ==============================================================================

-- 1. Tabella Preferenze Utente
CREATE TABLE IF NOT EXISTS public.nestore_preferenze (
    utente_id UUID PRIMARY KEY REFERENCES public.utenti(id) ON DELETE CASCADE,
    conferma_preventiva BOOLEAN NOT NULL DEFAULT true,
    calorie_target INTEGER,
    proteine_target_g NUMERIC(5,1),
    peso_target_kg NUMERIC(5,2),
    creato_il TIMESTAMPTZ NOT NULL DEFAULT now(),
    aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nestore_preferenze ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_pref_select_own" ON public.nestore_preferenze;
CREATE POLICY "nst_pref_select_own" ON public.nestore_preferenze
    FOR SELECT USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

DROP POLICY IF EXISTS "nst_pref_insert_own" ON public.nestore_preferenze;
CREATE POLICY "nst_pref_insert_own" ON public.nestore_preferenze
    FOR INSERT WITH CHECK (utente_id = auth.uid());

DROP POLICY IF EXISTS "nst_pref_update_own" ON public.nestore_preferenze;
CREATE POLICY "nst_pref_update_own" ON public.nestore_preferenze
    FOR UPDATE USING (utente_id = auth.uid());


-- 2. Tabella Pesi e Misure Corporee (Storicizzazione Append-Only)
CREATE TABLE IF NOT EXISTS public.nestore_pesi_misure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_rilevazione DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_kg NUMERIC(5,2),
    collo_cm NUMERIC(5,1),
    torace_cm NUMERIC(5,1),
    vita_cm NUMERIC(5,1),
    fianchi_cm NUMERIC(5,1),
    braccio_dx_cm NUMERIC(5,1),
    braccio_sx_cm NUMERIC(5,1),
    coscia_dx_cm NUMERIC(5,1),
    coscia_sx_cm NUMERIC(5,1),
    note TEXT,
    attivo BOOLEAN NOT NULL DEFAULT true,
    creato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nestore_pesi_misure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_pm_select_own" ON public.nestore_pesi_misure;
CREATE POLICY "nst_pm_select_own" ON public.nestore_pesi_misure
    FOR SELECT USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

DROP POLICY IF EXISTS "nst_pm_insert_own" ON public.nestore_pesi_misure;
CREATE POLICY "nst_pm_insert_own" ON public.nestore_pesi_misure
    FOR INSERT WITH CHECK (utente_id = auth.uid());

DROP POLICY IF EXISTS "nst_pm_update_own" ON public.nestore_pesi_misure;
CREATE POLICY "nst_pm_update_own" ON public.nestore_pesi_misure
    FOR UPDATE USING (utente_id = auth.uid());


-- 3. Tabella Diario Allenamenti
CREATE TABLE IF NOT EXISTS public.nestore_allenamenti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_allenamento DATE NOT NULL DEFAULT CURRENT_DATE,
    corso_disciplina TEXT,
    durata_minuti INTEGER,
    scheda_dati JSONB DEFAULT '[]'::jsonb,
    rpe_fatica SMALLINT CHECK (rpe_fatica BETWEEN 1 AND 10),
    note TEXT,
    attivo BOOLEAN NOT NULL DEFAULT true,
    creato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nestore_allenamenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_all_select_own" ON public.nestore_allenamenti;
CREATE POLICY "nst_all_select_own" ON public.nestore_allenamenti
    FOR SELECT USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

DROP POLICY IF EXISTS "nst_all_insert_own" ON public.nestore_allenamenti;
CREATE POLICY "nst_all_insert_own" ON public.nestore_allenamenti
    FOR INSERT WITH CHECK (utente_id = auth.uid());

DROP POLICY IF EXISTS "nst_all_update_own" ON public.nestore_allenamenti;
CREATE POLICY "nst_all_update_own" ON public.nestore_allenamenti
    FOR UPDATE USING (utente_id = auth.uid());


-- 4. Tabella Diario Pasti e Nutrizione
CREATE TABLE IF NOT EXISTS public.nestore_pasti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_pasto DATE NOT NULL DEFAULT CURRENT_DATE,
    tipo_pasto VARCHAR(20) CHECK (tipo_pasto IN ('colazione','pranzo','cena','snack')),
    descrizione TEXT NOT NULL,
    calorie_stimate INTEGER,
    carboidrati_g NUMERIC(5,1),
    proteine_g NUMERIC(5,1),
    grassi_g NUMERIC(5,1),
    foto_url TEXT,
    attivo BOOLEAN NOT NULL DEFAULT true,
    creato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nestore_pasti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_pasti_select_own" ON public.nestore_pasti;
CREATE POLICY "nst_pasti_select_own" ON public.nestore_pasti
    FOR SELECT USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

DROP POLICY IF EXISTS "nst_pasti_insert_own" ON public.nestore_pasti;
CREATE POLICY "nst_pasti_insert_own" ON public.nestore_pasti
    FOR INSERT WITH CHECK (utente_id = auth.uid());

DROP POLICY IF EXISTS "nst_pasti_update_own" ON public.nestore_pasti;
CREATE POLICY "nst_pasti_update_own" ON public.nestore_pasti
    FOR UPDATE USING (utente_id = auth.uid());


-- 5. Tabella Storico Messaggi Chat
CREATE TABLE IF NOT EXISTS public.nestore_chat_messaggi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    ruolo VARCHAR(10) NOT NULL CHECK (ruolo IN ('user','assistant','system')),
    contenuto TEXT NOT NULL,
    foto_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    creato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nestore_chat_messaggi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_chat_select_own" ON public.nestore_chat_messaggi;
CREATE POLICY "nst_chat_select_own" ON public.nestore_chat_messaggi
    FOR SELECT USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

DROP POLICY IF EXISTS "nst_chat_insert_own" ON public.nestore_chat_messaggi;
CREATE POLICY "nst_chat_insert_own" ON public.nestore_chat_messaggi
    FOR INSERT WITH CHECK (utente_id = auth.uid());

-- Indici per performance su utente e date
CREATE INDEX IF NOT EXISTS idx_nst_pm_utente_data ON public.nestore_pesi_misure (utente_id, data_rilevazione DESC);
CREATE INDEX IF NOT EXISTS idx_nst_all_utente_data ON public.nestore_allenamenti (utente_id, data_allenamento DESC);
CREATE INDEX IF NOT EXISTS idx_nst_pasti_utente_data ON public.nestore_pasti (utente_id, data_pasto DESC);
CREATE INDEX IF NOT EXISTS idx_nst_chat_utente_creato ON public.nestore_chat_messaggi (utente_id, creato_il DESC);
