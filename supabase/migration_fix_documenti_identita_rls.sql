-- Migration: Fix RLS Policies per bucket storage.documenti_identita
-- Allineamento security path-guard e aggiunta policy UPDATE mancante

-- 1. Rimozione policy INSERT esistente non sicura (senza path-guard)
DROP POLICY IF EXISTS "Utenti possono inserire i propri documenti" ON storage.objects;
DROP POLICY IF EXISTS "Utenti possono inserire i propri documenti di identita" ON storage.objects;

-- 2. Nuova policy INSERT con path-guard sul proprietario (coerente con certificati_medici)
CREATE POLICY "Utenti possono inserire i propri documenti di identita"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documenti_identita'
    AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 3. Nuova policy UPDATE mancante (necessaria per modifiche/upsert dell'utente sui propri file)
DROP POLICY IF EXISTS "Utenti possono aggiornare i propri documenti di identita" ON storage.objects;

CREATE POLICY "Utenti possono aggiornare i propri documenti di identita"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documenti_identita'
    AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 4. Nuova policy SELECT con path-guard e accesso Direttivo
DROP POLICY IF EXISTS "Utenti possono leggere i propri documenti" ON storage.objects;
DROP POLICY IF EXISTS "Utenti possono leggere i propri documenti di identita" ON storage.objects;

CREATE POLICY "Utenti possono leggere i propri documenti di identita"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documenti_identita'
    AND (
        (auth.uid())::text = (storage.foldername(name))[1]
        OR EXISTS (
            SELECT 1 FROM public.utenti u
            WHERE u.id = auth.uid()
            AND u.ruolo && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente]
        )
    )
);
