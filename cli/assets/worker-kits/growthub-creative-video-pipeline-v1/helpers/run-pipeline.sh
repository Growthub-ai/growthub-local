#!/usr/bin/env bash
set -euo pipefail

# Wraps `growthub pipeline execute` for Stage 2 generative execution.
# Usage: run-pipeline.sh <workflow> <json-payload> [output-dir]
#
# Args:
#   workflow     — e.g. video-generation
#   json-payload — DynamicRegistryPipeline JSON string
#   output-dir   — where to write the NDJSON trace (default: ./output/pipeline-trace.ndjson)

WORKFLOW="${1:?workflow required}"
PAYLOAD="${2:?json-payload required}"
OUTPUT_DIR="${3:-./output}"

mkdir -p "$OUTPUT_DIR"
TRACE="$OUTPUT_DIR/pipeline-trace.ndjson"

if ! command -v growthub &>/dev/null; then
  echo "[run-pipeline] growthub CLI not found. Install with: npm install -g @growthub/cli" >&2
  exit 1
fi

echo "[run-pipeline] Executing workflow: $WORKFLOW"
growthub pipeline execute --workflow "$WORKFLOW" --input "$PAYLOAD" 2>&1 | tee "$TRACE"
echo "[run-pipeline] Trace written to $TRACE"
