#!/usr/bin/env bash
# check-pipeline-health.sh
#
# Composable end-to-end readiness check for the creative-video-pipeline kit.
# Wraps existing setup/verify-env.mjs + helpers/check-generative-adapter.sh
# and adds checks that span all three stages (sub-skills present, helpers
# executable, output dir writable, Stage-3 deps).
#
# Usage:
#   bash helpers/check-pipeline-health.sh           # human output, exit non-zero on failure
#   bash helpers/check-pipeline-health.sh --json    # JSON report on stdout
#
# Convention: docs/PIPELINE_KIT_CONTRACT_V1.md (kit-local health helper)
set -uo pipefail

JSON_MODE=0
if [ "${1:-}" = "--json" ]; then
  JSON_MODE=1
fi

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS=()
FAIL=()
WARN=()

record_pass() { PASS+=("$1"); }
record_fail() { FAIL+=("$1"); }
record_warn() { WARN+=("$1"); }

# --- Load .env / .env.local if present (for inherited shell, mjs reads its own) ---
for env_file in "$KIT_ROOT/.env" "$KIT_ROOT/.env.local"; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
  fi
done

# --- 1. .env presence ---
if [ -f "$KIT_ROOT/.env" ] || [ -f "$KIT_ROOT/.env.local" ]; then
  record_pass "env-file-present"
elif [ -f "$KIT_ROOT/.env.example" ]; then
  record_warn "env-file-missing-but-example-available"
else
  record_fail "env-file-missing-and-no-example"
fi

# --- 2. setup/verify-env.mjs passes ---
if [ -f "$KIT_ROOT/setup/verify-env.mjs" ]; then
  if node "$KIT_ROOT/setup/verify-env.mjs" >/dev/null 2>&1; then
    record_pass "verify-env"
  else
    record_fail "verify-env"
  fi
else
  record_fail "verify-env-script-missing"
fi

# --- 3. helpers/check-generative-adapter.sh passes ---
if [ -x "$KIT_ROOT/helpers/check-generative-adapter.sh" ]; then
  if bash "$KIT_ROOT/helpers/check-generative-adapter.sh" >/dev/null 2>&1; then
    record_pass "generative-adapter-env"
  else
    record_fail "generative-adapter-env"
  fi
else
  record_fail "check-generative-adapter-not-executable"
fi

# --- 4. VIDEO_USE_HOME resolves to a directory ---
if [ -n "${VIDEO_USE_HOME:-}" ] && [ -d "${VIDEO_USE_HOME}" ]; then
  record_pass "video-use-home"
else
  record_fail "video-use-home-missing-or-not-a-directory"
fi

# --- 5. ELEVENLABS_API_KEY (Stage 3 transcription) ---
if [ -n "${ELEVENLABS_API_KEY:-}" ]; then
  record_pass "elevenlabs-api-key"
else
  record_fail "elevenlabs-api-key-missing"
fi

# --- 6. output/ writable ---
mkdir -p "$KIT_ROOT/output" 2>/dev/null || true
if [ -w "$KIT_ROOT/output" ]; then
  record_pass "output-dir-writable"
else
  record_fail "output-dir-not-writable"
fi

# --- 7. Stage sub-skills present ---
for stage in brief-generation generative-execution video-edit; do
  if [ -f "$KIT_ROOT/skills/$stage/SKILL.md" ]; then
    record_pass "sub-skill-$stage"
  else
    record_fail "sub-skill-$stage-missing"
  fi
done

# --- 8. Helpers executable ---
for helper in run-pipeline.sh check-generative-adapter.sh check-pipeline-health.sh; do
  helper_path="$KIT_ROOT/helpers/$helper"
  if [ -f "$helper_path" ] && [ -r "$helper_path" ]; then
    record_pass "helper-$helper"
  else
    record_fail "helper-$helper-missing"
  fi
done

# --- 9. pipeline.manifest.json + workspace.dependencies.json present (kit contract v1) ---
for manifest in pipeline.manifest.json workspace.dependencies.json; do
  if [ -f "$KIT_ROOT/$manifest" ]; then
    record_pass "manifest-$manifest"
  else
    record_warn "manifest-$manifest-missing"
  fi
done

# --- Render result ---
if [ "$JSON_MODE" = "1" ]; then
  printf '{'
  printf '"kitId":"growthub-creative-video-pipeline-v1",'
  printf '"convention":"docs/PIPELINE_KIT_CONTRACT_V1.md",'
  printf '"pass":['
  for i in "${!PASS[@]}"; do
    [ "$i" -gt 0 ] && printf ','
    printf '"%s"' "${PASS[$i]}"
  done
  printf '],"warn":['
  for i in "${!WARN[@]}"; do
    [ "$i" -gt 0 ] && printf ','
    printf '"%s"' "${WARN[$i]}"
  done
  printf '],"fail":['
  for i in "${!FAIL[@]}"; do
    [ "$i" -gt 0 ] && printf ','
    printf '"%s"' "${FAIL[$i]}"
  done
  printf ']}\n'
else
  echo "[check-pipeline-health] Kit: growthub-creative-video-pipeline-v1"
  for item in "${PASS[@]}"; do echo "  PASS  $item"; done
  for item in "${WARN[@]}"; do echo "  WARN  $item"; done
  for item in "${FAIL[@]}"; do echo "  FAIL  $item" >&2; done
  echo "[check-pipeline-health] pass=${#PASS[@]} warn=${#WARN[@]} fail=${#FAIL[@]}"
fi

if [ "${#FAIL[@]}" -gt 0 ]; then
  exit 1
fi
exit 0
