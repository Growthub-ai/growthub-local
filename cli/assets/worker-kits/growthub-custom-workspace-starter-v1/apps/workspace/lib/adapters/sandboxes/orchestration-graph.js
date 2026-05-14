/**
 * Sandbox adapter — orchestration-graph.
 *
 * When a sandbox-environment row sets `adapter: "orchestration-graph"`, this
 * adapter reads the row's `orchestrationConfig` JSON field, validates the
 * graph shape, and executes each `thinAdapters[]` node sequentially using
 * the existing sandbox adapter registry (local-process, local-intelligence,
 * local-agent-host, or any other registered adapter).
 *
 * The sandbox-run route is completely untouched. This adapter is dispatched
 * through the identical `getSandboxAdapter(id).run(request)` path the route
 * already uses for every other adapter — no new routes, no changes to the
 * core execution handler, no PATCH allowlist changes.
 *
 * Execution contract:
 *   - Each thinAdapter node runs via its own registered adapter
 *   - The previous node's stdout is appended to the next node's command as
 *     context (v1 linear pass-through; graph topology in nodes/edges is stored
 *     for future visual rendering, not yet interpreted for execution order)
 *   - exitCode = 0 only if all nodes exit 0; first failure stops the chain
 *   - Per-node results are captured in adapterMeta.nodeResults for diagnostics
 *   - The route persists the returned RunResult as a normal
 *     growthub-sandbox-run-v1 sidecar record; graph metadata lives in adapterMeta
 *
 * Invariants preserved:
 *   - sandbox-run/route.js is not modified
 *   - Credentials stay server-side; sub-node env refs resolved here, never exposed
 *   - Recursive self-reference (adapter: "orchestration-graph" inside
 *     thinAdapters) is rejected to prevent infinite loops
 *   - Adapter MUST NOT mutate growthub.config.json — reading is safe and
 *     necessary to resolve sandboxRef targets (same as readWorkspaceConfig in
 *     the route itself); writing is not performed
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import {
  parseOrchestrationConfig,
  parseSandboxAllowList,
  parseSandboxEnvRefs
} from "@/lib/workspace-data-model";
import {
  DEFAULT_SANDBOX_ADAPTER,
  KNOWN_CANVAS_TYPES,
  KNOWN_SANDBOX_RUNTIMES,
  SANDBOX_DEFAULT_TIMEOUT_MS,
  SANDBOX_MAX_TIMEOUT_MS
} from "@/lib/workspace-schema";
import { getSandboxAdapter, registerSandboxAdapter } from "./sandbox-adapter-registry.js";

const ADAPTER_ID = "orchestration-graph";
const MAX_CONTEXT_CHARS = 2000; // chars of prior stdout piped as context to next node

// ─── env resolution ──────────────────────────────────────────────────────────
// Mirrors the route's envKeyCandidates / readServerSecret logic without
// importing from the route (which we must not touch).

function envKeyCandidates(ref) {
  const token = String(ref || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return Array.from(
    new Set([token, token ? `${token}_API_KEY` : "", token ? `${token}_TOKEN` : ""].filter(Boolean))
  );
}

function resolveEnvRefs(slugs) {
  const env = {};
  const resolved = [];
  const missing = [];
  for (const slug of slugs) {
    let found = false;
    for (const key of envKeyCandidates(slug)) {
      if (process.env[key]) {
        env[key] = process.env[key];
        found = true;
        break;
      }
    }
    if (found) resolved.push(slug);
    else missing.push(slug);
  }
  return { env, resolved, missing };
}

// ─── sandboxRef resolution ────────────────────────────────────────────────────
// Format: "objectId/rowName" or just "rowName" (searched across all sandbox objects).

function findRowByRef(workspaceConfig, sandboxRef) {
  const ref = String(sandboxRef || "").trim();
  if (!ref) return null;
  const slashIndex = ref.indexOf("/");
  const objectIdHint = slashIndex !== -1 ? ref.slice(0, slashIndex) : null;
  const rowName = slashIndex !== -1 ? ref.slice(slashIndex + 1) : ref;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  for (const obj of objects) {
    if (obj?.objectType !== "sandbox-environment") continue;
    if (objectIdHint && obj.id !== objectIdHint) continue;
    const rows = Array.isArray(obj.rows) ? obj.rows : [];
    const match = rows.find((r) => String(r?.Name || "").trim() === rowName);
    if (match) return { object: obj, row: match };
  }
  return null;
}

// ─── intelligenceSandbox builder ─────────────────────────────────────────────
// Reconstructs the intelligenceSandbox context the local-intelligence adapter
// expects — same shape the route builds for the top-level row.

function buildIntelligenceSandbox(row, agentCommand) {
  return {
    userIntent: agentCommand,
    localModel: typeof row.localModel === "string" ? row.localModel.trim() : "",
    localEndpoint: typeof row.localEndpoint === "string" ? row.localEndpoint.trim() : "",
    intelligenceAdapterMode:
      typeof row.intelligenceAdapterMode === "string"
        ? row.intelligenceAdapterMode.trim().toLowerCase()
        : "ollama"
  };
}

// ─── orchestrationConfig validation ──────────────────────────────────────────

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, errors: ["orchestrationConfig must be a JSON object"] };
  }
  const canvasType = String(config.canvasType || "").trim();
  if (canvasType && !KNOWN_CANVAS_TYPES.includes(canvasType)) {
    errors.push(`canvasType must be one of: ${KNOWN_CANVAS_TYPES.join(", ")}`);
  }
  if (!Array.isArray(config.thinAdapters) || config.thinAdapters.length === 0) {
    errors.push("orchestrationConfig.thinAdapters must be a non-empty array");
  } else {
    config.thinAdapters.forEach((node, i) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        errors.push(`thinAdapters[${i}] must be a plain object`);
        return;
      }
      if (!node.id || typeof node.id !== "string") {
        errors.push(`thinAdapters[${i}].id must be a non-empty string`);
      }
      if (!node.sandboxRef || typeof node.sandboxRef !== "string") {
        errors.push(`thinAdapters[${i}].sandboxRef must be a non-empty string`);
      }
      if (node.adapter === ADAPTER_ID) {
        errors.push(`thinAdapters[${i}] cannot reference adapter "orchestration-graph" (no recursive graphs)`);
      }
    });
  }
  return errors.length ? { valid: false, errors } : { valid: true };
}

// ─── single node execution ────────────────────────────────────────────────────
// Runs one thinAdapter node. Returns the same RunResult shape as any adapter.

async function runNode({ nodeRow, nodeId, runId, ranAt, parentEnv, timeoutMs, networkAllow, allowList, previousStdout }) {
  const adapterId = (typeof nodeRow.adapter === "string" && nodeRow.adapter.trim())
    ? nodeRow.adapter.trim()
    : DEFAULT_SANDBOX_ADAPTER;

  if (adapterId === ADAPTER_ID) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `node "${nodeId}" references adapter "orchestration-graph" — recursive graphs are not allowed`,
      adapterMeta: { adapter: ADAPTER_ID, nodeId }
    };
  }

  const adapter = getSandboxAdapter(adapterId);
  if (!adapter) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `adapter not registered for node "${nodeId}": ${adapterId}`,
      adapterMeta: { adapter: ADAPTER_ID, nodeId, requestedAdapter: adapterId }
    };
  }

  const runtime = KNOWN_SANDBOX_RUNTIMES.includes(nodeRow.runtime) ? nodeRow.runtime : "node";
  const agentHost = typeof nodeRow.agentHost === "string" ? nodeRow.agentHost.trim() : "";
  const baseCommand = typeof nodeRow.command === "string" ? nodeRow.command : "";
  const instructions = typeof nodeRow.instructions === "string" ? nodeRow.instructions.trim() : "";
  const nodeEnvRefSlugs = parseSandboxEnvRefs(nodeRow.envRefs);
  const nodeNetworkAllow = networkAllow || Boolean(nodeRow.networkAllow === true || nodeRow.networkAllow === "true");
  const nodeAllowList = [...allowList, ...parseSandboxAllowList(nodeRow.allowList)];
  const nodeTimeoutMs = (() => {
    const t = Number(nodeRow.timeoutMs);
    return Number.isFinite(t) && t > 0 ? Math.min(t, SANDBOX_MAX_TIMEOUT_MS) : timeoutMs;
  })();

  // Merge parent env with node-specific refs
  const { env: nodeExtraEnv } = resolveEnvRefs(nodeEnvRefSlugs);
  const nodeEnv = { ...parentEnv, ...nodeExtraEnv };

  // Build command: inject prior node stdout as context (v1 pass-through mapping)
  const contextCommand = previousStdout
    ? `${baseCommand}\n\n[Prior node output]:\n${previousStdout.slice(0, MAX_CONTEXT_CHARS)}`
    : baseCommand;

  const agentCommand = instructions
    ? `Instructions:\n${instructions}\n\nPrompt:\n${contextCommand}`
    : contextCommand;

  const intelligenceSandbox =
    adapterId === "local-intelligence" ? buildIntelligenceSandbox(nodeRow, agentCommand) : undefined;

  if (Array.isArray(adapter.supportedRuntimes) && adapter.supportedRuntimes.length && !adapter.supportedRuntimes.includes(runtime)) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `adapter "${adapterId}" does not support runtime "${runtime}" (node: ${nodeId})`,
      adapterMeta: { adapter: ADAPTER_ID, nodeId, requestedAdapter: adapterId }
    };
  }

  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), `growthub-graph-${nodeId}-`));
  try {
    return await adapter.run({
      runId: `${runId}_node_${nodeId}`,
      name: String(nodeRow.Name || nodeId),
      runtime,
      agentHost,
      command: adapterId === "local-agent-host" || adapterId === "local-intelligence" ? agentCommand : contextCommand,
      timeoutMs: nodeTimeoutMs,
      networkAllow: nodeNetworkAllow,
      allowList: nodeAllowList,
      env: nodeEnv,
      envRefSlugs: nodeEnvRefSlugs,
      envRefsMissing: [],
      workdir,
      ranAt,
      ...(intelligenceSandbox ? { intelligenceSandbox } : {})
    });
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: error?.message || "adapter threw unexpectedly",
      adapterMeta: { adapter: ADAPTER_ID, nodeId, requestedAdapter: adapterId }
    };
  } finally {
    fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── main adapter run ─────────────────────────────────────────────────────────

async function run(request) {
  const started = Date.now();

  // 1. Read workspace config to find the orchestrating row and resolve sandboxRefs.
  //    Read-only — this adapter never writes to the workspace config.
  let workspaceConfig;
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: `could not read workspace config: ${err?.message || "unknown"}`,
      adapterMeta: { adapter: ADAPTER_ID }
    };
  }

  // 2. Find the orchestrating row by name to get orchestrationConfig.
  const rowName = String(request.name || "").trim();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  let orchestratingRow = null;
  for (const obj of objects) {
    if (obj?.objectType !== "sandbox-environment") continue;
    const match = (Array.isArray(obj.rows) ? obj.rows : []).find(
      (r) => String(r?.Name || "").trim() === rowName
    );
    if (match) { orchestratingRow = match; break; }
  }

  if (!orchestratingRow) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: `orchestrating sandbox row not found: "${rowName}"`,
      adapterMeta: { adapter: ADAPTER_ID }
    };
  }

  // 3. Parse and validate orchestrationConfig.
  const orchestrationConfig = parseOrchestrationConfig(orchestratingRow.orchestrationConfig);
  if (!orchestrationConfig) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: 'adapter "orchestration-graph" requires a valid JSON orchestrationConfig field on the sandbox row',
      adapterMeta: { adapter: ADAPTER_ID }
    };
  }

  const { valid, errors } = validateConfig(orchestrationConfig);
  if (!valid) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: "",
      error: `orchestrationConfig validation failed: ${errors.join("; ")}`,
      adapterMeta: { adapter: ADAPTER_ID, validationErrors: errors }
    };
  }

  // 4. Execute thinAdapters sequentially.
  const thinAdapters = orchestrationConfig.thinAdapters;
  const nodeResults = [];
  let overallExitCode = 0;
  let previousStdout = "";
  let cumulativeDurationMs = 0;

  for (const thinAdapter of thinAdapters) {
    const resolved = findRowByRef(workspaceConfig, thinAdapter.sandboxRef);
    if (!resolved) {
      const nodeResult = {
        id: thinAdapter.id,
        sandboxRef: thinAdapter.sandboxRef,
        ok: false,
        exitCode: 1,
        durationMs: 0,
        stdout: "",
        stderr: "",
        error: `sandboxRef not found: "${thinAdapter.sandboxRef}"`
      };
      nodeResults.push(nodeResult);
      overallExitCode = 1;
      break;
    }

    const result = await runNode({
      nodeRow: resolved.row,
      nodeId: thinAdapter.id,
      runId: request.runId,
      ranAt: request.ranAt,
      parentEnv: request.env || {},
      timeoutMs: request.timeoutMs || SANDBOX_DEFAULT_TIMEOUT_MS,
      networkAllow: Boolean(request.networkAllow),
      allowList: Array.isArray(request.allowList) ? request.allowList : [],
      previousStdout
    });

    nodeResults.push({ id: thinAdapter.id, sandboxRef: thinAdapter.sandboxRef, ...result });
    cumulativeDurationMs += result.durationMs || 0;

    if (result.exitCode !== 0 || result.error) {
      overallExitCode = result.exitCode ?? 1;
      break;
    }
    previousStdout = result.stdout || "";
  }

  // 5. Aggregate results into the standard RunResult envelope.
  const allStdout = nodeResults
    .map((r) => `[node: ${r.id}]\n${r.stdout || ""}`)
    .join("\n\n---\n\n");
  const allStderr = nodeResults
    .map((r) => (r.stderr ? `[node: ${r.id}]: ${r.stderr}` : ""))
    .filter(Boolean)
    .join("\n");
  const firstError = nodeResults.find((r) => r.error)?.error;

  return {
    ok: overallExitCode === 0,
    exitCode: overallExitCode,
    durationMs: cumulativeDurationMs || Date.now() - started,
    stdout: allStdout,
    stderr: allStderr,
    error: firstError,
    adapterMeta: {
      adapter: ADAPTER_ID,
      canvasType: orchestrationConfig.canvasType || null,
      diagnosticMode: orchestrationConfig.diagnosticMode === true,
      version: orchestrationConfig.version || null,
      nodeCount: thinAdapters.length,
      nodesExecuted: nodeResults.length,
      lastValidated: new Date().toISOString(),
      nodeResults
    }
  };
}

// ─── registration ─────────────────────────────────────────────────────────────

registerSandboxAdapter({
  id: ADAPTER_ID,
  label: "Orchestration graph",
  description:
    "Visual agent canvas adapter. Reads orchestrationConfig from the sandbox row and executes thinAdapters[] sequentially via the existing adapter registry (local-process, local-intelligence, local-agent-host). sandbox-run/route.js is not modified. Status gate: row only reaches \"connected\" after a successful full-graph run.",
  locality: "local",
  supportedRuntimes: [],
  run
});
