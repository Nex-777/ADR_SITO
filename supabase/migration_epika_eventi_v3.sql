-- 1a. Costo evento
ALTER TABLE public.epika_eventi 
  ADD COLUMN IF NOT EXISTS costo NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 1b. Tabella bozze iscrizioni (dati temporanei pre-pagamento)
CREATE TABLE IF NOT EXISTS public.epika_iscrizioni_bozza (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utente_id UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
  evento_id UUID NOT NULL REFERENCES public.epika_eventi(id) ON DELETE CASCADE,
  giorni_presenza DATE[] NOT NULL DEFAULT '{}',
  data_ora_arrivo TIMESTAMPTZ,
  data_ora_ripartenza TIMESTAMPTZ,
  dettagli JSONB NOT NULL DEFAULT '{}',
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  UNIQUE(utente_id, evento_id)
);

-- 1c. Aggiungere colonne mancanti a epika_iscrizioni_eventi
ALTER TABLE public.epika_iscrizioni_eventi
  ADD COLUMN IF NOT EXISTS data_ora_arrivo TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_ora_ripartenza TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS codice_transazione TEXT,
  ADD COLUMN IF NOT EXISTS ricevuta_id UUID REFERENCES public.ricevute_pagamenti(id) ON DELETE SET NULL;

-- 1d. Fix policy ALL su epika_eventi (include is_admin_epika)
DROP POLICY IF EXISTS all_admin_epika_eventi ON public.epika_eventi;
CREATE POLICY write_admin_epika_eventi ON public.epika_eventi
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
    OR 'presidente' = ANY(public.get_user_role(auth.uid()))
  );

-- 1e. Fix policy SELECT su epika_iscrizioni_eventi (include ruoli SCAB)
DROP POLICY IF EXISTS select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi;
CREATE POLICY select_epika_iscrizioni_eventi ON public.epika_iscrizioni_eventi
  FOR SELECT USING (
    utente_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.epika_profili p
      WHERE p.id = auth.uid() AND (
        p.is_admin_epika = TRUE
        OR (p.gruppo_lavoro_ids IS NOT NULL AND cardinality(p.gruppo_lavoro_ids) > 0)
      )
    )
    OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.epika_opzioni o
      WHERE o.utente_id = auth.uid()
        AND o.tipo IN ('allenatore', 'scab_validatore', 'scab_allievo_allenatore')
    )
  );

-- 1f. RLS su epika_iscrizioni_bozza
ALTER TABLE public.epika_iscrizioni_bozza ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bozza_own ON public.epika_iscrizioni_bozza;
CREATE POLICY bozza_own ON public.epika_iscrizioni_bozza
  FOR ALL USING (utente_id = auth.uid());
