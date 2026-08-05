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
    v_existing_id BIGINT;
    v_old_stato_a TEXT;
    v_old_stato_v TEXT;
    v_result public.epika_scab_abilitazioni;
BEGIN
    IF v_profilo_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- 1. Risolvi gerarchicamente i soggetti
    SELECT tipo INTO v_tipo FROM public.epika_opzioni WHERE id = p_soggetto_opzione_id AND attivo = TRUE;
    IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'Soggetto non trovato o non attivo: %', p_soggetto_opzione_id;
    END IF;

    IF v_tipo = 'allenatore' THEN
        v_allenatore_id := p_soggetto_opzione_id;
        v_allievo_id := NULL;
        SELECT validatore_id INTO v_validatore_id
        FROM public.epika_scab_abbinamenti
        WHERE (allenatore_ref_id = v_allenatore_id OR allenatori_co_ids @> ARRAY[v_allenatore_id])
          AND validatore_id IS NOT NULL
        ORDER BY id ASC
        LIMIT 1;
    ELSIF v_tipo = 'scab_allievo_allenatore' THEN
        v_allievo_id := p_soggetto_opzione_id;
        SELECT allenatore_ref_id, validatore_id INTO v_allenatore_id, v_validatore_id
        FROM public.epika_scab_abbinamenti
        WHERE (allievo_ref_id = v_allievo_id OR allievi_ids @> ARRAY[v_allievo_id])
          AND validatore_id IS NOT NULL
        ORDER BY id ASC
        LIMIT 1;
    ELSE
        RAISE EXCEPTION 'Tipo soggetto non valido per abilitazione: %', v_tipo;
    END IF;

    -- 1.5. Sincronizzazione Scheda Personaggio e Trigger Audit Log (epika_registro_modifiche_profilo)
    UPDATE public.epika_profili
    SET allenatore_id = v_allenatore_id,
        updated_at = NOW()
    WHERE id = v_profilo_id
      AND (allenatore_id IS NULL OR allenatore_id IS DISTINCT FROM v_allenatore_id);

    -- 2. Prevenzione sovrascrittura distruttiva (Regola EPIKA Storicizzazione)
    SELECT id, stato_allenatore, stato_validatore INTO v_existing_id, v_old_stato_a, v_old_stato_v
    FROM public.epika_scab_abilitazioni
    WHERE profilo_id = v_profilo_id AND anno_abilitativo = p_anno;

    IF v_existing_id IS NOT NULL THEN
        IF v_old_stato_a != 'in_attesa' OR v_old_stato_v != 'giallo' THEN
            RAISE EXCEPTION 'Impossibile modificare: esiste già una richiesta per l''anno % in fase di valutazione avanzata (stato: %, %).', p_anno, v_old_stato_a, v_old_stato_v;
        END IF;
    END IF;

    -- 3. Controlla presenza a Campo Marzio (Ottimizzato SARGable)
    SELECT EXISTS (
        SELECT 1 FROM public.epika_presenze_eventi pe
        JOIN public.epika_eventi ev ON pe.evento_id = ev.id
        WHERE pe.utente_id = v_profilo_id
          AND pe.presente = TRUE
          AND ev.tipo_evento = 'campo_marzio'
          AND ev.data_inizio >= MAKE_DATE(p_anno, 1, 1)
          AND ev.data_inizio <= MAKE_DATE(p_anno, 12, 31)
    ) INTO v_ha_cm;

    -- 4. Calcola scadenza
    IF v_ha_cm THEN
        v_scadenza := MAKE_DATE(p_anno, 12, 31);
    ELSE
        v_scadenza := MAKE_DATE(p_anno, 8, 31);
    END IF;

    -- 5. Inserisci o Aggiorna (solo se in attesa)
    IF v_existing_id IS NOT NULL THEN
        UPDATE public.epika_scab_abilitazioni
        SET allenatore_opzione_id = v_allenatore_id,
            allievo_opzione_id = v_allievo_id,
            validatore_opzione_id = v_validatore_id,
            ha_partecipato_cm = v_ha_cm,
            data_scadenza = v_scadenza,
            updated_at = NOW()
        WHERE id = v_existing_id
        RETURNING * INTO v_result;
    ELSE
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
        ) RETURNING * INTO v_result;
    END IF;

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
    v_stato_validatore      TEXT;
    v_caller_opzione_id     BIGINT;
    v_is_admin              BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- Controlla se il chiamante è Admin Epika o Presidente
    SELECT EXISTS (
        SELECT 1 FROM public.epika_profili
        WHERE id = auth.uid() AND is_admin_epika = TRUE
    ) OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    INTO v_is_admin;

    -- 1. Valida nuovo stato
    IF p_nuovo_stato NOT IN ('in_attesa','in_valutazione','video_fatto','video_in_valutazione') THEN
        RAISE EXCEPTION 'Stato allenatore non valido: %', p_nuovo_stato;
    END IF;

    -- 2. Recupera allenatore assegnato e stato validatore corrente in una sola query
    SELECT allenatore_opzione_id, stato_validatore
    INTO v_allenatore_opzione_id, v_stato_validatore
    FROM public.epika_scab_abilitazioni
    WHERE id = p_abilitazione_id;

    IF v_allenatore_opzione_id IS NULL THEN
        RAISE EXCEPTION 'Richiesta di abilitazione non trovata: %', p_abilitazione_id;
    END IF;

    -- 3. VINCOLO: Ciclo chiuso se validatore ha approvato con VERDE
    IF v_stato_validatore = 'verde' THEN
        RAISE EXCEPTION 'Impossibile modificare: il ciclo di abilitazione è chiuso (approvazione validatore presente).';
    END IF;

    -- 4. Autorizzazione: verifica che il chiamante sia l allenatore, co-allenatore OPPURE un ADMIN
    IF NOT v_is_admin THEN
        SELECT id INTO v_caller_opzione_id
        FROM public.epika_opzioni
        WHERE utente_id = auth.uid() AND tipo = 'allenatore'
        LIMIT 1;

        IF v_caller_opzione_id IS NULL OR v_caller_opzione_id <> v_allenatore_opzione_id THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.epika_scab_abbinamenti
                WHERE (allenatore_ref_id = v_caller_opzione_id OR allenatori_co_ids @> ARRAY[v_caller_opzione_id])
                  AND (allenatore_ref_id = v_allenatore_opzione_id OR allenatori_co_ids @> ARRAY[v_allenatore_opzione_id])
            ) THEN
                RAISE EXCEPTION 'Non autorizzato: non sei l allenatore di questa richiesta.';
            END IF;
        END IF;
    END IF;

    -- 5. Aggiornamento stato con eventuale auto-reset del semaforo validatore
    --    Se l allenatore torna a VIDEO_FATTO dopo una risposta ROSSO del validatore,
    --    il semaforo validatore torna a GIALLO per permettere una nuova valutazione.
    UPDATE public.epika_scab_abilitazioni
    SET stato_allenatore  = p_nuovo_stato,
        note_allenatore   = COALESCE(p_note, note_allenatore),
        stato_validatore  = CASE
                                WHEN p_nuovo_stato = 'video_fatto' AND v_stato_validatore = 'rosso'
                                THEN 'giallo'
                                ELSE stato_validatore
                            END,
        updated_at        = NOW()
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
    v_rec_id                BIGINT;
    v_validatore_opzione_id BIGINT;
    v_allenatore_opzione_id BIGINT;
    v_stato_validatore_cur  TEXT;
    v_stato_allenatore      TEXT;
    v_caller_opzione_id     BIGINT;
    v_is_admin              BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- Controlla se il chiamante è Admin Epika o Presidente
    SELECT EXISTS (
        SELECT 1 FROM public.epika_profili
        WHERE id = auth.uid() AND is_admin_epika = TRUE
    ) OR 'presidente' = ANY(public.get_user_role(auth.uid()))
    INTO v_is_admin;

    -- 1. Valida nuovo stato
    IF p_nuovo_stato NOT IN ('giallo','rosso','verde') THEN
        RAISE EXCEPTION 'Stato validatore non valido: %', p_nuovo_stato;
    END IF;

    -- 2. Recupera record esplicito per id
    SELECT id, validatore_opzione_id, allenatore_opzione_id, stato_validatore, stato_allenatore
    INTO v_rec_id, v_validatore_opzione_id, v_allenatore_opzione_id, v_stato_validatore_cur, v_stato_allenatore
    FROM public.epika_scab_abilitazioni
    WHERE id = p_abilitazione_id;

    IF v_rec_id IS NULL THEN
        RAISE EXCEPTION 'Richiesta di abilitazione % non trovata nel sistema.', p_abilitazione_id;
    END IF;

    -- 3. Auto-healing se validatore_opzione_id è NULL
    IF v_validatore_opzione_id IS NULL THEN
        SELECT validatore_id INTO v_validatore_opzione_id
        FROM public.epika_scab_abbinamenti
        WHERE (allenatore_ref_id = v_allenatore_opzione_id OR allenatori_co_ids @> ARRAY[v_allenatore_opzione_id])
          AND validatore_id IS NOT NULL
        ORDER BY id ASC
        LIMIT 1;

        IF v_validatore_opzione_id IS NOT NULL THEN
            UPDATE public.epika_scab_abilitazioni
            SET validatore_opzione_id = v_validatore_opzione_id
            WHERE id = p_abilitazione_id;
        ELSE
            RAISE EXCEPTION 'Impossibile determinare un validatore di riferimento per questa richiesta.';
        END IF;
    END IF;

    -- 4. Autorizzazione: il chiamante deve essere il validatore del record OPPURE un ADMIN
    IF NOT v_is_admin THEN
        SELECT id INTO v_caller_opzione_id
        FROM public.epika_opzioni
        WHERE utente_id = auth.uid() AND tipo = 'scab_validatore'
        LIMIT 1;

        IF v_caller_opzione_id IS NULL OR v_validatore_opzione_id IS NULL OR v_caller_opzione_id <> v_validatore_opzione_id THEN
            RAISE EXCEPTION 'Non autorizzato: non sei il validatore designato per questa richiesta.';
        END IF;
    END IF;

    -- 5. VINCOLO DI FLUSSO: Il validatore può agire SOLO in due casi:
    --    A) lo stato allenatore è 'video_in_valutazione' (flusso normale)
    --    B) lo stato validatore corrente è 'verde' (il validatore sta togliendo la propria approvazione)
    IF v_stato_allenatore != 'video_in_valutazione' AND v_stato_validatore_cur != 'verde' THEN
        RAISE EXCEPTION 'Impossibile modificare il semaforo: l allenatore non ha ancora inviato il video in valutazione.';
    END IF;

    -- 6. Aggiornamento stato con eventuale auto-reset dello stato allenatore
    --    Se il validatore imposta ROSSO, lo stato allenatore torna a IN_VALUTAZIONE
    --    per permettere all allenatore di ricominciare il ciclo di preparazione.
    UPDATE public.epika_scab_abilitazioni
    SET stato_validatore  = p_nuovo_stato,
        note_validatore   = COALESCE(p_note, note_validatore),
        stato_allenatore  = CASE
                                WHEN p_nuovo_stato = 'rosso'
                                THEN 'in_valutazione'
                                ELSE stato_allenatore
                            END,
        updated_at        = NOW()
    WHERE id = p_abilitazione_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aggiorna_stato_validatore(BIGINT, TEXT, TEXT) TO authenticated;

