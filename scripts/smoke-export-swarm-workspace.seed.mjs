/**
 * Seed payload for scripts/smoke-export-swarm-workspace.mjs — PURE DATA ONLY.
 *
 * Every object is derived from a proven probe shape, not invented:
 *
 *   - API_REGISTRY_OBJECT       ← scripts/awac-workspace-api-probe.mjs
 *                                 buildSeedDataModel() lines 95–167:
 *                                 `api-registry-probe`, apiRegistryColumns,
 *                                 trusted `probe-scheduler` row + the
 *                                 `probe-untrusted` row whose exclusion from
 *                                 trusted pickers stays observable.
 *   - SANDBOX_OBJECT            ← scripts/e2e-workspace-sandbox-api-probe.mjs
 *                                 sandboxColumns lines 38–61 (full canonical
 *                                 column set) + sandboxRelations lines 63–73
 *                                 (`scheduler-registry-binding` →
 *                                 targetObjectType "api-registry") + the
 *                                 runnable `probe-local-sbx` row shape from
 *                                 scripts/awac-workspace-api-probe.mjs lines
 *                                 176–199 (local-process, console.log, proven
 *                                 ok:true), plus one workflow row carrying the
 *                                 canonical NON-swarm growthub-native graph
 *                                 (node order input → api-request → transform
 *                                 → result per lib/orchestration-graph.js
 *                                 buildDefaultOrchestrationGraphFromRegistry).
 *   - HELPER_SANDBOX_OBJECT     ← apps/workspace …/HelperSidecar.jsx saveSetup
 *                                 first-time seed shape (workspace-helper-sandbox)
 *                                 pointed at the deterministic agent-host stub
 *                                 so the helper chat works with zero external
 *                                 model dependencies.
 *   - SEED_DASHBOARDS / WIDGETS ← the kit's own dashboard row shape
 *                                 (growthub.config.json) and the widget factory
 *                                 shape in lib/workspace-schema.js
 *                                 (createWidget / defaultConfigFor; 12×16 grid).
 *   - STUB_ADAPTER_SOURCE       ← scripts/e2e-workspace-sandbox-api-probe.mjs
 *                                 probe-swarm-stub lines 201–223, extended with
 *                                 a Workspace-Helper branch that returns a valid
 *                                 swarm.run.propose envelope so the governed
 *                                 /swarm journey is fully offline-deterministic.
 *
 * Deliberately ABSENT: any `swarm-workflows` object or row. The governed
 * /swarm journey must create that live — pre-seeding it would destroy the
 * causation test.
 */

export const API_REGISTRY_COLUMNS = [
  "integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse",
  "entityTypes", "description", "connectorKind", "resolverTemplateId", "schemaVersion", "capabilities", "executionLane"
];

export const API_REGISTRY_OBJECT = {
  id: "api-registry-probe",
  label: "API Registry",
  source: "API Registry",
  objectType: "api-registry",
  icon: "Code2",
  columns: API_REGISTRY_COLUMNS,
  rows: [
    {
      integrationId: "probe-scheduler",
      authRef: "PROBE_SCHEDULER",
      baseUrl: "https://example.invalid",
      endpoint: "/run",
      method: "POST",
      status: "connected",
      lastTested: "",
      lastResponse: "",
      entityTypes: "",
      description: "Completed prior-smoke scheduler registration (trusted)",
      connectorKind: "http",
      resolverTemplateId: "custom-http",
      schemaVersion: "growthub-resolver-template-v1",
      capabilities: "",
      executionLane: "sandbox-serverless"
    },
    {
      integrationId: "probe-untrusted",
      authRef: "X",
      baseUrl: "https://example.invalid",
      endpoint: "/x",
      method: "POST",
      status: "failed",
      lastTested: "",
      lastResponse: "",
      entityTypes: "",
      description: "Untrusted row — must stay excluded from trusted scheduler pickers",
      connectorKind: "http",
      resolverTemplateId: "",
      schemaVersion: "",
      capabilities: "",
      executionLane: ""
    }
  ],
  binding: { mode: "manual", source: "Data Model" },
  relations: [],
  fieldSettings: { hidden: [], order: API_REGISTRY_COLUMNS }
};

export const SANDBOX_COLUMNS = [
  "Name", "lifecycleStatus", "version", "runLocality", "schedulerRegistryId", "runtime", "adapter", "agentHost",
  "localModel", "localEndpoint", "intelligenceAdapterMode", "envRefs", "networkAllow", "allowList",
  "instructions", "command", "timeoutMs", "status", "lastTested", "lastRunId", "lastSourceId", "lastResponse"
];

export const SCHEDULER_RELATION = {
  id: "scheduler-registry-binding",
  name: "Scheduler (serverless)",
  field: "schedulerRegistryId",
  targetObjectType: "api-registry",
  type: "belongs-to",
  description:
    "When runLocality is serverless, POST /api/workspace/sandbox-run sends growthub-sandbox-run-v1 to this API Registry record (METHOD, baseUrl, endpoint, authRef resolved server-side)."
};

