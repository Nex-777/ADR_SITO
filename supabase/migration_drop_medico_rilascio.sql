-- Migrazione per rimuovere la colonna medico_rilascio
ALTER TABLE public.certificati_medici DROP COLUMN IF EXISTS medico_rilascio;
