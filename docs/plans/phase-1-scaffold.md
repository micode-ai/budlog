# BudLog Phase 1 — Venture Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the new `budlog` repo (construction-diary SaaS) by copying ai-budget-assistant and stripping it down to a booting core: auth + users + accounts + Telegram link flow + notifications + health, with a fresh Prisma baseline.

**Architecture:** Copy-and-strip, not greenfield — we keep the battle-tested NestJS skeleton (guards, cache, throttler, Sentry, mail, push, Telegram linking) and delete every finance-domain module. The construction domain model and the AI pipeline (Whisper/OCR/chat with new function-calling tools) come back in Phase 2 as purpose-built modules. Mobile app and admin dashboard are dropped entirely (Phase 1 product surface = Telegram bot; web report comes in Phase 3, admin in Phase 5).

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, Redis, Telegraf, Turborepo. No Expo, no Next.js in Phase 1.

**New repo location:** `D:\Work\micode\budlog`

> **Execution status (2026-06-10):** Tasks 1–8 DONE in `D:\Work\micode\budlog` (4 commits). Verified: root `typecheck` 3/3 workspaces, `nest build`, jest 29/29. **Task 6 migration + Task 9 live boot DEFERRED** at the user's request — schema is pruned/validated and Prisma client generated, but `prisma migrate dev` and the boot/smoke checks await a DB decision (local Postgres 5432 password or a dedicated container). To finish: set `apps/api/.env` `DATABASE_URL` password, `createdb budlog_dev`, `npx prisma migrate dev --name init`, `npm run dev`, then run the Task 9 smoke steps. Note: turbo pinned to **2.8.3** (2.9.x breaks `tsc` resolution on Windows under turbo).

**End state (definition of done):**
- `npm install && npm run build && npm run typecheck` pass at repo root
- API boots; `GET http://localhost:3000/api/v1/health` returns 200
- Register → login → create account via curl works
- Telegram `/start` + `/link <code>` flow works with a fresh BotFather token
- Fresh git history, initial commits per task

---

## Phase map (this plan = Phase 1 only)

| Phase | Scope | Plan |
|---|---|---|
| 1 | Repo scaffold, stripped core boots | **this document** |
| 2 | Domain model (Site, WorkEntry, MaterialEntry, SitePhoto, ReportLink) + AI module reintroduction (Whisper/OCR/chat with `log_work`/`log_materials`/`plan_next` tools) + bot handlers | separate plan |
| 3 | Read-only client web report (Next.js) + PDF export | separate plan |
| 4 | Billing (Stripe), WhatsApp channel | separate plan |
| 5 | Minimal admin panel, prod deploy on VPS | separate plan |

## Module disposition (decision record)

**KEEP (apps/api):** `auth`, `users` (minus WhatsApp/Slack link endpoints), `accounts`, `telegram` (minus finance handlers), `notifications`, `mail`, `health` + `common/` (cache, filters, guards, types), `database/`, `instrument.ts`.

**DELETE (apps/api):** `expenses`, `incomes`, `budgets`, `categories`, `sync`, `ai`, `analytics`, `app-versions`, `wallet`, `currency-exchange`, `insights`, `subscriptions`, `admin`, `tags`, `projects`, `gamification`, `account-transfers`, `investments`, `encryption`, `reports`, `backups`, `debts`, `referrals`, `import-wise`, `import-bank`, `import-batches`, `user-subscriptions`, `whatsapp`, `slack`.

**DELETE (workspaces):** `apps/mobile`, `apps/admin`. **KEEP:** `packages/shared-types`, `packages/shared-utils` (both pruned to what the API still imports).

**Prisma models KEEP:** `User`, `Account`, `AccountMember`, `AccountInvitation`, `ChatConversation`, `ChatMessage`, `UsageLog`, `TelegramLink`, `TelegramLinkCode`, `NotificationLog`, `ScheduledNotification`. **All other models are deleted** (incl. `Referral`, `Subscription`, all finance/investment/encryption/import/slack/whatsapp tables). Dangling relation fields on kept models are removed; scalar columns (e.g. notification preference booleans) stay even if finance-flavoured — pruning them is cosmetic and deferred.

**Rationale for dropping `ai` in Phase 1:** every AI service (`ai-tools`, `user-context-builder`, `categorization`, `goal-planner`, …) is hard-wired to the finance domain. Re-pointing it at construction entities is Phase 2 work that needs the new schema first. Keeping a gutted AiModule alive through Phase 1 buys nothing.

