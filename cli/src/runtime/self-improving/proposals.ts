/**
 * Self-Improving Workspace — Capability Proposal runtime.
 *
 * Pure composition over existing primitives. No new schema invented:
 *
 *   fork-trace.ts         → appendKitForkTraceEvent (capability_proposed/promoted/rejected)
 *   memory/store.ts       → addObservation, addSummary (cross-session capture)
 *   memory/search.ts      → searchMemory (FTS over observations)
 *   native-intelligence/  → buildDeterministicPlan (draft candidate pipeline)
 *   session-memory.ts     → appendSessionLogEntry (project.md)
 *
 * A proposal is a lightweight JSON file under .growthub-fork/capabilities/proposals/.
 * It references the originating trace event by traceEventTimestamp — the trace.jsonl
 * entry IS the durable record; the proposal file is just a structured view for the
 * operator review UI.
 *
 * Lifecycle:  proposed → promoted (.growthub-fork/capabilities/promoted/)
 *                      → rejected (status field updated in-place)
 *
 * Each transition appends a typed trace event (capability_proposed, capability_promoted,
 * capability_rejected). The proposal file never duplicates trace data — it links to it.
 *
 * Execution stays hosted. This module composes and governs locally only.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveInForkStateDir } from "../../config/kit-forks-home.js";
import { appendKitForkTraceEvent } from "../../kits/fork-trace.js";
import { appendSessionLogEntry } from "../../skills/session-memory.js";
import { addObservation, addSummary } from "../memory/store.js";
import { searchMemory } from "../memory/search.js";
import { buildDeterministicPlan } from "../native-intelligence/planner.js";

// ---------------------------------------------------------------------------
// Proposal shape — lightweight pointer; heavy data lives in trace.jsonl
// ---------------------------------------------------------------------------

export type CapabilityProposalStatus = "proposed" | "reviewed" | "promoted" | "rejected";

export interface CapabilityProposal {
  version: 1;
  kind: "growthub-capability-proposal";
  proposedSlug: string;
  /** ISO timestamp of the originating capability_proposed trace event. */
  traceEventTimestamp: string;
  /** Memory store observation ID for cross-session recall. */
  memoryObservationId: number;
  fromRunId: string;
  agentSlug?: string;
  workflowId?: string;
  summary: string;
  /** Deterministic draft from native-intelligence planner — operator reviews before use. */
  candidatePipelineNodes: Array<{ slug: string; reason: string }>;
  status: CapabilityProposalStatus;
  createdAt: string;
  promotedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface ProposalFileRef {
  slug: string;
  filename: string;
  absolutePath: string;
  status: CapabilityProposalStatus;
  createdAt: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Path helpers — all writes inside .growthub-fork/ governed boundary
// ---------------------------------------------------------------------------

function proposalsDir(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "capabilities", "proposals");
}

function promotedDir(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "capabilities", "promoted");
}

function resolveProposalPath(forkPath: string, slug: string): string | null {
  const dir = proposalsDir(forkPath);
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith(slug + "-") || entry === slug + ".json") {
      return path.resolve(dir, entry);
    }
  }
  return null;
}

