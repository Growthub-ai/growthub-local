# Phase 1: Fork UX Consolidation — Visual Implementation Matrix

## Commands & Features Overview

### 1. Rich Fork Status Layer

```
┌─ growthub kit fork list ──────────────────────────────────────────────────┐
│                                                                            │
│  Fork ID                Kit               Status      Protected   Last   │
│  ───────────────────── ─────────────────  ──────────  ──────────  ─────  │
│  fork-blog-engine      higgsfield         drift-minor  skills/,.. 2h ago │
│  fork-social-ops       postiz             drift-major  —          —       │
│  fork-qa-harness       qwen-code          synced       —          15m ago │
│                                                                            │
│  NEW: table-renderer.ts utility + formatting helpers                     │
│  FLAGS: --json | --sort-by | --filter                                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌─ growthub kit fork status <fork-id> ──────────────────────────────────────┐
│                                                                            │
│  Fork: fork-blog-engine  drift-minor                                     │
│  Kit: higgsfield  v1.0.5 → v1.0.6                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                            │
│  SAFE ADDITIONS (3):                    HEAL PLAN PREVIEW:              │
│    + src/new-skill.ts                   [████░░░░░░░] 3 apply / 2 skip  │
│    + config/defaults.json               Risk: Low                        │
│    + docs/CHANGELOG.md                                                   │
│                                                                            │
│  PROTECTED (2):                         NEXT STEPS:                      │
│    ○ skills/my-custom-skill.ts          growthub kit fork heal --preview │
│    ○ .env.local                                                          │
│                                                                            │
│  ENHANCED: Include policy eval + plan inline + action suggestions        │
│  FLAGS: --policy-only | --no-upstream-check                             │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌─ growthub kit fork policy <fork-id> ───────────────────────────────────────┐
│                                                                            │
│  ⚙️  Auto-approve dependencies:                                          │
│     ☑  Patch versions (0.0.X)                                           │
│     ☐  Minor versions (0.X.0)                                           │
│     ☐  Major versions (X.0.0)                                           │
│                                                                            │
│  🔒 Protected paths (never modify):                                      │
│     • skills/                                                            │
│     • .env                                                               │
│     • .env.local                                                         │
│     [Add new path] [Remove]                                             │
│                                                                            │
│  🌐 Remote sync mode:                                                    │
│     ☐  Off — no GitHub sync                                            │
│     ☑  PR Draft — create draft PRs                                      │
│     ☐  Direct — push directly                                           │
│                                                                            │
│  NEW: Interactive clack-based editor, --json input/output support       │
│  APPENDS: trace event with old/new policy diff                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Enhanced Heal & Job Management Layer

```
┌─ growthub kit fork heal <fork-id> ────────────────────────────────────────┐
│                                                                            │
│  --preview Flag (NEW):                                                   │
│    Shows colored diff grouped by action type BEFORE applying             │
│    Then prompts: [Yes, apply now] [Background] [No]                     │
│                                                                            │
│  --background Flag (NEW):                                                │
│    Dispatches async job, returns job-id immediately                      │
│    Output: Job ID: heal-20260417-abc123                                 │
│    Desktop notification when done                                        │
│                                                                            │
│  ENHANCEMENTS TO EXISTING:                                               │
│    • Rich colored preview grouped by type                                │
│    • Conflict resolution hints inline                                    │
│    • Action counts (X will apply, Y skipped)                             │
│    • --dry-run already exists, ✓ enhance output                          │
│                                                                            │
│  NEW: progress.ts utility for progress bars                              │
│  NEW: notify.ts utility for desktop notifications                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌─ growthub kit fork jobs ──────────────────────────────────────────────────┐
│                                                                            │
│  Default view (enhanced table):                                          │
│                                                                            │
│  Job ID                    Fork ID            Status     Progress    Age │
│  ────────────────────────  ─────────────────  ──────────  ──────────  ─── │
│  heal-20260417-abc123      fork-blog-engine   running    [███░░░░░░]  2m  │
│  heal-20260417-def456      fork-social-ops    completed  ✓ 100%      5m   │
│  heal-20260417-ghi789      fork-qa-harness    failed     ✗ (3/10)   12m   │
│  heal-20260417-jkl012      fork-workflows     pending    —           1m   │
│                                                                            │
│  --watch <job-id>:                                                       │
│    Live progress bar with current action name                            │
│    Polls every 500ms, exits on completion/error                          │
│                                                                            │
│  --tail <job-id> [n=50]:                                                 │
│    Shows last N trace events from job state                              │
│    Human-readable with timestamps                                        │
│                                                                            │
│  FLAGS: --json | --filter | --watch | --tail                            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Audit & Compliance Layer

