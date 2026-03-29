import { asString, asNumber, parseObject, parseJson } from "@paperclipai/adapter-utils/server-utils";
const CLAUDE_AUTH_REQUIRED_RE = /(?:not\s+logged\s+in|please\s+log\s+in|please\s+run\s+`?claude\s+login`?|login\s+required|requires\s+login|unauthorized|authentication\s+required)/i;
const URL_RE = /(https?:\/\/[^\s'"`<>()[\]{};,!?]+[^\s'"`<>()[\]{};,!.?:]+)/gi;
export function parseClaudeStreamJson(stdout) {
    let sessionId = null;
    let model = "";
    let finalResult = null;
    const assistantTexts = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const event = parseJson(line);
        if (!event)
            continue;
        const type = asString(event.type, "");
        if (type === "system" && asString(event.subtype, "") === "init") {
            sessionId = asString(event.session_id, sessionId ?? "") || sessionId;
            model = asString(event.model, model);
            continue;
        }
        if (type === "assistant") {
            sessionId = asString(event.session_id, sessionId ?? "") || sessionId;
            const message = parseObject(event.message);
            const content = Array.isArray(message.content) ? message.content : [];
            for (const entry of content) {
                if (typeof entry !== "object" || entry === null || Array.isArray(entry))
                    continue;
                const block = entry;
                if (asString(block.type, "") === "text") {
                    const text = asString(block.text, "");
                    if (text)
                        assistantTexts.push(text);
                }
            }
            continue;
        }
        if (type === "result") {
            finalResult = event;
            sessionId = asString(event.session_id, sessionId ?? "") || sessionId;
        }
    }
    if (!finalResult) {
        return {
            sessionId,
            model,
            costUsd: null,
            usage: null,
            summary: assistantTexts.join("\n\n").trim(),
            resultJson: null,
        };
    }
    const usageObj = parseObject(finalResult.usage);
    const usage = {
        inputTokens: asNumber(usageObj.input_tokens, 0),
        cachedInputTokens: asNumber(usageObj.cache_read_input_tokens, 0),
        outputTokens: asNumber(usageObj.output_tokens, 0),
    };
    const costRaw = finalResult.total_cost_usd;
    const costUsd = typeof costRaw === "number" && Number.isFinite(costRaw) ? costRaw : null;
    const summary = asString(finalResult.result, assistantTexts.join("\n\n")).trim();
    return {
        sessionId,
        model,
        costUsd,
        usage,
        summary,
        resultJson: finalResult,
    };
}
function extractClaudeErrorMessages(parsed) {
    const raw = Array.isArray(parsed.errors) ? parsed.errors : [];
    const messages = [];
    for (const entry of raw) {
        if (typeof entry === "string") {
            const msg = entry.trim();
            if (msg)
                messages.push(msg);
            continue;
        }
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            continue;
        }
        const obj = entry;
        const msg = asString(obj.message, "") || asString(obj.error, "") || asString(obj.code, "");
        if (msg) {
            messages.push(msg);
            continue;
        }
        try {
            messages.push(JSON.stringify(obj));
        }
        catch {
            // skip non-serializable entry
        }
    }
    return messages;
}
export function extractClaudeLoginUrl(text) {
    const match = text.match(URL_RE);
    if (!match || match.length === 0)
        return null;
    for (const rawUrl of match) {
        const cleaned = rawUrl.replace(/[\])}.!,?;:'\"]+$/g, "");
        if (cleaned.includes("claude") || cleaned.includes("anthropic") || cleaned.includes("auth")) {
            return cleaned;
        }
    }
    return match[0]?.replace(/[\])}.!,?;:'\"]+$/g, "") ?? null;
}
export function detectClaudeLoginRequired(input) {
    const resultText = asString(input.parsed?.result, "").trim();
    const messages = [resultText, ...extractClaudeErrorMessages(input.parsed ?? {}), input.stdout, input.stderr]
        .join("\n")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const requiresLogin = messages.some((line) => CLAUDE_AUTH_REQUIRED_RE.test(line));
    return {
        requiresLogin,
        loginUrl: extractClaudeLoginUrl([input.stdout, input.stderr].join("\n")),
    };
}
export function describeClaudeFailure(parsed) {
    const subtype = asString(parsed.subtype, "");
    const resultText = asString(parsed.result, "").trim();
    const errors = extractClaudeErrorMessages(parsed);
    let detail = resultText;
    if (!detail && errors.length > 0) {
        detail = errors[0] ?? "";
    }
    const parts = ["Claude run failed"];
    if (subtype)
        parts.push(`subtype=${subtype}`);
    if (detail)
        parts.push(detail);
    return parts.length > 1 ? parts.join(": ") : null;
}
export function isClaudeMaxTurnsResult(parsed) {
    if (!parsed)
        return false;
    const subtype = asString(parsed.subtype, "").trim().toLowerCase();
    if (subtype === "error_max_turns")
        return true;
    const stopReason = asString(parsed.stop_reason, "").trim().toLowerCase();
    if (stopReason === "max_turns")
        return true;
    const resultText = asString(parsed.result, "").trim();
    return /max(?:imum)?\s+turns?/i.test(resultText);
}
export function isClaudeUnknownSessionError(parsed) {
    const resultText = asString(parsed.result, "").trim();
    const allMessages = [resultText, ...extractClaudeErrorMessages(parsed)]
        .map((msg) => msg.trim())
        .filter(Boolean);
    return allMessages.some((msg) => /no conversation found with session id|unknown session|session .* not found/i.test(msg));
}
//# sourceMappingURL=parse.js.map