/**
 * Workspace PATCH policy — server-authoritative guard for `PATCH /api/workspace`.
 *
 * `validateWorkspaceConfig` (workspace-schema.js) answers "is the merged
 * config shaped correctly?". This module answers a different question:
 * "is this *mutation* allowed to happen through direct PATCH at all?" —
 * independent of whether the resulting config would validate.
 *
 * Enforced here, before `writeWorkspaceConfig`:
 *
 *   1. Allowlist — only `dashboards`, `widgetTypes`, `canvas`, `dataModel`.
 *      Bodies that look like a full workspace config get a dedicated reason.
 *   2. `workspaceSourceRecords` never travels through PATCH (sidecar writes
 *      flow through POST /api/workspace/refresh-sources).
 *   3. Live workflow fields on sandbox-environment rows are publish-owned.
 *      Direct PATCH may save drafts; only POST /api/workspace/workflow/publish
 *      may move a draft to the live fields, bump `version`, stamp
 *      `orchestrationPublishedAt`, append `orchestrationDeltas`, or set
 *      `lifecycleStatus: "live"`.
 *   4. Size ceilings — oversized patches, oversized rows, oversized
 *      orchestration node configs, and history blobs smuggled into rows
 *      are rejected. Run history belongs in `growthub.source-records.json`.
 *   5. Credential-shaped fields on sandbox rows are rejected here too, so
 *      `POST /api/workspace/patch/preflight` reports them without running
 *      full schema validation.
 *   6. Training EVIDENCE on `model-training-run` rows is server-owned.
 *      The `compute` block (sealed authority, decision/quote evidence,
 *      allocation and resource ids, idempotency identities, events,
 *      checkpoints, artifact verification, canonical evaluation) is
 *      journaled only by server routes; direct PATCH may echo it but never
 *      create, alter, or erase it. On a row that carries provider-compute
 *      evidence, execution-derived success claims (status transitions into
 *      completed/imported/verified, artifact identity fields) are also
 *      echo-only. `distillation.benchmarkWins` (the promotion verdict) is
 *      echo-only on every run row. The CUSTOMER compute request snapshot
 *      (`computeRequest`) stays freely PATCHable — it grants nothing.
 *
 * Echo-safety: the Data Model grid and the Builder round-trip whole objects.
 * A field that is byte-identical (stable JSON) to the currently persisted
 * value is never a violation — only *changes* to protected fields are.
 *
 * Dependency-free on purpose: unit tests import this file directly
 * (scripts/unit-workspace-patch-policy.test.mjs in the source repo).
 */

const WORKSPACE_PATCH_ALLOWED_FIELDS = Object.freeze([
  "dashboards",
  "widgetTypes",
  "canvas",
  "dataModel"
]);

/** Live workflow fields — only the publish route may change these. */
const LIVE_WORKFLOW_ROW_FIELDS = Object.freeze([
  "orchestrationGraph",
  "orchestrationConfig",
  "orchestrationPublishedAt",
  "orchestrationDeltas",
  // Signed inference manifests are publish-owned evidence: a PATCH-forged
  // manifest would let a caller bind the live workflow to unproven bytes.
  "inferenceManifests"
]);

/** Draft workflow fields — direct PATCH may save these freely. */
const DRAFT_WORKFLOW_ROW_FIELDS = Object.freeze([
  "orchestrationDraftGraph",
  "orchestrationDraftConfig",
  "orchestrationDraftStatus",
  "orchestrationDraftUpdatedAt",
  "orchestrationDraftBaseVersion",
  "orchestrationDraftTestPassed",
  "orchestrationDraftTestedConfig",
  "orchestrationDraftLastRunId",
  "orchestrationDraftLastTested",
  "orchestrationDraftLastResponse"
]);

/** Same set the schema rejects; duplicated here so preflight can report early. */
const CREDENTIAL_ROW_FIELDS = Object.freeze([
  "token",
  "apiKey",
  "accessToken",
  "refreshToken",
  "bearer",
  "password",
  "secret",
  "sessionKey"
]);

/** Row fields whose presence as a populated array means history smuggling. */
const HISTORY_BLOB_ROW_FIELDS = Object.freeze([
  "records",
  "versions",
  "history",
  "runHistory",
  "sourceRecords"
]);

