#!/usr/bin/env node
/**
 * scripts/score-worker-kits.mjs
 *
 * REPORT-ONLY scoring of every worker kit under cli/assets/worker-kits/.
 *
 * Scores each kit against the v1.2 governed-workspace primitives and the
 * v1 pipeline-kit convention (docs/PIPELINE_KIT_CONTRACT_V1.md). It does
 * NOT block CI. Promotion to a CI gate is deferred until at least one
 * full release cycle of report-only scoring confirms the dimensions are
 * stable across the kit family.
 *
 * Usage:
 *   node scripts/score-worker-kits.mjs            # human table
 *   node scripts/score-worker-kits.mjs --json     # JSON report on stdout
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const KITS_ROOT = path.join(ROOT, "cli", "assets", "worker-kits");
const JSON_MODE = process.argv.includes("--json");

function exists(p) {
  try {
    return fs.statSync(p).isFile() || fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function readTextSafe(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

/**
 * One scoring dimension. Returns:
 *   { id, label, applies, pass, evidence? }
 *
 * "applies: false" means the dimension does not apply to this kit type
 * (e.g. pipeline-only checks for non-pipeline kits). Those do not affect
 * the score.
 */
function scoreKit(kitRoot) {
  const kitId = path.basename(kitRoot);
  const manifest = readJsonSafe(path.join(kitRoot, "kit.json")) ?? {};
  const family = manifest.kit?.family ?? "unknown";
  const hasAppSurface = isDir(path.join(kitRoot, "apps"));
  const hasPipelineManifest = isFile(path.join(kitRoot, "pipeline.manifest.json"));
  const subSkillsDir = path.join(kitRoot, "skills");
  const subSkillCount = isDir(subSkillsDir)
    ? fs.readdirSync(subSkillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => isFile(path.join(subSkillsDir, entry.name, "SKILL.md")))
        .length
    : 0;
  const isComplexKit = subSkillCount >= 2 || hasAppSurface || hasPipelineManifest;

  const dims = [];

  // --- Six governed-workspace primitives (v1.2) ---
  dims.push({
    id: "primitive-1-skill-md",
    label: "Top-level SKILL.md (primitive #1)",
    applies: true,
    pass: isFile(path.join(kitRoot, "SKILL.md")),
  });
  dims.push({
    id: "primitive-2-agent-contract",
    label: "Agent contract pointer (primitive #2)",
    applies: true,
    pass: typeof manifest.agentContractPath === "string"
      && isFile(path.join(kitRoot, manifest.agentContractPath ?? "")),
  });
  dims.push({
    id: "primitive-3-project-template",
    label: "templates/project.md (primitive #3)",
    applies: true,
    pass: isFile(path.join(kitRoot, "templates", "project.md")),
  });
  dims.push({
    id: "primitive-4-self-eval",
    label: "templates/self-eval.md (primitive #4)",
    applies: true,
    pass: isFile(path.join(kitRoot, "templates", "self-eval.md")),
  });
  dims.push({
    id: "primitive-5-sub-skills",
    label: "skills/ with at least one sub-skill (primitive #5)",
    applies: isComplexKit,
    pass: subSkillCount >= 1,
    evidence: { subSkillCount },
  });
  dims.push({
    id: "primitive-6-helpers",
    label: "helpers/ with at least one shell helper (primitive #6)",
    applies: isComplexKit,
    pass: (() => {
      const helpersDir = path.join(kitRoot, "helpers");
      if (!isDir(helpersDir)) return false;
      // Source-tree helpers may not carry the executable bit; the export
      // step sets it. Presence + non-empty is sufficient for scoring.
      return fs.readdirSync(helpersDir)
        .filter((f) => f.endsWith(".sh"))
        .some((f) => {
          const full = path.join(helpersDir, f);
          try { return fs.statSync(full).size > 0; } catch { return false; }
        });
    })(),
  });

  // --- Standard kit hygiene ---
  dims.push({
    id: "env-example",
    label: ".env.example present",
    applies: true,
    pass: isFile(path.join(kitRoot, ".env.example")),
  });
  dims.push({
    id: "quickstart",
    label: "QUICKSTART.md present",
    applies: true,
    pass: isFile(path.join(kitRoot, "QUICKSTART.md")),
  });
  dims.push({
    id: "output-standards",
    label: "output-standards.md declares output topology",
    applies: true,
    pass: isFile(path.join(kitRoot, "output-standards.md")),
  });
  dims.push({
    id: "frozen-asset-paths",
    label: "kit.json declares frozenAssetPaths",
    applies: true,
    pass: Array.isArray(manifest.frozenAssetPaths) && manifest.frozenAssetPaths.length > 0,
  });

  // --- App-surface hygiene (only when apps/ exists) ---
  dims.push({
    id: "app-package-lock",
    label: "App surfaces have package-lock.json",
    applies: hasAppSurface,
    pass: (() => {
      if (!hasAppSurface) return true;
      const apps = fs.readdirSync(path.join(kitRoot, "apps"), { withFileTypes: true });
      return apps
        .filter((entry) => entry.isDirectory())
        .every((entry) => isFile(path.join(kitRoot, "apps", entry.name, "package-lock.json")));
    })(),
  });

  // --- Pipeline-kit convention v1 (docs/PIPELINE_KIT_CONTRACT_V1.md) ---
  dims.push({
    id: "pipeline-manifest",
    label: "pipeline.manifest.json present (pipeline kit convention v1)",
    applies: isComplexKit,
    pass: hasPipelineManifest,
  });
  dims.push({
    id: "workspace-dependencies",
    label: "workspace.dependencies.json present (when external repo deps exist)",
    applies: hasPipelineManifest,
    pass: isFile(path.join(kitRoot, "workspace.dependencies.json")),
  });
  dims.push({
    id: "adapter-contracts-doc",
    label: "docs/adapter-contracts.md (kit-local) present for app/pipeline kits",
    applies: hasAppSurface || hasPipelineManifest,
    pass: isFile(path.join(kitRoot, "docs", "adapter-contracts.md")),
  });
  dims.push({
    id: "health-helper",
    label: "helpers/check-pipeline-health.sh (or kit-equivalent) present for complex kits",
    applies: isComplexKit,
    pass: (() => {
      const candidates = [
        "check-pipeline-health.sh",
        "check-health.sh",
        "check-kit-health.sh",
      ];
      return candidates.some((f) => isFile(path.join(kitRoot, "helpers", f)));
    })(),
  });
  dims.push({
    id: "validation-e2e-reference",
    label: "validation/e2e-reference.md present for pipeline kits",
    applies: hasPipelineManifest,
    pass: isFile(path.join(kitRoot, "validation", "e2e-reference.md")),
  });

  const applicable = dims.filter((d) => d.applies);
  const passed = applicable.filter((d) => d.pass);
  const score = applicable.length === 0 ? 1 : passed.length / applicable.length;

  return {
    kitId,
    family,
    isComplexKit,
    hasAppSurface,
    hasPipelineManifest,
    subSkillCount,
    score: Number(score.toFixed(3)),
    passed: passed.length,
    applicable: applicable.length,
    dimensions: dims,
  };
}

