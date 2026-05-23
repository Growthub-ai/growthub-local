/**
 * Agent-swarm-v1 runtime planner and dispatcher.
 *
 * Reads a `sandbox-environment` row whose `orchestrationGraph.executionMode`
 * is `agent-swarm-v1`, materializes the orchestrator + subagent task envelopes,
 * and dispatches each subtask through the registered sandbox adapter
 * (`local-agent-host` when a host is selected, otherwise the runtime-matched
 * default — usually `local-process`).
 *
 * Hard invariants (see implementation module §10 Anti-Patterns):
 *   - never spawn host CLIs or shells outside the adapter registry
 *   - never read or persist files outside the adapter-provided workdir
 *   - never write to growthub.config.json or source-records here — the
 *     sandbox-run route owns persistence
 *   - never include resolved secret values in the returned RunResult
 *
 * Reward telemetry is captured only; V1 does NOT run a reinforcement-learning
 * training loop. The reward block is purely informational so the UI can
 * surface "did the swarm work?" without inferring it from raw logs.
 */

import {
  extractSwarmNodes,
  isAgentSwarmGraph,
  parseOrchestrationGraph,
  redactSecretsFromText
} from "./orchestration-graph.js";
import {
  ensureSandboxAdaptersLoaded,
  getSandboxAdapter
} from "./adapters/sandboxes/index.js";
import { buildInputPayloadForRunner } from "./orchestration-run-inputs.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_SUBAGENT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONCURRENCY = 4;

function clampPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function normalizeRewardWeights(weights) {
  const base = weights && typeof weights === "object" ? weights : {};
  const parallel = Number(base.parallel);
  const finish = Number(base.finish);
  const outcome = Number(base.outcome);
  return {
    parallel: Number.isFinite(parallel) ? parallel : 0.25,
    finish: Number.isFinite(finish) ? finish : 0.35,
    outcome: Number.isFinite(outcome) ? outcome : 0.4
  };
}

function buildSubtaskCommand({ orchestratorPrompt, subagentConfig, inputPayload }) {
  const role = String(subagentConfig?.role || "Subagent").trim();
  const task = String(subagentConfig?.taskPrompt || subagentConfig?.prompt || "").trim();
  const orchestrator = String(orchestratorPrompt || "").trim();
  const inputLine = inputPayload && Object.keys(inputPayload).length
    ? `Run input (JSON): ${JSON.stringify(inputPayload)}`
    : "";
  const lines = [
    `You are the "${role}" subagent in a Growthub agent swarm.`,
    orchestrator ? `Orchestrator plan:\n${orchestrator}` : "",
    task ? `Your task:\n${task}` : "",
    inputLine,
    "Respond with a concise result the orchestrator can aggregate."
  ];
  return lines.filter(Boolean).join("\n\n");
}

function chooseAdapterIdForSubagent({ subagentConfig, fallbackAdapterId, fallbackAgentHost }) {
  const subHost = String(subagentConfig?.agentHost || "").trim();
  const subAdapter = String(subagentConfig?.adapter || "").trim();
  if (subAdapter) return { adapterId: subAdapter, agentHost: subHost || fallbackAgentHost };
  if (subHost) return { adapterId: "local-agent-host", agentHost: subHost };
  if (fallbackAdapterId === "local-agent-host" && fallbackAgentHost) {
    return { adapterId: "local-agent-host", agentHost: fallbackAgentHost };
  }
  return { adapterId: fallbackAdapterId || "local-process", agentHost: fallbackAgentHost };
}

