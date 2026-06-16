# BudLog — production deploy runbook

Everything to take BudLog live on the VPS. The app artifacts (Docker stack, deploy
script, nginx, CI) are in the repo; this is the **operator** checklist for the parts that
need your infrastructure, credentials, and DNS. Do these once for the initial cutover;
afterward `git push` to `main` redeploys automatically.

## 0. Prerequisites
- A VPS with Docker + Docker Compose, and a **shared reverse-proxy** container (`shared-nginx`)
  that already terminates TLS for other sites (the box has **no `default_server`**).
- A GitHub repo for BudLog (this code) — none exists yet; create one and `git remote add origin … && git push -u origin main`.
- A domain. Defaults assume `budlog.pl` (apex = web report, `api.budlog.pl` = API). Change in
  `deploy/nginx/budlog.conf`, `docker-compose.prod.yml` (`NEXT_PUBLIC_API_URL`), and `.env.production` if different.
- A separate Telegram bot **and** an alerts chat (`TELEGRAM_CHAT_ID`) for ops notifications.
- `age` keypair for backup encryption (`age-keygen`). Keep the **private** key OFFLINE.
- A **private** GitHub repo to hold encrypted DB backups as Releases.

## 1. DNS
Add A records → VPS IP:
- `budlog.pl`, `www.budlog.pl`, `api.budlog.pl`

## 2. First-time server setup
```bash
ssh user@VPS
sudo mkdir -p /opt/budlog && sudo chown "$USER" /opt/budlog
git clone <your-repo-url> /opt/budlog
cd /opt/budlog
cp .env.production.example .env.production
# Fill EVERY value: strong POSTGRES_PASSWORD, JWT secrets, OPENAI_API_KEY,
# TELEGRAM_BOT_TOKEN, ADMIN_EMAILS, CORS_ORIGIN, REPORT_BASE_URL, NEXT_PUBLIC_API_URL.
$EDITOR .env.production
```

## 3. TLS certificate
```bash
# Issue (or --expand an existing shared cert) to cover all three names:
sudo certbot certonly --webroot -w /var/www/certbot \
  -d budlog.pl -d www.budlog.pl -d api.budlog.pl --expand
```

## 4. nginx
```bash
sudo cp /opt/budlog/deploy/nginx/budlog.conf /opt/shared-nginx/conf.d/budlog.conf
docker exec shared-nginx nginx -t && docker exec shared-nginx nginx -s reload
```

## 5. First deploy
```bash
cd /opt/budlog
bash scripts/deploy.sh
# builds images, starts pg/redis, runs `prisma migrate deploy`, recreates api+web,
# joins shared-nginx to budlog_budlog-network, prunes build cache.
curl -s https://api.budlog.pl/api/v1/health   # → {"status":"ok","db":"ok",...}
```
Open `https://budlog.pl/admin`, sign in with an `ADMIN_EMAILS` account → dashboard loads.

## 6. Telegram webhook (prod runs webhook, not polling)
With `TELEGRAM_WEBHOOK_URL=https://api.budlog.pl` in `.env.production`, the API sets the webhook
on boot. Verify:
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## 7. GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions:

| Secret | For |
|---|---|
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | deploy / infra-watch / backup SSH |
| `AGE_PUBLIC_KEY` | encrypt nightly backups |
| `BACKUP_REPO` (`owner/repo`), `BACKUP_REPO_TOKEN` (contents:write PAT) | publish backups |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | uptime / infra / backup alerts |

Optional repo **variable** `HEALTH_URL` overrides the uptime target.

Create a GitHub Environment named `production` (used by `deploy.yml`).

## 8. Verify automation
- Actions → **Deploy to VPS** → Run workflow → green; `/health` 200.
- Actions → **Uptime Check** / **Infra Watch** / **Backup Database** → Run workflow manually once; backup appears as a Release in `BACKUP_REPO`; kill a container to confirm an alert fires.

## Ongoing deploys
All workflows ship **manual-only** (`workflow_dispatch`) — there is no auto-deploy and no
scheduled jobs until you wire the VPS + secrets. To deploy: Actions → **Deploy to VPS** → Run
workflow (or run `bash scripts/deploy.sh` on the box). To turn on auto-deploy on push and the
nightly backup / uptime / infra schedules, uncomment the `push:` / `schedule:` triggers at the
top of the respective `.github/workflows/*.yml`.

## Schedules
- Uptime: every 5 min · Infra watch: every 30 min · Backup: 02:00 UTC nightly (GFS retention via `prune-backups.sh`).

## See also
- [restore-runbook.md](restore-runbook.md) — restore the DB from an encrypted backup.
- [disaster-recovery-runbook.md](disaster-recovery-runbook.md) — full rebuild.
