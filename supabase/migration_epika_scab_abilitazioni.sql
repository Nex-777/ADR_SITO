-- ===========================================================================
-- MIGRAZIONE EPIKA: Abilitazioni al Combattimento SCAB
-- ===========================================================================

-- 1. Tabella Abilitazioni
CREATE TABLE IF NOT EXISTS public.epika_scab_abilitazioni (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profilo_id            UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
    anno_abilitativo      INT NOT NULL,
    -- Soggetti coinvolti (risolti automaticamente al momento della richiesta)
    allenatore_opzione_id BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL,
    allievo_opzione_id    BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL,
    validatore_opzione_id BIGINT REFERENCES public.epika_opzioni(id) ON DELETE SET NULL,
    -- Stato gestito dall'Allenatore (solo lui tramite RPC)
    stato_allenatore TEXT NOT NULL DEFAULT 'in_attesa'
        CHECK (stato_allenatore IN ('in_attesa','in_valutazione','video_fatto','video_in_valutazione')),
    -- Semaforo gestito dal Validatore (solo lui tramite RPC)
    stato_validatore TEXT NOT NULL DEFAULT 'giallo'
        CHECK (stato_validatore IN ('giallo','rosso','verde')),
    -- Note (opzionali)
    note_allenatore       TEXT,
    note_validatore       TEXT,
    -- Scadenza
    ha_partecipato_cm     BOOLEAN NOT NULL DEFAULT FALSE,
    data_scadenza         DATE NOT NULL,
    -- Audit
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_profilo_anno_abil UNIQUE (profilo_id, anno_abilitativo)
);

-- Indice per velocizzare le query per profilo e anno
CREATE INDEX IF NOT EXISTS idx_epika_scab_abil_profilo_anno 
ON public.epika_scab_abilitazioni(profilo_id, anno_abilitativo);

-- 2. Trigger updated_at
DROP TRIGGER IF EXISTS trg_scab_abilitazioni_updated_at ON public.epika_scab_abilitazioni;
CREATE TRIGGER trg_scab_abilitazioni_updated_at
BEFORE UPDATE ON public.epika_scab_abilitazioni
FOR EACH ROW EXECUTE FUNCTION public.epika_set_updated_at();

-- 3. RLS
ALTER TABLE public.epika_scab_abilitazioni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_scab_abilitazioni ON public.epika_scab_abilitazioni;
CREATE POLICY select_scab_abilitazioni ON public.epika_scab_abilitazioni
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4. RPC crea_richiesta_abilitazione
CREATE OR REPLACE FUNCTION public.crea_richiesta_abilitazione(
    p_anno INT,
    p_soggetto_opzione_id BIGINT -- Può essere allenatore O allievo allenatore
)
RETURNS public.epika_scab_abilitazioni
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_profilo_id UUID := auth.uid();
    v_tipo TEXT;
    v_allenatore_id BIGINT;
    v_allievo_id BIGINT;
    v_validatore_id BIGINT;
    v_ha_cm BOOLEAN;
    v_scadenza DATE;
    v_result public.epika_scab_abilitazioni;
BEGIN
    IF v_profilo_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- Recupera tipo del soggetto scelto
    SELECT tipo INTO v_tipo FROM public.epika_opzioni WHERE id = p_soggetto_opzione_id AND attivo = TRUE;
    IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'Soggetto non trovato o non attivo: %', p_soggetto_opzione_id;
    END IF;

    -- Risolvi gerarchicamente allenatore, allievo e validatore
    IF v_tipo = 'allenatore' THEN
        v_allenatore_id := p_soggetto_opzione_id;
        v_allievo_id := NULL;
        SELECT validatore_id INTO v_validatore_id
        FROM public.epika_scab_abbinamenti
        WHERE allenatore_ref_id = v_allenatore_id OR allenatori_co_ids @> ARRAY[v_allenatore_id]
        LIMIT 1;
    ELSIF v_tipo = 'scab_allievo_allenatore' THEN
        v_allievo_id := p_soggetto_opzione_id;
        SELECT allenatore_ref_id, validatore_id INTO v_allenatore_id, v_validatore_id
        FROM public.epika_scab_abbinamenti
        WHERE allievo_ref_id = v_allievo_id OR allievi_ids @> ARRAY[v_allievo_id]
        LIMIT 1;
    ELSE
        RAISE EXCEPTION 'Tipo soggetto non valido per abilitazione: %', v_tipo;
    END IF;

    -- Controlla presenza a Campo Marzio nell'anno specificato
    SELECT EXISTS (
        SELECT 1 FROM public.epika_presenze_eventi pe
        JOIN public.epika_eventi ev ON pe.evento_id = ev.id
        WHERE pe.utente_id = v_profilo_id
          AND pe.presente = TRUE
          AND ev.tipo_evento = 'campo_marzio'
          AND EXTRACT(YEAR FROM ev.data_evento) = p_anno
    ) INTO v_ha_cm;

    -- Calcola scadenza
    IF v_ha_cm THEN
        v_scadenza := (p_anno || '-12-31')::DATE;
    ELSE
        v_scadenza := (p_anno || '-08-31')::DATE;
    END IF;

    -- Inserisci o aggiorna (permette riconferma allenatore)
    INSERT INTO public.epika_scab_abilitazioni (
        profilo_id, anno_abilitativo,
        allenatore_opzione_id, allievo_opzione_id, validatore_opzione_id,
        stato_allenatore, stato_validatore,
        ha_partecipato_cm, data_scadenza
    ) VALUES (
        v_profilo_id, p_anno,
        v_allenatore_id, v_allievo_id, v_validatore_id,
        'in_attesa', 'giallo',
        v_ha_cm, v_scadenza
    )
    ON CONFLICT (profilo_id, anno_abilitativo) DO UPDATE SET
        allenatore_opzione_id = EXCLUDED.allenatore_opzione_id,
        allievo_opzione_id    = EXCLUDED.allievo_opzione_id,
        validatore_opzione_id = EXCLUDED.validatore_opzione_id,
        stato_allenatore      = 'in_attesa',
        stato_validatore      = 'giallo',
        ha_partecipato_cm     = EXCLUDED.ha_partecipato_cm,
        data_scadenza         = EXCLUDED.data_scadenza,
        updated_at            = NOW()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.crea_richiesta_abilitazione(INT, BIGINT) TO authenticated;

