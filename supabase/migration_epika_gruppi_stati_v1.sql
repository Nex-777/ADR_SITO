-- ===========================================================================
-- MIGRAZIONE EPIKA: Macchina a Stati Gruppi Storici e Snapshot Iscrizioni Eventi
-- ===========================================================================

-- 1. Fix eventuale data di nascita/promozione errata
UPDATE public.epika_gruppi_storici 
SET data_inizio_ufficiale = '2005-01-01' 
WHERE data_inizio_ufficiale > '2100-01-01';

-- 2. Tabella Storico Stati Gruppi (Event Sourcing per Stati)
CREATE TABLE IF NOT EXISTS public.epika_gruppi_storico_stati (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gruppo_id BIGINT NOT NULL REFERENCES public.epika_gruppi_storici(id) ON DELETE CASCADE,
    stato TEXT NOT NULL, -- 'in_formazione', 'ufficiale', 'sospeso', 'cancellato'
    data_inizio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fine DATE NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abilitazione RLS su epika_gruppi_storico_stati
ALTER TABLE public.epika_gruppi_storico_stati ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_epika_gruppi_storico_stati ON public.epika_gruppi_storico_stati;
CREATE POLICY select_epika_gruppi_storico_stati ON public.epika_gruppi_storico_stati
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS all_admin_epika_gruppi_storico_stati ON public.epika_gruppi_storico_stati;
CREATE POLICY all_admin_epika_gruppi_storico_stati ON public.epika_gruppi_storico_stati
    FOR ALL TO authenticated
    USING (
        public.get_user_role(auth.uid()) && ARRAY[
            'presidente'::ruolo_utente, 
            'vice_presidente'::ruolo_utente, 
            'segretario'::ruolo_utente, 
            'tesoriere'::ruolo_utente, 
            'consigliere'::ruolo_utente
        ]
    )
    WITH CHECK (
        public.get_user_role(auth.uid()) && ARRAY[
            'presidente'::ruolo_utente, 
            'vice_presidente'::ruolo_utente, 
            'segretario'::ruolo_utente, 
            'tesoriere'::ruolo_utente, 
            'consigliere'::ruolo_utente
        ]
    );

-- 3. Aggiunta colonna gruppo_storico_id a epika_iscrizioni_eventi ed epika_iscrizioni_bozza
ALTER TABLE public.epika_iscrizioni_eventi 
ADD COLUMN IF NOT EXISTS gruppo_storico_id BIGINT REFERENCES public.epika_gruppi_storici(id);

ALTER TABLE public.epika_iscrizioni_bozza 
ADD COLUMN IF NOT EXISTS gruppo_storico_id BIGINT REFERENCES public.epika_gruppi_storici(id);

-- 4. Backfill gruppo_storico_id per iscrizioni esistenti
UPDATE public.epika_iscrizioni_eventi ie
SET gruppo_storico_id = p.gruppo_storico_id
FROM public.epika_profili p
WHERE ie.utente_id = p.id AND ie.gruppo_storico_id IS NULL;

-- 5. Inserimento record di stato iniziale per i gruppi esistenti
INSERT INTO public.epika_gruppi_storico_stati (gruppo_id, stato, data_inizio, data_fine, note)
SELECT 
    id AS gruppo_id,
    COALESCE(stato, 'ufficiale') AS stato,
    COALESCE(data_inizio_ufficiale, data_inizio_formazione, '2020-01-01'::date) AS data_inizio,
    NULL AS data_fine,
    'Stato iniziale registrato da sistema' AS note
FROM public.epika_gruppi_storici g
WHERE NOT EXISTS (
    SELECT 1 FROM public.epika_gruppi_storico_stati s WHERE s.gruppo_id = g.id
);
