-- ============================================================================
-- MIGRAZIONE GDPR: Versioning Privacy e Registro Consensi Append-Only
-- Data: 2026-08-03
-- ============================================================================

-- 1. Modifica Tabelle Esistenti per Versioning Policy (NULLABLE per evitare break di Supabase Auth trigger)
ALTER TABLE public.utenti 
ADD COLUMN IF NOT EXISTS versione_privacy_accettata VARCHAR(20) NULL;

ALTER TABLE public.atti_adesione 
ADD COLUMN IF NOT EXISTS versione_privacy VARCHAR(20) NULL;

-- 2. Creazione Tabella Append-Only per Registro Consensi
CREATE TABLE IF NOT EXISTS public.registro_consensi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    tipo_consenso VARCHAR(50) NOT NULL, -- 'consenso_marketing', 'consenso_audiovisivi'
    stato_consenso BOOLEAN NOT NULL,
    fonte_modifica VARCHAR(50) NOT NULL, -- 'registrazione_otp', 'dashboard_utente'
    versione_policy VARCHAR(20) DEFAULT '1.03.86',
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici per velocizzare le interrogazioni di audit
CREATE INDEX IF NOT EXISTS idx_registro_consensi_utente ON public.registro_consensi(utente_id);
CREATE INDEX IF NOT EXISTS idx_registro_consensi_created ON public.registro_consensi(created_at DESC);

-- 3. Abilitazione RLS e Policy di Sicurezza (Nessuna policy INSERT/UPDATE/DELETE per utenti autenticati)
ALTER TABLE public.registro_consensi ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: L'utente può vedere solo i propri consensi storicizzati
DROP POLICY IF EXISTS "registro_consensi_select_own" ON public.registro_consensi;
CREATE POLICY "registro_consensi_select_own" ON public.registro_consensi
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = utente_id 
        OR 
        EXISTS (
            SELECT 1 FROM public.utenti u 
            WHERE u.id = auth.uid() 
            AND u.ruolo::text[] && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::text[]
        )
    );

-- 4. Funzione e Trigger PostgreSQL per Storicizzazione Automatica
CREATE OR REPLACE FUNCTION public.fn_log_consensi_utenti()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_fonte VARCHAR(50);
    v_ip VARCHAR(45);
    v_jwt_claims JSON;
    v_headers JSON;
    v_versione VARCHAR(20);
BEGIN
    -- Recupera il ruolo dal JWT di Supabase per determinare la fonte
    BEGIN
        v_jwt_claims := current_setting('request.jwt.claims', true)::json;
        v_role := v_jwt_claims->>'role';
    EXCEPTION WHEN OTHERS THEN
        v_role := NULL;
    END;

    IF v_role = 'service_role' THEN
        v_fonte := 'registrazione_otp';
    ELSE
        v_fonte := 'dashboard_utente';
    END IF;

    -- Recupera l'IP della richiesta se disponibile dalle intestazioni HTTP PostgREST
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
        v_ip := split_part(v_headers->>'x-forwarded-for', ',', 1);
    EXCEPTION WHEN OTHERS THEN
        v_ip := NULL;
    END;

    -- Versione della policy privacy
    v_versione := COALESCE(NEW.versione_privacy_accettata, '1.03.86');

    -- Log del consenso marketing se modificato
    IF OLD.consenso_marketing IS DISTINCT FROM NEW.consenso_marketing THEN
        INSERT INTO public.registro_consensi (
            utente_id,
            tipo_consenso,
            stato_consenso,
            fonte_modifica,
            versione_policy,
            ip_address
        ) VALUES (
            NEW.id,
            'consenso_marketing',
            COALESCE(NEW.consenso_marketing, false),
            v_fonte,
            v_versione,
            v_ip
        );
    END IF;

    -- Log del consenso audiovisivi se modificato
    IF OLD.consenso_audiovisivi IS DISTINCT FROM NEW.consenso_audiovisivi THEN
        INSERT INTO public.registro_consensi (
            utente_id,
            tipo_consenso,
            stato_consenso,
            fonte_modifica,
            versione_policy,
            ip_address
        ) VALUES (
            NEW.id,
            'consenso_audiovisivi',
            COALESCE(NEW.consenso_audiovisivi, false),
            v_fonte,
            v_versione,
            v_ip
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Creazione / Rimpiazzo del Trigger su public.utenti
DROP TRIGGER IF EXISTS trg_log_consensi_utenti ON public.utenti;
CREATE TRIGGER trg_log_consensi_utenti
    AFTER UPDATE OF consenso_marketing, consenso_audiovisivi, versione_privacy_accettata
    ON public.utenti
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_log_consensi_utenti();
