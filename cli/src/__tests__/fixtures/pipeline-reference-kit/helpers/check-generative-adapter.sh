#!/usr/bin/env bash
set -euo pipefail

ADAPTER="${CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER:-growthub-pipeline}"
ERRORS=0

echo "[check-adapter] Adapter: $ADAPTER"

case "$ADAPTER" in
  growthub-pipeline)
    for var in GROWTHUB_BRIDGE_ACCESS_TOKEN GROWTHUB_BRIDGE_BASE_URL; do
      if [ -z "${!var:-}" ]; then
        echo "[check-adapter] Missing: $var" >&2
        ((ERRORS++))
      fi
    done
    ;;
  byo-api-key)
    if [ -z "${VIDEO_MODEL_PROVIDER:-}" ]; then
      echo "[check-adapter] Missing: VIDEO_MODEL_PROVIDER" >&2
      ((ERRORS++))
    else
      case "$VIDEO_MODEL_PROVIDER" in
        veo)   [ -z "${GOOGLE_AI_API_KEY:-}" ] && echo "[check-adapter] Missing: GOOGLE_AI_API_KEY" >&2 && ((ERRORS++)) || true ;;
        fal)   [ -z "${FAL_API_KEY:-}" ]       && echo "[check-adapter] Missing: FAL_API_KEY"       >&2 && ((ERRORS++)) || true ;;
        runway)[ -z "${RUNWAY_API_KEY:-}" ]    && echo "[check-adapter] Missing: RUNWAY_API_KEY"    >&2 && ((ERRORS++)) || true ;;
        *)     echo "[check-adapter] Unknown VIDEO_MODEL_PROVIDER: $VIDEO_MODEL_PROVIDER" >&2 && ((ERRORS++)) ;;
      esac
    fi
    ;;
  *)
    echo "[check-adapter] Unknown adapter: $ADAPTER (expected growthub-pipeline or byo-api-key)" >&2
    ((ERRORS++))
    ;;
esac

if [ "$ERRORS" -gt 0 ]; then
  echo "[check-adapter] FAIL — $ERRORS error(s)" >&2
  exit 1
fi
echo "[check-adapter] OK"
