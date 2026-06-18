-- Patch 2: Aggiornamento vista e funzione per gestire registrazioni bloccate post-anagrafica ma pre-approvazione

-- 1. Vista aggiornata: un utente fantasma è chi ha ruolo tesserato_esterno ma NON ha un record
-- in registro_approvazioni, né in registro_soci, né in registro_tesserati.
CREATE OR REPLACE VIEW public.vw_registrazioni_incomplete AS
SELECT u.id as utente_id, u.nome, u.cognome, u.codice_fiscale, u.email, u.data_creazione
FROM public.utenti u
LEFT JOIN public.anagrafiche a ON u.id = a.utente_id
LEFT JOIN public.registro_approvazioni ra ON a.id = ra.anagrafica_id
LEFT JOIN public.registro_soci rs ON a.id = rs.anagrafica_id
LEFT JOIN public.registro_tesserati rt ON a.id = rt.anagrafica_id
WHERE u.ruolo && ARRAY['tesserato_esterno'::ruolo_utente]
  AND NOT (u.ruolo && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente, 'istruttore'::ruolo_utente, 'volontario'::ruolo_utente])
  AND ra.id IS NULL
  AND rs.id_socio IS NULL
  AND rt.id_tesserato IS NULL;

-- 2. RPC aggiornata: assicuriamoci di cancellare anche l'anagrafica se è stata creata parzialmente
CREATE OR REPLACE FUNCTION public.elimina_utente_fantasma(p_utente_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_role public.ruolo_utente;
BEGIN
    -- 1. Verifica autorizzazione
    caller_role := public.get_user_role(auth.uid());
    IF caller_role NOT IN ('presidente', 'vice_presidente') THEN
        RAISE EXCEPTION 'Non autorizzato: solo il Presidente o il Vice Presidente possono eliminare un utente incompleto.';
    END IF;

    -- 2. Elimina eventuali anagrafiche (che elimineranno a cascata indirizzi, certificati, contatti)
    DELETE FROM public.anagrafiche WHERE utente_id = p_utente_id;

    -- 3. Esegui la pulizia finale
    DELETE FROM public.registro_audit_operazioni WHERE operatore_id = p_utente_id;
    DELETE FROM public.ricevute_pagamenti WHERE utente_id = p_utente_id;
    DELETE FROM public.atti_adesione WHERE utente_id = p_utente_id;
    
    -- Elimina profilo pubblico
    DELETE FROM public.utenti WHERE id = p_utente_id;
    
    -- Elimina account autenticazione (cascata sicura)
    DELETE FROM auth.users WHERE id = p_utente_id;

    RETURN TRUE;
END;
$$;
