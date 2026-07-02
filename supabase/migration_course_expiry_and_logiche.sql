-- Migration: Course Expiry and Logiche view update
ALTER TABLE public.iscrizioni_eventi ADD COLUMN IF NOT EXISTS data_inizio_corso DATE;
ALTER TABLE public.iscrizioni_eventi ADD COLUMN IF NOT EXISTS data_scadenza_corso DATE;
ALTER TABLE public.iscrizioni_eventi ADD COLUMN IF NOT EXISTS scadenza_modificata_a_mano BOOLEAN DEFAULT false;

-- Re-create view without tessera_valida, but with course date fields
CREATE OR REPLACE VIEW public.vw_stato_atleta_corso AS
SELECT
    ie.id AS iscrizione_id,
    ie.evento_id,
    ie.utente_id,
    ie.stato_pagamento,
    ie.orario_libero,
    ie.data_inizio_corso,
    ie.data_scadenza_corso,
    ie.scadenza_modificata_a_mano,
    u.nome,
    u.cognome,
    COALESCE(u.quota_totale, 0) AS quota_totale,
    CASE WHEN COALESCE(u.quota_totale, 0) <= 0 THEN true ELSE false END AS quota_annuale_ok,
    rs.quota_scadenza,
    rt.stato_tesseramento,
    cm.stato_validazione AS cert_stato,
    cm.data_scadenza AS cert_scadenza,
    CASE
        WHEN cm.stato_validazione = 'VERDE' AND cm.data_scadenza >= CURRENT_DATE THEN true
        ELSE false
    END AS cert_valido
FROM public.iscrizioni_eventi ie
JOIN public.utenti u ON u.id = ie.utente_id
LEFT JOIN public.anagrafiche a ON a.utente_id = u.id
LEFT JOIN public.registro_soci rs ON rs.anagrafica_id = a.id
LEFT JOIN public.registro_tesserati rt ON rt.anagrafica_id = a.id
LEFT JOIN LATERAL (
    SELECT stato_validazione, data_scadenza
    FROM public.certificati_medici
    WHERE certificati_medici.anagrafica_id = a.id
    ORDER BY data_scadenza DESC
    LIMIT 1
) cm ON true;
