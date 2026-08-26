
# WORKFLOW FASE 1 - Diagnosi
/grill-me. Utilizza i tool di lettura per mappare esclusivamente lo stato attuale del codice, i file pertinenti alla richiesta e le direttive architetturali presenti nella LLM Wiki. Non mappare l'intero progetto e non effettuare modifiche. Esponi lo stato attuale dei file coinvolti. Intervistami per allineare le specifiche prima di concludere l'analisi.

# WORKFLOW FASE 2 - Verifica e Pianificazione
Analizza l'output di stato della Fase 1. Esegui una Verifica di Conformità: l'approccio tecnico è compatibile con le dipendenze (incluso Stitch) e l'architettura esposte? Se individui inefficienze strutturali o vulnerabilità, proponi l'alternativa tecnica superiore. Una volta confermata la fattibilità, redigi il piano di implementazione definitivo, strutturato in step logici, atomici e strettamente sequenziali. Non generare codice applicativo in questa fase.

# WORKFLOW FASE 3 - Implementazione
/goal. Implementa il codice seguendo rigorosamente l'ordine degli step atomici definiti nel piano della Fase 2. Non deviare dall'architettura prestabilita, mantieni la coerenza con i componenti Stitch per la UI e rispetta le direttive in SECURITY.md. Terminato il codice, esegui autonomamente i test di validazione. Non dichiarare il task concluso finché tutti i test non passano senza errori di log.

Esegui npm run bump, git commit e git push su GitHub.


# WORKFLOW FASE 4 - Consolidamento Wiki
Aggiorna i file pertinenti della LLM Wiki riflettendo le modifiche architetturali, i nuovi pattern o le logiche implementate con successo in questa sessione. Rispetta la direttiva di storicizzazione dei dati: aggiungi le nuove informazioni senza sovrascrivere distruttivamente lo storico precedente.