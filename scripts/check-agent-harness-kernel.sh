#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[kernel] validating agent harness surface contracts"
node <<'EOF'
const fs = require("node:fs");
const path = require("node:path");

const requiredFiles = [
  "cli/src/index.ts",
  "cli/src/commands/open-agents.ts",
  "cli/src/commands/qwen-code.ts",
  "cli/src/runtime/agent-harness/auth-store.ts",
  "docs/AGENT_HARNESS_AUTH_PRIMITIVE.md",
  "docs/kernel-packets/KERNEL_PACKET_AGENT_HARNESS.md",
];

const missing = requiredFiles.filter((relPath) => !fs.existsSync(path.resolve(relPath)));
if (missing.length > 0) {
  console.error("[kernel] missing required files:");
  for (const relPath of missing) console.error(`- ${relPath}`);
  process.exit(1);
}

const indexSource = fs.readFileSync(path.resolve("cli/src/index.ts"), "utf8");
const openAgentsSource = fs.readFileSync(path.resolve("cli/src/commands/open-agents.ts"), "utf8");
const qwenSource = fs.readFileSync(path.resolve("cli/src/commands/qwen-code.ts"), "utf8");

const checks = [
  {
    ok: indexSource.includes('value: "agent-harness"')
      && indexSource.includes('label: "🌐 Open Agents"')
      && indexSource.includes('label: "🤖 Qwen Code CLI"'),
    message: "Agent Harness discovery registration missing expected harness options",
  },
  {
    ok: openAgentsSource.includes('.command("prompt")')
      && openAgentsSource.includes('.command("chat")')
      && openAgentsSource.includes("--auth-mode <mode>"),
    message: "Open Agents command contract missing prompt/chat/auth-mode surfaces",
  },
  {
    ok: qwenSource.includes("Authentication setup")
      && qwenSource.includes("Provider key variable")
      && qwenSource.includes("Back to authentication setup"),
    message: "Qwen configure auth contract missing expected setup/back flow",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("[kernel] failed source contract checks:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log("[kernel] source contract checks OK");
EOF

echo "[kernel] running focused harness vitest coverage"
(
  cd cli
  pnpm vitest src/__tests__/open-agents.test.ts src/__tests__/qwen-code.test.ts
)

echo "[kernel] agent harness kernel checks passed"
