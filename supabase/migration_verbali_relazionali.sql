-- SQL Migration: Relational Board Minutes Lifecycle and Member Book Integration (with Rejections)

-- Add column motivo_rifiuto if not exists
ALTER TABLE public.registro_soci ADD COLUMN IF NOT EXISTS motivo_rifiuto TEXT;

-- 1. Create Riunioni Consiglio table
CREATE TABLE IF NOT EXISTS public.riunioni_consiglio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_verbale VARCHAR(50) NOT NULL UNIQUE REFERENCES public.verbali_consiglio(numero_verbale) ON UPDATE CASCADE ON DELETE CASCADE,
    data_riunione DATE NOT NULL,
    ora_inizio TIME NOT NULL,
    ora_fine TIME,
    luogo TEXT,
    tipo VARCHAR(20) CHECK (tipo IN ('ORDINARIA', 'STRAORDINARIA')) DEFAULT 'ORDINARIA',
    data_convocazione DATE,
    mezzo_convocazione VARCHAR(50),
    id_presidente UUID REFERENCES public.utenti(id),
    id_segretario UUID REFERENCES public.utenti(id),
    quorum_costitutivo BOOLEAN,
    presenti_conteggio INTEGER,
    totale_membri_conteggio INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Presenze Riunione table
CREATE TABLE IF NOT EXISTS public.presenze_riunione (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    riunione_id UUID NOT NULL REFERENCES public.riunioni_consiglio(id) ON DELETE CASCADE,
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    presenza VARCHAR(30) CHECK (presenza IN ('PRESENTE', 'ASSENTE_GIUSTIFICATO', 'ASSENTE_INGIUSTIFICATO')),
    UNIQUE (riunione_id, utente_id)
);

-- 3. Create Punti ODG table
CREATE TABLE IF NOT EXISTS public.punti_odg (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    riunione_id UUID NOT NULL REFERENCES public.riunioni_consiglio(id) ON DELETE CASCADE,
    ordine INTEGER NOT NULL,
    titolo TEXT NOT NULL,
    discussione TEXT,
    delibera_tipo VARCHAR(30) CHECK (delibera_tipo IN ('APPROVAZIONE_NUOVI_SOCI', 'ALTRO', 'VARIE_E_EVENTUALI')) DEFAULT 'ALTRO',
    delibera_testo TEXT,
    UNIQUE (riunione_id, ordine)
);

-- 4. Create Votazioni ODG table
CREATE TABLE IF NOT EXISTS public.votazioni_odg (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_odg_id UUID NOT NULL REFERENCES public.punti_odg(id) ON DELETE CASCADE UNIQUE,
    favorevoli INTEGER NOT NULL DEFAULT 0,
    contrari INTEGER NOT NULL DEFAULT 0,
    astenuti INTEGER NOT NULL DEFAULT 0,
    esito VARCHAR(20) CHECK (esito IN ('APPROVATO', 'RESPINTO', 'NON_DELIBERATO')) DEFAULT 'NON_DELIBERATO'
);

-- Enable RLS on new tables
ALTER TABLE public.riunioni_consiglio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presenze_riunione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punti_odg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votazioni_odg ENABLE ROW LEVEL SECURITY;

-- Setup basic RLS Policies (Read access for all CD roles, Write for Presidente, Vice Presidente, Segretario)
CREATE OR REPLACE FUNCTION public.dummy_rls_verbali() RETURNS void AS $$
BEGIN
    DROP POLICY IF EXISTS select_consiglio_riunioni ON public.riunioni_consiglio;
    DROP POLICY IF EXISTS all_admin_riunioni ON public.riunioni_consiglio;
    DROP POLICY IF EXISTS select_consiglio_presenze ON public.presenze_riunione;
    DROP POLICY IF EXISTS all_admin_presenze ON public.presenze_riunione;
    DROP POLICY IF EXISTS select_consiglio_punti ON public.punti_odg;
    DROP POLICY IF EXISTS all_admin_punti ON public.punti_odg;
    DROP POLICY IF EXISTS select_consiglio_votazioni ON public.votazioni_odg;
    DROP POLICY IF EXISTS all_admin_votazioni ON public.votazioni_odg;
