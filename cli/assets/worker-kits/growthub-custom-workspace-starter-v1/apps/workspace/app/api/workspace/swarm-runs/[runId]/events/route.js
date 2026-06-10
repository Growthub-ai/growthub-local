/**
 * GET /api/workspace/swarm-runs/[runId]/events — NDJSON event stream.
 *
 * Replay-then-live: the run's journaled events are flushed first, then live
 * events stream until the run reaches a terminal status (run.end is always
 * the last line). One JSON event per line — the CMS SDK v1 stream rule:
 * consumers MUST ignore unknown event types.
 */

import { getRun, subscribeRunEvents } from "@/lib/swarm-run-events.js";

const HEARTBEAT_MS = 15_000;
const TERMINAL = new Set(["done", "error", "stopped"]);

async function GET(_request, context) {
  const params = await context.params;
  const run = getRun(params?.runId);
  if (!run) {
    return new Response(JSON.stringify({ ok: false, error: "run not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat = null;

      const write = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the consumer
        }
      };

      for (const event of run.events) write(event);
      if (TERMINAL.has(run.status)) {
        close();
        return;
      }

      unsubscribe = subscribeRunEvents(run.runId, (event) => {
        write(event);
        if (event.type === "run.end") close();
      });
      heartbeat = setInterval(() => {
        write({ type: "heartbeat", runId: run.runId, at: new Date().toISOString() });
      }, HEARTBEAT_MS);
      if (typeof heartbeat.unref === "function") heartbeat.unref();
    },
    cancel() {
      // Consumer disconnected; subscription cleanup happens via close() on
      // the next write attempt.
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}

export { GET };
