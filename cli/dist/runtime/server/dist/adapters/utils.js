// Re-export everything from the shared adapter-utils/server-utils package.
// This file is kept as a convenience shim so existing in-tree
// imports (process/, http/, heartbeat.ts) don't need rewriting.
import { logger } from "../middleware/logger.js";
export { runningProcesses, MAX_CAPTURE_BYTES, MAX_EXCERPT_BYTES, parseObject, asString, asNumber, asBoolean, asStringArray, parseJson, appendWithCap, resolvePathValue, renderTemplate, redactEnvForLogs, buildPaperclipEnv, defaultPathForPlatform, ensurePathInEnv, ensureAbsoluteDirectory, ensureCommandResolvable, } from "@paperclipai/adapter-utils/server-utils";
// Re-export runChildProcess with the server's pino logger wired in.
import { runChildProcess as _runChildProcess } from "@paperclipai/adapter-utils/server-utils";
export async function runChildProcess(runId, command, args, opts) {
    return _runChildProcess(runId, command, args, {
        ...opts,
        onLogError: (err, id, msg) => logger.warn({ err, runId: id }, msg),
    });
}
//# sourceMappingURL=utils.js.map