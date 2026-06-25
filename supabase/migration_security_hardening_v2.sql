-- ===========================================================================
-- MIGRAZIONE SICUREZZA: Hardening Post-Verifica (2026-06-25)
-- ===========================================================================
-- Fix CRIT-1: salva_verbale_relazionale() — aggiunge auth check
-- Fix CRIT-2: elimina_utente_fantasma() — corregge tipo scalare→array
-- Fix MED-2:  RLS verbali (riunioni_consiglio, presenze_riunione, punti_odg, votazioni_odg) — corregge IN→array overlap
-- Fix MED-3:  next_registro_number() — aggiunge auth check
-- ===========================================================================

-- ===========================
-- CRIT-1: salva_verbale_relazionale — Auth Check
-- ===========================
-- La funzione attuale non ha NESSUN controllo autorizzazione.
-- Qualsiasi utente autenticato può creare verbali e approvare/rifiutare soci.
-- Fix: Aggiungere un blocco di autorizzazione all'inizio della funzione.

CREATE OR REPLACE FUNCTION public.salva_verbale_relazionale(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_verbale_id UUID;
    v_riunione_id UUID;
    v_odg JSONB;
    v_item JSONB;
    v_presenza JSONB;
    v_votazione JSONB;
    v_approvazione JSONB;
    v_num_registro TEXT;
    v_tipo_adesione TEXT;
    v_anno_fiscale INTEGER;
BEGIN
    -- =========================================
    -- AUTH CHECK — Solo presidente, vice, segretario
    -- =========================================
    v_caller_roles := public.get_user_role(auth.uid());
    IF NOT (v_caller_roles && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]) THEN
        RAISE EXCEPTION 'Non autorizzato: ruolo insufficiente per questa operazione.';
    END IF;

    -- 1. Inserisci il verbale
    INSERT INTO public.verbali_consiglio (
        data_verbale,
        tipo_assemblea,
        luogo,
        ora_inizio,
        ora_fine,
        note,
        creato_da
    ) VALUES (
        (p_payload->>'data_verbale')::DATE,
        p_payload->>'tipo_assemblea',
        p_payload->>'luogo',
        (p_payload->>'ora_inizio')::TIME,
        (p_payload->>'ora_fine')::TIME,
        p_payload->>'note',
        auth.uid()
    ) RETURNING id INTO v_verbale_id;

    -- 2. Inserisci la riunione associata
    INSERT INTO public.riunioni_consiglio (
        verbale_id,
        data_riunione,
        tipo,
        luogo
    ) VALUES (
        v_verbale_id,
        (p_payload->>'data_verbale')::DATE,
        p_payload->>'tipo_assemblea',
        p_payload->>'luogo'
    ) RETURNING id INTO v_riunione_id;

    -- 3. Inserisci le presenze
    IF p_payload->'presenze' IS NOT NULL THEN
        FOR v_presenza IN SELECT * FROM jsonb_array_elements(p_payload->'presenze')
        LOOP
            INSERT INTO public.presenze_riunione (
                riunione_id,
                membro_id,
                presente,
                delega_a
            ) VALUES (
                v_riunione_id,
                (v_presenza->>'membro_id')::UUID,
                COALESCE((v_presenza->>'presente')::BOOLEAN, false),
                NULLIF(v_presenza->>'delega_a', '')::UUID
            );
        END LOOP;
    END IF;

    -- 4. Inserisci i punti ODG e le votazioni
    IF p_payload->'punti_odg' IS NOT NULL THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'punti_odg')
        LOOP
            DECLARE
                v_punto_id UUID;
            BEGIN
                INSERT INTO public.punti_odg (
                    riunione_id,
                    numero_punto,
                    titolo,
                    descrizione,
                    esito
                ) VALUES (
                    v_riunione_id,
                    COALESCE((v_item->>'numero_punto')::INTEGER, 1),
                    v_item->>'titolo',
                    v_item->>'descrizione',
                    v_item->>'esito'
                ) RETURNING id INTO v_punto_id;

                -- Votazioni per questo punto ODG
                IF v_item->'votazioni' IS NOT NULL THEN
                    FOR v_votazione IN SELECT * FROM jsonb_array_elements(v_item->'votazioni')
                    LOOP
                        INSERT INTO public.votazioni_odg (
                            punto_id,
                            membro_id,
                            voto
                        ) VALUES (
                            v_punto_id,
                            (v_votazione->>'membro_id')::UUID,
                            v_votazione->>'voto'
                        );
                    END LOOP;
                END IF;
            END;
        END LOOP;
    END IF;

    -- 5. Gestisci approvazioni / rifiuti soci
    IF p_payload->'approvazioni' IS NOT NULL THEN
        v_anno_fiscale := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

        FOR v_approvazione IN SELECT * FROM jsonb_array_elements(p_payload->'approvazioni')
        LOOP
            IF (v_approvazione->>'esito') = 'approvato' THEN
                -- Genera numero registro
                v_tipo_adesione := COALESCE(v_approvazione->>'tipo_adesione', 'ordinario');
                v_num_registro := public.next_registro_number(v_tipo_adesione, v_anno_fiscale);

                -- Aggiorna registro_soci
                UPDATE public.registro_soci
                SET stato = 'approvato',
                    numero_registro = v_num_registro,
                    data_approvazione = CURRENT_DATE,
                    verbale_approvazione_id = v_verbale_id
                WHERE utente_id = (v_approvazione->>'utente_id')::UUID
                  AND anno_fiscale = v_anno_fiscale;

                -- Aggiorna registro_approvazioni
                UPDATE public.registro_approvazioni
                SET stato = 'approvato',
                    data_approvazione = CURRENT_DATE,
                    numero_registro = v_num_registro,
                    verbale_id = v_verbale_id
                WHERE utente_id = (v_approvazione->>'utente_id')::UUID
                  AND anno_fiscale = v_anno_fiscale;

            ELSIF (v_approvazione->>'esito') = 'rifiutato' THEN
                UPDATE public.registro_soci
                SET stato = 'rifiutato',
                    data_approvazione = CURRENT_DATE,
                    verbale_approvazione_id = v_verbale_id,
                    motivo_rifiuto = v_approvazione->>'motivo'
                WHERE utente_id = (v_approvazione->>'utente_id')::UUID
                  AND anno_fiscale = v_anno_fiscale;

                UPDATE public.registro_approvazioni
                SET stato = 'rifiutato',
                    data_approvazione = CURRENT_DATE,
                    verbale_id = v_verbale_id,
                    motivo_rifiuto = v_approvazione->>'motivo'
                WHERE utente_id = (v_approvazione->>'utente_id')::UUID
                  AND anno_fiscale = v_anno_fiscale;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'verbale_id', v_verbale_id,
        'riunione_id', v_riunione_id
    );
