# Growthub Agent Worker Kit — Postiz Social Scheduler v1

**Kit ID:** `growthub-postiz-social-scheduler-v1`
**Version:** `1.0.0`
**Type:** `worker`
**Family:** `studio`
**Execution mode:** `export`

---

## What this kit does

This kit gives an agent a self-contained environment for social media content planning, scheduling, and execution support around the Postiz open-source platform.

It packages:
- agent operating instructions
- a locked methodology for social media campaign production
- fork/runtime assumptions for Postiz (Docker, NestJS + Next.js)
- platform-specific format templates for 8+ social networks
- content module library (hooks, body copy, CTAs)
- caption and hashtag strategy systems
- examples
- output standards
- contributor metadata

The intended operator is an AI social media strategist, content planner, or scheduling operator working against a local Postiz fork, browser-hosted instance, or API-direct integration.

---

## Folder structure

```text
growthub-postiz-social-scheduler-v1/
├── kit.json
├── bundles/
├── workers/
├── brands/
├── templates/
│   ├── social-formats/
│   ├── content-modules/
│   └── hooks-library/
├── examples/
├── docs/
├── setup/
├── growthub-meta/
├── skills.md
├── output-standards.md
├── runtime-assumptions.md
└── validation-checklist.md
```

---

## Activation

1. Export the kit.
2. Point the agent working directory at the expanded folder.
3. The agent reads `workers/postiz-social-scheduler-operator/CLAUDE.md`.
4. `skills.md` provides the working method for every session.

---

## Supported output categories

- campaign brief
- content calendar
- post drafts (per platform)
- caption matrix
- hashtag matrix
- QA checklist
- platform-ready execution handoff