async function dispatchSubagentTask({
  subagentNode,
  orchestratorPrompt,
  inputPayload,
  executionContext,
  taskIndex
}) {
  const subagentConfig = subagentNode?.config || {};
  const required = subagentConfig.required !== false;
  const { adapterId, agentHost } = chooseAdapterIdForSubagent({
    subagentConfig,
    fallbackAdapterId: executionContext.adapterId,
    fallbackAgentHost: executionContext.agentHost
  });
  const adapter = getSandboxAdapter(adapterId);
  if (!adapter) {
    return {
      taskId: subagentNode?.id || `task-${taskIndex + 1}`,
      nodeId: subagentNode?.id || `task-${taskIndex + 1}`,
      role: String(subagentConfig.role || subagentNode?.label || "subagent"),
      adapter: adapterId,
      agentHost,
      required,
      status: "failed",
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `sandbox adapter not registered: ${adapterId}`,
      adapterMeta: { swarmSubagent: true }
    };
  }

  const runtime = executionContext.runtime || "node";
  if (Array.isArray(adapter.supportedRuntimes) && adapter.supportedRuntimes.length && !adapter.supportedRuntimes.includes(runtime)) {
    return {
      taskId: subagentNode?.id || `task-${taskIndex + 1}`,
      nodeId: subagentNode?.id || `task-${taskIndex + 1}`,
      role: String(subagentConfig.role || subagentNode?.label || "subagent"),
      adapter: adapterId,
      agentHost,
      required,
      status: "failed",
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `adapter ${adapterId} does not support runtime ${runtime}`,
      adapterMeta: { swarmSubagent: true }
    };
  }

  const command = buildSubtaskCommand({
    orchestratorPrompt,
    subagentConfig,
    inputPayload
  });
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-swarm-"));
  const startedAt = Date.now();
  let runResult;
  try {
    runResult = await adapter.run({
      runId: `${executionContext.runId}_${subagentNode?.id || `task-${taskIndex + 1}`}`,
      name: `${executionContext.sandboxName || "swarm"}::${subagentNode?.id || `task-${taskIndex + 1}`}`,
      runtime,
      agentHost,
      command,
      timeoutMs: clampPositiveInt(subagentConfig.timeoutMs, executionContext.timeoutMs || DEFAULT_SUBAGENT_TIMEOUT_MS),
      networkAllow: subagentConfig.networkAccess === true || executionContext.networkAllow === true,
      allowList: executionContext.allowList || [],
      env: executionContext.env || {},
      envRefSlugs: executionContext.envRefSlugs || [],
      envRefsMissing: executionContext.envRefsMissing || [],
      workdir,
      ranAt: new Date(startedAt).toISOString()
    });
  } catch (error) {
    runResult = {
      ok: false,
      exitCode: null,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "",
      error: error?.message || "adapter threw",
      adapterMeta: { adapter: adapterId }
    };
  } finally {
    fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
  }

  const exitCode = runResult?.exitCode;
  const errorText = redactSecretsFromText(runResult?.error || "");
  const ok = runResult?.ok === true && !errorText;
  return {
    taskId: subagentNode?.id || `task-${taskIndex + 1}`,
    nodeId: subagentNode?.id || `task-${taskIndex + 1}`,
    role: String(subagentConfig.role || subagentNode?.label || "subagent"),
    adapter: adapterId,
    agentHost: agentHost || "",
    required,
    status: ok ? "completed" : "failed",
    exitCode: exitCode == null ? null : Number(exitCode),
    durationMs: Number(runResult?.durationMs) || (Date.now() - startedAt),
    stdout: redactSecretsFromText(runResult?.stdout || ""),
    stderr: redactSecretsFromText(runResult?.stderr || ""),
    error: errorText,
    adapterMeta: {
      ...(runResult?.adapterMeta || {}),
      swarmSubagent: true
    }
  };
}

async function runSubagentsWithConcurrency(subagents, maxConcurrency, runner) {
  const limit = Math.max(1, Math.min(maxConcurrency, subagents.length || 1));
  const results = new Array(subagents.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= subagents.length) return;
      results[index] = await runner(subagents[index], index);
    }
  }
  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

