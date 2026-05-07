# Workspace Deploy Flow — Full Deployment Path

This document maps the exact CLI steps from scaffold to live deployment, grounded in existing primitives. Every step is a real command with a JSON output path for agent use.

---

## Workspace helper commands — agent bootstrap (new in this release)

These aggregate existing primitives into single JSON envelopes. Start here for agent use.

| Command | What it answers |
|---------|----------------|
| `growthub workspace status --json` | Unified health: bridge, GitHub, fork, agents, config, apps |
| `growthub workspace qa --json` | Validation: config, env, deps, fork, routes, skills |
| `growthub workspace deploy check --json` | Can this workspace deploy? missingSteps, appRoot, envVarsNeeded |
| `growthub workspace deploy status --json` | Full deploy primitives: bridge, GitHub, fork, agents |
| `growthub workspace deploy vercel --check --json` | Vercel-specific: appRoot, vercelProjectDetected, deployCommands |
| `growthub workspace deploy vercel --print-env --json` | Print env var names from .env.example |
| `growthub workspace upstream check --json` | Fork drift state + healCommand + prCommand |
| `growthub workspace upstream heal --dry-run --json` | Preview upstream heal without applying |
| `growthub workspace surface list --json` | Detect apps/workspace, apps/agency-portal, studio |
| `growthub workspace portal prepare --client <slug> --json` | Scaffold client brand config, env template, handoff doc |

**Recommended agent sequence:**
```bash
growthub workspace status --json
growthub workspace qa --json
growthub workspace deploy check --json
growthub workspace deploy vercel --print-env --json
```

---

## Prerequisite primitives (all already ship in the CLI)

| Primitive | Source | What it provides |
|-----------|--------|-----------------|
| `growthub auth login` | `commands/auth-login.ts` | Growthub hosted session (Bridge authority) |
| `growthub github login` | `commands/github.ts` | GitHub device-flow or PAT token |
| `growthub github whoami --json` | `commands/github.ts` | Bridge + direct GitHub status |
| `growthub integrations status --json` | `commands/integrations.ts` | All connected integrations from Bridge |
| `growthub integrations probe --provider github --json` | `commands/integrations.ts` | Resolved credential for specific provider |
| `growthub bridge agents list --json` | `commands/bridge.ts` | Bound hosted agents on this workspace |
| `growthub bridge agents bind <slug> --fork .` | `commands/bridge.ts` | Bind hosted agent; writes `.growthub-fork/agents/` |
| `growthub kit fork create` | `commands/kit-fork-remote.ts` | One-click GitHub fork + scaffold + register |
| `growthub kit fork connect` | `commands/kit-fork-remote.ts` | Connect existing fork to GitHub remote |
| `growthub kit fork policy` | `commands/kit-fork-remote.ts` | View/edit remoteSyncMode, autoApprove |
| `growthub kit fork heal` | `commands/kit-fork.ts` | Sync fork with upstream + push branch/PR |
| `growthub kit health . --json` | `runtime/kit-health/index.ts` | Health report including self-improving checks |
| `growthub workspace improve propose` | `commands/workspace-improve.ts` | Propose capability after run |
| `growthub kit publish validate . --json` | `commands/kit-publish.ts` | Community publish readiness |

---

## Full deployment path — step by step

### When Growthub Bridge is active (recommended)

This is the fastest path. Bridge provides GitHub credentials, integration connections, and hosted agent execution authority without local credential management.

```
Step 0: Verify Bridge is active
Step 1: Scaffold governed workspace
Step 2: Register fork (local governance)
Step 3: Connect GitHub remote via Bridge credential
Step 4: Bind hosted agents
Step 5: Configure deploy policy
Step 6: Deploy to Vercel (or target platform)
Step 7: Verify integrations are live
```

---

#### Step 0 — Verify Bridge is active

**Human (discovery CLI):**
```bash
growthub auth login
growthub auth whoami
```

**Agent (JSON):**
```bash
node cli/dist/index.js auth whoami --json
```

Output shape:
```json
{
  "status": "ok",
  "email": "user@example.com",
  "growthubConnected": true,
  "bridgeAvailable": true
}
```

Check Bridge + GitHub in one call:
```bash
node cli/dist/index.js github whoami --json
```

Output shape:
```json
{
  "connected": true,
  "effectiveSource": "growthub-bridge",
  "direct": null,
  "bridge": {
    "growthubConnected": true,
    "growthubLogin": "user@example.com",
    "bridgeAvailable": true,
    "github": {
      "provider": "github",
      "handle": "gh-username",
      "ready": true,
      "scopes": ["repo", "workflow"]
    }
  }
}
```

If `effectiveSource` is `"growthub-bridge"` or `"direct"` → proceed. Otherwise run `growthub github login`.

