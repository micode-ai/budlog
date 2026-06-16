#!/usr/bin/env bash
# Deploy BudLog on the VPS. Pulls latest main, builds, migrates, recreates services,
# wires the shared nginx, and prunes build cache. Run from /opt/budlog (or via deploy.yml).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/budlog}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
# Shared reverse-proxy container + the compose network it must join to resolve services.
SHARED_NGINX="${SHARED_NGINX:-shared-nginx}"
BUDLOG_NETWORK="${BUDLOG_NETWORK:-budlog_budlog-network}"

if docker compose version &>/dev/null; then DC="docker compose"; else DC="docker-compose"; fi

cd "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found in $APP_DIR" >&2
  exit 1
fi
if ! grep -q "POSTGRES_PASSWORD=" "$ENV_FILE" || grep -q "POSTGRES_PASSWORD=$" "$ENV_FILE"; then
  echo "ERROR: POSTGRES_PASSWORD is not set in $ENV_FILE" >&2
  exit 1
fi

echo "=== Pulling latest code ($DEPLOY_BRANCH) ==="
git fetch origin
git reset --hard "origin/${DEPLOY_BRANCH}"

echo "=== Cleaning stale containers ==="
docker container prune -f 2>/dev/null || true

echo "=== Building images ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile migrate build api web migrator

echo "=== Starting infrastructure ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis

echo "Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  status=$($DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q postgres | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  [[ "$status" == "healthy" ]] && { echo "Postgres healthy."; break; }
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Postgres did not become healthy in time" >&2
    $DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs postgres
    exit 1
  fi
  echo "  ($i/30) postgres: $status — waiting 3s..."
  sleep 3
done

echo "=== Running migrations ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile migrate run --rm migrator

echo "=== Recreating application services ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate api web
sleep 10

echo "=== Wiring shared nginx ==="
if docker ps -q -f "name=${SHARED_NGINX}" | grep -q .; then
  docker network connect "${BUDLOG_NETWORK}" "${SHARED_NGINX}" 2>/dev/null || true
  docker exec "${SHARED_NGINX}" nginx -s reload 2>/dev/null || true
  echo "${SHARED_NGINX} connected and reloaded."
else
  echo "WARNING: ${SHARED_NGINX} not found — skipping nginx wiring."
fi

echo "=== Status ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo "=== Pruning images + build cache ==="
docker image prune -f
# Build cache grows several GB per deploy (images built on the VPS) — prune each time.
docker builder prune -af

echo "=== Deployment complete ==="
