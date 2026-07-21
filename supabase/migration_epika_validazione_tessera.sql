-- ===========================================================================
-- MIGRAZIONE EPIKA: Validazione Tessera Base vs Ruolo Combattente
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.check_epika_tessera_ruolo()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_tessera TEXT;
BEGIN
    -- Se il ruolo di combattimento è 'combattente'
    IF NEW.ruolo_combattimento = 'combattente' THEN
        -- Recupera il tipo_tessera dall'utente
        SELECT tipo_tessera INTO v_tipo_tessera 
        FROM public.utenti 
        WHERE id = NEW.id;

        -- Se il tipo_tessera è di tipo base (contiene 'base' o 'silver' o 'gold' senza integrativa)
        IF v_tipo_tessera ILIKE '%base%' OR v_tipo_tessera ILIKE '%silver%' OR v_tipo_tessera ILIKE '%gold%' THEN
            IF v_tipo_tessera NOT ILIKE '%integrativa%' THEN
                RAISE EXCEPTION 'Un utente con tessera base non può iscriversi o modificare il profilo come combattente.';
            END IF;
        END IF;
    END IF;

    -- Se il ruolo è 'non_combattente', assicura che l'allenatore sia NULL
    IF NEW.ruolo_combattimento = 'non_combattente' THEN
        NEW.allenatore_id := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind del trigger BEFORE INSERT OR UPDATE sulla tabella epika_profili
DROP TRIGGER IF EXISTS trg_check_epika_tessera_ruolo ON public.epika_profili;
CREATE TRIGGER trg_check_epika_tessera_ruolo
BEFORE INSERT OR UPDATE ON public.epika_profili
FOR EACH ROW
EXECUTE FUNCTION public.check_epika_tessera_ruolo();
