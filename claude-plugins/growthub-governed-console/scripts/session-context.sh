#!/usr/bin/env bash
# SessionStart orientation for governed Growthub workspaces.
# Offline and read-only: detects growthub.config.json and emits the mutation
# boundary + console pointer as session context. Silent (exit 0, no output)
# outside a governed workspace so the plugin costs nothing elsewhere.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cfg=""
if [ -f "$root/growthub.config.json" ]; then
  cfg="growthub.config.json"
elif [ -f "$root/apps/workspace/growthub.config.json" ]; then
  cfg="apps/workspace/growthub.config.json"
fi
[ -z "$cfg" ] && exit 0

cat <<EOF
Governed Growthub workspace detected ($cfg).
Mutation boundary (runtime-enforced): PATCH /api/workspace (allowlist: dashboards, widgetTypes, canvas, dataModel) and POST /api/workspace/sandbox-run — there is no third mutation path. Dry-run every patch via preflight before writing.
Use the governed-universe MCP tools (describe_workspace, find_downstream_dependencies, simulate_causal_impact, preflight_patch, next_actions) to read, reason, and hand off; see the growthub-governed-console plugin skills (governed-console, governed-workspace-mutation) before mutating anything.
EOF
exit 0
