# BudLog Phase 5 — Admin panel + production deploy

**Status:** ✅ Artifacts done — admin module + panel, prod Docker stack, nginx, deploy pipeline, observability/backup CI, and ops runbooks all built and validated locally. Remaining = the real production cutover (VPS/DNS/secrets), which the operator performs via `docs/ops/deploy-runbook.md`.

**Goal:** Ship BudLog to production on the existing Hetzner VPS (shared-nginx box) with a minimal
admin panel for support, plus the ops safety net (health, backups, uptime, deploy pipeline).

**Architecture:** Reuse ABA's entire prod stack — Docker Compose, shared-nginx reverse proxy,
GitHub Actions deploy, nightly encrypted DB backup, uptime + infra watch. New subdomain
(e.g. `api.budlog.pl` / `budlog.pl`) added as its own server block (the box has NO default_server).

**Reuse map:** ABA `docker-compose.prod.yml`, `scripts/deploy.sh`, `.github/workflows/{deploy,uptime-check,backup-db,infra-watch}.yml`, `docs/ops/*runbook*.md`, ABA `apps/admin` for the panel. VPS access in the `prod-vps-ssh-access` memory.

---

## Task 1: Minimal admin panel
- [ ] Reuse `apps/web` (Phase 3) or a separate `apps/admin`: auth-gated pages — Users, Accounts/Companies, Sites overview, basic usage stats.
- [ ] Re-add a slim `admin` module to the API (port from ABA, drop finance KPIs): list users/accounts, impersonation-free support lookups, audit log.
- [ ] `ADMIN_EMAILS` gating (port ABA `AdminGuard`).

## Task 2: Production Docker stack
- [ ] Adapt `docker-compose.prod.yml`: `budlog-db-prod` (postgres:16-alpine), `budlog-redis-prod`, `budlog-api-prod` (set `NODE_OPTIONS=--max-old-space-size` to ~half of limit), `budlog-web-prod`. Named volumes for pg/redis data.
- [ ] `docker/Dockerfile.api` (+ web) — reuse ABA versions.
- [ ] `.env.production` on the VPS (never committed). `CORS_ORIGIN` = explicit origin list (NOT `*`).

## Task 3: nginx + DNS
- [ ] Add `/opt/shared-nginx/conf.d/budlog.conf`: server blocks for `api.budlog.pl`, `budlog.pl` (+ `www` → apex 301). Reuse cert via certbot `--expand` (the box has no default_server — every host needs its own block).
- [ ] DNS A records → VPS IP.

## Task 4: Deploy pipeline + migrations
- [ ] `scripts/deploy.sh`: `git reset --hard`, `npm ci`, build, `prisma migrate deploy`, `up -d --force-recreate`, then `docker image prune -f && docker builder prune -af` (build-cache grows fast on the VPS).
- [ ] `.github/workflows/deploy.yml`: push to `main`/`development` → SSH → deploy.sh → poll `/api/v1/health` up to 120s.
- [ ] Reuse SSH + Telegram secrets.

## Task 5: Observability + DR
- [ ] `uptime-check.yml` (5-min `/health` → Telegram alert), `infra-watch.yml` (disk + container health), `backup-db.yml` (nightly `pg_dump -Fc` → age-encrypted → private repo Release; alert on failure).
- [ ] `json-file` log rotation on all prod containers (`max-size: 10m`, `max-file: 3`).
- [ ] Port `docs/ops/restore-runbook.md` + `disaster-recovery-runbook.md`; keep the age private key OFFLINE + an offline copy of `.env.production`.

---

## Done / Left tracker
- ✅ Task 1 — admin module (API `/admin/{stats,users,accounts,sites}` behind JwtAuthGuard + AdminGuard/ADMIN_EMAILS; 4 guard tests; live-verified) + admin panel (apps/web `/admin` login + `/admin/dashboard` stat cards & Users/Accounts/Sites tables)
- ✅ Task 2 — prod Docker stack: `docker-compose.prod.yml` (budlog-db/redis/api/web + one-shot migrator profile, json-file log rotation, mem limits, healthchecks), `docker/Dockerfile.api` (multi-stage + migrator target, bundles DejaVu fonts), `docker/Dockerfile.web` (Next standalone), `apps/web` `output: standalone`, `.env.production.example`. `docker compose config` validates.
- ✅ Task 3 — nginx: `deploy/nginx/budlog.conf` (server blocks for api.budlog.pl → api:3000, budlog.pl → web:3001, www→apex 301, ACME challenge + HTTPS redirect, certbot --expand note). DNS A records = operator step (see deploy-runbook).
- ✅ Task 4 — deploy pipeline: `scripts/deploy.sh` (git reset main → build → migrate deploy → recreate api+web → wire shared-nginx → prune cache), `.github/workflows/deploy.yml` (push main → SSH → deploy → poll /health 120s). bash -n + YAML validated.
- ✅ Task 5 — observability + DR: workflows `uptime-check` (5-min /health → Telegram), `infra-watch` (30-min disk+containers), `backup-db` (nightly age-encrypted pg_dump → private repo Release, GFS prune); `scripts/{backup-db,infra-check,prune-backups}.sh`; json-file log rotation in compose; `docs/ops/{deploy,restore,disaster-recovery}-runbook.md`. Removed ABA finance/mobile script cruft.

**Operator cutover (not executable from here — needs your VPS/DNS/GitHub):** see `docs/ops/deploy-runbook.md` — create GitHub repo + push, DNS, certbot, copy nginx conf, fill `.env.production`, run `scripts/deploy.sh`, set Actions secrets.

**Exit criteria:** `git push` deploys to prod; health/uptime/backups are green; support can look
up a company in the admin panel; a documented restore path exists.
