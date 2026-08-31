-- ===========================================================================
-- MIGRAZIONE EPIKA: Sincronizzazione Realtime Presenze Campo Marzio & Scadenza Abilitazioni
-- ===========================================================================

-- 1. Trigger Function: epika_trg_sync_scadenza_abilitazioni
CREATE OR REPLACE FUNCTION public.epika_trg_sync_scadenza_abilitazioni()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_utente_id UUID;
    v_evento_id UUID;
    v_tipo_evento TEXT;
    v_data_inizio DATE;
    v_anno_evento INT;
    v_ha_cm BOOLEAN;
    v_scadenza DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_utente_id := OLD.utente_id;
        v_evento_id := OLD.evento_id;
    ELSE
        v_utente_id := NEW.utente_id;
        v_evento_id := NEW.evento_id;
    END IF;

    -- Determina le informazioni dell'evento
    SELECT tipo_evento, data_inizio INTO v_tipo_evento, v_data_inizio
    FROM public.epika_eventi
    WHERE id = v_evento_id;

    -- Se è un Campo Marzio, aggiorniamo la scadenza dell'abilitazione
    IF v_tipo_evento = 'campo_marzio' AND v_data_inizio IS NOT NULL THEN
        v_anno_evento := EXTRACT(YEAR FROM v_data_inizio);

        -- Ricalcola la presenza a qualsiasi CM dell'anno per questo utente
        SELECT EXISTS (
            SELECT 1 FROM public.epika_presenze_eventi pe
            JOIN public.epika_eventi ev ON pe.evento_id = ev.id
            WHERE pe.utente_id = v_utente_id
              AND (TG_OP <> 'DELETE' OR pe.id <> OLD.id)
              AND pe.presente = TRUE
              AND ev.tipo_evento = 'campo_marzio'
              AND EXTRACT(YEAR FROM ev.data_inizio) = v_anno_evento
        ) INTO v_ha_cm;
        
        -- Calcola la nuova scadenza
        IF v_ha_cm THEN
            v_scadenza := MAKE_DATE(v_anno_evento, 12, 31);
        ELSE
            v_scadenza := MAKE_DATE(v_anno_evento, 8, 31);
        END IF;

        -- Aggiorna la tabella delle abilitazioni se esiste una richiesta per quell'anno
        UPDATE public.epika_scab_abilitazioni
        SET ha_partecipato_cm = v_ha_cm,
            data_scadenza = v_scadenza,
            updated_at = NOW()
        WHERE profilo_id = v_utente_id
          AND anno_abilitativo = v_anno_evento;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- 2. Aggancio Trigger su epika_presenze_eventi
DROP TRIGGER IF EXISTS trg_sync_abilitazioni_scadenza ON public.epika_presenze_eventi;
CREATE TRIGGER trg_sync_abilitazioni_scadenza
AFTER INSERT OR UPDATE OF presente OR DELETE ON public.epika_presenze_eventi
FOR EACH ROW
EXECUTE FUNCTION public.epika_trg_sync_scadenza_abilitazioni();

-- 3. Backfill retroattivo per allineare subito lo stato reale di tutte le abilitazioni correnti
UPDATE public.epika_scab_abilitazioni a
SET ha_partecipato_cm = (
        SELECT COALESCE(BOOL_OR(pe.presente), FALSE)
        FROM public.epika_presenze_eventi pe
        JOIN public.epika_eventi ev ON pe.evento_id = ev.id
        WHERE pe.utente_id = a.profilo_id
          AND ev.tipo_evento = 'campo_marzio'
          AND EXTRACT(YEAR FROM ev.data_inizio) = a.anno_abilitativo
    ),
    data_scadenza = CASE
        WHEN EXISTS (
            SELECT 1 FROM public.epika_presenze_eventi pe
            JOIN public.epika_eventi ev ON pe.evento_id = ev.id
            WHERE pe.utente_id = a.profilo_id
              AND pe.presente = TRUE
              AND ev.tipo_evento = 'campo_marzio'
              AND EXTRACT(YEAR FROM ev.data_inizio) = a.anno_abilitativo
        ) THEN MAKE_DATE(a.anno_abilitativo, 12, 31)
        ELSE MAKE_DATE(a.anno_abilitativo, 8, 31)
    END,
    updated_at = NOW();
