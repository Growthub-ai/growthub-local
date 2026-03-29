import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const CLAUDE_USAGE_SOURCE_OAUTH = "anthropic-oauth";
const CLAUDE_USAGE_SOURCE_CLI = "claude-cli";
export function claudeConfigDir() {
    const fromEnv = process.env.CLAUDE_CONFIG_DIR;
    if (typeof fromEnv === "string" && fromEnv.trim().length > 0)
        return fromEnv.trim();
    return path.join(os.homedir(), ".claude");
}
function hasNonEmptyProcessEnv(key) {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
}
function createClaudeQuotaEnv() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (typeof value !== "string")
            continue;
        if (key.startsWith("ANTHROPIC_"))
            continue;
        env[key] = value;
    }
    return env;
}
function stripBackspaces(text) {
    let out = "";
    for (const char of text) {
        if (char === "\b") {
            out = out.slice(0, -1);
        }
        else {
            out += char;
        }
    }
    return out;
}
function stripAnsi(text) {
    return text
        .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
        .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
function cleanTerminalText(text) {
    return stripAnsi(stripBackspaces(text))
        .replace(/\u0000/g, "")
        .replace(/\r/g, "\n");
}
function normalizeForLabelSearch(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function trimToLatestUsagePanel(text) {
    const lower = text.toLowerCase();
    const settingsIndex = lower.lastIndexOf("settings:");
    if (settingsIndex < 0)
        return null;
    let tail = text.slice(settingsIndex);
    const tailLower = tail.toLowerCase();
    if (!tailLower.includes("usage"))
        return null;
    if (!tailLower.includes("current session") && !tailLower.includes("loading usage"))
        return null;
    const stopMarkers = [
        "status dialog dismissed",
        "checking for updates",
        "press ctrl-c again to exit",
    ];
    let stopIndex = -1;
    for (const marker of stopMarkers) {
        const markerIndex = tailLower.indexOf(marker);
        if (markerIndex >= 0 && (stopIndex === -1 || markerIndex < stopIndex)) {
            stopIndex = markerIndex;
        }
    }
    if (stopIndex >= 0) {
        tail = tail.slice(0, stopIndex);
    }
    return tail;
}
async function readClaudeTokenFromFile(credPath) {
    let raw;
    try {
        raw = await fs.readFile(credPath, "utf8");
    }
    catch {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null)
        return null;
    const obj = parsed;
    const oauth = obj["claudeAiOauth"];
    if (typeof oauth !== "object" || oauth === null)
        return null;
    const token = oauth["accessToken"];
    return typeof token === "string" && token.length > 0 ? token : null;
}
export async function readClaudeAuthStatus() {
    try {
        const { stdout } = await execFileAsync("claude", ["auth", "status"], {
            env: process.env,
            timeout: 5_000,
            maxBuffer: 1024 * 1024,
        });
        const parsed = JSON.parse(stdout);
        return {
            loggedIn: parsed.loggedIn === true,
            authMethod: typeof parsed.authMethod === "string" ? parsed.authMethod : null,
            subscriptionType: typeof parsed.subscriptionType === "string" ? parsed.subscriptionType : null,
        };
    }
    catch {
        return null;
    }
}
function describeClaudeSubscriptionAuth(status) {
    if (!status?.loggedIn || status.authMethod !== "claude.ai")
        return null;
    return status.subscriptionType
        ? `Claude is logged in via claude.ai (${status.subscriptionType})`
        : "Claude is logged in via claude.ai";
}
export async function readClaudeToken() {
    const configDir = claudeConfigDir();
    for (const filename of [".credentials.json", "credentials.json"]) {
        const token = await readClaudeTokenFromFile(path.join(configDir, filename));
        if (token)
            return token;
    }
    return null;
}
function formatCurrencyAmount(value, currency) {
    const code = typeof currency === "string" && currency.trim().length > 0 ? currency.trim().toUpperCase() : "USD";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
    }).format(value);
}
function formatExtraUsageLabel(extraUsage) {
    const monthlyLimit = extraUsage.monthly_limit;
    const usedCredits = extraUsage.used_credits;
    if (typeof monthlyLimit !== "number" ||
        !Number.isFinite(monthlyLimit) ||
        typeof usedCredits !== "number" ||
        !Number.isFinite(usedCredits)) {
        return null;
    }
    return `${formatCurrencyAmount(usedCredits, extraUsage.currency)} / ${formatCurrencyAmount(monthlyLimit, extraUsage.currency)}`;
}
/** Convert a 0-1 utilization fraction to a 0-100 integer percent. Returns null for null/undefined input. */
export function toPercent(utilization) {
    if (utilization == null)
        return null;
    return Math.min(100, Math.round(utilization * 100));
}
/** fetch with an abort-based timeout so a hanging provider api doesn't block the response indefinitely */
export async function fetchWithTimeout(url, init, ms = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
export async function fetchClaudeQuota(token) {
    const resp = await fetchWithTimeout("https://api.anthropic.com/api/oauth/usage", {
        headers: {
            Authorization: `Bearer ${token}`,
            "anthropic-beta": "oauth-2025-04-20",
        },
    });
    if (!resp.ok)
        throw new Error(`anthropic usage api returned ${resp.status}`);
    const body = (await resp.json());
    const windows = [];
    if (body.five_hour != null) {
        windows.push({
            label: "Current session",
            usedPercent: toPercent(body.five_hour.utilization),
            resetsAt: body.five_hour.resets_at ?? null,
            valueLabel: null,
            detail: null,
        });
    }
    if (body.seven_day != null) {
        windows.push({
            label: "Current week (all models)",
            usedPercent: toPercent(body.seven_day.utilization),
            resetsAt: body.seven_day.resets_at ?? null,
            valueLabel: null,
            detail: null,
        });
    }
    if (body.seven_day_sonnet != null) {
        windows.push({
            label: "Current week (Sonnet only)",
            usedPercent: toPercent(body.seven_day_sonnet.utilization),
            resetsAt: body.seven_day_sonnet.resets_at ?? null,
            valueLabel: null,
            detail: null,
        });
    }
    if (body.seven_day_opus != null) {
        windows.push({
            label: "Current week (Opus only)",
            usedPercent: toPercent(body.seven_day_opus.utilization),
            resetsAt: body.seven_day_opus.resets_at ?? null,
            valueLabel: null,
            detail: null,
        });
    }
    if (body.extra_usage != null) {
        windows.push({
            label: "Extra usage",
            usedPercent: body.extra_usage.is_enabled === false ? null : toPercent(body.extra_usage.utilization),
            resetsAt: null,
            valueLabel: body.extra_usage.is_enabled === false
                ? "Not enabled"
                : formatExtraUsageLabel(body.extra_usage),
            detail: body.extra_usage.is_enabled === false
                ? "Extra usage not enabled"
                : "Monthly extra usage pool",
        });
    }
    return windows;
}
function usageOutputLooksRelevant(text) {
    const normalized = normalizeForLabelSearch(text);
    return normalized.includes("currentsession")
        || normalized.includes("currentweek")
        || normalized.includes("loadingusage")
        || normalized.includes("failedtoloadusagedata")
        || normalized.includes("tokenexpired")
        || normalized.includes("authenticationerror")
        || normalized.includes("ratelimited");
}
function usageOutputLooksComplete(text) {
    const normalized = normalizeForLabelSearch(text);
    if (normalized.includes("failedtoloadusagedata")
        || normalized.includes("tokenexpired")
        || normalized.includes("authenticationerror")
        || normalized.includes("ratelimited")) {
        return true;
    }
    return normalized.includes("currentsession")
        && (normalized.includes("currentweek") || normalized.includes("extrausage"))
        && /[0-9]{1,3}(?:\.[0-9]+)?%/i.test(text);
}
function extractUsageError(text) {
    const lower = text.toLowerCase();
    const compact = lower.replace(/\s+/g, "");
    if (lower.includes("token_expired") || lower.includes("token has expired")) {
        return "Claude CLI token expired. Run `claude login` to refresh.";
    }
    if (lower.includes("authentication_error")) {
        return "Claude CLI authentication error. Run `claude login`.";
    }
    if (lower.includes("rate_limit_error") || lower.includes("rate limited") || compact.includes("ratelimited")) {
        return "Claude CLI usage endpoint is rate limited right now. Please try again later.";
    }
    if (lower.includes("failed to load usage data") || compact.includes("failedtoloadusagedata")) {
        return "Claude CLI could not load usage data. Open the CLI and retry `/usage`.";
    }
    return null;
}
function percentFromLine(line) {
    const match = line.match(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/i);
    if (!match)
        return null;
    const rawValue = Number(match[1]);
    if (!Number.isFinite(rawValue))
        return null;
    const clamped = Math.min(100, Math.max(0, rawValue));
    const lower = line.toLowerCase();
    if (lower.includes("remaining") || lower.includes("left") || lower.includes("available")) {
        return Math.max(0, Math.min(100, Math.round(100 - clamped)));
    }
    return Math.round(clamped);
}
function isQuotaLabel(line) {
    const normalized = normalizeForLabelSearch(line);
    return normalized === "currentsession"
        || normalized === "currentweekallmodels"
        || normalized === "currentweeksonnetonly"
        || normalized === "currentweeksonnet"
        || normalized === "currentweekopusonly"
        || normalized === "currentweekopus"
        || normalized === "extrausage";
}
function canonicalQuotaLabel(line) {
    switch (normalizeForLabelSearch(line)) {
        case "currentsession":
            return "Current session";
        case "currentweekallmodels":
            return "Current week (all models)";
        case "currentweeksonnetonly":
        case "currentweeksonnet":
            return "Current week (Sonnet only)";
        case "currentweekopusonly":
        case "currentweekopus":
            return "Current week (Opus only)";
        case "extrausage":
            return "Extra usage";
        default:
            return line;
    }
}
function formatClaudeCliDetail(label, lines) {
    const normalizedLabel = normalizeForLabelSearch(label);
    if (normalizedLabel === "extrausage") {
        const compact = lines.join(" ").replace(/\s+/g, "").toLowerCase();
        if (compact.includes("extrausagenotenabled")) {
            return "Extra usage not enabled • /extra-usage to enable";
        }
        const firstLine = lines.find((line) => line.trim().length > 0) ?? null;
        return firstLine;
    }
    const resetLine = lines.find((line) => /^resets/i.test(line) || normalizeForLabelSearch(line).startsWith("resets"));
    if (!resetLine)
        return null;
    return resetLine
        .replace(/^Resets/i, "Resets ")
        .replace(/([A-Z][a-z]{2})(\d)/g, "$1 $2")
        .replace(/(\d)at(\d)/g, "$1 at $2")
        .replace(/(am|pm)\(/gi, "$1 (")
        .replace(/([A-Za-z])\(/g, "$1 (")
        .replace(/\s+/g, " ")
        .trim();
}
export function parseClaudeCliUsageText(text) {
    const cleaned = trimToLatestUsagePanel(cleanTerminalText(text)) ?? cleanTerminalText(text);
    const usageError = extractUsageError(cleaned);
    if (usageError)
        throw new Error(usageError);
    const lines = cleaned
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const sections = [];
    let current = null;
    for (const line of lines) {
        if (isQuotaLabel(line)) {
            if (current)
                sections.push(current);
            current = { label: canonicalQuotaLabel(line), lines: [] };
            continue;
        }
        if (current)
            current.lines.push(line);
    }
    if (current)
        sections.push(current);
    const windows = sections.map((section) => {
        const usedPercent = section.lines.map(percentFromLine).find((value) => value != null) ?? null;
        return {
            label: section.label,
            usedPercent,
            resetsAt: null,
            valueLabel: null,
            detail: formatClaudeCliDetail(section.label, section.lines),
        };
    });
    if (!windows.some((window) => normalizeForLabelSearch(window.label) === "currentsession")) {
        throw new Error("Could not parse Claude CLI usage output.");
    }
    return windows;
}
function quoteForShell(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function buildClaudeCliShellProbeCommand() {
    const feed = "(sleep 2; printf '/usage\\r'; sleep 6; printf '\\033'; sleep 1; printf '\\003')";
    const claudeCommand = "claude --tools \"\"";
    if (process.platform === "darwin") {
        return `${feed} | script -q /dev/null ${claudeCommand}`;
    }
    return `${feed} | script -q -e -f -c ${quoteForShell(claudeCommand)} /dev/null`;
}
export async function captureClaudeCliUsageText(timeoutMs = 12_000) {
    const command = buildClaudeCliShellProbeCommand();
    try {
        const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
            env: createClaudeQuotaEnv(),
            timeout: timeoutMs,
            maxBuffer: 8 * 1024 * 1024,
        });
        const output = `${stdout}${stderr}`;
        const cleaned = cleanTerminalText(output);
        if (usageOutputLooksComplete(cleaned))
            return output;
        throw new Error("Claude CLI usage probe ended before rendering usage.");
    }
    catch (error) {
        const stdout = typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string"
            ? error.stdout
            : "";
        const stderr = typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
            ? error.stderr
            : "";
        const output = `${stdout}${stderr}`;
        const cleaned = cleanTerminalText(output);
        if (usageOutputLooksComplete(cleaned))
            return output;
        if (usageOutputLooksRelevant(cleaned)) {
            throw new Error("Claude CLI usage probe ended before rendering usage.");
        }
        throw error instanceof Error ? error : new Error(String(error));
    }
}
export async function fetchClaudeCliQuota() {
    const rawText = await captureClaudeCliUsageText();
    return parseClaudeCliUsageText(rawText);
}
function formatProviderError(source, error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${source}: ${message}`;
}
export async function getQuotaWindows() {
    const authStatus = await readClaudeAuthStatus();
    const authDescription = describeClaudeSubscriptionAuth(authStatus);
    const token = await readClaudeToken();
    const errors = [];
    if (token) {
        try {
            const windows = await fetchClaudeQuota(token);
            return { provider: "anthropic", source: CLAUDE_USAGE_SOURCE_OAUTH, ok: true, windows };
        }
        catch (error) {
            errors.push(formatProviderError("Anthropic OAuth usage", error));
        }
    }
    try {
        const windows = await fetchClaudeCliQuota();
        return { provider: "anthropic", source: CLAUDE_USAGE_SOURCE_CLI, ok: true, windows };
    }
    catch (error) {
        errors.push(formatProviderError("Claude CLI /usage", error));
    }
    if (hasNonEmptyProcessEnv("ANTHROPIC_API_KEY") && !authDescription) {
        return {
            provider: "anthropic",
            ok: false,
            error: errors[0]
                ?? "ANTHROPIC_API_KEY is set and no local Claude subscription session is available for quota polling",
            windows: [],
        };
    }
    if (authDescription) {
        return {
            provider: "anthropic",
            ok: false,
            error: errors.length > 0
                ? `${authDescription}, but quota polling failed (${errors.join("; ")})`
                : `${authDescription}, but Paperclip could not load subscription quota data`,
            windows: [],
        };
    }
    return {
        provider: "anthropic",
        ok: false,
        error: errors[0] ?? "no local claude auth token",
        windows: [],
    };
}
//# sourceMappingURL=quota.js.map