import { buildPaperclipSkillBundleV1, formatRenderedSkillsMarkdown } from "./bundle.js";
import type { BuiltSkillBundle } from "./types.js";
import type { KbSkillDocPayload, PaperclipSkillBundleV1 } from "./types.js";

export const DEFAULT_MAX_SKILL_BODY_TOTAL_BYTES = 120_000;

export interface AppendSkillsOptions {
  maxTotalBytes?: number;
}

export interface SkillsPromptAttachment {
  markdown: string;
  bundle: PaperclipSkillBundleV1;
}

function toPublicBundle(built: BuiltSkillBundle): PaperclipSkillBundleV1 {
  const { renderedBodies: _, ...rest } = built;
  return rest;
}

export async function buildSkillsPromptAttachmentFromOrderedDocs(
  orderedIds: string[],
  docsById: Map<string, KbSkillDocPayload>,
  opts: AppendSkillsOptions = {},
): Promise<SkillsPromptAttachment | null> {
  if (orderedIds.length === 0) return null;

  const maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_SKILL_BODY_TOTAL_BYTES;
  const built = await buildPaperclipSkillBundleV1({ orderedIds, docsById, maxTotalBytes });
  if (built.items.length === 0) return null;

  const markdown = formatRenderedSkillsMarkdown(docsById, built);
  return { markdown, bundle: toPublicBundle(built) };
}

export function appendPaperclipSkillsToPrompt(base: string, attachment: SkillsPromptAttachment): string {
  const a = base.trimEnd();
  const b = attachment.markdown.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}