-- 5. RPC aggiorna_stato_allenatore
CREATE OR REPLACE FUNCTION public.aggiorna_stato_allenatore(
    p_abilitazione_id BIGINT,
    p_nuovo_stato TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_allenatore_opzione_id BIGINT;
    v_caller_opzione_id BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- Valida nuovo stato
    IF p_nuovo_stato NOT IN ('in_attesa','in_valutazione','video_fatto','video_in_valutazione') THEN
        RAISE EXCEPTION 'Stato allenatore non valido: %', p_nuovo_stato;
    END IF;

    -- Trova l'allenatore_opzione_id del record da modificare
    SELECT allenatore_opzione_id INTO v_allenatore_opzione_id
    FROM public.epika_scab_abilitazioni WHERE id = p_abilitazione_id;

    -- Trova l'ID opzione del chiamante
    SELECT id INTO v_caller_opzione_id
    FROM public.epika_opzioni
    WHERE utente_id = auth.uid() AND tipo = 'allenatore'
    LIMIT 1;

    -- Autorizzazione: il chiamante deve essere l'allenatore del record o co-allenatore
    IF v_caller_opzione_id IS NULL OR v_caller_opzione_id <> v_allenatore_opzione_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.epika_scab_abbinamenti
            WHERE (allenatore_ref_id = v_caller_opzione_id OR allenatori_co_ids @> ARRAY[v_caller_opzione_id])
              AND (allenatore_ref_id = v_allenatore_opzione_id OR allenatori_co_ids @> ARRAY[v_allenatore_opzione_id])
        ) THEN
            RAISE EXCEPTION 'Non autorizzato: non sei l allenatore di questa richiesta.';
        END IF;
    END IF;

    UPDATE public.epika_scab_abilitazioni
    SET stato_allenatore = p_nuovo_stato,
        note_allenatore  = COALESCE(p_note, note_allenatore),
        updated_at       = NOW()
    WHERE id = p_abilitazione_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aggiorna_stato_allenatore(BIGINT, TEXT, TEXT) TO authenticated;

-- 6. RPC aggiorna_stato_validatore
CREATE OR REPLACE FUNCTION public.aggiorna_stato_validatore(
    p_abilitazione_id BIGINT,
    p_nuovo_stato TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_validatore_opzione_id BIGINT;
    v_caller_opzione_id BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- Valida nuovo stato
    IF p_nuovo_stato NOT IN ('giallo','rosso','verde') THEN
        RAISE EXCEPTION 'Stato validatore non valido: %', p_nuovo_stato;
    END IF;

    -- Trova il validatore_opzione_id del record
    SELECT validatore_opzione_id INTO v_validatore_opzione_id
    FROM public.epika_scab_abilitazioni WHERE id = p_abilitazione_id;

    -- Trova l'ID opzione del chiamante
    SELECT id INTO v_caller_opzione_id
    FROM public.epika_opzioni
    WHERE utente_id = auth.uid() AND tipo = 'scab_validatore'
    LIMIT 1;

    -- Autorizzazione: il chiamante deve essere il validatore del record
    IF v_caller_opzione_id IS NULL OR v_caller_opzione_id <> v_validatore_opzione_id THEN
        RAISE EXCEPTION 'Non autorizzato: non sei il validatore di questa richiesta.';
    END IF;

    UPDATE public.epika_scab_abilitazioni
    SET stato_validatore = p_nuovo_stato,
        note_validatore  = COALESCE(p_note, note_validatore),
        updated_at       = NOW()
    WHERE id = p_abilitazione_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aggiorna_stato_validatore(BIGINT, TEXT, TEXT) TO authenticated;
