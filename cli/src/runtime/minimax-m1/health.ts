/**
 * MiniMax-M1 — Health Check
 *
 * Environment detection for the MiniMax-M1 primitive.
 * Probes the configured OpenAI-compatible endpoint and reports whether the
 * requested model id is being served.
 */

import type {
  MiniMaxM1Config,
  MiniMaxM1EnvironmentStatus,
  MiniMaxM1HealthResult,
} from "./contract.js";
import { DEFAULT_MINIMAX_M1_CONFIG } from "./contract.js";
import { detectVllmBinary, probeServer } from "./provider.js";

export async function detectEnvironment(
  configOverride?: Partial<MiniMaxM1Config>,
): Promise<MiniMaxM1EnvironmentStatus> {
  const config = { ...DEFAULT_MINIMAX_M1_CONFIG, ...configOverride };

  const osLabel = process.platform === "darwin"
    ? "macOS"
    : process.platform === "win32"
      ? "Windows"
      : "Linux";

  const probe = await probeServer(config.baseUrl, config.env);
  const mergedEnv = { ...config.env, ...process.env };
  const apiKeyConfigured = Boolean(
    mergedEnv.MINIMAX_API_KEY?.trim() || mergedEnv.OPENAI_API_KEY?.trim(),
  );

  return {
    serverReachable: probe.reachable,
    baseUrl: config.baseUrl,
    modelAvailable: probe.modelsReported.includes(config.model),
    modelsReported: probe.modelsReported,
    apiKeyConfigured,
    vllmBinaryFound: detectVllmBinary(),
    osLabel,
    lastError: probe.error,
  };
}

export async function checkHealth(
  configOverride?: Partial<MiniMaxM1Config>,
): Promise<MiniMaxM1HealthResult> {
  const config = { ...DEFAULT_MINIMAX_M1_CONFIG, ...configOverride };
  const environment = await detectEnvironment(config);

  if (!environment.serverReachable) {
    return {
      status: "unavailable",
      environment,
      summary: `MiniMax-M1 server unreachable at ${config.baseUrl}${environment.lastError ? ` (${environment.lastError})` : ""}.`,
    };
  }

  if (!environment.modelAvailable) {
    return {
      status: "degraded",
      environment,
      summary: `Server reachable at ${config.baseUrl} but model "${config.model}" is not in /v1/models. Served: ${environment.modelsReported.join(", ") || "(none)"}.`,
    };
  }

  return {
    status: "available",
    environment,
    summary: `MiniMax-M1 ready at ${config.baseUrl} (model: ${config.model}, variant: ${config.variant}).`,
  };
}

export function buildSetupGuidance(
  env: MiniMaxM1EnvironmentStatus,
  config: MiniMaxM1Config,
): string[] {
  const lines: string[] = [];

  lines.push(`OS: ${env.osLabel}`);
  lines.push(`Endpoint: ${env.baseUrl} (${env.serverReachable ? "reachable" : "unreachable"})`);
  lines.push(`Model: ${config.model} (${env.modelAvailable ? "available" : "not served"})`);
  lines.push(`Variant: ${config.variant}`);
  lines.push(`vLLM binary: ${env.vllmBinaryFound ? "found on PATH" : "not found on PATH"}`);
  lines.push(`API key: ${env.apiKeyConfigured ? "configured" : "not configured (ok for local unauth vLLM)"}`);
  lines.push("");

  if (!env.serverReachable) {
    lines.push("Start an OpenAI-compatible MiniMax-M1 server, for example:");
    lines.push("");
    lines.push(`  vllm serve ${config.model} \\`);
    lines.push(`    --tensor-parallel-size ${config.tensorParallel} \\`);
    lines.push(`    --port ${extractPortLabel(config.baseUrl)} \\`);
    lines.push(`    --max-model-len ${config.maxModelLen} \\`);
    lines.push("    --enable-auto-tool-choice \\");
    lines.push("    --tool-call-parser hermes");
    lines.push("");
    lines.push("Hardware: 8x H800/H20-class GPUs recommended for unquantised M1-80k.");
    lines.push("Quantised (AWQ/GPTQ) variants fit on smaller clusters — see docs/MINIMAX_M1_CLI_INTEGRATION.md.");
    lines.push("");
  } else if (!env.modelAvailable) {
    lines.push("Server is reachable but the requested model id is not loaded.");
    lines.push(`Configured model: ${config.model}`);
    lines.push(`Served: ${env.modelsReported.join(", ") || "(none)"}`);
    lines.push("Fix: reconfigure the server, or run `growthub minimax-m1` → Configure → Model id.");
    lines.push("");
  }

  if (!env.apiKeyConfigured) {
    lines.push("Optional: configure an API key for hosted endpoints:");
    lines.push("  (You can save this securely via: growthub minimax-m1 -> Configure)");
    lines.push("  export MINIMAX_API_KEY=<your-minimax-key>");
    lines.push("  — or —");
    lines.push("  export OPENAI_API_KEY=<openai-compatible-key>");
    lines.push("");
  }

  return lines;
}

function extractPortLabel(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return parsed.port || (parsed.protocol === "https:" ? "443" : "8000");
  } catch {
    return "8000";
  }
}
