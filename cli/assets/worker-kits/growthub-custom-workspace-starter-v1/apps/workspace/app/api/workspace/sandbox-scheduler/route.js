/**
 * POST /api/workspace/sandbox-scheduler
 *
 * Roadmap Phase 3.1. Inbound receiver for the `growthub-sandbox-run-v1`
 * envelope that sandbox-run POSTs outbound when `runLocality === "serverless"`.
 * This is the in-repo default scheduler endpoint: point a serverless API
 * Registry row's `schedulerRegistryId` at the deployed workspace's own
 * `/api/workspace/sandbox-scheduler` and the serverless loop closes without a
 * new route per workflow.
 *
 * Auth: if `GROWTHUB_SCHEDULER_SECRET` is set, the request must present it as
 * `x-growthub-scheduler-secret` (or `authorization: Bearer <secret>`).
 *
 * Response: { ok, stdout, stderr, exitCode, durationMs, adapterMeta } — the
 * uniform shape sandbox-run already normalizes, so local and serverless runs
 * write identical `lastResponse` / sidecar traces.
 *
 * GET returns a small contract descriptor for probes / discovery.
 */

import { NextResponse } from "next/server";
import { ENVELOPE_KIND, validateSandboxRunEnvelope, buildSchedulerReceipt } from "@/lib/sandbox-scheduler";
import { resolveEnvRefs } from "@/lib/workspace-env-resolver";

function authorized(request) {
  const expected = String(process.env.GROWTHUB_SCHEDULER_SECRET || "").trim();
  if (!expected) return true;
  const header = String(request.headers.get("x-growthub-scheduler-secret") || "").trim();
  if (header && header === expected) return true;
  const auth = String(request.headers.get("authorization") || "").trim();
  return auth === `Bearer ${expected}`;
}

async function GET() {
  return NextResponse.json({
    kind: "growthub-sandbox-scheduler-v1",
    accepts: ENVELOPE_KIND,
    method: "POST",
    authRequired: Boolean(String(process.env.GROWTHUB_SCHEDULER_SECRET || "").trim()),
    response: { ok: "boolean", stdout: "string", stderr: "string", exitCode: "number" },
  });
}

async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { ok, errors, envelope } = validateSandboxRunEnvelope(body);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "invalid envelope", details: errors }, { status: 400 });
  }

  // Re-resolve env refs against THIS runtime's process.env — never trust the
  // sender's resolved/missing lists, since the scheduler runs in its own env.
  const { missing } = resolveEnvRefs(envelope.sandbox.envRefSlugs);
  envelope.sandbox.envRefsMissing = missing;

  const receipt = buildSchedulerReceipt(envelope, { now: Date.now() });
  return NextResponse.json(receipt, { status: receipt.ok ? 200 : 502 });
}

export { GET, POST };
