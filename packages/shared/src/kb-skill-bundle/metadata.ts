/**
 * Reads assigned KB skill doc IDs from agent metadata (`metadata.skills`).
 * When the key is absent, returns [] — use `parseAgentSkillAssignment` for effective assignment.
 */
export function readMetadataSkillIds(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const skills = metadata.skills;
  if (!Array.isArray(skills)) return [];
  return skills.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Explicit list in metadata (including empty = none assigned). */
export type AgentSkillAssignmentExplicit = { mode: "explicit"; ids: string[] };

/** No `skills` key (or invalid) — all active workspace KB docs are assigned. */
export type AgentSkillAssignmentImplicitAll = { mode: "implicit_all" };

export type AgentSkillAssignment = AgentSkillAssignmentExplicit | AgentSkillAssignmentImplicitAll;

/**
 * - Missing `skills` key → implicit all active workspace KB skill docs.
 * - `skills: []` → explicitly none assigned.
 * - `skills: ["uuid", …]` → explicit subset.
 */
export function parseAgentSkillAssignment(
  metadata: Record<string, unknown> | null | undefined,
): AgentSkillAssignment {
  if (!metadata || typeof metadata !== "object") return { mode: "implicit_all" };
  if (!Object.prototype.hasOwnProperty.call(metadata, "skills")) return { mode: "implicit_all" };

  const skills = metadata.skills;
  if (!Array.isArray(skills)) return { mode: "implicit_all" };

  return {
    mode: "explicit",
    ids: skills.filter((s): s is string => typeof s === "string" && s.length > 0),
  };
}

export function patchMetadataSkills(
  metadata: Record<string, unknown> | null,
  skills: string[],
): Record<string, unknown> {
  return { ...(metadata ?? {}), skills };
}

/** Persist “assign all active workspace skills” by omitting `metadata.skills`. */
export function metadataWithImplicitAllSkills(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) };
  delete next.skills;
  return next;
}