END;
$$;

-- ===========================
-- CRIT-2: elimina_utente_fantasma — Fix tipo scalare→array
-- ===========================
-- Il bug: la variabile caller_role è dichiarata come scalare (ruolo_utente)
-- ma get_user_role() ritorna ruolo_utente[]. Fix: usare tipo array + ANY().

CREATE OR REPLACE FUNCTION public.elimina_utente_fantasma(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_target_email TEXT;
    v_target_created TIMESTAMPTZ;
    v_has_profile BOOLEAN;
BEGIN
    -- Verifica autorizzazione (FIX: usa array e ANY() invece di scalare e IN)
    v_caller_roles := public.get_user_role(auth.uid());
    IF NOT ('presidente' = ANY(v_caller_roles) OR 'vice_presidente' = ANY(v_caller_roles)) THEN
        RAISE EXCEPTION 'Non autorizzato: solo presidente o vice presidente possono eseguire questa operazione.';
    END IF;

    -- Verifica che l'utente target esista in auth.users
    SELECT email, created_at
    INTO v_target_email, v_target_created
    FROM auth.users
    WHERE id = p_target_user_id;

    IF v_target_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Utente non trovato.');
    END IF;

    -- Verifica se ha un profilo in utenti
    SELECT EXISTS(SELECT 1 FROM public.utenti WHERE id = p_target_user_id) INTO v_has_profile;

    -- Elimina il profilo se esiste
    IF v_has_profile THEN
        DELETE FROM public.utenti WHERE id = p_target_user_id;
    END IF;

    -- Elimina record correlati
    DELETE FROM public.atti_adesione WHERE utente_id = p_target_user_id;
    DELETE FROM public.registrazioni_incomplete WHERE user_id = p_target_user_id;

    -- Elimina da auth.users (operazione nucleare, richiede SECURITY DEFINER)
    DELETE FROM auth.users WHERE id = p_target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_email', v_target_email,
        'had_profile', v_has_profile
    );
