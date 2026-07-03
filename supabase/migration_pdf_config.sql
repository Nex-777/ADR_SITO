-- Creazione tabella per le configurazioni dinamiche dei moduli PDF
CREATE TABLE IF NOT EXISTS public.configurazioni_pdf (
    id SERIAL PRIMARY KEY,
    modulo VARCHAR(50) NOT NULL,
    campo VARCHAR(50) NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    font_size INTEGER NOT NULL DEFAULT 10,
    pagina INTEGER NOT NULL DEFAULT 0,
    UNIQUE (modulo, campo)
);

-- Abilita RLS
ALTER TABLE public.configurazioni_pdf ENABLE ROW LEVEL SECURITY;

-- Policy di lettura per tutti gli utenti autenticati
DROP POLICY IF EXISTS "Lettura configurazioni pdf consentita a tutti" ON public.configurazioni_pdf;
CREATE POLICY "Lettura configurazioni pdf consentita a tutti" ON public.configurazioni_pdf
    FOR SELECT TO authenticated USING (true);

-- Policy di modifica consentita solo al direttivo
DROP POLICY IF EXISTS "Modifica configurazioni pdf consentita al direttivo" ON public.configurazioni_pdf;
CREATE POLICY "Modifica configurazioni pdf consentita al direttivo" ON public.configurazioni_pdf
    FOR ALL TO authenticated
    USING (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere']::public.ruolo_utente[]
    )
    WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere']::public.ruolo_utente[]
    );

-- Inserimento coordinate iniziali stimate per Informativa
INSERT INTO public.configurazioni_pdf (modulo, campo, x, y, font_size, pagina) VALUES
('informativa', 'nome_cognome', 100, 715, 10, 0),
('informativa', 'codice_fiscale', 100, 705, 10, 0),
('informativa', 'nascita', 250, 705, 10, 0),
('informativa', 'firma', 130, 246, 7, 0)
ON CONFLICT (modulo, campo) DO UPDATE SET
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    font_size = EXCLUDED.font_size,
    pagina = EXCLUDED.pagina;

-- Inserimento coordinate iniziali stimate per Iscrizione
INSERT INTO public.configurazioni_pdf (modulo, campo, x, y, font_size, pagina) VALUES
('iscrizione', 'cognome', 100, 735, 10, 0),
('iscrizione', 'nome', 320, 735, 10, 0),
('iscrizione', 'nato_a', 100, 710, 10, 0),
('iscrizione', 'prov_nascita', 345, 710, 10, 0),
('iscrizione', 'data_nascita', 415, 710, 10, 0),
('iscrizione', 'residente_via', 100, 685, 10, 0),
('iscrizione', 'civico', 450, 685, 10, 0),
('iscrizione', 'comune', 100, 660, 10, 0),
('iscrizione', 'provincia', 450, 660, 10, 0),
('iscrizione', 'cap', 100, 635, 10, 0),
('iscrizione', 'telefono', 100, 610, 10, 0),
('iscrizione', 'cellulare', 320, 610, 10, 0),
('iscrizione', 'email', 100, 585, 10, 0),
('iscrizione', 'firma_1', 370, 130, 7, 0),
('iscrizione', 'firma_2', 370, 195, 7, 1)
ON CONFLICT (modulo, campo) DO UPDATE SET
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    font_size = EXCLUDED.font_size,
    pagina = EXCLUDED.pagina;
