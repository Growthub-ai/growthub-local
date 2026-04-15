/**
 * Qwen Code CLI — Health Check
 *
 * Environment detection and health assessment for the Qwen Code CLI.
 * Checks binary availability, Node.js version, and API key configuration.
 */

import { spawnSync } from "node:child_process";
import type {
  QwenCodeEnvironmentStatus,
  QwenCodeHealthResult,
} from "./contract.js";
import { detectQwenVersion } from "./provider.js";

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export function detectEnvironment(binaryPath: string = "qwen"): QwenCodeEnvironmentStatus {
  const osLabel = process.platform === "darwin"
    ? "macOS"
    : process.platform === "win32"
      ? "Windows"
      : "Linux";

  // Check qwen binary
  const versionInfo = detectQwenVersion(binaryPath);

  // Check Node.js version (Qwen Code requires >= 20)
  const nodeVersion = process.version.replace(/^v/, "");
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0], 10);
  const nodeVersionSufficient = nodeMajor >= 20;

  // Check API key availability (Qwen Code supports multiple providers)
  const apiKeyConfigured = Boolean(
    process.env.DASHSCOPE_API_KEY?.trim()
    || process.env.OPENAI_API_KEY?.trim()
    || process.env.ANTHROPIC_API_KEY?.trim()
    || process.env.GOOGLE_API_KEY?.trim(),
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

// ---------------------------------------------------------------------------
// Health assessment
// ---------------------------------------------------------------------------

export function checkHealth(binaryPath: string = "qwen"): QwenCodeHealthResult {
  const environment = detectEnvironment(binaryPath);

  if (!environment.binaryFound) {
    return {
      status: "unavailable",
      environment,
      summary: `Qwen Code CLI not found at "${binaryPath}". Install with: npm install -g @qwen-code/qwen-code`,
    };
  }

  if (!environment.nodeVersionSufficient) {
    return {
      status: "unavailable",
      environment,
      summary: `Node.js ${environment.nodeVersion} detected but Qwen Code requires >= 20.0.0.`,
    };
  }

  if (!environment.apiKeyConfigured) {
    return {
      status: "degraded",
      environment,
      summary: `Qwen Code CLI v${environment.binaryVersion} found but no API key configured. Set DASHSCOPE_API_KEY or another supported provider key.`,
    };
  }

  return {
    status: "available",
    environment,
    summary: `Qwen Code CLI v${environment.binaryVersion} ready (Node ${environment.nodeVersion}).`,
  };
}

// ---------------------------------------------------------------------------
// Setup guidance
// ---------------------------------------------------------------------------

export function buildSetupGuidance(env: QwenCodeEnvironmentStatus): string[] {
  const lines: string[] = [];

  lines.push(`OS: ${env.osLabel}`);
  lines.push(`Qwen CLI: ${env.binaryFound ? `v${env.binaryVersion}` : "not found"}`);
  lines.push(`Node.js: v${env.nodeVersion} (${env.nodeVersionSufficient ? "OK" : "needs >= 20"})`);
  lines.push(`API key: ${env.apiKeyConfigured ? "configured" : "not configured"}`);
  lines.push("");

  if (!env.binaryFound) {
    if (env.osLabel === "macOS") {
      lines.push("Install Qwen Code (macOS):");
      lines.push("  brew install qwen-code");
      lines.push("  — or —");
      lines.push("  npm install -g @qwen-code/qwen-code@latest");
    } else if (env.osLabel === "Windows") {
      lines.push("Install Qwen Code (Windows):");
      lines.push("  npm install -g @qwen-code/qwen-code@latest");
    } else {
      lines.push("Install Qwen Code (Linux):");
      lines.push("  npm install -g @qwen-code/qwen-code@latest");
    }
    lines.push("");
  }

  if (!env.apiKeyConfigured) {
    lines.push("Configure an API key:");
    lines.push("  export DASHSCOPE_API_KEY=<your-dashscope-key>");
    lines.push("  — or —");
    lines.push("  export OPENAI_API_KEY=<your-openai-compatible-key>");
    lines.push("");
  }

  return lines;
}
