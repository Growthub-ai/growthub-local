/**
 * Pipeline Kits — runtime reader
 *
 * Phase 3 primitive. Reads a kit's `pipeline.manifest.json` from disk
 * and projects it onto the public `PipelineKitManifest` type from
 * `@growthub/api-contract/pipeline-kits`.
 *
 * Convention: `docs/PIPELINE_KIT_CONTRACT_V1.md`.
 *
 * The reader is intentionally tolerant — kits without a pipeline
 * manifest return `null`, not an error. Validation is reported as
 * structured `issues[]` so the CLI can render them and agents can
 * branch on the `--json` shape.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  PipelineKitManifest,
  PipelineStageRef,
} from "@growthub/api-contract/pipeline-kits";
import { PIPELINE_KIT_MANIFEST_VERSION } from "@growthub/api-contract/pipeline-kits";

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export const PIPELINE_MANIFEST_FILENAME = "pipeline.manifest.json";

export function resolvePipelineManifestPath(kitRoot: string): string {
  return path.resolve(kitRoot, PIPELINE_MANIFEST_FILENAME);
}

export function pipelineManifestExists(kitRoot: string): boolean {
  return fs.existsSync(resolvePipelineManifestPath(kitRoot));
}

// ---------------------------------------------------------------------------
// Issue shape
// ---------------------------------------------------------------------------

export interface PipelineManifestIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  /** Dotted path within the manifest (e.g. `stages[1].subSkillPath`). */
  field?: string;
}

export interface PipelineManifestReadResult {
  /** Path to the manifest file, even if it does not exist. */
  manifestPath: string;
  /** Whether the manifest file exists. */
  exists: boolean;
  /** Parsed manifest, or `null` when missing or unparsable. */
  manifest: PipelineKitManifest | null;
  /** Issues encountered while parsing or validating. */
  issues: PipelineManifestIssue[];
}

// ---------------------------------------------------------------------------
// Read + parse
// ---------------------------------------------------------------------------

