/**
 * @paperclipai/adapter-cursor-local/server — stub for open-source development.
 */
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterSessionCodec,
} from "@paperclipai/adapter-utils";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  return { exitCode: 1, stdout: "", stderr: "adapter-cursor-local stub: not implemented" };
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  return { status: "skip", checks: [{ label: "stub", level: "info", message: "stub adapter" }] };
}

export const sessionCodec: AdapterSessionCodec = {
  encode: (data) => JSON.stringify(data),
  decode: (raw) => JSON.parse(raw),
  isEmpty: (data) => data == null,
};

export async function ensureCursorSkillsInjected(_cwd: string): Promise<void> {}

export function isCursorUnknownSessionError(_err: unknown): boolean {
  return false;
}

export function parseCursorJsonl(_line: string): unknown {
  return null;
}