---

#### Step 1 — Scaffold governed workspace

**Human (setup wizard — recommended first time):**
```bash
growthub setup wizard
```

Wizard asks: workspace type → output path → self-improving feature → Bridge connection.

**Human (direct):**
```bash
growthub starter init --kit growthub-custom-workspace-starter-v1 --out ./my-workspace
# or for agency portal:
growthub starter init --kit growthub-agency-portal-starter-v1 --out ./my-portal
```

**Agent (JSON):**
```bash
node cli/dist/index.js starter init \
  --kit growthub-custom-workspace-starter-v1 \
  --out ./my-workspace \
  --json
```

Output shape:
```json
{
  "status": "ok",
  "forkId": "fork_abc123",
  "kitId": "growthub-custom-workspace-starter-v1",
  "forkPath": "/path/to/my-workspace",
  "baseVersion": "1.0.0",
  "policyMode": "off"
}
```

---

#### Step 2 — Register fork (creates .growthub-fork/)

Scaffold auto-registers. Verify:

```bash
growthub kit fork status <fork-id> --json
```

Output shape:
```json
{
  "forkId": "fork_abc123",
  "kitId": "growthub-custom-workspace-starter-v1",
  "forkPath": "/path/to/my-workspace",
  "overallSeverity": "none",
  "fileDrifts": [],
  "customSkillsDetected": []
}
```

---

#### Step 3 — Connect GitHub remote (Bridge credential used automatically)

**One-click fork on GitHub + connect in one command:**

```bash
growthub kit fork create \
  --kit growthub-custom-workspace-starter-v1 \
  --upstream Growthub-ai/growthub-custom-workspace-starter-v1 \
  --out ./my-workspace \
  --json
```

Output shape:
```json
{
  "status": "ok",
  "forkId": "fork_abc123",
  "kitId": "growthub-custom-workspace-starter-v1",
  "forkPath": "/path/to/my-workspace",
  "remote": {
    "provider": "github",
    "owner": "your-org",
    "repo": "my-workspace",
    "defaultBranch": "main",
    "htmlUrl": "https://github.com/your-org/my-workspace"
  }
}
```

**Or connect existing local fork to an existing GitHub repo:**
```bash
growthub kit fork connect \
  --fork-id fork_abc123 \
  --remote your-org/my-workspace \
  --json
```

---

#### Step 4 — Bind hosted agents

**Human:**
```bash
growthub bridge agents list
growthub bridge agents bind <agent-slug> --fork ./my-workspace
```

**Agent (JSON — list first, then bind):**
```bash
# List available agents
node cli/dist/index.js bridge agents list --json

# Bind specific agent
node cli/dist/index.js bridge agents bind <agent-slug> \
  --workspace-path ./my-workspace \
  --allow-local \
  --json
```

Binding is written to `.growthub-fork/agents/<slug>.json` with:
```json
{
  "agentSlug": "<slug>",
  "executionAuthority": "gh-app",
  "localExecution": false
}
```

Execution stays hosted. The binding is a read-only projection.

---

#### Step 5 — Configure deploy policy

Set `remoteSyncMode=pr` so every heal creates a reviewable PR:

```bash
growthub kit fork policy <fork-id> \
  --set remoteSyncMode=pr \
  --set autoApprove=additive \
  --json
```

Or interactively:
```bash
growthub kit fork policy <fork-id> --edit
```

---

#### Step 6 — Deploy to Vercel

The agency portal kit ships `apps/agency-portal/vercel.json`. The Vercel deploy happens outside the CLI (Vercel CLI or Vercel Dashboard), but the CLI provides the environment variable surface:

**Verify required env vars are set:**
```bash
node setup/verify-env.mjs
```

**Get integration credentials for the Vercel environment:**
```bash
node cli/dist/index.js integrations probe --provider github --json
# → { resolved: true, handle: "gh-username", scopes: [...] }

node cli/dist/index.js integrations status --json
# → { growthubConnected: true, bridgeAvailable: true, integrations: [...] }
```

**Deploy (Vercel CLI — outside Growthub scope, but this is the wire):**
```bash
cd apps/agency-portal
vercel --env GROWTHUB_BRIDGE_ACCESS_TOKEN=$TOKEN --env GROWTHUB_BRIDGE_BASE_URL=https://www.growthub.ai
```

The agency portal kit reads `GROWTHUB_BRIDGE_ACCESS_TOKEN` at runtime and calls the Bridge to resolve integration connections server-side. Integration authority stays with the hosted gh-app.

---

#### Step 7 — Verify integrations are live

**Post-deploy check:**
```bash
# Bridge is the authority — check all integrations resolve
node cli/dist/index.js integrations status --json

# Check self-improving workspace health
bash helpers/check-self-improving-health.sh --json

# Run full kit health report
node cli/dist/index.js kit health . --json
```

