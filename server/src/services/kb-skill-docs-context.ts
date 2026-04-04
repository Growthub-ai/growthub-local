import type { Db } from "@paperclipai/db";
import type { AdapterAgent } from "@paperclipai/adapter-utils";
import {
  appendPaperclipSkillsToPrompt,
  buildSkillsPromptAttachmentFromOrderedDocs,
  parseAgentSkillAssignment,
} from "@paperclipai/shared";
import { parseObject } from "../adapters/utils.js";
import { getKbSkillDocsByIds, listKbSkillDocsForCompany, rowToPayload } from "./kb-skill-docs.js";

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

type AgentWithMeta = AdapterAgent & { metadata?: unknown };

/**
 * Loads assigned KB skill docs for the agent, attaches `paperclipSkillBundleV1`,
 * merges skills into `payload.prompt` / `prompt` when present, otherwise sets `paperclipSkillsMarkdown`.
 */
export async function attachKbSkillDocsToAdapterContext(
  db: Db,
  agent: AgentWithMeta,
  context: Record<string, unknown>,
): Promise<void> {
  const meta = parseObject(agent.metadata as Record<string, unknown> | null);
  const assignment = parseAgentSkillAssignment(meta);
  const orderedIds = assignment.ids;
  if (orderedIds.length === 0) return;

  const views = await getKbSkillDocsByIds(db, agent.companyId, orderedIds);
  const docsById = new Map<string, ReturnType<typeof rowToPayload>>();
  for (const id of orderedIds) {
    const v = views.get(id);
    if (v) docsById.set(id, rowToPayload(v));
  }

  const filteredOrder = orderedIds.filter((id) => docsById.has(id));
  const attachment = await buildSkillsPromptAttachmentFromOrderedDocs(filteredOrder, docsById);
  if (!attachment) return;

  context.paperclipSkillBundleV1 = attachment.bundle;

  const payloadRaw = context.payload;
  if (payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)) {
    const payload = payloadRaw as Record<string, unknown>;
    const prompt = readNonEmptyString(payload.prompt);
    if (prompt) {
      payload.prompt = appendPaperclipSkillsToPrompt(prompt, attachment);
      context.payload = payload;
      return;
    }
  }

  const direct = readNonEmptyString(context.prompt);
  if (direct) {
    context.prompt = appendPaperclipSkillsToPrompt(direct, attachment);
    return;
  }

  context.paperclipSkillsMarkdown = attachment.markdown;
}
