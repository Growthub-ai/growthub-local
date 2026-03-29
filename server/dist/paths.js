import fs from "node:fs";
import path from "node:path";
import { resolveDefaultConfigPath } from "./home-paths.js";
const PAPERCLIP_CONFIG_BASENAME = "config.json";
const PAPERCLIP_ENV_FILENAME = ".env";
function findConfigFileFromAncestors(startDir) {
    const absoluteStartDir = path.resolve(startDir);
    let currentDir = absoluteStartDir;
    while (true) {
        const candidate = path.resolve(currentDir, ".paperclip", PAPERCLIP_CONFIG_BASENAME);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const nextDir = path.resolve(currentDir, "..");
        if (nextDir === currentDir)
            break;
        currentDir = nextDir;
    }
    return null;
}
export function resolvePaperclipConfigPath(overridePath) {
    if (overridePath)
        return path.resolve(overridePath);
    if (process.env.PAPERCLIP_CONFIG)
        return path.resolve(process.env.PAPERCLIP_CONFIG);
    return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath();
}
export function resolvePaperclipEnvPath(overrideConfigPath) {
    return path.resolve(path.dirname(resolvePaperclipConfigPath(overrideConfigPath)), PAPERCLIP_ENV_FILENAME);
}
//# sourceMappingURL=paths.js.map