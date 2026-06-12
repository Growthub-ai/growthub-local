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
  "orchestrationDeltas"
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
  if (incomingStatus === "live" && currentStatus !== "live") {
    violations.push(violation(
      "live_publish_via_patch",
      `${path}.lifecycleStatus`,
      'lifecycleStatus: "live" is publish-owned — POST /api/workspace/workflow/publish is the only ' +
        "transition into live; direct PATCH may keep a live row live or move it back to draft"
    ));
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

    rows.forEach((row, rowIndex) => {
      if (!isPlainObject(row)) return;
      const rowPath = `${path}.rows[${rowIndex}]`;
      const currentRow = rowName(row) ? currentRowsByName.get(rowName(row)) ?? null : null;
      checkRowSizes(row, currentRow, rowPath, violations);
      if (objectType === "sandbox-environment") {
        checkSandboxRow(row, currentRow, rowPath, violations);
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

export {
  CREDENTIAL_ROW_FIELDS,
  DRAFT_WORKFLOW_ROW_FIELDS,
  FULL_CONFIG_SIGNATURE_FIELDS,
  HISTORY_BLOB_ROW_FIELDS,
  LIVE_WORKFLOW_ROW_FIELDS,
  WORKSPACE_PATCH_ALLOWED_FIELDS,
  WORKSPACE_PATCH_LIMITS,
  evaluateWorkspacePatchPolicy,
  stableStringify
};
