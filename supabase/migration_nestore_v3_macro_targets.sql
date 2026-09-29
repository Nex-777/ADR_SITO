-- ==============================================================================
-- MIGRATION: NESTORE V3 - Macro Targets Percentage in nestore_preferenze
-- ==============================================================================

ALTER TABLE public.nestore_preferenze
    ADD COLUMN IF NOT EXISTS grassi_target_pct NUMERIC(4,1) DEFAULT 25.0,
    ADD COLUMN IF NOT EXISTS proteine_target_pct NUMERIC(4,1) DEFAULT 35.0;

-- Commento esplicativo sulle colonne
COMMENT ON COLUMN public.nestore_preferenze.grassi_target_pct IS 'Percentuale target grassi giornalieri (default 25%)';
COMMENT ON COLUMN public.nestore_preferenze.proteine_target_pct IS 'Percentuale target proteine giornaliere (default 35%)';
