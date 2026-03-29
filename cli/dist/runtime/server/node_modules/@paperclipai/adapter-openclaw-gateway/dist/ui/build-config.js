function parseJsonObject(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
export function buildOpenClawGatewayConfig(v) {
    const ac = {};
    if (v.url)
        ac.url = v.url;
    ac.timeoutSec = 120;
    ac.waitTimeoutMs = 120000;
    ac.sessionKeyStrategy = "issue";
    ac.role = "operator";
    ac.scopes = ["operator.admin"];
    const payloadTemplate = parseJsonObject(v.payloadTemplateJson ?? "");
    if (payloadTemplate)
        ac.payloadTemplate = payloadTemplate;
    const runtimeServices = parseJsonObject(v.runtimeServicesJson ?? "");
    if (runtimeServices && Array.isArray(runtimeServices.services)) {
        ac.workspaceRuntime = runtimeServices;
    }
    return ac;
}
//# sourceMappingURL=build-config.js.map