#!/usr/bin/env bash
# Dump the production PostgreSQL DB over SSH, sanity-check it, and encrypt with age.
# Runs ON the GitHub Actions runner (not the VPS).
#
# Required env:
#   SSH_HOST, SSH_USER   - VPS connection (unless LOCAL_DUMP is set)
#   AGE_PUBLIC_KEY       - age recipient public key (age1...)
# Optional env:
#   SSH_KEY_FILE         - path to the private SSH key (else ssh default identities)
#   PG_CONTAINER (budlog-db-prod), PG_USER (budlog), PG_DB (budlog)
#   OUT_DIR (.), MIN_DUMP_BYTES (10240), MIN_OBJECTS (10)
#   LOCAL_DUMP           - path to an existing plaintext custom-format dump; skips SSH (testing)
#
# Output (stdout, machine-readable KEY=VALUE; human logs to stderr):
#   ENCRYPTED_FILE=<path>  DUMP_BYTES=<n>  OBJECT_COUNT=<n>
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-budlog-db-prod}"
PG_USER="${PG_USER:-budlog}"
PG_DB="${PG_DB:-budlog}"
OUT_DIR="${OUT_DIR:-.}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-10240}"
MIN_OBJECTS="${MIN_OBJECTS:-10}"

STAMP="$(date -u +%Y-%m-%d)"
DUMP_FILE="${OUT_DIR}/${PG_DB}-${STAMP}.dump"
ENC_FILE="${DUMP_FILE}.age"

if [[ -n "${LOCAL_DUMP:-}" ]]; then
  echo "Using LOCAL_DUMP=${LOCAL_DUMP} (skipping SSH dump)" >&2
  cp "${LOCAL_DUMP}" "${DUMP_FILE}"
else
  : "${SSH_HOST:?SSH_HOST required}"
  : "${SSH_USER:?SSH_USER required}"
  echo "Dumping ${PG_DB} from container ${PG_CONTAINER} on ${SSH_HOST}..." >&2
  SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)
  [[ -n "${SSH_KEY_FILE:-}" ]] && SSH_OPTS+=(-i "${SSH_KEY_FILE}")
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    "docker exec -i ${PG_CONTAINER} pg_dump -U ${PG_USER} -d ${PG_DB} -Fc" \
    > "${DUMP_FILE}"
fi

DUMP_BYTES="$(wc -c < "${DUMP_FILE}" | tr -d '[:space:]')"
echo "Dump size: ${DUMP_BYTES} bytes" >&2
if (( DUMP_BYTES < MIN_DUMP_BYTES )); then
  echo "ERROR: dump is only ${DUMP_BYTES} bytes (< ${MIN_DUMP_BYTES}); aborting." >&2
  exit 1
fi

# Sanity: a valid custom-format archive lists its objects; entries start with a numeric dumpId.
OBJECT_COUNT="$(pg_restore --list "${DUMP_FILE}" | grep -c '^[0-9]' || true)"
echo "Archive object count: ${OBJECT_COUNT}" >&2
if (( OBJECT_COUNT < MIN_OBJECTS )); then
  echo "ERROR: archive lists only ${OBJECT_COUNT} objects (< ${MIN_OBJECTS}); suspect a bad dump." >&2
  exit 1
fi

: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY required}"
echo "Encrypting with age..." >&2
age -r "${AGE_PUBLIC_KEY}" -o "${ENC_FILE}" "${DUMP_FILE}"
rm -f "${DUMP_FILE}"
echo "Wrote ${ENC_FILE}" >&2

echo "ENCRYPTED_FILE=${ENC_FILE}"
echo "DUMP_BYTES=${DUMP_BYTES}"
echo "OBJECT_COUNT=${OBJECT_COUNT}"