function safeReadJson(absolutePath: string): { value: unknown; error?: string } {
  try {
    const text = fs.readFileSync(absolutePath, "utf8");
    return { value: JSON.parse(text) };
  } catch (err) {
    return { value: null, error: (err as Error).message };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Parse a stage entry into the SDK shape, collecting issues.
 */
function parseStage(
  raw: unknown,
  index: number,
  issues: PipelineManifestIssue[],
): PipelineStageRef | null {
  if (!isObject(raw)) {
    issues.push({
      severity: "error",
      code: "stage-not-object",
      message: `Stage ${index} is not an object`,
      field: `stages[${index}]`,
    });
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id : null;
  const subSkillPath = typeof raw.subSkillPath === "string" ? raw.subSkillPath : null;
  if (!id) {
    issues.push({
      severity: "error",
      code: "stage-missing-id",
      message: `Stage ${index} is missing 'id'`,
      field: `stages[${index}].id`,
    });
    return null;
  }
  if (!subSkillPath) {
    issues.push({
      severity: "error",
      code: "stage-missing-subskill",
      message: `Stage '${id}' is missing 'subSkillPath'`,
      field: `stages[${index}].subSkillPath`,
    });
    return null;
  }
  const stage: PipelineStageRef = {
    id,
    subSkillPath,
    inputArtifacts: asStringArray(raw.inputArtifacts),
    outputArtifacts: asStringArray(raw.outputArtifacts),
  };
  if (typeof raw.label === "string") stage.label = raw.label;
  if (Array.isArray(raw.helperPaths)) stage.helperPaths = asStringArray(raw.helperPaths);
  if (Array.isArray(raw.adapterModes)) stage.adapterModes = asStringArray(raw.adapterModes);
  if (Array.isArray(raw.externalDependencies)) {
    stage.externalDependencies = asStringArray(raw.externalDependencies);
  }
  if (typeof raw.traceRequired === "boolean") stage.traceRequired = raw.traceRequired;
  if (typeof raw.projectMemoryRequired === "boolean") {
    stage.projectMemoryRequired = raw.projectMemoryRequired;
  }
  return stage;
}

/**
 * Read and validate a kit's `pipeline.manifest.json`. Always returns a
 * `PipelineManifestReadResult`; never throws on missing or malformed
 * manifests — those are reported as `issues[]`.
 */
export function readPipelineManifest(kitRoot: string): PipelineManifestReadResult {
  const manifestPath = resolvePipelineManifestPath(kitRoot);
  const exists = fs.existsSync(manifestPath);
  const issues: PipelineManifestIssue[] = [];

  if (!exists) {
    return { manifestPath, exists: false, manifest: null, issues };
  }

  const parsed = safeReadJson(manifestPath);
  if (parsed.error || !isObject(parsed.value)) {
    issues.push({
      severity: "error",
      code: "manifest-unparsable",
      message: parsed.error ?? "Manifest is not a JSON object",
    });
    return { manifestPath, exists: true, manifest: null, issues };
  }

  const raw = parsed.value;
  const version = typeof raw.version === "number" ? raw.version : null;
  const kitId = typeof raw.kitId === "string" ? raw.kitId : null;
  const pipelineId = typeof raw.pipelineId === "string" ? raw.pipelineId : null;

  if (version !== PIPELINE_KIT_MANIFEST_VERSION) {
    issues.push({
      severity: version === null ? "error" : "warn",
      code: "manifest-version-mismatch",
      message:
        version === null
          ? "Manifest is missing 'version'"
          : `Manifest version ${version} does not match SDK PIPELINE_KIT_MANIFEST_VERSION ${PIPELINE_KIT_MANIFEST_VERSION}`,
      field: "version",
    });
  }
  if (!kitId) {
    issues.push({
      severity: "error",
      code: "manifest-missing-kit-id",
      message: "Manifest is missing 'kitId'",
      field: "kitId",
    });
  }
  if (!pipelineId) {
    issues.push({
      severity: "error",
      code: "manifest-missing-pipeline-id",
      message: "Manifest is missing 'pipelineId'",
      field: "pipelineId",
    });
  }

  const stagesRaw = Array.isArray(raw.stages) ? raw.stages : [];
  if (stagesRaw.length === 0) {
    issues.push({
      severity: "error",
      code: "manifest-no-stages",
      message: "Manifest has no stages",
      field: "stages",
    });
  }
  const stages: PipelineStageRef[] = [];
  const seenStageIds = new Set<string>();
  for (let i = 0; i < stagesRaw.length; i += 1) {
    const stage = parseStage(stagesRaw[i], i, issues);
    if (!stage) continue;
    if (seenStageIds.has(stage.id)) {
      issues.push({
        severity: "error",
        code: "stage-duplicate-id",
        message: `Duplicate stage id '${stage.id}'`,
        field: `stages[${i}].id`,
      });
      continue;
    }
    seenStageIds.add(stage.id);
    stages.push(stage);
  }

  if (!kitId || !pipelineId) {
    return { manifestPath, exists: true, manifest: null, issues };
  }

  const manifest: PipelineKitManifest = {
    version: version ?? PIPELINE_KIT_MANIFEST_VERSION,
    kitId,
    pipelineId,
    stages,
  };

  if (isObject(raw.outputTopology)) {
    const root = typeof raw.outputTopology.root === "string" ? raw.outputTopology.root : "";
    const buckets = asStringArray(raw.outputTopology.buckets);
    manifest.outputTopology = { root, buckets };
  }
  if (isObject(raw.tracePolicy)) {
    manifest.tracePolicy = {
      ...(typeof raw.tracePolicy.convention === "string"
        ? { convention: raw.tracePolicy.convention }
        : {}),
      ...(typeof raw.tracePolicy.traceFile === "string"
        ? { traceFile: raw.tracePolicy.traceFile }
        : {}),
      ...(typeof raw.tracePolicy.projectMemoryFile === "string"
        ? { projectMemoryFile: raw.tracePolicy.projectMemoryFile }
        : {}),
    };
  }
  if (isObject(raw.sessionMemoryPolicy)) {
    manifest.sessionMemoryPolicy = {
      ...(typeof raw.sessionMemoryPolicy.seedTemplate === "string"
        ? { seedTemplate: raw.sessionMemoryPolicy.seedTemplate }
        : {}),
      appendOn: asStringArray(raw.sessionMemoryPolicy.appendOn),
    };
  }
  if (isObject(raw.convention)) {
    manifest.convention = {
      ...(typeof raw.convention.spec === "string" ? { spec: raw.convention.spec } : {}),
      ...(typeof raw.convention.version === "number"
        ? { version: raw.convention.version }
        : {}),
      ...(typeof raw.convention.interpretedBy === "string"
        ? { interpretedBy: raw.convention.interpretedBy }
        : {}),
      ...(raw.convention.runtimeEnforcement === "none" ||
      raw.convention.runtimeEnforcement === "warn" ||
      raw.convention.runtimeEnforcement === "error"
        ? { runtimeEnforcement: raw.convention.runtimeEnforcement }
        : {}),
    };
  }

  // Cross-check sub-skill paths exist on disk
  for (let i = 0; i < manifest.stages.length; i += 1) {
    const stage = manifest.stages[i];
    const subSkillFullPath = path.resolve(kitRoot, stage.subSkillPath);
    if (!fs.existsSync(subSkillFullPath)) {
      issues.push({
        severity: "error",
        code: "stage-subskill-missing",
        message: `Stage '${stage.id}' references missing sub-skill at ${stage.subSkillPath}`,
        field: `stages[${i}].subSkillPath`,
      });
    }
  }

  return { manifestPath, exists: true, manifest, issues };
}

// ---------------------------------------------------------------------------
// Inspect projection — small, agent-and-human friendly
// ---------------------------------------------------------------------------

export interface PipelineInspectStage {
  id: string;
  label?: string;
  subSkillPath: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  helperPaths: string[];
  adapterModes: string[];
  externalDependencies: string[];
}

export interface PipelineInspectProjection {
  kitRoot: string;
  manifestPath: string;
  exists: boolean;
  kitId: string | null;
  pipelineId: string | null;
  manifestVersion: number | null;
  stageCount: number;
  stages: PipelineInspectStage[];
  outputTopology: { root: string; buckets: string[] } | null;
  issues: PipelineManifestIssue[];
  /** Highest-severity issue: `pass`, `warn`, or `error`. */
  status: "pass" | "warn" | "error";
}

function statusFromIssues(issues: PipelineManifestIssue[]): "pass" | "warn" | "error" {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warn")) return "warn";
  return "pass";
}

function asStringArrayLoose(
  value: PipelineStageRef["inputArtifacts"] | PipelineStageRef["adapterModes"] | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        if ("path" in entry && typeof entry.path === "string") return entry.path;
        if ("id" in entry && typeof entry.id === "string") return entry.id;
      }
      return null;
    })
    .filter((s): s is string => s !== null);
}

export function inspectPipelineManifest(kitRoot: string): PipelineInspectProjection {
  const result = readPipelineManifest(kitRoot);
  const stages: PipelineInspectStage[] = (result.manifest?.stages ?? []).map((stage) => ({
    id: stage.id,
    label: stage.label,
    subSkillPath: stage.subSkillPath,
    inputArtifacts: asStringArrayLoose(stage.inputArtifacts),
    outputArtifacts: asStringArrayLoose(stage.outputArtifacts),
    helperPaths: stage.helperPaths ?? [],
    adapterModes: asStringArrayLoose(stage.adapterModes),
    externalDependencies: stage.externalDependencies ?? [],
  }));

  return {
    kitRoot,
    manifestPath: result.manifestPath,
    exists: result.exists,
    kitId: result.manifest?.kitId ?? null,
    pipelineId: result.manifest?.pipelineId ?? null,
    manifestVersion: result.manifest?.version ?? null,
    stageCount: stages.length,
    stages,
    outputTopology: result.manifest?.outputTopology
      ? {
          root: result.manifest.outputTopology.root,
          buckets: result.manifest.outputTopology.buckets ?? [],
        }
      : null,
    issues: result.issues,
    status: statusFromIssues(result.issues),
  };
}
