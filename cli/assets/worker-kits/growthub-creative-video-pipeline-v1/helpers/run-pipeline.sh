#!/usr/bin/env bash
set -euo pipefail

# Wraps `growthub pipeline execute` for Stage 2 generative execution.
# Usage: run-pipeline.sh <json-payload-or-file> [output-dir]
#
# Args:
#   payload    — DynamicRegistryPipeline JSON string or path to a JSON file
#   output-dir — where to write the NDJSON trace (default: ./output)

PAYLOAD="${1:?DynamicRegistryPipeline JSON payload or file path required}"
OUTPUT_DIR="${2:-./output}"

mkdir -p "$OUTPUT_DIR"
TRACE="$OUTPUT_DIR/pipeline-trace.ndjson"

if ! command -v growthub &>/dev/null; then
  echo "[run-pipeline] growthub CLI not found. Install with: npm install -g @growthub/cli" >&2
  exit 1
fi

# Auth pre-flight — session must be valid before executing
if ! growthub auth whoami --json >/dev/null 2>&1; then
  echo "[run-pipeline] Not authenticated. Run: growthub auth login" >&2
  exit 1
fi

echo "[run-pipeline] Executing pipeline..."
growthub pipeline execute "$PAYLOAD" 2>&1 | tee "$TRACE"
echo "[run-pipeline] Trace written to $TRACE"
