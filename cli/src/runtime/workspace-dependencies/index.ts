/**
 * Workspace Dependencies — runtime reader
 *
 * Phase 3 primitive. Reads a kit's `workspace.dependencies.json` from
 * disk and projects it onto the public `WorkspaceDependencyManifest`
 * type from `@growthub/api-contract/workspaces`.
 *
 * Convention: `docs/PIPELINE_KIT_CONTRACT_V1.md` § external dependency
 * contract.
 *
 * The reader returns `null` for kits without a workspace manifest;
 * malformed manifests yield an empty manifest plus `issues[]`.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  WorkspaceDependencyManifest,
  WorkspaceDependencyRef,
} from "@growthub/api-contract/workspaces";
import { WORKSPACE_DEPENDENCY_MANIFEST_VERSION } from "@growthub/api-contract/workspaces";

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export const WORKSPACE_DEPENDENCIES_FILENAME = "workspace.dependencies.json";

export function resolveWorkspaceDependenciesPath(kitRoot: string): string {
  return path.resolve(kitRoot, WORKSPACE_DEPENDENCIES_FILENAME);
}

export function workspaceDependenciesExists(kitRoot: string): boolean {
  return fs.existsSync(resolveWorkspaceDependenciesPath(kitRoot));
}

// ---------------------------------------------------------------------------
// Issue shape
// ---------------------------------------------------------------------------

export interface WorkspaceDependenciesIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  field?: string;
}

export interface WorkspaceDependenciesReadResult {
  manifestPath: string;
  exists: boolean;
  manifest: WorkspaceDependencyManifest | null;
  issues: WorkspaceDependenciesIssue[];
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

function parseDependency(
  raw: unknown,
  index: number,
  issues: WorkspaceDependenciesIssue[],
): WorkspaceDependencyRef | null {
  if (!isObject(raw)) {
    issues.push({
      severity: "error",
      code: "dep-not-object",
      message: `Dependency ${index} is not an object`,
      field: `dependencies[${index}]`,
    });
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id : null;
  const env = typeof raw.env === "string" ? raw.env : null;
  const kind = typeof raw.kind === "string" ? raw.kind : null;
  if (!id) {
    issues.push({
      severity: "error",
      code: "dep-missing-id",
      message: `Dependency ${index} is missing 'id'`,
      field: `dependencies[${index}].id`,
    });
    return null;
  }
  if (!env) {
    issues.push({
      severity: "error",
      code: "dep-missing-env",
      message: `Dependency '${id}' is missing 'env' (env-var locator)`,
      field: `dependencies[${index}].env`,
    });
    return null;
  }
  if (!kind) {
    issues.push({
      severity: "warn",
      code: "dep-missing-kind",
      message: `Dependency '${id}' is missing 'kind'`,
      field: `dependencies[${index}].kind`,
    });
  }
  const dep: WorkspaceDependencyRef = {
    id,
    env,
    kind: (kind as WorkspaceDependencyRef["kind"]) ?? "external-service",
  };
  if (typeof raw.setup === "string") dep.setup = raw.setup;
  if (typeof raw.install === "string") dep.install = raw.install;
  if (typeof raw.health === "string") dep.health = raw.health;
  if (Array.isArray(raw.usedByStages)) dep.usedByStages = asStringArray(raw.usedByStages);
  if (typeof raw.interfaceArtifact === "string") dep.interfaceArtifact = raw.interfaceArtifact;
  if (typeof raw.handoffArtifact === "string") dep.handoffArtifact = raw.handoffArtifact;
  if (typeof raw.description === "string") dep.description = raw.description;
  return dep;
}

export function readWorkspaceDependencies(kitRoot: string): WorkspaceDependenciesReadResult {
  const manifestPath = resolveWorkspaceDependenciesPath(kitRoot);
  const exists = fs.existsSync(manifestPath);
  const issues: WorkspaceDependenciesIssue[] = [];

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

  if (version !== WORKSPACE_DEPENDENCY_MANIFEST_VERSION) {
    issues.push({
      severity: version === null ? "error" : "warn",
      code: "manifest-version-mismatch",
      message:
        version === null
          ? "Manifest is missing 'version'"
          : `Manifest version ${version} does not match SDK WORKSPACE_DEPENDENCY_MANIFEST_VERSION ${WORKSPACE_DEPENDENCY_MANIFEST_VERSION}`,
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

  const dependenciesRaw = Array.isArray(raw.dependencies) ? raw.dependencies : [];
  const dependencies: WorkspaceDependencyRef[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < dependenciesRaw.length; i += 1) {
    const dep = parseDependency(dependenciesRaw[i], i, issues);
    if (!dep) continue;
    if (seenIds.has(dep.id)) {
      issues.push({
        severity: "error",
        code: "dep-duplicate-id",
        message: `Duplicate dependency id '${dep.id}'`,
        field: `dependencies[${i}].id`,
      });
      continue;
    }
    seenIds.add(dep.id);
    dependencies.push(dep);
  }

  if (!kitId) {
    return { manifestPath, exists: true, manifest: null, issues };
  }

  const manifest: WorkspaceDependencyManifest = {
    version: version ?? WORKSPACE_DEPENDENCY_MANIFEST_VERSION,
    kitId,
    dependencies,
  };

  return { manifestPath, exists: true, manifest, issues };
}

// ---------------------------------------------------------------------------
// Inspect projection
// ---------------------------------------------------------------------------

export interface WorkspaceDependenciesInspect {
  kitRoot: string;
  manifestPath: string;
  exists: boolean;
  kitId: string | null;
  manifestVersion: number | null;
  dependencyCount: number;
  dependencies: WorkspaceDependencyRef[];
  issues: WorkspaceDependenciesIssue[];
  status: "pass" | "warn" | "error";
}

function statusFromIssues(
  issues: WorkspaceDependenciesIssue[],
): "pass" | "warn" | "error" {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warn")) return "warn";
  return "pass";
}

export function inspectWorkspaceDependencies(kitRoot: string): WorkspaceDependenciesInspect {
  const result = readWorkspaceDependencies(kitRoot);
  return {
    kitRoot,
    manifestPath: result.manifestPath,
    exists: result.exists,
    kitId: result.manifest?.kitId ?? null,
    manifestVersion: result.manifest?.version ?? null,
    dependencyCount: result.manifest?.dependencies.length ?? 0,
    dependencies: result.manifest?.dependencies ?? [],
    issues: result.issues,
    status: statusFromIssues(result.issues),
  };
}
