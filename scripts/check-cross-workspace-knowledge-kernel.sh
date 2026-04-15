#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[kernel] validating cross-workspace knowledge orchestration surface contracts"
node <<'EOF'
const fs = require("node:fs");
const path = require("node:path");

const requiredFiles = [
  // Kernel packet doc
  "docs/kernel-packets/KERNEL_PACKET_CROSS_WORKSPACE_KNOWLEDGE.md",
  // Shared types
  "packages/shared/src/types/knowledge-sync.ts",
  // KB skill bundle extension
  "packages/shared/src/kb-skill-bundle/cross-workspace.ts",
  // CLI runtime
  "cli/src/runtime/knowledge-sync/types.ts",
  "cli/src/runtime/knowledge-sync/transport.ts",
  "cli/src/runtime/knowledge-sync/hosted-relay.ts",
  "cli/src/runtime/knowledge-sync/capture.ts",
  "cli/src/runtime/knowledge-sync/pipeline-nodes.ts",
  "cli/src/runtime/knowledge-sync/index.ts",
  // CLI command
  "cli/src/commands/knowledge.ts",
  // Server route
  "server/src/routes/knowledge-sync.ts",
  // Native intelligence extension
  "cli/src/runtime/native-intelligence/capture-advisor.ts",
];

const missing = requiredFiles.filter((relPath) => !fs.existsSync(path.resolve(relPath)));
if (missing.length > 0) {
  console.error("[kernel] missing required files:");
  for (const relPath of missing) console.error(`- ${relPath}`);
  process.exit(1);
}

console.log(`[kernel] all ${requiredFiles.length} required files present`);

// ---------------------------------------------------------------------------
// Source contract checks
// ---------------------------------------------------------------------------

const indexSource = fs.readFileSync(path.resolve("cli/src/index.ts"), "utf8");
const knowledgeSource = fs.readFileSync(path.resolve("cli/src/commands/knowledge.ts"), "utf8");
const transportSource = fs.readFileSync(path.resolve("cli/src/runtime/knowledge-sync/transport.ts"), "utf8");
const hostedRelaySource = fs.readFileSync(path.resolve("cli/src/runtime/knowledge-sync/hosted-relay.ts"), "utf8");
const captureSource = fs.readFileSync(path.resolve("cli/src/runtime/knowledge-sync/capture.ts"), "utf8");
const pipelineNodesSource = fs.readFileSync(path.resolve("cli/src/runtime/knowledge-sync/pipeline-nodes.ts"), "utf8");
const serverRouteSource = fs.readFileSync(path.resolve("server/src/routes/knowledge-sync.ts"), "utf8");
const captureAdvisorSource = fs.readFileSync(path.resolve("cli/src/runtime/native-intelligence/capture-advisor.ts"), "utf8");
const sharedTypesSource = fs.readFileSync(path.resolve("packages/shared/src/types/knowledge-sync.ts"), "utf8");
const appSource = fs.readFileSync(path.resolve("server/src/app.ts"), "utf8");
const nativeIntelligenceIndex = fs.readFileSync(path.resolve("cli/src/runtime/native-intelligence/index.ts"), "utf8");
const kbBundleIndex = fs.readFileSync(path.resolve("packages/shared/src/kb-skill-bundle/index.ts"), "utf8");
const sharedTypesIndex = fs.readFileSync(path.resolve("packages/shared/src/types/index.ts"), "utf8");

