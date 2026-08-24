-- Migration: Fix Immutabilità Ruolo Utente su Profilo e Consensi
-- Risolve il blocco dell'aggiornamento profilo per i membri del direttivo e chiude le falle RBAC di privilege escalation.

CREATE OR REPLACE FUNCTION public.proteggi_ruolo_utente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- [PREVENZIONE INSERT]: Nessun utente può auto-crearsi via client con ruoli del direttivo
    IF TG_OP = 'INSERT' THEN
        IF NEW.id = auth.uid() AND (NEW.ruolo && ARRAY['presidente'::ruolo_utente, 'vice_presidente'::ruolo_utente, 'segretario'::ruolo_utente, 'tesoriere'::ruolo_utente, 'consigliere'::ruolo_utente]) THEN
            RAISE EXCEPTION 'Non autorizzato: auto-assegnazione ruolo amministrativo non consentita in registrazione';
        END IF;
    END IF;

    -- [PREVENZIONE UPDATE]: Strict Immutability. Un utente non può MAI modificare il proprio RBAC
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id = auth.uid() THEN
            IF NEW.ruolo IS DISTINCT FROM OLD.ruolo THEN
                RAISE EXCEPTION 'Non autorizzato: non è consentito modificare i propri ruoli di sistema. Contattare l''amministratore.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
