# Growthub Agent Worker Kit — AI Website Cloner v1

**Kit ID:** `growthub-ai-website-cloner-v1`  
**Version:** `1.0.0`  
**Type:** `worker`  
**Execution mode:** `export`

---

## What this kit does

This kit gives an agent a self-contained environment for cloning any website into a modern Next.js codebase using AI coding agents backed by the `ai-website-cloner-template` fork.

It packages:
- agent operating instructions
- a locked 8-phase clone pipeline methodology
- fork setup scripts and verification tools
- component spec templates with exact CSS extraction methodology
- parallel builder dispatch system documentation
- design token extraction workflow
- visual QA standards
- output standards
- examples and contributor metadata

The intended operator is an AI coding agent orchestrator working against the `ai-website-cloner-template` fork to produce pixel-perfect website clones for platform migration, design reference, or modernization projects.

---

## Folder structure

```text
growthub-ai-website-cloner-v1/
├── kit.json
├── bundles/
├── workers/
├── brands/
├── templates/
├── examples/
├── docs/
├── growthub-meta/
├── setup/
├── output/
├── skills.md
├── output-standards.md
├── runtime-assumptions.md
└── validation-checklist.md
```

---

## Activation

1. Export the kit via `growthub kit download growthub-ai-website-cloner-v1`
2. Run `bash setup/clone-fork.sh` to set up the upstream fork
3. Point the agent working directory at the expanded kit folder
4. The agent reads `workers/ai-website-cloner-operator/CLAUDE.md`
5. `skills.md` provides the working method for every session
6. Run `/clone-website <target-url>` in your AI agent chat

---

## Supported output categories

- clone brief
- reconnaissance report
- design token extraction sheet
- component specs (one per section)
- asset manifest
- builder dispatch plan
- visual QA checklist
- platform handoff document
