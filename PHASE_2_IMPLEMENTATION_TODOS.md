# Phase 2: Multi-Fork Team Coordination — Implementation Todos

**Goal:** Team-scoped workspace isolation + multi-fork operations + local approval queue
**Anchor:** Phase 1 complete (rich fork UX, policy editor, trace visibility, background heals)
**Outputs:** Ops manage N forks as one logical team; foundation for Phase 3 (org governance)
**Foundation for Phase 3:** Team membership + local roles + per-team audit trails enable org-level policy layer

---

## Architecture Prerequisites (From Phase 1)

Phase 2 depends on Phase 1 delivering:
- ✓ Rich fork status visibility (`kit fork list`, `kit fork status`)
- ✓ Interactive policy editor (`kit fork policy`)
- ✓ Background heal jobs with tracking (`kit fork heal --background`, `kit fork jobs --watch`)
- ✓ Trace standardization (ISO 8601 timestamps, immutable append-only)
- ✓ Table rendering utility (`table-renderer.ts`)
- ✓ Test infrastructure (`kit-fork.phase-1.spec.ts`)

Phase 2 builds ON these primitives, NOT alongside them.

---

## Layer 1: Team Storage & Registration Foundation

**Purpose:** File-based team system (no database, no hosted service)
**Unblocks:** Layers 2–5

### 1.1 Team Directory Structure & Storage Model

**File:** `cli/src/config/team-home.ts` (new file)

**What to build:**
```
~/.growthub/teams/                                 (GROWTHUB_TEAMS_HOME)
  ├─ index.json                                    (canonical team list)
  └─ <team-id>/
      ├─ team.json                                 (TeamRegistration)
      ├─ policy.json                               (TeamPolicy, inherited by forks)
      ├─ members.json                              (TeamMember[] array)
      ├─ index.json                                (fork pointers, team-scoped)
      └─ audit.jsonl                               (append-only team events)
```

**Implementation checklist:**
- [ ] Create `cli/src/config/team-home.ts` with path resolution
  - [ ] `resolveTeamHomeDir()` → defaults to `~/.growthub/teams`
  - [ ] `resolveTeamPath(teamId)` → `~/.growthub/teams/<team-id>`
  - [ ] `resolveTeamFile(teamId, filename)` → full paths for team.json, policy.json, etc.
  - [ ] Environment override: `GROWTHUB_TEAMS_HOME`
  
- [ ] Create `cli/src/kits/team-types.ts` (type definitions)
  ```typescript
  interface TeamRegistration {
    teamId: string;
    name?: string;
    description?: string;
    createdAt: string;           // ISO 8601
    owner?: string;              // optional, local user
    visibility?: "private" | "team";  // for Phase 3 org sharing
  }
  
  interface TeamPolicy {
    autoApproveDeps?: {
      patch?: boolean;
      minor?: boolean;
      major?: boolean;
    };
    requireApprovalThreshold?: "info" | "warning" | "critical";
    untouchablePaths?: string[];
    autoApproveDepUpdates?: boolean;
    confirmBeforeChange?: boolean;
  }
  
  interface TeamMember {
    userId: string;
    role: "admin" | "operator" | "viewer";
    permissions: string[];    // e.g., ["heal", "confirm", "policy-change"]
    joinedAt: string;         // ISO 8601
  }
  ```

- [ ] Create `cli/src/kits/team-registry.ts` (read/write operations)
  ```typescript
  export function createTeam(
    teamId: string,
    opts: { description?: string; policyTemplate?: string }
  ): void
  
  export function loadTeamRegistration(teamId: string): TeamRegistration | null
  export function listTeamRegistrations(): TeamRegistration[]
  export function deleteTeam(teamId: string): void
  
  export function readTeamPolicy(teamId: string): TeamPolicy
  export function writeTeamPolicy(teamId: string, policy: TeamPolicy): void
  
  export function readTeamMembers(teamId: string): TeamMember[]
  export function addTeamMember(teamId: string, member: TeamMember): void
  export function removeTeamMember(teamId: string, userId: string): void
  ```

- [ ] Create `cli/src/kits/team-trace.ts` (append-only audit for teams)
  ```typescript
  interface TeamTraceEvent {
    timestamp: string;        // ISO 8601 UTC
    eventType: "team_created" | "member_added" | "member_removed" | 
               "policy_updated" | "fork_added_to_team" | "fork_removed_from_team" |
               "team_heal_started" | "team_heal_completed";
    teamId: string;
    actor?: string;           // who performed action
    result: "success" | "failure";
    metadata: Record<string, unknown>;
  }
  
  export function appendTeamTraceEvent(teamId: string, event: TeamTraceEvent): void
  export function readTeamTrace(teamId: string): TeamTraceEvent[]
  ```

