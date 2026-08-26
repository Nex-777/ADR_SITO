-- ===========================================================================
-- MIGRAZIONE EPIKA: Contabilità Eventi & Prima Nota
-- Riservata esclusivamente ad Amministratore e Presidente (RLS rigorosa)
-- Storicizzazione EPIKA: attivo = TRUE per soft-delete
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.epika_contabilita_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.epika_eventi(id) ON DELETE CASCADE,
    tipo_movimento TEXT NOT NULL CHECK (tipo_movimento IN ('entrata', 'uscita')),
    voce TEXT NOT NULL,
    quantita INT NOT NULL DEFAULT 1 CHECK (quantita > 0),
    importo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    metodo_pagamento TEXT NOT NULL CHECK (metodo_pagamento IN ('cassa', 'banca')),
    data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT DEFAULT '',
    creato_da UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici per query e performance
CREATE INDEX IF NOT EXISTS idx_epika_contab_evento ON public.epika_contabilita_eventi(evento_id);
CREATE INDEX IF NOT EXISTS idx_epika_contab_attivo ON public.epika_contabilita_eventi(attivo);
CREATE INDEX IF NOT EXISTS idx_epika_contab_data ON public.epika_contabilita_eventi(data_movimento);

-- Abilitazione Row Level Security (RLS)
ALTER TABLE public.epika_contabilita_eventi ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy (Solo Admin Epika o Presidente - Nessun accesso pubblico)
DROP POLICY IF EXISTS select_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi;
CREATE POLICY select_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 2. INSERT Policy (Solo Admin Epika o Presidente)
DROP POLICY IF EXISTS insert_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi;
CREATE POLICY insert_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 3. UPDATE Policy (Solo Admin Epika o Presidente)
DROP POLICY IF EXISTS update_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi;
CREATE POLICY update_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- 4. DELETE Policy (Solo Admin Epika o Presidente)
DROP POLICY IF EXISTS delete_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi;
CREATE POLICY delete_admin_epika_contabilita_eventi ON public.epika_contabilita_eventi
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente'::ruolo_utente = ANY(public.get_user_role(auth.uid()))
    );

-- Trigger per updated_at
DROP TRIGGER IF EXISTS trg_epika_contabilita_eventi_updated_at ON public.epika_contabilita_eventi;
CREATE TRIGGER trg_epika_contabilita_eventi_updated_at
BEFORE UPDATE ON public.epika_contabilita_eventi
FOR EACH ROW EXECUTE FUNCTION public.epika_set_updated_at();
