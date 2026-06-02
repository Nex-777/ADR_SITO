-- Migration: Registro Approvazioni & Ristrutturazione
-- Questo script consolida tutte le modifiche per la gestione gapless
-- e lo staging delle richieste (v1.00.20)

-- 1. Tabella registro_approvazioni
CREATE TABLE IF NOT EXISTS public.registro_approvazioni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anagrafica_id UUID NOT NULL REFERENCES public.anagrafiche(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('SOCIO', 'TESSERATO', 'SOCIO_TESSERATO')),
    stato VARCHAR(30) NOT NULL DEFAULT 'IN_ATTESA' 
        CHECK (stato IN ('IN_ATTESA', 'APPROVATO', 'RESPINTO')),
    livello_copertura VARCHAR(20) CHECK (livello_copertura IN ('BASE', 'INTEGRATIVA_A', 'INTEGRATIVA_B')),
    data_richiesta DATE NOT NULL DEFAULT CURRENT_DATE,
    data_decisione DATE,
    numero_verbale VARCHAR(50),
    motivo_rifiuto TEXT,
    deciso_da UUID REFERENCES public.utenti(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS unique_approvazione_pendente 
    ON public.registro_approvazioni(anagrafica_id, tipo) 
    WHERE stato = 'IN_ATTESA';

-- RLS
ALTER TABLE public.registro_approvazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_all_approvazioni ON public.registro_approvazioni
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.utenti
            WHERE id = auth.uid() AND ruolo IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere')
        )
    );

CREATE POLICY user_read_own_approvazioni ON public.registro_approvazioni
    FOR SELECT
    USING (
        anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid())
    );

-- 2. Alter Tables per numero_registro
ALTER TABLE public.registro_soci ADD COLUMN IF NOT EXISTS numero_registro VARCHAR(20);
ALTER TABLE public.registro_tesserati ADD COLUMN IF NOT EXISTS numero_registro VARCHAR(20);

-- 3. Funzione next_registro_number
CREATE OR REPLACE FUNCTION next_registro_number(p_tipo VARCHAR, p_anno INTEGER)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_max INTEGER;
    v_next INTEGER;
BEGIN
    v_prefix := CASE p_tipo WHEN 'SOCIO' THEN 'S' WHEN 'TESSERATO' THEN 'T' END;
    
    IF p_tipo = 'SOCIO' THEN
        SELECT COALESCE(MAX(
            CAST(SPLIT_PART(SPLIT_PART(numero_registro, '-', 2), '/', 1) AS INTEGER)
        ), 0) INTO v_max
        FROM public.registro_soci 
        WHERE numero_registro LIKE v_prefix || '-%/' || p_anno;
    ELSE
        SELECT COALESCE(MAX(
            CAST(SPLIT_PART(SPLIT_PART(numero_registro, '-', 2), '/', 1) AS INTEGER)
        ), 0) INTO v_max
        FROM public.registro_tesserati
        WHERE numero_registro LIKE v_prefix || '-%/' || p_anno;
    END IF;
    
    v_next := v_max + 1;
    RETURN v_prefix || '-' || v_next || '/' || p_anno;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Funzione approva_tesserato
CREATE OR REPLACE FUNCTION public.approva_tesserato(
    p_anagrafica_id UUID,
    p_deciso_da UUID
)
RETURNS void AS $$
DECLARE
    v_num_reg VARCHAR(20);
    v_copertura VARCHAR(20);
    v_tipo VARCHAR(20);
