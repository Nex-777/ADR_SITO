-- Migrazione Codice Accesso Palestra
-- 1. Aggiunta colonna codice_accesso su public.utenti
ALTER TABLE public.utenti ADD COLUMN IF NOT EXISTS codice_accesso VARCHAR(20) DEFAULT NULL;

-- 2. Vincolo di unicità su codice_accesso
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'utenti_codice_accesso_unique'
    ) THEN
        ALTER TABLE public.utenti ADD CONSTRAINT utenti_codice_accesso_unique UNIQUE (codice_accesso);
    END IF;
END $$;

-- 3. Seed dati da Allegato 2
UPDATE public.utenti SET codice_accesso = '925403' WHERE id = 'c9658daf-9bd4-4916-ba34-b4799459f529'; -- Cellini Nazzareno
UPDATE public.utenti SET codice_accesso = '993922' WHERE id = 'c4c6cda6-2d47-4e50-b495-a4ec75f1d62e'; -- Roberto Capponi
UPDATE public.utenti SET codice_accesso = '922968' WHERE id = '5520e346-8b9a-467a-a661-c7bda84754e0'; -- Danilo Clementi
UPDATE public.utenti SET codice_accesso = '192743' WHERE id = 'f0ffecea-1401-4226-9bf9-1bfde3a233ae'; -- Eleonora Filipponi
UPDATE public.utenti SET codice_accesso = '111810' WHERE id = '792e9437-1ed2-4c57-a1b6-8bbcb9531b95'; -- Andrea Flaiani
UPDATE public.utenti SET codice_accesso = '545358' WHERE id = '5b1fecf4-cb28-4e1b-ac59-161cbb5f2c7b'; -- Franklin Maswi (Franky)
UPDATE public.utenti SET codice_accesso = '610008' WHERE id = '25f3d7b8-3b2d-4374-bc05-335d32742d94'; -- Adriano Mathlouthi
UPDATE public.utenti SET codice_accesso = '375386' WHERE id = 'ef907d12-f7a1-437a-93ec-1f11bc038258'; -- Fabio Morganti
UPDATE public.utenti SET codice_accesso = '776170' WHERE id = '1f03fd56-cb03-437f-8312-e2cf90341ae1'; -- Paolo Paolantoni
UPDATE public.utenti SET codice_accesso = '722506' WHERE id = 'c82713fa-9ce5-49b7-95f8-4013d3b986f7'; -- Pieralberto Rosati
UPDATE public.utenti SET codice_accesso = '763598' WHERE id = '1cb751c8-0454-46e3-85c8-b045f85941ec'; -- Giorgio Ricci
UPDATE public.utenti SET codice_accesso = '603911' WHERE id = '803ff55d-b163-4ca7-af79-3d913814a9b3'; -- Stefano Tarquini
UPDATE public.utenti SET codice_accesso = '753021' WHERE id = '30ec4e0d-b99c-464f-8517-72b03580b1e1'; -- Marcello Testa
UPDATE public.utenti SET codice_accesso = '850331' WHERE id = 'e8c798ce-0482-4804-9039-5ecb68e34e45'; -- Fabio Piciacchia
UPDATE public.utenti SET codice_accesso = '976412' WHERE id = '5a977105-71dd-41b4-8595-973016a0b6d9'; -- Giulio De Vecchis
UPDATE public.utenti SET codice_accesso = '508323' WHERE id = 'c4086555-de0c-44a2-9e2f-c20ae348ed61'; -- Alessandro Santucci
UPDATE public.utenti SET codice_accesso = '428805' WHERE id = '0cf90117-2327-434f-90a0-81112bd57c94'; -- Marco Mecozzi

-- 4. Ricreazione vista vw_stato_atleta_corso con colonna u.codice_accesso
DROP VIEW IF EXISTS public.vw_stato_atleta_corso;

CREATE VIEW public.vw_stato_atleta_corso AS
SELECT
    ie.id AS iscrizione_id,
    ie.evento_id,
    ie.utente_id,
    ie.stato_pagamento,
    ie.orario_libero,
    ie.data_inizio_corso,
    ie.data_scadenza_corso,
    ie.scadenza_modificata_a_mano,
    ie.abbonamento_scelto,
    ie.tipo_pagamento,
    ie.totale_rate,
    ie.rate_pagate,
    ie.stato_rate,
    ie.ingressi_totali,
    ie.ingressi_usati,
    ie.iscrizione_promo_padre_id,
    ie.tipo_iscrizione,
    u.nome,
    u.cognome,
    u.codice_accesso,
    COALESCE(u.quota_totale, 0::numeric) AS quota_totale,
    CASE
        WHEN COALESCE(u.quota_totale, 0::numeric) <= 0::numeric THEN true
        ELSE false
    END AS quota_annuale_ok,
    rs.quota_scadenza,
    rt.stato_tesseramento,
    cm.stato_validazione AS cert_stato,
    cm.data_scadenza AS cert_scadenza,
    CASE
        WHEN cm.stato_validazione::text = 'VERDE'::text AND cm.data_scadenza >= CURRENT_DATE THEN true
        ELSE false
    END AS cert_valido
FROM public.iscrizioni_eventi ie
JOIN public.utenti u ON u.id = ie.utente_id
LEFT JOIN LATERAL (
    SELECT anagrafiche.id
    FROM public.anagrafiche
    WHERE anagrafiche.utente_id = u.id
    ORDER BY anagrafiche.created_at DESC
    LIMIT 1
) a ON true
LEFT JOIN public.registro_soci rs ON rs.anagrafica_id = a.id
LEFT JOIN public.registro_tesserati rt ON rt.anagrafica_id = a.id
LEFT JOIN LATERAL (
    SELECT cm_sub.stato_validazione, cm_sub.data_scadenza
    FROM public.certificati_medici cm_sub
    WHERE cm_sub.anagrafica_id = a.id
    ORDER BY (
        CASE
            WHEN cm_sub.stato_validazione::text = 'VERDE'::text AND cm_sub.data_scadenza >= CURRENT_DATE THEN 1
            WHEN cm_sub.stato_validazione::text = 'VERDE'::text THEN 2
            WHEN cm_sub.stato_validazione::text = 'GIALLO'::text AND cm_sub.data_scadenza >= CURRENT_DATE THEN 3
            WHEN cm_sub.stato_validazione::text = 'IN_ATTESA'::text AND cm_sub.data_scadenza >= CURRENT_DATE THEN 4
            WHEN cm_sub.stato_validazione::text = 'GIALLO'::text THEN 5
            WHEN cm_sub.stato_validazione::text = 'IN_ATTESA'::text THEN 6
            ELSE 7
        END
    ), cm_sub.data_scadenza DESC, cm_sub.created_at DESC
    LIMIT 1
) cm ON true;
