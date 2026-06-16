# BudLog Phase 2 — Domain model + AI voice/photo capture

> **For agentic workers:** use superpowers:subagent-driven-development or executing-plans to run this task-by-task. Steps use `- [ ]` checkboxes.

**Status:** ✅ Done — schema, sites module, AI module, and bot handlers shipped; typecheck + 45 unit tests green; AI function-calling and the full in-Telegram flow (newsite → voice → confirm → /today) verified live at @BudlogBot. Bot copy rebranded to construction; dead finance i18n keys removed.

**Goal:** Turn the commands-only bot into a working site journal: a foreman sends a voice note or photo in Telegram and the bot records structured work entries, material usage, and site photos against a chosen site.

**Architecture:** New `sites` domain module (Site / WorkEntry / MaterialEntry / SitePhoto) following the canonical `(accountId, userId, dto)` service signature. Reintroduce a lean `ai` module (Whisper transcription + GPT function-calling) ported from ai-budget-assistant, but with **construction tools** instead of finance ones. Telegram voice/photo handlers return, calling the new AI + sites services.

**Tech Stack:** NestJS 10, Prisma 5, OpenAI (Whisper + GPT-4 function calling), Telegraf.

**Reuse map (from ai-budget-assistant `D:\Work\micode\ai-budget-assistant`):**
| Reuse as reference | Source file |
|---|---|
| AI module wiring | `apps/api/src/modules/ai/ai.module.ts` |
| Whisper transcription | `apps/api/src/modules/ai/services/whisper.service.ts` |
| OCR/vision | `apps/api/src/modules/ai/services/ocr.service.ts` |
| Function-calling dispatcher pattern | `apps/api/src/modules/ai/services/ai-tools.service.ts` |
| Voice handler | `apps/api/src/modules/telegram/handlers/voice.handler.ts` (pre-strip, in git history of ABA) |
| Photo handler | `apps/api/src/modules/telegram/handlers/photo.handler.ts` |
| Module bootstrap | skill `bootstrap-api-module` |

---

## Task 1: Domain schema (Site, WorkEntry, MaterialEntry, SitePhoto)

**Files:** `apps/api/prisma/schema.prisma`

- [ ] Add models (all `@@map` snake_case, all scoped by `accountId`):
  - `Site` — `id, accountId, name, address?, clientName?, status('active'|'archived'), createdById, createdAt, updatedAt`. Relations: `account`, work/material/photo children, `reportLinks` (Phase 3).
  - `WorkEntry` — `id, accountId, siteId, authorUserId, description, workDate @db.Date, source('voice'|'manual'|'photo'), createdAt`.
  - `MaterialEntry` — `id, accountId, siteId, authorUserId, name, quantity Float, unit?, workEntryId?(optional link), entryDate @db.Date, createdAt`.
  - `SitePhoto` — `id, accountId, siteId, authorUserId, telegramFileId, caption?, takenAt, createdAt`. (Store Telegram `file_id`, not the blob — re-fetch on demand; revisit object storage if needed.)
- [ ] Add `sites Site[]` relation to `Account`.
- [ ] `npx prisma migrate dev --name add_sites_domain` then `npx prisma generate`.
- [ ] Verify: `npx prisma validate` is clean; `npm run typecheck` green.

## Task 2: Sites module (CRUD + service)

**Files:** `apps/api/src/modules/sites/{sites.module.ts,sites.controller.ts,sites.service.ts,dto/index.ts}`

- [ ] Use the `bootstrap-api-module` skill to scaffold with `JwtAuthGuard + AccountContextGuard`.
- [ ] Service methods (signature `(accountId, userId, dto)`, every query filters `accountId`):
  - `listSites(accountId)`, `createSite`, `updateSite`, `archiveSite`
  - `addWorkEntry(accountId, userId, { siteId, description, workDate?, source })`
  - `addMaterialEntry(accountId, userId, { siteId, name, quantity, unit?, entryDate? })`
  - `addPhoto(accountId, userId, { siteId, telegramFileId, caption? })`
  - `getSiteJournal(accountId, siteId, { from?, to? })` → chronological merge of work + materials + photos (used by bot summary and Phase 3 report)
- [ ] Write entry endpoints (POST/PATCH) guarded by `ViewerBlockGuard`.
- [ ] Register `SitesModule` in `app.module.ts`.
- [ ] Tests: `sites.service.spec.ts` — account scoping (no cross-account read), journal ordering. Verify: `npx jest sites`.

## Task 3: AI module (Whisper + construction function-calling)

**Files:** `apps/api/src/modules/ai/{ai.module.ts,services/whisper.service.ts,services/ocr.service.ts,services/site-tools.service.ts,services/chat.service.ts}`

