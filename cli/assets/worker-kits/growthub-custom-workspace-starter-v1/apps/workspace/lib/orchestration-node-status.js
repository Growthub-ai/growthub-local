/**
 * Orchestration per-node run status — GENERAL (not swarm).
 *
 * Maps the real per-node execution signal of a sandbox/orchestration run onto
 * a plain { nodeId: status } map the Workflow Canvas pills consume:
 *
 *   - live:    growthub-sandbox-run-delta-v1 events of type
 *              `orchestration.node.{started|completed|failed|skipped}` streamed
 *              from POST /api/workspace/sandbox-run while the run is in flight.
 *   - settled: the persisted run record's `nodeTrace` (written by the
 *              orchestration runner) once the run completes.
 *
 * This is the general orchestration pipeline signal (input → api-registry-call
 * → transform → tool-result, human-input, etc.) — distinct from the swarm
 * cockpit projection. Each entry corresponds to a real pipeline stage that
 * executed; nothing is fabricated. Pure, never throws.
 *
 * Status vocabulary returned: "running" | "completed" | "failed" | "skipped".
 */

const NODE_EVENT_PREFIX = "orchestration.node.";

function deriveOrchestrationNodeStatuses({ events, record } = {}) {
  const out = {};
  try {
    // Live events win while a run streams — later events overwrite earlier.
    const list = Array.isArray(events) ? events : [];
    for (const event of list) {
      if (!event || typeof event !== "object") continue;
      if (event.kind && event.kind !== "growthub-sandbox-run-delta-v1") continue;
      const type = String(event.type || "");
      if (!type.startsWith(NODE_EVENT_PREFIX)) continue;
      const id = String(event.nodeId || "").trim();
      if (!id) continue;
      const phase = type.slice(NODE_EVENT_PREFIX.length);
      out[id] = phase === "started" ? "running" : phase;
    }
    if (Object.keys(out).length) return out;

    // Settled from the persisted per-node trace.
    const trace = record && Array.isArray(record.nodeTrace) ? record.nodeTrace : [];
    for (const entry of trace) {
      if (!entry || typeof entry !== "object") continue;
      const id = String(entry.id || "").trim();
      if (!id) continue;
      const status = String(entry.status || "").trim();
      if (status) out[id] = status;
    }
    return out;
  } catch {
    return {};
  }
}

export { deriveOrchestrationNodeStatuses };
