#!/usr/bin/env bash
# GFS retention for backup releases: keep the most recent N daily, plus the most recent
# weekly anchors (Sunday-dated) and monthly anchors (1st-of-month). Delete everything else.
# Backup release tags are expected as: backup-YYYY-MM-DD
#
# Required env (live mode):
#   BACKUP_REPO   - owner/repo of the private backup repo
#   GH_TOKEN      - PAT with contents:write on BACKUP_REPO (gh reads GH_TOKEN automatically)
# Optional env:
#   KEEP_DAILY (7), KEEP_WEEKLY (4), KEEP_MONTHLY (6)
#   DRY_RUN=1       - print KEEP/DELETE decisions but do not delete
#   RELEASES_FILE   - newline-separated tags to use INSTEAD of querying gh (for testing)
set -euo pipefail

KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"

list_tags() {
  if [[ -n "${RELEASES_FILE:-}" ]]; then
    grep -E '^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}$' "${RELEASES_FILE}" || true
  else
    : "${BACKUP_REPO:?BACKUP_REPO required}"
    gh release list --repo "${BACKUP_REPO}" --limit 1000 \
      | awk '{print $1}' | grep -E '^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}$' || true
  fi
}

# YYYY-MM-DD sorts correctly lexically; newest first.
mapfile -t ALL < <(list_tags | sort -ru)

declare -A KEEP=()

# Daily: the most recent KEEP_DAILY overall.
for t in "${ALL[@]:0:KEEP_DAILY}"; do KEEP["$t"]=1; done

# Weekly: most recent KEEP_WEEKLY whose date is a Sunday (date +%u == 7).
c=0
for t in "${ALL[@]}"; do
  d="${t#backup-}"
  if [[ "$(date -u -d "$d" +%u)" == "7" ]]; then
    KEEP["$t"]=1; c=$((c+1)); (( c >= KEEP_WEEKLY )) && break
  fi
done

# Monthly: most recent KEEP_MONTHLY whose day-of-month is 01.
c=0
for t in "${ALL[@]}"; do
  d="${t#backup-}"
  if [[ "$(date -u -d "$d" +%d)" == "01" ]]; then
    KEEP["$t"]=1; c=$((c+1)); (( c >= KEEP_MONTHLY )) && break
  fi
done

rc=0
for t in "${ALL[@]}"; do
  if [[ -n "${KEEP[$t]:-}" ]]; then
    echo "KEEP   $t"
  else
    echo "DELETE $t"
    if [[ "${DRY_RUN:-}" != "1" ]]; then
      gh release delete "$t" --repo "${BACKUP_REPO}" --yes --cleanup-tag || rc=1
    fi
  fi
done
exit "$rc"
