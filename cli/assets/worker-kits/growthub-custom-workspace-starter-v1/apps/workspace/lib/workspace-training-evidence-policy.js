/**
 * Completeness guard for server-owned training evidence in PATCH /api/workspace.
 *
 * workspace-patch-policy.js validates rows that are present in the incoming
 * replacement dataModel. A replacement patch can also attempt to destroy
 * evidence by omitting a protected field, row, or the entire
 * model-training-run object. This module compares the current and incoming
 * dataModel sets so omission is treated exactly like an explicit rewrite.
 *
 * Once a server-sealed authority exists, its customer request snapshot is
 * frozen on that run. Changing policy/provider/output inputs requires a new
 * governed run or explicit re-prepare action; direct PATCH cannot mutate the
 * inputs underneath already-sealed execution evidence.
 *
 * Dependency-free by design. Both the real PATCH route and patch/preflight
 * call this same function, so dry-run and write behavior cannot diverge.
 */

const PROTECTED_ARTIFACT_FIELDS = Object.freeze([
  "artifactType",
  "artifactModelTag",
  "artifactPath",
  "artifactSha256",
  "artifactQuantization",
  "artifactSourceBytes",
  "artifactArtifactBytes",
  "artifact",
]);

const SUCCESS_STATUSES = new Set(["completed", "imported", "verified"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function stableStringify(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, function replacer(_key, item) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const sorted = {};
      for (const key of Object.keys(item).sort()) sorted[key] = item[key];
      return sorted;
    }
    return item;
  });
}

