-- 1. Tabella Anagrafica Centrale (Identità Unica)
CREATE TABLE IF NOT EXISTS public.anagrafiche (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID REFERENCES public.utenti(id) ON DELETE SET NULL, -- Associazione opzionale all'account web utente
    cognome VARCHAR(100) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    codice_fiscale CHAR(16) NOT NULL UNIQUE,
    sesso CHAR(1) CHECK (sesso IN ('M', 'F')),
    data_nascita DATE NOT NULL,
    stato_nascita VARCHAR(100) DEFAULT 'Italia',
    provincia_nascita CHAR(2) NOT NULL,
    comune_nascita VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabella Indirizzi Standardizzati ISTAT
CREATE TABLE IF NOT EXISTS public.indirizzi_residenza (
    anagrafica_id UUID PRIMARY KEY REFERENCES public.anagrafiche(id) ON DELETE CASCADE,
    via_piazza TEXT NOT NULL,
    civico VARCHAR(10) NOT NULL,
    provincia CHAR(2) NOT NULL,
    comune VARCHAR(100) NOT NULL,
    cap CHAR(5) NOT NULL
);

-- 3. Tabella Contatti Obbligatori
CREATE TABLE IF NOT EXISTS public.contatti (
    anagrafica_id UUID PRIMARY KEY REFERENCES public.anagrafiche(id) ON DELETE CASCADE,
    telefono VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$')
);

-- 4. Registro Storico Soci (Governance ETS)
CREATE TABLE IF NOT EXISTS public.registro_soci (
    id_socio SERIAL PRIMARY KEY,
    anagrafica_id UUID NOT NULL REFERENCES public.anagrafiche(id) ON DELETE CASCADE,
    stato_socio VARCHAR(30) CHECK (stato_socio IN ('IN_ATTESA_DELIBERA', 'ATTIVO', 'DECADUTO', 'RESPINTO')),
    data_domanda DATE NOT NULL DEFAULT CURRENT_DATE,
    data_delibera_direttivo DATE,
    numero_verbale VARCHAR(50),
    quota_scadenza DATE NOT NULL DEFAULT '2026-12-31'
);

-- 5. Registro Tesserati Sportivi (Conformità RASD / D.Lgs. 36/2021)
CREATE TABLE IF NOT EXISTS public.registro_tesserati (
    id_tesserato SERIAL PRIMARY KEY,
    anagrafica_id UUID NOT NULL REFERENCES public.anagrafiche(id) ON DELETE CASCADE,
    numero_tessera_csen VARCHAR(50),
    data_richiesta_tesseramento DATE NOT NULL DEFAULT CURRENT_DATE,
    stato_tesseramento VARCHAR(30) CHECK (stato_tesseramento IN ('IN_ELABORAZIONE', 'ATTIVO', 'SCADUTO', 'SOSPESO')),
    livello_copertura VARCHAR(20) CHECK (livello_copertura IN ('BASE', 'INTEGRATIVA_A', 'INTEGRATIVA_B'))
);

-- 6. Tabella Certificati Medici (Blocco di Sicurezza RASD)
CREATE TABLE IF NOT EXISTS public.certificati_medici (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anagrafica_id UUID NOT NULL REFERENCES public.anagrafiche(id) ON DELETE CASCADE,
    tipologia VARCHAR(20) CHECK (tipologia IN ('AGONISTICO', 'NON_AGONISTICO')),
    medico_rilascio TEXT NOT NULL,
    data_rilascio DATE NOT NULL,
    data_scadenza DATE NOT NULL,
    file_url TEXT NOT NULL
);

-- 7. Tabella Verbali del Consiglio Direttivo
CREATE TABLE IF NOT EXISTS public.verbali_consiglio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_verbale VARCHAR(50) NOT NULL UNIQUE,
    data_riunione DATE NOT NULL,
    delibera_testo TEXT NOT NULL,
    redatto_da UUID REFERENCES public.utenti(id), -- Segretario o chi per lui
    approvato_da UUID REFERENCES public.utenti(id), -- Presidente o VP
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) e Policy per la gestione multiruolo a cascata
ALTER TABLE public.anagrafiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indirizzi_residenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_soci ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_tesserati ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificati_medici ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verbali_consiglio ENABLE ROW LEVEL SECURITY;