END;
$$ LANGUAGE plpgsql;
SELECT public.dummy_rls_verbali();
DROP FUNCTION public.dummy_rls_verbali();

CREATE POLICY select_consiglio_riunioni ON public.riunioni_consiglio FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'));

CREATE POLICY all_admin_riunioni ON public.riunioni_consiglio FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario'));

CREATE POLICY select_consiglio_presenze ON public.presenze_riunione FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'));

CREATE POLICY all_admin_presenze ON public.presenze_riunione FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario'));

CREATE POLICY select_consiglio_punti ON public.punti_odg FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'));

CREATE POLICY all_admin_punti ON public.punti_odg FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario'));

CREATE POLICY select_consiglio_votazioni ON public.votazioni_odg FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'));

CREATE POLICY all_admin_votazioni ON public.votazioni_odg FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario'));


-- 5. Stored Procedure for atomic transaction
CREATE OR REPLACE FUNCTION public.salva_verbale_relazionale(
    p_numero_verbale VARCHAR,
    p_data_riunione DATE,
    p_ora_inizio TIME,
    p_ora_fine TIME,
    p_luogo TEXT,
    p_tipo VARCHAR,
    p_data_convocazione DATE,
    p_mezzo_convocazione VARCHAR,
    p_id_presidente UUID,
    p_id_segretario UUID,
    p_quorum_costitutivo BOOLEAN,
    p_presenti_conteggio INTEGER,
    p_totale_membri_conteggio INTEGER,
    p_delibera_testo_completo TEXT,
    p_presenze JSONB,
    p_punti JSONB,
    p_soci_da_approvare UUID[],
    p_soci_da_respingere JSONB
) RETURNS UUID AS $$
DECLARE
    v_verbale_id UUID;
    v_riunione_id UUID;
    v_pres_record JSONB;
    v_punto_record JSONB;
    v_new_punto_id UUID;
    v_socio_anagrafica_id UUID;
    v_socio_utente_id UUID;
    v_rifiuto_record JSONB;
