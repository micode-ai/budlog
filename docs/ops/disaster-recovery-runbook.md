# BudLog — Disaster Recovery Runbook (Full Server Rebuild)

Use when the production VPS is lost entirely (hardware failure, account loss, destroyed
disk). For a DB-only restore onto a working server, use `restore-runbook.md` instead.

## Prerequisites you MUST have offline (not on the lost VPS)
- The **`age` private key** (`backup-key.txt`) — decrypts the DB backups.
- An **offline copy of `.env.production`** — the prod secrets (DB password, JWT, OpenAI,
  Telegram, ADMIN_EMAILS, CORS_ORIGIN, …). This file lives ONLY on the VPS in normal
  operation; keep a copy in the password manager. Without it the stack cannot be rebuilt.
- Access to the GitHub repos (BudLog code + `budlog-backups`) and DNS.

## 1. Provision a new VPS
- Ubuntu LTS. Install Docker **via apt** (`apt-get install docker-ce docker-compose-plugin`).
- Recreate the SSH access used by CI (`SSH_HOST` may change → update the GitHub Secret).

## 2. Restore the app directory
```bash
sudo mkdir -p /opt/budlog && cd /opt/budlog
git clone <your-repo-url> .
git checkout main
nano .env.production    # paste the saved secrets from the offline copy
```
Bring up (or repoint) the shared `shared-nginx` stack (copy `deploy/nginx/budlog.conf` to its
`conf.d/`, reissue the cert) and point DNS `budlog.pl` / `www` / `api.budlog.pl` at the new server.

## 3. Start datastores and restore the database
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis
# wait for postgres healthy, then restore the latest backup — see restore-runbook.md:
#   download the newest Release asset from budlog-backups
#   age -d -i backup-key.txt budlog-YYYY-MM-DD.dump.age > budlog.dump
#   docker cp budlog.dump budlog-db-prod:/tmp/budlog.dump
#   docker exec budlog-db-prod pg_restore -U budlog -d budlog --clean --if-exists /tmp/budlog.dump
```

## 4. Run migrations and start the app
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile migrate run --rm migrator
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api web
```

## 5. Verify
```bash
curl -sf https://api.budlog.pl/api/v1/health && echo OK
```
Smoke-test: open `https://budlog.pl/admin`, sign in, confirm data is present. Re-set the
Telegram webhook if needed (`getWebhookInfo`).

## Notes
- **Redis** holds cache + the short-lived bot pending-action keys and report-photo cache —
  no restore needed; it repopulates. (`appendonly yes` is enabled for a soft warm-restart, not DR.)
- After recovery, re-check GitHub Secrets that may have changed (`SSH_HOST`), and confirm the
  nightly `backup-db.yml` and `infra-watch.yml` runs succeed against the new host.

## Rebuild rehearsal log
| Date | Scenario | Result | By |
|------|----------|--------|----|
| _not yet rehearsed_ | | | |
