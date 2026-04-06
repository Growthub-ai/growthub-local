/**
 * Shrinks huge agent-context fields for human-facing UI. Agent runs still use full values server-side.
 */

const LARGE_STRING_KEYS_MAX_CHARS: Record<string, number> = {
  paperclipSkillsMarkdown: 800,
  paperclipSessionHandoffMarkdown: 2000,
};

const OMIT_TOP_LEVEL_KEYS = new Set(["paperclipSkillBundleV1"]);

function summarizeOmittedBundle(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value as object);
    return `[KB skill bundle omitted in UI — ${keys.length} top-level keys; full bundle is on the agent run]`;
  }
  return "[KB skill bundle omitted in UI — full bundle is on the agent run]";
}

/** Deep-copy plain JSON shapes and truncate known large keys. */
export function truncateAgentContextForDisplay(value: unknown, depth = 0): unknown {
  if (depth > 24) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => truncateAgentContextForDisplay(item, depth + 1));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (OMIT_TOP_LEVEL_KEYS.has(k)) {
        out[k] = summarizeOmittedBundle(v);
        continue;
      }
      const max = LARGE_STRING_KEYS_MAX_CHARS[k];
      if (typeof v === "string" && typeof max === "number" && v.length > max) {
        out[k] =
          `${v.slice(0, max)}\n\n… truncated for UI (${v.length.toLocaleString()} chars total; full text is on the agent stdin / run)`;
        continue;
      }
      out[k] = truncateAgentContextForDisplay(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Full stdin prompts can include skills + issue text; cap what we render in run detail. */
export const MAX_PROMPT_DISPLAY_CHARS = 12_000;

export function truncatePromptForDisplay(prompt: unknown): string {
  if (typeof prompt !== "string") {
    try {
      return JSON.stringify(prompt, null, 2);
    } catch {
      return String(prompt);
    }
  }
  if (prompt.length <= MAX_PROMPT_DISPLAY_CHARS) return prompt;
  return `${prompt.slice(0, MAX_PROMPT_DISPLAY_CHARS)}\n\n… truncated for UI (${prompt.length.toLocaleString()} chars total; full prompt was sent to the agent)`;
}