const checks = [
  // Discovery hub registration
  {
    ok: indexSource.includes('value: "knowledge-sync"') && indexSource.includes('runKnowledgeHub'),
    message: "knowledge-sync discovery hub entry missing in cli/src/index.ts",
  },
  {
    ok: indexSource.includes("registerKnowledgeCommands"),
    message: "registerKnowledgeCommands not called in cli/src/index.ts",
  },
  // CLI command surfaces
  {
    ok: knowledgeSource.includes('.command("status")')
      && knowledgeSource.includes('.command("export")')
      && knowledgeSource.includes('.command("import")')
      && knowledgeSource.includes('.command("sync")')
      && knowledgeSource.includes('.command("capture")'),
    message: "knowledge command missing status/export/import/sync/capture subcommands",
  },
  {
    ok: knowledgeSource.includes('--relay') && knowledgeSource.includes('--output'),
    message: "knowledge export missing --relay or --output flags",
  },
  // Transport layer
  {
    ok: transportSource.includes("serializeEnvelope")
      && transportSource.includes("deserializeEnvelope")
      && transportSource.includes("verifyEnvelopeSignature")
      && transportSource.includes("signEnvelope"),
    message: "transport.ts missing serialize/deserialize/verify/sign functions",
  },
  {
    ok: transportSource.includes("discoverLocalWorkspaces"),
    message: "transport.ts missing discoverLocalWorkspaces",
  },
  // Hosted relay
  {
    ok: hostedRelaySource.includes("HOSTED_KNOWLEDGE_IMPORT_PATH")
      && hostedRelaySource.includes("HostedEndpointUnavailableError")
      && hostedRelaySource.includes("tryRelayEnvelopeToHosted"),
    message: "hosted-relay.ts missing required patterns (endpoint path, error handling, try wrapper)",
  },
  // Capture
  {
    ok: captureSource.includes("captureAgentRunKnowledge")
      && captureSource.includes("agent_run")
      && captureSource.includes("relayToHosted"),
    message: "capture.ts missing captureAgentRunKnowledge or relay logic",
  },
  // Pipeline nodes
  {
    ok: pipelineNodesSource.includes("knowledge-export")
      && pipelineNodesSource.includes("knowledge-import")
      && pipelineNodesSource.includes("knowledge-capture")
      && pipelineNodesSource.includes('"local-only"'),
    message: "pipeline-nodes.ts missing required node slugs or local-only execution kind",
  },
  {
    ok: pipelineNodesSource.includes('"knowledge"'),
    message: "pipeline-nodes.ts nodes must use family: 'knowledge'",
  },
  // Server routes
  {
    ok: serverRouteSource.includes("/knowledge-sync/export")
      && serverRouteSource.includes("/knowledge-sync/import")
      && serverRouteSource.includes("/knowledge-sync/status")
      && serverRouteSource.includes("/knowledge-sync/agent-capture"),
    message: "knowledge-sync.ts server route missing required endpoints",
  },
  {
    ok: serverRouteSource.includes("itemsSignature")
      && serverRouteSource.includes("skipped_duplicate"),
    message: "knowledge-sync.ts import route missing integrity check or deduplication",
  },
  // Server app.ts mounts
  {
    ok: appSource.includes("knowledgeSyncRoutes"),
    message: "knowledgeSyncRoutes not mounted in server/src/app.ts",
  },
  // Native intelligence capture advisor
  {
    ok: captureAdvisorSource.includes("adviseCaptureItems")
      && captureAdvisorSource.includes("buildDeterministicCaptureSuggestions")
      && captureAdvisorSource.includes("agent_run"),
    message: "capture-advisor.ts missing adviseCaptureItems or deterministic fallback",
  },
  {
    ok: nativeIntelligenceIndex.includes("adviseCaptureItems")
      && nativeIntelligenceIndex.includes("KnowledgeCaptureAdvisoryInput"),
    message: "native-intelligence/index.ts not exporting capture advisor symbols",
  },
  // Shared types
  {
    ok: sharedTypesSource.includes("KnowledgeSyncEnvelope")
      && sharedTypesSource.includes("KnowledgeSyncItem")
      && sharedTypesSource.includes("WorkspaceKnowledgeRef")
      && sharedTypesSource.includes("CrossWorkspaceKitBundle"),
    message: "packages/shared/src/types/knowledge-sync.ts missing required types",
  },
  {
    ok: sharedTypesIndex.includes("KnowledgeSyncEnvelope"),
    message: "packages/shared/src/types/index.ts not exporting knowledge-sync types",
  },
  // KB bundle index
  {
    ok: kbBundleIndex.includes("buildCrossWorkspaceBundle")
      && kbBundleIndex.includes("flattenBundleItems"),
    message: "packages/shared/src/kb-skill-bundle/index.ts not exporting cross-workspace builders",
  },
  // Backwards compatibility: existing bundle exports still present
  {
    ok: kbBundleIndex.includes("buildPaperclipSkillBundleV1")
      && kbBundleIndex.includes("appendPaperclipSkillsToPrompt"),
    message: "kb-skill-bundle/index.ts backwards compatibility broken: existing exports missing",
  },
];

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error("[kernel] failed source contract checks:");
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log(`[kernel] all ${checks.length} source contract checks passed`);
EOF

echo "[kernel] cross-workspace knowledge kernel checks passed"