function computeRewardTelemetry({ subagentNodes, tasks, weights, plannedConcurrency, observedParallelism, outcomeOk }) {
  const totalSubagents = subagentNodes.length;
  const requiredTasks = tasks.filter((t) => t.required);
  const completedRequired = requiredTasks.filter((t) => t.status === "completed").length;
  const completedAll = tasks.filter((t) => t.status === "completed").length;

  const parallelReward = totalSubagents <= 1
    ? 0
    : Math.max(0, Math.min(1, (observedParallelism - 1) / (Math.max(plannedConcurrency, 2) - 1)));
  const finishReward = requiredTasks.length === 0
    ? (totalSubagents === 0 ? 0 : completedAll / totalSubagents)
    : completedRequired / requiredTasks.length;
  const outcomeReward = outcomeOk ? 1 : 0;

  const norm = (weights.parallel || 0) + (weights.finish || 0) + (weights.outcome || 0);
  const safeNorm = norm > 0 ? norm : 1;
  const score = (
    parallelReward * (weights.parallel || 0)
    + finishReward * (weights.finish || 0)
    + outcomeReward * (weights.outcome || 0)
  ) / safeNorm;

  return {
    parallel: Number(parallelReward.toFixed(4)),
    finish: Number(finishReward.toFixed(4)),
    outcome: Number(outcomeReward.toFixed(4)),
    score: Number(score.toFixed(4)),
    weights
  };
}

function buildSwarmLogTree({ orchestratorNode, tasks, synthesisNode, reward, durationMs, swarmStatus }) {
  const orchestratorChild = {
    id: "orchestrator",
    label: "orchestrator",
    type: "orchestrator",
    status: tasks.length > 0 ? "completed" : "failed",
    durationMs: 0,
    text: String(orchestratorNode?.config?.prompt || "").trim()
  };
  const subagentChildren = tasks.map((task) => ({
    id: task.taskId,
    label: String(task.role || task.nodeId || "subagent"),
    type: "subagent",
    status: task.status,
    durationMs: task.durationMs || 0,
    text: [task.error, task.stdout, task.stderr].filter(Boolean).join("\n\n").slice(0, 8000)
  }));
  const synthesisChild = synthesisNode
    ? {
        id: "synthesis",
        label: "synthesis",
        type: "synthesis",
        status: swarmStatus,
        durationMs: 0,
        text: String(synthesisNode?.config?.outcomePrompt || "").trim()
      }
    : null;
  const rewardChild = {
    id: "reward",
    label: `reward ${reward.score.toFixed(2)}`,
    type: "reward",
    status: "info",
    durationMs: 0,
    text: JSON.stringify(reward, null, 2)
  };
  const root = {
    id: "swarm-root",
    label: "agent-swarm",
    type: "swarm",
    status: swarmStatus,
    durationMs,
    children: [orchestratorChild, ...subagentChildren, ...(synthesisChild ? [synthesisChild] : []), rewardChild]
  };
  return [root];
}

/**
 * Execute a swarm graph if the row carries `executionMode: agent-swarm-v1`.
 * Returns null when the graph is not a swarm — caller falls back to the
 * standard graph runner / adapter path.
 *
 * `executionContext` carries the server-resolved run envelope already minted
 * by the sandbox-run route (runId, ranAt, env, envRefSlugs, networkAllow,
 * allowList, agentHost, adapterId, timeoutMs, runtime). The runner never
 * spawns its own children outside the adapter registry.
 */
