-- ===========================================================================
-- MIGRAZIONE EPIKA: Validazione Tessera CSEN (Registro Tesserati + Utenti)
-- v3 — RPC & Trigger con Single Source of Truth
-- ===========================================================================

-- 1. Funzione Helper Centralizzata (RPC per Frontend e Trigger)
CREATE OR REPLACE FUNCTION public.get_user_tessera_livello(p_utente_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_livello TEXT;
BEGIN
    -- Priorità 1: Cerca la tessera CSEN attiva nel registro_tesserati ufficiale
    SELECT r.livello_copertura INTO v_livello
    FROM public.registro_tesserati r
    JOIN public.anagrafiche a ON r.anagrafica_id = a.id
    WHERE a.utente_id = p_utente_id 
      AND r.stato_tesseramento = 'ATTIVO'
    ORDER BY r.id_tesserato DESC
    LIMIT 1;

    -- Priorità 2: Fallback su utenti.tipo_tessera se non trovato in registro_tesserati
    IF v_livello IS NULL THEN
        SELECT tipo_tessera INTO v_livello
        FROM public.utenti
        WHERE id = p_utente_id;
    END IF;

    RETURN COALESCE(v_livello, 'NONE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permetti a tutti gli utenti di invocare l'RPC per la verifica tessera
GRANT EXECUTE ON FUNCTION public.get_user_tessera_livello(UUID) TO authenticated, service_role, anon;

-- 2. Trigger Function per la tabella epika_profili
CREATE OR REPLACE FUNCTION public.check_epika_tessera_ruolo()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_tessera TEXT;
    -- WHITELIST esplicita: solo queste tessere abilitano il ruolo combattente.
    TESSERE_COMBATTENTI TEXT[] := ARRAY[
        'INTEGRATIVA_A', 'INTEGRATIVA_B', 
        'tessera_integrativa_a', 'tessera_integrativa_b'
    ];
BEGIN
    -- Blocco solo se il ruolo richiesto è 'combattente'
    IF NEW.ruolo_combattimento = 'combattente' THEN
        -- Estrai la tessera tramite la funzione centralizzata
        v_tipo_tessera := public.get_user_tessera_livello(NEW.id);

        -- Se la tessera non è nella whitelist (incluso NONE), blocca l'operazione.
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

-- Sanitizzazione dati pregressi
UPDATE public.epika_profili
SET allenatore_id = NULL
WHERE ruolo_combattimento = 'non_combattente'
AND allenatore_id IS NOT NULL;
