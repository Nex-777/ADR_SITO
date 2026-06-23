-- Migrazione Istruttori Corsi e Presenze
-- Step 1.1: Modifiche alla tabella eventi esistente
ALTER TABLE public.eventi ADD COLUMN IF NOT EXISTS orari_settimanali JSONB;

-- Step 1.2: Modifiche alla tabella iscrizioni_eventi esistente
ALTER TABLE public.iscrizioni_eventi ADD COLUMN IF NOT EXISTS orario_libero BOOLEAN DEFAULT false;

-- Step 1.3: Nuova tabella public.istruttori_eventi
CREATE TABLE IF NOT EXISTS public.istruttori_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
    istruttore_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_assegnazione TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(evento_id, istruttore_id)
);

-- Step 1.4: Nuova tabella public.presenze_eventi
CREATE TABLE IF NOT EXISTS public.presenze_eventi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
    utente_id UUID NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    data_lezione DATE NOT NULL,
    presente BOOLEAN DEFAULT false,
    registrato_da UUID REFERENCES public.utenti(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(evento_id, utente_id, data_lezione)
);

-- Step 1.5: RLS su eventi
ALTER TABLE public.eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_eventi_authenticated ON public.eventi;
CREATE POLICY select_eventi_authenticated ON public.eventi FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS all_admin_eventi ON public.eventi;
CREATE POLICY all_admin_eventi ON public.eventi FOR ALL
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    );

-- Step 1.6: RLS su iscrizioni_eventi
ALTER TABLE public.iscrizioni_eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY select_iscrizioni ON public.iscrizioni_eventi FOR SELECT
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]
        OR utente_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = iscrizioni_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS insert_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY insert_iscrizioni ON public.iscrizioni_eventi FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND utente_id = auth.uid());

DROP POLICY IF EXISTS delete_admin_iscrizioni ON public.iscrizioni_eventi;
CREATE POLICY delete_admin_iscrizioni ON public.iscrizioni_eventi FOR DELETE
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    );

-- Step 1.7: RLS su istruttori_eventi
ALTER TABLE public.istruttori_eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_istruttori_eventi ON public.istruttori_eventi;
CREATE POLICY select_istruttori_eventi ON public.istruttori_eventi FOR SELECT
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]
        OR istruttore_id = auth.uid()
    );

DROP POLICY IF EXISTS all_admin_istruttori_eventi ON public.istruttori_eventi;
CREATE POLICY all_admin_istruttori_eventi ON public.istruttori_eventi FOR ALL
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    );

-- Step 1.8: RLS su presenze_eventi
ALTER TABLE public.presenze_eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_presenze_eventi ON public.presenze_eventi;
CREATE POLICY select_presenze_eventi ON public.presenze_eventi FOR SELECT
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere']::public.ruolo_utente[]
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = presenze_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS upsert_presenze_istruttore ON public.presenze_eventi;
CREATE POLICY upsert_presenze_istruttore ON public.presenze_eventi FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = presenze_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS update_presenze_istruttore ON public.presenze_eventi;
CREATE POLICY update_presenze_istruttore ON public.presenze_eventi FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.evento_id = presenze_eventi.evento_id
            AND ie.istruttore_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS delete_admin_presenze ON public.presenze_eventi;
CREATE POLICY delete_admin_presenze ON public.presenze_eventi FOR DELETE
    USING (
        (SELECT ruolo FROM public.utenti WHERE id = auth.uid())
        && ARRAY['presidente', 'vice_presidente']::public.ruolo_utente[]
    );

-- Step 1.9: VIEW vw_stato_atleta_corso
CREATE OR REPLACE VIEW public.vw_stato_atleta_corso AS
SELECT
    ie.id AS iscrizione_id,
    ie.evento_id,
    ie.utente_id,
    ie.stato_pagamento,
    ie.orario_libero,
    u.nome,
    u.cognome,
    COALESCE(u.quota_totale, 0) AS quota_totale,
    CASE WHEN COALESCE(u.quota_totale, 0) <= 0 THEN true ELSE false END AS quota_annuale_ok,
    rs.quota_scadenza,
    CASE WHEN rs.quota_scadenza >= CURRENT_DATE THEN true ELSE false END AS tessera_valida,
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
