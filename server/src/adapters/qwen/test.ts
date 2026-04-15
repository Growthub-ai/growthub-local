import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";
import {
  asString,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
} from "../utils.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

/**
 * Qwen Code adapter — environment test
 *
 * Verifies that the `qwen` binary is available and the working directory
 * is valid. Warns if no API key environment variable is detected.
 */
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const binaryPath = asString(config.binaryPath, "qwen");
  const cwd = asString(config.cwd, process.cwd());

  // Check binary availability
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  try {
    await ensureCommandResolvable(binaryPath, cwd, runtimeEnv);
    checks.push({
      code: "qwen_binary_found",
      level: "info",
      message: `Qwen Code binary is executable: ${binaryPath}`,
    });
  } catch (err) {
    checks.push({
      code: "qwen_binary_missing",
      level: "error",
      message: err instanceof Error ? err.message : "Qwen Code binary not found",
      hint: "Install Qwen Code: npm install -g @qwen-code/qwen-code@latest",
      detail: binaryPath,
    });
  }

  // Check working directory
  try {
    await ensureAbsoluteDirectory(cwd);
    checks.push({
      code: "qwen_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "qwen_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  // Check API key availability
  const hasApiKey = Boolean(
    runtimeEnv.DASHSCOPE_API_KEY
    || runtimeEnv.OPENAI_API_KEY
    || runtimeEnv.ANTHROPIC_API_KEY
    || runtimeEnv.GOOGLE_API_KEY
    || env.DASHSCOPE_API_KEY
    || env.OPENAI_API_KEY
    || env.ANTHROPIC_API_KEY
    || env.GOOGLE_API_KEY,
  );

  if (hasApiKey) {
    checks.push({
      code: "qwen_api_key_present",
      level: "info",
      message: "API key environment variable detected.",
    });
  } else {
    checks.push({
      code: "qwen_api_key_missing",
      level: "warn",
      message: "No API key detected. Set DASHSCOPE_API_KEY or another supported provider key.",
      hint: "export DASHSCOPE_API_KEY=<your-key>",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
