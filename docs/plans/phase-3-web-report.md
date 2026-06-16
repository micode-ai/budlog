# BudLog Phase 3 — Client web report + PDF

**Status:** ✅ Done — report API + photo proxy + PDF + `/report` + the public Next.js web page. Verified live (SSR renders RU/PL, desktop + mobile screenshots). Real-photo lightbox to confirm once a Telegram photo is captured.

**Goal:** A foreman shares a read-only link; the client opens a clean web page showing the
site journal (work log + materials + photos, by date) without logging in. Plus a one-click
PDF export ("акт выполненных работ" draft) — the killer feature for client disputes.

**Architecture:** New `apps/admin`-style Next.js app **OR** server-rendered pages from the API.
Recommendation: a tiny **Next.js app** (`apps/web`) reused from the ABA admin scaffold, public
route `/r/[token]`. Report data comes from a new public, token-guarded API endpoint. PDF via
`pdfkit` (was a dependency in ABA — re-add).

**Reuse map:** ABA `apps/admin` (Next.js 16 + Tailwind + shadcn) for scaffold; ABA backups
module's `@Res()` streaming pattern for PDF response; ABA `reports` module for PDFKit usage.

---

## Task 1: ReportLink model + token endpoint
- [ ] Schema: `ReportLink { id, accountId, siteId, token @unique, expiresAt?, revoked, createdById, createdAt }`. Relation to `Site`. Migrate + generate.
- [ ] `reports` module: `POST /sites/:id/report-link` (auth + ViewerBlock) → creates a `ReportLink` with a random token; returns the public URL.
- [ ] `GET /public/report/:token` (NO auth, excluded from version prefix like webhooks) → validates token (not revoked, not expired) → returns `getSiteJournal` data (work/materials/photos with re-signed Telegram photo URLs or proxied image bytes).
- [ ] `DELETE /sites/:id/report-link/:token` → revoke.
- [ ] Tests: token validation (expired/revoked → 404), account scoping.

## Task 2: Photo serving
- [ ] Decide photo delivery: proxy endpoint `GET /public/report/:token/photo/:photoId` that fetches the Telegram `file_id` via Bot API and streams bytes (https only, no redirects — SSRF hardening like ABA slack file fetch). Cache in Redis short-TTL.
- [ ] Verify a photo renders in a browser via the public URL.

## Task 3: Next.js web app (apps/web)
- [ ] Scaffold `apps/web` from ABA `apps/admin` (strip auth/dashboard; keep Tailwind + shadcn + ky).
- [ ] Public route `app/r/[token]/page.tsx` — fetch report data, render: header (site name, client, date range), a date-grouped timeline of work entries + material tables + a photo grid (lightbox).
- [ ] Branding footer "Журнал ведётся в BudLog" (viral loop — client sees the product).
- [ ] i18n: report page in PL/RU/UA/EN (client's language; default PL).
- [ ] Add `apps/web` to turbo workspaces; `EXPO_PUBLIC`-style `NEXT_PUBLIC_API_URL` baked at build.

## Task 4: PDF export
- [ ] Re-add `pdfkit` + `@types/pdfkit` to `apps/api`.
- [ ] `GET /public/report/:token/pdf` → streams a PDF "акт/raport" — header, period, work table, materials table, photo thumbnails, footer. Stream via `@Res()` (don't return a buffer — memory).
- [ ] Web: "Download PDF" button on the report page.
- [ ] Verify the PDF opens and contains the journal.

## Task 5: Bot integration
- [ ] Telegram command `/report` → generates/returns the active site's report link (and revokes-and-regenerates option).
- [ ] i18n keys for the report link message (9 langs).

---

## Done / Left tracker
- ✅ Task 1 — ReportLink + token endpoints (migration `add_report_links`; POST/DELETE `sites/:id/report-link` auth+ViewerBlock, public `GET public/report/:token`; 7 unit tests; live lifecycle verified: create→200, revoke→404)
- ✅ Task 2 — photo proxy: public `GET public/report/:token/photo/:photoId` streams Telegram bytes (getFile→download, fixed host, no SSRF), Redis 5-min cache, graceful 404 on stale/invalid file_id. 9 unit tests; error paths verified live. Happy-path (real photo) to confirm at Task 3 browser test.
- ✅ Task 3 — apps/web (Next.js 14 + Tailwind): public `/r/[token]` SSR page — Swiss-minimal per docs/design/report-page-spec.md, EB Garamond + PT Sans (Cyrillic; spec's Lato swapped — no Cyrillic), date-grouped timeline (work/materials/photos), photo grid + keyboard lightbox, PDF button, PL/RU/UA/EN switcher, "Logged with BudLog" footer, robots noindex. Runs on :3001; build + typecheck green; desktop/mobile verified via screenshots.
- ✅ Task 4 — PDF export: public `GET public/report/:token/pdf?lang=` streams a PDF (pdfkit) with bundled DejaVu Sans (Cyrillic/Polish), labels en/ru/ua/pl, date-grouped work+materials, best-effort embedded photos, BudLog footer. Verified live: 200 application/pdf, valid %PDF.
- ✅ Task 5 — `/report` bot command: generates the active site's public link (+ PDF hint), viewer-blocked, 9-lang `reportReady` i18n. Wired via ReportsModule into the bot; typecheck + boot verified (createReportLink path already live-tested). In-Telegram confirmation pending.

**Exit criteria:** foreman runs `/report`, sends the link to a client; the client opens a clean
mobile-friendly journal with photos and downloads a PDF — no login, no app install.
