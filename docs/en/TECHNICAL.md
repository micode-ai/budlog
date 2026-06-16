# BudLog — Technical documentation

Voice-first construction site journal. A foreman speaks into Telegram ("poured the
foundation, used 40 bags of cement, electrician tomorrow") and the bot keeps a structured
log of work, materials, and photos, then generates a clean read-only web report + PDF for
the client.

> Russian version: [../ru/TECHNICAL.md](../ru/TECHNICAL.md) · User guide: [USER_GUIDE.md](USER_GUIDE.md)

## 1. Architecture

Turborepo monorepo:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS 10 · Prisma 5 · PostgreSQL · Redis · Telegraf | REST API + Telegram bot |
| `apps/web` | Next.js 14 · Tailwind | Public client report `/r/[token]` + admin panel `/admin` |
| `packages/shared-types` | TypeScript | Shared entity/DTO interfaces |
| `packages/shared-utils` | Zod | Shared validation/formatting |

Data flow: **Telegram → API (Whisper + GPT function-calling) → Postgres → public web report / PDF**.

## 2. API modules (`apps/api/src/modules`)

`auth` · `users` · `accounts` · `sites` · `ai` · `reports` · `admin` · `telegram` ·
`notifications` · `mail` · `health` + `common/` (cache, guards, Redis throttler) and
`database/` (PrismaService).

- **Auth** — JWT (`JwtAuthGuard`); register/login, 6-digit email reset & verification codes.
- **Accounts** — owner/editor/viewer membership; `AccountContextGuard` reads `X-Account-Id`. In BudLog: company / foreman / client.
- **Sites** — the construction domain (see §3). Every query is scoped by `accountId`; writes are blocked for `viewer` via `ViewerBlockGuard`.
- **AI** — `WhisperService` (voice→text), `OcrService` (vision text), `SiteToolsService` (5 construction function-calling tools), `ChatService` (orchestrator).
- **Reports** — public, token-guarded site report (JSON + photo proxy + PDF).
- **Admin** — `/admin/*` behind `JwtAuthGuard + AdminGuard` (`ADMIN_EMAILS`).
- **Telegram** — bot: commands + voice/photo/text capture with a confirm/reject flow.

## 3. Data model (Prisma)

Core: `User`, `Account`, `AccountMember`, `AccountInvitation`, `TelegramLink`,
`TelegramLinkCode`, `ChatConversation`, `ChatMessage`, `UsageLog`, `NotificationLog`,
`ScheduledNotification`.

Construction domain:
- **Site** — `accountId, name, address?, clientName?, status(active|archived), createdById`
- **WorkEntry** — `siteId, authorUserId, description, workDate, source(voice|manual|photo)`
- **MaterialEntry** — `siteId, name, quantity, unit?, workEntryId?, entryDate`
- **SitePhoto** — `siteId, telegramFileId, caption?, takenAt` (stores the Telegram `file_id`, not the blob)
- **ReportLink** — `siteId, token@unique, expiresAt?, revoked` (public share link)

`TelegramLink.activeSiteId` holds the foreman's currently-selected site for bot capture.

## 4. AI capture pipeline (LangGraph)

Built on **LangChain + LangGraph**, traced with **LangSmith**.

1. Voice note → `WhisperService.transcribe` → text (auto language). Whisper/OCR OpenAI clients are wrapped with `wrapOpenAI` so they trace to LangSmith.
2. `ChatService.start(text, ctx, source)` runs a **LangGraph** `StateGraph`:
   - `reason` — `ChatOpenAI` (GPT-4o) bound with the 5 construction tools (`log_work`, `log_materials`, `log_work_with_materials`, `plan_next`, `set_active_site`); `SiteToolsService.parseLangchainToolCalls` → structured actions.
   - `confirm` — `interrupt()` pauses the graph (human-in-the-loop). State is durably **checkpointed in Postgres** (`PostgresSaver`), keyed by a thread id.
   - `persist` — on resume, executes actions via `SitesService`.
3. The bot shows a **confirm card** (`ca:<threadId>` / `ra:<threadId>`). On ✅/❌ it calls `ChatService.resume(threadId, 'approve'|'reject')` → the graph resumes from the checkpoint → persist or end. **No write persists before confirmation.**
4. LangSmith tracing is env-gated (`LANGSMITH_TRACING` + `LANGSMITH_API_KEY`); off by default, no-op without a key.

## 5. Endpoint reference (prefix `/api/v1`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness + DB check |
| POST | `/auth/register`, `/auth/login` | — | accounts |
| GET | `/users/me` | JWT | current user |
| POST | `/users/me/telegram-link-code` | JWT + acct | mint a bot link code |
| GET/POST/PATCH | `/accounts…` | JWT | account & membership management |
| GET | `/sites` | JWT + acct | list sites |
| POST | `/sites` · `/sites/work` · `/sites/materials` · `/sites/photos` | JWT + acct (+ViewerBlock) | create site / entries |
| GET | `/sites/:id/journal` | JWT + acct | chronological journal |
| POST/DELETE | `/sites/:id/report-link[/:token]` | JWT + acct (+ViewerBlock) | create/revoke public report link |
| GET | `/public/report/:token` | — | report JSON |
| GET | `/public/report/:token/photo/:photoId` | — | photo bytes (Telegram proxy) |
| GET | `/public/report/:token/pdf?lang=` | — | PDF export |
| GET | `/admin/{stats,users,accounts,sites}` | JWT + Admin | admin panel data |

## 6. Local setup

Prereqs: Docker, Node ≥20. Infra runs in Docker (ports chosen to avoid clashing with other local projects).

```bash
# 1. Infra: Postgres on 5435, Redis on 6380
docker compose -f docker-compose.dev.yml up -d

# 2. Install + migrate + seed
npm install
cd apps/api
npx prisma migrate dev        # applies all migrations
npm run db:seed               # seeds alice@test.com / TestPass123 (admin)

# 3. Secrets — in apps/api/.env set:
#    OPENAI_API_KEY=...      (voice/AI capture)
#    TELEGRAM_BOT_TOKEN=...  (from @BotFather; blank = bot is a no-op)
#    ADMIN_EMAILS=alice@test.com

# 4. Run
cd apps/api && npm run dev    # API on http://localhost:3000
cd apps/web && npm run dev    # web on http://localhost:3001
```

## 7. How to verify (developer)

```bash
npm run typecheck             # all workspaces clean
npm test                      # 58 tests pass

# Health + auth
curl -s localhost:3000/api/v1/health                 # {"status":"ok","db":"ok",...}
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"TestPass123"}' \
  | grep -o '"accessToken":"[^"]*"' | sed 's/.*:"//;s/"//')

# Sites (X-Account-Id = the seeded account)
ACC=$(curl -s localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
curl -s -X POST localhost:3000/api/v1/sites -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC" \
  -H 'Content-Type: application/json' -d '{"name":"Dom Kowalski","clientName":"Jan"}'

# Admin
curl -s localhost:3000/api/v1/admin/stats -H "Authorization: Bearer $TOKEN"
```

For the full bot/report/PDF/admin walkthrough see [USER_GUIDE.md](USER_GUIDE.md).

## 8. Production

See [`../ops/deploy-runbook.md`](../ops/deploy-runbook.md). The prod stack is
`docker-compose.prod.yml` (db/redis/api/web + migrator); `git push` to `main` triggers
`.github/workflows/deploy.yml`. Backups, uptime, and infra alerts run as scheduled workflows.

## 9. Status

Phases 1–3 and 5 are implemented; Phase 4 (Stripe billing + WhatsApp) is not started.
Roadmap: [`../plans/README.md`](../plans/README.md).
