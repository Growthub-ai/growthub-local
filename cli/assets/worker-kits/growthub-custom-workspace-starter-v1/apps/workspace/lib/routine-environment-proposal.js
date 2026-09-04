/**
 * Routine cloud-environment proposal lane.
 *
 * GH App owns the Project schedule and credential references; this deployed
 * Workspace owns execution and publication.  The bridge between them is a
 * deliberately closed, credential-free proposal that can only upsert one
 * sandbox row or attest one already-persisted sandbox run.  It never imports
 * a whole Workspace document and never accepts client-asserted run success.
 */

import { createHash } from "node:crypto";
import { sandboxRunSourceId } from "./workspace-data-model.js";
import { stableStringify } from "./workspace-patch-policy.js";

export const ROUTINE_ENVIRONMENT_PROPOSAL_TYPE = "routine.environment.upsert";
export const ROUTINE_ENVIRONMENT_AFFECTED_FIELD = "dataModel";

const MAX_ROW_BYTES = 131_072;
const HASH = /^[a-f0-9]{64}$/;
const OUTPUT_HASH = /^[a-f0-9]{16,64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const SECRET_KEY = /(^|_)(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|authorization|cookie|bearer)($|_)/i;
const SECRET_VALUE = /^(?:bearer\s+\S+|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

const clean = (value) => String(value == null ? "" : value).trim();
const plainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

/**
 * A GH App Routine graph is executed by the row's authenticated remote
 * adapter, not by the Workspace's native graph runner. The graph remains the
 * exact published artifact and the adapter returns the durable run proof.
 */
export function routineEnvironmentUsesBoundAdapter(row, adapterId) {
  return clean(adapterId) === "vercel-function"
    && row?.routineEnvironmentContract?.schema === "growthub-routine-cloud-environment-v1";
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function boundedIdentity(value, max = 240) {
  const normalized = clean(value);
  return normalized && normalized.length <= max && IDENTITY.test(normalized) ? normalized : null;
}

function boundedLabel(value, max = 240) {
  const normalized = clean(value);
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null;
}

function sha256Canonical(value) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function parseDraft(value) {
  if (plainObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return plainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function secretFinding(value, path = "$") {
  if (value == null) return null;
  if (typeof value === "string") return SECRET_VALUE.test(value.trim()) ? path : null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = secretFinding(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!plainObject(value)) return null;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    const referenceOnly = /ref$/i.test(key) && typeof entry === "string" && /^(?:env:)?[A-Z][A-Z0-9_]{2,}$/.test(entry);
    if (SECRET_KEY.test(key) && !referenceOnly && entry !== null && entry !== "") return nextPath;
    const found = secretFinding(entry, nextPath);
    if (found) return found;
  }
  return null;
}

function findSandboxObject(config, objectId) {
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  return objects.find((object) => object?.id === objectId) || null;
}

function findSandboxRow(config, objectId, rowName) {
  const object = findSandboxObject(config, objectId);
  if (!object || object.objectType !== "sandbox-environment") return { object, row: null, rowIndex: -1 };
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((row) => clean(row?.Name) === rowName);
  return { object, row: rowIndex >= 0 ? rows[rowIndex] : null, rowIndex };
}

function upsertSandboxRow(config, objectId, rowName, row) {
  const dataModel = plainObject(config?.dataModel) ? config.dataModel : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects.slice() : [];
  let objectIndex = objects.findIndex((object) => object?.id === objectId);
  if (objectIndex < 0) {
    objects.push({
      id: objectId,
      label: "Routine environments",
      source: "Growthub Routines",
      objectType: "sandbox-environment",
      icon: "Workflow",
      columns: ["Name", "lifecycleStatus", "runLocality", "runtime", "adapter", "status", "lastTested"],
      rows: [],
      binding: { mode: "manual", source: "Growthub Routines" },
    });
    objectIndex = objects.length - 1;
  }
  const object = objects[objectIndex];
  if (object.objectType !== "sandbox-environment") {
    throw new Error(`object ${objectId} is not a sandbox-environment`);
  }
  const rows = Array.isArray(object.rows) ? object.rows.slice() : [];
  const rowIndex = rows.findIndex((candidate) => clean(candidate?.Name) === rowName);
  if (rowIndex >= 0) rows[rowIndex] = row;
  else rows.push(row);
  objects[objectIndex] = { ...object, rows };
  return { ...config, dataModel: { ...dataModel, objects } };
}

function proposalError(config, message) {
  return { ok: false, config, artifact: null, summary: "", error: message };
}

export function validateRoutineEnvironmentProposal(proposal) {
  if (proposal?.type !== ROUTINE_ENVIRONMENT_PROPOSAL_TYPE) {
    return { ok: false, error: "not a Routine environment proposal" };
  }
  if (proposal.affectedField !== ROUTINE_ENVIRONMENT_AFFECTED_FIELD || !plainObject(proposal.payload)) {
    return { ok: false, error: "Routine environment proposals must target dataModel" };
  }
  const stage = proposal.payload.stage;
  const expected = stage === "draft"
    ? ["stage", "objectId", "rowName", "environmentId", "draftSha256", "artifactSha256", "proofKey", "row"]
    : stage === "attest"
      ? ["stage", "objectId", "rowName", "environmentId", "draftSha256", "artifactSha256", "proofKey", "runId", "sourceId", "outputHash"]
      : null;
  if (!expected || !exactKeys(proposal.payload, expected)) {
    return { ok: false, error: "Routine environment payload does not match the closed stage contract" };
  }
  for (const key of ["objectId", "environmentId"]) {
    if (!boundedIdentity(proposal.payload[key])) return { ok: false, error: `payload.${key} is invalid` };
  }
  if (!boundedLabel(proposal.payload.rowName)) return { ok: false, error: "payload.rowName is invalid" };
  for (const key of ["draftSha256", "artifactSha256", "proofKey"]) {
    if (!HASH.test(clean(proposal.payload[key]))) return { ok: false, error: `payload.${key} must be a sha256 digest` };
  }
  if (stage === "attest") {
    if (!boundedIdentity(proposal.payload.runId, 200)) return { ok: false, error: "payload.runId is invalid" };
    if (!boundedIdentity(proposal.payload.sourceId, 500)) return { ok: false, error: "payload.sourceId is invalid" };
    if (!OUTPUT_HASH.test(clean(proposal.payload.outputHash))) return { ok: false, error: "payload.outputHash must be a bounded output digest" };
  }
  return { ok: true };
}

function validateDraftRow(payload) {
  const row = payload.row;
  if (!plainObject(row)) return "payload.row must be a plain object";
  if (Buffer.byteLength(JSON.stringify(row), "utf8") > MAX_ROW_BYTES) return "payload.row exceeds the sandbox row limit";
  const secretPath = secretFinding(row);
  if (secretPath) return `payload.row contains credential-shaped material at ${secretPath}`;
  if (clean(row.Name) !== clean(payload.rowName)) return "payload.row.Name must match payload.rowName";
  if (clean(row.routineEnvironmentId) !== clean(payload.environmentId)) return "Routine environment identity does not match the row";
  if (clean(row.routineEnvironmentDraftSha256) !== clean(payload.draftSha256)) return "Routine draft identity does not match the row";
  if (clean(row.routineEnvironmentArtifactSha256) !== clean(payload.artifactSha256)) return "Routine artifact identity does not match the row";
  if (clean(row.routineEnvironmentProofKey) !== clean(payload.proofKey)) return "Routine proof identity does not match the row";
  if (clean(row.routineEnvironmentStatus) !== "draft") return "A draft proposal must carry routineEnvironmentStatus=draft";
  const contract = row.routineEnvironmentContract;
  if (!plainObject(contract) || contract.schema !== "growthub-routine-cloud-environment-v1") return "Routine environment contract is missing or unsupported";
  if (clean(contract.environmentId) !== clean(payload.environmentId)) return "Routine environment contract identity does not match";
  if (clean(contract?.sandbox?.objectId) !== clean(payload.objectId) || clean(contract?.sandbox?.rowName) !== clean(payload.rowName)) {
    return "Routine environment contract sandbox binding does not match";
  }
  const graph = parseDraft(row.orchestrationDraftConfig || row.orchestrationDraftGraph);
  if (!graph) return "Routine environment row has no valid orchestration draft";
  const draftSha256 = sha256Canonical(graph);
  if (draftSha256 !== clean(payload.draftSha256) || clean(payload.artifactSha256) !== draftSha256) {
    return "Routine environment draft bytes do not match the declared artifact identity";
  }
  const proofKey = sha256Canonical({
    contract,
    draftSha256: clean(payload.draftSha256),
    artifactSha256: clean(payload.artifactSha256),
  });
  if (proofKey !== clean(payload.proofKey)) return "Routine environment proof key does not match the exact contract and draft";
  return null;
}

function exactExistingRow(config, payload) {
  const located = findSandboxRow(config, clean(payload.objectId), clean(payload.rowName));
  if (!located.object) return { ...located, error: "Routine sandbox object is missing" };
  if (located.object.objectType !== "sandbox-environment") return { ...located, error: "Routine object is not a sandbox-environment" };
  if (!located.row) return { ...located, error: "Routine sandbox row is missing" };
  const row = located.row;
  const exact = clean(row.routineEnvironmentId) === clean(payload.environmentId)
    && clean(row.routineEnvironmentDraftSha256) === clean(payload.draftSha256)
    && clean(row.routineEnvironmentArtifactSha256) === clean(payload.artifactSha256)
    && clean(row.routineEnvironmentProofKey) === clean(payload.proofKey);
  return { ...located, error: exact ? null : "Persisted Routine environment identity does not match the attestation" };
}

export function normalizeRoutineEnvironmentProposal(proposal, workspaceConfig, sourceRecords = null) {
  const validation = validateRoutineEnvironmentProposal(proposal);
  if (!validation.ok) return proposalError(workspaceConfig, validation.error);
  const payload = proposal.payload;
  const objectId = clean(payload.objectId);
  const rowName = clean(payload.rowName);

  if (payload.stage === "draft") {
    const rowError = validateDraftRow(payload);
    if (rowError) return proposalError(workspaceConfig, rowError);
    const located = findSandboxRow(workspaceConfig, objectId, rowName);
    if (located.object && located.object.objectType !== "sandbox-environment") {
      return proposalError(workspaceConfig, `object ${objectId} is not a sandbox-environment`);
    }
    let next;
    try {
      // A draft test executes directly inside this already-authenticated
      // serverless request. Do not recursively hand the test back to QStash;
      // attestation restores the declared cloud/serverless locality after the
      // exact graph run is durable.
      next = upsertSandboxRow(workspaceConfig, objectId, rowName, {
        ...payload.row,
        runLocality: "local",
        routineEnvironmentTargetLocality: payload.row?.routineEnvironmentContract?.execution?.mode === "cloud"
          ? "serverless"
          : "local",
      });
    } catch (error) {
      return proposalError(workspaceConfig, error?.message || "Routine sandbox row could not be upserted");
    }
    return {
      ok: true,
      config: next,
      artifact: {
        surface: "workflow",
        objectId,
        rowName,
        environmentId: clean(payload.environmentId),
        stage: "draft",
        draftSha256: clean(payload.draftSha256),
      },
      summary: `Saved credential-free Routine environment draft ${clean(payload.environmentId)}`,
    };
  }

  const located = exactExistingRow(workspaceConfig, payload);
  if (located.error) return proposalError(workspaceConfig, located.error);
  const expectedSourceId = sandboxRunSourceId(objectId, rowName);
  if (!expectedSourceId || clean(payload.sourceId) !== expectedSourceId) {
    return proposalError(workspaceConfig, "Routine attestation source does not match the canonical sandbox stream");
  }
  const records = Array.isArray(sourceRecords?.records) ? sourceRecords.records : [];
  // One native provider run can have an older transport failure followed by
  // the recovered terminal execution. Attestation selects the newest exact
  // successful execution record and ignores status handles; it never lets an
  // earlier transport projection override the durable provider result.
  const run = [...records].reverse().find((record) => (
    record?.kind !== "growthub-sandbox-run-handle-v1"
    && clean(record?.runId) === clean(payload.runId)
    && record?.exitCode === 0
    && !record?.error
    && record?.useDraft === true
    && clean(record?.draftSha256) === clean(payload.draftSha256)
    && clean(record?.outputHash) === clean(payload.outputHash)
  ));
  if (!run) return proposalError(workspaceConfig, "Routine sandbox run is not durable in the canonical source stream");
  if (!OUTPUT_HASH.test(clean(run.outputHash)) || clean(run.outputHash) !== clean(payload.outputHash)) {
    return proposalError(workspaceConfig, "Routine sandbox output identity does not match durable run evidence");
  }
  const testedAt = clean(run.ranAt || run.completedAt || run.finishedAt) || new Date().toISOString();
  const nextRow = {
    ...located.row,
    runLocality: located.row?.routineEnvironmentContract?.execution?.mode === "cloud" ? "serverless" : "local",
    routineEnvironmentStatus: "sandbox-verified",
    routineEnvironmentRunId: clean(payload.runId),
    routineEnvironmentSourceId: expectedSourceId,
    routineEnvironmentOutputHash: clean(payload.outputHash),
    orchestrationDraftTestPassed: true,
    orchestrationDraftTestedConfig: located.row.orchestrationDraftConfig,
    orchestrationDraftStatus: "sandbox-verified",
    orchestrationDraftLastRunId: clean(payload.runId),
    orchestrationDraftLastTested: testedAt,
    orchestrationDraftLastStatus: "connected",
    orchestrationDraftLastResponse: JSON.stringify(run),
    lastRunId: clean(payload.runId),
    lastSourceId: expectedSourceId,
    lastResponse: JSON.stringify(run),
    lastTested: testedAt,
    status: "connected",
  };
  const next = upsertSandboxRow(workspaceConfig, objectId, rowName, nextRow);
  return {
    ok: true,
    config: next,
    artifact: {
      surface: "workflow",
      objectId,
      rowName,
      environmentId: clean(payload.environmentId),
      stage: "sandbox-verified",
      runId: clean(payload.runId),
      sourceId: expectedSourceId,
      outputHash: clean(payload.outputHash),
      draftSha256: clean(payload.draftSha256),
    },
    summary: `Attested exact sandbox run ${clean(payload.runId)} for Routine environment ${clean(payload.environmentId)}`,
  };
}
