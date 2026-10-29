-- Migration: migration_fix_elimina_utente_completo.sql
-- Obiettivo:
-- 1. Permettere al Direttivo di eliminare file di utenti cancellati nei 4 bucket Storage (GDPR Art. 9 / Art. 17)
-- 2. Ricreare public.elimina_utente_completo con guardrail normativo multilivello, separazione auto-azioni e audit immutabile
-- 3. Hardening di public.elimina_utente_fantasma con SET search_path e pulizia log personali

-- 1. STORAGE RLS POLICY (Permette la rimozione dei file personali orfani da parte del Direttivo)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Direttivo puo eliminare file utenti cancellati'
    ) THEN
        CREATE POLICY "Direttivo puo eliminare file utenti cancellati"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
            bucket_id IN ('certificati_medici', 'documenti_identita', 'documenti_adesione', 'documenti_tutori')
            AND EXISTS (
                SELECT 1 FROM public.utenti u
                WHERE u.id = auth.uid()
                  AND ('presidente'::public.ruolo_utente = ANY(u.ruolo)
                    OR 'vice_presidente'::public.ruolo_utente = ANY(u.ruolo)
                    OR 'segretario'::public.ruolo_utente = ANY(u.ruolo)
                    OR 'tesoriere'::public.ruolo_utente = ANY(u.ruolo))
            )
        );
    END IF;
END $$;

-- 2. RIFATTORIZZAZIONE public.elimina_utente_completo
DROP FUNCTION IF EXISTS public.elimina_utente_completo(uuid);

