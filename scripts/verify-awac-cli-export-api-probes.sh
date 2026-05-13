#!/usr/bin/env bash
# AWaC real API probes — official CLI dist (cli/dist/index.js) + starter init
# materializes a temp workspace, then exercises:
#   GET  /api/workspace
#   PATCH /api/workspace (allowlist + schema negatives, typed dataModel positive)
#   PATCH /api/workspace/settings (branding negatives + brandKit positive)
#   POST /api/workspace/sandbox-run (negative + local-process positive)
#
# Intentionally does NOT run `npm run build` / `next build`. Requires:
#   (cd cli && npm install)   # once, so dist can resolve zod etc.
#   npm install in scaffolded apps/workspace   # done by this script for next dev
#
# Optional: same as installer --profile workspace when run as:
#   GROWTHUB_LOCAL_CLI_ENTRYPOINT=cli/dist/index.js node packages/create-growthub-local/... 
# This script calls the CLI entrypoint directly (same dist bundle).
#
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
CLI_DIST="${ROOT}/cli/dist/index.js"
FIXTURE="${ROOT}/scripts/fixtures/awac-patch-datamodel-sandbox-probe.json"
PORT="${PORT:-4788}"
OUT="${WS_OUT:-}"

if [[ ! -f "$CLI_DIST" ]]; then
  echo "error: missing $CLI_DIST" >&2
  exit 1
fi

if [[ ! -d "${ROOT}/cli/node_modules" ]]; then
  echo "error: run once: (cd \"${ROOT}/cli\" && npm install) so Node can resolve cli/dist dependencies" >&2
  exit 1
fi

if [[ ! -f "$FIXTURE" ]]; then
  echo "error: missing fixture $FIXTURE" >&2
  exit 1
fi

if [[ -z "$OUT" ]]; then
  OUT="$(mktemp -d /tmp/growthub-awac-probe.XXXXXX)"
fi
rm -rf "$OUT"
mkdir -p "$OUT"

echo "[1/5] starter init (CLI dist) → $OUT"
(cd "${ROOT}/cli" && node dist/index.js starter init --out "$OUT" --name "AWaC API Probe" --json | head -c 500)
echo

WS_APP="$OUT/apps/workspace"
if [[ ! -f "$WS_APP/package.json" ]]; then
  echo "error: missing $WS_APP/package.json" >&2
  exit 1
fi

echo "[2/5] npm install in exported apps/workspace"
(cd "$WS_APP" && npm install --silent 2>/dev/null || npm install)

echo "[3/5] next dev on :$PORT (WORKSPACE_CONFIG_ALLOW_FS_WRITE=true)"
LOG="${TMPDIR:-/tmp}/growthub-awac-next-$PORT.log"
(cd "$WS_APP" && WORKSPACE_CONFIG_ALLOW_FS_WRITE=true NODE_ENV=development npx next dev -p "$PORT" >"$LOG" 2>&1) &
NEXT_PID=$!
cleanup() { kill "$NEXT_PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/api/workspace" >/dev/null; then
    break
  fi
  sleep 0.2
done

BASE="http://127.0.0.1:$PORT"
echo "[4/5] probes → $BASE"

fail() { echo "FAIL: $*" >&2; exit 1; }

c="$(curl -sS -o /tmp/awac_probe_get.json -w '%{http_code}' "$BASE/api/workspace")"
[[ "$c" == "200" ]] || fail "GET /api/workspace expected 200 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_u.json -X PATCH "$BASE/api/workspace" \
  -H 'content-type: application/json' -d '{"branding":{"name":"x"}}')"
[[ "$c" == "400" ]] || fail "PATCH /api/workspace unknown allowlist field expected 400 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_badref.json -X PATCH "$BASE/api/workspace" \
  -H 'content-type: application/json' \
  -d '{"dataModel":{"objects":[{"id":"x","label":"X","objectType":"custom","fields":[{"id":"r","type":"ref","label":"R","refConfig":{"targetObjectType":"custom","targetObjectId":"missing","displayField":"a","cardinality":"many-to-one"}}],"rows":[]}]}}')"
[[ "$c" == "400" ]] || fail "PATCH invalid ref expected 400 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_dm.json -X PATCH "$BASE/api/workspace" \
  -H 'content-type: application/json' -d @"$FIXTURE")"
[[ "$c" == "200" ]] || fail "PATCH valid dataModel expected 200 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_set_bad.json -X PATCH "$BASE/api/workspace/settings" \
  -H 'content-type: application/json' -d '{"name":"only"}')"
[[ "$c" == "400" ]] || fail "PATCH settings without branding expected 400 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_set_ok.json -X PATCH "$BASE/api/workspace/settings" \
  -H 'content-type: application/json' \
  -d '{"branding":{"brandKit":{"colors":{"primary":"#00ff88"}}}}')"
[[ "$c" == "200" ]] || fail "PATCH settings brandKit expected 200 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_sbx_neg.json -X POST "$BASE/api/workspace/sandbox-run" \
  -H 'content-type: application/json' -d '{}')"
[[ "$c" == "400" ]] || fail "POST sandbox-run empty expected 400 got $c"

c="$(curl -sS -w '%{http_code}' -o /tmp/awac_probe_sbx_pos.json -X POST "$BASE/api/workspace/sandbox-run" \
  -H 'content-type: application/json' -d '{"objectId":"obj_sandbox","name":"api-probe"}')"
[[ "$c" == "200" ]] || fail "POST sandbox-run expected 200 got $c"
grep -q '"ok":true' /tmp/awac_probe_sbx_pos.json || fail "sandbox response missing ok:true"

echo "[5/5] all probes passed"
echo "temp workspace: $OUT (delete manually if desired)"
