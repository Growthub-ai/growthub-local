/**
 * Fine-tune deployment targets — supportive adapter layer OUTSIDE the
 * workspace configuration (the same posture as persistence adapters and
 * local agent hosts: the workspace selects by id; the adapter describes
 * the runtime; nothing here conflicts with governance, contracts, or
 * schemas).
 *
 * Targets are OpenAI-compatible chat-completions runtimes. First-party
 * default is local Ollama (the runtime the native-intelligence provider
 * already speaks: base http://127.0.0.1:11434/v1). Remote/self-hosted
 * runtimes register the same way — agnostic by construction.
 *
 * The chosen target shapes the API Registry row the handoff scaffolds:
 * {baseUrl, endpoint, method, authRef} — exactly the columns the registry
 * object already uses. requiredEnv mirrors the persistence-adapter
 * convention surfaced by /api/workspace/env-status.
 */

export const FINE_TUNE_TARGETS = [
  {
    id: "ollama-local",
    label: "Ollama (local)",
    description: "Local OpenAI-compatible runtime — the first-party default the Local Intelligence provider already uses.",
    baseUrl: "http://127.0.0.1:11434/v1",
    endpoint: "/chat/completions",
    method: "POST",
    authRef: "",
    requiredEnv: [],
    default: true,
  },
  {
    id: "openai-compatible-remote",
    label: "OpenAI-compatible (remote)",
    description: "Any hosted OpenAI-compatible runtime (vLLM, LM Studio server, managed endpoints). Resolves base URL and key from env refs — never inline.",
    baseUrl: "",
    endpoint: "/chat/completions",
    method: "POST",
    authRef: "MODEL_RUNTIME_KEY",
    requiredEnv: ["MODEL_RUNTIME_URL", "MODEL_RUNTIME_KEY"],
    default: false,
  },
];

export function defaultFineTuneTarget() {
  return FINE_TUNE_TARGETS.find((t) => t.default) || FINE_TUNE_TARGETS[0];
}

export function resolveFineTuneTarget(id) {
  return FINE_TUNE_TARGETS.find((t) => t.id === id) || defaultFineTuneTarget();
}

/**
 * Scaffold the governed rows the handoff writes on final confirmation —
 * pure function so tests and the modal share one truth. Returns:
 *   - registryRow: an api-registry row invoking the tuned model
 *   - versionRow:  a model-training row versioning this fine-tune
 *   - exportStamp: predicate marking which trace rows get exported="true"
 *
 * Row shapes mirror the seeded api-registry columns and the
 * model-training columns exactly — no new schema, no new objectType.
 */
export function scaffoldHandoffRows({ slug, version, target, modelTag, datasetRecords, datasetPath, now }) {
  const at = now || new Date().toISOString();
  const integrationId = `${slug}-model`;
  const registryRow = {
    integrationId,
    authRef: target.authRef || "",
    baseUrl: target.baseUrl,
    endpoint: target.endpoint,
    method: target.method,
    status: "registered",
    lastTested: "",
    lastResponse: "",
    entityTypes: "chat-completions",
    description: `Fine-tuned workspace model ${modelTag} (v${version}) — scaffolded by the training handoff.`,
    connectorKind: "http",
    resolverTemplateId: "custom-http",
    schemaVersion: "growthub-resolver-template-v1",
    capabilities: "chat-completions",
    executionLane: "sandbox-local",
  };
  const versionRow = {
    Name: `${slug}-v${version}`,
    status: "prepared",
    modelVersion: `ft-${at.slice(0, 10)}-v${version}`,
    apiRegistryId: integrationId,
    deployedEndpoint: `${target.baseUrl}${target.endpoint}`,
    baseModel: "",
    localModel: modelTag,
    lastExportAt: at,
    lastExportId: `ft_${version}_${at.replace(/[:.]/g, "-")}`,
    lastSourceId: "",
    lastExportSummary: JSON.stringify({ recordCount: datasetRecords, path: datasetPath, registryId: integrationId, version }),
    description: `Fine-tune dataset v${version}: ${datasetRecords} curated records → ${modelTag}, invocable via API Registry '${integrationId}'.`,
  };
  return { registryRow, versionRow, integrationId };
}
