import { randomUUID } from "node:crypto";

export type GrowthubConnectionSession = {
  state: string;
  userId: string;
  createdAtMs: number;
  expiresAtMs: number;
};

const STATE_TTL_MS = 10 * 60 * 1000;
const sessions = new Map<string, GrowthubConnectionSession>();

function nowMs(): number {
  return Date.now();
}

function cleanupExpiredSessions(now = nowMs()): void {
  for (const [state, session] of sessions.entries()) {
    if (session.expiresAtMs <= now) {
      sessions.delete(state);
    }
  }
}

export function issueGrowthubConnectionSession(userId: string): GrowthubConnectionSession {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    throw new Error("userId is required");
  }

  const now = nowMs();
  cleanupExpiredSessions(now);

  const state = randomUUID();
  const session: GrowthubConnectionSession = {
    state,
    userId: trimmedUserId,
    createdAtMs: now,
    expiresAtMs: now + STATE_TTL_MS,
  };
  sessions.set(state, session);
  return session;
}

export function consumeGrowthubConnectionSession(state: string): GrowthubConnectionSession | null {
  const trimmedState = state.trim();
  if (!trimmedState) return null;

  const now = nowMs();
  cleanupExpiredSessions(now);
  const session = sessions.get(trimmedState) ?? null;
  if (!session) return null;

  sessions.delete(trimmedState);
  if (session.expiresAtMs <= now) return null;
  return session;
}

export function __resetGrowthubConnectionSessionsForTests(): void {
  sessions.clear();
}
