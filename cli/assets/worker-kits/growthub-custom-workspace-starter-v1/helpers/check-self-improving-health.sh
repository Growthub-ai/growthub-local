#!/usr/bin/env bash
# helpers/check-self-improving-health.sh
# Self-improving workspace health check (optional feature extension).
#
# Usage: bash helpers/check-self-improving-health.sh [--json]
# Returns non-zero when any FAIL check is found.
set -euo pipefail

FORK_DIR=".growthub-fork"
JSON_MODE=false
[[ "${1:-}" == "--json" ]] && JSON_MODE=true

pass=()
warn=()
fail=()

# Core governed primitives
[[ -f "SKILL.md" ]]               && pass+=("SKILL.md present") || fail+=("SKILL.md missing")
[[ -f "templates/project.md" ]]   && pass+=("templates/project.md present") || warn+=("templates/project.md missing")
[[ -f "templates/self-eval.md" ]] && pass+=("templates/self-eval.md present") || warn+=("templates/self-eval.md missing")
[[ -d "helpers" ]]                && pass+=("helpers/ present") || warn+=("helpers/ missing")
[[ -d "skills" ]]                 && pass+=("skills/ present") || warn+=("skills/ missing")

# Fork state
[[ -d "${FORK_DIR}" ]]            && pass+=(".growthub-fork/ exists") || warn+=(".growthub-fork/ missing — run: growthub kit fork register .")
[[ -f "${FORK_DIR}/trace.jsonl" ]] && pass+=("trace.jsonl present") || warn+=("trace.jsonl missing")

# Self-improving feature checks (optional)
[[ -d "${FORK_DIR}/capabilities/proposals" ]] \
  && pass+=("capabilities/proposals/ exists ($(ls "${FORK_DIR}/capabilities/proposals/"*.json 2>/dev/null | wc -l | tr -d ' ') proposals)") \
  || warn+=("No proposals yet — run: growthub workspace improve propose --from-run demo")
[[ -d "${FORK_DIR}/capabilities/promoted" ]] \
  && pass+=("capabilities/promoted/ exists ($(ls "${FORK_DIR}/capabilities/promoted/"*.json 2>/dev/null | wc -l | tr -d ' ') promoted)") \
  || pass+=("No promoted capabilities yet (ok)")
[[ -f "helpers/propose-capability.mjs" ]] && pass+=("propose-capability.mjs present") || warn+=("propose-capability.mjs missing")
[[ -f "helpers/promote-capability.mjs" ]] && pass+=("promote-capability.mjs present") || warn+=("promote-capability.mjs missing")

PASS_COUNT=${#pass[@]}
WARN_COUNT=${#warn[@]}
FAIL_COUNT=${#fail[@]}

if $JSON_MODE; then
  printf '{\n  "pass": [%s],\n  "warn": [%s],\n  "fail": [%s],\n  "summary": "pass=%d warn=%d fail=%d"\n}\n' \
    "$(printf '"%s",' "${pass[@]:-}" | sed 's/,$//')" \
    "$(printf '"%s",' "${warn[@]:-}" | sed 's/,$//')" \
    "$(printf '"%s",' "${fail[@]:-}" | sed 's/,$//')" \
    "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
else
  echo ""
  echo "Self-Improving Workspace Health"
  echo "================================"
  for m in "${pass[@]:-}"; do echo "  PASS  $m"; done
  for m in "${warn[@]:-}"; do echo "  WARN  $m"; done
  for m in "${fail[@]:-}"; do echo "  FAIL  $m"; done
  echo ""
  echo "  pass=${PASS_COUNT} warn=${WARN_COUNT} fail=${FAIL_COUNT}"
  echo ""
fi

[[ ${FAIL_COUNT} -gt 0 ]] && exit 1 || exit 0
