#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[kernel] validating bundled worker kit contracts"
node scripts/check-worker-kits.mjs

echo "[kernel] verifying custom workspace setup assets"
node <<'EOF'
const fs = require("node:fs");
const path = require("node:path");

const kitsRoot = path.resolve("cli/assets/worker-kits");
const kitDirs = fs.readdirSync(kitsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const failures = [];

for (const dir of kitDirs) {
  const kitPath = path.join(kitsRoot, dir);
  const manifestPath = path.join(kitPath, "kit.json");
  if (!fs.existsSync(manifestPath)) continue;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest?.kit?.family !== "studio") continue;

  const required = [".env.example", "QUICKSTART.md"];
  for (const rel of required) {
    if (!fs.existsSync(path.join(kitPath, rel))) {
      failures.push(`${dir} missing ${rel}`);
    }
  }
}

if (failures.length > 0) {
  console.error("[kernel] failed setup asset checks:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("[kernel] custom workspace setup assets OK");
EOF

echo "[kernel] running focused custom workspace vitest coverage"
(
  cd cli
  pnpm vitest src/__tests__/kit.test.ts src/__tests__/kit-command.test.ts
)

echo "[kernel] custom workspace kernel checks passed"
