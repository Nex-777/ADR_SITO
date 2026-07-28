-- Migrazione per la cancellazione profonda di un utente (Hard Delete)
-- Attenzione: Questa operazione non è reversibile e aggira l'EPIKA Core Rule
-- a fronte di un'esplicita necessità dell'utente di poter rifare l'iscrizione.

CREATE OR REPLACE FUNCTION public.elimina_utente_completo(target_anagrafica_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_role public.ruolo_utente;
    target_utente_id UUID;
BEGIN
    -- 1. Verifica autorizzazione (Solo ruoli apicali o amministratori)
    caller_role := public.get_user_role(auth.uid());
    IF caller_role NOT IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere') THEN
        RAISE EXCEPTION 'Non autorizzato: non hai i permessi per eliminare completamente un utente.';
    END IF;

    -- 2. Recupera l'utente_id per poterlo eliminare da auth.users e dalla tabella utenti
    SELECT utente_id INTO target_utente_id FROM public.anagrafiche WHERE id = target_anagrafica_id;

    IF target_utente_id IS NULL THEN
        RAISE EXCEPTION 'Anagrafica non trovata o senza utente associato.';
    END IF;

    -- 3. Elimina i dati collegati all'anagrafica (evitiamo di dipendere solo dai CASCADE)
    DELETE FROM public.registro_approvazioni WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.registro_tesserati WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.registro_soci WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.certificati_medici WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.documenti_identita WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.contatti WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.indirizzi_residenza WHERE anagrafica_id = target_anagrafica_id;

    -- 4. Elimina l'anagrafica
    DELETE FROM public.anagrafiche WHERE id = target_anagrafica_id;

    -- 5. Elimina eventuali log o pagamenti associati all'utente (non amministratore)
    -- Evitiamo di eliminare dai log le azioni fatte da lui come amministratore,
    -- ma eliminiamo le azioni subite da lui se necessario (già coperte da anagrafica CASCADE se esistente)
    DELETE FROM public.ricevute_pagamenti WHERE utente_id = target_utente_id;
    DELETE FROM public.atti_adesione WHERE utente_id = target_utente_id;
    
    -- 6. Elimina profilo pubblico da utenti
    DELETE FROM public.utenti WHERE id = target_utente_id;
    
    -- 7. Elimina account autenticazione (libera l'email e l'accesso)
    DELETE FROM auth.users WHERE id = target_utente_id;

    RETURN TRUE;
END;
$$;
