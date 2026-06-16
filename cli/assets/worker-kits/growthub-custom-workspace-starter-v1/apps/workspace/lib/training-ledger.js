/**
 * Training ledger — pure eligibility driver (CAUSATION_ITT_ELIGIBILITY_DRIVERS).
 *
 * Deterministic functions over workspace evidence only: the `model-training`
 * custom object rows stamped by `growthub intelligence export` (the same
 * lastRunId/lastSourceId/lastResponse stamping pattern sandbox-run uses) and
 * the `training:` source-record keys in the workspace sidecar. No fetch, no
 * React, no config writes — the HelperSidecar training view and the
 * /training page both render from this one derivation so the sidecar and
 * the page can never disagree.
 *
 * Evidence cross-check: a row's export claim (`lastExportId`) is only
 * trusted when the sidecar record at `lastSourceId` exists and carries the
 * same exportId. A claim without matching sidecar evidence never reads as
 * complete — it surfaces as missing evidence with a rerun instruction.
 * Callers that pass only `workspaceConfig` (no source records) keep the
 * pre-evidence behavior: claims render unverified rather than failing.
 *
 * Low-entropy guidance contract (the causation-driver rule — state becomes
 * eligibility, eligibility becomes the next action):
 *   - "blocked"   → no trace evidence yet; next = do real governed work
 *   - "eligible"  → rows exist without a verified export; next = export
 *                   (covers both "never exported" and "claim without
 *                   sidecar evidence — rerun export")
 *   - "complete"  → latest export claim matches its training:* record;
 *                   next = fine-tune handoff
 */

export const TRAINING_OBJECT_ID = "model-training";
export const TRAINING_OBJECT_TYPE = "model-training";
export const TRAINING_SOURCE_PREFIX = "training:";

/**
 * Distillation Pipeline V1 anchors (helpers/{harvest-cursor-traces,
 * grade-raw-pairs,upload-graded-traces,export-training-traces}.mjs).
 * `training-traces` rows are written by Phase 2.5 with
 * {sessionDate, inputPrompt, agentOutput, qualityScore, reason, exported}
 * and consumed by Phase 3 (qualityScore >= minScore && exported !== "true").
 */
export const TRACES_OBJECT_ID = "training-traces";
/** Phase-2.5/3 default curation floor (critic-grader 1–5 scale). */
export const DEFAULT_MIN_SCORE = 4;
/**
 * Minimum curated examples before a fine-tune run is worth starting.
 * OpenAI's supervised fine-tuning API enforces 10 examples as the hard
 * floor; local QLoRA practice (Unsloth) treats ~10 as the same minimum.
 */
export const MIN_FINETUNE_TRACES = 10;