- [ ] Re-add `openai` dependency: `npm i openai@^4` in `apps/api`.
- [ ] Port `whisper.service.ts` and `ocr.service.ts` from ABA (mostly unchanged — they're domain-agnostic).
- [ ] Write `site-tools.service.ts` — OpenAI function schemas for construction:
  - `log_work({ description, workDate? })`
  - `log_materials({ items: [{ name, quantity, unit? }] })`
  - `log_work_with_materials(...)` (combined — voice notes often mix both)
  - `plan_next({ note, forDate? })` (free-text plan for tomorrow)
  - `set_active_site({ siteName })` (resolve site by fuzzy name from the user's sites)
- [ ] `chat.service.ts` — orchestrator: build a system prompt that knows the user's active site + site list, run function calling, dispatch to `SitesService`. **Confirmation flow**: like ABA, write-actions (`log_*`) get a confirm/reject inline keyboard before persisting. Reuse ABA `chat.service.ts` structure.
- [ ] Language detection: reuse ABA `prompt-builder` language detection (PL/RU/UA/EN at minimum).
- [ ] AI cost tracking: keep `UsageLog` writes (model already in schema). Optional in Phase 2.
- [ ] Tests: `site-tools.service.spec.ts` — each tool maps to the right service call with parsed args.

## Task 4: Telegram voice + photo + text handlers

**Files:** `apps/api/src/modules/telegram/handlers/{voice.handler.ts,photo.handler.ts,chat.handler.ts}`, `telegram-bot.service.ts`, `telegram.module.ts`

- [ ] Re-add handlers (reference ABA git history versions, adapt to site tools):
  - `voice.handler.ts` — download voice → Whisper → `chat.service` → confirm card.
  - `photo.handler.ts` — store `file_id` + caption → `addPhoto`; if caption mentions materials/work, also run through chat.service.
  - `chat.handler.ts` — free-form text → chat.service (replaces the Phase 1 placeholder).
- [ ] Add commands: `/site` (list + switch active site via inline keyboard, store active siteId on `TelegramLink.conversationId`-style state or a new field), `/today` (show today's journal for the active site), `/newsite <name>`.
- [ ] Wire confirm/reject callbacks (`ca:` / `ra:` pattern from ABA) to persist or discard the pending action.
- [ ] Update `telegram.module.ts` providers + imports (`AiModule`, `SitesModule`).
- [ ] i18n: add new keys (site picker, confirm prompts, journal labels) in all 9 langs in `helpers/i18n.ts`.
- [ ] Remove the `phase1Placeholder` text fallback (now handled by chat.service).

## Task 5: End-to-end manual verification

- [ ] `/newsite Dom Kowalski` → bot confirms site created + set active.
- [ ] Voice: "залили фундамент, ушло 40 мешков цемента, завтра электрик" → bot shows a confirm card with work entry + material (cement ×40 bags) + plan; confirm → persisted.
- [ ] Photo with caption "армирование 2 этаж" → stored against active site.
- [ ] `/today` → chronological journal with the above.
- [ ] Verify account scoping: a second account's bot user cannot see the first site.
- [ ] `npm run typecheck` green, `npx jest` green.

---

## Done / Left tracker

- ✅ Task 1 — domain schema + migration (`20260616103941_add_sites_domain`: Site/WorkEntry/MaterialEntry/SitePhoto + SiteStatus/EntrySource enums)
- ✅ Task 2 — sites module + tests (CRUD + work/material/photo + chronological journal, all `accountId`-scoped, ViewerBlockGuard on writes; 6/6 unit tests + live e2e smoke green)
- ✅ Task 3 — AI module: WhisperService (voice→text), OcrService (lean vision text), SiteToolsService (5 construction tools + pure parser + dispatch), ChatService (site-aware orchestrator). `openai@^4` added. 10 offline unit tests; live OpenAI function-calling verified (RU phrase → work+material+plan; "switch to X" → set_active_site).
- ✅ Task 4 — telegram handlers: voice (Whisper→chat), photo (file_id→active site + caption capture), text (chat). Commands `/newsite`, `/site`, `/today`. Confirm/reject (`ca:`/`ra:`) + site switch (`site:`) callbacks; pending actions in Redis (10-min TTL). `activeSiteId` added to `TelegramLink` (migration `20260616105625_add_telegram_active_site`) + userState. 19 new i18n keys ×9 langs. phase1Placeholder fallback removed.
- ✅ Task 5 — e2e manual verification (in Telegram: /newsite, voice capture→confirm, photo, /today) — passed live at @BudlogBot

**Follow-ups deferred to a later pass (not blockers):** structured delivery-note OCR (photos currently stored by file_id only); `UsageLog` writes for AI cost tracking.

**Exit criteria:** a foreman can run a whole day from Telegram — create a site, log work/materials by voice, attach photos, review today's journal — with everything account-scoped and confirm-gated.