/**
 * Server-owned evidence on `model-training-run` rows. `compute` carries the
 * sealed compute authority, placement decision/quotes, allocation/resource
 * identities, idempotency identities, normalized events, checkpoints,
 * artifact byte-verification, and canonical evaluation evidence — all of it
 * written exclusively by server routes (sandbox-run's progressive journal).
 * Echo-only through direct PATCH.
 */
const TRAINING_EVIDENCE_ROW_FIELDS = Object.freeze(["compute"]);

/**
 * Execution-derived success claims that become server-owned once a run row
 * carries provider-compute evidence: for a provider-compute run the ONLY
 * writer of these is the route's verified-import stamp. Local-runner rows
 * (no compute evidence) keep stamping them through the governed PATCH lane;
 * their honesty is enforced by derivation (unprovable claims demote).
 */
const TRAINING_ARTIFACT_CLAIM_FIELDS = Object.freeze([
  "artifactType",
  "artifactModelTag",
  "artifactPath",
  "artifactSha256",
  "artifactQuantization",
  "artifactSourceBytes",
  "artifactArtifactBytes",
  "artifact"
]);

/** Statuses that claim execution success — see TRAINING_ARTIFACT_CLAIM_FIELDS. */
const TRAINING_SUCCESS_STATUSES = Object.freeze(["completed", "imported", "verified"]);

/** Top-level keys that signal "this is a whole workspace config, not a patch". */
const FULL_CONFIG_SIGNATURE_FIELDS = Object.freeze([
  "id",
  "name",
  "description",
  "branding",
  "capabilities",
  "pipelines",
  "integrations",
  "provenance"
]);

const WORKSPACE_PATCH_LIMITS = Object.freeze({
  /** Serialized PATCH body ceiling (bytes of JSON text). */
  maxPatchBytes: 2_000_000,
  /** Serialized single-row ceiling, unless byte-identical to the persisted row. */
  maxRowBytes: 131_072,
  /** Rows per dataModel object. */
  maxRowsPerObject: 500,
  /** Serialized single orchestration-node config ceiling. */
  maxNodeConfigBytes: 65_536
});

/** Stable stringify (sorted object keys) so echo comparison is order-proof. */
function stableStringify(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, function replacer(key, v) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) sorted[k] = v[k];
      return sorted;
    }
    return v;
  });
}