Kit health output shape:
```json
{
  "kitId": "growthub-custom-workspace-starter-v1",
  "overall": "pass",
  "checks": [
    { "id": "kit-json", "severity": "pass", "label": "kit.json present" },
    { "id": "primitive-1-skill-md", "severity": "pass", "label": "SKILL.md" },
    { "id": "si-proposals-dir", "severity": "info", "label": "capabilities/proposals/" },
    { "id": "si-agent-bindings", "severity": "pass", "label": "Hosted agent bindings detected" }
  ]
}
```

---

### When Bridge is NOT active (local-only path)

Use direct GitHub token + BYO credentials. The path is identical except:

- Step 0: `growthub github login` (device flow) instead of `growthub auth login`
- Step 4: Skip agent binding (no hosted authority)
- Step 6: Set `AGENCY_PORTAL_BYO_CONNECTIONS_JSON` instead of `GROWTHUB_BRIDGE_ACCESS_TOKEN`

The `github-resolver.ts` preference order handles this automatically:
1. Direct CLI auth (`growthub github login`)
2. Growthub Bridge (`growthub auth login` + connected GitHub integration)

---

## Complete agent-runnable sequence (Bridge active)

```bash
# 0. Verify Bridge + GitHub
node cli/dist/index.js github whoami --json

# 1. Scaffold
node cli/dist/index.js starter init \
  --kit growthub-custom-workspace-starter-v1 \
  --out ./my-workspace --json

cd my-workspace

# 2. Status check
node cli/dist/index.js kit fork status $(cat .growthub-fork/fork.json | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).forkId))") --json

# 3. Create GitHub fork + connect
node cli/dist/index.js kit fork create \
  --kit growthub-custom-workspace-starter-v1 \
  --upstream Growthub-ai/growthub-custom-workspace-starter-v1 \
  --out . --json

# 4. List + bind agents
node cli/dist/index.js bridge agents list --json
node cli/dist/index.js bridge agents bind <agent-slug> --workspace-path . --allow-local --json

# 5. Set deploy policy
node cli/dist/index.js kit fork policy <fork-id> --set remoteSyncMode=pr --json

# 6. Health check
node cli/dist/index.js kit health . --json

# 7. Integration status
node cli/dist/index.js integrations status --json

# 8. Propose first capability (self-improving feature)
node cli/dist/index.js workspace improve propose \
  --from-run deploy-session-001 \
  --summary "Initial portal deployment capability" \
  --json
```

---

## Discovery CLI (human interactive) — sub-branches

The `growthub discover` hub routes to every surface above:

```
growthub discover
  → Worker Kits        → kit list / download / inspect
  → Starter            → starter init (wizard path)
  → Bridge / Agents    → bridge agents list / bind
  → GitHub             → github login / whoami
  → Integrations       → integrations status / probe
  → Kit Fork           → kit fork create / connect / policy / heal
  → Setup Wizard       → setup wizard (all steps in one flow)
  → Workspace Improve  → workspace improve propose / list / promote
```

Each branch is independently accessible for humans and has a `--json` flag for agents.

---

## Reference: all deploy-relevant commands with --json support

```bash
# Auth / identity
growthub auth login
growthub auth whoami --json
growthub github login [--token <pat>] [--no-browser]
growthub github whoami --json
growthub github status --json

# Integrations (Bridge)
growthub integrations status --json
growthub integrations list --json
growthub integrations probe --provider github --json
growthub integrations probe --provider vercel --json

# Workspace scaffold
growthub starter init --kit <id> --out <path> --json
growthub setup wizard [--profile <type>] [--out <path>]

# Fork management
growthub kit fork register <path> --json
growthub kit fork create --kit <id> --upstream <owner/repo> --out <path> --json
growthub kit fork connect --fork-id <id> --remote <owner/repo> --json
growthub kit fork status <fork-id> --json
growthub kit fork policy <fork-id> --set remoteSyncMode=pr --json
growthub kit fork heal <fork-id> [--dry-run] --json
growthub kit fork trace --fork-id <id> --tail 20 --json

# Bridge / agents
growthub bridge agents list --json
growthub bridge agents inspect <slug> --json
growthub bridge agents bind <slug> --workspace-path <path> --allow-local --json
growthub bridge agents bindings <path> --allow-local --json

# Health
growthub kit health <path> --json
growthub skills validate --json

# Self-improving feature (optional, any governed workspace)
growthub workspace improve propose --from-run <id> --json
growthub workspace improve list --json
growthub workspace improve inspect <slug> --json
growthub workspace improve promote <slug> --yes --json

# Community publish
growthub kit publish validate <path> --json
growthub kit publish pack <path> --json
```
