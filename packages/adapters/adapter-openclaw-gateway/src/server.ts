/**
 * @paperclipai/adapter-openclaw-gateway/server — stub for open-source development.
 */
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  return { exitCode: 1, stdout: "", stderr: "adapter-openclaw-gateway stub: not implemented" };
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  return { status: "skip", checks: [{ label: "stub", level: "info", message: "stub adapter" }] };
}
