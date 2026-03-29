function readEnv(env, key) {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
export function inferOpenAiCompatibleBiller(env, fallback = "openai") {
    const explicitOpenRouterKey = readEnv(env, "OPENROUTER_API_KEY");
    if (explicitOpenRouterKey)
        return "openrouter";
    const baseUrl = readEnv(env, "OPENAI_BASE_URL") ??
        readEnv(env, "OPENAI_API_BASE") ??
        readEnv(env, "OPENAI_API_BASE_URL");
    if (baseUrl && /openrouter\.ai/i.test(baseUrl))
        return "openrouter";
    return fallback;
}
//# sourceMappingURL=billing.js.map