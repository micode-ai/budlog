# BudLog — AI construction diary

Voice-first construction site journal for small crews. Foreman speaks into Telegram
("poured the foundation, used 40 bags, electrician comes tomorrow") → the bot keeps a
structured log of work, materials, and photos, and generates a clean report for the client.

Built on a proven NestJS skeleton with all finance-domain code removed.

## Status

Phases 1–3 and 5 done; Phase 4 (billing + WhatsApp) not started.

| Phase | Scope | Status |
|---|---|---|
| 1 | Repo scaffold; auth + accounts + Telegram link + health on a fresh Prisma baseline | ✅ |
| 2 | Domain model (`Site`/`WorkEntry`/`MaterialEntry`/`SitePhoto`/`ReportLink`) + AI (Whisper voice → `log_work`/`log_materials`/`plan_next`) + bot capture | ✅ |
| 3 | Read-only client web report (Next.js) + PDF export | ✅ |
| 4 | Billing (Stripe), WhatsApp channel | ⬜ |
| 5 | Admin panel + prod deploy artifacts on VPS | ✅ |

Roadmap & per-phase plans: `docs/plans/`.

## Architecture

Turborepo monorepo:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS 10 + Prisma 5 + PostgreSQL + Redis | REST API backend + Telegram bot |
| `apps/web` | Next.js 14 + Tailwind | Public client report `/r/[token]` (journal + PDF) + admin panel `/admin`. Dev on **:3001** |

No shared `packages/*` — the API and web are self-contained (the parent project's shared
finance types were removed). Mobile (Expo) was dropped; the web report (Phase 3) and admin
panel (Phase 5) replaced the parent's mobile/admin apps.

## API modules

`auth`, `users`, `accounts`, `sites`, `ai`, `reports`, `admin`, `telegram`, `mail`, `health`
+ `common/` (cache, guards, filters, Redis throttler) and `database/` (PrismaService).

- **Auth**: JWT via `@UseGuards(JwtAuthGuard)`. Register/login, 6-digit email reset & change codes.
- **Accounts**: owner/editor/viewer model (`AccountContextGuard` reads `X-Account-Id`). In BudLog this maps to *company / foreman / client-readonly*. Writes are blocked for `viewer` via `ViewerBlockGuard`.
- **Sites**: construction domain — `Site`/`WorkEntry`/`MaterialEntry`/`SitePhoto`, account-scoped journal.
- **AI**: LangChain + **LangGraph** capture pipeline traced by **LangSmith**. `WhisperService`/`OcrService` (OpenAI wrapped via `wrapOpenAI`), `SiteToolsService` (5 construction tools + parsers), `ChatService` = a `StateGraph` (reason → `interrupt` confirm, Postgres-checkpointed → persist); `start()`/`resume(threadId)`. No write persists before confirmation.
- **Reports**: public token-guarded site report (JSON + Telegram photo proxy + PDF via pdfkit).
- **Admin**: `/admin/*` behind `JwtAuthGuard + AdminGuard` (`ADMIN_EMAILS`); web panel under `apps/web/admin`.
- **Telegram**: full capture — voice/photo/text → AI → confirm/reject; commands `/newsite`, `/site`, `/today`, `/report`, `/account`, `/unlink`, `/help`. i18n in 9 langs.

## Prisma schema

Models: `User`, `Account`, `AccountMember`, `AccountInvitation`, `ChatConversation`,
`ChatMessage`, `UsageLog`, `NotificationLog`, `ScheduledNotification`, `TelegramLink`
(+ `activeSiteId`), `TelegramLinkCode`, **`Site`, `WorkEntry`, `MaterialEntry`, `SitePhoto`,
`ReportLink`**. Enums: `AccountType`, `AccountRole`, `InvitationStatus`, `SiteStatus`,
`EntrySource`. `@map("snake_case")` columns. Migrations squashed to a single clean `*_init`
baseline (no production data yet).

## Commands

```bash
npm install        # install all workspaces
npm run build      # turbo build
npm run typecheck  # tsc --noEmit (currently clean)
npm run test       # jest

# API (from apps/api/)
npm run dev                          # nest start --watch
npx prisma migrate dev --name init   # first migration (needs a live DB)
npx prisma generate
npm run db:seed                      # seeds alice@test.com / TestPass123
```

## Local setup notes

- Infra runs in Docker — `docker compose -f docker-compose.dev.yml up -d` brings up Postgres 16 on host **5435** and Redis 7 on **6380** (ports picked to avoid clashing with other local projects on 5432/5433/5434/5436/6379). `down -v` wipes data.
- DB creds (dev): `budlog:budlog@127.0.0.1:5435/budlog_dev` — already wired in `apps/api/.env`. Run `npx prisma migrate dev` then `npm run db:seed` (seeds alice@test.com / TestPass123, also an `ADMIN_EMAILS` admin).
- Telegram: create a new bot via @BotFather, put the token in `.env`. Without it the API boots and the bot is a no-op.
