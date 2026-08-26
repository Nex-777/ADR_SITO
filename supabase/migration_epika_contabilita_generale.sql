-- ===========================================================================
-- MIGRAZIONE EPIKA: Contabilità Generale (Movimenti slegati da eventi)
-- Rende la colonna evento_id opzionale (NULLABLE) per registrare movimenti generali di EPIKA
-- ===========================================================================

ALTER TABLE public.epika_contabilita_eventi ALTER COLUMN evento_id DROP NOT NULL;