```
┌─ growthub kit fork history <fork-id> ──────────────────────────────────────┐
│                                                                            │
│  Fork: fork-blog-engine                                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                            │
│  2024-04-17 14:35:22  [heal_applied]     3 files added, 1 skipped       │
│  2024-04-17 10:22:15  [drift_detected]   severity: warning              │
│  2024-04-17 09:45:03  [policy_updated]   untouchablePaths: skills/, .. │
│  2024-04-16 18:12:44  [fork_registered]  base v1.0.5, auto-detected    │
│                                                                            │
│  NEW: Audit timeline with trace events                                   │
│  FLAGS: --json | --csv | --since | --until | --event-type              │
│  EXPORT: RFC 4180 CSV for compliance tools                               │
│                                                                            │
│  Trace format (standardized):                                            │
│  {                                                                        │
│    "timestamp": "2024-04-17T14:35:22Z",    (ISO 8601)                  │
│    "eventType": "heal_applied",                                          │
│    "forkId": "fork-blog-engine",                                         │
│    "result": "success",                                                  │
│    "metadata": {                                                         │
│      "filesAdded": 3,                                                    │
│      "filesSkipped": 1,                                                  │
│      "packageUpgrades": 1                                                │
│    }                                                                      │
│  }                                                                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Workspace Starter Enhancements

```
┌─ growthub starter init ───────────────────────────────────────────────────┐
│                                                                            │
│  NEW: --template interactive picker (if not provided):                   │
│                                                                            │
│     Select workspace template:                                           │
│                                                                            │
│     ( ) Solo Studio                  → single kit, minimal scaffold      │
│     (x) Studio + Operators           → pre-wired multi-role              │
│     ( ) Full Agent Team              → with workflows + coordination     │
│     ( ) Custom                       → pick your own kits                │
│                                                                            │
│  TEMPLATE FEATURES:                                                      │
│  • Scaffold structure varies by template                                 │
│  • Pre-generate coordination files:                                      │
│    - team.json (role assignments)                                        │
│    - agent-roles.json (capabilities matrix)                              │
│    - shared-memory-schema.json (if multi-kit)                            │
│    - monitoring-hooks.sh (integration points)                            │
│  • Template-specific .env.example vars                                   │
│                                                                            │
│  --upstream validation & documentation:                                  │
│  • Ensure GitHub token available (if remote sync)                        │
│  • Validate owner/repo format                                            │
│  • Check repo exists before forking                                      │
│  • One-shot fork creation working                                        │
│                                                                            │
│  EXAMPLE:                                                                │
│  growthub starter init --out ./my-workspace \                            │
│    --upstream my-github-org/awesome-kit \                                │
│    --template studio-operators                                           │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Dependency Graph

```
                        ┌─────────────────────────────┐
                        │  Utilities Layer            │
                        │ ─────────────────────────────│
                        │ • table-renderer.ts         │
                        │ • progress.ts               │
                        │ • notify.ts                 │
                        └──────────┬──────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
        ┌──────────────┐   ┌──────────────┐  ┌─────────────┐
        │ Fork Status  │   │ Heal & Jobs  │  │  Audit &    │
        │ Commands     │   │  Commands    │  │  Starter    │
        ├──────────────┤   ├──────────────┤  ├─────────────┤
        │ • list       │   │ • heal       │  │ • history   │
        │ • status     │   │   --preview  │  │ • starter   │
        │ • policy     │   │   --background   │   --template│
        │              │   │ • jobs       │  │ • tracer    │
        │              │   │   --watch    │  │   events    │
        │              │   │   --tail     │  │             │
        └──────────────┘   └──────────────┘  └─────────────┘
                │                  │                 │
                └──────────────────┼─────────────────┘
                                   │
                        ┌──────────▼───────────┐
                        │ Trace & Testing      │
                        ├──────────────────────┤
                        │ • Standardize events │
                        │ • Full test suite    │
                        │ • Kernel validation  │
                        │ • Help text          │
                        └──────────────────────┘
```

---

## File Changes Summary

### New Files
```
cli/src/utils/table-renderer.ts          (reusable table formatting)
cli/src/utils/progress.ts                (progress bar utility)
cli/src/utils/notify.ts                  (desktop notifications)
cli/src/commands/__tests__/kit-fork.phase-1.spec.ts  (full test suite)
scripts/check-fork-ecosystem-kernel.sh   (validation script)
docs/kernel-packets/KERNEL_PACKET_FORK_UX_CONSOLIDATION.md
PHASE_1_IMPLEMENTATION_TODOS.md           (this document structure)
PHASE_1_VISUAL_SUMMARY.md                 (you are here)
```

