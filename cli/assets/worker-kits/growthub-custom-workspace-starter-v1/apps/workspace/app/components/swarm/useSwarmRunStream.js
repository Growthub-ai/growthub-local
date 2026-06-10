"use client";

/**
 * useSwarmRuns / useSwarmRunStream — cockpit data layer.
 *
 *   useSwarmRuns()        — polls the run-list projection (Running/Finished)
 *   useSwarmRunStream(id) — NDJSON reader with reconnect; reduces events
 *                           into live run detail so dots advance on
 *                           agent.start / agent.end without waiting for the
 *                           next list poll
 */

import { useCallback, useEffect, useRef, useState } from "react";

const LIST_POLL_MS = 2000;

function useSwarmRuns(enabled) {
  const [data, setData] = useState({ running: [], finished: [] });
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/swarm-runs", { cache: "no-store" });
      const payload = await response.json();
      if (payload?.ok) {
        setData({ running: payload.running || [], finished: payload.finished || [] });
        setError("");
      }
    } catch (err) {
      setError(err?.message || "failed to load swarm runs");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  return { ...data, error, refresh };
}

/** Reduce one NDJSON event into the detail-shaped run object. */
function reduceEvent(run, event) {
  if (!run) return run;
  switch (event.type) {
    case "run.start":
      return { ...run, status: "running", startedAt: event.at };
    case "phase.start":
      return {
        ...run,
        phases: [...(run.phases || []), { id: event.phaseId, label: event.label, status: "running", agents: [] }]
      };
    case "phase.end":
      return {
        ...run,
        phases: (run.phases || []).map((phase) =>
          phase.id === event.phaseId ? { ...phase, status: event.status } : phase
        )
      };
    case "agent.start":
      return {
        ...run,
        phases: (run.phases || []).map((phase) =>
          phase.id === event.phaseId
            ? {
                ...phase,
                agents: [...(phase.agents || []), {
                  id: event.agentId,
                  label: event.label,
                  status: "running",
                  tokens: null,
                  toolUses: null,
                  durationMs: null
                }]
              }
            : phase
        )
      };
    case "agent.end":
      return {
        ...run,
        phases: (run.phases || []).map((phase) =>
          phase.id === event.phaseId
            ? {
                ...phase,
                agents: (phase.agents || []).map((agent) =>
                  agent.id === event.agentId
                    ? { ...agent, status: event.status, tokens: event.tokens, toolUses: event.toolUses, durationMs: event.durationMs }
                    : agent
                )
              }
            : phase
        )
      };
    case "run.end":
      return { ...run, status: event.status, durationMs: event.durationMs, totals: event.totals || run.totals };
    case "goal.evaluation.end":
      return { ...run, goal: { ...(run.goal || {}), status: event.status, lastScore: event.score, lastReason: event.reason } };
    default:
      return run;
  }
}

function useSwarmRunStream(runId) {
  const [run, setRun] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      return undefined;
    }
    let cancelled = false;

    async function loadDetail() {
      try {
        const response = await fetch(`/api/workspace/swarm-runs/${runId}`, { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && payload?.ok) setRun(payload.run);
        return payload?.run;
      } catch {
        return null;
      }
    }

    async function streamEvents(retries) {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(`/api/workspace/swarm-runs/${runId}/events`, {
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const text = line.trim();
            if (!text) continue;
            try {
              const event = JSON.parse(text);
              if (event.type && event.type !== "heartbeat") {
                setRun((current) => reduceEvent(current, event));
              }
            } catch {
              // Ignore unparseable lines — forward-compatible stream rule.
            }
          }
        }
      } catch {
        if (!cancelled && retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const detail = await loadDetail();
          const terminal = detail && ["done", "error", "stopped"].includes(detail.status);
          if (!terminal) await streamEvents(retries - 1);
        }
      }
    }

    loadDetail().then((detail) => {
      if (cancelled) return;
      const terminal = detail && ["done", "error", "stopped"].includes(detail.status);
      if (!terminal) streamEvents(5);
    });

    return () => {
      cancelled = true;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [runId]);

  return run;
}

export { useSwarmRuns, useSwarmRunStream };
