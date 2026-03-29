export { type RunProcessResult, runningProcesses, MAX_CAPTURE_BYTES, MAX_EXCERPT_BYTES, parseObject, asString, asNumber, asBoolean, asStringArray, parseJson, appendWithCap, resolvePathValue, renderTemplate, redactEnvForLogs, buildPaperclipEnv, defaultPathForPlatform, ensurePathInEnv, ensureAbsoluteDirectory, ensureCommandResolvable, } from "@paperclipai/adapter-utils/server-utils";
import type { RunProcessResult } from "@paperclipai/adapter-utils/server-utils";
export declare function runChildProcess(runId: string, command: string, args: string[], opts: {
    cwd: string;
    env: Record<string, string>;
    timeoutSec: number;
    graceSec: number;
    onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<RunProcessResult>;
//# sourceMappingURL=utils.d.ts.map