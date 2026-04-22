/**
 * Schema Renderer
 *
 * One codepath, three modes:
 *
 *   - "interactive"     — TTY prompt (legible to humans)
 *   - "non-interactive" — read bindings from a JSON buffer / file / stdin
 *   - "agent-json"      — emit the schema itself as machine-readable JSON so
 *                         an agent can plan, then consume the agent's reply
 *
 * Every mode returns the same shape: a resolved bindings record and a
 * normalization report. Callers do not branch on mode.
 */

import type { NodeInputSchema, NodeInputField } from "@growthub/api-contract";
import type { NormalizedBindings } from "./types.js";

export type RenderMode = "interactive" | "non-interactive" | "agent-json";

export interface RenderSchemaOptions {
  mode: RenderMode;
  /** Pre-supplied bindings (merged over defaults before prompting). */
  seedBindings?: Record<string, unknown>;
  /** Non-interactive JSON payload. Ignored in other modes. */
  nonInteractivePayload?: Record<string, unknown>;
  /**
   * Interactive adapter. Injected at call site so this module stays free
   * of UX deps (clack is only wired where a TTY is confirmed). The adapter
   * is invoked once per missing field.
   */
  interactivePrompt?: (field: NodeInputField, current: unknown) => Promise<unknown>;
}

export interface RenderedSchemaResult {
  bindings: Record<string, unknown>;
  /** The schema itself, echoed back for agent consumption. */
  schema: NodeInputSchema;
  /** Normalization summary (mirrors NormalizedBindings). */
  report: NormalizedBindings;
  /** True when the caller should not dispatch — agent is expected to reply. */
  awaitingAgentReply: boolean;
}

function cloneDefaults(schema: NodeInputSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.defaultValue !== undefined) out[field.key] = field.defaultValue;
  }
  return out;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" ||
    (Array.isArray(v) && v.length === 0);
}

export async function renderSchema(
  schema: NodeInputSchema,
  options: RenderSchemaOptions,
): Promise<RenderedSchemaResult> {
  const base = cloneDefaults(schema);
  const seed = options.seedBindings ?? {};
  const merged: Record<string, unknown> = { ...base, ...seed };

  let providedCount = Object.keys(seed).length;
  let defaultedCount = Object.keys(base).length - providedCount;
  if (defaultedCount < 0) defaultedCount = 0;
  let normalizedCount = 0;

  if (options.mode === "agent-json") {
    return {
      bindings: merged,
      schema,
      report: { bindings: merged, providedCount, defaultedCount, normalizedCount },
      awaitingAgentReply: true,
    };
  }

  if (options.mode === "non-interactive") {
    const payload = options.nonInteractivePayload ?? {};
    for (const [key, value] of Object.entries(payload)) {
      merged[key] = value;
      providedCount += 1;
    }
    return {
      bindings: merged,
      schema,
      report: { bindings: merged, providedCount, defaultedCount, normalizedCount },
      awaitingAgentReply: false,
    };
  }

  // interactive
  if (!options.interactivePrompt) {
    throw new Error("renderSchema interactive mode requires an interactivePrompt adapter");
  }
  for (const field of schema.fields) {
    const current = merged[field.key];
    if (field.required && isEmpty(current)) {
      const supplied = await options.interactivePrompt(field, current);
      merged[field.key] = supplied;
      providedCount += 1;
      normalizedCount += 1;
    }
  }
  return {
    bindings: merged,
    schema,
    report: { bindings: merged, providedCount, defaultedCount, normalizedCount },
    awaitingAgentReply: false,
  };
}