-- Helper function per determinare il ruolo dell'utente loggato
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.ruolo_utente AS $$
    SELECT ruolo FROM public.utenti WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Policy di Lettura: Tutti i membri del consiglio (Presidente, VP, Segretario, Tesoriere, Consigliere) possono leggere tutto
CREATE POLICY select_consiglio_anagrafiche ON public.anagrafiche FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere') OR utente_id = auth.uid());

CREATE POLICY select_consiglio_indirizzi ON public.indirizzi_residenza FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere') OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_contatti ON public.contatti FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere') OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_registro_soci ON public.registro_soci FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere') OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_registro_tesserati ON public.registro_tesserati FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere') OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_certificati ON public.certificati_medici FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere') OR anagrafica_id IN (SELECT id FROM public.anagrafiche WHERE utente_id = auth.uid()));

CREATE POLICY select_consiglio_verbali ON public.verbali_consiglio FOR SELECT
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere'));

-- Policy di Scrittura/Modifica:
-- Presidente e Vicepresidente possono inserire/modificare/eliminare su tutto
CREATE POLICY all_admin_anagrafiche ON public.anagrafiche FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

CREATE POLICY all_admin_indirizzi ON public.indirizzi_residenza FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

CREATE POLICY all_admin_contatti ON public.contatti FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

CREATE POLICY all_admin_registro_soci ON public.registro_soci FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

CREATE POLICY all_admin_registro_tesserati ON public.registro_tesserati FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

CREATE POLICY all_admin_certificati ON public.certificati_medici FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

CREATE POLICY all_admin_verbali ON public.verbali_consiglio FOR ALL
    USING (public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente'));

-- Segretario: Può gestire (inserire/aggiornare) le anagrafiche, contatti, indirizzi e redigere verbali
CREATE POLICY segretario_manage_anagrafiche ON public.anagrafiche FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'segretario');
CREATE POLICY segretario_update_anagrafiche ON public.anagrafiche FOR UPDATE USING (public.get_user_role(auth.uid()) = 'segretario');

CREATE POLICY segretario_manage_indirizzi ON public.indirizzi_residenza FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'segretario');
CREATE POLICY segretario_update_indirizzi ON public.indirizzi_residenza FOR UPDATE USING (public.get_user_role(auth.uid()) = 'segretario');

CREATE POLICY segretario_manage_contatti ON public.contatti FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'segretario');
CREATE POLICY segretario_update_contatti ON public.contatti FOR UPDATE USING (public.get_user_role(auth.uid()) = 'segretario');

CREATE POLICY segretario_manage_verbali ON public.verbali_consiglio FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'segretario');
CREATE POLICY segretario_update_verbali ON public.verbali_consiglio FOR UPDATE USING (public.get_user_role(auth.uid()) = 'segretario');

-- Tesoriere: Può gestire (aggiornare) lo stato dei pagamenti/quote sociali
CREATE POLICY tesoriere_update_soci ON public.registro_soci FOR UPDATE USING (public.get_user_role(auth.uid()) = 'tesoriere');
CREATE POLICY tesoriere_update_tesserati ON public.registro_tesserati FOR UPDATE USING (public.get_user_role(auth.uid()) = 'tesoriere');

-- Inserimento anagrafica durante la registrazione (utente anonimo/autenticato registra se stesso o figlio)
CREATE POLICY self_insert_anagrafica ON public.anagrafiche FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY self_insert_indirizzo ON public.indirizzi_residenza FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY self_insert_contatto ON public.contatti FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY self_insert_socio ON public.registro_soci FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY self_insert_tesserato ON public.registro_tesserati FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY self_insert_certificato ON public.certificati_medici FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