// Canonical non-swarm growthub-native graph (input → api-request → transform
// → result) bound to the seeded trusted registry row — represents completed
// prior-generation workflow work living alongside the new swarm feature.
export const REGISTRY_WORKFLOW_GRAPH = {
  version: 1,
  provider: "growthub-native",
  nodes: [
    {
      id: "input",
      type: "input",
      label: "Input",
      subtitle: "Manual or source payload",
      config: { inputMode: "manual", samplePayload: {}, sourceType: "", sourceId: "", entityId: "", filterMode: "and", filters: [] }
    },
    {
      id: "api-request",
      type: "api-registry-call",
      label: "API Registry",
      subtitle: "probe-scheduler · POST /run",
      config: {
        registryId: "probe-scheduler",
        integrationId: "probe-scheduler",
        baseUrl: "https://example.invalid",
        endpoint: "/run",
        method: "POST",
        authRef: "PROBE_SCHEDULER",
        queryParams: {},
        bodyTemplate: "",
        requestHeadersMetadata: { authHeaderName: "x-api-key", authPrefix: "", contentType: "application/json" },
        timeoutMs: 30000
      }
    },
    {
      id: "transform",
      type: "transform-filter",
      label: "Transform",
      subtitle: "Map fields and apply filters",
      config: { rootPath: "data", mode: "json", fieldMap: {}, includeFields: [], excludeFields: [], computedFields: {}, filters: [], filterMode: "and", maxRows: 0 }
    },
    {
      id: "result",
      type: "tool-result",
      label: "Result",
      subtitle: "Save status and response",
      config: { successStatusCodes: [200], writeLastResponse: true, writeSourceRecord: true, sourceRecordId: "", outputMode: "normalized-json", previewFields: [], statusField: "status", lastTestedField: "lastTested" }
    }
  ],
  edges: [
    { from: "input", to: "api-request", passes: "payload, filters, variables" },
    { from: "api-request", to: "transform", passes: "provider-response" },
    { from: "transform", to: "result", passes: "normalized-output" }
  ]
};

export const SANDBOX_OBJECT = {
  id: "sandbox-probe",
  label: "Sandboxes",
  source: "Sandboxes",
  objectType: "sandbox-environment",
  icon: "Terminal",
  columns: SANDBOX_COLUMNS,
  rows: [
    {
      Name: "probe-local-sbx",
      lifecycleStatus: "draft",
      version: "1",
      runLocality: "local",
      schedulerRegistryId: "",
      runtime: "node",
      adapter: "local-process",
      agentHost: "",
      localModel: "",
      localEndpoint: "",
      intelligenceAdapterMode: "ollama",
      envRefs: "",
      networkAllow: "false",
      allowList: "",
      instructions: "",
      command: "console.log('growthub-probe-ok')",
      timeoutMs: "15000",
      status: "",
      lastTested: "",
      lastRunId: "",
      lastSourceId: "",
      lastResponse: ""
    },
    {
      Name: "registry-workflow",
      lifecycleStatus: "draft",
      version: "1",
      runLocality: "local",
      schedulerRegistryId: "",
      runtime: "node",
      adapter: "local-process",
      agentHost: "",
      localModel: "",
      localEndpoint: "",
      intelligenceAdapterMode: "ollama",
      envRefs: "",
      networkAllow: "false",
      allowList: "",
      instructions: "Completed prior-smoke workflow: calls probe-scheduler and normalizes at data.",
      command: "",
      timeoutMs: "30000",
      status: "",
      lastTested: "",
      lastRunId: "",
      lastSourceId: "",
      lastResponse: "",
      orchestrationConfig: JSON.stringify(REGISTRY_WORKFLOW_GRAPH, null, 2)
    }
  ],
  binding: { mode: "manual", source: "Data Model" },
  relations: [SCHEDULER_RELATION],
  fieldSettings: { hidden: [], order: SANDBOX_COLUMNS }
};

// Helper sandbox row — routes the assistant widget through the bundled
// deterministic agent-host stub (claude_local) so the /swarm chat journey
// needs no external model. Swap via the helper Setup tab for a real model.
export const HELPER_SANDBOX_OBJECT = {
  id: "workspace-helper-sandbox",
  label: "Workspace Helper Sandbox",
  source: "Workspace Helper Sandbox",
  objectType: "sandbox-environment",
  icon: "Terminal",
  columns: ["Name", "lifecycleStatus", "runLocality", "runtime", "adapter", "agentHost", "intelligenceType", "localModel", "localEndpoint", "intelligenceAdapterMode"],
  rows: [
    {
      Name: "workspace-helper",
      lifecycleStatus: "live",
      runLocality: "local",
      runtime: "node",
      adapter: "local-agent-host",
      agentHost: "claude_local",
      intelligenceType: "local-intelligence",
      localModel: "",
      localEndpoint: "",
      intelligenceAdapterMode: "ollama"
    }
  ],
  binding: { mode: "manual", source: "Workspace Helper Sandbox" }
};