END;
$$;


-- ===========================
-- MED-2: Fix RLS policies per tabelle verbali
-- ===========================
-- Le policy attuali usano IN(...) con get_user_role() che ritorna un array.
-- In PostgreSQL, ARRAY IN (scalar_list) non funziona → il risultato è sempre FALSE.
-- Fix: ricreare le policy usando l'operatore && (overlap) di array.

-- riunioni_consiglio
DROP POLICY IF EXISTS "select_riunioni_consiglio" ON public.riunioni_consiglio;
CREATE POLICY "select_riunioni_consiglio" ON public.riunioni_consiglio
    FOR SELECT USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario','tesoriere','consigliere']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "insert_riunioni_consiglio" ON public.riunioni_consiglio;
CREATE POLICY "insert_riunioni_consiglio" ON public.riunioni_consiglio
    FOR INSERT WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

-- presenze_riunione
DROP POLICY IF EXISTS "select_presenze_riunione" ON public.presenze_riunione;
CREATE POLICY "select_presenze_riunione" ON public.presenze_riunione
    FOR SELECT USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario','tesoriere','consigliere']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "insert_presenze_riunione" ON public.presenze_riunione;
CREATE POLICY "insert_presenze_riunione" ON public.presenze_riunione
    FOR INSERT WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

-- punti_odg
DROP POLICY IF EXISTS "select_punti_odg" ON public.punti_odg;
CREATE POLICY "select_punti_odg" ON public.punti_odg
    FOR SELECT USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario','tesoriere','consigliere']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "insert_punti_odg" ON public.punti_odg;
CREATE POLICY "insert_punti_odg" ON public.punti_odg
    FOR INSERT WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );

-- votazioni_odg
DROP POLICY IF EXISTS "select_votazioni_odg" ON public.votazioni_odg;
CREATE POLICY "select_votazioni_odg" ON public.votazioni_odg
    FOR SELECT USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario','tesoriere','consigliere']::public.ruolo_utente[]
    );

DROP POLICY IF EXISTS "insert_votazioni_odg" ON public.votazioni_odg;
CREATE POLICY "insert_votazioni_odg" ON public.votazioni_odg
    FOR INSERT WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]
    );


-- ===========================
-- MED-3: next_registro_number — Auth Check
-- ===========================
-- La funzione è SECURITY DEFINER ma non verifica l'identità del chiamante.
-- Aggiungere un check: solo ruoli board possono generare numeri registro.

CREATE OR REPLACE FUNCTION public.next_registro_number(p_tipo VARCHAR, p_anno INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_prefix TEXT;
    v_next_num INTEGER;
    v_result TEXT;
BEGIN
    -- Auth check: solo ruoli direttivo
    v_caller_roles := public.get_user_role(auth.uid());
    IF NOT (v_caller_roles && ARRAY['presidente','vice_presidente','segretario']::public.ruolo_utente[]) THEN
        RAISE EXCEPTION 'Non autorizzato: ruolo insufficiente.';
    END IF;

    -- Determina prefisso in base al tipo
    IF p_tipo = 'ordinario' THEN
        v_prefix := 'ORD';
    ELSIF p_tipo = 'sostenitore' THEN
        v_prefix := 'SOS';
    ELSIF p_tipo = 'onorario' THEN
        v_prefix := 'ONO';
    ELSE
        v_prefix := 'ORD';
    END IF;

    -- Calcola il prossimo numero sequenziale per questo tipo e anno
    SELECT COALESCE(MAX(
        CASE
            WHEN numero_registro LIKE v_prefix || '-' || p_anno::TEXT || '-%'
            THEN NULLIF(split_part(numero_registro, '-', 3), '')::INTEGER
            ELSE 0
        END
    ), 0) + 1
    INTO v_next_num
    FROM public.registro_approvazioni
    WHERE anno_fiscale = p_anno;

    v_result := v_prefix || '-' || p_anno::TEXT || '-' || LPAD(v_next_num::TEXT, 4, '0');

    RETURN v_result;
END;
$$;

-- Assicura che i permessi siano corretti
GRANT EXECUTE ON FUNCTION public.salva_verbale_relazionale(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salva_verbale_relazionale(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.elimina_utente_fantasma(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.elimina_utente_fantasma(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_registro_number(VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_registro_number(VARCHAR, INTEGER) TO service_role;
