/**
 * Drop-zone override: local-intelligence browser access.
 *
 * The default `local-intelligence` adapter remains JSON-only and propose-only.
 * This fork-level adapter is loaded after the default adapter and replaces the
 * same registry id. It delegates byte-for-byte behavior when `browserAccess`
 * is off, and only runs the local browser bridge when sandbox-run explicitly
 * passes `browserAccess: true`.
 */

import { getSandboxAdapter, registerSandboxAdapter } from "../sandbox-adapter-registry.js";

const baseLocalIntelligence = getSandboxAdapter("local-intelligence");
const MAX_OUT = 256 * 1024;

function clampText(text) {
  const value = String(text || "");
  if (Buffer.byteLength(value, "utf8") <= MAX_OUT) return value;
  return `${Buffer.from(value).slice(0, MAX_OUT).toString("utf8")}\n…\n[truncated]`;
}

function parseJsonMaybe(text) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch {
    return null;
  }
}

function parseAdapterEnvelope(result) {
  const parsed = parseJsonMaybe(result?.stdout);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function extractFirstUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s"'<>}]+/i);
  return match ? match[0] : "";
}

function inferSearchQuery(request) {
  const raw = String(request?.intelligenceSandbox?.userIntent || request?.command || "");
  const promptMatch = raw.match(/(?:^|\n)\s*Prompt:\s*([\s\S]+)/i);
  const text = String(promptMatch?.[1] || raw).replace(/\s+/g, " ").trim();
  const quoted = text.match(/"([^"]{3,120})"/);
  if (quoted) return quoted[1].trim();
  const objective = text
    .replace(/^instructions:\s*/i, "")
    .replace(/\b(return|include|end with|each fact|outcome_score)\b.*$/i, "")
    .replace(/\b(use sandbox browser access to|use browser access to|use the browser to|browser access to|research|search|look up|browse|web access proof and pull|pull)\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (objective || text).slice(0, 160);
}

function browserSearchUrl(query) {
  const base = String(process.env.GROWTHUB_BROWSER_SEARCH_URL || "https://r.jina.ai/http://r.jina.ai/http://https://duckduckgo.com/html/?q={query}").trim();
  return base.includes("{query}")
    ? base.replace("{query}", encodeURIComponent(query))
    : `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`;
}

function significantTokens(text) {
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "return", "include", "source", "title", "url", "fact", "facts", "research", "search", "browser", "access", "sandbox", "use"]);
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{2,}/g)
    ?.filter((token) => !stop.has(token)) || [];
}

function alignSearchQuery(query, request) {
  const inferred = inferSearchQuery(request);
  if (!query) return inferred;
  const wanted = significantTokens(inferred);
  if (wanted.length < 2) return query;
  const actual = new Set(significantTokens(query));
  const matched = wanted.filter((token) => actual.has(token)).length;
  return matched >= Math.ceil(wanted.length / 2) ? query : inferred;
}

function normalizeToolIntent(intent, request) {
  if (typeof intent === "string") {
    const url = extractFirstUrl(intent);
    const lower = intent.trim().toLowerCase();
    if (url && /(navigate|goto|open|browser\.navigate|browser\.goto)/.test(lower)) {
      return { tool: "browser.navigate", url };
    }
    if (/(extract|read|snapshot|browser\.extract|browser\.read)/.test(lower)) {
      return { tool: "browser.extract", selector: "body" };
    }
    return null;
  }
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return null;
  const tool = String(intent.tool || intent.name || intent.action || "").trim().toLowerCase();
  const query = String(intent.query || intent.q || intent.search || "").trim();
  const url = String(intent.url || intent.href || extractFirstUrl(JSON.stringify(intent))).trim();
  const selector = String(intent.selector || "").trim();
  const text = String(intent.text || intent.value || "").trim();
  if (["browser.search", "search", "web.search"].includes(tool) && query) {
    return { tool: "browser.search", query: alignSearchQuery(query, request) };
  }
  if (["browser.navigate", "browser.goto", "navigate", "goto", "open"].includes(tool) && url) {
    return { tool: "browser.navigate", url };
  }
  if (["browser.extract", "browser.read", "browser.snapshot", "extract", "read", "snapshot"].includes(tool)) {
    return { tool: "browser.extract", selector: selector || "body" };
  }
  if (["browser.click", "click"].includes(tool) && selector) {
    return { tool: "browser.click", selector };
  }
  if (["browser.type", "browser.fill", "type", "fill"].includes(tool) && selector) {
    return { tool: "browser.type", selector, text };
  }
  return null;
}

