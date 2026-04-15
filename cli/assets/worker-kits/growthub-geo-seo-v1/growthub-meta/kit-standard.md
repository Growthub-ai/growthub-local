# Kit Standard — growthub-geo-seo-v1

**These rules govern the kit's structure, agent behavior, and output contract. All operators and maintainers must follow them.**

---

## Required Files Contract

The following files must be present in every valid kit installation. Any missing file constitutes a broken kit.

| File | Purpose | Can Be Empty? |
|---|---|---|
| `kit.json` | Kit manifest | No — must be valid JSON with schemaVersion: 2 |
| `QUICKSTART.md` | User-facing setup guide | No |
| `.env.example` | Environment template | No |
| `skills.md` | Master methodology doc | No — must contain all 10 steps |
| `output-standards.md` | Output rules | No |
| `runtime-assumptions.md` | Upstream assumptions | No |
| `validation-checklist.md` | Pre-session checklist | No |
| `workers/geo-seo-operator/CLAUDE.md` | Agent entrypoint | No |
| `brands/_template/brand-kit.md` | Blank brand kit template | No |
| `brands/growthub/brand-kit.md` | Example brand kit | No |
| `brands/NEW-CLIENT.md` | New client instructions | No |
| `setup/clone-fork.sh` | Fork installation script | No |
| `setup/verify-env.mjs` | Environment verification | No |
| `setup/check-deps.sh` | Dependency check | No |
| `output/README.md` | Output directory guide | No |
| All 11 template files | Audit output templates | No — each must have all sections |
| All 4 example files | Reference samples | No — must contain realistic filled data |
| All 4 doc files | Technical reference | No |
| `bundles/growthub-geo-seo-v1.json` | Bundle manifest | No |
| `growthub-meta/README.md` | Kit metadata | No |
| `growthub-meta/kit-standard.md` | This file | No |

---

## Bundle Contract

| Requirement | Rule |
|---|---|
| Bundle ID | Must match kit ID: `growthub-geo-seo-v1` |
| Kit ID in bundle | Must be `growthub-geo-seo-v1` |
| Worker ID in bundle | Must be `geo-seo-operator` |
| Schema version | Must be `2` |
| `requiredFrozenAssets` | Must list all files in `kit.json` `frozenAssetPaths` |
| Export folder name | `growthub-agent-worker-kit-geo-seo-v1` |
| Export zip name | `growthub-agent-worker-kit-geo-seo-v1.zip` |

---

## Agent Rules

### Workflow Order
The operator must follow the 10-step workflow in `workers/geo-seo-operator/CLAUDE.md` strictly. Steps must not be skipped or reordered. The environment gate (Step 0) must run before anything else.

### Fork Inspection
In local-fork mode, the operator must inspect the actual fork files before producing any audit plan or command selection. Assumptions cannot substitute for inspection. If the fork is unavailable, the session must be marked `agent-only` and every output file must note the execution mode.

### One Primary Command Path
Each audit session must select one primary `/geo` command. Mixed-mode outputs (e.g., simultaneously running `/geo audit` and `/geo quick`) are not permitted without explicit transition notes.

### Scoring Formula
The GEO Score must always use the exact formula defined in `docs/scoring-methodology.md`. Component weights must not be adjusted per-session. A different weighting scheme is not a valid substitution.

### Citability Algorithm
The citability score must apply all 5 metrics. Shortcutting to 2 or 3 metrics is not acceptable. If data for a metric is unavailable, use 50 as the neutral default and flag the metric as `data-gap`.

### No Secrets in Outputs
The operator must never include `ANTHROPIC_API_KEY`, `FLASK_SECRET_KEY`, or any other secret value in any output file. If a brand kit contains sensitive context in `crm_notes`, that section must not be included verbatim in client-facing outputs.

### Template-Bound Outputs
All output artifacts must use the templates in `templates/`. The operator must not invent new template schemas or change the required section structure.

---

## Runtime Rules

### No Secrets in Kit
The kit itself must never contain a real API key, password, or credential. `.env.example` uses placeholder comments only. The `.env` file (which may contain real keys) must never be committed or included in kit exports.

### geo-seo-claude Is the Reference Substrate
The Python scripts, CLI skills, and subagent definitions in geo-seo-claude are the source of truth for tool behavior. The kit documents and wraps that behavior — it does not redefine it. When the upstream fork changes, `runtime-assumptions.md` must be updated.

### Three Execution Modes Are First-Class
`local-fork`, `agent-only`, and `hybrid` are all valid execution modes. The kit must never require local-fork mode for a session to produce valid outputs. Agent-only mode is always a valid fallback.

### Markdown Is the Primary Output Format
All audit artifacts are Markdown files. PDF output is generated on request from `geo_score_data.json` using `generate_pdf_report.py`. Markdown is the canonical record — PDFs are presentation layers.

---

## Versioning Rules

| Scenario | Action |
|---|---|
| Bug fix in a template or doc file | Patch version bump: `1.0.0` → `1.0.1` |
| New template or command added | Minor version bump: `1.0.0` → `1.1.0` |
| Scoring formula changed or workflow restructured | Major version bump: `1.0.0` → `2.0.0` |
| Upstream fork adds new command | Minor bump + update `runtime-assumptions.md` |
| Upstream fork changes script API | Major bump if breaking + update `runtime-assumptions.md` |

Version bumps must update:
- `kit.json` → `kit.version`
- `bundles/growthub-geo-seo-v1.json` → `bundle.version`
- `growthub-meta/README.md` → Version field
- `runtime-assumptions.md` → Frozen date and changelog note

---

## What Makes a Good Kit Contribution

- Every template section must be production-ready — no placeholder text except `<!-- fill in -->` markers
- Every example file must contain realistic, fictitious-but-plausible data — no Lorem ipsum
- Every doc file must be grounded in actual geo-seo-claude fork behavior at time of writing
- Scoring rules must be internally consistent — weights in `skills.md`, `docs/scoring-methodology.md`, and `docs/subagent-dispatch.md` must all match
- Setup scripts must be idempotent — running them twice must not break anything
