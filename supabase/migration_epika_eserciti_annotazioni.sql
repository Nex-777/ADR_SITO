-- Migration: Add annotazioni_schieramento JSONB column for richiami, encomi, and bilanciamenti
ALTER TABLE public.epika_eserciti_eventi
ADD COLUMN IF NOT EXISTS annotazioni_schieramento JSONB DEFAULT '{"esercito_a": {"richiami": "", "encomi": ""}, "esercito_b": {"richiami": "", "encomi": ""}, "bilanciamenti": ""}'::jsonb;
