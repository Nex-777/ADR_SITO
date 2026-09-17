-- ==============================================================================
-- MIGRATION: NESTORE — Libreria Programmi di Allenamento (Base & Standard)
-- ==============================================================================
-- Tabella centralizzata per la gestione dinamica dei programmi ufficiali (Invictus, Ibrido Metcon/Forza, etc.)
-- Regola EPIKA: Storicizzazione rigorosa (attivo = false, nessun DELETE fisico).

CREATE TABLE IF NOT EXISTS public.nestore_programmi_libreria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codice          TEXT UNIQUE,
    nome            TEXT NOT NULL,
    tipo            TEXT NOT NULL,                      -- 'ibrido', 'invictus', etc.
    categoria       TEXT,                               -- 'metcon', 'forza', 'standard'
    timer_mode      TEXT NOT NULL DEFAULT 'stopwatch',  -- 'tabata', 'stopwatch'
    work_default    INTEGER DEFAULT 30,                 -- secondi di lavoro se tabata
    rest_default    INTEGER DEFAULT 30,                 -- secondi di riposo se tabata
    rounds_default  INTEGER DEFAULT 8,                  -- giri se tabata
    tempo_target    TEXT,                               -- es. '40 min', '42 min'
    giri_target     INTEGER,                            -- es. 20 giri
    descrizione     TEXT,
    esercizi        JSONB NOT NULL DEFAULT '[]'::jsonb,
    attivo          BOOLEAN NOT NULL DEFAULT true,      -- EPIKA soft-delete
    ordine          INTEGER DEFAULT 0,
    creato_da       UUID REFERENCES public.utenti(id) ON DELETE SET NULL,
    creato_il       TIMESTAMPTZ NOT NULL DEFAULT now(),
    aggiornato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici per query veloci
CREATE INDEX IF NOT EXISTS idx_nst_prog_attivo_ordine ON public.nestore_programmi_libreria(attivo, ordine, nome);
CREATE INDEX IF NOT EXISTS idx_nst_prog_tipo ON public.nestore_programmi_libreria(tipo, categoria);

-- Abilitazione RLS
ALTER TABLE public.nestore_programmi_libreria ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Tutti gli utenti autenticati possono leggere i programmi attivi.
--    Gli amministratori e gli istruttori possono leggere anche i programmi archiviati.
DROP POLICY IF EXISTS "nst_prog_select" ON public.nestore_programmi_libreria;
CREATE POLICY "nst_prog_select" ON public.nestore_programmi_libreria
    FOR SELECT USING (
        attivo = true
        OR (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente, 'segretario'::public.ruolo_utente, 'tesoriere'::public.ruolo_utente, 'consigliere'::public.ruolo_utente])
        OR EXISTS (
            SELECT 1 FROM public.registro_istruttori ri
            JOIN public.anagrafiche an ON an.id = ri.anagrafica_id
            WHERE an.utente_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.istruttori_eventi ie
            WHERE ie.istruttore_id = auth.uid()
        )
    );

-- 2. INSERT: Amministratori e Istruttori possono creare nuovi programmi.
DROP POLICY IF EXISTS "nst_prog_insert" ON public.nestore_programmi_libreria;
CREATE POLICY "nst_prog_insert" ON public.nestore_programmi_libreria
    FOR INSERT WITH CHECK (
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
    );

-- 3. UPDATE: Amministratori e Istruttori possono modificare i programmi o disattivarli (soft delete).
DROP POLICY IF EXISTS "nst_prog_update" ON public.nestore_programmi_libreria;
CREATE POLICY "nst_prog_update" ON public.nestore_programmi_libreria
    FOR UPDATE USING (
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
    );

