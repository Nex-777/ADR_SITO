-- ===========================================================================
-- MIGRAZIONE EPIKA: Registro Modifiche Profilo Atleta (Audit Log)
-- ===========================================================================

-- 1. Creazione Tabella di Audit Registro Modifiche
CREATE TABLE IF NOT EXISTS public.epika_registro_modifiche_profilo (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profilo_id UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
    campo TEXT NOT NULL,
    valore_precedente TEXT,
    valore_nuovo TEXT,
    data_modifica TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Abilitazione Row Level Security (RLS)
ALTER TABLE public.epika_registro_modifiche_profilo ENABLE ROW LEVEL SECURITY;

-- 3. Policy di SELECT: proprietario del profilo, admin Epika e Presidente
DROP POLICY IF EXISTS select_epika_registro_modifiche ON public.epika_registro_modifiche_profilo;
CREATE POLICY select_epika_registro_modifiche ON public.epika_registro_modifiche_profilo
    FOR SELECT USING (
        profilo_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.epika_profili WHERE id = auth.uid() AND is_admin_epika = TRUE)
        OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    );

-- 4. Funzione Trigger per loggare automaticamente le modifiche (SECURITY DEFINER per superare restrizioni)
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Bind del trigger AFTER UPDATE alla tabella epika_profili
DROP TRIGGER IF EXISTS trg_log_epika_profilo_updates ON public.epika_profili;
CREATE TRIGGER trg_log_epika_profilo_updates
AFTER UPDATE ON public.epika_profili
FOR EACH ROW
EXECUTE FUNCTION public.trg_epika_log_profilo_modifiche();