/** Safe JSON parse for row-stamped summaries; returns null, never throws. */
export function parseExportSummary(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function trainingObject(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return null;
  return objects.find((o) => o?.objectType === TRAINING_OBJECT_TYPE) || null;
}

function sidecarRecordFor(workspaceSourceRecords, sourceId) {
  if (!sourceId) return null;
  const entry = workspaceSourceRecords?.[sourceId];
  if (!entry || typeof entry !== "object") return null;
  const records = Array.isArray(entry.records) ? entry.records : [];
  return { entry, records };
}

/**
 * Evidence status for a single row's export claim.
 *
 *   - "none"       → row has no export claim
 *   - "unverified" → claim present but caller supplied no source records
 *   - "missing"    → claim present, sidecar record absent or exportId mismatch
 *   - "linked"     → claim present and sidecar record carries the same exportId
 */
function deriveRowEvidence(row, workspaceSourceRecords, verifiable) {
  const lastExportId = String(row?.lastExportId || "").trim();
  if (!lastExportId) return { status: "none", record: null };
  if (!verifiable) return { status: "unverified", record: null };

  const lastSourceId = String(row?.lastSourceId || "").trim();
  const sidecar = sidecarRecordFor(workspaceSourceRecords, lastSourceId);
  if (!sidecar) return { status: "missing", record: null };

  const match = sidecar.records.find((r) => String(r?.exportId || "").trim() === lastExportId) || null;
  if (!match) return { status: "missing", record: null };
  return { status: "linked", record: match };
}

/**
 * Derive the full ledger state from workspace evidence.
 *
 * @param {object} input
 * @param {object} input.workspaceConfig - the governed workspace config
 * @param {object} [input.workspaceSourceRecords] - the sidecar source-record
 *   map from GET /api/workspace (or the seed). Optional for backward
 *   compatibility: when absent, export claims render unverified.
 */
export function deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords } = {}) {
  const object = trainingObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  const verifiable = Boolean(workspaceSourceRecords) && typeof(workspaceSourceRecords) === "object";

  // Registry bonding — a version row whose summary carries registryId is
  // bonded to that api-registry record; when the record's lastResponse
  // names this version's tuned tag, the validated real-world output is
  // surfaced on the version row (invocation success + actual content).
  const registryRows = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((o) => o?.objectType === "api-registry")
    .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []));
  const bondRegistry = (summary, localModel) => {
    const registryId = String(summary?.registryId || "").trim();
    if (!registryId) return null;
    const reg = registryRows.find((r) => String(r?.integrationId || "") === registryId);
    if (!reg) return { registryId, status: "missing", validated: null };
    let validated = null;
    try {
      const resp = JSON.parse(String(reg.lastResponse || "null"));
      const tag = String(resp?.model || "");
      if (localModel && tag === localModel) {
        const content = resp?.choices?.[0]?.message?.content;
        validated = { model: tag, snippet: typeof content === "string" ? content.slice(0, 160) : "", at: String(reg.lastTested || "") };
      }
    } catch { /* unvalidated */ }
    return { registryId, status: String(reg.status || ""), validated };
  };

  const models = rows.map((row) => {
    const evidence = deriveRowEvidence(row, workspaceSourceRecords, verifiable);
    return {
      name: String(row?.Name || "").trim(),
      status: String(row?.status || "").trim(),
      baseModel: String(row?.baseModel || "").trim(),
      localModel: String(row?.localModel || "").trim(),
      lastExportAt: String(row?.lastExportAt || "").trim(),
      lastExportId: String(row?.lastExportId || "").trim(),
      lastSourceId: String(row?.lastSourceId || "").trim(),
      summary: parseExportSummary(row?.lastExportSummary),
      evidence: evidence.status,
      sidecarRecord: evidence.record,
      bondedRegistry: bondRegistry(parseExportSummary(row?.lastExportSummary), String(row?.localModel || "").trim()),
    };
  });

  // Coverage counts only evidence-backed exports when verification is
  // possible; unverified claims count when it is not (legacy callers).
  const countable = models.filter((m) => (verifiable ? m.evidence === "linked" : m.evidence !== "none"));
  const coverage = countable.reduce(
    (acc, m) => {
      const summary = m.sidecarRecord || m.summary;
      acc.exports += 1;
      acc.records += Number(summary?.recordCount) || 0;
      acc.escalations += Number(summary?.escalations) || 0;
      const surfaces = summary?.surfaces;
      if (surfaces && typeof surfaces === "object") {
        for (const [key, value] of Object.entries(surfaces)) {
          acc.surfaces[key] = (acc.surfaces[key] || 0) + (Number(value) || 0);
        }
      }
      return acc;
    },
    { exports: 0, records: 0, escalations: 0, surfaces: {} },
  );

  const claims = models.filter((m) => m.evidence !== "none");
  const missingEvidence = verifiable && claims.some((m) => m.evidence === "missing");

  // Seven-state evidence ladder — every promotion requires NEW evidence;
  // a row stamp alone never advances past "exported". Sandbox linkage is
  // resolved through the same governed objects (schedulerRegistryId /
  // orchestration graphs) and run proof through sandbox-run row stamps.
  const allObjects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const exportedOk = claims.length > 0 && (verifiable ? coverage.exports > 0 : true);
  const deployedModel = models.find((m) => m.bondedRegistry && m.bondedRegistry.status !== "missing") || null;
  const verifiedModel = models.find((m) => m.bondedRegistry?.validated) || null;
  let sandboxLink = null;
  if (verifiedModel) {
    const rid = verifiedModel.bondedRegistry.registryId;
    for (const o of allObjects) {
      if (o?.objectType !== "sandbox-environment") continue;
      for (const r of (Array.isArray(o.rows) ? o.rows : [])) {
        const graph = String(r?.orchestrationConfig || "");
        if (String(r?.schedulerRegistryId || "") === rid || graph.includes(`"registryId": "${rid}"`) || graph.includes(`"registryId":"${rid}"`)) {
          let runOk = false;
          let outputHash = "";
          try {
            const parsed = JSON.parse(String(r?.lastResponse || "null"));
            runOk = parsed?.ok === true || Number(parsed?.exitCode) === 0;
            outputHash = typeof parsed?.outputHash === "string" ? parsed.outputHash : "";
          } catch { runOk = false; }
          sandboxLink = { objectId: String(o.id || ""), rowName: String(r?.Name || ""), runId: String(r?.lastRunId || ""), runOk, outputHash };
        }
      }
    }
  }

  let state = "blocked";
  let next = "Gather governed traces.";
  if (object && models.length > 0) { state = "eligible"; next = "Export corpus."; }
  if (exportedOk) { state = "exported"; next = "Deploy/register model endpoint."; }
  if (missingEvidence && coverage.exports === 0 && !deployedModel) { state = "eligible"; next = "Export row exists but source-record evidence is missing — rerun `growthub intelligence export`."; }
  if (deployedModel) { state = "deployed"; next = "Test model endpoint."; }
  if (verifiedModel) { state = "verified"; next = "Create sandbox workflow."; }
  if (sandboxLink) { state = "sandbox-ready"; next = "Run sandbox smoke."; }
  if (sandboxLink && sandboxLink.runId && sandboxLink.runOk) { state = "complete"; next = "Ready: latest trained model is verified and runnable."; }
  const eligibility = { state, next };

  // Identity chain — the exact proof spine; every link evidence-resolved or "".
  const chainModel = verifiedModel || deployedModel || models[models.length - 1] || null;
  const djb2 = (str) => { let h = 5381; for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(16); };
  const identityChain = chainModel ? {
    modelTrainingRowId: chainModel.name,
    lastExportId: chainModel.lastExportId,
    trainingSourceId: chainModel.lastSourceId,
    modelVersion: chainModel.localModel,
    apiRegistryId: chainModel.bondedRegistry?.registryId || "",
    apiTestProof: Boolean(chainModel.bondedRegistry?.validated),
    sandboxObjectId: sandboxLink?.objectId || "",
    sandboxRunId: sandboxLink?.runId || "",
    // modelOutputHash = REAL output proof only; snippetHash = response digest.
    modelOutputHash: sandboxLink?.outputHash || "",
    snippetHash: chainModel.bondedRegistry?.validated?.snippet ? djb2(chainModel.bondedRegistry.validated.snippet) : "",
  } : null;

  return { present: Boolean(object), models, coverage, eligibility, missingEvidence, identityChain };
}