function sameValue(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rowName(row) {
  // Sandbox row identity is the Data Model grid's capital-N `Name` column.
  return String(row?.Name ?? "").trim();
}

function violation(code, path, message) {
  return { code, path, message };
}

/**
 * Try to parse an orchestration graph value (string or object) far enough
 * to measure node configs. Returns null when not parseable — schema
 * validation owns deep correctness; the policy only measures size.
 */
function parseGraphForMeasurement(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function checkRowSizes(row, currentRow, path, violations) {
  const serialized = stableStringify(row);
  if (serialized.length > WORKSPACE_PATCH_LIMITS.maxRowBytes && !sameValue(row, currentRow)) {
    violations.push(violation(
      "oversized_row",
      path,
      `row serializes to ${serialized.length} bytes (limit ${WORKSPACE_PATCH_LIMITS.maxRowBytes}); ` +
        "move bulk payloads to source records or split the row"
    ));
  }
  for (const field of HISTORY_BLOB_ROW_FIELDS) {
    const value = row[field];
    if (Array.isArray(value) && value.length > 0 && !sameValue(value, currentRow?.[field])) {
      violations.push(violation(
        "history_smuggling",
        `${path}.${field}`,
        `${field} is a populated array — run/record history belongs in growthub.source-records.json ` +
          "(written by sandbox-run / refresh-sources), never inside dataModel rows"
      ));
    }
  }
  for (const graphField of ["orchestrationGraph", "orchestrationConfig", "orchestrationDraftGraph", "orchestrationDraftConfig"]) {
    if (sameValue(row[graphField], currentRow?.[graphField])) continue;
    const graph = parseGraphForMeasurement(row[graphField]);
    if (!graph || !Array.isArray(graph.nodes)) continue;
    graph.nodes.forEach((node, nodeIndex) => {
      const config = node?.config;
      if (!isPlainObject(config)) return;
      const size = stableStringify(config).length;
      if (size > WORKSPACE_PATCH_LIMITS.maxNodeConfigBytes) {
        violations.push(violation(
          "oversized_node_config",
          `${path}.${graphField}.nodes[${nodeIndex}].config`,
          `node config serializes to ${size} bytes (limit ${WORKSPACE_PATCH_LIMITS.maxNodeConfigBytes}); ` +
            "reference large payloads through source records or env refs instead of inlining them"
        ));
      }
    });
  }
}

function checkSandboxRow(row, currentRow, path, violations) {
  for (const field of CREDENTIAL_ROW_FIELDS) {
    if (row[field] !== undefined) {
      violations.push(violation(
        "credential_field",
        `${path}.${field}`,
        `${field} is not allowed on a sandbox row — auth secrets must stay in the local CLI's own store; ` +
          "rows carry authRef / env-ref names only"
      ));
    }
  }

  const isNewRow = !currentRow;
  for (const field of LIVE_WORKFLOW_ROW_FIELDS) {
    const incoming = row[field];
    if (isNewRow) {
      const populated = Array.isArray(incoming)
        ? incoming.length > 0
        : incoming !== undefined && incoming !== null && String(incoming).trim() !== "";
      if (populated) {
        violations.push(violation(
          "live_workflow_field",
          `${path}.${field}`,
          `${field} may not be created through direct PATCH — save it as a draft ` +
            "(orchestrationDraft*) and promote it through POST /api/workspace/workflow/publish"
        ));
      }
      continue;
    }
    if (!sameValue(incoming, currentRow[field])) {
      violations.push(violation(
        "live_workflow_field",
        `${path}.${field}`,
        `${field} is publish-owned — direct PATCH may only echo the persisted value; ` +
          "use POST /api/workspace/workflow/publish to change the live workflow"
      ));
    }
  }

  if (!isNewRow && row.version !== undefined && !sameValue(row.version, currentRow.version)) {
    violations.push(violation(
      "live_workflow_field",
      `${path}.version`,
      "version increments are publish-owned — direct PATCH may only echo the persisted version"
    ));
  }

  const incomingStatus = String(row.lifecycleStatus ?? "").trim().toLowerCase();
  const currentStatus = String(currentRow?.lifecycleStatus ?? "").trim().toLowerCase();
  const isHelperSetupRow = rowName(row) === "workspace-helper";
  if (incomingStatus === "live" && currentStatus !== "live") {
    if (isHelperSetupRow) return;
    violations.push(violation(
      "live_publish_via_patch",
      `${path}.lifecycleStatus`,
      'lifecycleStatus: "live" is publish-owned — POST /api/workspace/workflow/publish is the only ' +
        "transition into live; direct PATCH may keep a live row live or move it back to draft"
    ));
  }
}

/** Parse a JSON-string-or-object column far enough to inspect it. */
function parseJsonColumn(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a value would populate a field (non-empty by column convention). */
function populatedColumn(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * Remote provider-compute evidence on the persisted journal: an allocation,
 * provider events, or a decision that selected a NON-local provider. A
 * decision selecting the local machine (automatic policy falling through to
 * the local pipeline) is not remote evidence — that run still finishes
 * through the local runner's PATCH lane.
 */
function hasRemoteComputeEvidence(compute) {
  if (!isPlainObject(compute)) return false;
  if (isPlainObject(compute.allocation)) return true;
  if (Array.isArray(compute.events) && compute.events.length > 0) return true;
  const selected = String(compute.decision?.selectedProviderId ?? "").trim();
  // "local-machine" is LOCAL_PROVIDER_ID in compute-provider-registry.js —
  // duplicated here because this module is dependency-free by design.
  return Boolean(selected && selected !== "local-machine");
}

/** Any server journal at all (decision, authority, allocation, events). */
function hasAnyComputeJournal(compute) {
  if (!isPlainObject(compute)) return false;
  return Boolean(
    isPlainObject(compute.decision)
      || isPlainObject(compute.authority)
      || isPlainObject(compute.allocation)
      || (Array.isArray(compute.events) && compute.events.length > 0)
  );
}

/**
 * Is a compute request remote-capable? Everything except an explicit local
 * policy (or a request pinned to the local machine) can reach a paid
 * provider, so its success claims must come from the server, not PATCH.
 */
function requestIsRemoteCapable(computeRequestColumn) {
  const request = parseJsonColumn(computeRequestColumn);
  if (!request) return false;
  const mode = String(request.policy?.mode ?? "").trim().toLowerCase();
  if (mode === "local" || request.policy?.localOnly === true) return false;
  if (!mode && String(request.providerRegistryId ?? "").trim() === "local-machine") return false;
  return true;
}

/**
 * A run row whose evidence chain must never be deleted or renamed away:
 * it carries a server journal, a promotion verdict, or verified success
 * artifact identity.
 */
function isProtectedTrainingRunRow(row) {
  if (!isPlainObject(row)) return false;
  if (populatedColumn(row.compute)) return true;
  if (populatedColumn(parseJsonColumn(row.distillation)?.benchmarkWins)) return true;
  const status = String(row.status ?? "").trim().toLowerCase();
  if (TRAINING_SUCCESS_STATUSES.includes(status) && String(row.artifactSha256 ?? "").trim()) return true;
  return false;
}

/** Two-way echo check: any semantic difference — including OMISSION of a
 *  populated persisted value (PATCH replaces dataModel wholesale, so an
 *  omitted field IS a deletion) — is a violation. */
function evidenceFieldViolation(row, currentRow, field, incomingValue, currentValue) {
  if (sameValue(incomingValue ?? null, currentValue ?? null)) return false;
  return populatedColumn(incomingValue) || populatedColumn(currentValue);
}

function checkTrainingRunRow(row, currentRow, path, violations) {
  const isNewRow = !currentRow;
  const currentCompute = parseJsonColumn(currentRow?.compute);
  const remoteLocked = hasRemoteComputeEvidence(currentCompute);
  const journaled = hasAnyComputeJournal(currentCompute);
  const push = (fieldPath, message) => violations.push(violation("training_evidence_field", fieldPath, message));

  // 1. The server compute journal is never caller-writable: creating,
  // altering, or ERASING it (including by omitting the field from the
  // replacement row) forges or destroys execution evidence — sealed
  // authority, decision, allocation, events, checkpoints, artifact
  // verification, canonical evaluation all live here.
  if (isNewRow) {
    if (populatedColumn(row.compute)) {
      push(`${path}.compute`,
        "compute evidence may not be created through direct PATCH — the sandbox-run route journals it " +
          "server-side; persist only the customer computeRequest snapshot");
    }
  } else if (evidenceFieldViolation(row, currentRow, "compute", row.compute, currentRow.compute)) {
    push(`${path}.compute`,
      "compute evidence is server-owned — direct PATCH may only echo the persisted value (omission is " +
        "erasure); run/cancel/resume through POST /api/workspace/sandbox-run to change it");
  }

  // 2. The promotion verdict is a derived evaluation outcome, never an
  // input: benchmarkWins is echo-only in BOTH directions on every run row —
  // it may not be added, modified, or removed (incl. by replacing or
  // omitting the distillation column).
  const incomingWins = parseJsonColumn(row.distillation)?.benchmarkWins;
  const currentWins = parseJsonColumn(currentRow?.distillation)?.benchmarkWins;
  if (isNewRow ? populatedColumn(incomingWins) : evidenceFieldViolation(row, currentRow, "distillation", incomingWins, currentWins)) {
    push(`${path}.distillation.benchmarkWins`,
      "benchmarkWins/promotion is a derived evaluation verdict — direct PATCH may only echo it exactly " +
        "(adding, changing, or removing it is refused); it is written by the evaluation boundary");
  }

  // 3. Once the server journals ANYTHING for a run, the request and identity
  // fields the authority was compiled from are frozen: an intentional change
  // mints a NEW governed run through the preparation flow, never a silent
  // in-place authority reset (the key-rotation reset defense).
  if (!isNewRow && journaled) {
    for (const field of ["computeRequest", "baseModel", "trainingProfile", "datasetExportId", "modelTrainingRowId"]) {
      if (evidenceFieldViolation(row, currentRow, field, row[field], currentRow[field])) {
        push(`${path}.${field}`,
          `${field} is frozen once the server has journaled compute evidence for this run — ` +
            "prepare a new governed run to change the request or its identities");
      }
    }
  }

  const incomingStatus = String(row.status ?? "").trim().toLowerCase();
  const currentStatus = String(currentRow?.status ?? "").trim().toLowerCase();

  // 4. Remote-locked rows: execution-derived state is echo-only in BOTH
  // directions. A caller may not mint success, may not erase or demote a
  // server-stamped success, and may not touch artifact identity or the
  // stamped preflight anchor.
  if (!isNewRow && remoteLocked) {
    const statusChanged = incomingStatus !== currentStatus;
    if (statusChanged && (TRAINING_SUCCESS_STATUSES.includes(incomingStatus) || TRAINING_SUCCESS_STATUSES.includes(currentStatus))) {
      push(`${path}.status`,
        "imported/completed/verified status is execution-derived on a provider-compute run — direct PATCH " +
          "may neither mint nor erase/demote it; only the sandbox-run route stamps it");
    }
    for (const field of TRAINING_ARTIFACT_CLAIM_FIELDS) {
      if (evidenceFieldViolation(row, currentRow, field, row[field], currentRow[field])) {
        push(`${path}.${field}`,
          `${field} is verification evidence on a provider-compute run — direct PATCH may only echo it ` +
            "(omission is erasure)");
      }
    }
    if (evidenceFieldViolation(row, currentRow, "preflight", row.preflight, currentRow.preflight)) {
      push(`${path}.preflight`,
        "preflight is the stamped machine-evidence anchor of a provider-compute run — echo-only once " +
          "remote evidence exists");
    }
    return;
  }

  // 5. Success claims through PATCH belong to the LOCAL runner lane only.
  // The lane is keyed to a SERVER-journaled decision that selected the local
  // machine — or to a request that cannot reach a provider at all (explicit
  // local mode / no compute request). A remote-capable request without a
  // journaled local decision may be created and edited freely, but may not
  // arrive pre-imported or grow success/artifact claims via PATCH.
  const effectiveRequest = row.computeRequest !== undefined ? row.computeRequest : currentRow?.computeRequest;
  const remoteCapableRequest = requestIsRemoteCapable(effectiveRequest);
  const localDecisionJournaled = journaled
    && String(currentCompute?.decision?.selectedProviderId ?? "").trim() === "local-machine";
  const localLaneOpen = !remoteCapableRequest || localDecisionJournaled;
  if (!localLaneOpen) {
    const mintsSuccess = isNewRow
      ? TRAINING_SUCCESS_STATUSES.includes(incomingStatus)
      : incomingStatus !== currentStatus && TRAINING_SUCCESS_STATUSES.includes(incomingStatus);
    if (mintsSuccess) {
      push(`${path}.status`,
        "a remote-capable compute request cannot be marked imported/completed/verified through direct " +
          "PATCH before the server journals a local-machine placement decision — run it through " +
          "POST /api/workspace/sandbox-run");
    }
    for (const field of TRAINING_ARTIFACT_CLAIM_FIELDS) {
      const incomingValue = row[field];
      const currentValue = currentRow?.[field];
      const introduces = isNewRow ? populatedColumn(incomingValue) : evidenceFieldViolation(row, currentRow, field, incomingValue, currentValue);
      if (introduces && populatedColumn(incomingValue)) {
        push(`${path}.${field}`,
          `${field} is an execution claim — a remote-capable request may not carry caller-authored ` +
            "artifact identity before the server journals a local-machine placement decision");
      }
    }
  }
}

function checkDataModel(dataModel, currentConfig, violations) {
  if (dataModel === undefined) return;
  if (!isPlainObject(dataModel) || (dataModel.objects !== undefined && !Array.isArray(dataModel.objects))) {
    // Shape errors are the validator's domain; the policy stops here so the
    // two layers never disagree about the same malformed input.
    return;
  }
  const currentObjects = Array.isArray(currentConfig?.dataModel?.objects)
    ? currentConfig.dataModel.objects
    : [];
  const currentById = new Map(currentObjects.map((o) => [String(o?.id ?? ""), o]));

  (dataModel.objects ?? []).forEach((object, objectIndex) => {
    if (!isPlainObject(object)) return;
    const path = `dataModel.objects[${objectIndex}]`;
    const currentObject = currentById.get(String(object.id ?? "")) ?? null;
    const rows = Array.isArray(object.rows) ? object.rows : [];

    if (rows.length > WORKSPACE_PATCH_LIMITS.maxRowsPerObject) {
      violations.push(violation(
        "oversized_object",
        `${path}.rows`,
        `${rows.length} rows exceeds the ${WORKSPACE_PATCH_LIMITS.maxRowsPerObject}-row ceiling per object; ` +
          "page bulk data through source records instead"
      ));
    }

    const objectType = String(object.objectType ?? currentObject?.objectType ?? "").trim();
    const currentRows = Array.isArray(currentObject?.rows) ? currentObject.rows : [];
    const currentRowsByName = new Map(
      currentRows.filter((r) => rowName(r)).map((r) => [rowName(r), r])
    );
    // model-training-run rows carry their identity in trainingRunId, not Name.
    const currentRowsByRunId = new Map(
      currentRows
        .filter((r) => String(r?.trainingRunId ?? "").trim())
        .map((r) => [String(r.trainingRunId).trim(), r])
    );

    rows.forEach((row, rowIndex) => {
      if (!isPlainObject(row)) return;
      const rowPath = `${path}.rows[${rowIndex}]`;
      let currentRow = rowName(row) ? currentRowsByName.get(rowName(row)) ?? null : null;
      if (objectType === "model-training-run") {
        const runId = String(row.trainingRunId ?? "").trim();
        currentRow = runId ? currentRowsByRunId.get(runId) ?? null : null;
      }
      checkRowSizes(row, currentRow, rowPath, violations);
      if (objectType === "sandbox-environment") {
        checkSandboxRow(row, currentRow, rowPath, violations);
      }
      if (objectType === "model-training-run") {
        checkTrainingRunRow(row, currentRow, rowPath, violations);
      }
    });
  });

  // Deletion / rename detection. PATCH replaces dataModel wholesale, so a
  // persisted evidence-bearing run row (or its whole object) that is simply
  // MISSING from the incoming body is a deletion of server-owned evidence —
  // and renaming trainingRunId is the same deletion wearing a new identity.
  const incomingById = new Map(
    (dataModel.objects ?? []).filter(isPlainObject).map((o) => [String(o.id ?? ""), o])
  );
  currentObjects.forEach((currentObject) => {
    if (!isPlainObject(currentObject) || String(currentObject.objectType ?? "") !== "model-training-run") return;
    const incomingObject = incomingById.get(String(currentObject.id ?? "")) ?? null;
    const incomingRows = Array.isArray(incomingObject?.rows) ? incomingObject.rows.filter(isPlainObject) : [];
    const incomingByRunId = new Map(
      incomingRows
        .filter((r) => String(r.trainingRunId ?? "").trim())
        .map((r) => [String(r.trainingRunId).trim(), r])
    );
    (Array.isArray(currentObject.rows) ? currentObject.rows : []).forEach((currentRow) => {
      if (!isProtectedTrainingRunRow(currentRow)) return;
      const runId = String(currentRow?.trainingRunId ?? "").trim();
      if (!incomingObject) {
        violations.push(violation(
          "training_evidence_field",
          "dataModel.objects",
          `model-training-run object "${String(currentObject.id ?? "")}" carries server-owned evidence ` +
            `(run "${runId || "unnamed"}") and may not be deleted through direct PATCH`
        ));
        return;
      }
      if (!runId || !incomingByRunId.has(runId)) {
        violations.push(violation(
          "training_evidence_field",
          "dataModel.objects",
          `run row "${runId || "unnamed"}" carries server-owned evidence and may not be deleted or ` +
            "renamed (trainingRunId is its identity) through direct PATCH"
        ));
      }
    });
  });
}

/**
 * Evaluate a PATCH body against the mutation policy.
 *
 * @param {object|null} currentConfig — currently persisted workspace config.
 * @param {unknown} patch — the incoming PATCH body, exactly as received.
 * @returns {{ ok: boolean, violations: Array<{code: string, path: string, message: string}> }}
 */
function evaluateWorkspacePatchPolicy(currentConfig, patch) {
  const violations = [];

  if (!isPlainObject(patch)) {
    violations.push(violation("invalid_body", "", "patch must be a plain object"));
    return { ok: false, violations };
  }

  const unknown = Object.keys(patch).filter((key) => !WORKSPACE_PATCH_ALLOWED_FIELDS.includes(key));
  if (unknown.includes("workspaceSourceRecords")) {
    violations.push(violation(
      "source_records_through_patch",
      "workspaceSourceRecords",
      "workspaceSourceRecords is GET-only hydration — sidecar writes flow through " +
        "POST /api/workspace/refresh-sources, never through PATCH"
    ));
  }
  const signatureHits = unknown.filter((key) => FULL_CONFIG_SIGNATURE_FIELDS.includes(key));
  if (signatureHits.length >= 2) {
    violations.push(violation(
      "full_config_body",
      "",
      `body carries whole-config fields (${signatureHits.join(", ")}) — never PATCH the full ` +
        "workspace config back; send only the changed allowlisted key(s)"
    ));
  }
  for (const key of unknown) {
    if (key === "workspaceSourceRecords") continue;
    violations.push(violation(
      "unknown_field",
      key,
      `${key} is outside the permanent PATCH allowlist (${WORKSPACE_PATCH_ALLOWED_FIELDS.join(", ")})`
    ));
  }

  const serialized = stableStringify(patch);
  if (serialized.length > WORKSPACE_PATCH_LIMITS.maxPatchBytes) {
    violations.push(violation(
      "oversized_patch",
      "",
      `patch serializes to ${serialized.length} bytes (limit ${WORKSPACE_PATCH_LIMITS.maxPatchBytes})`
    ));
  }

  checkDataModel(patch.dataModel, currentConfig, violations);

  return { ok: violations.length === 0, violations };
}

/**
 * Repair guidance — one governed alternative per violation code, so a
 * rejection teaches self-correction instead of provoking retry loops.
 * Returned by patch/preflight (`repairPlan[]`) and the PATCH 422 envelope.
 */
const REPAIR_PLANS = Object.freeze({
  invalid_body: "Send a single JSON object containing only changed allowlisted keys.",
  unknown_field: `Remove keys outside the allowlist (${WORKSPACE_PATCH_ALLOWED_FIELDS.join(", ")}); other config fields are read-only through this API.`,
  full_config_body: "Never PATCH the whole workspace config back — GET first, then send only the changed allowlisted key(s).",
  source_records_through_patch: "Write source records through POST /api/workspace/refresh-sources (or let sandbox-run persist run records); PATCH never touches the sidecar.",
  oversized_patch: "Split the change into smaller PATCHes per allowlisted key, and move bulk data into source records.",
  oversized_object: "Page bulk rows through source records; keep dataModel objects under the row ceiling.",
  oversized_row: "Move bulk payloads into source records and store only a sourceId/reference on the row.",
  oversized_node_config: "Reference large payloads from node configs via source records or env refs instead of inlining them.",
  history_smuggling: "Run/record history lives in growthub.source-records.json (written by sandbox-run / refresh-sources) — store only lastRunId/lastSourceId on the row.",
  credential_field: "Store the secret in the local CLI's own store and reference it via authRef / envRefs names only.",
  live_workflow_field: "Move the graph into orchestrationDraftConfig (or orchestrationDraftGraph), prove it with POST /api/workspace/sandbox-run {useDraft:true}, then promote it with POST /api/workspace/workflow/publish.",
  live_publish_via_patch: "lifecycleStatus \"live\" is set only by POST /api/workspace/workflow/publish after a verified draft test.",
  training_evidence_field: "Training evidence is server-owned: persist only the customer computeRequest snapshot through PATCH, then run/cancel/resume through POST /api/workspace/sandbox-run — the route journals authority, decision, allocation, events, checkpoints, artifact verification, and evaluation onto the receipt."
});

/** Ordered, deduplicated repair steps for a violation list. */
function repairPlanForViolations(violations) {
  const seen = new Set();
  const plan = [];
  for (const v of Array.isArray(violations) ? violations : []) {
    const step = REPAIR_PLANS[v?.code];
    if (step && !seen.has(step)) {
      seen.add(step);
      plan.push(step);
    }
  }
  return plan;
}

export {
  CREDENTIAL_ROW_FIELDS,
  DRAFT_WORKFLOW_ROW_FIELDS,
  FULL_CONFIG_SIGNATURE_FIELDS,
  HISTORY_BLOB_ROW_FIELDS,
  LIVE_WORKFLOW_ROW_FIELDS,
  TRAINING_ARTIFACT_CLAIM_FIELDS,
  TRAINING_EVIDENCE_ROW_FIELDS,
  TRAINING_SUCCESS_STATUSES,
  WORKSPACE_PATCH_ALLOWED_FIELDS,
  WORKSPACE_PATCH_LIMITS,
  evaluateWorkspacePatchPolicy,
  repairPlanForViolations,
  stableStringify
};
