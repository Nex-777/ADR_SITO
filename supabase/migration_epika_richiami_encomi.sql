-- ===========================================================================
-- MIGRAZIONE EPIKA: Registro Richiami ed Encomi (v3.0)
-- ===========================================================================

-- 1. Funzioni Helper SECURITY DEFINER per RLS stateless e anti-ricorsione

CREATE OR REPLACE FUNCTION public.is_direttivo_epika(p_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.epika_profili p
        WHERE p.id = p_uid
          AND (
            p.is_admin_epika = TRUE
            OR (p.gruppo_lavoro_ids IS NOT NULL AND p.gruppo_lavoro_ids @> ARRAY[1::bigint])
          )
    ) OR EXISTS (
        SELECT 1 FROM public.utenti u
        WHERE u.id = p_uid
          AND Array['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente] && u.ruolo
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_capogruppo_of(p_uid UUID, p_atleta_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF p_uid IS NULL OR p_atleta_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.epika_profili p
        JOIN public.epika_gruppi_storici g ON g.id = p.gruppo_storico_id
        WHERE p.id = p_atleta_id
          AND (g.capogruppo_id = p_uid OR g.vice_capogruppo_id = p_uid)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_coach_of(p_uid UUID, p_atleta_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_atleta_allenatore_id BIGINT;
    v_caller_opz_ids BIGINT[];
BEGIN
    IF p_uid IS NULL OR p_atleta_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Opzioni SCAB associate all'utente chiamante (allenatore, allievo, validatore)
    SELECT ARRAY_AGG(id) INTO v_caller_opz_ids
    FROM public.epika_opzioni
    WHERE utente_id = p_uid AND tipo IN ('allenatore', 'scab_allievo_allenatore', 'scab_validatore');

    IF v_caller_opz_ids IS NULL OR CARDINALITY(v_caller_opz_ids) = 0 THEN
        RETURN FALSE;
    END IF;

    -- 1. Controllo abilitazioni esistenti (se presente)
    IF EXISTS (
        SELECT 1 FROM public.epika_scab_abilitazioni
        WHERE profilo_id = p_atleta_id
          AND (
            allenatore_opzione_id = ANY(v_caller_opz_ids)
            OR allievo_opzione_id = ANY(v_caller_opz_ids)
            OR validatore_opzione_id = ANY(v_caller_opz_ids)
          )
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Controllo profilo diretto dell'atleta
    SELECT allenatore_id INTO v_atleta_allenatore_id
    FROM public.epika_profili
    WHERE id = p_atleta_id;

    IF v_atleta_allenatore_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Se l'atleta ha selezionato direttamente il chiamante come coach
    IF v_atleta_allenatore_id = ANY(v_caller_opz_ids) THEN
        RETURN TRUE;
    END IF;

    -- 3. Controllo gerarchia SCAB tramite abbinamenti
    IF EXISTS (
        SELECT 1 FROM public.epika_scab_abbinamenti a
        WHERE (
            -- Il chiamante è allenatore referente o co-allenatore
            (a.allenatore_ref_id = ANY(v_caller_opz_ids) OR a.allenatori_co_ids && v_caller_opz_ids)
            AND (
                a.allievo_ref_id = v_atleta_allenatore_id
                OR a.allievi_ids @> ARRAY[v_atleta_allenatore_id::text]
            )
        )
        OR (
            -- Il chiamante è validatore
            a.validatore_id = ANY(v_caller_opz_ids)
            AND (
                a.allenatore_ref_id = v_atleta_allenatore_id
                OR a.allenatori_co_ids && ARRAY[v_atleta_allenatore_id]
                OR a.allievo_ref_id = v_atleta_allenatore_id
                OR a.allievi_ids @> ARRAY[v_atleta_allenatore_id::text]
            )
        )
        OR (
            -- Il chiamante è allievo allenatore collegato alla stessa struttura dell'allenatore dell'atleta
            (
                a.allievo_ref_id = ANY(v_caller_opz_ids)
                OR a.allievi_ids && (SELECT ARRAY_AGG(x::text) FROM UNNEST(v_caller_opz_ids) AS x)
            )
            AND (
                a.allenatore_ref_id = v_atleta_allenatore_id
                OR a.allenatori_co_ids && ARRAY[v_atleta_allenatore_id]
            )
        )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- 2. Tabella Principale

CREATE TABLE IF NOT EXISTS public.epika_richiami_encomi (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atleta_id             UUID NOT NULL REFERENCES public.epika_profili(id) ON DELETE CASCADE,
    autore_id             UUID REFERENCES public.epika_profili(id) ON DELETE SET NULL,
    evento_id             UUID REFERENCES public.epika_eventi(id) ON DELETE SET NULL,
    tipo                  TEXT NOT NULL CHECK (tipo IN ('richiamo', 'encomio')),
    categoria             TEXT NOT NULL CHECK (categoria IN (
                            'disciplinare',
                            'comportamentale',
                            'tecnico_sicurezza',
                            'ritardo_assenza',
                            'violazione_regolamento',
                            'valore_in_battaglia',
                            'fair_play',
                            'spirito_gruppo',
                            'merito_organizzativo',
                            'onore_al_campo'
                          )),
    gravita               TEXT NOT NULL CHECK (gravita IN (
                            'lieve',
                            'medio',
                            'grave',
                            'nota_merito',
                            'solenne',
                            'onorifico'
                          )),
    motivazione           TEXT NOT NULL,
    note_interne_direttivo TEXT,
    data_assegnazione     DATE NOT NULL DEFAULT CURRENT_DATE,
    attivo                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Trigger updated_at
DROP TRIGGER IF EXISTS trg_epika_richiami_encomi_updated_at ON public.epika_richiami_encomi;
CREATE TRIGGER trg_epika_richiami_encomi_updated_at
BEFORE UPDATE ON public.epika_richiami_encomi
FOR EACH ROW EXECUTE FUNCTION public.epika_set_updated_at();

-- 4. Indici
CREATE INDEX IF NOT EXISTS idx_epika_re_atleta ON public.epika_richiami_encomi(atleta_id, attivo);
CREATE INDEX IF NOT EXISTS idx_epika_re_evento ON public.epika_richiami_encomi(evento_id);
CREATE INDEX IF NOT EXISTS idx_epika_re_tipo_data ON public.epika_richiami_encomi(tipo, data_assegnazione DESC);

-- 5. Row Level Security (RLS)
ALTER TABLE public.epika_richiami_encomi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_richiami_encomi ON public.epika_richiami_encomi;
CREATE POLICY select_richiami_encomi ON public.epika_richiami_encomi
    FOR SELECT USING (
        atleta_id = auth.uid()
        OR public.is_direttivo_epika(auth.uid())
        OR public.is_capogruppo_of(auth.uid(), atleta_id)
        OR public.is_coach_of(auth.uid(), atleta_id)
    );

DROP POLICY IF EXISTS insert_richiami_encomi ON public.epika_richiami_encomi;
CREATE POLICY insert_richiami_encomi ON public.epika_richiami_encomi
    FOR INSERT WITH CHECK (
        public.is_direttivo_epika(auth.uid())
    );

DROP POLICY IF EXISTS update_richiami_encomi ON public.epika_richiami_encomi;
CREATE POLICY update_richiami_encomi ON public.epika_richiami_encomi
    FOR UPDATE USING (
        public.is_direttivo_epika(auth.uid())
    ) WITH CHECK (
        public.is_direttivo_epika(auth.uid())
    );

GRANT SELECT, INSERT, UPDATE ON public.epika_richiami_encomi TO authenticated;
