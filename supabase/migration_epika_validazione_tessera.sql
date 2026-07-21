-- ===========================================================================
-- MIGRAZIONE EPIKA: Validazione Tessera Base vs Ruolo Combattente
-- v2 — Logica a whitelist (più robusta di ILIKE)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.check_epika_tessera_ruolo()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_tessera TEXT;
    -- WHITELIST esplicita: solo queste tessere abilitano il ruolo combattente.
    -- Per aggiungere future tessere abilitate, inserire qui il valore esatto.
    TESSERE_COMBATTENTI TEXT[] := ARRAY['tessera_integrativa_a', 'tessera_integrativa_b'];
BEGIN
    -- Blocco solo se il ruolo richiesto è 'combattente'
    IF NEW.ruolo_combattimento = 'combattente' THEN
        SELECT tipo_tessera INTO v_tipo_tessera
        FROM public.utenti
        WHERE id = NEW.id;

        -- Se la tessera non è nella whitelist (incluso NULL), blocca l'operazione.
        -- NULL NOT = ANY(array) è TRUE in PostgreSQL, quindi i soci senza tessera
        -- sportiva vengono correttamente bloccati.
        IF v_tipo_tessera IS NULL OR NOT (v_tipo_tessera = ANY(TESSERE_COMBATTENTI)) THEN
            RAISE EXCEPTION 'Solo i possessori di tessera Integrativa A o B possono iscriversi come combattenti. Tessera attuale: %', COALESCE(v_tipo_tessera, 'nessuna');
        END IF;
    END IF;

    -- Se il ruolo è 'non_combattente', garantisce che l'allenatore sia sempre NULL.
    IF NEW.ruolo_combattimento = 'non_combattente' THEN
        NEW.allenatore_id := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind del trigger BEFORE INSERT OR UPDATE alla tabella epika_profili
DROP TRIGGER IF EXISTS trg_check_epika_tessera_ruolo ON public.epika_profili;
CREATE TRIGGER trg_check_epika_tessera_ruolo
BEFORE INSERT OR UPDATE ON public.epika_profili
FOR EACH ROW
EXECUTE FUNCTION public.check_epika_tessera_ruolo();

-- ===========================================================================
-- FIX DATI PREGRESSI: Sanitizzazione non_combattenti con allenatore_id != NULL
-- (Idempotente: non fa nulla se già corretti)
-- ===========================================================================
UPDATE public.epika_profili
SET allenatore_id = NULL
WHERE ruolo_combattimento = 'non_combattente'
AND allenatore_id IS NOT NULL;
