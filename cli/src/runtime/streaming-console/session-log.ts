/**
 * Streaming Console — Session Transcript Log
 *
 * Append-only JSONL log of every event flowing through a StreamingConsole.
 * Mirrors the fork-trace pattern — structured, recoverable, and cheap.
 *
 * Layout:
 *   <forkPath>/.growthub-fork/sessions/<sessionId>.jsonl
 *
 * When the working tree is not a fork, the log falls back to the paperclip
 * home dir (`~/.paperclip/sessions/`) so ad-hoc operators still get a
 * replayable history.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveInForkStateDir } from "../../config/kit-forks-home.js";
import { resolveGrowthubProfileSessionsDir } from "../../config/growthub-profile-home.js";
import type { StreamingConsoleRecord } from "./types.js";

export const SESSIONS_DIRNAME = "sessions";

export function resolveSessionsDir(forkPath?: string): string {
  if (forkPath) {
    const stateDir = resolveInForkStateDir(forkPath);
    if (fs.existsSync(stateDir)) {
      return path.resolve(stateDir, SESSIONS_DIRNAME);
    }
  }
  // Fallback — operator-wide growthub profile sessions dir.
  return resolveGrowthubProfileSessionsDir();
}

export function resolveSessionTranscriptPath(sessionId: string, forkPath?: string): string {
  return path.resolve(resolveSessionsDir(forkPath), `${sessionId}.jsonl`);
}

export function appendSessionRecord(transcriptPath: string, record: StreamingConsoleRecord): void {
  fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
  fs.appendFileSync(transcriptPath, JSON.stringify(record) + "\n", "utf8");
}

export function readSessionTranscript(transcriptPath: string): StreamingConsoleRecord[] {
  if (!fs.existsSync(transcriptPath)) return [];
  const raw = fs.readFileSync(transcriptPath, "utf8").trim();
  if (!raw) return [];
  const out: StreamingConsoleRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as StreamingConsoleRecord);
    } catch {
      // Never crash on a malformed line.
    }
  }
  return out;
}