/**
 * Distillation pipeline state — pure derivation over the `training-traces`
 * object that Pipeline V1 Phases 2.5/3 read and write. No new semantics:
 * "graded" and "unexported" use exactly the Phase-3 eligibility predicate.
 */
export function deriveDistillationPipelineState({ workspaceConfig, minScore = DEFAULT_MIN_SCORE } = {}) {
  const objects = workspaceConfig?.dataModel?.objects;
  const object = Array.isArray(objects) ? objects.find((o) => o?.id === TRACES_OBJECT_ID) : null;
  const rows = Array.isArray(object?.rows) ? object.rows : [];

  let graded = 0;
  let unexported = 0;
  let exportedCount = 0;
  for (const row of rows) {
    const qualifies = Number(row?.qualityScore) >= minScore
      && String(row?.inputPrompt || "").trim()
      && String(row?.agentOutput || "").trim();
    if (!qualifies) continue;
    graded += 1;
    if (String(row?.exported || "false").toLowerCase() === "true") exportedCount += 1;
    else unexported += 1;
  }

  return {
    present: Boolean(object),
    total: rows.length,
    graded,
    unexported,
    exportedCount,
    minScore,
    threshold: MIN_FINETUNE_TRACES,
    ready: graded >= MIN_FINETUNE_TRACES,
    remaining: Math.max(0, MIN_FINETUNE_TRACES - graded),
  };
}

function hasActiveLocalModel(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return { active: false, localModel: "" };
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      if (String(row?.adapter || "") === "local-intelligence" && String(row?.localModel || "").trim()) {
        return { active: true, localModel: String(row.localModel).trim() };
      }
    }
  }
  return { active: false, localModel: "" };
}

function hasRegisteredModelEndpoint(workspaceConfig, slug) {
  const objects = workspaceConfig?.dataModel?.objects;
  if (!Array.isArray(objects)) return false;
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    for (const row of rows) {
      const integrationId = String(row?.integrationId || "");
      const baseUrl = String(row?.baseUrl || "");
      // Convention: register the tuned model as `<ledger-row>-model`, or any
      // row pointing at a local OpenAI-compatible runtime (Ollama :11434).
      if (integrationId === `${slug}-model` || baseUrl.includes(":11434")) return true;
    }
  }
  return false;
}

