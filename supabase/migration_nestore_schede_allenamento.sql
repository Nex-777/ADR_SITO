-- ==============================================================================
-- MIGRATION: NESTORE FASE 2 — Vista Allenatore & Schede di Allenamento
-- ==============================================================================

-- 1. Tabella Schede di Allenamento
CREATE TABLE IF NOT EXISTS public.nestore_schede_allenamento (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atleta_id       UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    allenatore_id   UUID NOT NULL REFERENCES public.utenti(id) ON DELETE SET NULL,
    titolo          TEXT NOT NULL,
    periodo         TEXT,                -- es. "Ottobre - Dicembre 2026"
    obiettivo       TEXT,                -- es. "Ipertrofia / Forza Massima / Conditioning"
    contenuto_testo TEXT,                -- Testo libero / Copia-Incolla da Word
    file_nome       TEXT,                -- Nome originale del file .doc/.docx
    file_path       TEXT,                -- Path Supabase Storage
    file_dimensione INTEGER,             -- Dimensione in bytes (anti-bloat check)
    attivo          BOOLEAN NOT NULL DEFAULT true, -- Storicizzazione EPIKA: soft-delete
    creato_il       TIMESTAMPTZ NOT NULL DEFAULT now(),
    aggiornato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_nst_schede_atleta ON public.nestore_schede_allenamento(atleta_id, attivo, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_nst_schede_allenatore ON public.nestore_schede_allenamento(allenatore_id, creato_il DESC);

-- Abilitazione RLS
ALTER TABLE public.nestore_schede_allenamento ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: L'atleta legge le proprie, l'autore legge le sue, il direttivo legge tutto,
-- e gli istruttori assegnati al corso dell'atleta possono leggere.
DROP POLICY IF EXISTS "nst_schede_select" ON public.nestore_schede_allenamento;
CREATE POLICY "nst_schede_select" ON public.nestore_schede_allenamento
    FOR SELECT USING (
        atleta_id = auth.uid()
        OR allenatore_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_schede_allenamento.atleta_id
        )
    );

-- Policy INSERT: Consentita all'autore se è istruttore assegnato, istruttore registrato, o direttivo
DROP POLICY IF EXISTS "nst_schede_insert" ON public.nestore_schede_allenamento;
CREATE POLICY "nst_schede_insert" ON public.nestore_schede_allenamento
    FOR INSERT WITH CHECK (
        allenatore_id = auth.uid() AND (
            (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
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

-- Policy UPDATE: L'autore o il direttivo possono disattivare/aggiornare la scheda (soft-delete)
DROP POLICY IF EXISTS "nst_schede_update" ON public.nestore_schede_allenamento;
CREATE POLICY "nst_schede_update" ON public.nestore_schede_allenamento
    FOR UPDATE USING (
        allenatore_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );

-- Nessuna policy DELETE fisica: rispetta la regola di storicizzazione EPIKA.


-- 2. Aggiornamento Policy SELECT su tabelle Nestore esistenti per consentire accesso agli Istruttori del corso

-- 2.1 nestore_pesi_misure
DROP POLICY IF EXISTS "nst_pm_select_own" ON public.nestore_pesi_misure;
CREATE POLICY "nst_pm_select_own" ON public.nestore_pesi_misure
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
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
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
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
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_pasti.utente_id
        )
    );

-- 2.4 nestore_scheda_atleta (Scheda AI Karpathy-style)
DROP POLICY IF EXISTS "nst_scheda_select_own" ON public.nestore_scheda_atleta;
CREATE POLICY "nst_scheda_select_own" ON public.nestore_scheda_atleta
    FOR SELECT USING (
        utente_id = auth.uid()
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
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
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
            WHERE ie.istruttore_id = auth.uid() AND isc.utente_id = nestore_preferenze.utente_id
        )
    );

-- 3. Storage Bucket: schede_allenamento
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'schede_allenamento',
    'schede_allenamento',
    false,
    5242880, -- 5 MB anti-bloat
    ARRAY[
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream'
    ];

-- Policy Storage: Lettura file schede
DROP POLICY IF EXISTS "Lettura schede_allenamento autorizzata" ON storage.objects;
CREATE POLICY "Lettura schede_allenamento autorizzata" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'schede_allenamento' AND (
            (auth.uid())::text = (storage.foldername(name))[1]
            OR EXISTS (
                SELECT 1 FROM public.utenti u
                WHERE u.id = auth.uid()
                AND u.ruolo && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente]
            )
            OR EXISTS (
                SELECT 1 FROM public.istruttori_eventi ie
                JOIN public.iscrizioni_eventi isc ON isc.evento_id = ie.evento_id
                WHERE ie.istruttore_id = auth.uid()
                AND isc.utente_id::text = (storage.foldername(name))[1]
            )
        )
    );

-- Policy Storage: Caricamento file schede (Istruttori e Direttivo)
DROP POLICY IF EXISTS "Caricamento schede_allenamento autorizzato" ON storage.objects;
CREATE POLICY "Caricamento schede_allenamento autorizzato" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'schede_allenamento' AND (
            EXISTS (
                SELECT 1 FROM public.utenti u
                WHERE u.id = auth.uid()
                AND u.ruolo && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente]
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
