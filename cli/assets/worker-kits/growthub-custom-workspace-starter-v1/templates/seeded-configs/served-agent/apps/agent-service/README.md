# Growthub Agent Service

This service packages `growthub-local-expert` as a persistent Growthub first responder.

It exposes:

- `POST /v1/chat/completions` — OpenAI-compatible passthrough with the Growthub governed system prompt injected.
- `POST /workspace/query` — Growthub-native query endpoint that wraps model output in a governed response envelope.
- `GET /healthz` — runtime and backend health metadata.

## Local dev

```bash
cd apps/agent-service
cp .env.example .env
npm install
npm run dev
```

By default the service calls Ollama at `http://127.0.0.1:11434/v1/chat/completions` with `GROWTHUB_AGENT_MODEL=growthub-local-expert:latest`.

## Production serving

Set:

```bash
GROWTHUB_AGENT_SERVING_BACKEND=vllm
VLLM_BASE_URL=http://127.0.0.1:8000
GROWTHUB_AGENT_MODEL=growthub-local-expert:latest
```

Any bearer token for a hosted OpenAI-compatible backend belongs in `GROWTHUB_AGENT_BACKEND_API_KEY`; do not place secret values in `growthub.config.json`.

## Query shape

```bash
curl -s http://localhost:8787/workspace/query \
  -H 'content-type: application/json' \
  -d '{"query":"Build a governed dashboard for client onboarding","workspace":{"id":"demo"}}'
```

The response shape is:

```json
{
  "ok": true,
  "kind": "growthub-workspace-query-result-v1",
  "model": "growthub-local-expert:latest",
  "output": {
    "kind": "growthub-agent-response-v1",
    "summary": "...",
    "checks": [],
    "patch": null,
    "orchestrationConfig": null,
    "nextActions": []
  }
}
```
