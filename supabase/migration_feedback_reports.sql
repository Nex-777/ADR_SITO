-- ==============================================================================
-- Migration: Tabella feedback_reports per Segnalazioni & Feedback Utenti
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.feedback_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    user_role TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('SUGGERIMENTO', 'BUG')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    page_url TEXT NOT NULL,
    app_version TEXT NOT NULL,
    diagnostic_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    attachment_name TEXT,
    attachment_base64 TEXT,
    status TEXT NOT NULL DEFAULT 'DA_LEGGERE' CHECK (status IN ('DA_LEGGERE', 'LETTA', 'RISOLTA', 'ARCHIVIATA')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici per query efficienti su stato, categoria e utente
CREATE INDEX IF NOT EXISTS idx_feedback_reports_status_cat_created 
    ON public.feedback_reports (status, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_client_id 
    ON public.feedback_reports (client_id);

-- Trigger per auto-aggiornare updated_at
CREATE OR REPLACE FUNCTION public.handle_feedback_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_feedback_reports_updated_at ON public.feedback_reports;
CREATE TRIGGER trigger_feedback_reports_updated_at
    BEFORE UPDATE ON public.feedback_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_feedback_reports_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- 1. Inserimento: solo per se stessi (client_id = auth.uid())
DROP POLICY IF EXISTS "insert_own_feedback" ON public.feedback_reports;
CREATE POLICY "insert_own_feedback" ON public.feedback_reports
    FOR INSERT
    WITH CHECK (client_id = auth.uid());

-- 2. Lettura: i soci/tesserati leggono i propri; la Presidenza (presidente, vice_presidente) legge tutto
DROP POLICY IF EXISTS "select_own_or_presidenza_feedback" ON public.feedback_reports;
CREATE POLICY "select_own_or_presidenza_feedback" ON public.feedback_reports
    FOR SELECT
    USING (
        client_id = auth.uid()
        OR (
            public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
        )
    );

-- 3. Modifica (cambio stato, note admin): solo la Presidenza (presidente, vice_presidente)
DROP POLICY IF EXISTS "update_presidenza_feedback" ON public.feedback_reports;
CREATE POLICY "update_presidenza_feedback" ON public.feedback_reports
    FOR UPDATE
    USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    )
    WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    );