function normalizeToolIntents(toolIntents, request) {
  const raw = Array.isArray(toolIntents) ? toolIntents : [];
  const joined = raw.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" ");
  const direct = raw.map((intent) => normalizeToolIntent(intent, request)).filter(Boolean);
  const url = extractFirstUrl(joined);
  if (url && !direct.some((intent) => intent.tool === "browser.navigate")) {
    direct.unshift({ tool: "browser.navigate", url });
  }
  const useful = direct.filter((intent) => {
    if (intent.tool !== "browser.navigate") return true;
    return !/^https?:\/\/(www\.)?google\.com\/?$/i.test(intent.url);
  });
  const intents = useful;
  if (intents.some((intent) => intent.tool === "browser.navigate" || intent.tool === "browser.search") && !intents.some((intent) => intent.tool === "browser.extract")) {
    intents.push({ tool: "browser.extract", selector: "body" });
  }
  return intents.slice(0, 8);
}

async function collectPageSnapshot(page, { maxText = 12000 } = {}) {
  return page.evaluate((limit) => {
    const text = (document.body?.innerText || "").replace(/\s+\n/g, "\n").trim().slice(0, limit);
    const links = Array.from(document.querySelectorAll("a"))
      .map((a) => ({
        title: (a.innerText || a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim(),
        url: a.href || "",
      }))
      .filter((item) => item.title && /^https?:\/\//i.test(item.url))
      .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index)
      .slice(0, 20);
    return { text, links };
  }, maxText).catch(() => ({ text: "", links: [] }));
}

function buildBrowserToolSystemPrompt() {
  return [
    "You are Growthub workspace sandbox local intelligence.",
    "Reply with a single JSON object only, matching:",
    "{\"text\":string optional,\"json\":object optional,\"toolIntents\":[],\"warnings\":[],\"confidence\":number}",
    "This sandbox run has browserAccess=true.",
    "When the task asks for current facts, research, citations, browsing, or web verification, first return browser tool intents instead of a final answer.",
    "Supported browser tool intents:",
    "{\"tool\":\"browser.search\",\"query\":\"search text\"}",
    "{\"tool\":\"browser.navigate\",\"url\":\"https://example.com\"}",
    "{\"tool\":\"browser.extract\",\"selector\":\"body\"}",
    "{\"tool\":\"browser.click\",\"selector\":\"button\"}",
    "{\"tool\":\"browser.type\",\"selector\":\"input[name=q]\",\"text\":\"search text\"}",
    "Do not claim browser results until observations are supplied back to you.",
  ].join("\n");
}

function withBrowserToolPrompt(request) {
  const box = request?.intelligenceSandbox || {};
  const explicitMessages = Array.isArray(box.messages)
    ? box.messages.filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    : null;
  const messages = explicitMessages && explicitMessages.length > 0
    ? [{ role: "system", content: buildBrowserToolSystemPrompt() }, ...explicitMessages.filter((m) => m.role !== "system")]
    : [
        { role: "system", content: buildBrowserToolSystemPrompt() },
        { role: "user", content: String(box.userIntent || request?.command || "") },
      ];
  return {
    ...request,
    intelligenceSandbox: {
      ...box,
      messages,
      userIntent: String(box.userIntent || request?.command || "")
    }
  };
}

async function loadBrowserDriver() {
  if (globalThis.__growthubLocalIntelligenceBrowserDriver) {
    return globalThis.__growthubLocalIntelligenceBrowserDriver;
  }
  let mod = null;
  try {
    mod = await import("playwright-core");
  } catch {
    mod = null;
  }
  const chromium = mod?.chromium;
  if (!chromium?.launch) {
    throw new Error("browserAccess requested for local-intelligence, but no local browser bridge is available. Install playwright-core in the workspace, or provide globalThis.__growthubLocalIntelligenceBrowserDriver from the host.");
  }
  return {
    async run(intents, { timeoutMs }) {
      const launchOptions = { headless: true };
      const executablePath = String(process.env.GROWTHUB_BROWSER_EXECUTABLE || "").trim();
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      } else {
        launchOptions.channel = "chrome";
      }
      const browser = await chromium.launch(launchOptions);
      const page = await browser.newPage();
      const observations = [];
      try {
        page.setDefaultTimeout(Math.min(Math.max(Number(timeoutMs) || 30000, 5000), 60000));
        for (const intent of intents) {
          if (intent.tool === "browser.search") {
            const url = browserSearchUrl(intent.query);
            await page.goto(url, { waitUntil: "domcontentloaded" });
            const snapshot = await collectPageSnapshot(page);
            observations.push({
              tool: intent.tool,
              query: intent.query,
              url: page.url(),
              title: await page.title(),
              text: snapshot.text,
              links: snapshot.links,
            });
          } else if (intent.tool === "browser.navigate") {
            await page.goto(intent.url, { waitUntil: "domcontentloaded" });
            const snapshot = await collectPageSnapshot(page);
            observations.push({ tool: intent.tool, url: page.url(), title: await page.title(), text: snapshot.text, links: snapshot.links });
          } else if (intent.tool === "browser.extract") {
            const selector = intent.selector || "body";
            const content = await page.locator(selector).first().innerText({ timeout: 10000 }).catch(async () => page.textContent("body"));
            const snapshot = await collectPageSnapshot(page);
            observations.push({ tool: intent.tool, selector, url: page.url(), text: String(content || snapshot.text || "").slice(0, 12000), links: snapshot.links });
          } else if (intent.tool === "browser.click") {
            await page.locator(intent.selector).first().click();
            observations.push({ tool: intent.tool, selector: intent.selector, url: page.url(), title: await page.title() });
          } else if (intent.tool === "browser.type") {
            await page.locator(intent.selector).first().fill(intent.text || "");
            observations.push({ tool: intent.tool, selector: intent.selector, url: page.url() });
          }
        }
        return observations;
      } finally {
        await browser.close().catch(() => {});
      }
    }
  };
}

