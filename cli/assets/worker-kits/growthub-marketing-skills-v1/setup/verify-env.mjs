#!/usr/bin/env node

/**
 * verify-env.mjs — Marketing Operator environment verification
 *
 * Checks that the kit structure is intact and all required files exist.
 * No network calls. No API key requirements.
 */

import fs from "node:fs";
import path from "node:path";

const kitRoot = process.cwd();

const REQUIRED_FILES = [
  "kit.json",
  "bundles/growthub-marketing-skills-v1.json",
  "skills.md",
  "output-standards.md",
  "runtime-assumptions.md",
  "workers/marketing-operator/CLAUDE.md",
  "brands/_template/product-marketing-context.md",
  "brands/growthub/product-marketing-context.md",
  "templates/cro-audit-brief.md",
  "templates/seo-audit-report.md",
  "templates/content-strategy-plan.md",
  "templates/email-sequence-plan.md",
  "templates/launch-checklist.md",
  "templates/competitor-analysis.md",
];

const REQUIRED_DIRS = [
  "templates",
  "examples",
  "docs",
  "output",
  "growthub-meta",
];

console.log("Marketing Operator — Environment Verification\n");
console.log(`Kit root: ${kitRoot}\n`);

let allGood = true;

// Check kit.json is valid JSON
try {
  const kitJson = JSON.parse(fs.readFileSync(path.join(kitRoot, "kit.json"), "utf-8"));
  console.log(`  kit.json: ${kitJson.kit?.id || "unknown"} v${kitJson.kit?.version || "?"}`);
} catch {
  console.log("  kit.json: MISSING or INVALID");
  allGood = false;
}

// Check required files
console.log("\nRequired files:");
for (const file of REQUIRED_FILES) {
  const exists = fs.existsSync(path.join(kitRoot, file));
  console.log(`  ${exists ? "OK" : "MISSING"} ${file}`);
  if (!exists) allGood = false;
}

// Check required directories
console.log("\nRequired directories:");
for (const dir of REQUIRED_DIRS) {
  const exists = fs.existsSync(path.join(kitRoot, dir));
  console.log(`  ${exists ? "OK" : "MISSING"} ${dir}/`);
  if (!exists) allGood = false;
}

// Check for client brand kits beyond the template
const brandsDir = path.join(kitRoot, "brands");
if (fs.existsSync(brandsDir)) {
  const brandDirs = fs.readdirSync(brandsDir).filter(
    (d) => d !== "_template" && fs.statSync(path.join(brandsDir, d)).isDirectory()
  );
  console.log(`\nClient brand kits: ${brandDirs.length} (${brandDirs.join(", ") || "none besides template"})`);
}

// Summary
console.log(`\n${allGood ? "All checks passed." : "Some checks failed. Review the output above."}`);
process.exit(allGood ? 0 : 1);
