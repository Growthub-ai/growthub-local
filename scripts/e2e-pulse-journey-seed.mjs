#!/usr/bin/env node
/**
 * Thin seed EXTENSION for the /pulse autonomic-cockpit e2e journey.
 *
 * Runs against a temp workspace export produced by export-seed-workspace.mjs
 * (never against the repo tree) and layers the pulse fixtures on top of the
 * standard feature seed — same lane as e2e-inbound-journey-seed.mjs: direct
 * pre-boot filesystem write.
 *
 *   - stuck-workflow: a clone of registry-workflow whose lastScheduledRun
 *     attempt is 10 minutes old with no completion — the STALLED heartbeat
 *     the cockpit must surface as the attention cue,
 *   - workspace-policy: a plain CUSTOM object (the governed create_object
 *     shape — no preset, no new object type) with the human rules:
 *       no-stalls (max-stalled-runs 0, critical, autoApprove)
 *       beat      (pulse-cadence-minutes 30 — fires "no pulse workflow yet")
 *   - workspace-helper-sandbox: the live helper row the slash menu gates on,
 *   - env refs for the native API-request input method + local public URL.
 *
 * Usage:  node scripts/e2e-pulse-journey-seed.mjs <export .../apps/workspace>
 */
import fs from "node:fs";
import path from "node:path";

const appDir = path.resolve(process.argv[2] || "");
if (!appDir || !fs.existsSync(path.join(appDir, "growthub.config.json"))) {
  console.error("Usage: node scripts/e2e-pulse-journey-seed.mjs <export .../apps/workspace> (growthub.config.json not found)");
  process.exit(1);
}
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
if (appDir.startsWith(repoRoot + path.sep)) {
  console.error("Refusing to seed inside the repo tree — point at a temp export.");
  process.exit(1);
}

const SAMPLE_PAYLOAD = { since: "2026-01-01", segment: "daily-brief" };
const configPath = path.join(appDir, "growthub.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const objects = config?.dataModel?.objects || [];

const sandbox = objects.find((o) => String(o?.objectType || "") === "sandbox-environment"
  && (o.rows || []).some((r) => String(r?.Name || "") === "registry-workflow"));
if (!sandbox) throw new Error("sandbox object with registry-workflow row missing from feature seed");
const baseRow = sandbox.rows.find((r) => String(r?.Name || "") === "registry-workflow");

function withSamplePayload(graphJson) {
  const graph = JSON.parse(graphJson);
  const input = (graph.nodes || []).find((n) => n?.type === "input" || n?.id === "input");
  if (input) input.config = { ...(input.config || {}), samplePayload: SAMPLE_PAYLOAD };
  return JSON.stringify(graph, null, 2);
}
baseRow.orchestrationConfig = withSamplePayload(baseRow.orchestrationConfig);

// The stalled fixture: an attempt stamped 10 minutes ago with no completion —
// exactly the dangling-attempt shape the destination door now writes before
// executing a graph that then hangs or dies.
if (!sandbox.rows.some((r) => String(r?.Name || "") === "stuck-workflow")) {
  sandbox.rows.push({
    ...baseRow,
    Name: "stuck-workflow",
    lastScheduledRunAttemptedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  });
}

// A single standalone ai-agent NODE workflow (NOT a swarm) whose latest run
// trace shows the agent step failed — the max-failed-agent-nodes fixture.
if (!sandbox.rows.some((r) => String(r?.Name || "") === "agent-step-flow")) {
  sandbox.rows.push({
    Name: "agent-step-flow", lifecycleStatus: "live", runLocality: "local", adapter: "local-process", status: "failed",
    lastScheduledRunAttemptedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    lastScheduledRunFailedAt: new Date(Date.now() - 2 * 3600_000 + 30_000).toISOString(),
    lastScheduledRunStatus: "502",
    lastScheduledRunFailureReason: "agent step failed",
    lastScheduledRunNodeTrace: JSON.stringify([
      { nodeId: "input", status: "completed" },
      { nodeId: "agent-step", status: "failed" },
      { nodeId: "result", status: "skipped" },
    ]),
    orchestrationConfig: JSON.stringify({
      version: 1, provider: "growthub-native",
      nodes: [
        { id: "input", type: "input", config: { inputMode: "manual", samplePayload: { since: "2026-01-01" } } },
        { id: "agent-step", type: "ai-agent", config: { adapter: "local-agent-host", host: "claude_local", taskPrompt: "summarize" } },
        { id: "result", type: "tool-result", config: { writeLastResponse: true } },
      ],
      edges: [{ from: "input", to: "agent-step" }, { from: "agent-step", to: "result" }],
    }, null, 2),
  });
}

// Human policy rows — a plain custom object, the same shape the governed
// create_object helper lane produces. No preset, no new object type.
if (!objects.some((o) => String(o?.id || "") === "workspace-policy")) {
  objects.push({
    id: "workspace-policy",
    objectType: "custom",
    label: "Workspace Policy",
    icon: "Activity",
    columns: ["Name", "ruleKind", "threshold", "severity", "autoApprove", "enabled", "goal", "description"],
    rows: [
      { Name: "no-stalls", ruleKind: "max-stalled-runs", threshold: 0, severity: "critical", autoApprove: "true", enabled: "true", goal: "keep automations flowing" },
      { Name: "beat", ruleKind: "pulse-cadence-minutes", threshold: 30, severity: "warn", autoApprove: "false", enabled: "true", goal: "the workspace watches itself" },
      { Name: "agent-steps", ruleKind: "max-failed-agent-nodes", threshold: 0, severity: "critical", autoApprove: "false", enabled: "true", goal: "agents always deliver their outputs" },
    ],
  });
}

// The live helper row the slash menu's readiness gate requires.
if (!objects.some((o) => String(o?.id || "") === "workspace-helper-sandbox")) {
  objects.push({
    id: "workspace-helper-sandbox",
    objectType: "sandbox-environment",
    label: "Workspace Helper Sandbox",
    columns: ["Name", "lifecycleStatus", "runLocality", "adapter", "agentHost"],
    rows: [{ Name: "workspace-helper", lifecycleStatus: "live", runLocality: "local", adapter: "local-agent-host", agentHost: "claude_local" }],
  });
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

const envPath = path.join(appDir, ".env.local");
const baseUrl = String(process.env.BASE_URL || "").trim();
let port = String(process.env.E2E_PORT || "3779");
if (!process.env.E2E_PORT && baseUrl) {
  try {
    port = new URL(baseUrl).port || port;
  } catch {
    // Keep the default local smoke port.
  }
}
const envLines = [
  "GROWTHUB_WEBHOOK_SIGNING_SECRET=whsec_e2e_pulse_journey",
  "GROWTHUB_API_INVOKE_TOKEN=tok_e2e_pulse_journey",
  `GROWTHUB_WORKSPACE_PUBLIC_URL=http://127.0.0.1:${port}`,
  "GROWTHUB_ALLOW_INSECURE_CALLBACK_URL=true",
  "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true",
];
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
for (const line of envLines) {
  const key = line.split("=")[0];
  if (env.includes(`${key}=`)) {
    env = env.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    env += (env.endsWith("\n") || !env ? "" : "\n") + line + "\n";
  }
}
fs.writeFileSync(envPath, env);

console.log(JSON.stringify({
  ok: true,
  appDir,
  fixtures: ["stuck-workflow (stalled)", "workspace-policy (no-stalls, beat)", "workspace-helper-sandbox (live)"],
  samplePayload: SAMPLE_PAYLOAD,
}, null, 2));