---

### 1.2 Team-Scoped Fork Index

**File:** `cli/src/kits/fork-registry.ts` (modify existing)

**Current state:** Fork registry is global (`~/.growthub/kit-forks/index.json`)

**What to enhance:**
- [ ] Modify `registerKitFork()` to accept optional `--team <team-id>` parameter
  - [ ] If team provided: register fork in team's `index.json` instead of global index
  - [ ] Fork still stored at user-provided path, but INDEXED by team
  - [ ] Trace event: `"fork_added_to_team"` appended to team audit
  
- [ ] Create `listTeamForks(teamId)` function
  - [ ] Read team's `index.json`
  - [ ] Return array of fork registrations for that team only
  
- [ ] Create `removeForkFromTeam(teamId, forkId)` function
  - [ ] Remove fork from team's `index.json`
  - [ ] Trace event: `"fork_removed_from_team"`
  - [ ] Fork still exists on disk, just no longer indexed to team

**Implementation checklist:**
- [ ] Update `KitForkRegistration` type to optionally include `teamId`
- [ ] Update `registerKitFork()` signature to accept `teamId?: string`
- [ ] Create team fork index write functions
- [ ] Ensure fork can be in multiple teams (if desired) or just one (if not)
  - Recommend: one fork per team (simplest for Phase 2)

---

## Layer 2: Team Command Surface

**Purpose:** CLI commands for team lifecycle (create, list, manage members, set policy)
**Depends on:** Layer 1 (team storage + registry)
**Unblocks:** Layers 3–5

### 2.1 `growthub team create` Command

**File:** `cli/src/commands/team.ts` (new file)

**What to build:**
```bash
growthub team create acme-products \
  --description "Production agent team" \
  --policy-template "enterprise-standard"

# Output:
  ✓ Team created: acme-products
  Description: Production agent team
  Policy template: enterprise-standard
  
  Directory: ~/.growthub/teams/acme-products
  
  Next steps:
    growthub team member add alice --role operator
    growthub kit fork create --kit higgsfield --team acme-products --out ./my-fork
    growthub fleet view --team acme-products
```

**Implementation checklist:**
- [ ] Add `team` command to main program
- [ ] Subcommand: `create <team-id>`
- [ ] Options:
  - [ ] `--description <text>` (optional)
  - [ ] `--policy-template <template-id>` (optional, default: empty)
- [ ] Validation:
  - [ ] Team ID must be alphanumeric + hyphens (no spaces, special chars)
  - [ ] Check team doesn't already exist
  - [ ] Create directory `~/.growthub/teams/<team-id>`
  - [ ] Write `team.json` with registration metadata
- [ ] Policy template handling:
  - [ ] If `--policy-template` provided, seed `policy.json` with template defaults
  - [ ] Template options: "none" (empty) | "enterprise-standard" (strict) | "dev-friendly" (loose)
- [ ] Initialize empty `members.json` (empty array)
- [ ] Initialize empty `index.json` (empty fork list)
- [ ] Append trace event: `"team_created"`
- [ ] Print success message with next steps

**Test file:** `cli/src/commands/__tests__/team.spec.ts` (new file)

---

### 2.2 `growthub team list` & `growthub team show` Commands

**File:** `cli/src/commands/team.ts`

**What to build:**
```bash
growthub team list
# Output (table):

  Team ID               Description                   Policy Template    Forks    Members
  ─────────────────────┬──────────────────────────────────────────────────┬────────┬────────
  acme-products        Production agent team         enterprise-standard  3        2
  platform-team        Core platform services        dev-friendly         5        4
  research-lab         ML research & experiments     none                 1        1

growthub team list --json
# Machine-readable output

growthub team show acme-products
# Output:

  Team: acme-products
  Description: Production agent team
  Policy template: enterprise-standard
  Created: 2024-04-17T10:22:15Z
  Directory: ~/.growthub/teams/acme-products
  
  MEMBERS (2):
    alice (operator) — permissions: heal, confirm
    bob (viewer) — permissions: status
  
  FORKS (3):
    fork-blog-engine (higgsfield)       v1.0.5 → v1.0.6  drift-minor
    fork-social-ops (postiz)            v2.1.0 → v2.1.2  drift-major
    fork-qa-harness (qwen-code)         v0.8.1 → v0.8.1  synced
  
  POLICY:
    Auto-approve patch: true
    Auto-approve minor: false
    Require approval threshold: critical
    Protected paths: skills/, .env
```

**Implementation checklist:**
- [ ] Add `list` subcommand
  - [ ] Call `listTeamRegistrations()`
  - [ ] Render as beautiful table (reuse `table-renderer.ts`)
  - [ ] Include: Team ID | Description | Policy Template | Fork Count | Member Count
  - [ ] Support `--json` for scripting
  - [ ] Support `--filter` by team ID (substring match)

