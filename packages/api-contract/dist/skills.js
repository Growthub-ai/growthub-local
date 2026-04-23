/**
 * @growthub/api-contract — Skills (CMS SDK v1)
 *
 * Public, type-only surface for the Growthub Skill manifest primitive.
 *
 * A `SkillManifest` describes a single agent-operable skill: its discovery
 * entry (SKILL.md frontmatter), optional helpers (safe shell tool layer),
 * optional sub-skills (parallel agent primitive), optional self-evaluation
 * contract (governed retry ceiling mirroring Fork Sync Agent semantics),
 * optional session-memory home (`.growthub-fork/project.md`), and optional
 * MCP tool routing vocabulary.
 *
 * Rules:
 *   - Additive only. Every field beyond `name` and `description` is optional.
 *   - No runtime behavior; consumers parse YAML frontmatter into this shape.
 *   - Existing `.claude/skills/*\/SKILL.md` files that predate these fields
 *     remain valid — they simply omit the optional fields.
 */
// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------
/**
 * Surfaces that consume `SkillManifest` may read this sentinel to confirm
 * they're on the v1 contract. Additive changes keep the literal `1`.
 */
export const SKILL_MANIFEST_VERSION = 1;
//# sourceMappingURL=skills.js.map