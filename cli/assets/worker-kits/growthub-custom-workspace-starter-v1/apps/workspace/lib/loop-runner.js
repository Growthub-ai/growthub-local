/**
 * Loop runner — self-paced recurring swarm runs ("Using ScheduleWakeup ›").
 *
 * A loop re-proposes the same saved workflow on a dynamic cadence: the next
 * delay is the last run's wall-clock duration × 4, clamped to [60s, 3600s] —
 * fast runs poll faster, slow runs back off. Loops live in process memory
 * (one per server) and are surfaced as pills in the cockpit status line.
 *
 * Every iteration goes through the SAME governed propose → approve → launch
 * path as a manual run; the loop only automates the cadence, never the
 * authority. Loops require an existing remembered approval for the workflow.
 */

const MIN_DELAY_MS = 60_000;
const MAX_DELAY_MS = 3_600_000;
const DEFAULT_DELAY_MS = 300_000;
const MAX_LOOPS = 8;

/** loopId → loop record */
const loops = new Map();
let loopCounter = 0;

function clampDelay(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DELAY_MS;
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, Math.floor(n)));
}

function nextDynamicDelay(lastDurationMs) {
  if (!Number.isFinite(lastDurationMs) || lastDurationMs <= 0) return DEFAULT_DELAY_MS;
  return clampDelay(lastDurationMs * 4);
}

/**
 * Start a loop. `iterate` is an async callback owned by the route — it runs
 * one governed propose/launch cycle and resolves with
 * `{ ok, durationMs, runId }`. The runner never dispatches agents itself.
 */
function startLoop({ workflowName, intervalMs, iterate }) {
  if (loops.size >= MAX_LOOPS) {
    return { ok: false, error: `loop cap reached (${MAX_LOOPS})` };
  }
  if (typeof iterate !== "function") {
    return { ok: false, error: "iterate callback required" };
  }
  loopCounter += 1;
  const loopId = `loop_${Date.now().toString(36)}_${loopCounter.toString(36)}`;
  const loop = {
    loopId,
    workflowName: String(workflowName || "").trim(),
    mode: intervalMs ? "fixed" : "dynamic",
    intervalMs: intervalMs ? clampDelay(intervalMs) : null,
    status: "active",
    iterations: 0,
    lastRunId: null,
    lastOk: null,
    lastDurationMs: null,
    nextAt: null,
    startedAt: new Date().toISOString(),
    timer: null
  };
  loops.set(loopId, loop);

  const schedule = (delayMs) => {
    if (loop.status !== "active") return;
    loop.nextAt = new Date(Date.now() + delayMs).toISOString();
    loop.timer = setTimeout(tick, delayMs);
    if (typeof loop.timer.unref === "function") loop.timer.unref();
  };

  const tick = async () => {
    if (loop.status !== "active") return;
    loop.iterations += 1;
    try {
      const result = await iterate({ loopId, iteration: loop.iterations });
      loop.lastOk = result?.ok === true;
      loop.lastRunId = result?.runId || null;
      loop.lastDurationMs = Number(result?.durationMs) || null;
    } catch (error) {
      loop.lastOk = false;
      loop.lastError = error?.message || "loop iteration failed";
    }
    schedule(loop.mode === "fixed" ? loop.intervalMs : nextDynamicDelay(loop.lastDurationMs));
  };

  // First iteration fires immediately; pacing applies from the second on.
  loop.timer = setTimeout(tick, 0);
  if (typeof loop.timer.unref === "function") loop.timer.unref();
  return { ok: true, loopId };
}

function stopLoop(loopId) {
  const loop = loops.get(String(loopId || "").trim());
  if (!loop) return { ok: false, error: "loop not found" };
  loop.status = "stopped";
  if (loop.timer) clearTimeout(loop.timer);
  loop.timer = null;
  loop.nextAt = null;
  return { ok: true };
}

function listLoops() {
  return Array.from(loops.values()).map((loop) => ({
    loopId: loop.loopId,
    workflowName: loop.workflowName,
    mode: loop.mode,
    intervalMs: loop.intervalMs,
    status: loop.status,
    iterations: loop.iterations,
    lastRunId: loop.lastRunId,
    lastOk: loop.lastOk,
    lastDurationMs: loop.lastDurationMs,
    nextAt: loop.nextAt,
    startedAt: loop.startedAt
  }));
}

export { startLoop, stopLoop, listLoops, nextDynamicDelay, MIN_DELAY_MS, MAX_DELAY_MS, MAX_LOOPS };
