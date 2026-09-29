-- ==============================================================================
-- MIGRATION: NESTORE — Ristrutturazione Programmi per Corso e Raggruppamento
-- ==============================================================================
-- Consente la suddivisione modulare dei programmi di allenamento per corso:
-- Ibrido (Base, Avanzato, Benchmark, Personale)
-- Strongman e Powerlifting (Base, Avanzato, Benchmark, Personale)
-- SCAB (Programmi SCAB, Personale)
-- Regola EPIKA: Storicizzazione rigorosa (soft updates, soft delete).

ALTER TABLE public.nestore_programmi_libreria 
    ADD COLUMN IF NOT EXISTS corso_id UUID REFERENCES public.eventi(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS raggruppamento TEXT DEFAULT 'base' CHECK (raggruppamento IN ('base', 'avanzato', 'benchmark', 'personale'));

CREATE INDEX IF NOT EXISTS idx_nst_prog_corso_raggr ON public.nestore_programmi_libreria(corso_id, raggruppamento);

-- 1. Ibrido Metcon e Forza -> Corso Ibrido, Raggruppamento base
UPDATE public.nestore_programmi_libreria
SET corso_id = '11102454-b063-4811-a361-6c8459764ce8',
    raggruppamento = 'base'
WHERE codice LIKE 'ibrido_%';

-- 2. Invictus -> Corso Ibrido, Raggruppamento benchmark
UPDATE public.nestore_programmi_libreria
SET corso_id = '11102454-b063-4811-a361-6c8459764ce8',
    raggruppamento = 'benchmark'
WHERE codice = 'invictus_base';

-- 3. PL BEGINNER 1 -> Corso Strongman, Raggruppamento base
UPDATE public.nestore_programmi_libreria
SET corso_id = 'b1d8c235-fc94-4372-bff1-28f183700c92',
    raggruppamento = 'base'
WHERE id = 'a811d889-071d-490e-abf3-68ffedd1b2df' OR nome ILIKE '%PL BEGINNER%';

-- 4. RLS Aggiornata per lettura condizionata per corso
DROP POLICY IF EXISTS "nst_prog_select" ON public.nestore_programmi_libreria;
CREATE POLICY "nst_prog_select" ON public.nestore_programmi_libreria
    FOR SELECT USING (
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.registro_istruttori ri
            JOIN public.anagrafiche an ON an.id = ri.anagrafica_id
            WHERE an.utente_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.istruttore_id = auth.uid()
        )
        OR (
            attivo = true
            AND (
                corso_id IS NULL
                OR EXISTS (
                    SELECT 1 FROM public.iscrizioni_eventi ie
                    WHERE ie.utente_id = auth.uid()
                      AND ie.stato_pagamento IN ('PAGATO', 'GRATUITO')
                      AND (
                          ie.evento_id = nestore_programmi_libreria.corso_id
                          OR (
                              nestore_programmi_libreria.corso_id = '3854f25c-db1c-4c6a-b62a-70398643239a'::uuid
                              AND ie.evento_id = '11102454-b063-4811-a361-6c8459764ce8'::uuid
                          )
                      )
                )
            )
        )
    );
