# BudLog — implementation roadmap

AI construction diary. Foreman speaks into Telegram → structured log of work / materials /
photos → clean report for the client. Extracted from `ai-budget-assistant` (NestJS skeleton
kept, finance dropped).

Each phase is its own plan file in this folder. Enter a phase, implement it, check the boxes.

## Status at a glance

| Phase | Plan | Status |
|---|---|---|
| 1 — Scaffold (core boots) | [phase-1-scaffold.md](phase-1-scaffold.md) | ✅ **Done** — dockerized DB (5435) + Redis (6380), `init` migration applied, API boots, health/auth/accounts smoke green, 29/29 tests |
| 2 — Domain model + AI capture | [phase-2-domain-and-ai.md](phase-2-domain-and-ai.md) | ✅ **Done** — sites domain + AI voice/photo capture; verified live at @BudlogBot |
| 3 — Client web report + PDF | [phase-3-web-report.md](phase-3-web-report.md) | ✅ **Done** — report API + photo proxy + PDF + /report + public Next.js page (apps/web :3001) |
| 4 — Billing + WhatsApp | [phase-4-billing-whatsapp.md](phase-4-billing-whatsapp.md) | ⬜ Not started |
| 5 — Admin panel + prod deploy | [phase-5-admin-deploy.md](phase-5-admin-deploy.md) | ✅ **Artifacts done** — admin panel + prod Docker + nginx + CI deploy/uptime/backup + ops runbooks. Cutover (VPS/DNS) per docs/ops/deploy-runbook.md |

## Phase 1 — what's DONE vs LEFT

**Done** (4 commits in this repo, verified: typecheck 3/3 workspaces, `nest build`, jest 29/29):
- ✅ Repo copied from ai-budget-assistant, fresh git, mobile/admin/CI dropped
- ✅ API stripped to core: `auth`, `users`, `accounts`, `telegram`, `notifications`, `mail`, `health`
- ✅ Telegram bot reduced to commands-only (`/start`, `/link`, `/help`, `/unlink`, `/account`) + `phase1Placeholder` in 9 langs
- ✅ Prisma schema pruned 50→11 models, validated, client generated
- ✅ Unused deps removed (websocket/slack/stripe/openai/import/pdf); `/health/ai` removed
- ✅ Clean `.env`/`.env.example`, minimal seed, ABA migrations dropped, `CLAUDE.md`, turbo pinned to 2.8.3

**Left:**
- ✅ Dockerized infra: `docker-compose.dev.yml` — Postgres 16 on host **5435**, Redis 7 on **6380** (ports chosen to avoid clashing with budget/scm/accounting locals)
- ✅ `.env` / `.env.example` pointed at the dockerized DB; `prisma migrate dev --name init` applied (`20260616102222_init`), client generated, seed run
- ✅ API boots; smoke green — `GET /health` 200 (`db:ok`), login→`/users/me`→`/accounts` 200, register gated by email verification (expected), bot a no-op without a token
- ⬜ Create a BudLog bot via @BotFather, put token in `.env` to exercise the live `/link` flow (optional until Phase 2)
- ⬜ (optional cleanup) prune `packages/shared-types` / `shared-utils` to API-used types only
- ⬜ Cosmetic: email subjects still say "AI Budget", seed account currency is PLN — rebrand when convenient

## Product surface by phase

- Phase 1–2: **Telegram bot only** (fastest path to a usable product for crews).
- Phase 3: adds a public read-only **web report** link for clients.
- Phase 4: adds **paid plans** + a second channel (WhatsApp).
- Phase 5: ops — **admin panel** + production on the VPS.

## Working agreements

- Follow the dependency order from the source repo's CLAUDE.md: shared-types → shared-utils → prisma → api modules.
- Keep `npm run typecheck` (root) green before each commit; pin turbo at 2.8.3.
- Languages: PL + RU + UA first (crews are often Ukrainian — a differentiator). Bot i18n lives in `apps/api/src/modules/telegram/helpers/i18n.ts`.
- Each phase plan ends with verification commands — run them, don't assume.
