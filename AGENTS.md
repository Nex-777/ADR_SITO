# LLM Wiki Schema - AGENTS.md

This workspace utilizes an **LLM Wiki** designed for persistent, compounding knowledge accumulation about the Adrenalina Club website and portal application. Any AI agent operating in this repository must adhere to the rules, structure, and workflows defined in this document, as well as the gold-standard security rules defined in [SECURITY.md](SECURITY.md).

---

## 1. Directory Structure

All wiki files reside in the `/wiki` folder at the root of the project:
- `/wiki/index.md` – Content-oriented page directory (Table of Contents). Must be updated whenever new wiki pages are added/removed.
- `/wiki/log.md` – Chronological transaction ledger of all wiki operations (e.g., ingest, query, lint, edit).
- `/wiki/*.md` – Topic-specific, interlinked concept and entity pages.

All code files (frontend, API, database setups) are treated as **Raw Sources** and are immutable from the perspective of the wiki (the wiki documents them, it does not copy their logic directly).

---

## 2. Agent Rules & Conventions

When modifying, writing, or reading the wiki, you **MUST** follow these practices:
1. **Markdown Formatting**: Use clean GitHub-flavored markdown.
2. **Interlinking**: Always link related pages using standard relative markdown links, e.g., `[Registration Flow](registration_flow.md)`.
3. **No Placeholders**: Never write placeholders like `TODO` or `Insert details here`. If details are missing, flag it as a data gap in `index.md` or perform a codebase look-up.
4. **File Citations**: When citing logic from raw sources, create direct references to source files in the repo using relative syntax, e.g., `[otp.js](../api/otp.js)`.
5. **Versioning Rule**: Whenever you push code to GitHub (`git push`), you MUST increment the application version number in the HTML/JS headers by 1 (e.g. from 1.02.32 to 1.02.32) and explicitly inform the user of the newly pushed version. **You must always check the absolute latest version from the git commit log before bumping (do not rely on hardcoded script files or package.json unless verified). Also, you must always include the version number in the commit message/title (which determines the Vercel deployment title) so that the user can verify the build easily.**

---

## 3. Operations

### 3.1. Ingestion Workflow
When a new file, feature, or document is added to the codebase:
1. Read and analyze the raw source.
2. Update relevant concept/entity pages in `wiki/`. Create new pages if necessary.
3. Keep cross-references up to date.
4. Update `wiki/index.md` if any page structure has changed.
5. Append an entry to `wiki/log.md` following this exact pattern:
   ```markdown
   ## [YYYY-MM-DD] ingest | Topic/File Name
   - Summary of what was documented or modified.
   ```

### 3.2. Querying Workflow
When answering questions about the project, refer to `wiki/index.md` to identify relevant concept pages, read them to synthesize the answer, and provide citations.

### 3.3. Lint Workflow
Regularly run a lint pass to verify:
- Broken internal links.
- Contradictory information (e.g., outdated endpoints vs current endpoints).
- Orphan pages (no incoming links).
- Concept gaps.
