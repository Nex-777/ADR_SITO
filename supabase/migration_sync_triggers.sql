-- 1. Funzione di sincronizzazione da anagrafiche a utenti
CREATE OR REPLACE FUNCTION public.sync_anagrafica_to_utente()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.utenti
    SET 
        nome = NEW.nome,
        cognome = NEW.cognome,
        codice_fiscale = NEW.codice_fiscale,
        data_nascita = NEW.data_nascita
    WHERE id = NEW.utente_id AND (
        nome IS DISTINCT FROM NEW.nome OR
        cognome IS DISTINCT FROM NEW.cognome OR
        codice_fiscale IS DISTINCT FROM NEW.codice_fiscale OR
        data_nascita IS DISTINCT FROM NEW.data_nascita
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger su anagrafiche
DROP TRIGGER IF EXISTS trigger_sync_anagrafica_to_utente ON public.anagrafiche;
CREATE TRIGGER trigger_sync_anagrafica_to_utente
AFTER INSERT OR UPDATE OF nome, cognome, codice_fiscale, data_nascita ON public.anagrafiche
FOR EACH ROW
EXECUTE FUNCTION public.sync_anagrafica_to_utente();

-- 2. Funzione di sincronizzazione da utenti a anagrafiche, contatti, indirizzi_residenza
CREATE OR REPLACE FUNCTION public.sync_utente_to_anagrafica()
RETURNS TRIGGER AS $$
DECLARE
    v_anag_id UUID;
    v_street_name TEXT;
    v_street_number TEXT := 'snc';
    v_match TEXT[];
BEGIN
    -- Trova l'anagrafica corrispondente
    SELECT id INTO v_anag_id FROM public.anagrafiche WHERE utente_id = NEW.id;
    
    IF v_anag_id IS NOT NULL THEN
        -- 1. Sync Anagrafica (se cambia nome, cognome, codice_fiscale, data_nascita)
        IF (OLD.nome IS DISTINCT FROM NEW.nome OR 
            OLD.cognome IS DISTINCT FROM NEW.cognome OR 
            OLD.codice_fiscale IS DISTINCT FROM NEW.codice_fiscale OR 
            OLD.data_nascita IS DISTINCT FROM NEW.data_nascita) THEN
            
            UPDATE public.anagrafiche
            SET 
                nome = NEW.nome,
                cognome = NEW.cognome,
                codice_fiscale = NEW.codice_fiscale,
                data_nascita = NEW.data_nascita
            WHERE id = v_anag_id;
        END IF;

        -- 2. Sync Contatti (email, cellulare)
        IF (OLD.email IS DISTINCT FROM NEW.email OR OLD.cellulare IS DISTINCT FROM NEW.cellulare) THEN
            INSERT INTO public.contatti (anagrafica_id, email, telefono)
            VALUES (v_anag_id, NEW.email, COALESCE(NEW.cellulare, 'N/D'))
            ON CONFLICT (anagrafica_id) DO UPDATE
            SET email = EXCLUDED.email, telefono = EXCLUDED.telefono;
        END IF;

        -- 3. Sync Indirizzo
        IF (OLD.indirizzo IS DISTINCT FROM NEW.indirizzo OR 
            OLD.comune IS DISTINCT FROM NEW.comune OR 
            OLD.provincia IS DISTINCT FROM NEW.provincia OR 
            OLD.cap IS DISTINCT FROM NEW.cap) THEN
            
            v_street_name := NEW.indirizzo;
            -- Estrai nome via e civico se termina con numero
            IF NEW.indirizzo ~ '.*\\s+\\d+[a-zA-Z]*$' THEN
                v_match := regexp_matches(NEW.indirizzo, '(.*)\\s+(\\d+[a-zA-Z]*)$');
                v_street_name := trim(v_match[1]);
                v_street_number := trim(v_match[2]);
            END IF;

            INSERT INTO public.indirizzi_residenza (anagrafica_id, via_piazza, civico, comune, provincia, cap)
            VALUES (v_anag_id, v_street_name, v_street_number, NEW.comune, NEW.provincia, NEW.cap)
            ON CONFLICT (anagrafica_id) DO UPDATE
            SET via_piazza = EXCLUDED.via_piazza, civico = EXCLUDED.civico, comune = EXCLUDED.comune, provincia = EXCLUDED.provincia, cap = EXCLUDED.cap;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger su utenti
DROP TRIGGER IF EXISTS trigger_sync_utente_to_anagrafica ON public.utenti;
CREATE TRIGGER trigger_sync_utente_to_anagrafica
AFTER UPDATE ON public.utenti
FOR EACH ROW
EXECUTE FUNCTION public.sync_utente_to_anagrafica();