---

### Task 0: Prerequisites (manual, one-time)

- [ ] **Step 1:** Create a new bot via @BotFather → save token as `TELEGRAM_BOT_TOKEN` (working name: `BudLogBot`).
- [ ] **Step 2:** Ensure local Postgres and Redis are running (same instances used for ai-budget-assistant dev are fine).
- [ ] **Step 3:** Create the dev database:

```bash
psql -U postgres -c "CREATE DATABASE budlog_dev;"
```

Expected: `CREATE DATABASE`.

### Task 1: Copy repo, fresh git

- [ ] **Step 1: Copy working tree (excluding git history, deps, build output)**

From PowerShell:

```powershell
robocopy D:\Work\micode\ai-budget-assistant D:\Work\micode\budlog /E /XD node_modules .git .turbo dist build .expo android ios /XF *.log
```

Expected: exit code ≤ 7 (robocopy success codes), `D:\Work\micode\budlog` exists.

- [ ] **Step 2: Remove ABA-specific loose files**

Delete from the new repo root: `account-statement_*.csv`, `photo_*.jpg`, `docs/marketing/`, `docs/superpowers/`, `user_docs/`, `docs/wiki/`, `CHANGELOG.md`, `CHANGELOG.ru.md`, `CLAUDE.md` (a new one is written in Task 9), `memory-bank/` if present.

- [ ] **Step 3: Init fresh git**

```bash
cd D:/Work/micode/budlog && git init -b main && git add -A && git commit -m "chore: import ai-budget-assistant skeleton as budlog starting point"
```

Expected: one root commit, no upstream remote.

### Task 2: Drop mobile + admin workspaces and CI

**Files:**
- Delete: `apps/mobile/`, `apps/admin/`, `.github/workflows/` (all of them — they target the ABA VPS/secrets; deploy returns in Phase 5)
- Delete: `scripts/generate-help-content.js`, `scripts/build-web.sh`
- Modify: `package.json` (root)

- [ ] **Step 1: Delete directories**

```bash
cd D:/Work/micode/budlog && rm -rf apps/mobile apps/admin .github/workflows scripts/generate-help-content.js scripts/build-web.sh
```

- [ ] **Step 2: Replace root `package.json`** with:

```json
{
  "name": "budlog",
  "version": "0.1.0",
  "private": true,
  "packageManager": "npm@11.4.2",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "clean": "turbo clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "prettier": "^3.2.0",
    "turbo": "^2.3.0",
    "typescript": "^5.3.0"
  },
  "engines": { "node": ">=20.0.0" }
}
```

(Removed: `dev:web`, `generate:help`, React/RN `overrides`, `tweetnacl*` deps — all mobile/E2EE-only.)

- [ ] **Step 3: Reinstall and verify workspace graph**

```bash
cd D:/Work/micode/budlog && rm -f package-lock.json && npm install
```

Expected: install succeeds; only `apps/api`, `packages/shared-types`, `packages/shared-utils` in workspaces.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: drop mobile, admin, CI workflows"
```

### Task 3: Delete finance modules from the API

**Files:**
- Delete: all module directories listed under **DELETE (apps/api)** in the disposition table
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`

- [ ] **Step 1: Delete module directories**

```bash
cd D:/Work/micode/budlog/apps/api/src/modules && rm -rf expenses incomes budgets categories sync ai analytics app-versions wallet currency-exchange insights subscriptions admin tags projects gamification account-transfers investments encryption reports backups debts referrals import-wise import-bank import-batches user-subscriptions whatsapp slack
```

- [ ] **Step 2: Replace `apps/api/src/app.module.ts`** with:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisThrottlerStorage } from './common/cache/redis-throttler-storage';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './modules/mail/mail.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { CacheModule } from './common/cache/cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new RedisThrottlerStorage(config),
      }),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CacheModule,
    MailModule,
    TelegramModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Prune `apps/api/src/main.ts` webhook exclusions** — replace the `setGlobalPrefix` call with:

```typescript
  app.setGlobalPrefix('api/v1', {
    exclude: ['telegram/webhook'],
  });
```

and update the body-parser comment (rawBody is no longer needed for Stripe; keep the `verify` callbacks — Telegram webhook doesn't need them but they're harmless and Phase 4 Stripe will).

- [ ] **Step 4: First error sweep**