BEGIN
    -- Trova la richiesta pendente
    SELECT livello_copertura, tipo INTO v_copertura, v_tipo
    FROM public.registro_approvazioni
    WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA' 
      AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO');
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nessuna richiesta di tesseramento pendente per questa anagrafica';
    END IF;

    -- Genera numero progressivo
    v_num_reg := next_registro_number('TESSERATO', CAST(EXTRACT(YEAR FROM CURRENT_DATE) AS INTEGER));

    -- Inserisci in registro_tesserati
    INSERT INTO public.registro_tesserati (
        anagrafica_id, 
        stato_tesseramento, 
        data_richiesta_tesseramento,
        livello_copertura,
        numero_registro
    ) VALUES (
        p_anagrafica_id,
        'ATTIVO',
        CURRENT_DATE,
        v_copertura,
        v_num_reg
    );

    -- Aggiorna registro_approvazioni
    UPDATE public.registro_approvazioni
    SET stato = 'APPROVATO', 
        data_decisione = CURRENT_DATE,
        deciso_da = p_deciso_da
    WHERE anagrafica_id = p_anagrafica_id AND stato = 'IN_ATTESA' 
      AND (tipo = 'TESSERATO' OR tipo = 'SOCIO_TESSERATO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Funzione sync_utente_to_normalized_tables (Aggiornata per usare registro_approvazioni)
CREATE OR REPLACE FUNCTION public.sync_utente_to_normalized_tables()
RETURNS TRIGGER AS $$
DECLARE
    v_anagrafica_id UUID;
    v_adesione VARCHAR;
    v_tipo_tessera VARCHAR;
    v_csen_coverage VARCHAR := 'BASE';
    v_tipo_approvazione VARCHAR;
BEGIN
    -- Se non è un aggiornamento dallo step anagrafica, salta
    IF NEW.step_registrazione = 'anagrafica' AND OLD.step_registrazione = 'tipo_adesione' THEN
        -- 1. Inserisci Anagrafica (Upsert)
        INSERT INTO public.anagrafiche (
            utente_id, nome, cognome, codice_fiscale, data_nascita, 
            comune_nascita, provincia_nascita, sesso
        ) VALUES (
            NEW.id, NEW.nome, NEW.cognome, NEW.codice_fiscale, NEW.data_nascita,
            NEW.comune_nascita, NEW.provincia_nascita, NEW.sesso
        )
        ON CONFLICT (codice_fiscale) DO UPDATE SET
            nome = EXCLUDED.nome,
            cognome = EXCLUDED.cognome,
            codice_fiscale = EXCLUDED.codice_fiscale,
            data_nascita = EXCLUDED.data_nascita,
            comune_nascita = EXCLUDED.comune_nascita,
            provincia_nascita = EXCLUDED.provincia_nascita,
            sesso = EXCLUDED.sesso
        RETURNING id INTO v_anagrafica_id;

        -- 2. Inserisci Indirizzo
        INSERT INTO public.indirizzi_residenza (
            anagrafica_id, via_piazza, civico, comune, provincia, cap
        ) VALUES (
            v_anagrafica_id, NEW.via_piazza, NEW.civico, NEW.comune_residenza, NEW.provincia_residenza, NEW.cap
        ) ON CONFLICT (anagrafica_id) DO UPDATE SET
            via_piazza = EXCLUDED.via_piazza,
            civico = EXCLUDED.civico,
            comune = EXCLUDED.comune,
            provincia = EXCLUDED.provincia,
            cap = EXCLUDED.cap;

        -- 3. Inserisci Contatto
        INSERT INTO public.contatti (
            anagrafica_id, telefono, email
        ) VALUES (
            v_anagrafica_id, NEW.telefono, NEW.email
        ) ON CONFLICT (anagrafica_id) DO UPDATE SET
            telefono = EXCLUDED.telefono,
            email = EXCLUDED.email;

        -- 4. Leggi preferenze adesione
        SELECT NULLIF(CAST(raw_user_meta_data->>'tipo_adesione' AS VARCHAR), ''),
               NULLIF(CAST(raw_user_meta_data->>'tipo_tessera' AS VARCHAR), '')
        INTO v_adesione, v_tipo_tessera
        FROM auth.users WHERE id = NEW.id;

        IF v_tipo_tessera = 'tessera_integrativa_a' THEN v_csen_coverage := 'INTEGRATIVA_A';
        ELSIF v_tipo_tessera = 'tessera_integrativa_b' THEN v_csen_coverage := 'INTEGRATIVA_B';
        END IF;

        IF v_adesione = 'socio' THEN
            v_tipo_approvazione := 'SOCIO';
            v_csen_coverage := NULL;
        ELSIF v_adesione = 'tesserato' THEN
            v_tipo_approvazione := 'TESSERATO';
        ELSIF v_adesione = 'socio_tesserato' THEN
            v_tipo_approvazione := 'SOCIO_TESSERATO';
        END IF;

        IF v_tipo_approvazione IS NOT NULL THEN
            INSERT INTO public.registro_approvazioni (
                anagrafica_id, tipo, stato, livello_copertura
            ) VALUES (
                v_anagrafica_id, v_tipo_approvazione, 'IN_ATTESA', v_csen_coverage
            ) ON CONFLICT (anagrafica_id, tipo) WHERE stato = 'IN_ATTESA' DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
