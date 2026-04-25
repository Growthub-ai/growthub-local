/**
 * Kit Health — runtime composer
 *
 * Phase 3 primitive. Computes a `KitHealthReport` (typed by
 * `@growthub/api-contract/health`) for a kit on disk.
 *
 * Composes the v1 readers:
 *   - pipeline manifest validation   (./pipeline-kits)
 *   - workspace dependencies parse   (./workspace-dependencies)
 * plus on-disk presence checks for the six governed-workspace primitives.
 *
 * Optionally invokes a kit-local `helpers/check-pipeline-health.sh
 * --json` if it exists, and merges its output into the report. This
 * preserves backwards compatibility — kits that pre-date the v1
 * contract continue to score correctly; kits that ship the v1 health
 * helper get richer evidence.
 *
 * No CLI runtime decisions are made here. Consumers (the CLI command,
 * agents, hosted activation) decide what to do with the report.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type {
  KitHealthCheck,
  KitHealthReport,
  KitHealthSeverity,
} from "@growthub/api-contract/health";
import { KIT_HEALTH_REPORT_VERSION } from "@growthub/api-contract/health";

import { readPipelineManifest } from "../pipeline-kits/index.js";
import { readWorkspaceDependencies } from "../workspace-dependencies/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function readKitId(kitRoot: string): string | null {
  const kitJsonPath = path.resolve(kitRoot, "kit.json");
  if (!isFile(kitJsonPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(kitJsonPath, "utf8")) as {
      kit?: { id?: unknown };
    };
    return typeof parsed.kit?.id === "string" ? parsed.kit.id : null;
  } catch {
    return null;
  }
}

function severityRank(severity: KitHealthSeverity): number {
  switch (severity) {
    case "fail": return 3;
    case "warn": return 2;
    case "info": return 1;
    case "pass": return 0;
  }
}

function rankSeverity(checks: KitHealthCheck[]): KitHealthSeverity {
  let worst: KitHealthSeverity = "pass";
  for (const c of checks) {
    if (severityRank(c.severity) > severityRank(worst)) worst = c.severity;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Individual check builders
// ---------------------------------------------------------------------------

function check(
  id: string,
  severity: KitHealthSeverity,
  label: string,
  options: { message?: string; remediation?: string; category?: string; stageId?: string; evidence?: Record<string, unknown> } = {},
): KitHealthCheck {
  const out: KitHealthCheck = { id, severity, label };
  if (options.message !== undefined) out.message = options.message;
  if (options.remediation !== undefined) out.remediation = options.remediation;
  if (options.category !== undefined) out.category = options.category;
  if (options.stageId !== undefined) out.stageId = options.stageId;
  if (options.evidence !== undefined) out.evidence = options.evidence;
  return out;
}

// ---------------------------------------------------------------------------
// Optional kit-local helper invocation
// ---------------------------------------------------------------------------

interface LocalHealthHelperOutput {
  pass?: string[];
  warn?: string[];
  fail?: string[];
}

function runLocalHealthHelper(kitRoot: string): {
  ran: boolean;
  exitCode: number | null;
  parsed: LocalHealthHelperOutput | null;
  raw: string;
} {
  const helperPath = path.resolve(kitRoot, "helpers", "check-pipeline-health.sh");
  if (!isFile(helperPath)) return { ran: false, exitCode: null, parsed: null, raw: "" };
  try {
    const result = spawnSync("bash", [helperPath, "--json"], {
      cwd: kitRoot,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    const raw = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    let parsed: LocalHealthHelperOutput | null = null;
    try {
      const last = (result.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
      const value = JSON.parse(last) as Record<string, unknown>;
      parsed = {
        pass: Array.isArray(value.pass) ? (value.pass as unknown[]).filter((s): s is string => typeof s === "string") : [],
        warn: Array.isArray(value.warn) ? (value.warn as unknown[]).filter((s): s is string => typeof s === "string") : [],
        fail: Array.isArray(value.fail) ? (value.fail as unknown[]).filter((s): s is string => typeof s === "string") : [],
      };
    } catch {
      parsed = null;
    }
    return { ran: true, exitCode: result.status, parsed, raw };
  } catch {
    return { ran: false, exitCode: null, parsed: null, raw: "" };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComputeKitHealthOptions {
  /** When true, invoke `helpers/check-pipeline-health.sh --json` if present. Default: true. */
  runLocalHelper?: boolean;
}

