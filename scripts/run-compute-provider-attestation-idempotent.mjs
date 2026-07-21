#!/usr/bin/env node
/**
 * Exact-head wrapper for provider artifact attestation integration.
 * Captures the precise post-data-plane anchor failure once, without committing
 * any partially-mutated production files. Bot diagnostic commits do not
 * recurse because the one-shot workflow excludes github-actions[bot].
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicatorPath = path.join(root, "scripts/apply-compute-provider-attestation.mjs");
const diagnosticPath = path.join(root, "scripts/provider-attestation-failure.txt");

try {
  await import(`${pathToFileURL(applicatorPath).href}?exactHead=${Date.now()}`);
  fs.rmSync(diagnosticPath, { force: true });
} catch (error) {
  const detail = String(error?.stack || error?.message || error);
  fs.writeFileSync(diagnosticPath, `${detail}\n`, "utf8");
  console.error(detail);
  if (process.env.GITHUB_ACTIONS === "true") {
    try {
      execFileSync("git", ["config", "user.name", "github-actions[bot]"], { cwd: root, stdio: "inherit" });
      execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: root, stdio: "inherit" });
      execFileSync("git", ["add", "scripts/provider-attestation-failure.txt"], { cwd: root, stdio: "inherit" });
      execFileSync("git", ["commit", "-m", "ci(compute): capture provider attestation failure"], { cwd: root, stdio: "inherit" });
      execFileSync("git", ["push", "origin", "HEAD:claude/compute-authority-evidence-pr296-0u5msd"], { cwd: root, stdio: "inherit" });
    } catch (diagnosticError) {
      console.error(`[provider-attestation-diagnostic] failed to publish diagnostic: ${diagnosticError?.message || diagnosticError}`);
    }
  }
  throw error;
}