function buildToolRepairMessages(request, firstEnvelope) {
  const userIntent = String(request?.intelligenceSandbox?.userIntent || request?.command || "");
  return [
    {
      role: "system",
      content: [
        "You repair browser tool calls for Growthub local intelligence.",
        "Return one JSON object only with this exact shape:",
        "{\"toolIntents\":[{\"tool\":\"browser.search\",\"query\":\"...\"}],\"warnings\":[]}",
        "Supported tools: browser.search, browser.navigate, browser.extract, browser.click, browser.type.",
        "For open-ended web research, use browser.search with a concise query derived from the user's task.",
        "Preserve named entities, years, product names, companies, and domain terms from the user's task. Do not generalize them away.",
        "Do not answer the task. Only return toolIntents."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "User task:",
        userIntent,
        "",
        "Malformed or unusable first model response:",
        JSON.stringify(firstEnvelope?.result || {}),
        "",
        "Suggested query if search is needed:",
        inferSearchQuery(request)
      ].join("\n")
    }
  ];
}

function buildFollowupMessages(request, firstEnvelope, observations) {
  const box = request.intelligenceSandbox || {};
  const explicitMessages = Array.isArray(box.messages)
    ? box.messages.filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    : null;
  const messages = explicitMessages && explicitMessages.length > 0
    ? explicitMessages
    : [
        {
          role: "system",
          content: [
            "You are Growthub workspace sandbox local intelligence.",
            "Reply with a single JSON object only, matching:",
            "{\"text\":string optional,\"json\":object optional,\"toolIntents\":[],\"warnings\":[],\"confidence\":number}",
          ].join("\n")
        },
        { role: "user", content: String(box.userIntent || request.command || "") },
      ];
  return [
    ...messages,
    { role: "assistant", content: JSON.stringify(firstEnvelope.result || {}) },
    {
      role: "user",
      content: [
        "Browser observations from the sandbox runtime:",
        JSON.stringify(observations),
        "Return the final JSON object now. Do not claim unobserved facts. Set toolIntents to []."
      ].join("\n")
    }
  ];
}

async function callChatCompletion({ endpoint, model, messages, signal }) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
    signal,
  });
  const text = clampText(Buffer.from(await res.arrayBuffer()).toString("utf8"));
  return { res, text };
}

function parseModelContent(text) {
  const outer = parseJsonMaybe(text);
  if (outer && Array.isArray(outer.choices) && outer.choices[0]?.message?.content) {
    const inner = String(outer.choices[0].message.content || "").trim();
    return { outer, parsed: parseJsonMaybe(inner) || { text: inner, warnings: ["model completion was not valid JSON"], toolIntents: [], confidence: 0 } };
  }
  return { outer, parsed: outer && typeof outer === "object" ? outer : { text, warnings: ["invalid JSON from model"], toolIntents: [], confidence: 0 } };
}

function normalizeParsedResult(parsed) {
  const json = parsed?.json && typeof parsed.json === "object" ? parsed.json : undefined;
  const text =
    typeof parsed?.text === "string" ? parsed.text
      : typeof json?.text === "string" ? json.text
        : typeof json?.answer === "string" ? json.answer
          : undefined;
  return {
    text,
    json,
    toolIntents: Array.isArray(parsed?.toolIntents) ? parsed.toolIntents : [],
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
    confidence: typeof parsed?.confidence === "number"
      ? parsed.confidence
      : (typeof json?.confidence === "number" ? json.confidence : 0),
  };
}

