#!/usr/bin/env bash
#
# workspace-lens-local-smoke.sh — super-admin local-dev internal testing.
#
# Spins up the EXACT customer artifact (exported through the published
# cli/dist truth — no repo build) in a temp directory, seeds the "in-between"
# super-admin state (onboarding complete · Workspace Lens unlocked · no
# activity yet) so every new surface is visible, then serves it on two real
# Next.js production servers:
#
#   - filesystem (writable)   → PATCH persists to growthub.config.json
#   - read-only (vercel-style) → PATCH returns 409 + adapter guidance
#
# Usage:
#   bash scripts/workspace-lens-local-smoke.sh [OUT_DIR] [FS_PORT] [RO_PORT]
# Defaults: OUT_DIR=/tmp/growthub-lens-smoke  FS_PORT=4801  RO_PORT=4803
#
# Everything lives under OUT_DIR (a temp tree). The main repo is never built
# or mutated.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-/tmp/growthub-lens-smoke}"
FS_PORT="${2:-4801}"
RO_PORT="${3:-4803}"
KIT="growthub-custom-workspace-starter-v1"
APP="$OUT/apps/workspace"

echo "▸ Export via published CLI truth (cli/dist/index.js) → $OUT"
rm -rf "$OUT"
node "$ROOT/cli/dist/index.js" kit download "$KIT" --out "$OUT" --yes >/dev/null

echo "▸ Seed super-admin in-between state (complete · lens unlocked · no activity)"
node - "$APP/growthub.config.json" <<'NODE'
const fs = require("fs");
const p = process.argv[2];
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.dashboards = [{
  id: "untitled-dashboard", name: "Customer Overview", createdBy: "Workspace owner",
  updatedAt: "now", status: "active",
  tabs: [{ id: "t1", name: "Tab 1", widgets: [
    { id: "w1", kind: "chart", title: "Contacts", position: { x: 0, y: 0, w: 6, h: 4 } },
  ] }],
}];
c.dataModel = { objects: [
  { id: "contacts", label: "Contacts", name: "Contacts", objectType: "custom", icon: "Users",
    columns: ["name", "stage"], rows: [{ name: "Acme", stage: "open" }] },
  { id: "sandbox-environments", label: "Sandbox Environments", name: "Sandbox Environments",
    objectType: "sandbox-environment",
    rows: [{ Name: "daily-sync-workflow", status: "ok", adapter: "local-process",
             lastResponse: JSON.stringify({ exitCode: 0 }) }] },
] };
// canvas stays empty (from starter) so the builder renders cleanly.
fs.writeFileSync(p, JSON.stringify(c, null, 2));
console.log("  seeded:", c.dataModel.objects.length, "objects,", c.dashboards.length, "dashboard");
NODE

echo "▸ Install + production build (Next.js / React / Turbopack)"
( cd "$APP" && pnpm install --prod=false >/dev/null 2>&1 && pnpm exec next build >/dev/null 2>&1 )
echo "  ✓ clean compile"

echo "▸ Start servers"
( cd "$APP" && WORKSPACE_CONFIG_ALLOW_FS_WRITE=true nohup pnpm exec next start -p "$FS_PORT" >/tmp/lens-fs.log 2>&1 & )
( cd "$APP" && GROWTHUB_WORKSPACE_DEPLOY_TARGET=vercel nohup pnpm exec next start -p "$RO_PORT" >/tmp/lens-ro.log 2>&1 & )
sleep 5

echo ""
echo "  filesystem (writable) : http://127.0.0.1:$FS_PORT/workspace-lens"
echo "  read-only  (vercel)   : http://127.0.0.1:$RO_PORT/workspace-lens"
echo "  super-admin builder   : http://127.0.0.1:$FS_PORT/"
echo ""
echo "  GET  /api/workspace                 — config + persistence descriptor"
echo "  GET  /api/workspace/swarm-condition — agent-assignable packet"
echo "  PATCH /api/workspace                — writable on $FS_PORT, 409 on $RO_PORT"
echo ""
echo "  stop: pkill -f 'next start -p $FS_PORT'; pkill -f 'next start -p $RO_PORT'"
