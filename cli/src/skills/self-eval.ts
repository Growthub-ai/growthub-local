/**
 * Self-evaluation bookkeeping primitive (primitive #4).
 *
 * Records a single self-eval attempt to both halves of the fork journal:
 *   - `.growthub-fork/project.md`   (human-readable, via `appendSessionLogEntry`)
 *   - `.growthub-fork/trace.jsonl`  (machine-readable, via `appendKitForkTraceEvent`)
 *
 * This module does NOT execute the retry loop — the agent drives the loop.
 * It only enforces that every attempt is recorded on both surfaces in one
 * call, and it exposes `countAttempts` so the agent can enforce
 * `maxRetries` from the active skill's frontmatter.
 *
 * Capability-agnostic: the same primitive applies to code edits, copy
 * drafts, API payloads, asset renders, or any other unit of work. Any
 * domain-specific notion of "unit of work" lives in the kit's `skills.md`
 * operator runbook, not here.
 */

import fs from "node:fs";
import path from "node:path";
import { appendKitForkTraceEvent } from "../kits/fork-trace.js";
import { appendSessionLogEntry, resolveProjectMdPath } from "./session-memory.js";

export type SelfEvalOutcome = "pass" | "fail" | "retry-pending" | "parked";

export interface RecordSelfEvalInput {
  /** Path to the fork root. */
  forkPath: string;
  /** Fork id (from `.growthub-fork/fork.json`). */
  forkId: string;
  /** Kit id (from `.growthub-fork/fork.json`). */
  kitId: string;
  /** Skill slug driving this attempt. */
  skill: string;
  /** 1-indexed attempt number. Must satisfy `attempt <= maxRetries`. */
  attempt: number;
  /** Ceiling declared by the skill's frontmatter (`selfEval.maxRetries`). */
  maxRetries: number;
  /** The single criterion checked this attempt (from `selfEval.criteria`). */
  criterion: string;
  /** Attempt outcome. */
  outcome: SelfEvalOutcome;
  /** Optional free-form note (kept small; < 512 chars in practice). */
  notes?: string;
}

export interface RecordSelfEvalResult {
  /** The block appended to `project.md`. */
  projectMdBlock: string;
  /** The trace event persisted to `trace.jsonl`. */
  traceEventTimestamp: string;
  /** Whether the agent has hit the retry ceiling (attempt === maxRetries). */
  atCeiling: boolean;
}

/**
 * Record one self-eval attempt. Writes to both `project.md` and
 * `trace.jsonl`. Throws if `project.md` is not initialised (the starter /
 * import materializer seeds it).
 */
export function recordSelfEval(input: RecordSelfEvalInput): RecordSelfEvalResult {
  if (input.attempt < 1) {
    throw new Error(`Self-eval attempt must be >= 1, got ${input.attempt}`);
  }
  if (input.maxRetries < 1) {
    throw new Error(`maxRetries must be >= 1, got ${input.maxRetries}`);
  }
  if (input.attempt > input.maxRetries) {
    throw new Error(
      `Self-eval attempt ${input.attempt} exceeds maxRetries ${input.maxRetries}. Park the task.`,
    );
  }

  const block = appendSessionLogEntry({
    forkPath: input.forkPath,
    skill: input.skill,
    plan: `Self-eval attempt ${input.attempt}/${input.maxRetries} — criterion: ${input.criterion}`,
    outcome: `${input.outcome}${input.notes ? ` — ${input.notes}` : ""}`,
  });

  const at = new Date().toISOString();
  appendKitForkTraceEvent(input.forkPath, {
    forkId: input.forkId,
    kitId: input.kitId,
    type: "self_eval_recorded",
    summary: `${input.skill} attempt ${input.attempt}/${input.maxRetries} ${input.outcome} on ${input.criterion}`,
    detail: {
      skill: input.skill,
      attempt: input.attempt,
      maxRetries: input.maxRetries,
      criterion: input.criterion,
      outcome: input.outcome,
      ...(input.notes ? { notes: input.notes } : {}),
    },
    timestamp: at,
  });

  return {
    projectMdBlock: block,
    traceEventTimestamp: at,
    atCeiling: input.attempt >= input.maxRetries,
  };
}

/**
 * Count prior self-eval attempts for a given skill in `trace.jsonl`.
 * Helpful for agents that resume a fork mid-loop and need to know how
 * many attempts are already on record.
 */
export function countAttempts(forkPath: string, skill: string): number {
  const tracePath = path.resolve(forkPath, ".growthub-fork/trace.jsonl");
  if (!fs.existsSync(tracePath)) return 0;
  const raw = fs.readFileSync(tracePath, "utf8");
  let count = 0;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const event = JSON.parse(line);
      if (
        event?.type === "self_eval_recorded" &&
        (event?.detail?.skill === skill || event?.summary?.startsWith(`${skill} `))
      ) {
        count++;
      }
    } catch {
      // skip malformed line
    }
  }
  return count;
}

/** Convenience: is the fork's session memory initialised? */
export function isSessionMemoryInitialised(forkPath: string): boolean {
  return fs.existsSync(resolveProjectMdPath(forkPath));
}
