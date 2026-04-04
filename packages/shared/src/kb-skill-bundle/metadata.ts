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

/** Explicit list in metadata (`skills` key must be present for stored assignments). */
export type AgentSkillAssignmentExplicit = { mode: "explicit"; ids: string[] };

export type AgentSkillAssignment = AgentSkillAssignmentExplicit;

/**
 * Effective KB skill assignments for an agent (opt-in only).
 *
 * - Missing `skills` key or null metadata → explicitly **no** skills (nothing injected until assigned).
 * - `skills: []` → none assigned.
 * - `skills: ["uuid", …]` → explicit subset.
 * - Invalid `skills` type → treated as none.
 */
export function parseAgentSkillAssignment(
  metadata: Record<string, unknown> | null | undefined,
): AgentSkillAssignment {
  if (!metadata || typeof metadata !== "object") {
    return { mode: "explicit", ids: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, "skills")) {
    return { mode: "explicit", ids: [] };
  }

  const skills = metadata.skills;
  if (!Array.isArray(skills)) {
    return { mode: "explicit", ids: [] };
  }

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
