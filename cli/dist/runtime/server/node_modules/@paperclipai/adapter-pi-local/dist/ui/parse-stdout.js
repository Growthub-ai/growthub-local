function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function asRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return null;
    return value;
}
function asString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function extractTextContent(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    return content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("");
}
export function parsePiStdoutLine(line, ts) {
    const parsed = asRecord(safeJsonParse(line));
    if (!parsed) {
        return [{ kind: "stdout", ts, text: line }];
    }
    const type = asString(parsed.type);
    // RPC protocol messages - filter these out (internal implementation detail)
    if (type === "response" || type === "extension_ui_request" || type === "extension_ui_response" || type === "extension_error") {
        return [];
    }
    // Agent lifecycle
    if (type === "agent_start") {
        return [{ kind: "system", ts, text: "Pi agent started" }];
    }
    if (type === "agent_end") {
        return [{ kind: "system", ts, text: "Pi agent finished" }];
    }
    // Turn lifecycle
    if (type === "turn_start") {
        return [{ kind: "system", ts, text: "Turn started" }];
    }
    if (type === "turn_end") {
        const message = asRecord(parsed.message);
        const toolResults = parsed.toolResults;
        const entries = [];
        if (message) {
            const content = message.content;
            const text = extractTextContent(content);
            if (text) {
                entries.push({ kind: "assistant", ts, text });
            }
        }
        // Process tool results
        if (toolResults) {
            for (const tr of toolResults) {
                const content = tr.content;
                const isError = tr.isError === true;
                // Extract text from Pi's content array format
                let contentStr;
                if (typeof content === "string") {
                    contentStr = content;
                }
                else if (Array.isArray(content)) {
                    contentStr = extractTextContent(content);
                }
                else {
                    contentStr = JSON.stringify(content);
                }
                entries.push({
                    kind: "tool_result",
                    ts,
                    toolUseId: asString(tr.toolCallId, "unknown"),
                    toolName: asString(tr.toolName),
                    content: contentStr,
                    isError,
                });
            }
        }
        return entries.length > 0 ? entries : [{ kind: "system", ts, text: "Turn ended" }];
    }
    // Message streaming
    if (type === "message_start") {
        return [];
    }
    if (type === "message_update") {
        const assistantEvent = asRecord(parsed.assistantMessageEvent);
        if (assistantEvent) {
            const msgType = asString(assistantEvent.type);
            if (msgType === "text_delta") {
                const delta = asString(assistantEvent.delta);
                if (delta) {
                    return [{ kind: "assistant", ts, text: delta, delta: true }];
                }
            }
        }
        return [];
    }
    if (type === "message_end") {
        return [];
    }
    // Tool execution
    if (type === "tool_execution_start") {
        const toolName = asString(parsed.toolName);
        const args = parsed.args;
        if (toolName) {
            return [{
                    kind: "tool_call",
                    ts,
                    name: toolName,
                    input: args,
                }];
        }
        return [{ kind: "system", ts, text: `Tool started` }];
    }
    if (type === "tool_execution_update") {
        return [];
    }
    if (type === "tool_execution_end") {
        const toolCallId = asString(parsed.toolCallId);
        const toolName = asString(parsed.toolName);
        const result = parsed.result;
        const isError = parsed.isError === true;
        // Extract text from Pi's content array format
        // Can be: {"content": [{"type": "text", "text": "..."}]} or [{"type": "text", "text": "..."}]
        let contentStr;
        if (typeof result === "string") {
            contentStr = result;
        }
        else if (Array.isArray(result)) {
            // Direct array format: result is [{"type": "text", "text": "..."}]
            contentStr = extractTextContent(result);
        }
        else if (result && typeof result === "object") {
            const resultObj = result;
            if (Array.isArray(resultObj.content)) {
                // Wrapped format: result is {"content": [{"type": "text", "text": "..."}]}
                contentStr = extractTextContent(resultObj.content);
            }
            else {
                contentStr = JSON.stringify(result);
            }
        }
        else {
            contentStr = JSON.stringify(result);
        }
        return [{
                kind: "tool_result",
                ts,
                toolUseId: toolCallId || "unknown",
                toolName,
                content: contentStr,
                isError,
            }];
    }
    return [{ kind: "stdout", ts, text: line }];
}
//# sourceMappingURL=parse-stdout.js.map