export const SEED_DASHBOARDS = [
  {
    id: "ops-overview",
    name: "Ops Overview",
    createdBy: "Workspace owner",
    updatedAt: "seeded",
    status: "active"
  }
];

// 12×16 grid, ids required by validateWidgetArray; the view widget is bound
// to the seeded api-registry object (sourceObjectId provenance + inline
// rows snapshot — the same inline-binding grammar the kit's widgets read).
export const SEED_CANVAS_WIDGETS = [
  {
    id: "widget-ops-notes",
    kind: "rich-text",
    title: "Ops Notes",
    position: { x: 0, y: 0, w: 4, h: 4 },
    config: {
      text: "Prior smoke generation complete: API registry connected, sandbox workflow graphed. Next: governed /swarm journey.",
      binding: { mode: "manual", source: "Manual text", rows: [] }
    }
  },
  {
    id: "widget-registry-view",
    kind: "view",
    title: "API Registry",
    position: { x: 4, y: 0, w: 5, h: 4 },
    sourceObjectId: "api-registry-probe",
    config: {
      source: "API Registry",
      layout: "Table",
      columns: ["integrationId", "status", "endpoint"],
      rows: [
        { integrationId: "probe-scheduler", status: "connected", endpoint: "/run" },
        { integrationId: "probe-untrusted", status: "failed", endpoint: "/x" }
      ],
      binding: { mode: "manual", source: "API Registry", rows: [] }
    }
  },
  {
    id: "widget-delivery-health",
    kind: "chart",
    title: "Delivery Health",
    position: { x: 9, y: 0, w: 3, h: 4 },
    config: {
      values: [72, 64, 81, 58, 76],
      binding: { mode: "manual", source: "Manual values", rows: [] }
    }
  }
];

// Deterministic prompt-capable adapter stub dropped into the EXPORT's adapter
// drop-zone (never the repo) — extends the proven e2e probe stub with a
// Workspace-Helper branch returning a governed swarm.run.propose envelope.
export const STUB_ADAPTER_SOURCE = `import { registerSandboxAdapter } from "../sandbox-adapter-registry.js";

const SWARM_PROPOSAL_ENVELOPE = {
  summary: "Proposing a governed 4-agent smoke swarm (phases Ping and Echo). Review and apply to create the workflow row — nothing runs until you launch it.",
  proposals: [
    {
      type: "swarm.run.propose",
      affectedField: "dataModel",
      rationale: "Low-token smoke swarm to exercise the Background-tasks cockpit on this export.",
      confidence: 0.9,
      payload: {
        name: "smoke-export-swarm",
        description: "Low-token smoke swarm to exercise workflow UI/UX",
        objective: "Exercise the governed swarm journey on the exported workspace.",
        agents: [
          { role: "ping-0", taskPrompt: "Reply with pong.", phase: "ping", required: true },
          { role: "ping-1", taskPrompt: "Reply with pong.", phase: "ping", required: true },
          { role: "echo-alpha", taskPrompt: "Echo the word smoke.", phase: "echo", required: true },
          { role: "echo-beta", taskPrompt: "Echo the word smoke.", phase: "echo", required: false }
        ],
        maxConcurrency: 4,
        outcomeCriteria: "Every required agent replies.",
        adapter: "local-agent-host",
        agentHost: "claude_local"
      }
    }
  ],
  warnings: []
};

registerSandboxAdapter({
  id: "local-agent-host",
  label: "smoke stub (prompt-capable)",
  description: "Smoke-export stub — deterministic, offline; replaces the spawn-based default for this disposable workspace.",
  locality: "local",
  supportedRuntimes: ["node", "bash", "python"],
  supportedHosts: ["claude_local"],
  hostCatalog: { claude_local: { label: "Claude Code (stub)", binary: "claude" } },
  run: async (request) => {
    const command = String(request?.command || "");
    if (command.includes("Growthub Workspace Helper")) {
      return { ok: true, exitCode: 0, durationMs: 1, stdout: JSON.stringify(SWARM_PROPOSAL_ENVELOPE), stderr: "", adapterMeta: { stub: true } };
    }
    const phase = request?.env?.GROWTHUB_SWARM_PHASE || "subagent";
    const role = request?.env?.GROWTHUB_SWARM_SUBAGENT_ROLE || "subagent";
    if (phase === "orchestrator") {
      return { ok: true, exitCode: 0, durationMs: 1, stdout: "PLAN: ping agents reply pong, echo agents echo smoke.", stderr: "", adapterMeta: { stub: true } };
    }
    if (phase === "synthesis") {
      return { ok: true, exitCode: 0, durationMs: 1, stdout: "All agents replied.\\nOUTCOME_SCORE: 0.91", stderr: "", adapterMeta: { stub: true } };
    }
    return { ok: true, exitCode: 0, durationMs: 1, stdout: \`[\${role}] done\`, stderr: "", adapterMeta: { stub: true } };
  }
});
`;

export const SWARM_QUERY_PROMPT =
  "Propose a governed agent swarm: 4 low-token agents, phases Ping and Echo, local only.";
