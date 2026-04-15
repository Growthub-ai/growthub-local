# Growthub Agent Worker Kit — Twenty CRM v1

**Kit ID:** `growthub-twenty-crm-v1`  
**Version:** `1.0.0`  
**Type:** `worker`  
**Execution mode:** `export`

---

## What this kit does

This kit gives an agent a self-contained environment for implementing, configuring, and operating Twenty CRM — the open-source Salesforce/Apollo alternative — as a growth stack foundation.

It packages:
- agent operating instructions
- a locked CRM methodology
- runtime and deployment assumptions
- API, webhook, and data model reference docs
- CRM implementation templates (12 templates)
- example output artifacts (4 complete samples)
- brand kit system
- output standards
- setup scripts for local-fork and cloud modes
- contributor metadata

The intended operator is a growth engineer, CRM consultant, or AI agent responsible for implementing Twenty CRM for a B2B team and building enrichment pipelines, pipeline automations, and integration handoffs on top of it.

---

## Folder structure

```text
growthub-twenty-crm-v1/
├── kit.json
├── bundles/
├── workers/
│   └── twenty-crm-operator/
│       └── CLAUDE.md
├── brands/
│   ├── _template/brand-kit.md
│   ├── growthub/brand-kit.md
│   └── NEW-CLIENT.md
├── setup/
│   ├── clone-fork.sh
│   ├── verify-env.mjs
│   └── check-deps.sh
├── templates/
│   ├── crm-setup-brief.md
│   ├── data-model-design.md
│   ├── lead-enrichment-pipeline.md
│   ├── pipeline-automation-brief.md
│   ├── webhook-integration-spec.md
│   ├── api-query-plan.md
│   ├── crm-playbook.md
│   ├── custom-object-design.md
│   ├── import-mapping.md
│   ├── workspace-config-checklist.md
│   ├── integration-handoff.md
│   └── enrichment-field-map.md
├── examples/
│   ├── crm-setup-sample.md
│   ├── lead-enrichment-sample.md
│   ├── pipeline-automation-sample.md
│   └── crm-playbook-sample.md
├── docs/
│   ├── twenty-fork-integration.md
│   ├── api-and-webhooks.md
│   └── data-model-layer.md
├── output/
│   └── README.md
├── growthub-meta/
│   ├── README.md
│   └── kit-standard.md
├── skills.md
├── output-standards.md
├── runtime-assumptions.md
├── validation-checklist.md
├── QUICKSTART.md
└── .env.example
```

---

## Activation

1. Export the kit via `growthub kit download growthub-twenty-crm-v1`.
2. Point the agent working directory at the expanded folder.
3. The agent reads `workers/twenty-crm-operator/CLAUDE.md`.
4. `skills.md` provides the working method for every session.

---

## Supported output categories

- CRM setup brief
- data model design
- lead enrichment pipeline
- pipeline automation brief
- webhook integration spec
- API query plan
- custom object design
- import mapping
- workspace config checklist
- integration handoff
- enrichment field map
- CRM playbook

---

## Source repository

Twenty CRM: [github.com/twentyhq/twenty](https://github.com/twentyhq/twenty)  
License: MIT  
Stack: TypeScript / React / NestJS / PostgreSQL / Redis