```bash
cd D:/Work/micode/budlog/apps/api && npx tsc --noEmit 2>&1 | head -60
```

Expected: FAIL with `Cannot find module` errors in surviving modules that import deleted ones (expect them in `users/`, `telegram/`, `notifications/`, possibly `accounts/`). Do not fix yet — Tasks 4–5 handle them. Record the list.

### Task 4: Strip users module of WhatsApp/Slack link endpoints

**Files:**
- Modify: `apps/api/src/modules/users/users.controller.ts`, `users.service.ts`, `users.module.ts`, `dto/index.ts`

- [ ] **Step 1: Locate the coupling**

```bash
cd D:/Work/micode/budlog/apps/api && grep -n "whatsapp\|slack\|Whatsapp\|WhatsApp\|Slack" -r src/modules/users
```

- [ ] **Step 2: Delete every flagged endpoint/method/import** — the `POST/GET/DELETE /users/me/whatsapp-link[-code]` and `/users/me/slack-link[-code]` handler methods, their service methods, DTOs, and module imports of `WhatsAppModule`/`SlackModule`. Keep the Telegram link endpoints untouched. Rule: delete whole methods, never stub them.

- [ ] **Step 3: Verify the module compiles**

```bash
npx tsc --noEmit 2>&1 | grep "src/modules/users" | head -20
```

Expected: no output (zero errors in `users/`).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(api): remove finance modules and whatsapp/slack link endpoints"
```

### Task 5: Strip Telegram module to link + commands core

**Files:**
- Delete: `apps/api/src/modules/telegram/handlers/chat.handler.ts`, `voice.handler.ts`, `photo.handler.ts`, `expense.handler.ts`, `income.handler.ts`, `category.handler.ts`
- Modify: `telegram.module.ts`, `telegram-bot.service.ts`, `handlers/command.handler.ts`, `types.ts`, `helpers/i18n.ts`

- [ ] **Step 1: Delete finance handlers**

```bash
cd D:/Work/micode/budlog/apps/api/src/modules/telegram/handlers && rm chat.handler.ts voice.handler.ts photo.handler.ts expense.handler.ts income.handler.ts category.handler.ts
```

- [ ] **Step 2: Rewire `telegram.module.ts`** — remove the deleted handlers from `providers` and remove imports of deleted modules (`AiModule`, `ExpensesModule`, `IncomesModule`, `CategoriesModule`, `SubscriptionsModule`, …). Surviving providers: `TelegramService`, `TelegramBotService`, `TelegramLinkService`, `CommandHandler`.

- [ ] **Step 3: Prune `telegram-bot.service.ts`** — remove registrations/dispatch of text/voice/photo handlers and finance callbacks. The bot in Phase 1 answers only commands; non-command messages get the i18n key `phase1Placeholder` (add to `helpers/i18n.ts` in all 8 languages: EN `"I'm being rebuilt for construction sites — commands only for now. Try /help."`, translate the rest in the same register).

- [ ] **Step 4: Prune `command.handler.ts`** — keep `/start`, `/link`, `/help`, `/account`, `/unlink`; delete `/usage` and `/newchat` (their services are gone). Update `/help` text keys accordingly.

- [ ] **Step 5: Prune `types.ts`** — remove finance fields from `TelegramUserState` if any reference deleted types; keep `accountRole`.

- [ ] **Step 6: Full sweep**

```bash
cd D:/Work/micode/budlog/apps/api && npx tsc --noEmit 2>&1 | head -40
```

Expected: remaining errors only in `notifications/` or `common/` if they import deleted modules — apply the same delete-don't-stub rule until output is empty *except* Prisma model errors (fixed in Task 6).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore(telegram): strip bot to link + command core"
```

### Task 6: Prisma schema prune + fresh baseline

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Delete: `apps/api/prisma/migrations/` (entire directory)

- [ ] **Step 1: Edit `schema.prisma`** — delete every `model` block NOT in the KEEP list (see disposition table). Then remove dangling relation fields on kept models (e.g. `User.expenses`, `User.referrals`, `Account.budgets`, …). Keep scalar fields as-is.

- [ ] **Step 2: Validate**

```bash
cd D:/Work/micode/budlog/apps/api && npx prisma validate && npx prisma format
```

Expected: `The schema ... is valid` (validate fails loudly on any dangling relation — iterate until clean).

- [ ] **Step 3: Fresh baseline migration**

