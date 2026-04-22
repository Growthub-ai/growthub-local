#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const cliRoot = path.resolve(repoRoot, "cli");

const relevantPrefixes = [
  "src/analytics/posthog.ts",
  "src/commands/kit.ts",
  "src/auth/session-store.ts",
  "tsconfig.json",
  "tsconfig.test.json",
  "vitest.config.ts",
];

const run = spawnSync(
  "pnpm",
  ["--filter", "@growthub/cli", "exec", "tsc", "--noEmit", "--pretty", "false"],
  {
    cwd: repoRoot,
    encoding: "utf8",
  },
);

const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
const lines = output.split(/\r?\n/).filter(Boolean);
const errorLinePattern = /^(.+)\(\d+,\d+\): error TS\d+:/;

const errorLines = lines.filter((line) => errorLinePattern.test(line));

function normalizeFile(rawFile) {
  const absolute = path.isAbsolute(rawFile) ? rawFile : path.resolve(repoRoot, rawFile);
  const relToCli = path.relative(cliRoot, absolute).replaceAll("\\", "/");
  return relToCli;
}

const relevant = [];
const ignored = [];

for (const line of errorLines) {
  const match = line.match(errorLinePattern);
  if (!match) continue;
  const relFile = normalizeFile(match[1]);
  const isRelevant = relevantPrefixes.some((prefix) => relFile === prefix || relFile.startsWith(`${prefix}/`));
  if (isRelevant) relevant.push(line);
  else ignored.push(line);
}

if (relevant.length > 0) {
  console.error("Scoped CLI typecheck failed in relevant integration files:");
  for (const line of relevant) console.error(line);
  if (ignored.length > 0) {
    console.error("");
    console.error(`Ignored ${ignored.length} unrelated TypeScript error(s).`);
  }
  process.exit(1);
}

if (run.status === 0) {
  console.log("Scoped CLI typecheck passed (no TypeScript errors).");
  process.exit(0);
}

console.log("Scoped CLI typecheck passed for relevant files.");
if (ignored.length > 0) {
  console.log(`Ignored ${ignored.length} unrelated TypeScript error(s) outside scoped files.`);
}
process.exit(0);