-- Seeding Iniziale dei 9 programmi ufficiali (se non già presenti)
INSERT INTO public.nestore_programmi_libreria (codice, nome, tipo, categoria, timer_mode, work_default, rest_default, rounds_default, tempo_target, giri_target, descrizione, esercizi, ordine, attivo)
VALUES
    (
        'invictus_base',
        'Invictus',
        'invictus',
        'standard',
        'stopwatch',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Benchmark Adrenalina: Pull-up, Push-up, Air Squat. Rapporto standard 1:2:4.',
        '[{"nome": "Pull-up", "target": "1x Pull Base", "ripetizioni_moltiplicatore": 1}, {"nome": "Push-up", "target": "2x Pull Base", "ripetizioni_moltiplicatore": 2}, {"nome": "Air Squat", "target": "4x Pull Base", "ripetizioni_moltiplicatore": 4}]'::jsonb,
        1,
        true
    ),
    (
        'ibrido_metcon_1',
        'Metcon 1',
        'ibrido',
        'metcon',
        'tabata',
        30,
        30,
        40,
        NULL,
        NULL,
        '30" work + 30" rest (Giro 60"), 40 giri tot. Riscaldamento dinamico 10''.',
        '[{"nome": "PULL", "target": "15 rip"}, {"nome": "Assault Bike", "target": "60 cal/rpm"}, {"nome": "Swing 16kg", "target": "15 rip"}, {"nome": "Vogatore", "target": "20 cal/m"}, {"nome": "Stacchi 90kg", "target": "4 rip"}, {"nome": "C+J Manubrio 20kg", "target": "3+3 rip"}]'::jsonb,
        2,
        true
    ),
    (
        'ibrido_forza_1',
        'Forza 1',
        'ibrido',
        'forza',
        'stopwatch',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Panca Piana, Squat, Jump Max, Trazioni Pesate. Rispettare i riposi lunghi e non fuggire dal peso.',
        '[{"nome": "Panca Piana", "target": "Risc. 1x10@90kg, salita (100, 110, 120, 125) → Target: 4x5 @ 105kg", "serie_target": 4, "rip_target": 5, "peso_target": 105}, {"nome": "Squat", "target": "Risc. 1x10@100kg, salita (110, 120) → Target: 4x4 @ 130kg", "serie_target": 4, "rip_target": 4, "peso_target": 130}, {"nome": "Jump Max", "target": "5 salti massimali", "serie_target": 1, "rip_target": 5, "peso_target": 0}, {"nome": "Trazioni Pesate", "target": "Risc. 1x21@0kg → Target: 4x6 @ +20kg", "serie_target": 4, "rip_target": 6, "peso_target": 20}]'::jsonb,
        3,
        true
    ),
    (
        'ibrido_metcon_2',
        'Metcon 2',
        'ibrido',
        'metcon',
        'tabata',
        30,
        30,
        7,
        '42 min',
        NULL,
        '30" work + 30" rest (Giro 60"), 7 giri tot, tempo target 42''. Riscaldamento dinamico 10''.',
        '[{"nome": "Pull", "target": "15 rip"}, {"nome": "Burpees", "target": "8 rip"}, {"nome": "Push", "target": "20 rip"}, {"nome": "Swing", "target": "15 rip"}, {"nome": "Dip", "target": "10 rip"}, {"nome": "Box Jump", "target": "10 rip"}]'::jsonb,
        4,
        true
    ),
    (
        'ibrido_forza_2',
        'Forza 2',
        'ibrido',
        'forza',
        'stopwatch',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Spinte Manubri 15°, Stacco da terra, Jump Max, Rematore Bilanciere.',
        '[{"nome": "Spinte Manubri 15°", "target": "Salita con manubri (30, 35kg) → Target: 4x4 @ 42kg", "serie_target": 4, "rip_target": 4, "peso_target": 42}, {"nome": "Stacco da terra", "target": "Risc. 1x10@140kg, salita (160, 180, 200kg) → Target: 4x5 @ 160kg", "serie_target": 4, "rip_target": 5, "peso_target": 160}, {"nome": "Jump Max", "target": "5 salti massimali", "serie_target": 1, "rip_target": 5, "peso_target": 0}, {"nome": "Rematore Bilanciere", "target": "Risc. 1x10@55kg, salita (65, 75, 85, 95kg) → Target: 4x4 @ 85kg", "serie_target": 4, "rip_target": 4, "peso_target": 85}]'::jsonb,
        5,
        true
    ),
    (
        'ibrido_metcon_3',
        'Metcon 3',
        'ibrido',
        'metcon',
        'stopwatch',
        NULL,
        NULL,
        NULL,
        '40 min',
        20,
        'Unbroken, Giro no Time, 20 giri tot, tempo target 40''. Riscaldamento dinamico 10''.',
        '[{"nome": "Muscle Up", "target": "1 rip"}, {"nome": "Pull", "target": "2 rip"}, {"nome": "Push", "target": "5 rip"}, {"nome": "Burpee to Bar", "target": "5 rip"}, {"nome": "Air Squat", "target": "10 rip"}]'::jsonb,
        6,
        true
    ),
    (
        'ibrido_forza_3',
        'Forza 3',
        'ibrido',
        'forza',
        'stopwatch',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Panca Piana, Squat, Jump Max, Trazioni Pesate con sovraccarico.',
        '[{"nome": "Panca Piana", "target": "Risc. 1x10@90kg, salita (100, 110, 120, 125) → Target: 4x4 @ 105kg", "serie_target": 4, "rip_target": 4, "peso_target": 105}, {"nome": "Squat", "target": "Risc. 1x10@100kg, salita (110, 120) → Target: 4x4 @ 120kg", "serie_target": 4, "rip_target": 4, "peso_target": 120}, {"nome": "Jump Max", "target": "5 salti massimali", "serie_target": 1, "rip_target": 5, "peso_target": 0}, {"nome": "Trazioni Pesate", "target": "Risc. 1x22@0kg → Target: 4x6 @ +22kg", "serie_target": 4, "rip_target": 6, "peso_target": 22}]'::jsonb,
        7,
        true
    ),
    (
        'ibrido_metcon_4',
        'Metcon 4',
        'ibrido',
        'metcon',
        'tabata',
        25,
        35,
        7,
        '42 min',
        NULL,
        'Isometrico, 25" work + 35" rest (Giro 60"), 7 giri tot, tempo target 42''. Riscaldamento dinamico 10''.',
        '[{"nome": "Pull", "target": "max rep"}, {"nome": "Affondi SX + OH", "target": "max rep"}, {"nome": "Push", "target": "max rep"}, {"nome": "Affondi DX + OH", "target": "max rep"}, {"nome": "DIP", "target": "max rep"}, {"nome": "Good Morning KET 16kg", "target": "max rep"}]'::jsonb,
        8,
        true
    ),
    (
        'ibrido_forza_4',
        'Forza 4',
        'ibrido',
        'forza',
        'stopwatch',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Lento Avanti, Stacco da terra, Jump Max, Rematore Bilanciere.',
        '[{"nome": "Lento Avanti", "target": "Risc. 1x10@50kg, salita (60, 80kg) → Target: 4x5 @ 65kg", "serie_target": 4, "rip_target": 5, "peso_target": 65}, {"nome": "Stacco da terra", "target": "Risc. 1x10@140kg, salita (160, 180, 190kg) → Target: 4x4 @ 160kg", "serie_target": 4, "rip_target": 4, "peso_target": 160}, {"nome": "Jump Max", "target": "5 salti massimali", "serie_target": 1, "rip_target": 5, "peso_target": 0}, {"nome": "Rematore Bilanciere", "target": "Salita serie → Target: 4x10 @ 70kg", "serie_target": 4, "rip_target": 10, "peso_target": 70}]'::jsonb,
        9,
        true
    )
ON CONFLICT (codice) DO UPDATE SET
    nome = EXCLUDED.nome,
    tipo = EXCLUDED.tipo,
    categoria = EXCLUDED.categoria,
    timer_mode = EXCLUDED.timer_mode,
    work_default = EXCLUDED.work_default,
    rest_default = EXCLUDED.rest_default,
    rounds_default = EXCLUDED.rounds_default,
    tempo_target = EXCLUDED.tempo_target,
    giri_target = EXCLUDED.giri_target,
    descrizione = EXCLUDED.descrizione,
    esercizi = EXCLUDED.esercizi,
    ordine = EXCLUDED.ordine,
    attivo = EXCLUDED.attivo,
    aggiornato_il = now();
