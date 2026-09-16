-- ==============================================================================
-- MIGRATION: NESTORE V2 - Wiki Atleta & Altezza Biometrica
-- ==============================================================================

-- 1. Aggiunta colonna altezza_cm a nestore_pesi_misure e nestore_preferenze
ALTER TABLE public.nestore_pesi_misure 
    ADD COLUMN IF NOT EXISTS altezza_cm NUMERIC(5,1);

ALTER TABLE public.nestore_preferenze 
    ADD COLUMN IF NOT EXISTS altezza_cm NUMERIC(5,1);

-- 2. Tabella Scheda Atleta (Wiki Karpathy-style per Gemini & Portale)
CREATE TABLE IF NOT EXISTS public.nestore_scheda_atleta (
    utente_id UUID PRIMARY KEY REFERENCES public.utenti(id) ON DELETE CASCADE,
    scheda_markdown TEXT NOT NULL DEFAULT '',
    biometria JSONB DEFAULT '{}'::jsonb,
    allenamento JSONB DEFAULT '{}'::jsonb,
    nutrizione JSONB DEFAULT '{}'::jsonb,
    versione INTEGER NOT NULL DEFAULT 1,
    aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now(),
    creato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Row Level Security
ALTER TABLE public.nestore_scheda_atleta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_scheda_select_own" ON public.nestore_scheda_atleta;
CREATE POLICY "nst_scheda_select_own" ON public.nestore_scheda_atleta
    FOR SELECT USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

DROP POLICY IF EXISTS "nst_scheda_insert_own" ON public.nestore_scheda_atleta;
CREATE POLICY "nst_scheda_insert_own" ON public.nestore_scheda_atleta
    FOR INSERT WITH CHECK (utente_id = auth.uid());

DROP POLICY IF EXISTS "nst_scheda_update_own" ON public.nestore_scheda_atleta;
CREATE POLICY "nst_scheda_update_own" ON public.nestore_scheda_atleta
    FOR UPDATE USING (utente_id = auth.uid());

-- 4. Indice su aggiornato_il
CREATE INDEX IF NOT EXISTS idx_nst_scheda_aggiornato ON public.nestore_scheda_atleta (utente_id, aggiornato_il DESC);