- [ ] Add `show <team-id>` subcommand
  - [ ] Load team registration, policy, members, forks
  - [ ] Display full team details with hierarchical formatting
  - [ ] List team members with roles + permissions
  - [ ] List team forks with current status (reuse `buildForkSummary` from Phase 1)
  - [ ] Show team policy settings
  - [ ] Support `--json` for scripting

---

### 2.3 `growthub team member` Commands

**File:** `cli/src/commands/team.ts`

**What to build:**
```bash
# Add member
growthub team member add alice --team acme-products --role operator
# Output:
  ✓ Member added: alice (operator)
  Permissions: heal, confirm, status

# List team members
growthub team member list acme-products
# Output:
  Team: acme-products
  Member           Role        Permissions              Joined At
  ────────────────┬──────────┬───────────────────────┬──────────────
  alice (me)       operator    heal, confirm, status  2024-04-17T10:00:00Z
  bob              viewer      status                 2024-04-17T09:45:00Z

# Remove member
growthub team member remove bob --team acme-products
# Output:
  ✓ Member removed: bob

# Show member details
growthub team member show alice --team acme-products
# Output full member record + permissions
```

**Implementation checklist:**
- [ ] Add `member` subcommand group (parent command)

- [ ] `member add <user-id>`
  - [ ] Options: `--team <team-id>` (required), `--role <role>` (required)
  - [ ] Role choices: "admin" | "operator" | "viewer"
  - [ ] Map role → permissions:
    - [ ] `admin` → all permissions (heal, confirm, policy-change, member-mgmt)
    - [ ] `operator` → heal, confirm, status
    - [ ] `viewer` → status only
  - [ ] Validation: user-id must be alphanumeric (no spaces)
  - [ ] Append trace event: `"member_added"` with role + permissions
  - [ ] Write updated `members.json`

- [ ] `member list <team-id>`
  - [ ] Call `readTeamMembers(teamId)`
  - [ ] Display as table: User | Role | Permissions | Joined At
  - [ ] Support `--json`