async function runAgentSwarmGraphIfPresent({
  workspaceConfig: _workspaceConfig,
  row,
  graph: graphArg,
  timeoutMs,
  runInputs,
  executionContext
}) {
  const graph = parseOrchestrationGraph(graphArg || row?.orchestrationGraph || row?.orchestrationConfig);
  if (!isAgentSwarmGraph(graph)) return null;

  const extracted = extractSwarmNodes(graph);
  if (!extracted) return null;
  const { orchestrator, subagents, synthesis, swarmConfig } = extracted;

  await ensureSandboxAdaptersLoaded();

  if (!orchestrator) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "agent-swarm-v1 graph is missing a thinAdapter orchestrator node",
      adapterMeta: { adapter: "orchestration-agent-swarm", provider: graph.provider }
    };
  }
  if (subagents.length === 0) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "agent-swarm-v1 graph requires at least one ai-agent subagent",
      adapterMeta: { adapter: "orchestration-agent-swarm", provider: graph.provider }
    };
  }

  const maxConcurrency = clampPositiveInt(swarmConfig?.maxConcurrency, DEFAULT_MAX_CONCURRENCY);
  const rewardWeights = normalizeRewardWeights(swarmConfig?.rewardWeights);
  const orchestratorPrompt = String(orchestrator?.config?.prompt || "").trim();
  const manualPayload = runInputs ? buildInputPayloadForRunner(runInputs) : {};

  const ctx = {
    runId: executionContext?.runId || `swarm_${Date.now().toString(36)}`,
    ranAt: executionContext?.ranAt || new Date().toISOString(),
    runtime: executionContext?.runtime || "node",
    agentHost: executionContext?.agentHost || "",
    adapterId: executionContext?.adapterId || "local-process",
    env: executionContext?.env || {},
    envRefSlugs: executionContext?.envRefSlugs || [],
    envRefsMissing: executionContext?.envRefsMissing || [],
    networkAllow: executionContext?.networkAllow === true,
    allowList: executionContext?.allowList || [],
    timeoutMs: clampPositiveInt(timeoutMs, DEFAULT_SUBAGENT_TIMEOUT_MS),
    sandboxName: executionContext?.sandboxName || row?.Name || "swarm"
  };

  const startedAt = Date.now();
  let observedParallelism = 0;
  let activeNow = 0;

  const tasks = await runSubagentsWithConcurrency(subagents, maxConcurrency, async (subagentNode, index) => {
    activeNow += 1;
    if (activeNow > observedParallelism) observedParallelism = activeNow;
    try {
      const task = await dispatchSubagentTask({
        subagentNode,
        orchestratorPrompt,
        inputPayload: manualPayload,
        executionContext: ctx,
        taskIndex: index
      });
      return task;
    } finally {
      activeNow -= 1;
    }
  });

  const durationMs = Date.now() - startedAt;
  const requiredTasks = tasks.filter((t) => t.required);
  const requiredOk = requiredTasks.length === 0 || requiredTasks.every((t) => t.status === "completed");
  const outcomeOk = requiredOk && subagents.length > 0;
  const swarmStatus = outcomeOk ? "completed" : "failed";

  const reward = computeRewardTelemetry({
    subagentNodes: subagents,
    tasks,
    weights: rewardWeights,
    plannedConcurrency: maxConcurrency,
    observedParallelism: observedParallelism || (subagents.length === 1 ? 1 : 0),
    outcomeOk
  });

  const logTree = buildSwarmLogTree({
    orchestratorNode: orchestrator,
    tasks,
    synthesisNode: synthesis,
    reward,
    durationMs,
    swarmStatus
  });

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const stdoutSummary = [
    `swarm ${completedTasks.length}/${tasks.length} score=${reward.score}`,
    ...tasks.map((t) => `${t.status === "completed" ? "✓" : "✗"} ${t.role}`)
  ].join("\n");
  const errorText = outcomeOk
    ? ""
    : (tasks.find((t) => t.required && t.status === "failed")?.error || "one or more required subagents failed");

  return {
    ok: outcomeOk,
    exitCode: outcomeOk ? 0 : 1,
    durationMs,
    stdout: redactSecretsFromText(stdoutSummary),
    stderr: "",
    error: errorText || undefined,
    adapterMeta: {
      adapter: "orchestration-agent-swarm",
      mode: "agent-swarm-v1",
      provider: graph.provider,
      maxConcurrency,
      observedParallelism,
      taskCount: tasks.length,
      requiredCount: requiredTasks.length
    },
    swarm: {
      executionMode: "agent-swarm-v1",
      orchestrator: {
        nodeId: orchestrator?.id || "orchestrator",
        status: tasks.length > 0 ? "completed" : "failed"
      },
      tasks,
      reward,
      maxConcurrency,
      observedParallelism,
      synthesis: synthesis ? { nodeId: synthesis.id, label: synthesis.label || "" } : null
    },
    logTree
  };
}

export {
  runAgentSwarmGraphIfPresent,
  computeRewardTelemetry,
  buildSubtaskCommand,
  chooseAdapterIdForSubagent
};