-- 7. Stored Procedure per Sanatoria Massiva Abilitazioni Combattenti
CREATE OR REPLACE FUNCTION public.inizializza_abilitazioni_mancanti(p_anno INT DEFAULT 2026)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    r RECORD;
    v_count INT := 0;
    v_allenatore_id BIGINT;
    v_allievo_id BIGINT;
    v_validatore_id BIGINT;
    v_ha_cm BOOLEAN;
    v_scadenza DATE;
    v_tipo TEXT;
    v_existing_id BIGINT;
    v_existing_allenatore_id BIGINT;
BEGIN
    FOR r IN 
        SELECT p.id AS profilo_id, p.allenatore_id
        FROM public.epika_profili p
        WHERE p.ruolo_combattimento = 'combattente'
          AND p.allenatore_id IS NOT NULL
    LOOP
        -- Controlla se ha già una richiesta per quest'anno
        SELECT id, allenatore_opzione_id INTO v_existing_id, v_existing_allenatore_id
        FROM public.epika_scab_abilitazioni
        WHERE profilo_id = r.profilo_id AND anno_abilitativo = p_anno;

        SELECT tipo INTO v_tipo FROM public.epika_opzioni WHERE id = r.allenatore_id AND attivo = TRUE;
        
        IF v_tipo = 'allenatore' THEN
            v_allenatore_id := r.allenatore_id;
            v_allievo_id := NULL;
            SELECT validatore_id INTO v_validatore_id
            FROM public.epika_scab_abbinamenti
            WHERE (allenatore_ref_id = v_allenatore_id OR allenatori_co_ids @> ARRAY[v_allenatore_id])
              AND validatore_id IS NOT NULL
            ORDER BY id ASC LIMIT 1;
        ELSIF v_tipo = 'scab_allievo_allenatore' THEN
            v_allievo_id := r.allenatore_id;
            SELECT allenatore_ref_id, validatore_id INTO v_allenatore_id, v_validatore_id
            FROM public.epika_scab_abbinamenti
            WHERE (allievo_ref_id = v_allievo_id OR allievi_ids @> ARRAY[v_allievo_id])
              AND validatore_id IS NOT NULL
            ORDER BY id ASC LIMIT 1;
        ELSE
            CONTINUE;
        END IF;

        -- Controlla presenza a Campo Marzio
        SELECT EXISTS (
            SELECT 1 FROM public.epika_presenze_eventi pe
            JOIN public.epika_eventi ev ON pe.evento_id = ev.id
            WHERE pe.utente_id = r.profilo_id
              AND pe.presente = TRUE
              AND ev.tipo_evento = 'campo_marzio'
              AND ev.data_inizio >= MAKE_DATE(p_anno, 1, 1)
              AND ev.data_inizio <= MAKE_DATE(p_anno, 12, 31)
        ) INTO v_ha_cm;

        IF v_ha_cm THEN
            v_scadenza := MAKE_DATE(p_anno, 12, 31);
        ELSE
            v_scadenza := MAKE_DATE(p_anno, 8, 31);
        END IF;

        IF v_existing_id IS NULL THEN
            -- Inserisci nuova richiesta
            INSERT INTO public.epika_scab_abilitazioni (
                profilo_id, anno_abilitativo,
                allenatore_opzione_id, allievo_opzione_id, validatore_opzione_id,
                stato_allenatore, stato_validatore,
                ha_partecipato_cm, data_scadenza
            ) VALUES (
                r.profilo_id, p_anno,
                v_allenatore_id, v_allievo_id, v_validatore_id,
                'in_attesa', 'giallo',
                v_ha_cm, v_scadenza
            );
            v_count := v_count + 1;
        ELSIF v_existing_allenatore_id IS DISTINCT FROM v_allenatore_id THEN
            -- Se l'allenatore era diverso, forza l'aggiornamento a quello scelto in iscrizione
            UPDATE public.epika_scab_abilitazioni
            SET allenatore_opzione_id = v_allenatore_id,
                allievo_opzione_id = v_allievo_id,
                validatore_opzione_id = v_validatore_id,
                updated_at = NOW()
            WHERE id = v_existing_id;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.inizializza_abilitazioni_mancanti(INT) TO authenticated;
