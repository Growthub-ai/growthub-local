# Growthub Agent Worker Kit — Free Claude Code Proxy v1

**Kit ID:** `growthub-free-claude-code-v1`
**Version:** `1.0.0`
**Type:** `worker`
**Execution mode:** `export`
**Family:** `studio`

---

## What this kit does

This kit gives an agent a self-contained environment for operating the `free-claude-code` FastAPI proxy — a drop-in replacement for the Anthropic API endpoint that routes Claude Code (CLI and VS Code) traffic to free or local backends (NVIDIA NIM, OpenRouter, DeepSeek, LM Studio, llama.cpp).

It packages:
- agent operating instructions (`workers/free-claude-code-operator/CLAUDE.md`)
- a locked 9-phase operator workflow (`skills.md`)
- fork setup scripts (`setup/clone-fork.sh`, `setup/verify-env.mjs`, `setup/check-deps.sh`)
- provider-selection, model-matrix, routing-config, proxy-runbook, and Claude Code handoff templates
- worked examples for the Growthub operator laptop
- architecture + routing + security docs
- output standards
- examples and contributor metadata

The intended operator is an AI coding agent running against an unmodified Claude Code CLI, talking to a local uvicorn proxy bound to `127.0.0.1:8082`.

---

## Folder structure

```text
growthub-free-claude-code-v1/
├── kit.json
├── .env.example
├── QUICKSTART.md
├── skills.md
├── output-standards.md
├── runtime-assumptions.md
├── validation-checklist.md
├── bundles/
│   └── growthub-free-claude-code-v1.json
├── workers/
│   └── free-claude-code-operator/CLAUDE.md
├── brands/
│   ├── _template/brand-kit.md
│   ├── growthub/brand-kit.md
│   └── NEW-CLIENT.md
├── setup/
│   ├── clone-fork.sh
│   ├── verify-env.mjs
│   └── check-deps.sh
├── templates/
│   ├── provider-selection.md
│   ├── model-matrix.md
│   ├── routing-config.md
│   ├── proxy-runbook.md
│   └── claude-code-handoff.md
├── examples/
│   ├── provider-selection-sample.md
│   ├── model-matrix-sample.md
│   └── claude-code-handoff-sample.md
├── docs/
│   ├── free-claude-code-fork-integration.md
│   ├── proxy-architecture.md
│   ├── provider-routing.md
│   └── security-and-isolation.md
├── output/README.md
└── growthub-meta/
    ├── README.md
    └── kit-standard.md
```

---

## Activation

1. Export the kit via `growthub kit download growthub-free-claude-code-v1`.
2. Run `bash setup/clone-fork.sh` to clone and install the upstream fork.
3. Add at least one provider key (or local base URL) to `$FREE_CLAUDE_CODE_HOME/.env`.
4. Point the agent working directory at the expanded kit folder.
5. The agent reads `workers/free-claude-code-operator/CLAUDE.md`.
6. `skills.md` provides the operator methodology for every session.
7. Run `/fcc-up` in your AI agent, then export `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` in the shell that runs `claude`.

---

## Supported output categories

- provider-selection brief
- model-matrix (probed)
- routing-config
- proxy-runbook
- claude-code-handoff
