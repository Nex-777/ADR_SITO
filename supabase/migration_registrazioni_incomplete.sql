-- Migration: Gestione Registrazioni Incomplete (Utenti Fantasma)

-- 1. Vista per identificare gli utenti rimasti bloccati in fase di OTP
CREATE OR REPLACE VIEW public.vw_registrazioni_incomplete AS
SELECT u.id as utente_id, u.nome, u.cognome, u.codice_fiscale, u.email, u.data_creazione
FROM public.utenti u
LEFT JOIN public.anagrafiche a ON u.id = a.utente_id
WHERE a.id IS NULL AND u.ruolo = 'tesserato_esterno';

-- Assegnazione permessi sulla vista
GRANT SELECT ON public.vw_registrazioni_incomplete TO authenticated;
GRANT SELECT ON public.vw_registrazioni_incomplete TO service_role;

-- 2. RPC per l'eliminazione sicura e forzata di un utente fantasma
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

    -- 2. Esegui la pulizia (ignorando la mancanza di record collegati)
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

-- Assegnazione permessi sulla RPC
GRANT EXECUTE ON FUNCTION public.elimina_utente_fantasma(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.elimina_utente_fantasma(UUID) TO service_role;
