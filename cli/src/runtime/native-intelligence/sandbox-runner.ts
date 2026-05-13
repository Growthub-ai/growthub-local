/**
 * Governed local-model sandbox runner — calls native-intelligence transport
 * only; does not execute tools or dispatch provider SDKs.
 */

import type {
  LocalIntelligenceSandboxContext,
  LocalIntelligenceSandboxTaskInput,
  LocalIntelligenceToolPolicy,
  LocalModelSandboxRunEnvelope,
  LocalModelSandboxResult,
  LocalModelToolIntent,
  NativeIntelligenceBackend,
  NativeIntelligenceConfig,
} from "./contract.js";
import { NativeIntelligenceBackendError } from "./provider.js";
import { validateLocalModelToolIntents } from "./tool-intent-policy.js";
import type {
  LocalIntelligenceAdapterSelectedEvent,
  LocalIntelligenceTraceEvent,
  LocalModelSandboxRunCompletedEvent,
  LocalModelSandboxRunStartedEvent,
  LocalModelToolIntentProposedEvent,
  LocalModelToolIntentRejectedEvent,
} from "@growthub/api-contract";

function isoNow(): string {
  return new Date().toISOString();
}

function resolveAdapterMode(config: NativeIntelligenceConfig): string {
  if (config.localAdapterMode && String(config.localAdapterMode).trim()) {
    return String(config.localAdapterMode).trim();
  }
  const ep = config.endpoint.toLowerCase();
  if (ep.includes("11434")) return "ollama";
  if (process.env.LMSTUDIO_BASE_URL) return "lmstudio";
  if (process.env.VLLM_BASE_URL) return "vllm";
  if (config.backendType === "hosted" || config.providerType && config.providerType !== "local") {
    return "hosted";
  }
  return "custom-openai-compatible";
}

