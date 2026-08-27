-- ===========================================================================
-- MIGRAZIONE EPIKA: Vincolo di Unicità, Lunghezza e Audit Nome di Battaglia
-- ===========================================================================

-- 1. Sanifica i dati esistenti: porta tutti i nomi_di_battaglia in UPPERCASE
UPDATE public.epika_profili
SET nome_di_battaglia = UPPER(TRIM(nome_di_battaglia))
WHERE nome_di_battaglia IS NOT NULL;

-- 2. Aggiunge vincolo di lunghezza massima (40 caratteri)
ALTER TABLE public.epika_profili
DROP CONSTRAINT IF EXISTS epika_profili_nome_battaglia_length;

ALTER TABLE public.epika_profili
ADD CONSTRAINT epika_profili_nome_battaglia_length
CHECK (nome_di_battaglia IS NULL OR char_length(nome_di_battaglia) <= 40);

-- 3. Aggiunge indice UNIQUE case-insensitive come sicurezza definitiva
CREATE UNIQUE INDEX IF NOT EXISTS epika_profili_nome_battaglia_unique
ON public.epika_profili (UPPER(nome_di_battaglia))
WHERE nome_di_battaglia IS NOT NULL;

-- 4. Aggiorna la funzione trigger di audit per includere le variazioni del Nome Storico
CREATE OR REPLACE FUNCTION public.trg_epika_log_profilo_modifiche()
RETURNS TRIGGER AS $$
DECLARE
    v_old_text TEXT;
    v_new_text TEXT;
BEGIN
    -- 4.1. Gruppo Storico
    IF OLD.gruppo_storico_id IS DISTINCT FROM NEW.gruppo_storico_id THEN
        SELECT nome INTO v_old_text FROM public.epika_gruppi_storici WHERE id = OLD.gruppo_storico_id;
        SELECT nome INTO v_new_text FROM public.epika_gruppi_storici WHERE id = NEW.gruppo_storico_id;
        INSERT INTO public.epika_registro_modifiche_profilo (profilo_id, campo, valore_precedente, valore_nuovo)
        VALUES (NEW.id, 'Gruppo Storico', COALESCE(v_old_text, 'Nessuno'), COALESCE(v_new_text, 'Nessuno'));
    END IF;

    -- 4.2. Popolo / Cultura
    IF OLD.popolo IS DISTINCT FROM NEW.popolo THEN
        INSERT INTO public.epika_registro_modifiche_profilo (profilo_id, campo, valore_precedente, valore_nuovo)
        VALUES (NEW.id, 'Popolo/Cultura', COALESCE(OLD.popolo, 'Nessuno'), COALESCE(NEW.popolo, 'Nessuno'));
    END IF;

    -- 4.3. Ruolo Combattimento
    IF OLD.ruolo_combattimento IS DISTINCT FROM NEW.ruolo_combattimento THEN
        INSERT INTO public.epika_registro_modifiche_profilo (profilo_id, campo, valore_precedente, valore_nuovo)
        VALUES (NEW.id, 'Ruolo Combattimento', 
            COALESCE(REPLACE(OLD.ruolo_combattimento, '_', ' '), 'Nessuno'), 
            COALESCE(REPLACE(NEW.ruolo_combattimento, '_', ' '), 'Nessuno')
        );
    END IF;

    -- 4.4. Allenatore Riferimento
    IF OLD.allenatore_id IS DISTINCT FROM NEW.allenatore_id THEN
        SELECT valore INTO v_old_text FROM public.epika_opzioni WHERE id = OLD.allenatore_id;
        SELECT valore INTO v_new_text FROM public.epika_opzioni WHERE id = NEW.allenatore_id;
        INSERT INTO public.epika_registro_modifiche_profilo (profilo_id, campo, valore_precedente, valore_nuovo)
        VALUES (NEW.id, 'Allenatore', COALESCE(v_old_text, 'Nessuno'), COALESCE(v_new_text, 'Nessuno'));
    END IF;

    -- 4.5. Nome Storico / Nome di Battaglia
    IF OLD.nome_di_battaglia IS DISTINCT FROM NEW.nome_di_battaglia THEN
        INSERT INTO public.epika_registro_modifiche_profilo (profilo_id, campo, valore_precedente, valore_nuovo)
        VALUES (NEW.id, 'Nome Storico', COALESCE(OLD.nome_di_battaglia, 'Non impostato'), COALESCE(NEW.nome_di_battaglia, 'Non impostato'));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