```bash
rm -rf prisma/migrations
DATABASE_URL="postgresql://postgres:<pass>@localhost:5432/budlog_dev" npx prisma migrate dev --name init
npx prisma generate
```

Expected: one migration `*_init`, client generated.

- [ ] **Step 4: Fix the last compile errors** — any service still referencing deleted Prisma models now fails `tsc`; delete those code paths (same rule: delete, don't stub).

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): fresh prisma baseline with core models only"
```

### Task 7: Prune shared packages

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts`, `dto/index.ts`, `api/index.ts`
- Modify: `packages/shared-utils/src/validation/index.ts`, `formatting/index.ts`, `constants/index.ts`

- [ ] **Step 1: Find what the API still imports**

```bash
cd D:/Work/micode/budlog && grep -rn "@budget/shared" apps/api/src --include="*.ts" -h | sort -u
```

- [ ] **Step 2: Delete everything not in that list** from both packages (finance entities, sync DTOs, budget-period util, merchant utils, …). Keep auth/user/account types and their Zod schemas. Package names stay `@budget/*` for now (rename is churn; revisit pre-launch).

- [ ] **Step 3: Verify**

```bash
cd D:/Work/micode/budlog && npm run build && npm run typecheck
```

Expected: both pass for all 3 workspaces.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(shared): prune packages to api-used types only"
```

### Task 8: Environment + config cleanup

**Files:**
- Replace: `.env.example`
- Modify: `apps/api/.env.local` (developer creates from example)
- Delete: `docker-compose.prod.yml` ABA services naming stays for Phase 5 — leave file but add `# TODO Phase 5: rename services for budlog VPS` header comment.

- [ ] **Step 1: Replace `.env.example`** with:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/budlog_dev"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="change-me"
JWT_EXPIRES_IN="15m"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
# Phase 2+:
OPENAI_API_KEY=""
# Optional:
SENTRY_DSN=""
FIREBASE_PROJECT_ID=""
FIREBASE_PRIVATE_KEY=""
FIREBASE_CLIENT_EMAIL=""
SMTP_HOST=""
SMTP_USER=""
SMTP_PASS=""
CORS_ORIGIN=""
```

- [ ] **Step 2: Create `.env.local` from it** with real local values + the BotFather token from Task 0.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: budlog env template"
```

### Task 9: Boot + smoke verification

- [ ] **Step 1: Boot the API**

```bash
cd D:/Work/micode/budlog/apps/api && npm run dev
```

Expected: `Application is running on: http://localhost:3000`, no module-resolution errors in the log.

- [ ] **Step 2: Health check**

```bash
curl -s http://localhost:3000/api/v1/health
```

Expected: `{"status":"ok","db":"up",...}`.

- [ ] **Step 3: Auth smoke**

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"pilot@budlog.dev","password":"Test1234!","name":"Pilot"}'
curl -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"pilot@budlog.dev","password":"Test1234!"}'
```

Expected: register 201 with tokens; login 200 with tokens.

- [ ] **Step 4: Telegram smoke (manual)** — in Telegram: `/start` to the new bot → welcome message; generate a link code via `POST /users/me/telegram-link-code` (with Bearer token) → `/link <code>` → bot confirms; `/account` lists the user's account.

- [ ] **Step 5: Run remaining unit tests**

```bash
cd D:/Work/micode/budlog && npm test
```

Expected: PASS (suites for deleted modules are gone with their directories; if a surviving spec references deleted code, delete the dead spec).

- [ ] **Step 6: Write the new `CLAUDE.md`** at repo root — short: architecture table (api + 2 shared packages), kept module list, phase roadmap pointer, commands. Model it on ABA's but ~60 lines.

- [ ] **Step 7: Final commit**

```bash
git add -A && git commit -m "feat: budlog phase 1 core boots — auth, accounts, telegram link, health"
```

---

## Self-review notes

- Coupling unknowns are concentrated in Tasks 4–6 and intentionally handled by tsc-driven delete loops with a single rule (delete, never stub). This is mechanical strip work, not feature work — TDD does not apply; verification = compile + boot + smoke.
- `notifications` module may reference deleted notification types (`budget_alert`, `debt_reminder`, …) in a union type — narrowing the union is part of Task 5 Step 6's sweep.
- `ChatConversation`/`ChatMessage`/`UsageLog` are kept in the schema unused during Phase 1 — deliberate, Phase 2 reuses them as-is.
- Phase 2 plan should be written only after Phase 1's end state is verified, against the real surviving code.
