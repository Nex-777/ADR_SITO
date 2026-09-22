-- ==============================================================================
-- Migrazione: Fix RLS Update per nestore_chat_messaggi
-- ==============================================================================
-- Consente agli utenti autenticati di aggiornare i metadata dei propri messaggi di chat
-- (necessario per contrassegnare le card di conferma dati come 'salvato: true' ed evitare
--  che la card riappaia a ogni caricamento della chat, causando salvataggi duplicati).

ALTER TABLE public.nestore_chat_messaggi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nst_chat_update_own" ON public.nestore_chat_messaggi;
CREATE POLICY "nst_chat_update_own" ON public.nestore_chat_messaggi
    FOR UPDATE USING (
        utente_id = auth.uid() OR
        (public.get_user_role(auth.uid()) && ARRAY['presidente'::public.ruolo_utente, 'vice_presidente'::public.ruolo_utente])
    );
