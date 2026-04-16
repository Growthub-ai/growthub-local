# Kit Standard — growthub-zernio-social-v1

**These rules govern the kit's structure, agent behavior, and output contract. All operators and maintainers must follow them.**

---

## Required Files Contract

The following files must be present in every valid kit installation. Any missing file constitutes a broken kit.

| File | Purpose | Can Be Empty? |
|---|---|---|
| `kit.json` | Kit manifest | No — must be valid JSON with `schemaVersion: 2` |
| `QUICKSTART.md` | User-facing setup guide | No |
| `.env.example` | Environment template | No |
| `skills.md` | Master methodology doc | No — must contain all 10 steps |
| `output-standards.md` | Output rules | No |
| `runtime-assumptions.md` | Upstream assumptions | No |
| `validation-checklist.md` | Pre-session checklist | No |
| `workers/zernio-social-operator/CLAUDE.md` | Agent entrypoint | No |
| `brands/_template/brand-kit.md` | Blank brand kit template | No |
| `brands/growthub/brand-kit.md` | Example brand kit | No |
| `brands/NEW-CLIENT.md` | New client instructions | No |
| `setup/verify-env.mjs` | Environment verification | No |
| `setup/check-deps.sh` | Dependency check | No |
| `output/README.md` | Output directory guide | No |
| All 7 template files | Campaign output templates | No — each must have all sections |
| All 4 example files | Reference samples | No — must contain realistic filled data |
| All 6 doc files | Technical reference | No |
| `bundles/growthub-zernio-social-v1.json` | Bundle manifest | No |
| `growthub-meta/README.md` | Kit metadata | No |
| `growthub-meta/kit-standard.md` | This file | No |

---

## Bundle Contract

| Requirement | Rule |
|---|---|
| Bundle ID | Must match kit ID: `growthub-zernio-social-v1` |
| Kit ID in bundle | Must be `growthub-zernio-social-v1` |
| Worker ID in bundle | Must be `zernio-social-operator` |
| Schema version | Must be `2` |
| `requiredFrozenAssets` | Must list all files in `kit.json` `frozenAssetPaths` |
| Export folder name | `growthub-agent-worker-kit-zernio-social-v1` |
| Export zip name | `growthub-agent-worker-kit-zernio-social-v1.zip` |

---

## Agent Rules

### Workflow Order

The operator must follow the 10-step workflow in `workers/zernio-social-operator/CLAUDE.md` strictly. Steps must not be skipped or reordered. The environment gate (Step 0) must run before anything else.

### Platform IDs

The operator must only use Zernio platform IDs from `docs/platform-coverage.md`. Invented platform slugs are not acceptable. If the user requests a platform not in the coverage doc, the operator must note it as unsupported in the current Zernio instance and suggest the nearest supported alternative.

### Caption Variants

Every post in the Caption Copy Deck must have exactly 3 variants (A, B, C). The variants must be meaningfully different in opening hook and structure — not minor word substitutions. Character limits must be checked and documented for every variant.

### Scheduling Manifest

When a scheduling manifest is produced:

- `dryRun` must be `true` in agent-only mode
- All `scheduledFor` values must be ISO 8601 with explicit timezone offset
- All `clientPostId` values must follow the naming convention
- Every `platforms[].platform` must exist in `docs/platform-coverage.md`
- Every `platforms[].accountId` must be a real Zernio account id (live mode) or a clearly-placeholdered handle (agent-only mode)
- No manifest may reference a platform not confirmed via `GET /api/v1/accounts` in live mode

### Idempotency

Every write request to Zernio must carry an `Idempotency-Key` header. The operator uses `clientPostId` from the manifest as that key. Queues use `queue-<name>`. Media uploads use `media-<client-slug>-<YYYYMMDD>-<asset-slug>`.

### No Secrets in Outputs

The operator must never include `ZERNIO_API_KEY`, `ANTHROPIC_API_KEY`, OAuth tokens, or raw auth headers in any output file. `.env.example` uses placeholder comments only.

### Template-Bound Outputs

All output artifacts must use the templates in `templates/`. The operator must not invent new template schemas or change the required section structure.

---

## Runtime Rules

### Three Execution Modes Are First-Class

`api-live`, `agent-only`, and `hybrid` are all valid execution modes. The kit must never require `api-live` mode for a session to produce valid campaign outputs. Agent-only mode is always a valid fallback for campaign planning, caption drafting, and dry-run scheduling manifests.

### Zernio Is the Reference Substrate

The platform integrations, queue model, and API contract at `https://zernio.com/api/v1` are the source of truth for scheduling behavior. The kit documents and wraps that behavior — it does not redefine it. When the Zernio API changes, `docs/zernio-api-integration.md` and `runtime-assumptions.md` must be updated.

### Markdown Is the Primary Output Format

All campaign artifacts are Markdown files. The scheduling manifest is a JSON file. Queue definitions are JSON files. No other formats are produced by this kit unless explicitly requested.

---

## Versioning Rules

| Scenario | Action |
|---|---|
| Bug fix in a template or doc file | Patch version bump: `1.0.0` → `1.0.1` |
| New template or platform added | Minor version bump: `1.0.0` → `1.1.0` |
| Workflow restructured or output schema changed | Major version bump: `1.0.0` → `2.0.0` |
| Zernio adds a new platform integration | Minor bump + update `runtime-assumptions.md` and `docs/platform-coverage.md` |
| Zernio changes the REST contract | Major bump if breaking + update `docs/zernio-api-integration.md` and `runtime-assumptions.md` |

Version bumps must update:

- `kit.json` → `kit.version`
- `bundles/growthub-zernio-social-v1.json` → `bundle.version`
- `growthub-meta/README.md` → Version field
- `runtime-assumptions.md` → Frozen date and changelog note
