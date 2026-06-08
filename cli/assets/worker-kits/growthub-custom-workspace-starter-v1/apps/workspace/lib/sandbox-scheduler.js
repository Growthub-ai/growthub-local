/**
 * Sandbox Scheduler Receiver V1 — roadmap Phase 3.1.
 *
 * The inbound counterpart to the `growthub-sandbox-run-v1` envelope that
 * sandbox-run POSTs outbound when `runLocality === "serverless"`. A deployed
 * workspace (or any external scheduler — cron, QStash, Edge) can target this
 * receiver; it validates the envelope and returns the uniform
 * `{ ok, stdout, stderr, exitCode }` shape so `lastResponse` and
 * `growthub.source-records.json` stay identical between local and serverless.
 *
 * This module is pure (no fetch / fs / spawn). The route layers on the optional
 * shared-secret check and the actual response. By default the receiver
 * acknowledges the run deterministically — it does not spawn processes in the
 * serverless tier; a real executor is wired behind a host adapter, keeping the
 * core kit contract-stable and safe to deploy read-only.
 */

const ENVELOPE_KIND = "growthub-sandbox-run-v1";

function clean(value) {
  return String(value ?? "").trim();
}

/**
 * Validate an inbound run envelope. Returns { ok, errors[], envelope } where
 * envelope is the normalized, safe subset (never echoes unknown fields).
 */
function validateSandboxRunEnvelope(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body must be a JSON object"], envelope: null };
  }
  if (clean(body.kind) !== ENVELOPE_KIND) {
    errors.push(`kind must be "${ENVELOPE_KIND}"`);
  }
  const runId = clean(body.runId);
  if (!runId) errors.push("runId is required");
  const objectId = clean(body.objectId);
  if (!objectId) errors.push("objectId is required");

  const sandbox = body.sandbox && typeof body.sandbox === "object" ? body.sandbox : {};
  const envelope = {
    kind: ENVELOPE_KIND,
    runId,
    ranAt: clean(body.ranAt) || new Date(0).toISOString(),
    workspaceId: clean(body.workspaceId) || null,
    runLocality: "serverless",
    objectId,
    name: clean(body.name),
    sandbox: {
      runtime: clean(sandbox.runtime),
      adapter: clean(sandbox.adapter),
      lifecycleStatus: clean(sandbox.lifecycleStatus) === "live" ? "live" : "draft",
      version: clean(sandbox.version),
      command: clean(sandbox.command),
      instructions: clean(sandbox.instructions),
      timeoutMs: Number.isFinite(sandbox.timeoutMs) ? sandbox.timeoutMs : null,
      envRefSlugs: Array.isArray(sandbox.envRefSlugs) ? sandbox.envRefSlugs.map(clean).filter(Boolean) : [],
      envRefsMissing: Array.isArray(sandbox.envRefsMissing) ? sandbox.envRefsMissing.map(clean).filter(Boolean) : [],
    },
  };

  return { ok: errors.length === 0, errors, envelope };
}

/**
 * Build the uniform run receipt for a validated envelope. Deterministic given
 * `now`. Mirrors the local adapter response shape consumed by sandbox-run.
 *
 * If the envelope reports missing env refs, the receipt is a non-zero exit with
 * the missing slugs on stderr — same pre-flight honesty the local path gives.
 */
function buildSchedulerReceipt(envelope, { now = Date.now() } = {}) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, exitCode: 1, stdout: "", stderr: "invalid envelope", durationMs: 0, adapterMeta: { locality: "serverless" } };
  }
  const missing = Array.isArray(envelope.sandbox?.envRefsMissing) ? envelope.sandbox.envRefsMissing : [];
  const adapterMeta = {
    locality: "serverless",
    receiver: "sandbox-scheduler",
    objectId: envelope.objectId,
    name: envelope.name || null,
    lifecycleStatus: envelope.sandbox?.lifecycleStatus || "draft",
    acceptedAt: new Date(now).toISOString(),
  };

  if (missing.length) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: `missing env refs: ${missing.join(", ")}`,
      durationMs: 0,
      adapterMeta,
    };
  }

  const lines = [
    `[sandbox-scheduler] accepted run ${envelope.runId}`,
    `object=${envelope.objectId} name=${envelope.name || "(unnamed)"}`,
    `lifecycle=${adapterMeta.lifecycleStatus} runtime=${envelope.sandbox?.runtime || "(default)"}`,
  ];
  if (envelope.sandbox?.command) lines.push(`command=${envelope.sandbox.command}`);

  return {
    ok: true,
    exitCode: 0,
    stdout: lines.join("\n"),
    stderr: "",
    durationMs: 0,
    adapterMeta,
  };
}

export { ENVELOPE_KIND, validateSandboxRunEnvelope, buildSchedulerReceipt };
