# Growthub Agent Worker Kit — Email Marketing Strategist v1

**Kit ID:** `growthub-email-marketing-v1`  
**Version:** `1.0.0`  
**Type:** `worker`  
**Execution mode:** `export`  
**Schema version:** `2`

---

## What this kit does

This kit gives an agent a complete, self-contained environment for Growthub-focused email marketing work. When exported and pointed at via the agent Working Directory, the agent can:

- Write brand-aware email copy aligned to Growthub's voice, positioning, and messaging pillars
- Plan campaigns around Growthub's 5 content pillars
- Structure nurture, outbound, follow-up, promotional, and re-engagement sequences
- Produce implementation-ready output artifacts (campaign briefs, sequence plans, email drafts, subject line matrices, CTA matrices, QA checklists)
- Push final draft outputs to an email platform (GHL or any future platform integration) via the platform adapter pattern documented in `runtime-assumptions.md`

---

## How to activate

1. Export the kit: `growthub kit download growthub-email-marketing-v1`
2. Point the agent's Working Directory at the exported folder
3. The agent reads `workers/email-marketing-strategist/CLAUDE.md` as its entrypoint
4. `skills.md` is the source of truth for methodology — the agent reads it first on every session

---

## Folder structure

```
growthub-email-marketing-v1/
├── kit.json                                     ← master manifest
├── bundles/
│   └── growthub-email-marketing-v1.json         ← export bundle definition
├── growthub-meta/
│   ├── README.md                                ← this file
│   └── kit-standard.md                          ← locked contributor contract
├── skills.md                                    ← master methodology
├── output-standards.md                          ← output format contract
├── runtime-assumptions.md                       ← platform integration docs
├── workers/
│   └── email-marketing-strategist/
│       └── CLAUDE.md                            ← agent entrypoint
├── brands/
│   ├── _template/brand-kit.md                   ← blank template
│   └── growthub/brand-kit.md                    ← Growthub canonical brand kit
├── templates/
│   ├── campaign-brief-template.md
│   ├── sequence-planner.md
│   ├── email-draft.md
│   ├── subject-line-matrix.md
│   ├── cta-matrix.md
│   ├── qa-checklist.md
│   ├── email-formats/                           ← 5 frozen campaign formats
│   ├── email-modules/                           ← modular copy primitives
│   └── hooks-library/                           ← subject line pattern library
└── examples/                                    ← reference outputs
```

---

## Supported output types

| Output | Description |
|---|---|
| `campaign-brief` | Full campaign spec — pillar, segment, format, arc, CTA, compliance |
| `email-sequence` | Multi-email sequence plan + individual email drafts |
| `broadcast` | Single one-off email draft |
| `subject-line-matrix` | 5+ subject line variants per email with preview text |
| `cta-matrix` | Primary, soft, and reply CTA variants |
| `qa-checklist` | Pre-send review checklist |

---

## Email platform integration

This kit uses a platform-agnostic adapter pattern. GoHighLevel (GHL) is the reference implementation. See `runtime-assumptions.md` for the full interface spec, GHL adapter details, and how to extend to additional platforms.

---

## Setup notes

- No build step required — all outputs are Markdown
- No npm dependencies — the kit runs with the agent's native tools
- Browser use is optional but supported (see `runtime-assumptions.md`)
- API credentials must be set as environment variables — never stored in kit files

---

## File naming convention

```
output/<client-slug>/<campaign-slug>/<ClientSlug>_<CampaignType>_<Pillar>_v<N>_<YYYYMMDD>.md
```

Example: `output/growthub/q2-nurture/Growthub_Nurture_Automation_v1_20260410.md`

---

## Version history

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-04-10 | Initial release |
