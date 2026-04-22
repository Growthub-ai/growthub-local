# Native Intelligence (Local AI) — Gemma Setup

The `@growthub/cli` supports local AI through:

- `cli/src/runtime/native-intelligence/planner.ts`
- `cli/src/runtime/native-intelligence/normalizer.ts`
- `cli/src/runtime/native-intelligence/recommender.ts`
- `cli/src/runtime/native-intelligence/summarizer.ts`
- `cli/src/runtime/native-intelligence/provider.ts`

## Recommended Model For Development

- `gemma3:4b` (best balance for Apple Silicon development and CLI testing)

Alternatives:

- lighter: `gemma3:1b`
- stronger/slower: `gemma3:12b`

## macOS/Linux Setup (One Time)

```bash
brew install ollama
ollama serve &
ollama pull gemma3:4b
```

If you want models on an external drive:

```bash
export OLLAMA_MODELS="/Volumes/TOSHIBA EXT/ollama/models"
```

## Windows Setup (One Time)

1. Install Ollama from [https://ollama.com/download/windows](https://ollama.com/download/windows)
2. Start Ollama
3. Pull model:

```powershell
ollama pull gemma3:4b
```

## Optional Environment Variables

Set before running CLI discovery/tests:

```bash
export OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
export NATIVE_INTELLIGENCE_LOCAL_MODEL=gemma3:4b
```

Persist in `~/.zshrc`:

```bash
echo 'export OLLAMA_BASE_URL=http://127.0.0.1:11434/v1' >> ~/.zshrc
echo 'export NATIVE_INTELLIGENCE_LOCAL_MODEL=gemma3:4b' >> ~/.zshrc
source ~/.zshrc
```

## Quick Validation Commands

Endpoint health:

```bash
curl -sS http://127.0.0.1:11434/v1/models
```

Completion smoke test:

```bash
curl -sS -X POST http://127.0.0.1:11434/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{"model":"gemma3:4b","messages":[{"role":"user","content":"Reply exactly: local gemma ok"}]}'
```

Discovery entrypoint:

```bash
bash scripts/demo-cli.sh cli discover
```

Interactive setup helper:

- open `🧠 Local Intelligence`
- run setup helper
- choose `Ollama + gemma3:4b`
- confirm config apply

## Notes

- `modelId` remains canonical (`gemma3` / `gemma3n` / `codegemma`) in runtime config.
- `localModel` stores the concrete local adapter model id (for example `gemma3:4b` or any other local model id).
- For local Ollama, provider can read `localModel`, `NATIVE_INTELLIGENCE_LOCAL_MODEL`, or `OLLAMA_MODEL`.
- If model backend is unavailable, native-intelligence calls still degrade safely via deterministic logic.
