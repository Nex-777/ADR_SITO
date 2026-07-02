-- Creazione della tabella registro_istruttori
CREATE TABLE IF NOT EXISTS public.registro_istruttori (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anagrafica_id UUID REFERENCES public.anagrafiche(id) ON DELETE SET NULL,
    nome TEXT,
    cognome TEXT,
    codice_fiscale TEXT,
    data_iscrizione_csen DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Creazione della tabella registro_volontari
CREATE TABLE IF NOT EXISTS public.registro_volontari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anagrafica_id UUID REFERENCES public.anagrafiche(id) ON DELETE SET NULL,
    nome TEXT,
    cognome TEXT,
    codice_fiscale TEXT,
    data_iscrizione_csen DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.registro_istruttori ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_volontari ENABLE ROW LEVEL SECURITY;

-- Criteri di accesso (Polices) per registro_istruttori
CREATE POLICY select_registro_istruttori ON public.registro_istruttori
    FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]);

CREATE POLICY insert_registro_istruttori ON public.registro_istruttori
    FOR INSERT
    WITH CHECK (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY update_registro_istruttori ON public.registro_istruttori
    FOR UPDATE
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY delete_registro_istruttori ON public.registro_istruttori
    FOR DELETE
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

-- Criteri di accesso (Polices) per registro_volontari
CREATE POLICY select_registro_volontari ON public.registro_volontari
    FOR SELECT
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]);

CREATE POLICY insert_registro_volontari ON public.registro_volontari
    FOR INSERT
    WITH CHECK (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY update_registro_volontari ON public.registro_volontari
    FOR UPDATE
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

CREATE POLICY delete_registro_volontari ON public.registro_volontari
    FOR DELETE
    USING (public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]);

-- Seeding degli istruttori esistenti
-- Tito Fabio Paoletti (id anagrafica: f4fdd1bb-99b2-474a-b64c-3d546c2997a9)
INSERT INTO public.registro_istruttori (anagrafica_id, nome, cognome, codice_fiscale, data_iscrizione_csen)
VALUES ('f4fdd1bb-99b2-474a-b64c-3d546c2997a9', 'Tito Fabio', 'Paoletti', 'PLTTFB77B11H769H', '2026-01-01')
ON CONFLICT DO NOTHING;

-- Valerio Massimo Ciaralli (id anagrafica: 61a9d484-a03c-4717-8c4e-41a7bf31904c)
INSERT INTO public.registro_istruttori (anagrafica_id, nome, cognome, codice_fiscale, data_iscrizione_csen)
VALUES ('61a9d484-a03c-4717-8c4e-41a7bf31904c', 'Valerio massimo', 'ciaralli', 'CRLVRM85T14H769K', '2026-01-01')
ON CONFLICT DO NOTHING;

-- Valerio Mannocchi (id anagrafica: f18bca5a-f311-49fb-a4e1-109918f4c7ef)
INSERT INTO public.registro_istruttori (anagrafica_id, nome, cognome, codice_fiscale, data_iscrizione_csen)
VALUES ('f18bca5a-f311-49fb-a4e1-109918f4c7ef', 'valerio', 'mannocchi', 'MNNVLR94T31A462Z', '2026-01-01')
ON CONFLICT DO NOTHING;
