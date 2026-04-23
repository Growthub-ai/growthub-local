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
// Helpers (primitive #6 — "safe shell tool layer")
// ---------------------------------------------------------------------------

/**
 * A single helper script an agent can invoke via shell instead of
 * reconstructing a raw command inline.
 */
export interface SkillHelperRef {
  /** Relative path from the SKILL.md directory (e.g. `helpers/grep-hooks.sh`). */
  path: string;
  /** One-line description of what the helper does and when to call it. */
  description: string;
}

// ---------------------------------------------------------------------------
// Sub-skills (primitive #5 — "sub-skill + parallel agent")
// ---------------------------------------------------------------------------

/**
 * A pointer to a sub-skill that lives in a nested `skills/<slug>/SKILL.md`.
 *
 * Sub-skills are how a kit spawns a parallel sub-agent for a heavy or
 * narrow task (e.g. frame analysis, Manim render, PIL compositing) without
 * contaminating the parent skill's context.
 */
export interface SkillSubSkillRef {
  /** Short identifier (kebab-case), must match the sub-directory name. */
  name: string;
  /** Relative path from the parent SKILL.md directory (e.g. `skills/frame-analysis/SKILL.md`). */
  path: string;
}

// ---------------------------------------------------------------------------
// Self-evaluation (primitive #4 — capability-agnostic self-eval + retry ceiling)
// ---------------------------------------------------------------------------

/**
 * Self-evaluation contract for a skill run. Capability-agnostic: the same
 * shape applies to code edits, copy drafts, API payloads, asset renders,
 * audit passes, or any other unit of work a skill operates on.
 *
 * Mirrors the Fork Sync Agent's preview → apply → trace lifecycle: the
 * agent drives the retry loop; this record declares the pass/fail criteria,
 * the retry ceiling, and where each attempt is appended. Any domain-specific
 * notion of "unit of work" is defined in the kit's own operator runbook
 * (`skills.md`), not here — the SDK stays capability-agnostic.
 */
export interface SkillSelfEval {
  /** Plain-language criteria the agent checks after each attempt. */
  criteria: string[];
  /**
   * Hard retry ceiling. The agent must not exceed this. Default guidance
   * across Growthub skills is `3`.
   */
  maxRetries: number;
  /**
   * Relative path inside the fork where each attempt is logged, typically
   * `.growthub-fork/trace.jsonl`. Both human-readable (`project.md`) and
   * machine (`trace.jsonl`) entries are recommended; this field points at
   * the machine-readable stream.
   */
  traceTo?: string;
}

// ---------------------------------------------------------------------------
// Session memory (primitive #3 — "project.md")
// ---------------------------------------------------------------------------

/**
 * Where this skill's session memory lives for a governed fork. Default is
 * `.growthub-fork/project.md`, alongside `fork.json`, `policy.json`, and
 * `trace.jsonl`.
 */
export interface SkillSessionMemory {
  /** Relative path inside the fork root. */
  path: string;
}

// ---------------------------------------------------------------------------
// Origin (where a manifest was discovered)
// ---------------------------------------------------------------------------

/**
 * Discovery origin — helps the CLI catalog group manifests without losing
 * provenance.
 *
 *   - `claude-skills`  — `.claude/skills/<slug>/SKILL.md`
 *   - `worker-kit`     — `cli/assets/worker-kits/<kit>/SKILL.md` (or a fork copy)
 *   - `worker-kit-sub` — `cli/assets/worker-kits/<kit>/skills/<sub>/SKILL.md`
 *   - `project-root`   — a top-level `SKILL.md` in an arbitrary project tree
 */
export type SkillSource =
  | "claude-skills"
  | "worker-kit"
  | "worker-kit-sub"
  | "project-root";

// ---------------------------------------------------------------------------
// Skill manifest (primitive #1 — SSoT + discovery entry point)
// ---------------------------------------------------------------------------

/**
 * The canonical shape of a Growthub skill manifest. Parsed from the YAML
 * frontmatter of a `SKILL.md` file.
 *
 * Only `name` and `description` are required — every other field is
 * additive and optional so older SKILL.md files stay valid.
 */
export interface SkillManifest {
  /** Short descriptive slug; <= 64 chars. Must match the containing directory name. */
  name: string;
  /** When to use this skill + exact capability; <= 1024 chars. */
  description: string;
  /** Plain-language trigger phrases a user would say. */
  triggers?: string[];
  /**
   * Whether the SKILL.md body is a routing menu that progressively
   * discloses into sibling files. Default `true` for Growthub skills.
   */
  progressiveDisclosure?: boolean;
  /** Safe-shell helpers this skill routes through (primitive #6). */
  helpers?: SkillHelperRef[];
  /** Nested sub-skills this skill can spawn in parallel (primitive #5). */
  subSkills?: SkillSubSkillRef[];
  /** Self-evaluation contract (primitive #4). */
  selfEval?: SkillSelfEval;
  /** Session-memory home for the fork operating this skill (primitive #3). */
  sessionMemory?: SkillSessionMemory;
  /**
   * MCP tool IDs this skill prefers for auth-heavy or boundary-crossing
   * actions. Declarative only at v1 — the CLI does not run an MCP server
   * yet; this vocabulary lets future MCP routing light up without a
   * breaking change.
   */
  mcpTools?: string[];
  /** Discovery origin. Set by the catalog reader; manifests should not hardcode it. */
  source?: SkillSource;
}

// ---------------------------------------------------------------------------
// Skill node — Capability-registry-shaped representation
// ---------------------------------------------------------------------------

import type { CapabilityNode } from "./capabilities.js";

/**
 * A capability-registry-shaped projection of a skill manifest. This is
 * what `growthub discover` emits when surfacing skills alongside capability
 * nodes, so both families share the same consumer ergonomics.
 */
export interface SkillNode extends Omit<CapabilityNode, "family" | "nodeType"> {
  /** Always the synthetic `"skills"` family — keeps skill rows separate from capability families. */
  family: "skills";
  /** Always `"tool_execution"` — skills are agent-driven, not CMS workflows. */
  nodeType: "tool_execution";
  /** Absolute or repo-relative path to the SKILL.md file. */
  skillPath: string;
  /** Whether this SKILL.md is a symlink (AGENTS.md pointer pattern). */
  isSymlinked?: boolean;
  /** The parsed manifest. */
  manifest: SkillManifest;
}

// ---------------------------------------------------------------------------
// Skill catalog — top-level envelope returned by `growthub skills list`
// ---------------------------------------------------------------------------

export interface SkillCatalog {
  /** Envelope version. Additive bumps keep the literal `1`. */
  version: 1;
  /** All discovered skills, in discovery order. */
  skills: SkillManifest[];
  /** Unix timestamp (ms) the catalog was read. */
  readAt?: number;
  /** Repo or fork root the catalog was read from. */
  root?: string;
}

// ---------------------------------------------------------------------------
// Version sentinel
// ---------------------------------------------------------------------------

/**
 * Surfaces that consume `SkillManifest` may read this sentinel to confirm
 * they're on the v1 contract. Additive changes keep the literal `1`.
 */
export const SKILL_MANIFEST_VERSION = 1 as const;
