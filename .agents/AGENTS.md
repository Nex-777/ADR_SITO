# EPIKA Core Rule — Storicizzazione Dati
In Epika preferire SEMPRE la storicizzazione rispetto alla sovrascrittura distruttiva:
- Ruoli di gruppo: usare tabelle con data_inizio/data_fine (non sovrascrivere)
- Entità: usare il flag `attivo` (soft delete) invece di DELETE fisici
- Motivazione: l'evento evolverà negli anni; lo storico delle modifiche sarà fondamentale.