function sameValue(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function populated(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function objectKey(object) {
  const id = String(object?.id ?? "").trim();
  if (id) return `id:${id}`;
  return `type:${String(object?.objectType ?? "").trim()}`;
}

function runId(row) {
  return String(row?.trainingRunId ?? "").trim();
}

function benchmarkWins(row) {
  return parseJsonColumn(row?.distillation)?.benchmarkWins;
}

function computeBlock(row) {
  return parseJsonColumn(row?.compute);
}

function hasSealedAuthority(row) {
  const authority = computeBlock(row)?.authority;
  return Boolean(
    isPlainObject(authority)
      && String(authority.schema ?? "") === "growthub-compute-authority-v1"
      && populated(authority.authorityHash)
      && populated(authority.keyId)
      && populated(authority.seal),
  );
}

function hasRemoteComputeEvidence(row) {
  const compute = computeBlock(row);
  if (!compute) return false;
  if (isPlainObject(compute.allocation)) return true;
  if (Array.isArray(compute.events) && compute.events.length > 0) return true;
  const selected = String(compute.decision?.selectedProviderId ?? "").trim();
  return Boolean(selected && selected !== "local-machine");
}

function hasProtectedEvidence(row) {
  if (populated(row?.compute)) return true;
  if (populated(benchmarkWins(row))) return true;
  if (hasRemoteComputeEvidence(row)) return true;
  if (SUCCESS_STATUSES.has(String(row?.status ?? "").trim().toLowerCase())) {
    return PROTECTED_ARTIFACT_FIELDS.some((field) => populated(row?.[field]));
  }
  return false;
}

function violation(path, message) {
  return { code: "training_evidence_field", path, message };
}

function rowsByRunId(rows) {
  const map = new Map();
  const duplicates = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = runId(row);
    if (!id) continue;
    if (map.has(id)) duplicates.add(id);
    else map.set(id, row);
  }
  return { map, duplicates };
}

/**
 * Reject deletion-by-omission of server-owned training evidence.
 *
 * @returns {{ok:boolean, violations:Array<{code:string,path:string,message:string}>}}
 */
function evaluateTrainingEvidencePatchCompleteness(currentConfig, patch) {
  const violations = [];
  if (!isPlainObject(patch) || patch.dataModel === undefined) {
    return { ok: true, violations };
  }
  if (!isPlainObject(patch.dataModel) || !Array.isArray(patch.dataModel.objects)) {
    return { ok: true, violations }; // shape validation owns malformed bodies
  }

  const currentObjects = Array.isArray(currentConfig?.dataModel?.objects)
    ? currentConfig.dataModel.objects
    : [];
  const incomingObjects = patch.dataModel.objects;
  const incomingByKey = new Map(incomingObjects.map((object) => [objectKey(object), object]));

  for (const currentObject of currentObjects) {
    if (String(currentObject?.objectType ?? "").trim() !== "model-training-run") continue;
    const protectedRows = (Array.isArray(currentObject.rows) ? currentObject.rows : []).filter(hasProtectedEvidence);
    if (protectedRows.length === 0) continue;

    const key = objectKey(currentObject);
    const incomingObject = incomingByKey.get(key)
      || incomingObjects.find((object) => String(object?.objectType ?? "").trim() === "model-training-run")
      || null;
    const objectPath = `dataModel.objects[${String(currentObject?.id ?? "model-training-run")}]`;

    if (!incomingObject) {
      violations.push(violation(
        objectPath,
        "model-training-run contains server-owned evidence and may not be removed through direct PATCH; retain the object and every protected run row, or use a future governed archive/delete action",
      ));
      continue;
    }

    const incomingRows = rowsByRunId(incomingObject.rows);
    for (const duplicate of incomingRows.duplicates) {
      violations.push(violation(
        `${objectPath}.rows[trainingRunId=${duplicate}]`,
        `duplicate trainingRunId "${duplicate}" makes the evidence target ambiguous — each governed run id must be unique`,
      ));
    }

    for (const currentRow of protectedRows) {
      const id = runId(currentRow);
      const rowPath = `${objectPath}.rows[trainingRunId=${id || "missing"}]`;
      if (!id) {
        violations.push(violation(rowPath, "a row carrying server-owned training evidence has no trainingRunId and cannot be safely replaced through PATCH"));
        continue;
      }
      const incomingRow = incomingRows.map.get(id);
      if (!incomingRow) {
        violations.push(violation(
          rowPath,
          `training run "${id}" carries server-owned evidence and may not be deleted by omitting the row from a replacement dataModel patch`,
        ));
        continue;
      }

      if (populated(currentRow.compute) && !sameValue(incomingRow.compute, currentRow.compute)) {
        violations.push(violation(
          `${rowPath}.compute`,
          "compute evidence is server-owned — omission, erasure, and replacement are all refused; direct PATCH may only echo the persisted value",
        ));
      }

      if (hasSealedAuthority(currentRow) && !sameValue(incomingRow.computeRequest, currentRow.computeRequest)) {
        violations.push(violation(
          `${rowPath}.computeRequest`,
          "the customer compute request is frozen once server authority is sealed — create a new governed run or explicitly re-prepare instead of mutating policy/provider/output inputs underneath existing evidence",
        ));
      }

      const currentWins = benchmarkWins(currentRow);
      if (populated(currentWins) && !sameValue(benchmarkWins(incomingRow), currentWins)) {
        violations.push(violation(
          `${rowPath}.distillation.benchmarkWins`,
          "benchmarkWins/promotion evidence may not be erased or replaced through direct PATCH",
        ));
      }

      if (hasRemoteComputeEvidence(currentRow)) {
        for (const field of PROTECTED_ARTIFACT_FIELDS) {
          if (populated(currentRow[field]) && !sameValue(incomingRow[field], currentRow[field])) {
            violations.push(violation(
              `${rowPath}.${field}`,
              `${field} is verified provider-compute evidence — omission, erasure, and replacement are refused`,
            ));
          }
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

function combinePatchPolicyVerdicts(...verdicts) {
  const violations = verdicts.flatMap((verdict) => Array.isArray(verdict?.violations) ? verdict.violations : []);
  return { ok: verdicts.every((verdict) => verdict?.ok !== false) && violations.length === 0, violations };
}

export {
  PROTECTED_ARTIFACT_FIELDS,
  combinePatchPolicyVerdicts,
  evaluateTrainingEvidencePatchCompleteness,
};
