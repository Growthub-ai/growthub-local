#!/usr/bin/env bash
# grep-hooks.sh — 3-pass search over the frozen 500-hook CSV.
#
# Use: bash helpers/grep-hooks.sh "<keyword>" [--limit <n>]
#
# Runs the same 3-pass method documented in skills.md Step 2d against
# ${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/templates/hooks-library/500-winning-hooks.csv.
# Prints an Example / Structure pair for each match. Deterministic; no network.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: bash helpers/grep-hooks.sh <keyword> [--limit N]" >&2
  exit 2
fi

KEYWORD="$1"
shift

LIMIT=20
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

KIT_HOME="${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}"
CSV="${KIT_HOME}/templates/hooks-library/500-winning-hooks.csv"

if [[ ! -f "${CSV}" ]]; then
  echo "Hooks CSV not found at: ${CSV}" >&2
  echo "Set CREATIVE_STRATEGIST_HOME to the kit root, or download the kit to \$HOME/creative-strategist." >&2
  exit 1
fi

python3 - "${CSV}" "${KEYWORD}" "${LIMIT}" <<'PY'
import csv, sys

path, kw, limit = sys.argv[1], sys.argv[2].lower(), int(sys.argv[3])
printed = 0
with open(path, newline="", encoding="utf-8") as f:
    for idx, row in enumerate(csv.reader(f)):
        if len(row) < 2:
            continue
        example, structure = row[0], row[1]
        if kw in example.lower() or kw in structure.lower():
            print(f"[{idx}] EXAMPLE:   {example[:90]}")
            print(f"    STRUCTURE: {structure[:100]}\n")
            printed += 1
            if printed >= limit:
                break
if printed == 0:
    print(f"No matches for '{kw}' in {path}", file=sys.stderr)
    sys.exit(3)
PY
