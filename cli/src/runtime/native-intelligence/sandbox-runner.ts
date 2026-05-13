/**
 * Governed local-model sandbox runner — uses native-intelligence transport only.
 * Parses structured JSON, classifies tool proposals, validates intents — never executes tools.
 */

import { createNativeIntelligenceBackend } from "./provider.js";
import type { NativeIntelligenceBackend, NativeIntelligenceConfig } from "./contract.js";
import type {
  LocalIntelligenceSandboxContext,
  LocalIntelligenceSandboxTaskInput,
  LocalIntelligenceToolPolicy,
  LocalModelSandboxResult,
  LocalModelSandboxRunEnvelope,
  LocalModelToolIntent,
} from "./contract.js";
import { validateLocalModelToolIntents } from "./tool-intent-policy.js";

const ENVELOPE_VERSION = "growthub-local-model-sandbox-v1" as const;

function traceLine(type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ type, at: new Date().toISOString(), ...payload });
}

function defaultToolPolicy(ctx: LocalIntelligenceSandboxContext): LocalIntelligenceToolPolicy {
  return (
    ctx.toolPolicy ?? {
      mode: "propose-only",
      allowedToolSlugs: ctx.allowedToolSlugs,
      requiresDeterministicValidation: true,
    }
  );
}

function buildSandboxSystemPrompt(input: LocalIntelligenceSandboxTaskInput): string {
  const ctx = input.context;
  const policy = defaultToolPolicy(ctx);
  const contractSummaries = ctx.availableContracts.map((c) => ({
    slug: c.slug,
    displayName: c.displayName,
    requiredBindings: c.requiredBindings,
    inputs: c.inputs.map((i) => ({ key: i.key, required: i.required, type: i.type })),
  }));

  const schemaHint = input.responseSchema
    ? `\nOptional response schema hint (follow when compatible):\n${JSON.stringify(input.responseSchema)}\n`
    : "";

  return [
    "You are Growthub Local Intelligence in a governed sandbox.",
    "Return a single JSON object only (no markdown fences).",
    "You must not claim to have executed tools or APIs.",
    "toolIntents are proposals only; include confidence between 0 and 1.",
    "",
    `taskId: ${ctx.taskId}`,
    `businessObjectType: ${input.businessObjectType}`,
    input.businessObjectId ? `businessObjectId: ${input.businessObjectId}` : "",
    `executionMode: ${ctx.executionMode}`,
    `toolPolicy.mode: ${policy.mode}`,
    `allowedToolSlugs: ${JSON.stringify(ctx.allowedToolSlugs)}`,
    "",
    "Available CMS / node contracts (summaries):",
    JSON.stringify(contractSummaries, null, 2),
    "",
    ctx.bindings ? `Current bindings:\n${JSON.stringify(ctx.bindings)}\n` : "",
    ctx.sourceRecordRefs?.length ? `sourceRecordRefs: ${JSON.stringify(ctx.sourceRecordRefs)}\n` : "",
    schemaHint,
    "JSON shape:",
    "{",
    '  "text": string (optional concise narrative),',
    '  "json": object (optional structured payload),',
    '  "toolIntents": [{ "toolSlug", "reason", "input", "confidence" }],',
    '  "warnings": string[],',
    '  "confidence": number',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSandboxUserPrompt(input: LocalIntelligenceSandboxTaskInput): string {
  return [`User intent:\n${input.userIntent.trim()}`].join("\n\n");
}

export function buildLocalIntelligenceSandboxPrompts(input: LocalIntelligenceSandboxTaskInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildSandboxSystemPrompt(input),
    userPrompt: buildSandboxUserPrompt(input),
  };
}

function coerceToolIntents(raw: unknown): LocalModelToolIntent[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalModelToolIntent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const toolSlug = typeof rec.toolSlug === "string" ? rec.toolSlug.trim() : "";
    if (!toolSlug) continue;
    const reason = typeof rec.reason === "string" ? rec.reason : "";
    const inputObj = rec.input && typeof rec.input === "object" && !Array.isArray(rec.input)
      ? (rec.input as Record<string, unknown>)
      : {};
    const confidence = typeof rec.confidence === "number" && Number.isFinite(rec.confidence) ? rec.confidence : 0;
    out.push({ toolSlug, reason, input: inputObj, confidence });
  }
  return out;
}

export function parseLocalModelSandboxResult(rawText: string): LocalModelSandboxResult {
  const warnings: string[] = [];
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { toolIntents: [], warnings: ["empty model response"], confidence: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      text: trimmed,
      toolIntents: [],
      warnings: ["model output was not valid JSON"],
      confidence: 0,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { toolIntents: [], warnings: ["parsed JSON was not an object"], confidence: 0 };
  }

  const obj = parsed as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text : undefined;
  const json = obj.json && typeof obj.json === "object" && !Array.isArray(obj.json)
    ? (obj.json as Record<string, unknown>)
    : undefined;
  const toolIntents = coerceToolIntents(obj.toolIntents);
  const w = Array.isArray(obj.warnings) ? obj.warnings.filter((w) => typeof w === "string") as string[] : [];
  warnings.push(...w);
  const confidence = typeof obj.confidence === "number" && Number.isFinite(obj.confidence) ? obj.confidence : 0;

  return { text, json, toolIntents, warnings, confidence };
}

