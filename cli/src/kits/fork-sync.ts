/**
 * Kit Fork Sync Engine
 *
 * The core engine for detecting drift between a user's fork directory and the
 * latest bundled upstream kit, and for applying a safe non-destructive heal.
 *
 * Two primary exports:
 *   detectKitForkDrift(reg)          → KitForkDriftReport  (read-only)
 *   buildKitForkHealPlan(report)     → KitForkHealPlan     (read-only)
 *   applyKitForkHealPlan(plan, opts) → KitForkHealResult   (writes fork dir)
 *
 * Healing philosophy
 * ──────────────────
 *   • NEVER overwrite a user-modified file.
 *   • Add new upstream scaffold files the fork is missing.
 *   • Merge new upstream dependency additions into the fork's package.json
 *     (additive only — never removes or downgrades).
 *   • Patch only safe alignment fields in kit.json (schemaVersion,
 *     compatibility, activationModes).
 *   • Skip any file matching USER_PROTECTED_PATTERNS unconditionally.
 *   • Custom skills (CUSTOM_SKILL_PATTERNS) are detected and reported but
 *     never deleted or modified.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listBundledKits, inspectBundledKit } from "./service.js";
import type {
  KitForkRegistration,
  KitForkDriftReport,
  KitForkHealPlan,
  KitForkHealResult,
  KitFileDrift,
  KitPackageDrift,
  KitHealAction,
  KitHealActionResult,
  KitDriftSeverity,
  KitForkHealOptions,
} from "./fork-types.js";

// ---------------------------------------------------------------------------
// Upstream asset root resolution (mirrors logic in service.ts)
// ---------------------------------------------------------------------------

function resolveUpstreamAssetRoot(kitId: string): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../assets/worker-kits", kitId),
    path.resolve(moduleDir, "../assets/worker-kits", kitId),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Cannot locate bundled asset root for kit: ${kitId}`);
}

function readFileIfExists(p: string): string | null {
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

// ---------------------------------------------------------------------------
// File enumeration
// ---------------------------------------------------------------------------

function listRelativeFiles(rootDir: string): Set<string> {
  const files = new Set<string>();
  if (!fs.existsSync(rootDir)) return files;
  const walk = (cur: string) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      files.add(path.relative(rootDir, full).split(path.sep).join("/"));
    }
  };
  walk(rootDir);
  return files;
}

// ---------------------------------------------------------------------------
// Severity classification
// ---------------------------------------------------------------------------

const CRITICAL_PATHS = new Set(["kit.json", "package.json", ".env.example"]);
const WARNING_PATH_PATTERNS = [/^workers\//, /^bundles\//, /^QUICKSTART\.md$/];

function classifySeverity(rel: string, changeType: KitFileDrift["changeType"]): KitDriftSeverity {
  if (CRITICAL_PATHS.has(rel)) return "critical";
  if (changeType === "deleted") return "warning";
  if (WARNING_PATH_PATTERNS.some((rx) => rx.test(rel))) return "warning";
  return "info";
}

function maxSeverity(a: KitDriftSeverity, b: KitDriftSeverity): KitDriftSeverity {
  const order: KitDriftSeverity[] = ["none", "info", "warning", "critical"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Custom skill detection
// ---------------------------------------------------------------------------

const CUSTOM_SKILL_PATTERNS = [
  /^skills\//,
  /^custom-skills\//,
  /^custom\//,
  /^agents\/custom\//,
  /^workflows\/custom\//,
];

function detectCustomSkills(forkFiles: Set<string>, upstreamFiles: Set<string>): string[] {
  return [...forkFiles]
    .filter((f) => !upstreamFiles.has(f) && CUSTOM_SKILL_PATTERNS.some((rx) => rx.test(f)))
    .sort();
}

// ---------------------------------------------------------------------------
// Semver comparison (no external dep)
// ---------------------------------------------------------------------------

function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/, "").split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isStrictlyNewer(upstream: string, fork: string): boolean {
  const [ua, ub, uc] = parseSemver(upstream);
  const [fa, fb, fc] = parseSemver(fork);
  if (ua !== fa) return ua > fa;
  if (ub !== fb) return ub > fb;
  return uc > fc;
}

// ---------------------------------------------------------------------------
// Package.json drift detection
// ---------------------------------------------------------------------------

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function detectPackageDrift(upstreamPkg: PackageJson, forkPkg: PackageJson): KitPackageDrift[] {
  const drifts: KitPackageDrift[] = [];
  const allDeps = (pkg: PackageJson) => ({ ...pkg.dependencies, ...pkg.devDependencies }) as Record<string, string>;
  const upDeps = allDeps(upstreamPkg);
  const fkDeps = allDeps(forkPkg);

  for (const [name, upVer] of Object.entries(upDeps)) {
    const fkVer = fkDeps[name] ?? null;
    if (fkVer === null) {
      drifts.push({ packageName: name, forkVersion: null, upstreamVersion: upVer, changeType: "added" });
    } else if (fkVer !== upVer) {
      drifts.push({ packageName: name, forkVersion: fkVer, upstreamVersion: upVer, changeType: "updated" });
    }
  }
  return drifts;
}

// ---------------------------------------------------------------------------
// DETECT DRIFT
// ---------------------------------------------------------------------------

// Cache upstream file sets for the process lifetime (avoids repeated I/O)
const _upstreamFileCache = new Map<string, Set<string>>();

function getUpstreamFiles(kitId: string): Set<string> {
  const cached = _upstreamFileCache.get(kitId);
  if (cached) return cached;
  const root = resolveUpstreamAssetRoot(kitId);
  const files = listRelativeFiles(root);
  _upstreamFileCache.set(kitId, files);
  return files;
}

export function detectKitForkDrift(reg: KitForkRegistration): KitForkDriftReport {
  if (!fs.existsSync(reg.forkPath)) {
    throw new Error(`Fork path does not exist: ${reg.forkPath}`);
  }

  const allKits = listBundledKits();
  const upstreamKit = allKits.find((k) => k.id === reg.kitId);
  if (!upstreamKit) {
    throw new Error(`Kit '${reg.kitId}' not found in bundled catalog.`);
  }

  const upstreamVersion = upstreamKit.version;
  const forkVersion = reg.baseVersion;
  const hasUpstreamUpdate = isStrictlyNewer(upstreamVersion, forkVersion);

  const upstreamFiles = getUpstreamFiles(reg.kitId);
  const forkFiles = listRelativeFiles(reg.forkPath);
  const upstreamRoot = resolveUpstreamAssetRoot(reg.kitId);

  const fileDrifts: KitFileDrift[] = [];

  // Files in upstream but missing from fork
  for (const f of upstreamFiles) {
    if (!forkFiles.has(f)) {
      fileDrifts.push({
        relativePath: f,
        changeType: "added",
        severity: classifySeverity(f, "added"),
        description: `Present in upstream v${upstreamVersion} but missing from fork`,
      });
    }
  }

  // Fork-only scaffold paths (user deleted something or upstream removed it)
  const scaffoldPatterns = [/^kit\.json$/, /^bundles\//, /^workers\//];
  for (const f of forkFiles) {
    if (!upstreamFiles.has(f) && scaffoldPatterns.some((rx) => rx.test(f))) {
      fileDrifts.push({
        relativePath: f,
        changeType: "deleted",
        severity: "warning",
        description: `Upstream no longer ships this scaffold path at v${upstreamVersion}`,
      });
    }
  }

  // Content drift on audited manifest/config files
  const AUDIT_PATHS = ["kit.json", "package.json", ".env.example", "QUICKSTART.md"];
  for (const rel of AUDIT_PATHS) {
    if (upstreamFiles.has(rel) && forkFiles.has(rel)) {
      const upContent = readFileIfExists(path.resolve(upstreamRoot, rel));
      const fkContent = readFileIfExists(path.resolve(reg.forkPath, rel));
      if (upContent !== null && fkContent !== null && upContent !== fkContent) {
        fileDrifts.push({
          relativePath: rel,
          changeType: "modified",
          severity: classifySeverity(rel, "modified"),
          description: `Content differs from upstream v${upstreamVersion}`,
        });
      }
    }
  }

  // Package drift
  let packageDrifts: KitPackageDrift[] = [];
  const upPkgPath = path.resolve(upstreamRoot, "package.json");
  const fkPkgPath = path.resolve(reg.forkPath, "package.json");
  if (fs.existsSync(upPkgPath) && fs.existsSync(fkPkgPath)) {
    try {
      const upPkg = JSON.parse(fs.readFileSync(upPkgPath, "utf8")) as PackageJson;
      const fkPkg = JSON.parse(fs.readFileSync(fkPkgPath, "utf8")) as PackageJson;
      packageDrifts = detectPackageDrift(upPkg, fkPkg);
    } catch { /* non-fatal */ }
  }

  const customSkillsDetected = detectCustomSkills(forkFiles, upstreamFiles);

  let overallSeverity: KitDriftSeverity = "none";
  for (const d of fileDrifts) overallSeverity = maxSeverity(overallSeverity, d.severity);
  if (packageDrifts.length > 0 && overallSeverity === "none") overallSeverity = "info";

  return {
    forkId: reg.forkId,
    kitId: reg.kitId,
    forkVersion,
    upstreamVersion,
    hasUpstreamUpdate,
    overallSeverity,
    fileDrifts,
    packageDrifts,
    customSkillsDetected,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// BUILD HEAL PLAN
// ---------------------------------------------------------------------------

const USER_PROTECTED_PATTERNS = [
  /^skills\//,
  /^custom-skills\//,
  /^custom\//,
  /^\.env$/,
  /^\.env\.local$/,
];

function isUserProtected(rel: string): boolean {
  return USER_PROTECTED_PATTERNS.some((rx) => rx.test(rel));
}

export function buildKitForkHealPlan(report: KitForkDriftReport): KitForkHealPlan {
  const actions: KitHealAction[] = [];
  const preservedPaths: string[] = [];

  const severityOrder: KitDriftSeverity[] = ["none", "info", "warning", "critical"];
  let estimatedRisk: KitDriftSeverity = "none";
  const raiseTo = (s: KitDriftSeverity) => {
    if (severityOrder.indexOf(s) > severityOrder.indexOf(estimatedRisk)) estimatedRisk = s;
  };

  for (const drift of report.fileDrifts) {
    if (drift.changeType === "added") {
      if (isUserProtected(drift.relativePath)) {
        preservedPaths.push(drift.relativePath);
        continue;
      }
      actions.push({
        actionType: "add_file",
        targetPath: drift.relativePath,
        description: `Add new upstream scaffold: ${drift.relativePath}`,
        safe: true,
        payload: { source: "upstream" },
      });
      raiseTo("info");
      continue;
    }

    if (drift.changeType === "modified") {
      if (drift.relativePath === "package.json") {
        actions.push({
          actionType: "update_package_json_deps",
          targetPath: "package.json",
          description: "Merge upstream dependency additions into fork package.json",
          safe: true,
          payload: { strategy: "merge_add_only" },
        });
        raiseTo("info");
      } else if (drift.relativePath === "kit.json") {
        actions.push({
          actionType: "patch_manifest",
          targetPath: "kit.json",
          description: "Align kit.json schema fields from upstream",
          safe: true,
          payload: { fields: ["schemaVersion", "compatibility", "activationModes"] },
        });
        raiseTo("info");
      } else {
        preservedPaths.push(drift.relativePath);
        actions.push({
          actionType: "skip_user_modified",
          targetPath: drift.relativePath,
          description: `Preserve user-modified file: ${drift.relativePath}`,
          safe: true,
        });
      }
      continue;
    }

    if (drift.changeType === "deleted") {
      preservedPaths.push(drift.relativePath);
      raiseTo("warning");
    }
  }

  // Add package dep action if not already added via file drift path
  const hasPkgAction = actions.some((a) => a.actionType === "update_package_json_deps");
  if (report.packageDrifts.length > 0 && !hasPkgAction) {
    actions.push({
      actionType: "update_package_json_deps",
      targetPath: "package.json",
      description: `Merge ${report.packageDrifts.length} upstream dep change(s) into fork package.json`,
      safe: true,
      payload: { strategy: "merge_add_only" },
    });
    raiseTo("info");
  }

  // Record custom skills (no mutation needed — just note them in the plan)
  for (const skill of report.customSkillsDetected) {
    actions.push({
      actionType: "add_custom_skill",
      targetPath: skill,
      description: `Custom skill detected (preserved, no changes): ${skill}`,
      safe: true,
    });
  }

  return {
    forkId: report.forkId,
    kitId: report.kitId,
    fromVersion: report.forkVersion,
    toVersion: report.upstreamVersion,
    actions,
    preservedPaths,
    estimatedRisk,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// APPLY HEAL PLAN
// ---------------------------------------------------------------------------

export function applyKitForkHealPlan(
  plan: KitForkHealPlan,
  opts: KitForkHealOptions & { registration: KitForkRegistration },
): KitForkHealResult {
  const { dryRun = false, skipFiles = [], onProgress, registration } = opts;
  const forkPath = registration.forkPath;
  const actionResults: KitHealActionResult[] = [];
  let appliedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const action of plan.actions) {
    const dryTag = dryRun ? "[dry-run] " : "";
    onProgress?.(`${dryTag}${action.description}`);

    if (skipFiles.includes(action.targetPath)) {
      actionResults.push({ action, status: "skipped", detail: "In explicit skip list" });
      skippedCount++;
      continue;
    }

    if (dryRun) {
      actionResults.push({ action, status: "skipped", detail: "Dry run — no files written" });
      skippedCount++;
      continue;
    }

    let result: KitHealActionResult;
    try {
      result = executeHealAction(action, forkPath, plan.kitId, plan.toVersion);
    } catch (err) {
      result = { action, status: "error", detail: err instanceof Error ? err.message : String(err) };
    }

    actionResults.push(result);
    if (result.status === "applied") appliedCount++;
    else if (result.status === "skipped") skippedCount++;
    else errorCount++;
  }

  let updatedRegistration: KitForkRegistration | undefined;
  if (!dryRun && errorCount === 0) {
    updatedRegistration = {
      ...registration,
      baseVersion: plan.toVersion,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  return {
    forkId: plan.forkId,
    kitId: plan.kitId,
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    actionResults,
    appliedCount,
    skippedCount,
    errorCount,
    completedAt: new Date().toISOString(),
    updatedRegistration,
  };
}

// ---------------------------------------------------------------------------
// Individual action executors
// ---------------------------------------------------------------------------

function executeHealAction(
  action: KitHealAction,
  forkPath: string,
  kitId: string,
  _toVersion: string,
): KitHealActionResult {
  switch (action.actionType) {
    case "add_file":            return execAddFile(action, forkPath, kitId);
    case "update_package_json_deps": return execUpdatePackageDeps(action, forkPath, kitId);
    case "patch_manifest":      return execPatchManifest(action, forkPath, kitId);
    case "add_custom_skill":    return { action, status: "skipped", detail: "Custom skill preserved — no upstream changes needed" };
    case "skip_user_modified":  return { action, status: "skipped", detail: "User-modified file preserved" };
    default:                    return { action, status: "skipped", detail: "Unknown action type — skipped for safety" };
  }
}

function execAddFile(action: KitHealAction, forkPath: string, kitId: string): KitHealActionResult {
  const targetFull = path.resolve(forkPath, action.targetPath);
  if (fs.existsSync(targetFull)) {
    return { action, status: "skipped", detail: "File already exists in fork" };
  }

  const upstreamRoot = resolveUpstreamAssetRoot(kitId);
  const upstreamFull = path.resolve(upstreamRoot, action.targetPath);
  if (!fs.existsSync(upstreamFull)) {
    return { action, status: "skipped", detail: "Upstream file not found — skipped" };
  }

  const content = readFileIfExists(upstreamFull);
  if (content === null) {
    return { action, status: "skipped", detail: "Could not read upstream file (binary?) — skipped" };
  }

  fs.mkdirSync(path.dirname(targetFull), { recursive: true });
  fs.writeFileSync(targetFull, content, "utf8");
  return { action, status: "applied", detail: `Added ${action.targetPath}` };
}

function execUpdatePackageDeps(action: KitHealAction, forkPath: string, kitId: string): KitHealActionResult {
  const forkPkgPath = path.resolve(forkPath, "package.json");
  if (!fs.existsSync(forkPkgPath)) {
    return { action, status: "skipped", detail: "No package.json in fork" };
  }

  const upstreamRoot = resolveUpstreamAssetRoot(kitId);
  const upstreamPkgPath = path.resolve(upstreamRoot, "package.json");
  if (!fs.existsSync(upstreamPkgPath)) {
    return { action, status: "skipped", detail: "No package.json in upstream kit" };
  }

  let forkPkg: Record<string, unknown>;
  let upstreamPkg: Record<string, unknown>;
  try {
    forkPkg = JSON.parse(fs.readFileSync(forkPkgPath, "utf8")) as Record<string, unknown>;
    upstreamPkg = JSON.parse(fs.readFileSync(upstreamPkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    return { action, status: "error", detail: "Failed to parse package.json" };
  }

  const mergedDeps = mergeAddOnlyDeps(
    forkPkg.dependencies as Record<string, string> | undefined,
    upstreamPkg.dependencies as Record<string, string> | undefined,
  );
  const mergedDevDeps = mergeAddOnlyDeps(
    forkPkg.devDependencies as Record<string, string> | undefined,
    upstreamPkg.devDependencies as Record<string, string> | undefined,
  );

  if (!mergedDeps && !mergedDevDeps) {
    return { action, status: "skipped", detail: "No new upstream dependencies to add" };
  }

  const updated = { ...forkPkg };
  if (mergedDeps) updated.dependencies = mergedDeps;
  if (mergedDevDeps) updated.devDependencies = mergedDevDeps;

  fs.writeFileSync(forkPkgPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  return { action, status: "applied", detail: "Merged upstream dependency additions" };
}

function mergeAddOnlyDeps(
  fork: Record<string, string> | undefined,
  upstream: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!upstream) return null;
  const merged = { ...(fork ?? {}) };
  let changed = false;
  for (const [name, ver] of Object.entries(upstream)) {
    if (!(name in merged)) {
      merged[name] = ver;
      changed = true;
    }
  }
  return changed ? merged : null;
}

function execPatchManifest(action: KitHealAction, forkPath: string, kitId: string): KitHealActionResult {
  const forkManifestPath = path.resolve(forkPath, "kit.json");
  if (!fs.existsSync(forkManifestPath)) {
    return { action, status: "skipped", detail: "No kit.json in fork" };
  }

  const upstreamRoot = resolveUpstreamAssetRoot(kitId);
  const upstreamManifestPath = path.resolve(upstreamRoot, "kit.json");
  if (!fs.existsSync(upstreamManifestPath)) {
    return { action, status: "skipped", detail: "No kit.json in upstream kit" };
  }

  let forkManifest: Record<string, unknown>;
  let upstreamManifest: Record<string, unknown>;
  try {
    forkManifest = JSON.parse(fs.readFileSync(forkManifestPath, "utf8")) as Record<string, unknown>;
    upstreamManifest = JSON.parse(fs.readFileSync(upstreamManifestPath, "utf8")) as Record<string, unknown>;
  } catch {
    return { action, status: "error", detail: "Failed to parse kit.json" };
  }

  const fields = (action.payload?.fields as string[] | undefined) ?? ["schemaVersion", "compatibility"];
  const updated = { ...forkManifest };
  const patched: string[] = [];

  for (const field of fields) {
    if (field in upstreamManifest && JSON.stringify(upstreamManifest[field]) !== JSON.stringify(forkManifest[field])) {
      updated[field] = upstreamManifest[field];
      patched.push(field);
    }
  }

  if (patched.length === 0) {
    return { action, status: "skipped", detail: "kit.json alignment fields already match" };
  }

  fs.writeFileSync(forkManifestPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  return { action, status: "applied", detail: `Patched kit.json fields: ${patched.join(", ")}` };
}