CREATE OR REPLACE FUNCTION public.elimina_utente_completo(target_anagrafica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_target_utente_id UUID;
    v_target_ruoli public.ruolo_utente[];
    v_tipo_adesione TEXT;
    v_nome TEXT;
    v_cognome TEXT;
    v_cf TEXT;
BEGIN
    -- 1. Verifica autorizzazione chiamante (solo Direttivo autorizzato)
    v_caller_roles := public.get_user_role(auth.uid());
    IF v_caller_roles IS NULL OR NOT (
        'presidente'::public.ruolo_utente = ANY(v_caller_roles) OR 
        'vice_presidente'::public.ruolo_utente = ANY(v_caller_roles) OR 
        'segretario'::public.ruolo_utente = ANY(v_caller_roles) OR 
        'tesoriere'::public.ruolo_utente = ANY(v_caller_roles)
    ) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Non autorizzato: permessi insufficienti per eliminare un utente.';
    END IF;

    -- 2. Recupero dati anagrafica e utente
    SELECT a.utente_id, a.nome, a.cognome, a.codice_fiscale, u.ruolo, u.tipo_adesione
    INTO v_target_utente_id, v_nome, v_cognome, v_cf, v_target_ruoli, v_tipo_adesione
    FROM public.anagrafiche a
    LEFT JOIN public.utenti u ON a.utente_id = u.id
    WHERE a.id = target_anagrafica_id;

    IF v_target_utente_id IS NULL THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Anagrafica non trovata o senza utente associato.';
    END IF;

    -- 3. GUARDRAIL DI SICUREZZA E INTEGRITÀ NORMATIVA/FISCALE
    -- 3a. Blocco auto-eliminazione
    IF v_target_utente_id = auth.uid() THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: non puoi eliminare il tuo stesso account amministratore.';
    END IF;

    -- 3b. Blocco membri del Consiglio Direttivo in carica
    IF v_target_ruoli IS NOT NULL AND (
        'presidente'::public.ruolo_utente = ANY(v_target_ruoli) OR
        'vice_presidente'::public.ruolo_utente = ANY(v_target_ruoli) OR
        'segretario'::public.ruolo_utente = ANY(v_target_ruoli) OR
        'tesoriere'::public.ruolo_utente = ANY(v_target_ruoli) OR
        'consigliere'::public.ruolo_utente = ANY(v_target_ruoli)
    ) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: l''utente ricopre una carica nel Consiglio Direttivo. Revocare prima l''incarico istituzionale.';
    END IF;

    -- 3c. Blocco Fiscale e Contabile (Art. 2220 c.c., DPR 600/73)
    IF EXISTS (SELECT 1 FROM public.ricevute_pagamenti WHERE utente_id = v_target_utente_id) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: risultano ricevute contabili progressive già emesse a nome dell''utente. Per legge fiscale non possono essere cancellate (obbligo conservazione decennale).';
    END IF;

    IF EXISTS (SELECT 1 FROM public.registro_spese WHERE registrato_da = v_target_utente_id) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: l''utente ha registrato movimenti contabili di spesa per l''associazione.';
    END IF;

    -- 3d. Blocco Libri Sociali e Registri Ufficiali già consolidati
    IF EXISTS (
        SELECT 1 FROM public.registro_soci 
        WHERE anagrafica_id = target_anagrafica_id 
          AND (stato_socio = 'ATTIVO' OR numero_registro IS NOT NULL)
    ) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: l''utente è un socio già deliberato ed iscritto nel Libro Soci ufficiale. Utilizzare la funzione di cessazione/esclusione socio.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.registro_tesserati 
        WHERE anagrafica_id = target_anagrafica_id 
          AND (stato_tesseramento = 'ATTIVO' OR numero_registro IS NOT NULL)
    ) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: l''utente è un tesserato già attivo con numero di matricola assegnato. Utilizzare la sospensione tesseramento.';
    END IF;

    -- 3e. Blocco Firmatario Verbali e Riunioni
    IF EXISTS (
        SELECT 1 FROM public.verbali_consiglio WHERE redatto_da = v_target_utente_id OR approvato_da = v_target_utente_id
        UNION ALL
        SELECT 1 FROM public.verbali_assemblea WHERE redatto_da = v_target_utente_id OR approvato_da = v_target_utente_id
        UNION ALL
        SELECT 1 FROM public.riunioni_consiglio WHERE id_presidente = v_target_utente_id OR id_segretario = v_target_utente_id
    ) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: l''utente risulta firmatario o verbalizzante di atti collegiali (verbali/riunioni).';
    END IF;

    -- 3f. Blocco Regola EPIKA Storicizzazione & Ruolo Operativo su Terzi
    IF EXISTS (
        SELECT 1 FROM public.epika_presenze_eventi WHERE utente_id = v_target_utente_id
        UNION ALL
        SELECT 1 FROM public.epika_storico_ruoli_gruppi WHERE profilo_id = v_target_utente_id
        UNION ALL
        SELECT 1 FROM public.registro_approvazioni WHERE deciso_da = v_target_utente_id AND anagrafica_id <> target_anagrafica_id
        UNION ALL
        SELECT 1 FROM public.presenze_eventi WHERE registrato_da = v_target_utente_id AND utente_id <> v_target_utente_id
        UNION ALL
        SELECT 1 FROM public.epika_presenze_eventi WHERE confermato_da = v_target_utente_id AND utente_id <> v_target_utente_id
        UNION ALL
        SELECT 1 FROM public.registro_audit_operazioni 
        WHERE operatore_id = v_target_utente_id 
          AND azione NOT IN ('CARICAMENTO_CERTIFICATO', 'AGGIORNAMENTO_PROFILO', 'RATA_FALLITA_STRIPE', 'ISCRIZIONE_SCAB_PROMO_BUNDLE')
    ) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Operazione negata: l''utente possiede uno storico operativo/associativo consolidato (partecipazioni storiche o azioni amministrative su terzi).';
    END IF;

    -- 4. ELIMINAZIONE A CASCATA BOTTOM-UP ATOMICA
    -- 4a. Rimozione log di audit personali dell'utente eliminato (Opzione 1A)
    DELETE FROM public.registro_audit_operazioni WHERE operatore_id = v_target_utente_id;

    -- 4b. Tabelle dipendenti da anagrafica_id
    DELETE FROM public.registro_approvazioni WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.registro_tesserati WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.registro_soci WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.registro_istruttori WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.registro_volontari WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.certificati_medici WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.documenti_identita WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.contatti WHERE anagrafica_id = target_anagrafica_id;
    DELETE FROM public.indirizzi_residenza WHERE anagrafica_id = target_anagrafica_id;

    -- 4c. Tabelle accessorie dipendenti da utente_id (incluso Nestore schede atleta)
    DELETE FROM public.nestore_schede_allenamento WHERE atleta_id = v_target_utente_id;
    DELETE FROM public.nestore_scheda_atleta WHERE utente_id = v_target_utente_id;
    DELETE FROM public.nestore_allenamenti WHERE utente_id = v_target_utente_id;
    DELETE FROM public.nestore_pasti WHERE utente_id = v_target_utente_id;
    DELETE FROM public.nestore_pesi_misure WHERE utente_id = v_target_utente_id;
    DELETE FROM public.nestore_preferenze WHERE utente_id = v_target_utente_id;
    DELETE FROM public.nestore_chat_messaggi WHERE utente_id = v_target_utente_id;

    DELETE FROM public.epika_iscrizioni_bozza WHERE utente_id = v_target_utente_id;
    DELETE FROM public.epika_iscrizioni_eventi WHERE utente_id = v_target_utente_id;
    DELETE FROM public.epika_presenze_eventi WHERE utente_id = v_target_utente_id;
    DELETE FROM public.epika_profili WHERE id = v_target_utente_id;

    DELETE FROM public.presenze_riunione WHERE utente_id = v_target_utente_id;
    DELETE FROM public.presenze_eventi WHERE utente_id = v_target_utente_id;
    DELETE FROM public.iscrizioni_eventi WHERE utente_id = v_target_utente_id;
    DELETE FROM public.istruttori_eventi WHERE istruttore_id = v_target_utente_id;
    DELETE FROM public.responsabili_eventi WHERE utente_id = v_target_utente_id;
    DELETE FROM public.registro_consensi WHERE utente_id = v_target_utente_id;
    DELETE FROM public.atti_adesione WHERE utente_id = v_target_utente_id;

    -- 5. ELIMINAZIONE ENTITÀ CORE
    DELETE FROM public.anagrafiche WHERE id = target_anagrafica_id;
    DELETE FROM public.utenti WHERE id = v_target_utente_id;
    DELETE FROM auth.users WHERE id = v_target_utente_id;

    -- 6. REGISTRAZIONE AUDIT DELLA CANCELLAZIONE (A nome dell'amministratore chiamante, SECURITY.md §6.2)
    INSERT INTO public.registro_audit_operazioni (
        operatore_id,
        azione,
        tabella_target,
        record_target_id,
        dettagli,
        ip_address
    ) VALUES (
        auth.uid(),
        'ELIMINAZIONE_UTENTE_COMPLETA',
        'utenti',
        v_target_utente_id::text,
        jsonb_build_object(
            'anagrafica_id', target_anagrafica_id,
            'nominativo', COALESCE(v_nome, '') || ' ' || COALESCE(v_cognome, ''),
            'codice_fiscale', v_cf,
            'tipo_adesione', v_tipo_adesione,
            'motivo', 'Sblocco ri-registrazione per pratica errata/incompleta'
        ),
        'Dashboard Direttiva'
    );

    RETURN jsonb_build_object(
        'success', true,
        'deleted_utente_id', v_target_utente_id,
        'deleted_anagrafica_id', target_anagrafica_id
    );
END;
$$;

-- 3. HARDENING public.elimina_utente_fantasma
CREATE OR REPLACE FUNCTION public.elimina_utente_fantasma(p_utente_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_roles public.ruolo_utente[];
    v_target_email TEXT;
    v_target_created TIMESTAMPTZ;
    v_has_profile BOOLEAN;
BEGIN
    -- Verifica autorizzazione
    v_caller_roles := public.get_user_role(auth.uid());
    IF NOT ('presidente'::public.ruolo_utente = ANY(v_caller_roles) OR 'vice_presidente'::public.ruolo_utente = ANY(v_caller_roles)) THEN
        RAISE EXCEPTION '[BLOCCO_NORMATIVO] Non autorizzato: solo presidente o vice presidente possono eseguire questa operazione.';
    END IF;

    -- Verifica che l'utente target esista in auth.users
    SELECT email, created_at
    INTO v_target_email, v_target_created
    FROM auth.users
    WHERE id = p_utente_id;

    IF v_target_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Utente non trovato.');
    END IF;

    -- Verifica se ha un profilo in utenti
    SELECT EXISTS(SELECT 1 FROM public.utenti WHERE id = p_utente_id) INTO v_has_profile;

    -- Elimina prima i record correlati (inclusi eventuali log personali generati prima del blocco)
    DELETE FROM public.registro_audit_operazioni WHERE operatore_id = p_utente_id;
    DELETE FROM public.atti_adesione WHERE utente_id = p_utente_id;

    -- Elimina il profilo se esiste
    IF v_has_profile THEN
        DELETE FROM public.utenti WHERE id = p_utente_id;
    END IF;

    -- Elimina da auth.users
    DELETE FROM auth.users WHERE id = p_utente_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_email', v_target_email,
        'had_profile', v_has_profile
    );
END;
$$;
