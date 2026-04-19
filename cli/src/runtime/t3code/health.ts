/**
 * T3 Code CLI — Health Check
 *
 * Binary detection, Node.js version gate, and API key presence check.
 */

import type { T3CodeEnvironmentStatus, T3CodeHealthResult } from "./contract.js";
import { detectT3Version } from "./provider.js";

export function detectEnvironment(
  binaryPath = "t3",
  runtimeEnv: Record<string, string> = {},
): T3CodeEnvironmentStatus {
  const osLabel = process.platform === "darwin" ? "macOS"
    : process.platform === "win32" ? "Windows"
    : "Linux";

  const versionInfo = detectT3Version(binaryPath);

  const nodeVersion = process.version.replace(/^v/, "");
  const nodeVersionSufficient = Number.parseInt(nodeVersion.split(".")[0], 10) >= 20;

  const mergedEnv = { ...runtimeEnv, ...process.env };
  const apiKeyConfigured = Boolean(
    mergedEnv.ANTHROPIC_API_KEY?.trim()
    || mergedEnv.OPENAI_API_KEY?.trim()
    || mergedEnv.GOOGLE_API_KEY?.trim(),
  );

  return {
    binaryFound: versionInfo.found,
    binaryVersion: versionInfo.version,
    binaryPath: versionInfo.resolvedPath,
    nodeVersionSufficient,
    nodeVersion,
    apiKeyConfigured,
    osLabel,
  };
}

export function checkHealth(
  binaryPath = "t3",
  runtimeEnv: Record<string, string> = {},
): T3CodeHealthResult {
  const environment = detectEnvironment(binaryPath, runtimeEnv);

  if (!environment.binaryFound) {
    return {
      status: "unavailable",
      environment,
      summary: `T3 Code CLI not found at "${binaryPath}". Install: npm install -g t3code`,
    };
  }
  if (!environment.nodeVersionSufficient) {
    return {
      status: "unavailable",
      environment,
      summary: `Node.js ${environment.nodeVersion} detected — T3 Code requires >= 20.0.0.`,
    };
  }
  if (!environment.apiKeyConfigured) {
    return {
      status: "degraded",
      environment,
      summary: `T3 Code CLI v${environment.binaryVersion} found — no API key configured. Set ANTHROPIC_API_KEY or another supported key.`,
    };
  }
  return {
    status: "available",
    environment,
    summary: `T3 Code CLI v${environment.binaryVersion} ready (Node ${environment.nodeVersion}).`,
  };
}

export function buildSetupGuidance(env: T3CodeEnvironmentStatus): string[] {
  const lines: string[] = [];

  lines.push(`OS       : ${env.osLabel}`);
  lines.push(`T3 CLI   : ${env.binaryFound ? `v${env.binaryVersion}` : "not found"}`);
  lines.push(`Node.js  : v${env.nodeVersion} (${env.nodeVersionSufficient ? "OK" : "needs >= 20"})`);
  lines.push(`API key  : ${env.apiKeyConfigured ? "configured" : "not configured"}`);
  lines.push("");

  if (!env.binaryFound) {
    lines.push("Install T3 Code:");
    lines.push("  npm install -g t3code");
    lines.push("  Source: https://github.com/pingdotgg/t3code");
    lines.push("");
  }

  if (!env.apiKeyConfigured) {
    lines.push("Configure an API key:");
    lines.push("  growthub t3code -> Configure -> Set API key");
    lines.push("  — or —");
    lines.push("  export ANTHROPIC_API_KEY=<your-key>");
    lines.push("");
  }

  return lines;
}
