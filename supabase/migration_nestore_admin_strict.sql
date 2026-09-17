-- ==============================================================================
-- MIGRATION: NESTORE RESTRIZIONE ACCESSO ADMIN (Solo Presidente)
-- ==============================================================================
-- Rimuove l'accesso globale ai dati di tutti gli atleti per il direttivo generale
-- (consigliere, segretario, tesoriere) limitando i permessi di amministrazione 
-- e lettura globale esclusivamente al ruolo 'presidente'.
-- I componenti del direttivo mantengono l'accesso a Nestore per la loro vista atleta
-- e la vista allenatore (se registrati come istruttori).

-- 1. Tabella nestore_schede_allenamento
DROP POLICY IF EXISTS "nst_schede_select" ON public.nestore_schede_allenamento;
CREATE POLICY "nst_schede_select" ON public.nestore_schede_allenamento
    FOR SELECT USING (
        atleta_id = auth.uid()
        OR allenatore_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_schede_allenamento.atleta_id
        )
    );

DROP POLICY IF EXISTS "nst_schede_insert" ON public.nestore_schede_allenamento;
CREATE POLICY "nst_schede_insert" ON public.nestore_schede_allenamento
    FOR INSERT WITH CHECK (
        allenatore_id = auth.uid() AND (
            (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
            OR EXISTS (
                SELECT 1 FROM public.istruttori_eventi ie
                JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
                WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_schede_allenamento.atleta_id
            )
            OR EXISTS (
                SELECT 1 FROM public.registro_istruttori ri
                JOIN public.anagrafiche an ON an.id = ri.anagrafica_id
                WHERE an.utente_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "nst_schede_update" ON public.nestore_schede_allenamento;
CREATE POLICY "nst_schede_update" ON public.nestore_schede_allenamento
    FOR UPDATE USING (
        allenatore_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
    );

-- 2. Tabelle metriche e dati Nestore
-- 2.1 nestore_pesi_misure
DROP POLICY IF EXISTS "nst_pm_select_own" ON public.nestore_pesi_misure;
CREATE POLICY "nst_pm_select_own" ON public.nestore_pesi_misure
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_pesi_misure.utente_id
        )
    );

-- 2.2 nestore_allenamenti
DROP POLICY IF EXISTS "nst_all_select_own" ON public.nestore_allenamenti;
CREATE POLICY "nst_all_select_own" ON public.nestore_allenamenti
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_allenamenti.utente_id
        )
    );

-- 2.3 nestore_pasti
DROP POLICY IF EXISTS "nst_pasti_select_own" ON public.nestore_pasti;
CREATE POLICY "nst_pasti_select_own" ON public.nestore_pasti
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_pasti.utente_id
        )
    );

-- 2.4 nestore_scheda_atleta
DROP POLICY IF EXISTS "nst_scheda_select_own" ON public.nestore_scheda_atleta;
CREATE POLICY "nst_scheda_select_own" ON public.nestore_scheda_atleta
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_scheda_atleta.utente_id
        )
    );

-- 2.5 nestore_preferenze
DROP POLICY IF EXISTS "nst_pref_select_own" ON public.nestore_preferenze;
CREATE POLICY "nst_pref_select_own" ON public.nestore_preferenze
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_preferenze.utente_id
        )
    );

-- 3. Storage Bucket: schede_allenamento
DROP POLICY IF EXISTS "Lettura schede_allenamento autorizzata" ON storage.objects;
CREATE POLICY "Lettura schede_allenamento autorizzata" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'schede_allenamento' AND (
            (auth.uid())::text = (storage.foldername(name))[1]
            OR EXISTS (
                SELECT 1 FROM public.utenti u
                WHERE u.id = auth.uid()
                AND u.ruolo && ARRAY['presidente'::ruolo_utente]
            )
            OR EXISTS (
                SELECT 1 FROM public.istruttori_eventi ie
                JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
                WHERE ie.istruttore_id = auth.uid()
                AND isc.utente_id::text = (storage.foldername(name))[1]
            )
        )
    );

DROP POLICY IF EXISTS "Caricamento schede_allenamento autorizzato" ON storage.objects;
CREATE POLICY "Caricamento schede_allenamento autorizzato" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'schede_allenamento' AND (
            EXISTS (
                SELECT 1 FROM public.utenti u
                WHERE u.id = auth.uid()
                AND u.ruolo && ARRAY['presidente'::ruolo_utente]
            )
            OR EXISTS (
                SELECT 1 FROM public.istruttori_eventi ie
                JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
                WHERE ie.istruttore_id = auth.uid()
                AND isc.utente_id::text = (storage.foldername(name))[1]
            )
            OR EXISTS (
                SELECT 1 FROM public.registro_istruttori ri
                JOIN public.anagrafiche an ON an.id = ri.anagrafica_id
                WHERE an.utente_id = auth.uid()
            )
        )
    );
