# Served Agent Seed

`--seed-config served-agent` turns the governed workspace starter into the packaging surface for a persistent Growthub Agent Service.

The seed adds:

- `apps/agent-service/` — minimal Node/Express service that fronts Ollama in local dev and vLLM or any OpenAI-compatible backend in production.
- `packages/agent-sdk/` — small JavaScript SDK with `agent.query(...)` and OpenAI-compatible passthrough support.
- Data Model objects for the service API Registry row, served-agent sandbox rows, promoted GGUF model artifacts, and opt-in feedback traces.

## Create the service workspace

```bash
growthub starter init \
  --seed-config served-agent \
  --name "Growthub Agent Service" \
  --out ./growthub-agent-service
```

## Promote a distilled GGUF

```bash
node helpers/publish-served-agent-model.mjs \
  --model ./distillation/growthub-local-expert-v1.gguf \
  --workspace-model-dir ./apps/agent-service/models \
  --service-repo "${GROWTHUB_AGENT_SERVICE_HOME:-$HOME/growthub-agent-service}"
```

The helper copies the GGUF to the generated workspace and, when `--service-repo` is supplied, to the standalone service repo. It writes a `growthub-agent-model.json` manifest with byte size and SHA-256 metadata in each destination.

## Run locally

```bash
cd apps/agent-service
cp .env.example .env
npm install
npm run dev
```

## Deploy

```bash
cd apps/agent-service
docker build -t growthub-agent-service .
```

Use Ollama for local development and vLLM or another OpenAI-compatible backend for production serving. The public API stays stable for operators:

- `POST /v1/chat/completions`
- `POST /workspace/query`
- `GET /healthz`

Feedback traces should be opt-in and governed. Store only prompt/output metadata needed for grading and future distillation; keep secrets and customer-sensitive payloads out of trace rows unless the workspace owner explicitly authorizes capture.