/**
 * Compute a `KitHealthReport` for the kit at `kitRoot`. Always returns;
 * never throws. Severity reflects the worst issue found.
 */
export function computeKitHealthReport(
  kitRoot: string,
  options: ComputeKitHealthOptions = {},
): KitHealthReport {
  const checks: KitHealthCheck[] = [];

  // Resolve kit id from kit.json (or fall back to directory name).
  const kitIdFromManifest = readKitId(kitRoot);
  const kitId = kitIdFromManifest ?? path.basename(kitRoot);
  if (!kitIdFromManifest) {
    checks.push(check("kit-json-missing", "fail", "kit.json not readable", {
      message: `kit.json missing or unparsable at ${path.resolve(kitRoot, "kit.json")}`,
      category: "kit-manifest",
      remediation: "Confirm the path points to a Growthub worker kit root.",
    }));
  } else {
    checks.push(check("kit-json", "pass", "kit.json present and parseable", {
      category: "kit-manifest",
    }));
  }

  // Six governed-workspace primitives — presence checks.
  checks.push(
    check(
      "primitive-1-skill-md",
      isFile(path.resolve(kitRoot, "SKILL.md")) ? "pass" : "fail",
      "Top-level SKILL.md (primitive #1)",
      { category: "primitive", remediation: "Add SKILL.md with v1.2 frontmatter." },
    ),
    check(
      "primitive-3-project-template",
      isFile(path.resolve(kitRoot, "templates", "project.md")) ? "pass" : "warn",
      "templates/project.md (primitive #3)",
      { category: "primitive" },
    ),
    check(
      "primitive-4-self-eval",
      isFile(path.resolve(kitRoot, "templates", "self-eval.md")) ? "pass" : "warn",
      "templates/self-eval.md (primitive #4)",
      { category: "primitive" },
    ),
    check(
      "primitive-5-sub-skills",
      isDir(path.resolve(kitRoot, "skills")) ? "pass" : "info",
      "skills/ directory (primitive #5)",
      { category: "primitive" },
    ),
    check(
      "primitive-6-helpers",
      isDir(path.resolve(kitRoot, "helpers")) ? "pass" : "info",
      "helpers/ directory (primitive #6)",
      { category: "primitive" },
    ),
  );

  // Pipeline manifest validation
  const pipelineRead = readPipelineManifest(kitRoot);
  if (!pipelineRead.exists) {
    checks.push(
      check("pipeline-manifest", "info", "pipeline.manifest.json", {
        category: "pipeline",
        message: "Kit does not declare a pipeline.manifest.json (only required for multi-stage pipeline kits).",
      }),
    );
  } else if (!pipelineRead.manifest) {
    checks.push(
      check("pipeline-manifest", "fail", "pipeline.manifest.json", {
        category: "pipeline",
        message: pipelineRead.issues.find((i) => i.severity === "error")?.message ?? "Manifest could not be parsed.",
        evidence: { issues: pipelineRead.issues },
      }),
    );
  } else {
    const errs = pipelineRead.issues.filter((i) => i.severity === "error");
    const warns = pipelineRead.issues.filter((i) => i.severity === "warn");
    checks.push(
      check(
        "pipeline-manifest",
        errs.length > 0 ? "fail" : warns.length > 0 ? "warn" : "pass",
        "pipeline.manifest.json",
        {
          category: "pipeline",
          message:
            errs.length > 0
              ? errs.map((e) => e.message).join("; ")
              : warns.length > 0
                ? warns.map((w) => w.message).join("; ")
                : `${pipelineRead.manifest.stages.length} stages declared.`,
          evidence: { stageIds: pipelineRead.manifest.stages.map((s) => s.id) },
        },
      ),
    );

    // Per-stage sub-skill resolution
    for (const stage of pipelineRead.manifest.stages) {
      const subSkill = path.resolve(kitRoot, stage.subSkillPath);
      checks.push(
        check(
          `pipeline-stage-${stage.id}-subskill`,
          isFile(subSkill) ? "pass" : "fail",
          `Stage '${stage.id}' sub-skill exists`,
          {
            category: "pipeline",
            stageId: stage.id,
            message: isFile(subSkill) ? undefined : `Missing sub-skill at ${stage.subSkillPath}`,
          },
        ),
      );
    }
  }

  // Workspace dependencies validation
  const depsRead = readWorkspaceDependencies(kitRoot);
  if (!depsRead.exists) {
    checks.push(
      check("workspace-dependencies", "info", "workspace.dependencies.json", {
        category: "dependencies",
        message: "Kit does not declare workspace.dependencies.json (only required when external repos / forks are used).",
      }),
    );
  } else if (!depsRead.manifest) {
    checks.push(
      check("workspace-dependencies", "fail", "workspace.dependencies.json", {
        category: "dependencies",
        message: depsRead.issues.find((i) => i.severity === "error")?.message ?? "Manifest could not be parsed.",
        evidence: { issues: depsRead.issues },
      }),
    );
  } else {
    const errs = depsRead.issues.filter((i) => i.severity === "error");
    const warns = depsRead.issues.filter((i) => i.severity === "warn");
    checks.push(
      check(
        "workspace-dependencies",
        errs.length > 0 ? "fail" : warns.length > 0 ? "warn" : "pass",
        "workspace.dependencies.json",
        {
          category: "dependencies",
          message:
            errs.length > 0
              ? errs.map((e) => e.message).join("; ")
              : warns.length > 0
                ? warns.map((w) => w.message).join("; ")
                : `${depsRead.manifest.dependencies.length} dependencies declared.`,
          evidence: { dependencyIds: depsRead.manifest.dependencies.map((d) => d.id) },
        },
      ),
    );

    // Per-dependency env presence
    for (const dep of depsRead.manifest.dependencies) {
      const envValue = process.env[dep.env];
      const envPresent = typeof envValue === "string" && envValue.length > 0;
      checks.push(
        check(
          `dependency-${dep.id}-env`,
          envPresent ? "pass" : "warn",
          `Dependency '${dep.id}' env (${dep.env})`,
          {
            category: "dependencies",
            message: envPresent ? undefined : `Env var ${dep.env} is not set in the current shell.`,
            remediation: envPresent ? undefined : `export ${dep.env}=<path-or-value>`,
          },
        ),
      );
      if (envPresent && dep.kind === "git-fork") {
        const dirOk = isDir(envValue);
        checks.push(
          check(
            `dependency-${dep.id}-target`,
            dirOk ? "pass" : "fail",
            `Dependency '${dep.id}' target directory exists`,
            {
              category: "dependencies",
              message: dirOk ? undefined : `${dep.env}=${envValue} does not point to an existing directory.`,
              remediation: dep.setup ? `bash ${dep.setup}` : undefined,
            },
          ),
        );
      }
    }
  }

  // Optional kit-local helper for richer evidence
  if (options.runLocalHelper !== false) {
    const helper = runLocalHealthHelper(kitRoot);
    if (helper.ran) {
      checks.push(
        check(
          "kit-local-health-helper",
          helper.exitCode === 0 ? "pass" : "fail",
          "helpers/check-pipeline-health.sh",
          {
            category: "kit-helper",
            message:
              helper.exitCode === 0
                ? `Helper passed. ${helper.parsed?.pass?.length ?? 0} checks ok.`
                : `Helper exited ${helper.exitCode}. ${helper.parsed?.fail?.join(", ") ?? "see raw output"}`,
            evidence: helper.parsed
              ? {
                  pass: helper.parsed.pass,
                  warn: helper.parsed.warn,
                  fail: helper.parsed.fail,
                }
              : { rawTail: helper.raw.slice(-500) },
          },
        ),
      );
    }
  }

  const overall = rankSeverity(checks);

  return {
    version: KIT_HEALTH_REPORT_VERSION,
    kitId,
    generatedAt: new Date().toISOString(),
    overall,
    checks,
    convention: {
      spec: "docs/PIPELINE_KIT_CONTRACT_V1.md",
      version: 1,
      runtimeEnforcement: "none",
    },
  };
}
