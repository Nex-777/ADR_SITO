# Implementazione Grafo Dinamico (Force-Directed Network) per Organigramma EPIKA

L'obiettivo è sostituire il diagramma statico Mermaid con una rete relazionale interattiva e dinamica, utilizzando la libreria ad alte prestazioni **Force-Graph (HTML5 Canvas)**, visualizzabile in "Dash Generale" solo da Admin e Direttivi.

## User Review Required

> [!IMPORTANT]
> **Scelta della Libreria:** Verrà utilizzata `force-graph` (via unpkg CDN) che renderizza su un Canvas HTML5 ad altissime prestazioni, perfetto per visualizzare centinaia di nodi (profili, gruppi, ruoli SCAB) senza rallentamenti, con un look "dark/glowing" simile a Obsidian (Allegato 3).
> **Abbinamento Nomi SCAB:** I ruoli SCAB (Validatori/Allenatori) in EPIKA sono salvati come testo in `epika_opzioni`. Il grafo tenterà di abbinare "Nome Opzione" $\rightarrow$ "Nome di Battaglia" per unire il nodo dell'Allenatore a quello del suo Profilo fisico.

## Proposed Changes

---

### Frontend / UI Container (epika.html)

Sostituzione del wrapper Mermaid con un container dedicato al canvas Force-Graph e introduzione di una barra di filtraggio (Tutti, Solo Direttivi, Solo SCAB, Solo Storici).

#### [MODIFY] epika.html
- **Rimozione:** `<script src="https://cdn.jsdelivr.net/npm/mermaid..."></script>` (testata).
- **Aggiunta:** `<script src="https://unpkg.com/force-graph"></script>` (testata).
- **Modifica DOM (`#epk-adm-tab-dash`):**
  - Sostituire `<div id="epk-mermaid-container" class="mermaid">...</div>` con `<div id="epk-network-container" style="width:100%; height: 700px;"></div>`.
  - Aggiungere una select di filtro: `<select id="epk-network-filter" onchange="renderOrganigrammaNetwork()"><option value="all">🌐 Vista Globale</option><option value="direttivi">🏛️ Solo Direttivi</option><option value="scab">⚔️ Solo Rete SCAB</option><option value="storici">🛡️ Solo Gruppi Storici</option></select>`.

---

### Logica di Rendering e Mappatura Relazioni (epika.js)

Riscrittura della funzione che genera l'organigramma. Invece di generare una stringa testuale TD, scaricheremo tutti i dati e costruiremo un array JSON di Nodi e Archi (Links).

#### [MODIFY] epika.js
- **Sostituzione Funzione:** Sostituire interamente `renderOrganigrammaMermaid()` con `renderOrganigrammaNetwork()`.
- **Raccolta Dati (Promise.all):**
  - `epika_gruppi_lavoro`
  - `epika_gruppi_storici`
  - `epika_profili` (nome_di_battaglia, gruppo_lavoro_ids, gruppo_storico_id, allenatore_id, ruolo_combattimento)
  - `epika_scab_abbinamenti` (per legare validatori ad allenatori)
  - `epika_opzioni` (per risolvere i nomi degli ID allenatori)
- **Generazione Nodi (Nodes):**
  - **Direttivi/Gruppi Lavoro:** Nodi quadrati o esagonali (rossi/oro), raggio basato su importanza (es. Direttivo EPIKA = Raggio Max).
  - **Gruppi Storici:** Nodi verdi/bronzo.
  - **Tesserati (Profili):** 
    - Combattenti (Grigio chiaro)
    - Non Combattenti (Grigio scuro)
    - Ruoli speciali (Validatori/Allenatori in blu, Capi Gruppo con stroke dorato). Dimensioni scalate per importanza (es. Capogruppo più grande del membro base).
- **Generazione Archi (Links):**
  - `Link Direttivo`: da Profilo a Gruppo Lavoro.
  - `Link Appartenenza`: da Profilo a Gruppo Storico.
  - `Link Leadership`: da Profilo (se capogruppo_id/vice) a Gruppo Storico.
  - `Link Addestramento (SCAB)`: da Allievo (Profilo) ad Allenatore (Profilo/Opzione), e da Allenatore a Validatore.
- **Inizializzazione `ForceGraph()`:**
  - Rendering su `#epk-network-container`.
  - Configurazione fisica (`d3Force`) per distanziare i cluster.
  - Interattività: `onNodeHover` (evidenziazione nodo e link connessi, dimming del resto), `nodeCanvasObject` (rendering custom per icone, colori e label al passaggio del mouse o sempre visibili in piccolo per i gruppi macro).

---

## Verification Plan

### Manual Verification
- Accedere al portale come Admin/Direttivo e navigare in "Dash Generale".
- Verificare il caricamento e la fluidità del grafo con tutti i tesserati.
- Testare i filtri (selezionare "Solo SCAB" e verificare che appaiano solo le relazioni Allievo $\rightarrow$ Allenatore $\rightarrow$ Validatore).
- Hover con il mouse su un Capogruppo: verificare che mostri il tooltip, che si illumini l'arco verso il suo Gruppo Storico e l'arco verso i suoi eventuali Direttivi.
- Click/Drag: spostare un nodo centrale per testare il motore fisico e la leggibilità.