### Modified Files
```
cli/src/commands/kit-fork.ts
  • Add kit fork list command
  • Enhance kit fork status (inline plan + policy eval)
  • Add kit fork policy command (interactive editor)
  • Enhance kit fork heal (--preview + rich output)
  • Enhance kit fork jobs (--watch + --tail)
  • Add kit fork history command
  • Update help text for all commands

cli/src/commands/starter.ts
  • Add --template interactive picker
  • Enhance --upstream validation
  • Pre-generate coordination files per template

cli/src/kits/fork-trace.ts
  • Standardize trace events
  • Ensure ISO 8601 timestamps (UTC)
  • Add append-only validation

cli/src/kits/fork-types.ts
  • May need minimal updates for new event types
  • Review existing types for completeness

cli/src/index.ts
  • Update help text (line ~1250-1290)
  • Add Phase 1 command examples

README.md
  • Add "Fork UX" subsection
  • Expand fork examples
  • Document --template picker
  • Document background heals

ROADMAP_ENTERPRISE_AGENT_SWARMS.md
  • Reference KERNEL_PACKET_FORK_UX_CONSOLIDATION.md
```

---

## Quality Gates (Definition of Done)

### Code Quality
- [ ] All new commands respond to `--help` with full examples
- [ ] All commands support `--json` for scripting
- [ ] All commands have error handling with next-step hints
- [ ] No new external dependencies (use existing: clack, picocolors, commander, zod)
- [ ] Color output consistent with v0.4.2 style
- [ ] Code follows existing patterns (mirrored from kit.ts, template.ts, etc.)

### Testing
- [ ] Full test suite (kit-fork.phase-1.spec.ts) with >90% coverage
- [ ] All interactive flows tested (clack prompt mocking)
- [ ] File I/O tested (policy.json, trace.jsonl reads/writes)
- [ ] --json output validates against schemas
- [ ] --csv export format is RFC 4180 compliant

### Validation
- [ ] Kernel packet validation script passes
- [ ] Esbuild bundle rebuilt (cli/dist/index.js)
- [ ] `scripts/pr-ready.sh` passes entirely
- [ ] All help text covers all flags + examples

### Documentation
- [ ] README updated with Phase 1 features
- [ ] Kernel packet doc created + linked from roadmap
- [ ] All error messages have actionable next steps
- [ ] Examples include before/after output

### Release Readiness
- [ ] Trace events appended for all operations (audit-ready)
- [ ] No breaking changes to existing fork commands
- [ ] Backwards compatible with v0.4.2 forks
- [ ] Ready for v0.5.0 release (minor version bump)

---

## Weekly Breakdown (Recommended)

```
WEEK 1: Foundations & Table View
├─ Build utilities (table-renderer, progress, notify)
├─ Standardize trace events
├─ Implement growthub kit fork list
└─ Tests for list command

WEEK 2: Policy & Status
├─ Implement growthub kit fork policy (interactive editor)
├─ Enhance growthub kit fork status (policy eval + plan)
└─ Tests for policy/status commands

WEEK 3: Heal & Jobs
├─ Implement growthub kit fork heal --preview
├─ Implement growthub kit fork heal --background
├─ Enhance growthub kit fork jobs (--watch, --tail)
└─ Tests for heal/jobs commands

WEEK 4: Audit, Starter, Release
├─ Implement growthub kit fork history (audit export)
├─ Enhance growthub starter init (--template)
├─ Create kernel packet validation script
├─ Update README & help text
├─ Full integration test suite
└─ Commit esbuild dist + merge
```

---

## Metrics for Phase 1 Success

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Command count | +6 new subcommands | `growthub kit fork --help` lists all |
| Coverage | >90% test coverage | `vitest --coverage` on kit-fork.ts |
| Help text | 100% commands with examples | `--help` output on each command |
| Trace events | 100% operations traced | Check `trace.jsonl` after each op |
| Performance | <500ms for list (100 forks) | `time growthub kit fork list` |
| UX polish | All picocolors + clack | Inspect output for visual consistency |
| Backwards compat | 0 breaking changes | v0.4.2 forks work unchanged |
| Documentation | 100% of Phase 1 in README | README Fork UX section complete |

---

## Success Criteria Checklist

- [ ] All Phase 1 commands implemented + tested
- [ ] Kernel packet frozen & validated before merge
- [ ] Esbuild dist rebuilt & committed
- [ ] README updated with full Phase 1 examples
- [ ] PR passes all checks (tests, lint, kernel validation)
- [ ] v0.5.0 release notes written (customer-first)
- [ ] Published to npm
- [ ] Phase 2 (team coordination) can start from v0.5.0 foundation
