-- Migration: Fix Blocco Registrazione Soci (Trigger Proteggi Ruolo)
-- Consente la transizione tra ruoli base (tesserato_esterno -> socio_in_attesa)
-- esclusivamente durante la fase di prima registrazione (quando OLD.tipo_adesione IS NULL).
-- Mantiene il blocco categorico contro qualsiasi privilege escalation a ruoli direttivi o approvati,
-- e preserva la stretta immutabilità totale per gli utenti già registrati (OLD.tipo_adesione IS NOT NULL).

CREATE OR REPLACE FUNCTION public.proteggi_ruolo_utente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- [PREVENZIONE INSERT]: Nessun utente può auto-crearsi via client con ruoli riservati o direttivi
    IF TG_OP = 'INSERT' THEN
        IF NEW.id = auth.uid() AND (NEW.ruolo && ARRAY[
            'presidente'::ruolo_utente,
            'vice_presidente'::ruolo_utente,
            'segretario'::ruolo_utente,
            'tesoriere'::ruolo_utente,
            'consigliere'::ruolo_utente,
            'istruttore'::ruolo_utente,
            'socio_approvato'::ruolo_utente,
            'volontario'::ruolo_utente
        ]) THEN
            RAISE EXCEPTION 'Non autorizzato: auto-assegnazione ruolo amministrativo non consentita in registrazione';
        END IF;
    END IF;

    -- [PREVENZIONE UPDATE]:
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id = auth.uid() THEN
            IF OLD.tipo_adesione IS NOT NULL THEN
                -- Utente già registrato: Stretta Immutabilità assoluta del ruolo da client
                IF NEW.ruolo IS DISTINCT FROM OLD.ruolo THEN
                    RAISE EXCEPTION 'Non autorizzato: non è consentito modificare i propri ruoli di sistema. Contattare l''amministratore.';
                END IF;
            ELSE
                -- Fase di prima registrazione (OLD.tipo_adesione IS NULL):
                -- Permesso il cambio tra i ruoli base iniziali (es. da tesserato_esterno di default a socio_in_attesa),
                -- ma blocco categorico contro auto-promozioni a ruoli amministrativi o approvati.
                IF (NEW.ruolo && ARRAY[
                    'presidente'::ruolo_utente,
                    'vice_presidente'::ruolo_utente,
                    'segretario'::ruolo_utente,
                    'tesoriere'::ruolo_utente,
                    'consigliere'::ruolo_utente,
                    'istruttore'::ruolo_utente,
                    'socio_approvato'::ruolo_utente,
                    'volontario'::ruolo_utente
                ]) THEN
                    RAISE EXCEPTION 'Non autorizzato: auto-assegnazione ruolo amministrativo o avanzato non consentita in registrazione';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
