-- ============================================================================
-- MIGRATION: Safeguarding D.Lgs. 36/2021 & 39/2021 - Nomine Pubbliche
-- Nessun dato di segnalazione/whistleblowing viene mai salvato su DB.
-- Questa tabella gestisce esclusivamente la nomina pubblica del Responsabile
-- Safeguarding (storicizzata secondo le regole EPIKA) e i testi deliberati.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.safeguarding_nomine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_responsabile TEXT NOT NULL,
    cognome_responsabile TEXT NOT NULL,
    email_contatto TEXT NOT NULL,
    qualifica TEXT NOT NULL DEFAULT 'Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer)',
    numero_verbale TEXT,
    data_nomina DATE NOT NULL DEFAULT CURRENT_DATE,
    data_scadenza DATE,
    presidente_verbalizzante TEXT,
    segretario_verbalizzante TEXT,
    testo_mocas_custom TEXT,
    testo_codice_custom TEXT,
    testo_verbale_custom TEXT,
    attivo BOOLEAN NOT NULL DEFAULT true,
    data_fine_incarico DATE,
    creato_da UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantisce al massimo una nomina attiva per volta (storicizzazione append-only)
CREATE UNIQUE INDEX IF NOT EXISTS safeguarding_nomine_one_active_idx
    ON public.safeguarding_nomine (attivo)
    WHERE (attivo = true);

-- Abilita Row Level Security (SECURITY.md § 2.1)
ALTER TABLE public.safeguarding_nomine ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica consentita esclusivamente per la nomina attualmente attiva
DROP POLICY IF EXISTS select_active_safeguarding_public ON public.safeguarding_nomine;
CREATE POLICY select_active_safeguarding_public
    ON public.safeguarding_nomine
    FOR SELECT
    TO anon, authenticated
    USING (attivo = true);

-- Lettura dello storico completo consentita esclusivamente a Presidente e Vice Presidente
DROP POLICY IF EXISTS select_all_safeguarding_presidenza ON public.safeguarding_nomine;
CREATE POLICY select_all_safeguarding_presidenza
    ON public.safeguarding_nomine
    FOR SELECT
    TO authenticated
    USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    );

GRANT SELECT ON public.safeguarding_nomine TO anon, authenticated;

-- RPC transazionale per salvare/aggiornare o storicizzare una nuova nomina Safeguarding
CREATE OR REPLACE FUNCTION public.salva_nomina_safeguarding(
    p_nome TEXT,
    p_cognome TEXT,
    p_email TEXT,
    p_qualifica TEXT DEFAULT 'Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer)',
    p_numero_verbale TEXT DEFAULT NULL,
    p_data_nomina DATE DEFAULT CURRENT_DATE,
    p_data_scadenza DATE DEFAULT NULL,
    p_presidente_verbalizzante TEXT DEFAULT NULL,
    p_segretario_verbalizzante TEXT DEFAULT NULL,
    p_testo_mocas_custom TEXT DEFAULT NULL,
    p_testo_codice_custom TEXT DEFAULT NULL,
    p_testo_verbale_custom TEXT DEFAULT NULL,
    p_nuova_nomina BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_active_id UUID;
    v_result_id UUID;
    v_nome TEXT;
    v_cognome TEXT;
    v_email TEXT;
    v_qualifica TEXT;
BEGIN
    -- Verifica autorizzazione (SECURITY.md § 2.3)
    v_caller_roles := public.get_user_role(auth.uid());
    IF v_caller_roles IS NULL OR NOT (
        v_caller_roles && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    ) THEN
        RAISE EXCEPTION 'Accesso non autorizzato: solo Presidente o Vice Presidente possono gestire la nomina Safeguarding.';
    END IF;

    v_nome := NULLIF(BTRIM(p_nome), '');
    v_cognome := NULLIF(BTRIM(p_cognome), '');
    v_email := LOWER(NULLIF(BTRIM(p_email), ''));
    v_qualifica := COALESCE(NULLIF(BTRIM(p_qualifica), ''), 'Responsabile contro abusi, violenze e discriminazioni (Safeguarding Officer)');

    IF v_nome IS NULL OR v_cognome IS NULL OR v_email IS NULL THEN
        RAISE EXCEPTION 'Nome, cognome ed email di contatto del Responsabile Safeguarding sono obbligatori.';
    END IF;

    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Indirizzo email non valido.';
    END IF;

    SELECT id INTO v_active_id
    FROM public.safeguarding_nomine
    WHERE attivo = true
    LIMIT 1
    FOR UPDATE;

    IF p_nuova_nomina OR v_active_id IS NULL THEN
        IF v_active_id IS NOT NULL THEN
            UPDATE public.safeguarding_nomine
            SET attivo = false,
                data_fine_incarico = COALESCE(data_fine_incarico, CURRENT_DATE),
                updated_at = now()
            WHERE id = v_active_id;
        END IF;

        INSERT INTO public.safeguarding_nomine (
            nome_responsabile,
            cognome_responsabile,
            email_contatto,
            qualifica,
            numero_verbale,
            data_nomina,
            data_scadenza,
            presidente_verbalizzante,
            segretario_verbalizzante,
            testo_mocas_custom,
            testo_codice_custom,
            testo_verbale_custom,
            attivo,
            creato_da
        )
        VALUES (
            v_nome,
            v_cognome,
            v_email,
            v_qualifica,
            NULLIF(BTRIM(p_numero_verbale), ''),
            COALESCE(p_data_nomina, CURRENT_DATE),
            p_data_scadenza,
            NULLIF(BTRIM(p_presidente_verbalizzante), ''),
            NULLIF(BTRIM(p_segretario_verbalizzante), ''),
            NULLIF(BTRIM(p_testo_mocas_custom), ''),
            NULLIF(BTRIM(p_testo_codice_custom), ''),
            NULLIF(BTRIM(p_testo_verbale_custom), ''),
            true,
            auth.uid()
        )
        RETURNING id INTO v_result_id;
    ELSE
        UPDATE public.safeguarding_nomine
        SET nome_responsabile = v_nome,
            cognome_responsabile = v_cognome,
            email_contatto = v_email,
            qualifica = v_qualifica,
            numero_verbale = NULLIF(BTRIM(p_numero_verbale), ''),
            data_nomina = COALESCE(p_data_nomina, CURRENT_DATE),
            data_scadenza = p_data_scadenza,
            presidente_verbalizzante = NULLIF(BTRIM(p_presidente_verbalizzante), ''),
            segretario_verbalizzante = NULLIF(BTRIM(p_segretario_verbalizzante), ''),
            testo_mocas_custom = NULLIF(BTRIM(p_testo_mocas_custom), ''),
            testo_codice_custom = NULLIF(BTRIM(p_testo_codice_custom), ''),
            testo_verbale_custom = NULLIF(BTRIM(p_testo_verbale_custom), ''),
            updated_at = now()
        WHERE id = v_active_id
        RETURNING id INTO v_result_id;
    END IF;

    RETURN v_result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salva_nomina_safeguarding(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salva_nomina_safeguarding(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
