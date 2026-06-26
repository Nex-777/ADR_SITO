-- DEFINIZIONI DEI TIPI ENUM CUSTOM
-- DO NOT RUN DIRECTLY if they already exist in the database.
-- CREATE TYPE public.ruolo_utente AS ENUM (
--     'presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere',
--     'socio_approvato', 'socio_in_attesa', 'tesserato_esterno', 'minore',
--     'istruttore', 'volontario'
-- );
-- CREATE TYPE public.stato_firma AS ENUM (
--     'in_attesa_otp', 'firmato_validato', 'rifiutato'
-- );

-- 1. Tabella Utenti (Profilo web)
CREATE TABLE IF NOT EXISTS public.utenti (
    id UUID PRIMARY KEY,
    nome TEXT,
    cognome TEXT,
    codice_fiscale TEXT,
    data_nascita DATE,
    ruolo public.ruolo_utente[] DEFAULT ARRAY['socio_in_attesa'::public.ruolo_utente],
    email TEXT,
    data_creazione TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    indirizzo TEXT,
    provincia VARCHAR(2),
    comune TEXT,
    cap VARCHAR(5),
    tutore_nome TEXT,
    tutore_cognome TEXT,
    tutore_codice_fiscale TEXT,
    tutore_email TEXT,
    tipo_adesione TEXT,
    tipo_tessera TEXT,
    certificato_medico_url TEXT,
    quota_totale NUMERIC,
    luogo_nascita_provincia VARCHAR(2),
    luogo_nascita_comune TEXT,
    cellulare TEXT,
    certificato_tipologia VARCHAR(20),
    certificato_data_emissione DATE,
    avatar_url TEXT,
    emergenza_nome TEXT,
    emergenza_telefono VARCHAR(50),
    consenso_marketing BOOLEAN DEFAULT FALSE,
    consenso_audiovisivi BOOLEAN DEFAULT FALSE
);

-- 2. Tabella Atti di Adesione (Firma Elettronica OTP)
CREATE TABLE IF NOT EXISTS public.atti_adesione (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    ip_address TEXT,
    otp_codice_hash TEXT,
    stato public.stato_firma DEFAULT 'in_attesa_otp'::public.stato_firma,
    data_firma TIMESTAMP WITH TIME ZONE,
    url_pdf_generato TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tentativi_falliti INTEGER DEFAULT 0
);

-- 3. Tabella Eventi / Corsi
CREATE TABLE IF NOT EXISTS public.eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo VARCHAR(255) NOT NULL,
    descrizione TEXT,
    data_evento DATE NOT NULL,
    ora_evento TIME WITHOUT TIME ZONE,
    luogo TEXT,
    prezzo NUMERIC DEFAULT 0.00,
    stripe_price_id TEXT,
    max_partecipanti INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    piani_abbonamento JSONB,
    tipo TEXT DEFAULT 'corso',
    orari_settimanali JSONB,
    is_sportivo BOOLEAN DEFAULT TRUE
);

-- 4. Tabella Iscrizioni Eventi / Corsi
CREATE TABLE IF NOT EXISTS public.iscrizioni_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_iscrizione TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stato_pagamento VARCHAR(50) DEFAULT 'DA_PAGARE',
    codice_transazione TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    orario_libero BOOLEAN DEFAULT FALSE
);

-- 5. Tabella Rate Limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabella Registro Audit Operazioni
CREATE TABLE IF NOT EXISTS public.registro_audit_operazioni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operatore_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    azione VARCHAR(100) NOT NULL,
    tabella_target VARCHAR(100) NOT NULL,
    record_target_id TEXT,
    dettagli JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. Tabella Registro Spese
CREATE TABLE IF NOT EXISTS public.registro_spese (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo TEXT NOT NULL,
    importo NUMERIC NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    data_spesa DATE NOT NULL DEFAULT CURRENT_DATE,
    registrato_da UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. Tabella Ricevute Pagamenti
CREATE TABLE IF NOT EXISTS public.ricevute_pagamenti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_ricevuta INTEGER NOT NULL,
    anno_fiscale INTEGER NOT NULL,
    utente_id UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    importo NUMERIC NOT NULL,
    causale TEXT NOT NULL,
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    metodo_pagamento VARCHAR(50) NOT NULL,
    codice_transazione VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. Tabella Bilanci Annuali
CREATE TABLE IF NOT EXISTS public.bilanci (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anno INTEGER NOT NULL,
    titolo VARCHAR(150) NOT NULL,
    stato VARCHAR(30),
    totale_entrate NUMERIC NOT NULL,
    totale_uscite NUMERIC NOT NULL,
    avanzo_disavanzo NUMERIC NOT NULL,
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Tabella Verbali Assemblea Soci
CREATE TABLE IF NOT EXISTS public.verbali_assemblea (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_verbale VARCHAR(50) NOT NULL,
    data_assemblea DATE NOT NULL,
    delibera_testo TEXT NOT NULL,
    redatto_da UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    approvato_da UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Tabella Istruttori Eventi
CREATE TABLE IF NOT EXISTS public.istruttori_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
    istruttore_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_assegnazione TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Tabella Presenze Eventi
CREATE TABLE IF NOT EXISTS public.presenze_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_lezione DATE NOT NULL,
    presente BOOLEAN DEFAULT FALSE,
    registrato_da UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- FUNZIONI DATABASE ESPORTATE

-- check_rate_limit(p_key, p_max_requests, p_window_seconds)
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_requests integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_record RECORD;
BEGIN
    SELECT * INTO v_record FROM public.rate_limits WHERE key = p_key;
    
    IF v_record IS NULL THEN
        INSERT INTO public.rate_limits (key, count, window_start)
        VALUES (p_key, 1, NOW());
        RETURN TRUE;
    END IF;
    
    IF NOW() - v_record.window_start > (p_window_seconds || ' seconds')::interval THEN
        UPDATE public.rate_limits SET count = 1, window_start = NOW() WHERE key = p_key;
        RETURN TRUE;
    END IF;
    
    IF v_record.count >= p_max_requests THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.rate_limits SET count = count + 1 WHERE key = p_key;
    RETURN TRUE;
END;
$function$;

-- prossimo_numero_ricevuta(p_anno)
CREATE OR REPLACE FUNCTION public.prossimo_numero_ricevuta(p_anno integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    next_num INT;
BEGIN
    -- Use an advisory lock for the fiscal year to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext('ricevute_' || p_anno::text));
    
    SELECT COALESCE(MAX(numero_ricevuta), 0) + 1
    INTO next_num
    FROM public.ricevute_pagamenti
    WHERE anno_fiscale = p_anno;
    
    RETURN next_num;
END;
$function$;
