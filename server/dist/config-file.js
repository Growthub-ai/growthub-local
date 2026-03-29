import fs from "node:fs";
import path from "node:path";
import { paperclipConfigSchema } from "@paperclipai/shared";
import { resolvePaperclipConfigPath } from "./paths.js";
export function readConfigFile() {
    const configPath = resolvePaperclipConfigPath();
    if (!fs.existsSync(configPath))
        return null;
    try {
        const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return paperclipConfigSchema.parse(raw);
    }
    catch {
        return null;
    }
}
export function writeConfigFile(config) {
    const configPath = resolvePaperclipConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(paperclipConfigSchema.parse(config), null, 2)}\n`, {
        encoding: "utf-8",
        mode: 0o600,
    });
}
//# sourceMappingURL=config-file.js.map