- [ ] `member remove <user-id>`
  - [ ] Options: `--team <team-id>` (required)
  - [ ] Validation: team must have at least one admin (can't remove last admin)
  - [ ] Append trace event: `"member_removed"`
  - [ ] Update `members.json`

- [ ] `member show <user-id>`
  - [ ] Options: `--team <team-id>` (required)
  - [ ] Display full member record (role, permissions, joined date)
  - [ ] Show which teams user is in (if time permits, optional)

---

### 2.4 `growthub team policy` Commands

**File:** `cli/src/commands/team.ts`

**What to build:**
```bash
# Set team policy
growthub team policy set acme-products \
  --auto-approve-patch \
  --auto-approve-minor false \
  --require-approval critical

# Output:
  ✓ Team policy updated: acme-products
  
  Auto-approve patch: true
  Auto-approve minor: false
  Require approval threshold: critical
  Protected paths: (inherited, can override per-fork)

# Show team policy
growthub team policy show acme-products
# Output (detailed, with what-if notes)

# Interactive editor (like Phase 1 fork policy)
growthub team policy acme-products
# Opens clack-based interactive editor
```

**Implementation checklist:**
- [ ] Add `policy` subcommand group

- [ ] `policy set <team-id>`
  - [ ] Options: `--auto-approve-patch`, `--auto-approve-minor`, `--auto-approve-major`, `--require-approval <threshold>`
  - [ ] Read current policy, merge with provided flags
  - [ ] Write updated `policy.json`
  - [ ] Append trace event: `"policy_updated"` with old/new diff
  - [ ] Print confirmation with new settings

- [ ] `policy show <team-id>`
  - [ ] Display team policy (auto-approve rules, approval threshold, untouchable paths)
  - [ ] Show what it inherits vs what could be overridden per-fork
  - [ ] Include note: "Forks can override with stricter rules only"
  - [ ] Support `--json`

- [ ] `policy <team-id>` (interactive editor, optional for Phase 2)
  - [ ] Similar to Phase 1 `kit fork policy` but for teams
  - [ ] Clack-based checkboxes + multiselect
  - [ ] Write policy, append trace

---

### 2.5 `growthub team delete` Command

**File:** `cli/src/commands/team.ts`

**What to build:**
```bash
growthub team delete acme-products
# Confirmation:
  Warning: This will delete the team registration and audit trail.
  Forks remain on disk but will no longer be team-indexed.
  
  Type 'acme-products' to confirm: acme-products
  ✓ Team deleted

growthub team delete acme-products --force
# Skip confirmation, delete immediately
```

**Implementation checklist:**
- [ ] Add `delete <team-id>` subcommand
- [ ] Options: `--force` (skip confirmation)
- [ ] Safety check: require explicit team ID in confirmation prompt (unless `--force`)
- [ ] Remove directory: `~/.growthub/teams/<team-id>`
- [ ] NO trace event (team is gone) — or create final `"team_deleted"` event before cleanup?
  - Recommend: create final trace event, then delete directory
- [ ] Print success message

---

## Layer 3: Team-Scoped Fork Operations

**Purpose:** Extend Phase 1 fork commands to work with teams
**Depends on:** Layer 1 (team storage) + Layer 2 (team commands)
**Unblocks:** Layers 4–5

### 3.1 `growthub kit fork create --team <team-id>`

**File:** `cli/src/commands/kit-fork.ts` (modify existing)

**Current state:** `kit fork create` doesn't exist; flow is fork + register

**What to build:**
```bash
growthub kit fork create \
  --kit higgsfield \
  --team acme-products \
  --out ./agent-studio \
  --label "Blog Engine"

# Output:
  ✓ Fork created: fork-blog-engine (higgsfield)
  Registered to team: acme-products
  Location: ./agent-studio
  Base version: v1.0.5
  
  Team policy applied:
    Auto-approve patch: true
    Require approval: critical
  
  Next steps:
    growthub kit fork policy fork-blog-engine  # override team defaults if needed
    growthub fleet view --team acme-products    # see all team forks
```

**Implementation checklist:**
- [ ] Add `create` subcommand to `kit fork` group
- [ ] Arguments: none (or make `--kit` required)
- [ ] Options:
  - [ ] `--kit <kit-id>` (required)
  - [ ] `--team <team-id>` (optional, if not provided → global fork)
  - [ ] `--out <path>` (required)
  - [ ] `--label <label>` (optional, friendly name)
  - [ ] `--upstream <owner/repo>` (optional, for GitHub fork creation)

- [ ] Validation:
  - [ ] Kit must exist
  - [ ] If team provided, team must exist
  - [ ] Output path must be writable

- [ ] Execution:
  - [ ] Create fork directory at `--out`
  - [ ] Download kit files (or copy from bundled assets)
  - [ ] Generate `kit.json` if needed
  - [ ] Call `registerKitFork()` with `teamId` parameter
  - [ ] If team provided:
    - [ ] Read team's `policy.json`
    - [ ] Seed fork's `policy.json` with team policy as defaults
    - [ ] Add fork to team's `index.json`
    - [ ] Append trace event to team audit: `"fork_added_to_team"`
  - [ ] If GitHub fork requested (`--upstream`):
    - [ ] Create fork on GitHub
    - [ ] Clone to `--out` path
    - [ ] Auto-register with GitHub remote binding

- [ ] Output: success message with team policy applied + next steps

---

### 3.2 `growthub kit fork list --team <team-id>`

**File:** `cli/src/commands/kit-fork.ts` (modify existing `list` command)

**Current state:** Lists all forks globally

**What to enhance:**
```bash
# Global list (existing behavior)
growthub kit fork list

# Team-scoped list (new)
growthub kit fork list --team acme-products
# Output: same table format, but only team forks

# Team + filter
growthub kit fork list --team acme-products --filter status=drift-*
```

**Implementation checklist:**
- [ ] Add `--team <team-id>` option to list command
- [ ] If team provided:
  - [ ] Call `listTeamForks(teamId)`
  - [ ] Render table from team's fork list only
  - Otherwise: use existing global list (backwards compat)
- [ ] Filtering still works (across global or team forks)

---

### 3.3 Team Policy Inheritance in Fork Operations

**File:** `cli/src/commands/kit-fork.ts` and `cli/src/kits/fork-sync.ts`

**What to implement:**
When a fork belongs to a team, fork operations inherit team policy as default:

```bash
# Fork belongs to acme-products team
# Team policy: auto-approve-patch=true, require-approval=critical

growthub kit fork policy fork-blog-engine
# Opens editor with team policy as defaults
# User can override, but stricter rules only (can't weaken team policy)

growthub kit fork heal fork-blog-engine --preview
# Heal plan respects BOTH fork policy (if overridden) AND team policy
# Example: team says "auto-approve patch", fork says "require-approval all"
# → Fork's stricter rule wins → even patches require approval
```

**Implementation checklist:**
- [ ] Modify `loadKitForkPolicy()` to check if fork is team-member
  - [ ] If team-member: load team policy as base, fork policy as override
  - [ ] Merge policies: fork overrides team, but only if stricter
  - [ ] Return merged policy

- [ ] Modify heal plan building to evaluate against merged policy
  - [ ] `buildKitForkHealPlan()` already accepts policy; just pass merged one

- [ ] Update `kit fork policy` editor to show team policy as context
  - [ ] "Current team policy: auto-approve-patch = true"
  - [ ] "You can only set stricter rules (e.g., require-approval on patches)"

- [ ] Validation: prevent fork from inheriting weaker team policy
  - [ ] If fork policy omitted: fork gets team policy exactly
  - [ ] If fork policy provided: must be equal or stricter

---

## Layer 4: Team-Level Fleet Operations

**Purpose:** Extend Phase 1 fleet commands to work with teams
**Depends on:** Layers 1–3 (team storage + team fork ops + policy inheritance)
**Unblocks:** Layer 5

### 4.1 `growthub fleet view --team <team-id>`

**File:** `cli/src/commands/fleet.ts` (modify existing)

**Current state:** Shows all forks in one fleet

**What to enhance:**
```bash
# Global fleet view (existing)
growthub fleet view

# Team-scoped fleet view (new)
growthub fleet view --team acme-products
# Output (team-specific):

  Team: acme-products (3 forks)
  Health: clean=1 | drift-minor=1 | drift-major=1 | awaiting=0
  Remote synced: 2/3 forks
  Pending approvals: 1
  ─────────────────────────────────────────────────────────
  
  Fork ID                  Kit             Status         Protected    Last Heal
  ──────────────────────── ─────────────── ────────────── ─────────── ──────────
  fork-blog-engine         higgsfield      drift-minor    skills/,env  2h ago ✓
  fork-social-ops          postiz          drift-major    —            —
  fork-qa-harness          qwen-code       synced         —            15m ago ✓
```

**Implementation checklist:**
- [ ] Add `--team <team-id>` option to fleet view
- [ ] If team provided:
  - [ ] Call `listTeamForks(teamId)` (NOT global list)
  - [ ] Render aggregated team metrics (health, remote sync, approvals)
  - [ ] Show team-specific summary header
- [ ] Otherwise: use existing global fleet view (backwards compat)
- [ ] Support `--json` (should work unchanged)

---

### 4.2 `growthub fleet drift --team <team-id>`

**File:** `cli/src/commands/fleet.ts`

**What to enhance:**
```bash
# Team-scoped drift report
growthub fleet drift --team acme-products
# Output: aggregated drift across all team forks

growthub fleet drift --team acme-products --critical-only
# Output: only critical severity, prioritized
```

**Implementation checklist:**
- [ ] Add `--team <team-id>` option to drift command
- [ ] If team provided:
  - [ ] Call `listTeamForks(teamId)`
  - [ ] Detect drift for each fork
  - [ ] Aggregate by severity
  - [ ] Render team-scoped drift report
- [ ] Support `--critical-only` flag (show only critical/warning)
- [ ] Render as summary + per-fork details

---

### 4.3 `growthub fleet heal --team <team-id>`

**File:** `cli/src/commands/fleet.ts`

**What to build:**
```bash
# Team-scoped heal coordination
growthub fleet heal --team acme-products --dry-run
# Output: aggregated heal plan across all team forks

  Team: acme-products
  Upstream changes detected
  ─────────────────────────────────────────────────────────
  
  Fork ID                   Kit            Actions    Risk
  ────────────────────────┬──────────────┬─────────┬───────
  fork-blog-engine        higgsfield     3 (+2+1)  Low
  fork-social-ops         postiz         5 (+3~2)  Medium
  fork-qa-harness         qwen-code      0         —
  
  Total: 8 actions across 2 forks
  
  Apply?
    [Yes, apply now] [Background] [No]

# Apply with background
growthub fleet heal --team acme-products --apply --background
# Output:
  ✓ Team heal started (3 forks in parallel)
  Job ID: heal-team-acme-products-20260417-abc123
  
  Monitor with:
    growthub fleet jobs --team acme-products --watch
```

**Implementation checklist:**
- [ ] Add `--team <team-id>` option to heal command

- [ ] If `--dry-run`:
  - [ ] Detect drift for all team forks in parallel
  - [ ] Build heal plan for each fork (respecting merged policies)
  - [ ] Aggregate into team heal summary
  - [ ] Display preview grouped by fork
  - [ ] Prompt for action: [Yes, apply] [Background] [No]

- [ ] If `--apply`:
  - [ ] Dispatch heal jobs for all team forks in PARALLEL
  - [ ] (NOT sequential; parallel execution)
  - [ ] If `--background`: return immediately with job-id
  - [ ] Otherwise: wait for all to complete

- [ ] Job tracking:
  - [ ] Create team-level job: `heal-team-<team-id>-<timestamp>`
  - [ ] Track progress per fork
  - [ ] Aggregate results: X applied, Y skipped, Z failed
  - [ ] Append to team audit: `"team_heal_completed"` with aggregate stats

---

### 4.4 `growthub fleet approvals --team <team-id>`

**File:** `cli/src/commands/fleet.ts` (or new `approvals.ts`)

**What to build:**
```bash
# Team-scoped approval queue
growthub fleet approvals --team acme-products
# Output:

  Team: acme-products
  Pending Confirmations (2)
  ─────────────────────────────────────────────────────────
  
  Job ID                    Fork ID              Action      Awaiting Since
  ──────────────────────────┬────────────────────┬──────────┬──────────────
  heal-20260417-abc123      fork-social-ops      heal (crit) 3h 22m
  heal-20260417-def456      fork-qa-harness      dep-upg    45m
  
  Approvals required from team members (operator+ role)

# Confirm approval for one fork
growthub fleet approvals confirm <job-id> --yaml decisions.yaml
# decisions.yaml: path → [approve|skip|reject]
# Job resumes; team audit updated

growthub fleet approvals confirm <job-id> --all
# Approve all pending for this job
```

**Implementation checklist:**
- [ ] Add `--team <team-id>` option to approvals command
- [ ] If team provided:
  - [ ] List all pending approval jobs for team forks
  - [ ] Display as table: Job ID | Fork ID | Action Type | Awaiting Since
  - [ ] Sort by awaiting time (oldest first)

- [ ] `confirm <job-id>` subcommand:
  - [ ] Load job state from fork's `jobs/<job-id>.json` (job belongs to a specific fork)
  - [ ] Or: handle both fork-level and team-level job confirmations
  - [ ] Options: `--yaml <file>` (detailed decisions) or `--all` (approve all)
  - [ ] Validate: current user is team member with "operator+" role (or admin)
  - [ ] Resume job with confirmations
  - [ ] Append trace event to team audit: actor confirmed fork job

---

### 4.5 Team Fleet Trace & Audit

**File:** `cli/src/commands/fleet.ts` (or `team.ts`)

**What to build:**
```bash
# Team audit timeline
growthub fleet trace --team acme-products
# Output: all team-level events + aggregated fork events

  Team: acme-products
  ─────────────────────────────────────────────────────────
  
  2024-04-17 14:35:22  [team_heal_completed]  8 actions (6 applied, 2 skipped)
  2024-04-17 14:00:00  [team_heal_started]    3 forks detected upstream changes
  2024-04-17 10:22:15  [member_added]         alice (operator)
  2024-04-17 10:00:00  [team_created]         acme-products (enterprise-standard)

# Export for compliance
growthub fleet trace --team acme-products --csv > team-audit.csv

# Filter by event type
growthub fleet trace --team acme-products --event-type "heal_*"
```

**Implementation checklist:**
- [ ] Add `trace` subcommand to fleet commands
- [ ] Options: `--team <team-id>` (required for team trace), `--event-type <type>` (filter)
- [ ] Read team's `audit.jsonl`
- [ ] Display as formatted timeline
- [ ] Support `--json` and `--csv` exports
- [ ] RFC 4180 CSV format

---

## Layer 5: Team Role-Based Approval Gating (Foundation for Phase 3)

**Purpose:** Establish role-based confirmation rules (no external auth needed; local file-based)
**Depends on:** Layers 1–4 (team structure + members + operations)
**Unblocks:** Phase 3 (org-level policy gating + approval relay)

### 5.1 Role-Based Approval Requirements (Local)

**File:** `cli/src/kits/team-approval.ts` (new file)

**What to build:**
```typescript
interface ApprovalRequirement {
  requiredRole: "admin" | "operator" | "viewer";
  minApprovals: number;           // number of people with this role who must confirm
}

export function evaluateApprovalRequirement(
  teamId: string,
  requirement: ApprovalRequirement,
  confirmingUser: string
): boolean {
  // Check: is confirming user a team member with required role?
  // Return true if user can confirm, false if not authorized
}

export function getTeamMembersWithRole(
  teamId: string,
  role: "admin" | "operator" | "viewer"
): TeamMember[] {
  // Return all team members with this role or higher
}
```

**Implementation checklist:**
- [ ] Create approval evaluation logic (no external calls, purely local)
- [ ] Helper: check if user is team member
- [ ] Helper: check if user's role meets minimum requirement
- [ ] Helper: count approvals collected so far vs required

---

### 5.2 Approval Gating in Team Heal

**File:** `cli/src/commands/fleet.ts` (modify heal command)

**What to add:**
When team heal is run, it checks if approval gating is configured:

```bash
# No approval required (default for Phase 2)
growthub fleet heal --team acme-products --apply

# With approval gating (Foundation for Phase 3)
# (Teams can optionally require approval from ops before healing)

# System flow:
# 1. Heal plan built for all forks
# 2. Check if any forks require approval (per-fork policy or team policy)
# 3. If yes: pause, collect approvals
# 4. Confirm approval from authorized team member
# 5. Resume heal
```

**Implementation checklist:**
- [ ] In team heal: check if any fork jobs need confirmation
- [ ] If yes, don't apply immediately
- [ ] Transition jobs to `awaiting_confirmation` state
- [ ] List pending confirmations (use `fleet approvals` UI)
- [ ] When user confirms: resume jobs
- [ ] Trace: record who confirmed, when, for which forks

---

## Layer 6: Documentation & Validation

**Purpose:** Kernel packet, tests, help text
**Depends on:** Layers 1–5 (all team functionality)
**Unblocks:** Release (merge to main)

### 6.1 Test Suite

**File:** `cli/src/commands/__tests__/team.phase-2.spec.ts` (new file)

**What to test:**
```typescript
describe("Phase 2: Team Coordination", () => {
  describe("Team Lifecycle", () => {
    it("should create a team with registration", async () => { ... })
    it("should list teams in table format", async () => { ... })
    it("should show team details with members + forks", async () => { ... })
    it("should delete a team", async () => { ... })
  })

  describe("Team Members", () => {
    it("should add member with role + permissions", async () => { ... })
    it("should list team members", async () => { ... })
    it("should remove member (no last admin)", async () => { ... })
    it("should block removing last admin", async () => { ... })
  })

  describe("Team Policy", () => {
    it("should set team policy (auto-approve rules)", async () => { ... })
    it("should show team policy", async () => { ... })
    it("should inherit in forks (as default)", async () => { ... })
    it("should allow fork to override (stricter only)", async () => { ... })
  })

  describe("Team Fork Operations", () => {
    it("should create fork + register to team", async () => { ... })
    it("should list team forks only", async () => { ... })
    it("should apply team policy to new fork", async () => { ... })
  })

  describe("Team Fleet Commands", () => {
    it("should view fleet scoped to team", async () => { ... })
    it("should detect drift for all team forks", async () => { ... })
    it("should plan heal across team forks in parallel", async () => { ... })
    it("should heal all team forks in background", async () => { ... })
    it("should track team-level job progress", async () => { ... })
  })

  describe("Team Approvals", () => {
    it("should list pending confirmations by team", async () => { ... })
    it("should confirm job with authorized member", async () => { ... })
    it("should block confirmation from unauthorized user", async () => { ... })
  })

  describe("Team Audit Trail", () => {
    it("should record team events (create, member-add, heal, etc)", async () => { ... })
    it("should export team audit as CSV", async () => { ... })
    it("should filter audit by event type", async () => { ... })
  })
})
```

**Implementation checklist:**
- [ ] Create `team.phase-2.spec.ts` with full vitest coverage
- [ ] Mock team storage (file I/O)
- [ ] Test all team commands + fleet operations
- [ ] Test approval gating (role checks)
- [ ] Test team policy inheritance in forks
- [ ] Ensure tests run as part of `bash scripts/pr-ready.sh`

---

### 6.2 Kernel Packet Document

**File:** `docs/kernel-packets/KERNEL_PACKET_TEAM_COORDINATION.md` (new file)

**What to write:**
- **Why this packet exists:** Phase 1 made forks operator-ready; Phase 2 enables teams to manage multiple forks as one unit
- **Kernel invariants:**
  - Teams are directories + JSON files (no database)
  - Team policy is inherited by forks, not mandatory
  - Team members are local (no hosted auth yet)
  - All team operations append to team audit trail
  - No new transport (reuse fork-sync + GitHub integration)
- **Commands surface:** All 6+ team commands + fleet options
- **Validation checklist:** tests, help text, trace format
- **Definition of done:** PR checks pass, all layers complete

---

### 6.3 Integration with Fleet Observability

**File:** `cli/src/fleet/summary.ts` (modify existing)

**What to enhance:**
Currently `buildFleetSummary()` returns global fleet summary.

**Add:**
```typescript
export function buildFleetSummary(teamId?: string): FleetSummary {
  // If teamId provided: aggregate only that team's forks
  // Otherwise: global fleet (existing behavior)
}
```

**Implementation checklist:**
- [ ] Modify `buildFleetSummary()` to accept optional `teamId`
- [ ] If team provided: use `listTeamForks(teamId)` instead of global list
- [ ] Rest of logic unchanged
- [ ] Update `fleet view` command to pass team ID when provided

---

## File Changes Summary

### New Files (6)
```
cli/src/config/team-home.ts                    (team home dir resolution)
cli/src/kits/team-types.ts                     (TeamRegistration, TeamPolicy, TeamMember types)
cli/src/kits/team-registry.ts                  (team create, read, write, delete)
cli/src/kits/team-trace.ts                     (append-only team audit trail)
cli/src/kits/team-approval.ts                  (role-based approval evaluation)
cli/src/commands/team.ts                       (all team commands)
cli/src/commands/__tests__/team.phase-2.spec.ts  (full test suite)
docs/kernel-packets/KERNEL_PACKET_TEAM_COORDINATION.md
```

### Modified Files (4)
```
cli/src/commands/kit-fork.ts
  • Add kit fork create --team option
  • Add kit fork list --team filtering
  • Modify policy loading to merge team + fork policies

cli/src/commands/fleet.ts
  • Add fleet view --team option
  • Add fleet drift --team option
  • Add fleet heal --team option (parallel healing)
  • Add fleet approvals --team option
  • Add fleet trace --team option

cli/src/kits/fork-registry.ts
  • Add teamId to KitForkRegistration
  • Modify registerKitFork to accept teamId
  • Add listTeamForks(teamId) function
  • Add removeForkFromTeam(teamId, forkId) function

cli/src/fleet/summary.ts
  • Modify buildFleetSummary to accept teamId parameter
```

---

## Layer Dependencies (Strict Ordering)

```
LAYER 1: TEAM STORAGE & REGISTRATION
├─ team-home.ts (path resolution)
├─ team-types.ts (data structures)
├─ team-registry.ts (read/write)
├─ team-trace.ts (audit trail)
└─ fork-registry.ts modifications (add teamId support)
    ↓ Layer 1 must be complete before Layer 2

LAYER 2: TEAM COMMAND SURFACE
├─ team.ts commands (create, list, show, delete)
├─ team.ts member commands (add, list, remove, show)
├─ team.ts policy commands (set, show)
└─ Test infrastructure for team commands
    ↓ Layer 2 must be complete before Layer 3

LAYER 3: TEAM-SCOPED FORK OPERATIONS
├─ kit-fork.ts create --team option
├─ kit-fork.ts list --team filtering
├─ Policy inheritance (fork uses team policy as default)
└─ Tests for team fork operations
    ↓ Layer 3 must be complete before Layer 4

LAYER 4: TEAM FLEET OPERATIONS
├─ fleet view --team
├─ fleet drift --team
├─ fleet heal --team (parallel execution)
├─ fleet approvals --team
├─ fleet trace --team
└─ fleet/summary.ts modifications
    ↓ Layer 4 must be complete before Layer 5

LAYER 5: APPROVAL GATING FOUNDATION
├─ team-approval.ts (role-based evaluation, local only)
├─ Approval gating in fleet heal (pauses if confirmation needed)
├─ Team member role enforcement
└─ Tests for approval logic
    ↓ Layer 5 must be complete before Layer 6

LAYER 6: DOCUMENTATION & VALIDATION
├─ Full test suite (team.phase-2.spec.ts)
├─ Kernel packet document
├─ Help text updates (all team/fleet commands)
├─ Validation script updates
└─ Merge when all gates pass
```

---

## Success Criteria for Phase 2

- [ ] All 6 team commands implemented + tested
- [ ] All team-scoped fleet options working (view, drift, heal, approvals, trace)
- [ ] Team policy inheritance in forks
- [ ] Team-level parallel heal coordination
- [ ] Role-based approval gating (foundation for Phase 3)
- [ ] Kernel packet frozen + validated before merge
- [ ] Full test coverage >90% on team.ts + team.phase-2.spec.ts
- [ ] All help text updated with team examples
- [ ] Esbuild dist rebuilt
- [ ] Backwards compatible (global fleet operations still work)
- [ ] Ready for Phase 3 (org governance layer can depend on team structure)

---

## How Phase 2 Compounds into Phase 3

**Phase 2 Foundation → Phase 3 Lock**

Phase 3 (Enterprise Governance) depends on Phase 2 delivering:

1. **Team membership system** (local users + roles)
   - Phase 3 adds: org-level user permissions + role hierarchy
   
2. **Team policy layer** (inherited by forks)
   - Phase 3 adds: org-level policy engine (acts as default for all teams)
   
3. **Team audit trails** (append-only local logs)
   - Phase 3 adds: org-level audit aggregation (compliance reporting)
   
4. **Role-based approval gating** (local evaluator)
   - Phase 3 adds: org policy gates (approval requirements enforced at heal time)
   
5. **Team heal coordination** (parallel execution)
   - Phase 3 adds: org-wide heal strategies (multi-team orchestration)

**NO breaking changes from Phase 2 → Phase 3.** Only layering org-level concepts on top of team primitives.
