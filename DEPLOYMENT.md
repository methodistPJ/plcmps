# MPS PLC frontend

Place `index.html`, `style.css`, `audit.css`, and `app.js` together in the root of your PLC static website, such as a separate GitHub Pages repository. No build step or package installation is required. The ZIP contains these four files only.

The frontend already points to:

https://script.google.com/macros/s/AKfycbwWu0G4Woci939m6lvBZ2V8n5RkgrrFo3Fqplse8VPO7fltat0v-Fx0zSA00oUe2DI7/exec

Use an HTTP/HTTPS static host for testing and deployment. Google Fonts supplies Playfair Display and DM Sans; local serif/sans-serif fallbacks remain available if fonts cannot load.

## Included

- MPS OPR colours, typography, editorial dashboard, navigation, loading and feedback patterns.
- Four-part PLC form based on the original 2026 PLC document: competency domains, PLC field, tools, dates, FOCUS–IMPROVE–SHARE, group members, preparer and optional verifier.
- Conditional subject/management fields and other-tool entry; required-field, chronological-date and distinct-member validation.
- Staff and configuration loaded from Apps Script; no identity-card fields in the frontend.
- Dashboard counts, recent reports, archive search, year/field/tool filters, grouping by preparer or field, and edit flow.
- Server-generated PDF/Drive integration, returned PDF links, processing states, and session draft recovery.
- No live document preview or photo upload.

## Backend contract

GET `action=getMasterData` returns `{status:"success",staff,config,records}`. Config has `domains`, `bidang`, and `alat`, with `{kod,label}` items. Staff has `ID_Guru`, `Nama_Guru`, and optional `Jawatan`.

GET `action=getRecord&id=...` returns `{status:"success",record}` using the `PLC_Records` column names from the recovered backend.

POST sends JSON with `Content-Type: text/plain;charset=utf-8` and action `savePLC`. Fields: `idPLC`, `tahun`, `tajuk`, `domainKompetensi`, `bidangPLC`, `mataPelajaran`, `pengurusan`, `alatKolaboratif`, `alatLain`, `tarikhMula`, `tarikhAkhir`, `focus`, `improve`, `share`, `ahliKumpulan`, `disediakanOleh`, `disahkanOleh`. Selection values are labels; staff selections are IDs. An empty `idPLC` creates a record; an existing ID updates it.

A successful save must return `status:"success"`, `idPLC`, `pdfUrl`, and optionally `pdfFileId`. PDF layout, Drive creation and replacement of old PDFs are controlled by the existing Apps Script backend. This frontend does not change that backend or its PDF template.

No automatic POST retries are performed. A failed or incomplete response preserves the draft and requires an archive check before resubmission, because the server may have completed processing without delivering its response. Drafts are stored in sessionStorage and are not intended to persist after closing the browser session.

## Verification

Passed local browser checks with isolated fixture responses: dashboard loading, required-field validation, combined-field conditions, other-tool entry, process dates, duplicate-member rejection, successful save and archive insertion, archive search, edit hydration, and phone-width layout without horizontal overflow.

Passed JavaScript syntax and contract tests for Malaysia date conversion, record-to-payload mapping, PDF URL validation, exact GAS action/payload and request format, malformed responses, network/server errors, and absence of automatic POST retries.

The deployed GAS endpoint was inaccessible from the build environment. Live staff/config loading, real saves, and generated PDFs must still be checked from the hosted frontend. No test records were sent to the school backend. Test fixtures are excluded from the deliverables.
