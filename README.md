# BudLog

**Voice-first construction site journal for small crews.** A foreman speaks into Telegram
("poured the foundation, used 40 bags of cement, electrician tomorrow") and the bot keeps a
structured log of work, materials, and photos — then generates a clean read-only web report
and PDF for the client, with no login.

**Repository:** https://github.com/micode-ai/budlog

## Documentation

| | English | Русский |
|---|---|---|
| **Technical** (architecture · API · local setup · how to verify) | [docs/en/TECHNICAL.md](docs/en/TECHNICAL.md) | [docs/ru/TECHNICAL.md](docs/ru/TECHNICAL.md) |
| **User guide** (foreman bot · client report · admin panel) | [docs/en/USER_GUIDE.md](docs/en/USER_GUIDE.md) | [docs/ru/USER_GUIDE.md](docs/ru/USER_GUIDE.md) |

- **Operations:** [docs/ops/deploy-runbook.md](docs/ops/deploy-runbook.md) · [restore](docs/ops/restore-runbook.md) · [disaster recovery](docs/ops/disaster-recovery-runbook.md)
- **Roadmap:** [docs/plans/README.md](docs/plans/README.md)

## Architecture

Turborepo monorepo:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS 10 · Prisma 5 · PostgreSQL · Redis · Telegraf | REST API + Telegram bot |
| `apps/web` | Next.js 14 · Tailwind | Public client report `/r/[token]` + admin panel `/admin` |

Flow: **Telegram → API (Whisper + GPT function-calling) → Postgres → public web report / PDF.**

## Quick start

```bash
# Infra: dockerized Postgres (5435) + Redis (6380)
docker compose -f docker-compose.dev.yml up -d

npm install
cd apps/api && npx prisma migrate dev && npm run db:seed   # alice@test.com / TestPass123
# set OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, ADMIN_EMAILS in apps/api/.env

cd apps/api && npm run dev      # API  http://localhost:3000
cd apps/web && npm run dev      # web  http://localhost:3001
```

Verify: `npm run typecheck && npm test`, then follow the checklist in either USER_GUIDE.

## Status

Phases 1–3 and 5 are implemented (scaffold · domain + AI voice/photo capture · client web
report + PDF · admin panel + production deploy artifacts). Phase 4 (Stripe billing + WhatsApp)
is not started. See the [roadmap](docs/plans/README.md).