/**
 * Fine-tune handoff cockpit — the same causation-driver pattern as the API
 * Registry creation spine: workspace evidence in, ordered steps out, each
 * `complete | eligible | pending`, each with the exact shipping command.
 * Every step maps 1:1 to Distillation Pipeline V1 + the documented
 * fine-tune loop (NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE §31.2):
 * collect → curate → gather threshold → export SFT JSONL → QLoRA fine-tune
 * → activate localModel → register the endpoint as an API Registry row.
 */
export function deriveTrainingHandoffState({
  workspaceConfig,
  workspaceSourceRecords,
  minScore = DEFAULT_MIN_SCORE,
  slug = "workspace-local",
} = {}) {
  const pipeline = deriveDistillationPipelineState({ workspaceConfig, minScore });
  const ledger = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords });
  const corpusLinked = ledger.models.some((m) => m.evidence === "linked" || m.evidence === "unverified");
  const model = hasActiveLocalModel(workspaceConfig);
  const registered = hasRegisteredModelEndpoint(workspaceConfig, slug);

  const sftExportCommand = [
    "node helpers/export-training-traces.mjs \\",
    "  --workspace http://localhost:3000 \\",
    `  --traces-object ${TRACES_OBJECT_ID} \\`,
    `  --min-score ${minScore} \\`,
    "  --out ./distillation/unsloth-batch.jsonl",
  ].join("\n");

  const steps = [
    {
      id: "collect",
      label: "Collect traces",
      status: pipeline.present && pipeline.total > 0 ? "complete" : "active",
      description: pipeline.present && pipeline.total > 0
        ? `${pipeline.total} rows in ${TRACES_OBJECT_ID}`
        : "Harvest agent transcripts into governed rows (Pipeline V1 Phases 1–2.5).",
      command: "node helpers/harvest-cursor-traces.mjs --in <transcripts> --out ./distillation/raw-pairs.jsonl",
    },
    {
      id: "curate",
      label: "Curate (critic-graded)",
      status: pipeline.graded > 0 ? "complete" : pipeline.total > 0 ? "active" : "pending",
      description: pipeline.graded > 0
        ? `${pipeline.graded} rows at qualityScore ≥ ${minScore}`
        : `Grade pairs via the critic-grader sandbox row, upload rows ≥ ${minScore}.`,
      command: "node helpers/grade-raw-pairs.mjs --in ./distillation/raw-pairs.jsonl --out ./distillation/graded.jsonl",
    },
    {
      id: "gather",
      label: `Reach ${MIN_FINETUNE_TRACES} curated traces`,
      status: pipeline.ready ? "complete" : pipeline.graded > 0 ? "active" : "pending",
      description: pipeline.ready
        ? `${pipeline.graded} curated — fine-tune floor met`
        : `${pipeline.graded} of ${MIN_FINETUNE_TRACES} — ${pipeline.remaining} more curated traces needed.`,
    },
    {
      id: "export-sft",
      label: "Export SFT JSONL",
      status: pipeline.exportedCount > 0 && pipeline.unexported === 0
        ? "complete"
        : pipeline.unexported > 0 ? "active" : "pending",
      description: pipeline.unexported > 0
        ? `${pipeline.unexported} curated rows awaiting export (Unsloth {instruction,input,output}).`
        : pipeline.exportedCount > 0
          ? `${pipeline.exportedCount} rows exported and deduped`
          : "Runs once curated rows exist.",
      command: sftExportCommand,
    },
    {
      id: "corpus",
      label: "Export governed-evidence corpus",
      status: corpusLinked ? "complete" : "active",
      description: corpusLinked
        ? "Ledger stamp linked to training:* evidence"
        : "Preference-pair corpus (applied/skipped, rewards, self-eval).",
      command: "growthub intelligence export --workspace <apps/workspace>",
    },
    {
      id: "finetune",
      label: "Fine-tune (external QLoRA)",
      status: pipeline.exportedCount > 0 || corpusLinked ? "active" : "pending",
      description: "Unsloth/QLoRA over the exported JSONL; Unsloth emits the Ollama Modelfile for the result. No training runs in this workspace.",
    },
    {
      id: "activate",
      label: "Activate tuned localModel",
      status: model.active ? "complete" : "pending",
      description: model.active
        ? `localModel ${model.localModel}`
        : "Load weights (ollama create from the generated Modelfile), then select the concrete localModel in Local Intelligence.",
      command: "ollama create <slug>-tuned -f ./Modelfile",
    },
    {
      id: "register",
      label: "Register model endpoint",
      status: registered ? "complete" : model.active ? "active" : "pending",
      description: registered
        ? "API Registry row present — the tuned model is invocable as a governed source"
        : `Register the local endpoint (e.g. http://127.0.0.1:11434/v1) as API Registry row \`${slug}-model\` via /register-api.`,
    },
  ];

  // Closure steps — the registry row only closes the loop when it is (a)
  // PICKABLE by the governed relations (sandbox schedulerRegistryId and
  // workflow api-registry-call nodes filter on the relation statusAllowlist:
  // connected/approved/ok/success — a freshly scaffolded "registered" row is
  // not pickable until the cockpit test stamps it), (b) actually REFERENCED
  // by a sandbox row or workflow node, and (c) PROVEN to serve the tuned
  // weights: the OpenAI-compatible response body carries `model`, so the
  // registry row's lastResponse must name the tuned tag — never the base.
  const registryRowFor = (() => {
    const objects = workspaceConfig?.dataModel?.objects;
    if (!Array.isArray(objects)) return null;
    for (const object of objects) {
      if (object?.objectType !== "api-registry") continue;
      const row = (Array.isArray(object.rows) ? object.rows : [])
        .find((r) => String(r?.integrationId || "") === `${slug}-model`);
      if (row) return row;
    }
    return null;
  })();
  const PICKABLE = ["connected", "approved", "ok", "success"];
  const pickable = registryRowFor && PICKABLE.includes(String(registryRowFor.status || "").toLowerCase());
  const referenced = (() => {
    const objects = workspaceConfig?.dataModel?.objects;
    if (!Array.isArray(objects) || !registryRowFor) return false;
    const id = String(registryRowFor.integrationId);
    for (const object of objects) {
      const rows = Array.isArray(object?.rows) ? object.rows : [];
      if (object?.objectType === "sandbox-environment") {
        if (rows.some((r) => String(r?.schedulerRegistryId || "") === id)) return true;
        for (const r of rows) {
          const graph = String(r?.orchestrationConfig || "");
          if (graph.includes(`"registryId": "${id}"`) || graph.includes(`"registryId":"${id}"`)) return true;
        }
      }
    }
    return false;
  })();
  const tunedTag = (() => {
    const versions = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
      .filter((o) => o?.objectType === TRAINING_OBJECT_TYPE)
      .flatMap((o) => (Array.isArray(o.rows) ? o.rows : []))
      .filter((r) => /-v\d+$/.test(String(r?.Name || "")) && String(r?.localModel || "").trim());
    return versions.length ? String(versions[versions.length - 1].localModel).trim() : "";
  })();
  const proven = (() => {
    if (!registryRowFor || !tunedTag) return false;
    const response = String(registryRowFor.lastResponse || "");
    return response.includes(`"model":"${tunedTag}"`) || response.includes(`"model": "${tunedTag}"`);
  })();

  steps.push(
    {
      id: "integrate",
      label: "Integrate into sandbox + workflows",
      status: referenced ? "complete" : pickable ? "active" : registryRowFor ? "pending" : "pending",
      description: referenced
        ? "Registry row referenced by a sandbox/workflow — invocable across governed objects"
        : pickable
          ? `Row is pickable — bind it via schedulerRegistryId or an api-registry-call workflow node.`
          : registryRowFor
            ? `Run the API Registry cockpit test first: pickers allow only ${PICKABLE.join("/")} status.`
            : "Appears once the registry row is scaffolded.",
    },
    {
      id: "prove",
      label: "Prove tuned weights serve responses",
      status: proven ? "complete" : registryRowFor && tunedTag ? "active" : "pending",
      description: proven
        ? `Verified: response model tag matches ${tunedTag} — tuned weights, not the base model`
        : tunedTag
          ? `Invoke via the registry test — the streamed response's \`model\` field must read ${tunedTag}, proving the fine-tuned weights (not the base) served it.`
          : "Appears once a version row records the tuned model tag.",
    },
  );

  const completedCount = steps.filter((s) => s.status === "complete").length;
  // Milestone score — evidence-tied, mirroring the API Registry cockpit's
  // milestone scoring (not a raw step ratio).
  const done = (id) => steps.find((s) => s.id === id)?.status === "complete";
  let score = 0;
  if (done("collect")) score = 15;
  if (done("curate")) score = Math.max(score, 30);
  if (done("gather")) score = Math.max(score, 45);
  if (done("export-sft")) score = Math.max(score, 60);
  if (done("corpus")) score = Math.max(score, 70);
  if (done("activate")) score = Math.max(score, 80);
  if (done("register")) score = Math.max(score, 90);
  const complete = done("integrate") && done("prove");
  if (complete) score = 100;
  return { steps, completedCount, totalCount: steps.length, complete, score, pipeline, slug, minScore };
}

