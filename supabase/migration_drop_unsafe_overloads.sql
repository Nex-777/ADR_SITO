-- ===========================================================================
-- MIGRAZIONE SICUREZZA: Drop unsafe function overloads (2026-06-26)
-- ===========================================================================
-- Fix: Rimuovere le due versioni vecchie di salva_verbale_relazionale()
-- che accettano parametri multipli (17 e 18 args) e NON hanno auth check.
-- La versione sicura (JSONB con auth check) resta attiva.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.salva_verbale_relazionale(
    character varying, date, time without time zone, time without time zone, text,
    character varying, date, character varying, uuid, uuid, boolean,
    integer, integer, text, jsonb, jsonb, uuid[]
);

DROP FUNCTION IF EXISTS public.salva_verbale_relazionale(
    character varying, date, time without time zone, time without time zone, text,
    character varying, date, character varying, uuid, uuid, boolean,
    integer, integer, text, jsonb, jsonb, uuid[], jsonb
);
