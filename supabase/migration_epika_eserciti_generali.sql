-- Migration: Add generali_esercito_a and generali_esercito_b columns
ALTER TABLE public.epika_eserciti_eventi 
ADD COLUMN IF NOT EXISTS generali_esercito_a JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS generali_esercito_b JSONB DEFAULT '[]'::jsonb;