const kitDirs = isDir(KITS_ROOT)
  ? fs.readdirSync(KITS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(KITS_ROOT, entry.name))
      .sort()
  : [];

const reports = kitDirs.map(scoreKit);

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({
    convention: "docs/PIPELINE_KIT_CONTRACT_V1.md",
    runtimeEnforcement: "none",
    generatedAt: new Date().toISOString(),
    kits: reports,
  }, null, 2) + "\n");
} else {
  console.log("Worker Kit Scorecard (REPORT-ONLY)");
  console.log("Convention: docs/PIPELINE_KIT_CONTRACT_V1.md");
  console.log("");
  const headers = ["Kit", "Family", "Complex", "Pass/App", "Score"];
  const rows = reports.map((r) => [
    r.kitId,
    r.family,
    r.isComplexKit ? "yes" : "no",
    `${r.passed}/${r.applicable}`,
    `${(r.score * 100).toFixed(0)}%`,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => String(row[i]).length))
  );
  const fmt = (cells) =>
    cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(fmt(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(fmt(row));
  console.log("");

  // Per-kit failures (applicable dimensions that did not pass).
  for (const r of reports) {
    const failed = r.dimensions.filter((d) => d.applies && !d.pass);
    if (failed.length === 0) continue;
    console.log(`${r.kitId}:`);
    for (const dim of failed) {
      console.log(`  - ${dim.id} — ${dim.label}`);
    }
  }
}

process.exit(0);