function buildFilename(slug: string): string {
  return `${slug}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
}

function readForkMeta(forkPath: string): { forkId: string; kitId: string } {
  try {
    const p = path.resolve(resolveInForkStateDir(forkPath), "fork.json");
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as { forkId?: string; kitId?: string };
      return {
        forkId: parsed.forkId ?? "unknown",
        kitId: parsed.kitId ?? "growthub-custom-workspace-starter-v1",
      };
    }
  } catch { /* fall through */ }
  return { forkId: "unknown", kitId: "growthub-custom-workspace-starter-v1" };
}

function readProposalFile(filePath: string): CapabilityProposal | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CapabilityProposal;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function listProposals(
  forkPath: string,
  opts: { status?: CapabilityProposalStatus } = {},
): ProposalFileRef[] {
  const results: ProposalFileRef[] = [];
  for (const dir of [proposalsDir(forkPath), promotedDir(forkPath)]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const filePath = path.resolve(dir, entry);
      const proposal = readProposalFile(filePath);
      if (!proposal) continue;
      if (opts.status && proposal.status !== opts.status) continue;
      results.push({
        slug: proposal.proposedSlug,
        filename: entry,
        absolutePath: filePath,
        status: proposal.status,
        createdAt: proposal.createdAt,
        summary: proposal.summary,
      });
    }
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------------------------------------------------------------------------
// Inspect
// ---------------------------------------------------------------------------

export function inspectProposal(forkPath: string, slug: string): CapabilityProposal | null {
  const proposalPath = resolveProposalPath(forkPath, slug);
  if (proposalPath) return readProposalFile(proposalPath);
  const p = path.resolve(promotedDir(forkPath), slug + ".json");
  if (fs.existsSync(p)) return readProposalFile(p);
  return null;
}

// ---------------------------------------------------------------------------
// Search related memory observations (composes memory/search.ts)
// ---------------------------------------------------------------------------

export function searchRelatedProposals(
  forkPath: string,
  query: string,
  limit = 5,
): Array<{ summary: string; score: number }> {
  const { forkId } = readForkMeta(forkPath);
  try {
    const result = searchMemory({ project: `fork-${forkId}`, text: query, limit });
    return result.results.map((r: { observation: { title: string }; score: number }) => ({
      summary: r.observation.title,
      score: r.score,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Propose — composes trace + memory + native-intelligence + session-memory
// ---------------------------------------------------------------------------

export interface ProposeCapabilityInput {
  forkPath: string;
  fromRunId: string;
  agentSlug?: string;
  workflowId?: string;
  slug?: string;
  summary?: string;
  sessionId?: string;
}

export interface ProposeCapabilityResult {
  proposal: CapabilityProposal;
  filePath: string;
  memoryObservationId: number;
}

export function proposeCapability(input: ProposeCapabilityInput): ProposeCapabilityResult {
  const { forkPath, fromRunId } = input;
  const { forkId, kitId } = readForkMeta(forkPath);
  const project = `fork-${forkId}`;
  const sessionId = input.sessionId ?? fromRunId;

  const rawSlug = (input.slug ?? `capability-from-${fromRunId}`)
    .toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 64);

  const summary = input.summary ?? `Reusable capability surfaced from run ${fromRunId}.`;

  // 1. Append the canonical trace event FIRST — this is the durable record
  const traceEvent = appendKitForkTraceEvent(forkPath, {
    forkId,
    kitId,
    type: "capability_proposed",
    summary: `Capability proposed: ${rawSlug} (from run ${fromRunId})`,
    detail: { slug: rawSlug, fromRunId, agentSlug: input.agentSlug, workflowId: input.workflowId },
  });

  // 2. Record in memory store for cross-session recall
  const observation = addObservation(project, {
    sessionId,
    type: "feature",
    title: `Capability proposed: ${rawSlug}`,
    subtitle: `From run ${fromRunId}`,
    facts: [`slug: ${rawSlug}`, `summary: ${summary}`, `traceAt: ${traceEvent.timestamp}`],
    narrative: summary,
    concepts: ["pattern", "what-changed"],
  });

  // 3. Draft candidate nodes via deterministic native-intelligence planner
  let candidatePipelineNodes: Array<{ slug: string; reason: string }> = [];
  try {
    const plan = buildDeterministicPlan({ userIntent: summary, availableContracts: [] });
    candidatePipelineNodes = plan.proposedNodes.map(
      (n: { slug: string; reason: string }) => ({ slug: n.slug, reason: n.reason }),
    );
  } catch { /* always safe to skip */ }

  // 4. Write the proposal file — lightweight pointer to the trace event
  const proposal: CapabilityProposal = {
    version: 1,
    kind: "growthub-capability-proposal",
    proposedSlug: rawSlug,
    traceEventTimestamp: traceEvent.timestamp,
    memoryObservationId: observation.id,
    fromRunId,
    agentSlug: input.agentSlug,
    workflowId: input.workflowId,
    summary,
    candidatePipelineNodes,
    status: "proposed",
    createdAt: traceEvent.timestamp,
  };

  const dir = proposalsDir(forkPath);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.resolve(dir, buildFilename(rawSlug));
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2) + "\n", "utf8");

  // 5. Add memory summary
  try {
    addSummary(project, {
      sessionId,
      request: `Propose capability from run ${fromRunId}`,
      completed: `Wrote proposal ${rawSlug}; trace event at ${traceEvent.timestamp}`,
      nextSteps: `Review: growthub workspace improve inspect ${rawSlug}`,
    });
  } catch { /* optional */ }

  // 6. Append to project.md (fail-safe — may not exist in un-registered forks)
  try {
    appendSessionLogEntry({
      forkPath,
      skill: "custom-workspace-operator",
      plan: `Propose capability ${rawSlug} from run ${fromRunId}.`,
      changes: `Wrote ${path.relative(forkPath, filePath)}. Memory #${observation.id}. Trace at ${traceEvent.timestamp}.`,
      outcome: "pass",
      next: `growthub workspace improve inspect ${rawSlug}`,
    });
  } catch { /* project.md optional */ }

  return { proposal, filePath, memoryObservationId: observation.id };
}

