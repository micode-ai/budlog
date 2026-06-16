# BudLog — PostgreSQL restore runbook

Backups are nightly, `age`-encrypted `pg_dump` custom-format archives published as Release
assets in the private repo `$BACKUP_REPO` (tag `backup-YYYY-MM-DD`). See
`.github/workflows/backup-db.yml`.

**You need the OFFLINE age private key (`backup-key.txt`).** Without it, no backup can be
decrypted. It is NOT in CI — retrieve it from the password manager / offline copy.

## 0. Prerequisites
- `age`, `gh`, and `postgresql-client` (v16) installed locally or on the VPS.
- `gh auth login` (or `GH_TOKEN`) with read access to `$BACKUP_REPO`.
- The offline `backup-key.txt`.

## 1. Download the chosen backup
```bash
export BACKUP_REPO=owner/budlog-backups
gh release list --repo "$BACKUP_REPO"                 # pick a tag, e.g. backup-2026-06-16
TAG=backup-2026-06-16
gh release download "$TAG" --repo "$BACKUP_REPO" --dir .
```

## 2. Decrypt
```bash
age -d -i backup-key.txt budlog-${TAG#backup-}.dump.age > budlog.dump
```

## 3. Verify into a SCRATCH database first (never against live data)
```bash
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=budlog postgres:16-alpine
sleep 5
docker cp budlog.dump pg-restore-test:/tmp/budlog.dump
docker exec pg-restore-test pg_restore -U postgres -d budlog --clean --if-exists /tmp/budlog.dump
# Sanity: row counts of key tables
docker exec pg-restore-test psql -U postgres -d budlog -c \
  "select 'users', count(*) from users union all select 'sites', count(*) from sites union all select 'work_entries', count(*) from work_entries;"
docker rm -f pg-restore-test
```
Confirm the counts are in the expected range before touching production.

## 4. Restore into PRODUCTION
> Causes downtime. Announce it. The API must not write during restore.
```bash
cd /opt/budlog
docker compose -f docker-compose.prod.yml stop api web
docker cp budlog.dump budlog-db-prod:/tmp/budlog.dump
docker exec budlog-db-prod pg_restore -U budlog -d budlog --clean --if-exists /tmp/budlog.dump
docker exec budlog-db-prod rm -f /tmp/budlog.dump
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api web
```

## 5. Confirm recovery
```bash
curl -sf https://api.budlog.pl/api/v1/health && echo OK
```

## Integrity checklist
- [ ] Decrypt succeeded (step 2 produced a non-empty `.dump`).
- [ ] Scratch restore succeeded and `pg_restore --list budlog.dump | grep -c '^[0-9]'` > 10.
- [ ] Key-table row counts are sane.
- [ ] `/health` returns 200 after production restore.

## Test-restore log
Record each rehearsal so we know the procedure actually works:

| Date | Tag restored | Scratch row counts OK? | By |
|------|--------------|------------------------|----|
| _none yet_ | | | |
