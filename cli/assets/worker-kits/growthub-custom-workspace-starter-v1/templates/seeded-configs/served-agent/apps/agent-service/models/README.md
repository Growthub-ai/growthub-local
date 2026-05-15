# Served Agent Models

Place promoted GGUF assets here when running the service from this generated workspace.

Use the helper from the workspace root:

```bash
node helpers/publish-served-agent-model.mjs \
  --model ./distillation/growthub-local-expert-v1.gguf \
  --workspace-model-dir ./apps/agent-service/models
```

The helper writes `growthub-agent-model.json` with size and SHA-256 metadata. Keep large GGUF files in Git LFS, release assets, or deployment artifact storage according to your repo policy.
