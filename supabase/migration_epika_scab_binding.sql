-- Migration: Add UUID binding columns to epika_opzioni table to associate real accounts to SCAB roles.
ALTER TABLE public.epika_opzioni
  ADD COLUMN IF NOT EXISTS utente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profilo_epika_id UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_epika_opzioni_utente_id ON public.epika_opzioni(utente_id);