BEGIN
    -- Step A: Insert or Update verbali_consiglio (for retro-compatibility with current UI views)
    INSERT INTO public.verbali_consiglio (numero_verbale, data_riunione, delibera_testo, redatto_da, approvato_da)
    VALUES (p_numero_verbale, p_data_riunione, p_delibera_testo_completo, p_id_segretario, p_id_presidente)
    ON CONFLICT (numero_verbale) DO UPDATE
    SET data_riunione = EXCLUDED.data_riunione,
        delibera_testo = EXCLUDED.delibera_testo,
        redatto_da = EXCLUDED.redatto_da,
        approvato_da = EXCLUDED.approvato_da
    RETURNING id INTO v_verbale_id;

    -- Step B: Insert or Update riunioni_consiglio
    INSERT INTO public.riunioni_consiglio (
        numero_verbale, data_riunione, ora_inizio, ora_fine, luogo, tipo,
        data_convocazione, mezzo_convocazione, id_presidente, id_segretario,
        quorum_costitutivo, presenti_conteggio, totale_membri_conteggio
    )
    VALUES (
        p_numero_verbale, p_data_riunione, p_ora_inizio, p_ora_fine, p_luogo, p_tipo,
        p_data_convocazione, p_mezzo_convocazione, p_id_presidente, p_id_segretario,
        p_quorum_costitutivo, p_presenti_conteggio, p_totale_membri_conteggio
    )
    ON CONFLICT (numero_verbale) DO UPDATE
    SET data_riunione = EXCLUDED.data_riunione,
        ora_inizio = EXCLUDED.ora_inizio,
        ora_fine = EXCLUDED.ora_fine,
        luogo = EXCLUDED.luogo,
        tipo = EXCLUDED.tipo,
        data_convocazione = EXCLUDED.data_convocazione,
        mezzo_convocazione = EXCLUDED.mezzo_convocazione,
        id_presidente = EXCLUDED.id_presidente,
        id_segretario = EXCLUDED.id_segretario,
        quorum_costitutivo = EXCLUDED.quorum_costitutivo,
        presenti_conteggio = EXCLUDED.presenti_conteggio,
        totale_membri_conteggio = EXCLUDED.totale_membri_conteggio
    RETURNING id INTO v_riunione_id;

    -- Step C: Clear and insert presenze
    DELETE FROM public.presenze_riunione WHERE riunione_id = v_riunione_id;
    FOR v_pres_record IN SELECT * FROM jsonb_array_elements(p_presenze) LOOP
        INSERT INTO public.presenze_riunione (riunione_id, utente_id, presenza)
        VALUES (v_riunione_id, (v_pres_record->>'utente_id')::UUID, v_pres_record->>'presenza');
    END LOOP;

    -- Step D: Clear and insert punti_odg & votazioni
    DELETE FROM public.punti_odg WHERE riunione_id = v_riunione_id;
    FOR v_punto_record IN SELECT * FROM jsonb_array_elements(p_punti) LOOP
        INSERT INTO public.punti_odg (riunione_id, ordine, titolo, discussione, delibera_tipo, delibera_testo)
        VALUES (
            v_riunione_id,
            (v_punto_record->>'ordine')::INTEGER,
            v_punto_record->>'titolo',
            v_punto_record->>'discussione',
            v_punto_record->>'delibera_tipo',
            v_punto_record->>'delibera_testo'
        )
        RETURNING id INTO v_new_punto_id;

        IF v_punto_record ? 'votazione' THEN
            INSERT INTO public.votazioni_odg (punto_odg_id, favorevoli, contrari, astenuti, esito)
            VALUES (
                v_new_punto_id,
                (v_punto_record->'votazione'->>'favorevoli')::INTEGER,
                (v_punto_record->'votazione'->>'contrari')::INTEGER,
                (v_punto_record->'votazione'->>'astenuti')::INTEGER,
                v_punto_record->'votazione'->>'esito'
            );
        END IF;
    END LOOP;

    -- Step E: ATOMIC MEMBER BOOK INTEGRATION - APPROVALS
    IF p_soci_da_approvare IS NOT NULL AND array_length(p_soci_da_approvare, 1) > 0 THEN
        FOREACH v_socio_anagrafica_id IN ARRAY p_soci_da_approvare LOOP
            -- Genera numero registro
            DECLARE
                v_num_reg VARCHAR(20) := next_registro_number('SOCIO', CAST(EXTRACT(YEAR FROM p_data_riunione) AS INTEGER));
            BEGIN
                -- Inserisci in registro_soci
                INSERT INTO public.registro_soci (
                    anagrafica_id, 
                    stato_socio, 
                    data_delibera_direttivo,
                    numero_verbale,
                    numero_registro
                ) VALUES (
                    v_socio_anagrafica_id,
                    'ATTIVO',
                    p_data_riunione,
                    p_numero_verbale,
                    v_num_reg
                );

                -- Aggiorna registro_approvazioni
                UPDATE public.registro_approvazioni
                SET stato = 'APPROVATO',
                    data_decisione = p_data_riunione,
                    numero_verbale = p_numero_verbale,
                    deciso_da = p_id_presidente
                WHERE anagrafica_id = v_socio_anagrafica_id AND stato = 'IN_ATTESA' 
                  AND (tipo = 'SOCIO' OR tipo = 'SOCIO_TESSERATO');
            END;
        END LOOP;
    END IF;

    -- Step F: ATOMIC MEMBER BOOK INTEGRATION - REJECTIONS
    IF p_soci_da_respingere IS NOT NULL AND jsonb_array_length(p_soci_da_respingere) > 0 THEN
        FOR v_rifiuto_record IN SELECT * FROM jsonb_array_elements(p_soci_da_respingere) LOOP
            v_socio_anagrafica_id := (v_rifiuto_record->>'anagrafica_id')::UUID;
            
            -- Aggiorna registro_approvazioni
            UPDATE public.registro_approvazioni
            SET stato = 'RESPINTO',
                data_decisione = p_data_riunione,
                numero_verbale = p_numero_verbale,
                deciso_da = p_id_presidente,
                motivo_rifiuto = v_rifiuto_record->>'motivo'
            WHERE anagrafica_id = v_socio_anagrafica_id AND stato = 'IN_ATTESA' 
              AND (tipo = 'SOCIO' OR tipo = 'SOCIO_TESSERATO');
        END LOOP;
    END IF;

    RETURN v_riunione_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