// ---------------------------------------------------------------------------
// Promote
// ---------------------------------------------------------------------------

export interface PromoteCapabilityResult {
  proposal: CapabilityProposal;
  promotedPath: string;
  originalPath: string;
}

export function promoteCapability(forkPath: string, slug: string): PromoteCapabilityResult {
  const originalPath = resolveProposalPath(forkPath, slug);
  if (!originalPath) {
    throw new Error(`No proposal found for slug "${slug}". Run: growthub workspace improve list`);
  }
  const proposal = readProposalFile(originalPath);
  if (!proposal) throw new Error(`Could not parse proposal at ${originalPath}`);
  if (proposal.status === "promoted") throw new Error(`"${slug}" is already promoted.`);
  if (proposal.status === "rejected") throw new Error(`"${slug}" is rejected; cannot promote.`);

  const promoted: CapabilityProposal = {
    ...proposal, status: "promoted", promotedAt: new Date().toISOString(),
  };

  const pDir = promotedDir(forkPath);
  fs.mkdirSync(pDir, { recursive: true });
  const promotedPath = path.resolve(pDir, slug + ".json");
  fs.writeFileSync(promotedPath, JSON.stringify(promoted, null, 2) + "\n", "utf8");
  fs.unlinkSync(originalPath);

  const { forkId, kitId } = readForkMeta(forkPath);
  appendKitForkTraceEvent(forkPath, {
    forkId, kitId, type: "capability_promoted",
    summary: `Capability promoted: ${slug}`,
    detail: { slug, promotedPath: path.relative(forkPath, promotedPath) },
  });

  try {
    addObservation(`fork-${forkId}`, {
      sessionId: `promote-${slug}`, type: "change",
      title: `Capability promoted: ${slug}`,
      facts: [`promotedAt: ${promoted.promotedAt}`],
      concepts: ["what-changed"],
    });
  } catch { /* optional */ }

  try {
    appendSessionLogEntry({
      forkPath, skill: "custom-workspace-operator",
      plan: `Promote capability ${slug}.`,
      changes: `Moved to ${path.relative(forkPath, promotedPath)}`,
      outcome: "pass",
      next: `Promoted: .growthub-fork/capabilities/promoted/${slug}.json`,
    });
  } catch { /* optional */ }

  return { proposal: promoted, promotedPath, originalPath };
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export function rejectCapability(
  forkPath: string, slug: string, reason?: string,
): CapabilityProposal {
  const filePath = resolveProposalPath(forkPath, slug);
  if (!filePath) throw new Error(`No proposal found for slug "${slug}".`);
  const proposal = readProposalFile(filePath);
  if (!proposal) throw new Error(`Could not parse proposal at ${filePath}`);

  const updated: CapabilityProposal = {
    ...proposal, status: "rejected",
    rejectedAt: new Date().toISOString(), rejectionReason: reason,
  };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf8");

  const { forkId, kitId } = readForkMeta(forkPath);
  appendKitForkTraceEvent(forkPath, {
    forkId, kitId, type: "capability_rejected",
    summary: `Capability rejected: ${slug}${reason ? ` — ${reason}` : ""}`,
    detail: { slug, reason },
  });

  return updated;
}
