-- ==============================================================================
-- MIGRATION: Fix Foreign Keys su nestore_schede_allenamento
-- Data: 2026-09-16
-- 1. allenatore_id resa NULLABLE per compatibilita con ON DELETE SET NULL
-- 2. atleta_id FK modificata da ON DELETE CASCADE a ON DELETE RESTRICT (EPIKA)
-- ==============================================================================

ALTER TABLE public.nestore_schede_allenamento
    ALTER COLUMN allenatore_id DROP NOT NULL;

ALTER TABLE public.nestore_schede_allenamento
    DROP CONSTRAINT IF EXISTS nestore_schede_allenamento_atleta_id_fkey;

ALTER TABLE public.nestore_schede_allenamento
    ADD CONSTRAINT nestore_schede_allenamento_atleta_id_fkey
    FOREIGN KEY (atleta_id) REFERENCES public.utenti(id) ON DELETE RESTRICT;