function buildSandboxSystemPrompt(
  input: LocalIntelligenceSandboxTaskInput,
  policy: LocalIntelligenceToolPolicy,
): string {
  const ctx = input.context;
  const schemaHint = input.responseSchema
    ? `\nOptional response schema hints (keys only, follow shape where sensible):\n${JSON.stringify(input.responseSchema)}`
    : "";

  const contractsJson = JSON.stringify(
    ctx.availableContracts.map((c) => ({
      slug: c.slug,
      displayName: c.displayName,
      requiredBindings: c.requiredBindings,
      inputs: c.inputs,
    })),
    null,
    2,
  );

  return [
    "You are Growthub Local Intelligence in a GOVERNED SANDBOX.",
    "Return a single JSON object only (no markdown fences). Shape:",
    JSON.stringify({
      text: "optional human summary string",
      json: "optional object with structured findings",
      toolIntents: [
        {
          toolSlug: "cms capability slug from availableContracts only",
          reason: "why this tool",
          input: {},
          confidence: 0.0,
        },
      ],
      warnings: ["string"],
      confidence: 0.0,
    }),
    "",
    "Rules:",
    "- toolIntents must only reference slugs from availableContracts AND allowedToolSlugs when non-empty.",
    "- You MUST NOT claim secrets, API keys, or raw credentials.",
    "- You propose tools only; Growthub validates before any execution.",
    `- Tool policy mode: ${policy.mode}.`,
    "",
    `Task id: ${ctx.taskId}`,
    `Business object type: ${ctx.businessObjectType}`,
    ctx.businessObjectId ? `Business object id: ${ctx.businessObjectId}` : "",
    `Execution mode context: ${ctx.executionMode}`,
    `Allowed tool slugs: ${JSON.stringify(ctx.allowedToolSlugs)}`,
    ctx.bindings ? `Bindings snapshot:\n${JSON.stringify(ctx.bindings)}` : "",
    ctx.sourceRecordRefs ? `Source record refs: ${JSON.stringify(ctx.sourceRecordRefs)}` : "",
    "",
    "Available contracts:",
    contractsJson,
    schemaHint,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseModelJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try {
        const parsed = JSON.parse(fence[1].trim()) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function coerceToolIntents(raw: unknown): LocalModelToolIntent[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalModelToolIntent[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const toolSlug = String(rec.toolSlug ?? "").trim();
    if (!toolSlug) continue;
    const confidence = typeof rec.confidence === "number" && Number.isFinite(rec.confidence) ? rec.confidence : 0;
    out.push({
      toolSlug,
      reason: typeof rec.reason === "string" ? rec.reason : "",
      input: rec.input && typeof rec.input === "object" && !Array.isArray(rec.input) ? (rec.input as Record<string, unknown>) : {},
      confidence,
    });
  }
  return out;
}

function parseSandboxResult(rawText: string): LocalModelSandboxResult {
  const parsed = parseModelJsonObject(rawText);
  if (!parsed) {
    return {
      text: rawText.slice(0, 2000),
      toolIntents: [],
      warnings: ["model output was not valid JSON; see rawText on envelope"],
      confidence: 0,
    };
  }
  const warnings = Array.isArray(parsed.warnings)
    ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === "string")
    : [];
  const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence) ? parsed.confidence : 0;
  const toolIntents = coerceToolIntents(parsed.toolIntents);
  const text = typeof parsed.text === "string" ? parsed.text : undefined;
  const json = parsed.json && typeof parsed.json === "object" && !Array.isArray(parsed.json)
    ? (parsed.json as Record<string, unknown>)
    : undefined;

  return { text, json, toolIntents, warnings, confidence };
}

const DEFAULT_TOOL_POLICY: LocalIntelligenceToolPolicy = {
  mode: "propose-only",
  allowedToolSlugs: [],
  requiresDeterministicValidation: true,
  minConfidence: 0,
};

/**
 * Runs a governed sandbox task through the existing OpenAI-compatible backend.
 * Parses structured JSON, extracts tool intents, validates against policy.
 * Does not execute tools.
 */
export async function runLocalIntelligenceSandboxTask(
  input: LocalIntelligenceSandboxTaskInput,
  config: NativeIntelligenceConfig,
  backend: NativeIntelligenceBackend,
  toolPolicy: LocalIntelligenceToolPolicy = DEFAULT_TOOL_POLICY,
): Promise<LocalModelSandboxRunEnvelope> {
  const startedAt = isoNow();
  const mode = resolveAdapterMode(config);
  const trace: LocalIntelligenceTraceEvent[] = [];

  const adapterSelected: LocalIntelligenceAdapterSelectedEvent = {
    type: "local-intelligence-adapter-selected",
    at: startedAt,
    taskId: input.taskId,
    adapterKind: "local-intelligence",
    mode,
    modelId: config.localModel ?? config.modelId,
    endpoint: config.endpoint,
  };
  trace.push(adapterSelected);

  const runStarted: LocalModelSandboxRunStartedEvent = {
    type: "local-model-sandbox-run-started",
    at: startedAt,
    taskId: input.taskId,
    businessObjectType: input.businessObjectType,
    businessObjectId: input.businessObjectId,
  };
  trace.push(runStarted);

  const policy: LocalIntelligenceToolPolicy = {
    ...toolPolicy,
    allowedToolSlugs:
      toolPolicy.allowedToolSlugs.length > 0
        ? toolPolicy.allowedToolSlugs
        : input.context.allowedToolSlugs,
  };

  const systemPrompt = buildSandboxSystemPrompt(input, policy);
  const userPrompt = [
    "User intent:",
    input.userIntent,
  ].join("\n");

  const t0 = Date.now();
  let rawText = "";
  let result: LocalModelSandboxResult = {
    toolIntents: [],
    warnings: [],
    confidence: 0,
  };

  try {
    const completion = await backend.complete({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      temperature: config.defaultTemperature ?? 0.3,
      maxTokens: config.defaultMaxTokens ?? 4096,
      sandboxContext: input.context,
      toolPolicy: policy,
    });
    rawText = completion.text;
    result = parseSandboxResult(rawText);
  } catch (err) {
    const message = err instanceof NativeIntelligenceBackendError ? err.message : String(err);
    result = {
      toolIntents: [],
      warnings: [`sandbox backend error: ${message}`],
      confidence: 0,
    };
  }

  const validation = validateLocalModelToolIntents(
    result.toolIntents,
    policy,
    input.context.availableContracts,
  );

  for (const intent of result.toolIntents) {
    const proposed: LocalModelToolIntentProposedEvent = {
      type: "local-model-tool-intent-proposed",
      at: isoNow(),
      taskId: input.taskId,
      toolSlug: intent.toolSlug,
      confidence: intent.confidence,
    };
    trace.push(proposed);
  }

  for (const rej of validation.rejected) {
    const rejectedEv: LocalModelToolIntentRejectedEvent = {
      type: "local-model-tool-intent-rejected",
      at: isoNow(),
      taskId: input.taskId,
      toolSlug: rej.intent.toolSlug,
      reasons: rej.reasons,
    };
    trace.push(rejectedEv);
  }

  const mergedWarnings = [...result.warnings, ...validation.warnings];
  const latencyMs = Date.now() - t0;

  const completed: LocalModelSandboxRunCompletedEvent = {
    type: "local-model-sandbox-run-completed",
    at: isoNow(),
    taskId: input.taskId,
    businessObjectType: input.businessObjectType,
    latencyMs,
    confidence: result.confidence,
    warningCount: mergedWarnings.length,
  };
  trace.push(completed);

  return {
    version: "growthub-local-model-sandbox-v1",
    taskId: input.taskId,
    businessObjectType: input.businessObjectType,
    businessObjectId: input.businessObjectId,
    adapter: {
      kind: "local-intelligence",
      mode,
      modelId: config.localModel ?? config.modelId,
      endpoint: config.endpoint,
    },
    result: {
      ...result,
      warnings: mergedWarnings,
    },
    validatedToolIntents: validation.accepted,
    rejectedToolIntents: validation.rejected,
    rawText,
    latencyMs,
    createdAt: isoNow(),
    trace,
  };
}
