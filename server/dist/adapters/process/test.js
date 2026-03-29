import { asString, parseObject, ensureAbsoluteDirectory, ensureCommandResolvable, ensurePathInEnv, } from "../utils.js";
function summarizeStatus(checks) {
    if (checks.some((check) => check.level === "error"))
        return "fail";
    if (checks.some((check) => check.level === "warn"))
        return "warn";
    return "pass";
}
export async function testEnvironment(ctx) {
    const checks = [];
    const config = parseObject(ctx.config);
    const command = asString(config.command, "");
    const cwd = asString(config.cwd, process.cwd());
    if (!command) {
        checks.push({
            code: "process_command_missing",
            level: "error",
            message: "Process adapter requires a command.",
            hint: "Set adapterConfig.command to an executable command.",
        });
    }
    else {
        checks.push({
            code: "process_command_present",
            level: "info",
            message: `Configured command: ${command}`,
        });
    }
    try {
        await ensureAbsoluteDirectory(cwd);
        checks.push({
            code: "process_cwd_valid",
            level: "info",
            message: `Working directory is valid: ${cwd}`,
        });
    }
    catch (err) {
        checks.push({
            code: "process_cwd_invalid",
            level: "error",
            message: err instanceof Error ? err.message : "Invalid working directory",
            detail: cwd,
        });
    }
    if (command) {
        const envConfig = parseObject(config.env);
        const env = {};
        for (const [key, value] of Object.entries(envConfig)) {
            if (typeof value === "string")
                env[key] = value;
        }
        const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
        try {
            await ensureCommandResolvable(command, cwd, runtimeEnv);
            checks.push({
                code: "process_command_resolvable",
                level: "info",
                message: `Command is executable: ${command}`,
            });
        }
        catch (err) {
            checks.push({
                code: "process_command_unresolvable",
                level: "error",
                message: err instanceof Error ? err.message : "Command is not executable",
                detail: command,
            });
        }
    }
    return {
        adapterType: ctx.adapterType,
        status: summarizeStatus(checks),
        checks,
        testedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=test.js.map