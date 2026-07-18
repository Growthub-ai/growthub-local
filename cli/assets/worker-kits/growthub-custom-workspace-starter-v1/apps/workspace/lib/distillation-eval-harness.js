/**
 * Distillation eval harness — Sprint 1's "only promote wins" layer. Pure: no
 * React, no fetch, no fs. Normalizes private-cluster benchmark results
 * (student vs current baseline vs teacher), derives the win record that gets
 * stamped into the `model-training-run` receipt
 * (`distillation.benchmarkWins`), and gates PROMOTION — only a promoted
 * student is eligible to take routing priority in the mothership proxy.
 *
 * Honesty contract: a result row counts only when BOTH student and baseline
 * were actually measured on the same task; missing candidates drop the row
 * rather than defaulting to a win. `promoted` is a derived verdict, never an
 * input flag.
 */

export const DISTILLATION_EVAL_SCHEMA = "growthub-distillation-eval-v1";

/** Floors a student must clear to be promoted. */
export const DEFAULT_PROMOTION_FLOOR = { minTasks: 5, minWinRatePct: 50 };

/** Normalize one measured candidate ({ quality 0-1, latencyMs, costUsd }). */
function normalizeCandidate(c) {
  if (!c || typeof c !== "object") return null;
  const quality = Number(c.quality);
  if (!Number.isFinite(quality)) return null;
  return {
    quality: Math.max(0, Math.min(1, quality)),
    latencyMs: Math.max(0, Number(c.latencyMs) || 0),
    costUsd: Math.max(0, Number(c.costUsd) || 0),
  };
}

/**
 * Normalize one eval result row. Returns null when the row cannot be scored
 * (no task identity, or student/baseline unmeasured) — dropped, not defaulted.
 */
export function normalizeEvalResult(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const taskId = String(r.taskId || "").trim();
  const student = normalizeCandidate(r.student);
  const baseline = normalizeCandidate(r.baseline);
  if (!taskId || !student || !baseline) return null;
  return {
    schema: DISTILLATION_EVAL_SCHEMA,
    taskId,
    clusterId: String(r.clusterId || "").trim(),
    student,
    baseline,
    teacher: normalizeCandidate(r.teacher), // optional reference point
  };
}

/**
 * Derive the benchmark win record from a result set. A task is a WIN when
 * the student's quality is at least the baseline's. Latency/cost deltas are
 * reported vs baseline as percentages (negative = student is cheaper/faster).
 * `promoted` requires the floor: enough tasks AND a majority win rate.
 * Pure, never throws.
 */
export function deriveBenchmarkWins({ results = [], floor = DEFAULT_PROMOTION_FLOOR } = {}) {
  const rows = (Array.isArray(results) ? results : []).map(normalizeEvalResult).filter(Boolean);
  const minTasks = Math.max(1, Math.floor(Number(floor?.minTasks) || DEFAULT_PROMOTION_FLOOR.minTasks));
  const minWinRatePct = Math.max(0, Math.min(100, Number(floor?.minWinRatePct) || DEFAULT_PROMOTION_FLOOR.minWinRatePct));

  let wins = 0;
  let latencySum = 0;
  let costSum = 0;
  let latencyCounted = 0;
  let costCounted = 0;
  const byCluster = {};
  for (const row of rows) {
    const win = row.student.quality >= row.baseline.quality;
    if (win) wins += 1;
    if (row.baseline.latencyMs > 0) {
      latencySum += (row.student.latencyMs - row.baseline.latencyMs) / row.baseline.latencyMs;
      latencyCounted += 1;
    }
    if (row.baseline.costUsd > 0) {
      costSum += (row.student.costUsd - row.baseline.costUsd) / row.baseline.costUsd;
      costCounted += 1;
    }
    const cluster = row.clusterId || "uncategorized";
    byCluster[cluster] = byCluster[cluster] || { total: 0, wins: 0 };
    byCluster[cluster].total += 1;
    if (win) byCluster[cluster].wins += 1;
  }

  const total = rows.length;
  const winRatePct = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
  const promoted = total >= minTasks && winRatePct >= minWinRatePct;
  return {
    total,
    wins,
    winRatePct,
    latencyDeltaPct: latencyCounted > 0 ? Math.round((latencySum / latencyCounted) * 1000) / 10 : 0,
    costDeltaPct: costCounted > 0 ? Math.round((costSum / costCounted) * 1000) / 10 : 0,
    promoted,
    floor: { minTasks, minWinRatePct },
    byCluster,
    reason: promoted
      ? `won ${wins}/${total} tasks (${winRatePct}%)`
      : total < minTasks
        ? `only ${total} of ${minTasks} required tasks measured — not promotable yet`
        : `won ${wins}/${total} tasks (${winRatePct}%) — below the ${minWinRatePct}% promotion floor`,
  };
}

/** Receipt fields for the win record (`distillation.benchmarkWins` shape). */
export function buildBenchmarkReceiptFields(winRecord) {
  const w = winRecord && typeof winRecord === "object" ? winRecord : {};
  return {
    total: Math.max(0, Math.floor(Number(w.total) || 0)),
    wins: Math.max(0, Math.floor(Number(w.wins) || 0)),
    winRatePct: Math.max(0, Math.min(100, Number(w.winRatePct) || 0)),
    latencyDeltaPct: Number(w.latencyDeltaPct) || 0,
    costDeltaPct: Number(w.costDeltaPct) || 0,
    promoted: w.promoted === true,
  };
}

/**
 * Delta-artifact state — Sprint 1's "store only the nudges" proof. A delta
 * is identified only with a path + sha256 + measured bytes; and it is only
 * PROVEN a delta when it is meaningfully smaller than the full fine-tune it
 * summarizes (a "delta" at ≥ full size demotes honestly). Pure.
 */
export function deriveDeltaState({ path = "", sha256 = "", deltaBytes = 0, fullFineTuneBytes = 0 } = {}) {
  const p = String(path || "").trim();
  const h = String(sha256 || "").trim();
  const delta = Math.max(0, Math.floor(Number(deltaBytes) || 0));
  const full = Math.max(0, Math.floor(Number(fullFineTuneBytes) || 0));
  if (!p || !h || delta <= 0) {
    return { identified: false, provenDelta: false, reductionPct: 0, reason: "delta artifact not identifiable (needs path + sha256 + measured bytes)" };
  }
  if (full > 0 && delta >= full) {
    return { identified: true, provenDelta: false, reductionPct: 0, reason: `delta (${delta} bytes) is not smaller than the full fine-tune (${full} bytes) — demoted to full-artifact evidence` };
  }
  return {
    identified: true,
    provenDelta: full > 0,
    reductionPct: full > 0 ? Math.round((1 - delta / full) * 1000) / 10 : 0,
    reason: full > 0 ? `delta is ${Math.round((1 - delta / full) * 100)}% smaller than the full fine-tune` : "delta identified — full fine-tune size not measured, reduction unproven",
  };
}
