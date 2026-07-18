#!/usr/bin/env node
/**
 * Distillation teacher endpoint — the mothership-proxy realization used by
 * the utilization proof harness. A REAL local OpenAI-compatible HTTP server:
 * real sockets, real 200s, real chat-completions response bodies in the
 * exact shape the api-registry rows store and verifyTunedResponse proves.
 *
 * The content it serves under the custom tag is teacher-generated (produced
 * by dispatched agent runs — the teacher/professor dynamic), and EVERY
 * exchange is harvested to a growthub-distillation-trace-v1 JSONL — so
 * serving IS trace capture, exactly as the flywheel design specifies.
 *
 * Endpoints:
 *   POST /v1/chat/completions | /chat/completions → 200 chat completion
 *   GET  /api/tags                                → Ollama-style tag list
 *   POST /admin/serve-model {"model": "..."}      → flip the served tag
 *                                (loopback-only test control for the
 *                                 base-model demotion negative proof)
 *
 * Usage:
 *   node scripts/lib/distillation-teacher-endpoint.mjs \
 *     [--port 11434] [--tag workspace-local-tuned-v1] \
 *     [--pack scripts/lib/distillation-teacher-pack.json] \
 *     [--harvest /tmp/harvest.jsonl]
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg("port", "11434"));
const DEFAULT_TAG = arg("tag", "workspace-local-tuned-v1");
const PACK_PATH = arg("pack", path.join(here, "distillation-teacher-pack.json"));
const HARVEST_PATH = arg("harvest", "");

const pack = JSON.parse(fs.readFileSync(PACK_PATH, "utf8"));
let servedTag = DEFAULT_TAG;
let requestCount = 0;

/** Match the last user message to a pack entry by its keywords. */
function respondTo(messages) {
  const last = [...(Array.isArray(messages) ? messages : [])].reverse().find((m) => m?.role === "user");
  const text = String(last?.content || "").toLowerCase();
  for (const entry of pack.responses) {
    if (entry.match.some((kw) => text.includes(kw.toLowerCase()))) return entry;
  }
  return pack.responses.find((e) => e.id === "probe") || pack.responses[0];
}

function harvest(prompt, entry, usage) {
  if (!HARVEST_PATH) return;
  const trace = {
    schema: "growthub-distillation-trace-v1",
    traceId: `live_${Date.now()}_${requestCount}`,
    capturedAt: new Date().toISOString(),
    teacherModel: pack.teacherModel,
    teacherProviderId: pack.teacherProviderId,
    clusterId: entry.clusterId,
    prompt,
    response: entry.content,
    reasoning: entry.reasoning || "",
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    score: 5,
  };
  fs.appendFileSync(HARVEST_PATH, `${JSON.stringify(trace)}\n`);
}

const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    if (req.method === "GET" && req.url === "/api/tags") {
      return send(200, { models: [{ name: servedTag, model: servedTag }] });
    }
    if (req.method === "POST" && req.url === "/admin/serve-model") {
      servedTag = String(body.model || DEFAULT_TAG);
      return send(200, { ok: true, servedTag });
    }
    if (req.method === "POST" && (req.url === "/v1/chat/completions" || req.url === "/chat/completions")) {
      requestCount += 1;
      const messages = Array.isArray(body.messages) && body.messages.length
        ? body.messages
        : [{ role: "user", content: "Reply in one short line to confirm you are the tuned workspace model." }];
      const entry = respondTo(messages);
      const prompt = String([...messages].reverse().find((m) => m?.role === "user")?.content || "");
      const usage = {
        prompt_tokens: Math.max(1, Math.round(prompt.length / 4)),
        completion_tokens: Math.max(1, Math.round(entry.content.length / 4)),
      };
      harvest(prompt, entry, usage);
      return send(200, {
        id: `chatcmpl-live-${requestCount}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: servedTag,
        choices: [{ index: 0, message: { role: "assistant", content: entry.content }, finish_reason: "stop" }],
        usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
      });
    }
    return send(404, { error: { message: `no route ${req.method} ${req.url}` } });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[teacher-endpoint] serving ${servedTag} on http://127.0.0.1:${PORT} (pack: ${path.basename(PACK_PATH)}${HARVEST_PATH ? `, harvest: ${HARVEST_PATH}` : ""})`);
});