function emptyEnvelope(
  input: LocalIntelligenceSandboxTaskInput,
  config: NativeIntelligenceConfig,
  adapterMode: string,
  message: string,
  fallback: boolean,
): LocalModelSandboxRunEnvelope {
  const result: LocalModelSandboxResult = {
    toolIntents: [],
    warnings: [message],
    confidence: 0,
  };
  return {
    version: ENVELOPE_VERSION,
    taskId: input.taskId,
    businessObjectType: input.businessObjectType,
    businessObjectId: input.businessObjectId,
    adapter: {
      kind: "local-intelligence",
      mode: adapterMode,
      modelId: config.localModel ?? config.modelId,
      endpoint: config.endpoint,
    },
    result,
    validatedToolIntents: [],
    rejectedToolIntents: [],
    rawText: "",
    latencyMs: 0,
    createdAt: new Date().toISOString(),
    trace: [traceLine("local-model-sandbox-run-completed", { taskId: input.taskId, ok: false, fallback })],
    fallback,
  };
}

export interface RunLocalIntelligenceSandboxOptions {
  /** When set (e.g. unit tests), skips createNativeIntelligenceBackend(config). */
  backend?: NativeIntelligenceBackend;
}

export async function runLocalIntelligenceSandboxTask(
  input: LocalIntelligenceSandboxTaskInput,
  config: NativeIntelligenceConfig,
  options?: RunLocalIntelligenceSandboxOptions,
): Promise<LocalModelSandboxRunEnvelope> {
  const adapterMode = String(input.adapterMode ?? "ollama");
  const toolPolicy = defaultToolPolicy(input.context);
  const trace: string[] = [];
  trace.push(traceLine("local-intelligence-adapter-selected", { kind: "local-intelligence", mode: adapterMode }));
  trace.push(traceLine("local-model-sandbox-run-started", { taskId: input.taskId }));

  const systemPrompt = buildSandboxSystemPrompt(input);
  const userPrompt = buildSandboxUserPrompt(input);

  const backend = options?.backend ?? createNativeIntelligenceBackend(config);

  let rawText = "";
  let latencyMs = 0;
  let resolvedModelId = config.localModel ?? config.modelId;

  try {
    const completion = await backend.complete({
      systemPrompt,
      userPrompt,
      temperature: config.defaultTemperature,
      maxTokens: config.defaultMaxTokens,
      responseFormat: "json",
      sandboxContext: input.context,
      toolPolicy,
    });
    rawText = completion.text;
    latencyMs = completion.latencyMs;
    resolvedModelId = completion.modelId || resolvedModelId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "model backend error";
    trace.push(traceLine("local-model-sandbox-run-completed", { taskId: input.taskId, ok: false, error: message }));
    const env = emptyEnvelope(input, config, adapterMode, message, true);
    env.trace = [...trace, ...(env.trace ?? [])];
    return env;
  }

  const parsed = parseLocalModelSandboxResult(rawText);
  for (const intent of parsed.toolIntents) {
    trace.push(traceLine("local-model-tool-intent-proposed", { toolSlug: intent.toolSlug, confidence: intent.confidence }));
  }

  const validation = validateLocalModelToolIntents(parsed.toolIntents, toolPolicy, input.context.availableContracts);
  for (const r of validation.rejected) {
    trace.push(traceLine("local-model-tool-intent-rejected", { toolSlug: r.intent.toolSlug, reasons: r.reasons }));
  }

  const mergedWarnings = [...parsed.warnings, ...validation.warnings];

  const result: LocalModelSandboxResult = {
    text: parsed.text,
    json: parsed.json,
    toolIntents: parsed.toolIntents,
    warnings: mergedWarnings,
    confidence: parsed.confidence,
  };

  trace.push(traceLine("local-model-sandbox-run-completed", { taskId: input.taskId, ok: true }));

  return {
    version: ENVELOPE_VERSION,
    taskId: input.taskId,
    businessObjectType: input.businessObjectType,
    businessObjectId: input.businessObjectId,
    adapter: {
      kind: "local-intelligence",
      mode: adapterMode,
      modelId: resolvedModelId,
      endpoint: config.endpoint,
    },
    result,
    validatedToolIntents: validation.validated,
    rejectedToolIntents: validation.rejected,
    rawText,
    latencyMs,
    createdAt: new Date().toISOString(),
    trace,
    fallback: false,
  };
}
