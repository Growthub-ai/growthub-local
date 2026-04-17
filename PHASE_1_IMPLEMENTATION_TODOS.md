# Phase 1: Fork UX Consolidation — Implementation Todos

**Goal:** Rich fork status + interactive policy editor + background heals + enhanced starter kit
**Anchor:** v0.4.2 shipped fork-sync, GitHub integration, custom workspace starter
**Outputs:** Production-grade fork operations visible to operators; foundation for Phase 2 team coordination

---

## Section 1: Rich Fork Status Commands

### 1.1 `growthub kit fork list` — Beautiful Fork Table

**File:** `cli/src/commands/kit-fork.ts`

**Location:** Add new command after `addForkSubcommands` function (after line ~795)

**What to build:**
```bash
growthub kit fork list
# Output:
#   Fork ID                  Kit               Base    Latest  Status         Protected     Last Heal
#   ─────────────────────── ──────────────── ──────── ──────── ────────────── ──────────── ──────────
#   fork-blog-engine        higgsfield       1.0.5    1.0.6    drift-minor    skills/,env  2h ago ✓
#   fork-social-ops         postiz           2.1.0    2.1.2    drift-major    —            —
#   fork-qa-harness         qwen-code        0.8.1    0.8.1    synced         —            15m ago ✓

growthub kit fork list --json
# Machine-readable output for scripting
```

**Implementation checklist:**
- [ ] Add `kitForkListTable` function to render beautiful tabular output
  - [ ] Use clack/picocolors for colors (green ✓, yellow ⚠, red ✗, cyan ○)
  - [ ] Truncate long strings with ellipsis (Fork ID max 25 chars, Kit max 20 chars)
  - [ ] Column alignment: left-padded for text, right-padded for status
  - [ ] Include emojis for status: ✓ (synced), ⚠ (drift-minor), ✗ (drift-major), ○ (unknown)
- [ ] Add `--json` support (output array of `ForkSummary` objects)
- [ ] Add `--sort-by` option: id | kit | status | last-heal (default: id)
- [ ] Add `--filter` option: status=synced | status=drift-* | kit=<kit-id>
- [ ] Register as subcommand in `addForkSubcommands`
- [ ] Update help text in `registerKitForkSubcommands` (around line 535)

