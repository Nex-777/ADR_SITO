# 🛡️ SECURITY.md — Regole di Sicurezza per Agenti AI

**Progetto**: Adrenalina Club — ADR_SITO  
**Ultima revisione**: 2 Giugno 2026  
**Autorità**: Questa è documentazione normativa. Ogni agente AI che opera su questo codebase **DEVE** rispettare TUTTE le regole qui elencate senza eccezioni.

---

## 0. Principio Fondamentale

> **Mai fidarsi del client.** Qualsiasi dato proveniente dal browser (form, URL, JavaScript console, DevTools) è potenzialmente manipolato. Ogni operazione critica DEVE essere validata e autorizzata lato server (API serverless o database trigger/RLS).

---

## 1. Autenticazione e Autorizzazione

### 1.1 Token Bearer su ogni endpoint API
- **OGNI** endpoint API che accede a dati utente o esegue operazioni DEVE verificare il token Bearer nell'header `Authorization`.
- Il pattern di verifica è:
```javascript
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorizzato' });
}
const token = authHeader.split(' ')[1];
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) {
    return res.status(401).json({ error: 'Token non valido' });
}
// Usare user.id come identità verificata, MAI un ID dal body/query
```

### 1.2 Identità utente dal token, MAI dal client
- L'`utente_id` deve essere estratto dal token JWT verificato server-side.
- **MAI** accettare un `utente_id` dal body della richiesta o dall'URL query parameter.
- Se un'azione richiede un target (es. "approva socio X"), il token identifica CHI fa l'azione, la RLS policy verifica i permessi.

### 1.3 Nessun bypass di autenticazione
- **MAI** inserire parametri URL come `?dev=true`, `?test=true`, `?skip_auth=true` che bypassano l'autenticazione.
- **MAI** creare fallback client-side per operazioni di autenticazione/verifica (es. OTP mock).
- Se un'API fallisce, mostrare un messaggio di errore e un bottone "Riprova", non una via alternativa.

### 1.4 Ruoli assegnati solo dal server
- Il campo `ruolo` nella tabella `utenti` **NON deve MAI** essere impostato dal client JavaScript.
- Il valore è impostato dal `DEFAULT` della colonna (`socio_in_attesa`) e può essere modificato solo da:
  - Stored procedures con `SECURITY DEFINER` che verificano il chiamante
  - Aggiornamenti via `service_role_key` nelle API serverless dopo controlli di autorizzazione

---

## 2. Database (Supabase / PostgreSQL)

### 2.1 Row Level Security (RLS) — Sempre attiva
- **OGNI** nuova tabella DEVE avere RLS abilitata: `ALTER TABLE public.nuova_tabella ENABLE ROW LEVEL SECURITY;`
- **MAI** creare tabelle senza RLS.
- Le policy devono seguire il principio del minimo privilegio.

### 2.2 Pattern RLS standard
```sql
-- SELECT: l'utente vede solo i propri record (o board members vedono tutto)
CREATE POLICY "select_own_or_board" ON public.tabella FOR SELECT
USING (
    utente_id = auth.uid()
    OR public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente', 'segretario', 'tesoriere', 'consigliere')
);

-- INSERT: l'utente può inserire solo per se stesso
CREATE POLICY "insert_own" ON public.tabella FOR INSERT
WITH CHECK (utente_id = auth.uid());

-- UPDATE: l'utente può aggiornare solo i propri record (o admin)
CREATE POLICY "update_own_or_admin" ON public.tabella FOR UPDATE
USING (
    utente_id = auth.uid()
    OR public.get_user_role(auth.uid()) IN ('presidente', 'vice_presidente')
);
```

### 2.3 `SECURITY DEFINER` — Usare con cautela
- Le funzioni `SECURITY DEFINER` bypassano le RLS. OGNI funzione `SECURITY DEFINER` **DEVE** includere un controllo di autorizzazione nelle prime righe:
```sql
IF public.get_user_role(auth.uid()) NOT IN ('presidente', 'vice_presidente', 'segretario') THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
END IF;
```

