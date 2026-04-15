/**
 * Open Agents — Provider / Backend Adapter
 *
 * Thin fetch-based adapter to an Open Agents backend instance.
 * Supports:
 *   - Health check (is the backend reachable?)
 *   - Session list (enumerate existing agent sessions)
 *   - Session create (start a new agent session with prompt + repo)
 *   - Session resume (reconnect to an existing session)
 *   - Event polling (fetch run events for a session)
 *
 * The rest of the system does not care whether the backend is:
 *   - A local dev instance (bun run web)
 *   - A hosted Vercel deployment
 *   - A custom fork of open-agents
 */

import type {
  OpenAgentsConfig,
  OpenAgentsHealthResult,
  OpenAgentsSessionSummary,
  AgentRunEvent,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkOpenAgentsHealth(
  config: OpenAgentsConfig,
): Promise<OpenAgentsHealthResult> {
  const startMs = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    try {
      const url = `${config.endpoint.replace(/\/$/, "")}/api/health`;
      const headers: Record<string, string> = {
        accept: "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      };

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startMs;

      if (!response.ok) {
        return {
          available: false,
          latencyMs,
          error: `Backend responded with ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        available: true,
        latencyMs,
        version: typeof data.version === "string" ? data.version : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      available: false,
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Session list
// ---------------------------------------------------------------------------

export async function listOpenAgentsSessions(
  config: OpenAgentsConfig,
): Promise<OpenAgentsSessionSummary[]> {
  const url = `${config.endpoint.replace(/\/$/, "")}/api/sessions`;
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 30_000,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to list sessions: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { sessions?: OpenAgentsSessionSummary[] };
    return data.sessions ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Session create
// ---------------------------------------------------------------------------

export interface CreateSessionInput {
  prompt: string;
  repoUrl?: string;
  branch?: string;
}

export async function createOpenAgentsSession(
  config: OpenAgentsConfig,
  input: CreateSessionInput,
): Promise<OpenAgentsSessionSummary> {
  const url = `${config.endpoint.replace(/\/$/, "")}/api/sessions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
  };

  const body: Record<string, unknown> = {
    prompt: input.prompt,
  };
  if (input.repoUrl) body.repoUrl = input.repoUrl;
  if (input.branch) body.branch = input.branch;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 30_000,
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to create session: ${response.status} ${errorText || response.statusText}`,
      );
    }

    return (await response.json()) as OpenAgentsSessionSummary;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Session resume (get details)
// ---------------------------------------------------------------------------

export async function resumeOpenAgentsSession(
  config: OpenAgentsConfig,
  sessionId: string,
): Promise<OpenAgentsSessionSummary> {
  const url = `${config.endpoint.replace(/\/$/, "")}/api/sessions/${encodeURIComponent(sessionId)}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 30_000,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to resume session: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as OpenAgentsSessionSummary;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Event polling
// ---------------------------------------------------------------------------

export async function pollSessionEvents(
  config: OpenAgentsConfig,
  sessionId: string,
  afterTimestamp?: string,
): Promise<AgentRunEvent[]> {
  const base = `${config.endpoint.replace(/\/$/, "")}/api/sessions/${encodeURIComponent(sessionId)}/events`;
  const url = afterTimestamp
    ? `${base}?after=${encodeURIComponent(afterTimestamp)}`
    : base;

  const headers: Record<string, string> = {
    accept: "application/json",
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 30_000,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OpenAgentsBackendError(
        response.status,
        `Failed to poll events: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { events?: AgentRunEvent[] };
    return data.events ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class OpenAgentsBackendError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