async function run(request) {
  const started = Date.now();
  if (!baseLocalIntelligence?.run) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "default local-intelligence adapter was not registered before browser-access override",
      adapterMeta: { adapter: "local-intelligence", browserAccess: Boolean(request?.browserAccess) }
    };
  }
  if (!request?.browserAccess) {
    return baseLocalIntelligence.run(request);
  }

  const browserRequest = withBrowserToolPrompt(request);
  const first = await baseLocalIntelligence.run(browserRequest);
  if (!first?.ok) {
    return {
      ...first,
      adapterMeta: {
        ...(first?.adapterMeta || {}),
        browserAccess: true,
        browserLane: "local-intelligence-browser-bridge"
      }
    };
  }

  const firstEnvelope = parseAdapterEnvelope(first);
  const toolIntents = Array.isArray(firstEnvelope?.result?.toolIntents) ? firstEnvelope.result.toolIntents : [];
  let intents = normalizeToolIntents(toolIntents, browserRequest);
  const endpoint = firstEnvelope?.adapter?.endpoint || first.adapterMeta?.endpoint;
  const model = firstEnvelope?.adapter?.modelId || first.adapterMeta?.model;
  if (!intents.length && endpoint && model) {
    const controller = new AbortController();
    const repairTimer = setTimeout(() => controller.abort(), Math.min(Number(request.timeoutMs) || 60000, 60000));
    try {
      const repair = await callChatCompletion({
        endpoint,
        model,
        messages: buildToolRepairMessages(browserRequest, firstEnvelope),
        signal: controller.signal,
      });
      if (repair.res.ok) {
        const { parsed } = parseModelContent(repair.text);
        intents = normalizeToolIntents(Array.isArray(parsed?.toolIntents) ? parsed.toolIntents : [], browserRequest);
      }
    } finally {
      clearTimeout(repairTimer);
    }
  }
  if (!intents.length) {
    return {
      ...first,
      adapterMeta: {
        ...(first.adapterMeta || {}),
        browserAccess: true,
        browserLane: "local-intelligence-browser-bridge",
        tools: 0
      }
    };
  }

  const driver = await loadBrowserDriver();
  const observations = await driver.run(intents, { timeoutMs: request.timeoutMs });
  if (!endpoint || !model) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: first.stdout || "",
      stderr: "",
      error: "local-intelligence browser bridge could not resolve endpoint/model from first pass",
      adapterMeta: { ...(first.adapterMeta || {}), browserAccess: true, browserLane: "local-intelligence-browser-bridge" }
    };
  }

  const controller = new AbortController();
  const ms = Number(request.timeoutMs) > 0 ? Math.min(Number(request.timeoutMs), 600000) : 60000;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const followup = await callChatCompletion({
      endpoint,
      model,
      messages: buildFollowupMessages(browserRequest, firstEnvelope, observations),
      signal: controller.signal,
    });
    if (!followup.res.ok) {
      return {
        ok: false,
        exitCode: 1,
        durationMs: Date.now() - started,
        stdout: followup.text,
        stderr: "",
        error: `local model HTTP ${followup.res.status}`,
        adapterMeta: { ...(first.adapterMeta || {}), browserAccess: true, browserLane: "local-intelligence-browser-bridge", tools: intents.length }
      };
    }
    const { outer, parsed } = parseModelContent(followup.text);
    const normalized = normalizeParsedResult(parsed);
    const envelope = {
      ...(firstEnvelope || {}),
      result: {
        text: normalized.text,
        json: normalized.json,
        toolIntents: normalized.toolIntents,
        warnings: normalized.warnings,
        confidence: normalized.confidence,
        browserObservations: observations,
      },
      rawText: followup.text,
      latencyMs: Date.now() - started,
      createdAt: new Date().toISOString(),
    };
    return {
      ok: true,
      exitCode: 0,
      durationMs: Date.now() - started,
      stdout: JSON.stringify(envelope, null, 2),
      stderr: "",
      adapterMeta: {
        ...(first.adapterMeta || {}),
        browserAccess: true,
        browserLane: "local-intelligence-browser-bridge",
        tokens: Number.isFinite(outer?.usage?.total_tokens) ? outer.usage.total_tokens : first.adapterMeta?.tokens ?? null,
        tools: intents.length,
      }
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout: "",
      stderr: clampText(error?.message || error),
      error: error?.name === "AbortError" ? `timed out after ${ms}ms` : error?.message || "browser bridge failed",
      adapterMeta: { ...(first.adapterMeta || {}), browserAccess: true, browserLane: "local-intelligence-browser-bridge", tools: intents.length }
    };
  } finally {
    clearTimeout(timer);
  }
}

registerSandboxAdapter({
  ...(baseLocalIntelligence || {}),
  id: "local-intelligence",
  label: "Local intelligence (OpenAI-compatible)",
  description:
    "Calls the local OpenAI-compatible model. When sandbox browserAccess is true, browser tool intents execute through the local browser bridge.",
  locality: "local",
  supportedRuntimes: [],
  run,
});

export { normalizeToolIntent };