### 2.4 Nessun `SELECT *` su dati sensibili
- **MAI** usare `.select('*')` su tabelle che contengono PII (dati personali identificabili).
- Specificare SEMPRE le colonne necessarie: `.select('id, nome, cognome, ruolo')`.
- Colonne come `codice_fiscale`, `certificato_medico_url`, `cellulare` devono essere selezionate SOLO quando strettamente necessarie.

### 2.5 Calcoli critici nel database
- Importi monetari (`quota_totale`) DEVONO essere calcolati da trigger/funzioni database, MAI dal client.
- Numeri progressivi (ricevute, verbali) DEVONO usare SEQUENCE o `FOR UPDATE` per evitare race condition.

---

## 3. API Serverless (Vercel Functions)

### 3.1 CORS restrittivo
- **MAI** usare `Access-Control-Allow-Origin: *`
- Usare SEMPRE una whitelist di origini:
```javascript
const ALLOWED_ORIGINS = [
    'https://adrenalinaclub.it',
    'https://www.adrenalinaclub.it'
];
// Aggiungere http://localhost:3000 SOLO in development
```

### 3.2 Rate Limiting
- OGNI endpoint pubblico DEVE avere rate limiting.
- Limiti minimi consigliati:
  | Endpoint tipo | Max richieste | Finestra |
  |---|---|---|
  | Generazione OTP | 3 | 60 secondi |
  | Verifica OTP | 5 | 300 secondi |
  | Checkout/Pagamento | 5 | 3600 secondi |
  | Query dati | 30 | 60 secondi |

### 3.3 Gestione errori — Mai esporre dettagli
```javascript
// ❌ VIETATO:
return res.status(500).json({ error: error.message });
return res.status(500).json({ error: 'Database query error: ' + queryError.message });

// ✅ CORRETTO:
console.error('Dettagli errore interno:', error);
return res.status(500).json({ error: 'Errore interno del server. Riprova più tardi.' });
```

### 3.4 `service_role_key` — Solo server-side
- La `SUPABASE_SERVICE_ROLE_KEY` NON deve MAI apparire nel codice frontend.
- **MAI** usare fallback: `process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY` — se la service key manca, l'endpoint deve fallire, non degradarsi.

### 3.5 Endpoint cron — Protezione fail-closed
```javascript
// ✅ Se il segreto non è configurato, BLOCCA:
if (!process.env.CRON_SECRET || req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```

---

## 4. Frontend (HTML / JavaScript)

### 4.1 No `innerHTML` con dati utente
- **MAI** inserire dati provenienti dal database direttamente in `innerHTML`.
- Usare SEMPRE `escapeHtml()` o `textContent`:
```javascript
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ❌ VIETATO:
row.innerHTML = `<td>${anag.nome}</td>`;
// ✅ CORRETTO:
row.innerHTML = `<td>${escapeHtml(anag.nome)}</td>`;
```

### 4.2 Autorizzazione UI ≠ Sicurezza
- L'hiding di elementi UI con CSS (`classList.add('hidden')`) è per la UX, **NON** per la sicurezza.
- **OGNI** operazione privilegiata (approvazione soci, cambio ruoli, emissione ricevute) DEVE essere protetta da RLS o API autenticata, indipendentemente dal fatto che il bottone sia visibile o nascosto.

### 4.3 No alert() con dati tecnici
- **MAI** mostrare `err.message` o dettagli tecnici in `alert()`.
- Usare un sistema di notifiche in-page con messaggi generici.

### 4.4 No codice di test in produzione
- **MAI** inserire nel codebase:
  - Parametri URL che bypassano funzionalità (`?dev=true`)
  - OTP hardcoded o mock
  - `console.log` con dati sensibili (UUID, email, importi)
  - Timer `setTimeout` che auto-approvano operazioni
  - Condizioni `if (isTestMode)` che saltano validazioni

### 4.5 Librerie CDN con SRI
- OGNI script caricato da CDN DEVE avere l'attributo `integrity` (Subresource Integrity):
```html
<script src="https://cdn.example.com/lib.js"
        integrity="sha384-HASH" crossorigin="anonymous"></script>
```

---

## 5. File Upload

