# Kit Standard — growthub-postiz-social-v1

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
| `workers/postiz-social-operator/CLAUDE.md` | Agent entrypoint | No |
| `brands/_template/brand-kit.md` | Blank brand kit template | No |
| `brands/growthub/brand-kit.md` | Example brand kit | No |
| `brands/NEW-CLIENT.md` | New client instructions | No |
| `setup/clone-fork.sh` | Fork installation script | No |
| `setup/verify-env.mjs` | Environment verification | No |
| `setup/check-deps.sh` | Dependency check | No |
| `output/README.md` | Output directory guide | No |
| All 7 template files | Campaign output templates | No — each must have all sections |
| All 4 example files | Reference samples | No — must contain realistic filled data |
| All 4 doc files | Technical reference | No |
| `bundles/growthub-postiz-social-v1.json` | Bundle manifest | No |
| `growthub-meta/README.md` | Kit metadata | No |
| `growthub-meta/kit-standard.md` | This file | No |

---

## Bundle Contract

| Requirement | Rule |
|---|---|
| Bundle ID | Must match kit ID: `growthub-postiz-social-v1` |
| Kit ID in bundle | Must be `growthub-postiz-social-v1` |
| Worker ID in bundle | Must be `postiz-social-operator` |
| Schema version | Must be `2` |
| `requiredFrozenAssets` | Must list all files in `kit.json` `frozenAssetPaths` |
| Export folder name | `growthub-agent-worker-kit-postiz-social-v1` |
| Export zip name | `growthub-agent-worker-kit-postiz-social-v1.zip` |

---

## Agent Rules

### Workflow Order

The operator must follow the 10-step workflow in `workers/postiz-social-operator/CLAUDE.md` strictly. Steps must not be skipped or reordered. The environment gate (Step 0) must run before anything else.

### Platform IDs

The operator must only use platform IDs from `docs/platform-coverage.md`. Invented platform slugs are not acceptable. If the user requests a platform not in the coverage doc, the operator must note it as unsupported in the current Postiz instance and suggest the nearest supported alternative.

### Caption Variants

Every post in the Caption Copy Deck must have exactly 3 variants (A, B, C). The variants must be meaningfully different in opening hook and structure — not minor word substitutions. Character limits must be checked and documented for every variant.

### Scheduling Manifest

When a scheduling manifest is produced:
- `dryRun` must be `true` in agent-only mode
- All `scheduledAt` values must be ISO 8601 with explicit timezone
- All `postId` values must follow the naming convention
- No manifest may reference a platform not confirmed to be connected in the Postiz instance

### No Secrets in Outputs

The operator must never include `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, OAuth tokens, or any other secret value in any output file. `.env.example` uses placeholder comments only.

### Template-Bound Outputs

All output artifacts must use the templates in `templates/`. The operator must not invent new template schemas or change the required section structure.

---

## Runtime Rules

### Three Execution Modes Are First-Class

`local-fork`, `agent-only`, and `hybrid` are all valid execution modes. The kit must never require local-fork mode for a session to produce valid campaign outputs. Agent-only mode is always a valid fallback for campaign planning, caption drafting, and dry-run scheduling manifests.

### Postiz Is the Reference Substrate

The platform integrations, BullMQ queue configuration, and API contract in the Postiz fork are the source of truth for scheduling behavior. The kit documents and wraps that behavior — it does not redefine it. When the upstream Postiz API changes, `runtime-assumptions.md` must be updated.

### Markdown Is the Primary Output Format

All campaign artifacts are Markdown files. The scheduling manifest is a JSON file. These are the canonical records — no other formats are produced by this kit unless explicitly requested.

---

## Versioning Rules

| Scenario | Action |
|---|---|
| Bug fix in a template or doc file | Patch version bump: `1.0.0` → `1.0.1` |
| New template or platform added | Minor version bump: `1.0.0` → `1.1.0` |
| Workflow restructured or output schema changed | Major version bump: `1.0.0` → `2.0.0` |
| Upstream Postiz adds new platform integration | Minor bump + update `runtime-assumptions.md` and `docs/platform-coverage.md` |
| Postiz changes API contract | Major bump if breaking + update `runtime-assumptions.md` and `docs/bullmq-queue-layer.md` |

Version bumps must update:
- `kit.json` → `kit.version`
- `bundles/growthub-postiz-social-v1.json` → `bundle.version`
- `growthub-meta/README.md` → Version field
- `runtime-assumptions.md` → Frozen date and changelog note
