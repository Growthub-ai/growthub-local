import express from "express";

const DEFAULT_MODEL = "growthub-local-expert:latest";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_PORT = 8787;

function env(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function chatCompletionsUrl() {
  const backend = env("GROWTHUB_AGENT_SERVING_BACKEND", "ollama").toLowerCase();
  const base =
    backend === "vllm"
      ? env("VLLM_BASE_URL", "http://127.0.0.1:8000")
      : env("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL);
  const normalized = base.replace(/\/+$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function buildSystemPrompt() {
  return [
    "You are growthub-local-expert, the schema-native first responder for Growthub AWaC workspaces.",
    "Ground every answer in governed workspace primitives, Data Model objects, PATCH allowlists, orchestrationConfig graphs, and safety invariants.",
    "When the user asks for changes, return executable but validation-ready output: precise instructions, JSON/PATCH shapes, or orchestration graph fragments.",
    "Never include secret values. Refer to auth/env keys by stable env-ref names only.",
    "Prefer strict JSON envelopes when possible: {\"kind\":\"growthub-agent-response-v1\",\"summary\":\"...\",\"checks\":[],\"patch\":null,\"orchestrationConfig\":null,\"nextActions\":[]}."
  ].join(" ");
}

async function callModel(payload) {
  const response = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env("GROWTHUB_AGENT_BACKEND_API_KEY")
        ? { authorization: `Bearer ${env("GROWTHUB_AGENT_BACKEND_API_KEY")}` }
        : {})
    },
    body: JSON.stringify({
      model: env("GROWTHUB_AGENT_MODEL", DEFAULT_MODEL),
      temperature: Number(env("GROWTHUB_AGENT_TEMPERATURE", "0.2")),
      ...payload
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`model backend returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

function parseAssistantContent(raw) {
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return {
      kind: "growthub-agent-response-v1",
      summary: "Model response did not include assistant content.",
      checks: ["backend-response-shape"],
      patch: null,
      orchestrationConfig: null,
      nextActions: []
    };
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Text answers are still useful to operators; wrap them in the governed envelope.
  }

  return {
    kind: "growthub-agent-response-v1",
    summary: content,
    checks: ["wrapped-text-response"],
    patch: null,
    orchestrationConfig: null,
    nextActions: []
  };
}

const app = express();
app.use(express.json({ limit: env("GROWTHUB_AGENT_BODY_LIMIT", "1mb") }));

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "growthub-agent-service",
    model: env("GROWTHUB_AGENT_MODEL", DEFAULT_MODEL),
    backendUrl: chatCompletionsUrl().replace(/\/chat\/completions$/, "")
  });
});

app.post("/v1/chat/completions", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const raw = await callModel({
      ...body,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        ...messages
      ]
    });
    res.json(raw);
  } catch (err) {
    next(err);
  }
});

app.post("/workspace/query", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      res.status(400).json({ ok: false, error: "query is required" });
      return;
    }

    const workspaceContext =
      body.workspace && typeof body.workspace === "object"
        ? `\n\nWorkspace context JSON:\n${JSON.stringify(body.workspace, null, 2)}`
        : "";
    const raw = await callModel({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: `${query}${workspaceContext}` }
      ]
    });

    res.json({
      ok: true,
      kind: "growthub-workspace-query-result-v1",
      model: env("GROWTHUB_AGENT_MODEL", DEFAULT_MODEL),
      output: parseAssistantContent(raw),
      raw
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  res.status(500).json({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  });
});

const port = Number(env("PORT", String(DEFAULT_PORT)));
app.listen(port, () => {
  process.stdout.write(`growthub-agent-service listening on :${port}\n`);
});
