/**
 * Kit Fork Trace Log
 *
 * Append-only JSONL event stream per fork. Gives the agent a durable trace
 * across long-running and cross-session work — every drift scan, every heal
 * plan, every remote operation, every conflict is recorded.
 *
 * Canonical location (in-fork):
 *   <forkPath>/.growthub-fork/trace.jsonl
 *
 * Never truncated by the agent. Users can manually rotate if file size grows.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";

export type KitForkTraceEventType =
  | "registered"
  | "deregistered"
  | "policy_updated"
  | "status_ran"
  | "heal_proposed"
  | "heal_confirmed"
  | "heal_applied"
  | "heal_skipped"
  | "heal_failed"
  | "remote_connected"
  | "remote_pushed"
  | "remote_pr_opened"
  | "conflict_encountered"
  | "conflict_resolved"
  | "conflict_aborted"
  | "script_executed"
  | "agent_checkpoint"
  | "authority_attested"
  | "authority_revoked";

export interface KitForkTraceEvent {
  timestamp: string;
  forkId: string;
  kitId: string;
  jobId?: string;
  type: KitForkTraceEventType;
  summary: string;
  /** Free-form structured detail; kept small (<2 KB) per event. */
  detail?: Record<string, unknown>;
}

function resolveTracePath(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "trace.jsonl");
}

export function appendKitForkTraceEvent(
  forkPath: string,
  event: Omit<KitForkTraceEvent, "timestamp"> & { timestamp?: string },
): KitForkTraceEvent {
  const full: KitForkTraceEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  const p = resolveTracePath(forkPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(full) + "\n", "utf8");
  return full;
}

export function readKitForkTrace(forkPath: string): KitForkTraceEvent[] {
  const p = resolveTracePath(forkPath);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return [];
  const events: KitForkTraceEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as KitForkTraceEvent);
    } catch {
      /* tolerate malformed lines — never crash the agent */
    }
  }
  return events;
}

export function tailKitForkTrace(forkPath: string, n: number): KitForkTraceEvent[] {
  const events = readKitForkTrace(forkPath);
  return events.slice(Math.max(0, events.length - n));
}