**Test file:** `cli/src/commands/__tests__/kit-fork.spec.ts` (if doesn't exist, create)

---

### 1.2 `growthub kit fork status <fork-id>` — Deep Drift View (Enhanced)

**File:** `cli/src/commands/kit-fork.ts`

**Current location:** Should exist around line ~750, search for `addForkSubcommands` → `status` subcommand

**What to enhance:**
Currently outputs `printDriftReport(report)`. Enhance with:
- [ ] **Policy evaluation preview** — show which files are protected, which would be auto-approved
- [ ] **Heal plan preview** — inline next to drift report
  - [ ] Counts: `+3 files | ~2 packages | ○ 1 skipped (protected)`
  - [ ] Risk indicator: "Low risk" (only safe additions) vs "Medium" vs "High" (conflicts)
- [ ] **Suggested next steps** — actionable footer
  ```
  Next steps:
    growthub kit fork policy <fork-id>           # adjust protected paths
    growthub kit fork heal <fork-id> --preview   # see heal plan
    growthub kit fork heal <fork-id>             # apply heal (foreground)
  ```
- [ ] **--policy-only** flag — show only policy state + untouchable paths (no heal plan)
- [ ] **--no-upstream-check** — use cached versions (faster, for frequent checks)

**Implementation checklist:**
- [ ] Read fork's `policy.json` inside status command
- [ ] Call `buildKitForkHealPlan` to generate plan (do NOT apply)
- [ ] Integrate plan summary into drift report output
- [ ] Add helper: `printStatusWithNextSteps(drift, plan, policy)` function
- [ ] Add `--policy-only` option handling
- [ ] Add `--no-upstream-check` option (skip version fetch, use cached)
- [ ] Update help text (around line 539)

---

### 1.3 `growthub kit fork policy <fork-id>` — Interactive Policy Editor

**File:** `cli/src/commands/kit-fork.ts` (or extract to new `cli/src/commands/kit-fork-policy.ts` if it gets large)

**New command** — add to `addForkSubcommands` after `status`

**What to build:**
```bash
growthub kit fork policy fork-blog-engine
# Interactive editor with clack-based checkboxes + multiselect:

# 1. Auto-approve dependencies:
#    [x] Patch versions (0.0.X)
#    [ ] Minor versions (0.X.0)
#    [ ] Major versions (X.0.0)

# 2. Require approval for:
#    [x] Critical files (marked below)
#    [x] Custom skill changes
#    [ ] Any action

# 3. Protected paths (never modify):
#    Current: skills/, .env, .env.local
#    [Add] [Remove] [Review]
#    Enter path (glob pattern):
#    > _

# 4. Remote sync mode:
#    ( ) Off — no GitHub sync
#    (x) PR Draft — create draft PRs for review
#    ( ) Direct — push directly to branch

# Apply these settings? [Yes] [Cancel]
```

**Implementation checklist:**
- [ ] Load existing `policy.json` from fork (`<fork>/.growthub-fork/policy.json`)
- [ ] Use clack `multiselect()` for auto-approve checkboxes
- [ ] Use clack `select()` for remote sync mode (radio buttons)
- [ ] Use clack `text()` for adding protected paths (with validation)
- [ ] Build paths list with [Add] / [Remove] loop:
  - [ ] Show current protected paths
  - [ ] Allow user to add/remove interactively
  - [ ] Validate paths (not empty, no leading slashes)
- [ ] Generate updated `policy.json` object
- [ ] Confirm before write: "Apply these settings?"
- [ ] Write to `<fork>/.growthub-fork/policy.json`
- [ ] Append trace event to `trace.jsonl`: `{ event: "policy_updated", timestamp, fields: { oldPolicy, newPolicy } }`
- [ ] Print success message with summary
- [ ] Add `--json` support: read from stdin, output new policy to stdout (for scripting)
- [ ] Add `--dry-run` option: show what would be changed, don't write

**Test:** Create `cli/src/commands/__tests__/kit-fork-policy.spec.ts`

---

## Section 2: Enhanced Heal UX (Preview, Background, Notifications)

### 2.1 `growthub kit fork heal <fork-id> --preview` — Rich Heal Preview

**File:** `cli/src/commands/kit-fork.ts`

**Current location:** Search for `heal` subcommand in `addForkSubcommands` (around line ~700)

**Current status:** Already has `printHealPlan()`, but preview is not rich enough

**What to enhance:**
```bash
growthub kit fork heal fork-blog-engine --preview
# Output (colored, grouped):

  Heal Plan: fork-blog-engine  v1.0.5 → v1.0.6
  Estimated risk: Low (safe additions only)
  ─────────────────────────────────────────────────────────

  SAFE ADDITIONS (3):
    + src/new-skill.ts                (upstream added)
    + config/defaults.json            (upstream added)
    + docs/CHANGELOG.md               (upstream added)

  SAFE UPDATES (1):
    ~ package.json                    (dep upgrade: zod 3.0 → 3.2)

  PROTECTED (2):
    ○ skills/my-custom-skill.ts       (policy.untouchablePaths)
    ○ .env.local                      (policy.untouchablePaths)

  UNRESOLVED (0):

  DECISION:
    3 actions will be applied (safe)
    2 actions will be skipped (protected)
    0 conflicts
  ─────────────────────────────────────────────────────────

  Apply this plan?
    [Yes, apply now] [Background] [No]
```

**Implementation checklist:**
- [ ] Add `--preview` flag to heal subcommand
- [ ] When `--preview` is set: don't apply, just render plan with decision UI
- [ ] Group actions by type: safe-add | safe-update | protected | unresolved
- [ ] Add color-coded action type indicators (→ for apply, ○ for skip)
- [ ] Show conflict resolution hints (if any) — e.g., "Custom skill matches new upstream file at same path"
- [ ] Include decision counts at bottom: "X will apply, Y will skip, Z unresolved"
- [ ] After preview: offer choice: [Yes, apply now] [Background] [No]
- [ ] Implement choice handling:
  - [ ] **Yes, apply now** → run synchronously (current behavior)
  - [ ] **Background** → dispatch job, print job ID, return immediately (2.2 below)
  - [ ] **No** → cancel, print next steps

---

### 2.2 `growthub kit fork heal <fork-id> --background` — Background Heal with Notifications

**File:** `cli/src/commands/kit-fork.ts` and `cli/src/kits/fork-sync-agent.ts`

**Current location:** Heal subcommand around line ~700; agent code in `fork-sync-agent.ts`

**Current status:** `dispatchKitForkSyncJobBackground` exists but lacks visibility + notifications

**What to build:**
```bash
growthub kit fork heal fork-blog-engine --background
# Output:
  Starting background heal...
  Job ID: heal-20260417-abc123
  
  Healing in background. Check progress with:
    growthub kit fork jobs
    growthub kit fork jobs --watch heal-20260417-abc123
  ✓ Started (run 'growthub kit fork jobs --watch <job-id>' to monitor)

# System notification: "Fork Sync: Healing fork-blog-engine (1 of 5 files)"

# Later:
growthub kit fork jobs --watch heal-20260417-abc123
# Shows live progress bar, status updates

# Or when done:
# Desktop notification: "Fork Sync: heal-blog-engine completed (3 added, 1 skipped)"
```

**Implementation checklist:**
- [ ] Add `--background` flag to heal subcommand
- [ ] When `--background` is set:
  - [ ] Call `dispatchKitForkSyncJobBackground(forkId, opts)`
  - [ ] Print job ID immediately
  - [ ] Return with success message (don't wait for completion)
- [ ] Update `fork-sync-agent.ts`:
  - [ ] Add **job progress tracking** to in-memory state:
    - [ ] Track current action index / total actions
    - [ ] Track elapsed time
    - [ ] Persist progress to job state file
  - [ ] Add **desktop/system notifications** (optional, use `node-notifier` or OS commands):
    - [ ] On job start: "Healing fork-X started (N actions)"
    - [ ] On job end: "Healing fork-X completed (X applied, Y skipped, Z errors)"
    - [ ] On error: "Healing fork-X failed"
- [ ] Add `--watch` flag to `growthub kit fork jobs`:
  - [ ] When `--watch <job-id>` is set: poll job state every 500ms
  - [ ] Show live progress: `[████░░░░░░░░░░] 4/10 actions (40%)`
  - [ ] Show current action: "Applying src/new-skill.ts..."
  - [ ] Exit when job completes (success) or errors out
- [ ] Add `--tail` flag to `growthub kit fork jobs`:
  - [ ] Show last N entries from job trace
  - [ ] Default N=50, override with `--tail 100`

---

### 2.3 `growthub kit fork jobs` — Job Queue Visibility (Enhanced)

**File:** `cli/src/commands/kit-fork.ts`

**Current location:** Search for `jobs` subcommand in `addForkSubcommands`

**Current status:** Likely exists, but needs enhancement for visibility

**What to enhance:**
```bash
growthub kit fork jobs
# Output (table format):

  Job Queue (5 jobs):
  ─────────────────────────────────────────────────────────────────────────────
  Job ID                    Fork ID               Status     Progress   Age
  ─────────────────────────────────────────────────────────────────────────────
  heal-20260417-abc123      fork-blog-engine     running    [███░░░░░]  2m 15s
  heal-20260417-def456      fork-social-ops     completed  ✓ 100%     5m ago
  heal-20260417-ghi789      fork-qa-harness     failed     ✗ (3/10)   12m ago
  heal-20260417-jkl012      fork-workflows      pending    —          1m ago
  heal-20260416-mno345      fork-operators      completed  ✓ 100%     3h ago

growthub kit fork jobs --json
# Machine-readable output

growthub kit fork jobs --filter status=running
# Show only running jobs

growthub kit fork jobs --watch <job-id>
# Show live progress (see 2.2 above)

growthub kit fork jobs --tail <job-id> 50
# Show last 50 trace events from a job
```

**Implementation checklist:**
- [ ] Enhance job table output:
  - [ ] Add progress bar for running jobs
  - [ ] Show completion percentage
  - [ ] Add age/timestamp
  - [ ] Color-code status: cyan (running), green (✓ completed), red (✗ failed), dim (pending)
- [ ] Add `--json` support: array of job summaries
- [ ] Add `--filter` option: status=running|completed|failed|pending
- [ ] Add `--watch <job-id>` flag (see 2.2)
- [ ] Add `--tail <job-id> [n]` flag:
  - [ ] Default n=50
  - [ ] Read last n entries from `<fork>/.growthub-fork/jobs/<job-id>.json` trace
  - [ ] Print human-readable trace events with timestamps

---

## Section 3: Enhanced Custom Workspace Starter Kit

### 3.1 `growthub starter init --template` — Interactive Template Picker

**File:** `cli/src/commands/starter.ts`

**Current location:** Search for `runStarterInit` function

**Current status:** Already scaffolds, but no template picker

**What to add:**
```bash
growthub starter init --out ./my-workspace
# New: interactive template picker first

  Select workspace template:
  
  ( ) Solo Studio
      Single-agent workspace, no coordination overhead
      Use for: prototyping, single-purpose agents
  
  (x) Studio + Operators
      One Studio kit + one or more Operator kits
      Use for: multi-role teams, separation of concerns
  
  ( ) Full Agent Team
      Studio + Operators + Workflow + all coordination files
      Use for: enterprise teams, complex multi-agent flows
  
  ( ) Custom
      Build your own from available kits

  → Solo Studio
```

**Implementation checklist:**
- [ ] Add `--template` option that triggers interactive picker (if not provided)
- [ ] Define template types (constants in `starter.ts`):
  - [ ] `solo-studio` → single kit, minimal scaffold
  - [ ] `studio-operators` → studio + 2 operator kits (pre-wired)
  - [ ] `full-agent-team` → studio + operators + workflow + coordination files
  - [ ] `custom` → let user pick kits from available list
- [ ] For each template:
  - [ ] List required/optional kits
  - [ ] Pre-generate coordination files:
    - [ ] `team.json` (if multi-kit) with role assignments
    - [ ] `agent-roles.json` with capabilities matrix
    - [ ] `shared-memory-schema.json` (if applicable)
    - [ ] `monitoring-hooks.sh` (monitoring integration points)
  - [ ] Inject template-specific `.env.example` vars
- [ ] Update starter help text to mention templates (around line ~160 in index.ts)

---

### 3.2 `growthub starter init --upstream <owner/repo>` — One-Shot Fork Creation

**File:** `cli/src/commands/starter.ts`

**Current status:** Already exists

**Enhancement:** Validate and document the flow

**Implementation checklist:**
- [ ] Confirm `--upstream` flow works end-to-end:
  - [ ] Create GitHub fork in upstream account
  - [ ] Clone forked repo locally to `--out` path
  - [ ] Auto-register fork with `registerKitFork`
  - [ ] Seed initial `policy.json` with sensible defaults
  - [ ] Write first trace event: `starter_init_with_fork`
- [ ] Add validation:
  - [ ] Check GitHub token is available (if remote sync intended)
  - [ ] Validate `owner/repo` format
  - [ ] Check repo exists before forking
- [ ] Update help text with examples:
  ```bash
  growthub starter init \
    --out ./my-workspace \
    --upstream my-github-org/awesome-kit \
    --template studio-operators
  ```

---

## Section 4: Trace & Audit Enhancements

### 4.1 Trace Event Standardization for All Fork Operations

**File:** `cli/src/kits/fork-trace.ts`

**Current status:** Trace exists, but may not cover all new operations

**What to standardize:**
```typescript
// Every fork operation appends: timestamp | event-type | actor | fork-id | result | metadata

interface TraceEvent {
  timestamp: string;
  eventType: 
    | "fork_registered"
    | "fork_deregistered"
    | "drift_detected"
    | "heal_proposed"
    | "heal_applied"
    | "heal_failed"
    | "policy_updated"
    | "status_checked";
  actor?: string;
  forkId: string;
  result: "success" | "failure" | "cancelled";
  metadata: Record<string, unknown>;
}
```

**Implementation checklist:**
- [ ] Review `fork-trace.ts` for completeness
- [ ] Add trace appends to all new commands:
  - [ ] `kit fork list` → event: `status_checked` (if polling drift)
  - [ ] `kit fork policy` → event: `policy_updated`
  - [ ] `kit fork heal --preview` → event: `heal_proposed` (no apply)
  - [ ] `kit fork heal --background` → events: `heal_started`, `heal_completed`, `heal_failed`
- [ ] Ensure timestamps are ISO 8601 format (UTC)
- [ ] Include all relevant metadata (file counts, actions, etc.)
- [ ] Make trace immutable (append-only, never truncate)

---

### 4.2 Trace Summary & Export

**File:** `cli/src/commands/kit-fork.ts` (new function)

**New feature:** Export fork operations history for auditing

**What to build:**
```bash
growthub kit fork history <fork-id>
# Output (human-readable):

  Fork: fork-blog-engine
  ─────────────────────────────────────────────────────────

  2024-04-17 14:35:22 [heal_applied]    3 files added, 1 skipped (protected)
  2024-04-17 10:22:15 [drift_detected]  drift severity: warning (2 files, 1 pkg)
  2024-04-17 09:45:03 [policy_updated]  untouchablePaths: skills/, .env
  2024-04-16 18:12:44 [fork_registered] base version 1.0.5, auto-detected kit

growthub kit fork history <fork-id> --json
# Machine-readable output

growthub kit fork history <fork-id> --since 2024-04-01 --csv > audit.csv
# Export for compliance
```

**Implementation checklist:**
- [ ] Add `history` subcommand to fork commands
- [ ] Read `<fork>/.growthub-fork/trace.jsonl` (append-only log)
- [ ] Parse trace events, group by date
- [ ] Render human-readable timeline
- [ ] Add `--json` export
- [ ] Add `--since <date>` and `--until <date>` filters (ISO 8601)
- [ ] Add `--csv` export (for compliance/audit tools)
- [ ] Add `--event-type <type>` filter (e.g., only `heal_*` events)

---

## Section 5: Help Text & Error Messages

### 5.1 Improve Fork Command Help & Examples

**File:** `cli/src/commands/kit-fork.ts`

**Locations:** 
- Line ~535 (registerKitForkSubcommands help text)
- Line ~569 (registerKitForkCommands help text)

**What to enhance:**
```bash
growthub kit fork --help
# Expand examples to cover all new Phase 1 commands:

Examples:
  # Interactive hub
  $ growthub kit fork                            # start interactive fork menu

  # List all forks (with status)
  $ growthub kit fork list                       # beautiful table of all forks
  $ growthub kit fork list --json                # machine-readable output
  $ growthub kit fork list --filter status=drift-major

  # Check drift
  $ growthub kit fork status <fork-id>           # check drift, show heal plan preview
  $ growthub kit fork status <fork-id> --policy-only

  # Edit policy
  $ growthub kit fork policy <fork-id>           # interactive policy editor

  # Heal (with rich preview + background option)
  $ growthub kit fork heal <fork-id> --preview   # rich colored preview
  $ growthub kit fork heal <fork-id>             # apply interactively
  $ growthub kit fork heal <fork-id> --background  # run in background
  $ growthub kit fork heal <fork-id> --dry-run   # simulate only

  # Monitor jobs
  $ growthub kit fork jobs                       # see all background jobs
  $ growthub kit fork jobs --watch <job-id>     # live progress
  $ growthub kit fork jobs --tail <job-id> 50   # last 50 trace events

  # Audit history
  $ growthub kit fork history <fork-id>         # timeline of operations
  $ growthub kit fork history <fork-id> --csv   # export for compliance

  # Manage forks
  $ growthub kit fork register ./my-fork        # add existing fork
  $ growthub kit fork deregister <fork-id>      # stop tracking fork
```

**Implementation checklist:**
- [ ] Update `.addHelpText("after", ...)` in `registerKitForkSubcommands` (line ~535)
- [ ] Update `.addHelpText("after", ...)` in `registerKitForkCommands` (line ~569)
- [ ] Add consistent "See Also" section pointing to related commands
- [ ] Add error message hints:
  - [ ] When fork not found: "Fork <id> not registered. Run `growthub kit fork list` to see registered forks."
  - [ ] When policy file missing: "Policy not found. Run `growthub kit fork policy <fork-id>` to create one."
  - [ ] When heal fails: "Heal failed. Review details: `growthub kit fork history <fork-id>`"

---

## Section 6: New Utility Modules

### 6.1 Table Formatting Utility

**File:** `cli/src/utils/table-renderer.ts` (new file)

**What to build:**
Reusable table renderer for fork list, jobs, etc.

```typescript
interface Column {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
  format?: (value: unknown) => string;
}

interface TableOptions {
  columns: Column[];
  rows: Record<string, unknown>[];
  showHeader?: boolean;
  colors?: boolean;
}

export function renderTable(opts: TableOptions): string
```

**Implementation checklist:**
- [ ] Create `table-renderer.ts` with generic table formatting
- [ ] Support column alignment (left/right/center padding)
- [ ] Support custom format functions (for dates, status badges, etc.)
- [ ] Support optional colors (picocolors integration)
- [ ] Use it for `kit fork list` and `kit fork jobs`
- [ ] Make it reusable for Phase 2+ (fleet view, team ops, etc.)

---

### 6.2 Progress Bar Utility

**File:** `cli/src/utils/progress.ts` (new file or enhance existing)

**What to build:**
```typescript
export function renderProgressBar(current: number, total: number, width = 30): string
// Output: "[████░░░░░░░░░░░░░░░░░░░░] 4/10 (40%)"
```

**Implementation checklist:**
- [ ] Support custom width
- [ ] Color-code: green for >80%, yellow for 50-80%, red for <50%
- [ ] Use for background job progress in `jobs --watch`

---

### 6.3 Notification Utility (Optional Desktop Notifications)

**File:** `cli/src/utils/notify.ts` (new file)

**What to build:**
```typescript
export async function notifyDesktop(title: string, body: string): Promise<void>
// Uses OS native notifications if available (macOS, Linux, Windows)
```

**Implementation checklist:**
- [ ] Use `node-notifier` or OS commands (already available in some CLI tools)
- [ ] Gracefully degrade if notifications unavailable
- [ ] Make optional (don't block if notification fails)
- [ ] Use for background heal completion notifications

---

## Section 7: Tests & Validation

### 7.1 Create Phase 1 Test Suite

**File:** `cli/src/commands/__tests__/kit-fork.phase-1.spec.ts` (new file)

**What to test:**
```typescript
describe("Phase 1: Fork UX Consolidation", () => {
  describe("kit fork list", () => {
    it("should display forks in a beautiful table format", async () => { ... })
    it("should support --json output", async () => { ... })
    it("should filter by status and kit", async () => { ... })
    it("should sort by fork-id, kit, status, or last-heal", async () => { ... })
  })

  describe("kit fork status", () => {
    it("should show drift report with policy evaluation", async () => { ... })
    it("should include heal plan preview inline", async () => { ... })
    it("should show risk assessment", async () => { ... })
    it("should suggest next steps", async () => { ... })
    it("should support --policy-only flag", async () => { ... })
  })

  describe("kit fork policy", () => {
    it("should load existing policy.json", async () => { ... })
    it("should save updated policy.json", async () => { ... })
    it("should append trace event on policy change", async () => { ... })
    it("should support --json input/output", async () => { ... })
    it("should validate protected paths", async () => { ... })
  })

  describe("kit fork heal --preview", () => {
    it("should show rich colored preview without applying", async () => { ... })
    it("should group actions by type (safe-add, safe-update, protected, unresolved)", async () => { ... })
    it("should show conflict resolution hints", async () => { ... })
  })

  describe("kit fork heal --background", () => {
    it("should dispatch job and return job-id immediately", async () => { ... })
    it("should track progress in job state", async () => { ... })
    it("should emit desktop notifications", async () => { ... })
  })

  describe("kit fork jobs", () => {
    it("should display all jobs in table format", async () => { ... })
    it("should support --watch <job-id> for live progress", async () => { ... })
    it("should support --tail <job-id> for trace export", async () => { ... })
  })

  describe("kit fork history", () => {
    it("should export fork operation timeline", async () => { ... })
    it("should support --csv for compliance", async () => { ... })
    it("should filter by --since and --until", async () => { ... })
  })

  describe("starter init --template", () => {
    it("should prompt for template if not provided", async () => { ... })
    it("should scaffold different kit layouts per template", async () => { ... })
    it("should pre-wire coordination files for multi-kit templates", async () => { ... })
  })
})
```

**Implementation checklist:**
- [ ] Create test file with full vitest coverage for all Phase 1 features
- [ ] Mock `listKitForkRegistrations`, `detectKitForkDrift`, `buildKitForkHealPlan`, etc.
- [ ] Test interactive flows (clack prompts) with mocked responses
- [ ] Test file I/O (reading/writing policy, trace, etc.)
- [ ] Test `--json` output is valid JSON
- [ ] Test `--csv` export format
- [ ] Ensure tests run as part of `bash scripts/pr-ready.sh` validation

---

### 7.2 Add Phase 1 to Kernel Packet Validation

**File:** `bash scripts/check-fork-ecosystem-kernel.sh` (new file)

**What to check:**
```bash
#!/bin/bash
# Phase 1 kernel validation

# 1. All fork-related commands respond to --help
commands=(
  "growthub kit fork list"
  "growthub kit fork status"
  "growthub kit fork policy"
  "growthub kit fork heal"
  "growthub kit fork jobs"
  "growthub kit fork history"
  "growthub starter init"
)

# 2. No undefined commands, all have help text
# 3. Color output works (picocolors integration)
# 4. --json flags produce valid JSON
# 5. Trace events are properly formatted (append-only, ISO 8601 timestamps)
# 6. Policy.json schema is respected (using existing fork-types.ts)
```

**Implementation checklist:**
- [ ] Create `scripts/check-fork-ecosystem-kernel.sh`
- [ ] Add validation for all new Phase 1 commands
- [ ] Ensure esbuild dist is rebuilt after changes
- [ ] Add to `scripts/pr-ready.sh` as a pre-merge gate

---

## Section 8: Documentation Updates

### 8.1 Update README with Phase 1 Features

**File:** `README.md`

**Sections to update:**
1. Fork Sync section (line ~250): expand examples to show Phase 1 commands
2. Add new "Fork UX" subsection under Worker Kits:
   ```markdown
   ## Fork UX — Keep Customizations in Sync
   
   ### Quick Start
   ```bash
   growthub kit fork list           # see all your forks
   growthub kit fork status <id>    # check drift
   growthub kit fork heal <id>      # heal (with preview option)
   ```
   
   ### Interactive Policy Editor
   ```bash
   growthub kit fork policy <id>
   # Set auto-approval rules, protected paths, remote sync mode
   ```
   
   ### Background Healing with Progress
   ```bash
   growthub kit fork heal <id> --background  # run in background
   growthub kit fork jobs --watch <job-id>   # watch progress
   ```
   ```

### 8.2 Create Phase 1 Kernel Packet Document

**File:** `docs/kernel-packets/KERNEL_PACKET_FORK_UX_CONSOLIDATION.md`

**Sections:**
- Why this packet exists (v0.4.2 fork-sync is durable; Phase 1 makes it operator-ready)
- Kernel invariants (all operations append to trace, policy is deterministic, etc.)
- Commands surface (list, status, policy, heal variants, jobs, history)
- Validation checklist (esbuild, tests, help text, trace format)
- Definition of done

**Implementation checklist:**
- [ ] Create kernel packet document
- [ ] Reference it from main ROADMAP_ENTERPRISE_AGENT_SWARMS.md
- [ ] Ensure kernel packet is read before any Phase 1 code ships

---

### 8.3 Add Phase 1 Examples to Help Text

**File:** `cli/src/index.ts`

**Location:** Update help text in `registerSharedCommands` (around line 1250-1290)

**What to add:**
Expand fork examples section to show all Phase 1 features

---

## Section 9: Summary Todo Checklist

### Commands to Add
- [ ] `growthub kit fork list` (beautiful table)
- [ ] `growthub kit fork policy <fork-id>` (interactive editor)
- [ ] `growthub kit fork history <fork-id>` (audit timeline)
- [ ] Enhancements to `kit fork status` (policy eval + plan preview)
- [ ] Enhancements to `kit fork heal` (--preview flag, rich output)
- [ ] Enhancements to `kit fork jobs` (--watch, --tail flags)
- [ ] Enhancement to `starter init` (--template picker, --upstream validation)

### Utilities to Build
- [ ] `cli/src/utils/table-renderer.ts` (reusable table formatting)
- [ ] `cli/src/utils/progress.ts` (progress bar)
- [ ] `cli/src/utils/notify.ts` (desktop notifications, optional)

### Trace & Audit
- [ ] Standardize trace events for all Phase 1 operations
- [ ] Ensure immutable append-only trace
- [ ] ISO 8601 timestamps (UTC)

### Tests
- [ ] Create comprehensive Phase 1 test suite
- [ ] Add Phase 1 validation to kernel packet script

### Documentation
- [ ] Update README with Phase 1 features
- [ ] Create KERNEL_PACKET_FORK_UX_CONSOLIDATION.md
- [ ] Expand help text throughout (all new commands)
- [ ] Add error message hints for common scenarios

### Cross-Cutting
- [ ] Rebuild esbuild dist after all changes
- [ ] Ensure `--json` works on all new commands (scripting)
- [ ] Ensure `--help` is comprehensive on all commands
- [ ] Color output consistent with v0.4.2 style (picocolors)
- [ ] No new external dependencies (use existing stack)

---

## Implementation Order (Strict Dependency Sequence)

**Layer 1: Foundation (blocks all others)**
1. Utilities: `table-renderer.ts`, `progress.ts`, `notify.ts`
2. Trace standardization (`fork-trace.ts`)
3. Test infrastructure setup
4. ← Foundation must be complete before Layer 2 begins

**Layer 2: Fork Status (depends on Layer 1)**
1. `kit fork list` command (uses table-renderer)
2. `kit fork policy` interactive editor
3. `kit fork status` enhancements (policy eval + plan)
4. Tests for all three commands
5. ← Layer 2 must be complete before Layer 3 begins

**Layer 3: Heal & Jobs (depends on Layer 2)**
1. `kit fork heal --preview` rich output
2. `kit fork heal --background` + job tracking
3. `kit fork jobs` enhancements (--watch, --tail)
4. Tests for all three features
5. ← Layer 3 must be complete before Layer 4 begins

**Layer 4: Audit & Starter (depends on Layer 3)**
1. `kit fork history` audit timeline + CSV export
2. `starter init --template` interactive picker
3. Tests for audit/starter
4. ← Layer 4 must be complete before Layer 5 begins

**Layer 5: Validation & Release (depends on all layers)**
1. Kernel packet validation script
2. README & help text updates
3. Full integration test suite
4. Rebuild esbuild dist
5. Merge when all gates pass

---

## Deliverables for Phase 1 Completion

- [ ] All commands in registry + working
- [ ] Full test coverage (Phase 1 test suite)
- [ ] Kernel packet document (KERNEL_PACKET_FORK_UX_CONSOLIDATION.md)
- [ ] Updated README with Phase 1 examples
- [ ] All help text expanded with examples
- [ ] Validation script (check-fork-ecosystem-kernel.sh)
- [ ] Esbuild dist rebuilt & committed
- [ ] PR merged to main
- [ ] npm version bumped (v0.5.0)
- [ ] Published to npm
- [ ] v0.5.0 release notes written (customer-first lens)