### 5.1 Bucket sempre privati
- **OGNI** bucket Supabase Storage DEVE essere configurato come `public: false`.
- Per visualizzare i file, usare `createSignedUrl()` con scadenza breve (60-300 secondi), **MAI** `getPublicUrl()`.

### 5.2 Validazione file — Defense in depth
1. **Client-side** (UX): attributo `accept` sull'input + controllo size in JavaScript
2. **Storage-side** (Supabase): `allowed_mime_types` configurato nel bucket
3. **Storage RLS**: Policy che verifica `auth.uid() = foldername`
4. **Mai** fidarsi dell'estensione del file — il MIME type viene verificato da Supabase Storage

### 5.3 Path sicuri
- Il percorso di upload DEVE includere l'`auth.uid()` come prima cartella: `${userId}/filename.ext`
- **MAI** permettere al client di specificare un path arbitrario

---

## 6. Dati Sensibili e GDPR

### 6.1 Classificazione dati
| Categoria | Esempi | Protezione richiesta |
|---|---|---|
| **Dati sensibili GDPR Art. 9** | Certificati medici, dati sanitari | Bucket privati, signed URL, accesso minimo |
| **PII (Dati Personali)** | Nome, cognome, codice fiscale, email, telefono, indirizzo | RLS, no `SELECT *`, accesso basato su ruolo |
| **Dati finanziari** | Quote, ricevute, IBAN | RLS, audit log |
| **Credenziali** | API keys, webhook secrets | Solo env vars, mai nel codice o `.env` committato |

### 6.2 Log e tracciabilità
- OGNI operazione che modifica dati (INSERT, UPDATE, DELETE) su tabelle critiche DEVE essere registrata nella tabella `registro_audit_operazioni`.
- L'IP dell'utente non deve essere inviato a servizi terzi (es. `api.ipify.org`). Usare l'header `x-forwarded-for` da Vercel.

### 6.3 Segreti e chiavi
- **MAI** committare chiavi, token, o segreti nel repository Git.
- Le chiavi devono risiedere ESCLUSIVAMENTE nelle Environment Variables della piattaforma di deploy (Vercel).
- La `SUPABASE_ANON_KEY` è pubblica per design e può essere nel frontend.
- La `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET` **NON devono MAI** apparire nel codice sorgente.

---

## 7. Crittografia

### 7.1 Generazione codici sicuri
```javascript
// ❌ VIETATO (prevedibile):
Math.random()
Math.floor(Math.random() * ...)

// ✅ CORRETTO (crittograficamente sicuro):
crypto.randomInt(100000, 999999)  // Node.js
crypto.getRandomValues(new Uint32Array(1))  // Browser/Deno
```

### 7.2 Hashing
- Per dati temporanei (OTP): usare SHA-256 con salt unico per ogni record.
- Per password: SEMPRE delegare a Supabase Auth (usa bcrypt internamente).
- **MAI** implementare hashing password custom.

---

## 8. Deploy e Configurazione

### 8.1 Headers di sicurezza obbligatori
Il file `vercel.json` DEVE includere i seguenti headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### 8.2 `.gitignore` obbligatorio
Il `.gitignore` DEVE includere almeno:
```
.env
.env.local
.env.production
node_modules/
config.js
```

### 8.3 Environment Variables
Prima del deploy in produzione, verificare che TUTTE queste env vars siano configurate su Vercel:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CRON_SECRET`

---

## 9. Checklist Pre-Commit

Prima di ogni commit, l'agente DEVE verificare:

- [ ] Nessuna chiave/segreto hardcoded nel codice
- [ ] Nessun `console.log` con dati sensibili
- [ ] Nessun `Access-Control-Allow-Origin: *`
- [ ] Nessun `Math.random()` per generazione codici
- [ ] Nessun `innerHTML` senza `escapeHtml()`
- [ ] Nessun `SELECT *` su tabelle con PII
- [ ] Nessun bypass di autenticazione (dev mode, mock OTP, etc.)
- [ ] Ogni nuova tabella ha RLS abilitata
- [ ] Ogni nuovo endpoint API ha verifica token Bearer
- [ ] Ogni file upload usa bucket privati e signed URL