/**
 * Failure-recovery checklist — pure causation derivation for the prepare
 * flow's error states (the API-registry-cockpit pattern applied to
 * troubleshooting). Inputs are the real failure evidence: the stage
 * reached, the thrown message, connectivity, and a fresh readback when one
 * was obtainable. Because the apply is ONE governed PATCH, the three writes
 * (exported stamps, version row, registry row) land atomically — the
 * checklist states this instead of leaving the user guessing about partial
 * writes.
 */
export function deriveHandoffRecovery({ stage, message = "", online = true, readbackOk = null, registryPresent = null, datasetDownloaded = false } = {}) {
  const msg = String(message || "");
  const offline = online === false || /failed to fetch|networkerror|load failed/i.test(msg);
  const quota = /quota|no space|storage/i.test(msg);
  const refused = /patch refused|400|unknown fields|invalid workspace config/i.test(msg);

  const items = [];
  items.push({
    id: "connection",
    label: "Connection",
    status: offline ? "blocked" : "complete",
    description: offline
      ? "Connection to the workspace was lost (e.g. Wi-Fi dropped). The dev server must be reachable — reconnect, confirm the app URL loads, then retry."
      : "Workspace connection healthy at failure time.",
  });
  items.push({
    id: "dataset",
    label: "Dataset",
    status: datasetDownloaded ? "complete" : quota ? "blocked" : stage === "package" ? "blocked" : "active",
    description: datasetDownloaded
      ? "Dataset file already saved — retry resumes without re-downloading."
      : quota
        ? "Device storage rejected the download (quota). Free space, then retry — conversion re-runs from your same curated selection."
        : "Dataset not yet saved; retry re-runs conversion from your curated selection (nothing was lost — traces live in the data model).",
  });
  items.push({
    id: "apply",
    label: "Apply",
    status: registryPresent === true ? "complete" : refused ? "blocked" : "active",
    description: registryPresent === true
      ? "Governed apply already landed (single atomic PATCH) — retry skips straight to verification."
      : refused
        ? `The governed PATCH was refused: ${msg.slice(0, 140)}. Nothing was written (the PATCH is atomic) — review the message, then retry.`
        : "Apply pending — the exported stamps, version row, and registry row land together in one atomic governed PATCH on retry.",
  });
  items.push({
    id: "verify",
    label: "Verify",
    status: readbackOk === true ? "complete" : readbackOk === false ? "blocked" : "active",
    description: readbackOk === true
      ? "Readback verified."
      : readbackOk === false
        ? "Readback could not confirm the rows — open /training after reconnecting; if the registry row is absent, retry the apply."
        : "Runs after apply.",
  });
  return { items, retryable: !quota || datasetDownloaded, stage, offline };
}


/**
 * Atomic progress stages for the prepare operation — the swarm-cockpit
 * phase-row pattern applied to the handoff: one deterministic row per
 * atomic step, each with its own status and causation-derived delta, so
 * the user sees exactly which safeguarded step is executing while the
 * single bar above tracks the whole. Pure function of the live progress
 * state; the same stages the recovery deriver classifies failures by.
 */
export const HANDOFF_STAGES = ["validate", "convert", "package", "apply", "verify"];

export function deriveProgressStages({ stage = "", pct = 0, converted = 0, total = 0 } = {}) {
  const order = HANDOFF_STAGES.indexOf(stage);
  return HANDOFF_STAGES.map((id, i) => {
    const status = pct >= 100 ? "complete" : i < order ? "complete" : i === order ? "active" : "pending";
    let detail = "";
    if (id === "validate") detail = total ? `${total} curated traces` : "";
    if (id === "convert") detail = total ? `${Math.min(converted, total)}/${total} rows → Unsloth JSONL` : "";
    if (id === "package") detail = "dataset saved to device";
    if (id === "apply") detail = "one atomic governed PATCH: exported stamps · version row · registry row";
    if (id === "verify") detail = "readback must show the registry record";
    return { id, status, detail };
  });
}
