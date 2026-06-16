# BudLog — documentation

Voice-first construction site journal for small crews. A foreman speaks into Telegram → the
bot keeps a structured log of work, materials, and photos → the client gets a clean web
report + PDF, no login.

## Documentation / Документация

| | English | Русский |
|---|---|---|
| **Technical** (architecture, API, local setup, how to verify) | [en/TECHNICAL.md](en/TECHNICAL.md) | [ru/TECHNICAL.md](ru/TECHNICAL.md) |
| **User guide** (foreman bot · client report · admin panel + checklist) | [en/USER_GUIDE.md](en/USER_GUIDE.md) | [ru/USER_GUIDE.md](ru/USER_GUIDE.md) |

## Operations
- [ops/deploy-runbook.md](ops/deploy-runbook.md) — production cutover (VPS / DNS / CI / secrets)
- [ops/restore-runbook.md](ops/restore-runbook.md) — restore the DB from an encrypted backup
- [ops/disaster-recovery-runbook.md](ops/disaster-recovery-runbook.md) — full server rebuild

## Planning
- [plans/README.md](plans/README.md) — phased roadmap (Phases 1–3, 5 done; Phase 4 pending)
- [design/report-page-spec.md](design/report-page-spec.md) — web report design spec

## Quick verify

```bash
docker compose -f docker-compose.dev.yml up -d
npm install && npm run typecheck && npm test     # 58 tests
cd apps/api && npm run dev      # API  :3000
cd apps/web && npm run dev      # web  :3001
```
Then follow the **Verification checklist** at the end of either USER_GUIDE.
