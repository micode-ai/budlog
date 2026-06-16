#!/usr/bin/env bash
# Production VPS health probe: root-disk usage + container state.
# Piped over SSH:  ssh user@host 'bash -s' < scripts/infra-check.sh
# Prints a human summary; exits non-zero listing every problem found (so CI can alert).
#
# Optional env (prefix the remote command, e.g. ssh host "DISK_THRESHOLD=90 bash -s" < ...):
#   DISK_THRESHOLD (default 85)  - percent used on / that triggers an alert
#   CONTAINERS     (default the 4 prod containers)
set -uo pipefail

DISK_THRESHOLD="${DISK_THRESHOLD:-85}"
CONTAINERS="${CONTAINERS:-budlog-db-prod budlog-redis-prod budlog-api-prod budlog-web-prod}"

problems=()

# --- Disk usage on / ---
used="$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')"
if [[ -z "$used" ]]; then
  echo "Disk used on /: UNKNOWN"
  problems+=("could not read disk usage on /")
else
  echo "Disk used on /: ${used}% (threshold ${DISK_THRESHOLD}%)"
  if (( used > DISK_THRESHOLD )); then
    problems+=("disk ${used}% > ${DISK_THRESHOLD}% on /")
  fi
fi

# --- Container state ---
for c in $CONTAINERS; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "Container ${c}: MISSING"
    problems+=("container ${c} does not exist")
    continue
  fi
  running="$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null)"
  echo "Container ${c}: running=${running} health=${health}"
  if [[ "$running" != "true" ]]; then
    problems+=("container ${c} not running")
  elif [[ "$health" == "unhealthy" ]]; then
    problems+=("container ${c} unhealthy")
  fi
done

if (( ${#problems[@]} > 0 )); then
  echo "INFRA CHECK FAILED:"
  for p in "${problems[@]}"; do echo "  - $p"; done
  exit 1
fi
echo "INFRA CHECK OK"
