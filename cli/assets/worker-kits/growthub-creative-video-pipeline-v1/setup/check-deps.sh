#!/usr/bin/env bash
set -euo pipefail

PASS=0; FAIL=0

check() {
  if command -v "$1" &>/dev/null; then
    echo "  [ok] $1"
    ((PASS++))
  else
    echo "  [missing] $1"
    ((FAIL++))
  fi
}

echo "=== growthub-creative-video-pipeline-v1 dependency check ==="
echo ""
echo "CLI tools:"
check growthub
check node
check npm
check ffmpeg

echo ""
echo "Optional (video-use fork):"
if [ -n "${VIDEO_USE_HOME:-}" ] && [ -d "$VIDEO_USE_HOME" ]; then
  echo "  [ok] VIDEO_USE_HOME=$VIDEO_USE_HOME"
else
  echo "  [missing] VIDEO_USE_HOME — set and point to video-use fork clone"
fi

echo ""
echo "Environment:"
for var in CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER ELEVENLABS_API_KEY; do
  if [ -n "${!var:-}" ]; then
    echo "  [ok] $var"
  else
    echo "  [missing] $var"
  fi
done

ADAPTER="${CREATIVE_VIDEO_PIPELINE_GENERATIVE_ADAPTER:-growthub-pipeline}"
if [ "$ADAPTER" = "growthub-pipeline" ]; then
  for var in GROWTHUB_BRIDGE_ACCESS_TOKEN GROWTHUB_BRIDGE_BASE_URL; do
    if [ -n "${!var:-}" ]; then
      echo "  [ok] $var"
    else
      echo "  [missing] $var (required for growthub-pipeline adapter)"
    fi
  done
elif [ "$ADAPTER" = "byo-api-key" ]; then
  for var in VIDEO_MODEL_PROVIDER; do
    if [ -n "${!var:-}" ]; then
      echo "  [ok] $var"
    else
      echo "  [missing] $var (required for byo-api-key adapter)"
    fi
  done
fi

echo ""
echo "Result: $PASS ok, $FAIL missing"
[ "$FAIL" -eq 0 ] && echo "All required dependencies present." || echo "Fix missing items before running the pipeline."
