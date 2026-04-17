# Enterprise Agent Swarm Roadmap — Starting from @growthub/cli v0.4.2

## Foundation: What v0.4.2 Shipped

**v0.4.2 unlocks sustainable customization:**

1. **Settings Nav** — clean discovery, reduced cognitive load
2. **Self-Healing Fork Sync Agent** — users can customize forks + stay current without losing work (drift detection → policy-driven healing → trace logging)
3. **Native GitHub Integration** — device-flow OAuth + secure token storage + one-click remote push
4. **Service Status** — health grid for ops (8–10 probes)
5. **Custom Workspace Starter** — `growthub starter init` scaffolds runnable kit forks + auto-registers for sync

**Critical innovation:** The fork-sync + policy + trace system makes customization **production-grade at scale**, not one-off rotting branches.

---

## Phasing Strategy

**No arbitrary timelines.** Each phase is ordered by **dependency**: Phase N ships when Phase N-1 outputs are solid enough to build on. A phase is "done" when its outputs become the foundation for the next.

---

## Phase 1: Consolidate Fork Ecosystem UX & Polish (Foundation Tier)

**Depends on:** v0.4.2 shipped + in-production usage
**Unlocks:** Phase 2 (team-level operations)

### What ships

**1.1 Rich Fork Status Commands**
```bash
growthub kit fork list
# Output:
#   Fork ID              Kit             Base    Upstream  Status         Protected Paths    Last Heal
#   ──────────────────── ─────────────── ─────── ───────── ────────────── ────────────────── ──────────
#   fork-blog-engine     higgsfield      1.0.5   1.0.6     drift-minor    skills/,prompts/   2h ago ✓
#   fork-social-ops      postiz          2.1.0   2.1.2     drift-major    .env,.env.local    —
#   fork-qa-harness      qwen-code       0.8.1   0.8.1     synced         (none)             15m ago ✓

growthub kit fork status <fork-id>
# Output: deep drift view, file-by-file changes, policy evaluation
```

**1.2 Interactive Policy Editor**
```bash
growthub kit fork policy <fork-id>
# Clack-based interactive editor:
#   Auto-approve: [patch] [minor] [major] (checkboxes)
#   Require approval for: (multiselect)
#   Protected paths: (add/remove with validation)
#   Remote sync: [off] [pr-draft] [direct-commit] (radio)
```

**1.3 Rich Heal Preview & Conflict Hints**
```bash
growthub kit fork heal <fork-id> --preview
# Output: colored diff, action counts (safe-add, safe-update, skipped, protected)
# If conflicts: "These 2 files modified both upstream and locally:
#   → skills/my-skill.ts (upstream: +50 lines) / (local: +100 lines)
#   Heal plan: SKIP (policy.untouchablePaths) — recommend manual merge or adjust policy"
```

**1.4 Background Heal with Notifications**
```bash
growthub kit fork heal <fork-id> --background
# Returns job ID immediately
# Desktop notification when done: "Fork blog-engine healed: 3 added, 1 skipped, 0 errors"
# Later: growthub kit fork heal --status <job-id>
```

**1.5 Enhanced Custom Workspace Starter**
```bash
growthub starter init --out ./my-workspace --template [interactive picker]
# Picks from: "Solo Studio" | "Studio + Operators" | "Full Agent Team" | "Custom"
# Auto-injects:
#   - coordination files (team.json, agent-roles.json)
#   - shared memory schema (if applicable kit family)
#   - monitoring hooks (if fleet ops enabled)
#   - .env template with team-level vars
```

### Kernel Packet

**`KERNEL_PACKET_FORK_UX_CONSOLIDATION`**
- Rich output reuses existing clack + picocolors stack (no new styling system)
- Policy editor produces same `policy.json` format as v0.4.2 (no schema changes)
- Trace events for all new commands appended to `trace.jsonl` (no new storage)
- Preview/dry-run never mutates fork state

### Why this phase compounds

- Operators get **full visibility** into what forked kits are doing
- Policy becomes **interactive**, not just JSON editing
- Heal becomes **safe + observable** (preview + background + notifications)
- Starter becomes **template-driven**, setting up team-ready scaffolds from day 1
- **Output:** v0.4.2 fork operations become production-grade, ops-ready

---

## Phase 2: Multi-Fork Team Coordination (Team Tier)

**Depends on:** Phase 1 complete (rich fork UX, policy editor, trace visibility)
**Unlocks:** Phase 3 (organizational governance)

### What ships

**2.1 Team-Scoped Workspace Isolation**
```bash
growthub team create acme-products \
  --description "Production agent team" \
  --policy-template "enterprise-standard"

growthub kit fork create \
  --kit higgsfield \
  --team acme-products \
  --out ./agent-studio

# Storage: ~/.growthub/teams/acme-products/
#   team.json (registration + metadata)
#   policy.json (team defaults, inherited by member forks)
#   index.json (fork pointers)
#   audit.jsonl (append-only team events)
```

**2.2 Team Fleet Visibility**
```bash
growthub fleet view --team acme-products
# Output: health grid for team forks only + aggregated metrics
#   Team: acme-products (3 forks)
#   Health: clean=1 | drift-minor=1 | drift-major=1 | awaiting=0
#   Remote: 2/3 forks synced
#   Pending Approvals: 1

growthub fleet drift --team acme-products --critical-only
# Output: only critical drift, prioritized for ops
```

**2.3 Team-Level Heal Coordination**
```bash
growthub fleet heal --team acme-products --dry-run
# Detects upstream changes, plans heals across ALL team forks in parallel
# Output: aggregated preview (which forks affected, how many actions per fork)
# Then: growthub fleet heal --team acme-products --apply --background

# Trace: each fork's heal recorded to its trace.jsonl + aggregated to team audit.jsonl
```

**2.4 Team Role & Member Management**
```bash
growthub team member add alice --role "operator" --permissions "heal,confirm"
growthub team member add bob --role "viewer" --permissions "status"

# Stored in team.json; no auth backend required yet (just local registration)
# Later phases: ops can require confirmation from specific roles
```

**2.5 Team Policy Inheritance**
```bash
# Team policy as default; per-fork overrides
growthub team policy set acme-products \
  --auto-approve-patch \
  --require-approval threshold=critical

# Fork can override:
growthub kit fork policy fork-blog-engine \
  --require-approval threshold=all  # stricter than team default
```

**2.6 Approval Queue (Local-First, No External Dependency)**
```bash
growthub fleet approvals --team acme-products
# Output: list of forks awaiting confirmation
#   Fork ID                  Kit            Action Type        Awaiting Since
#   ──────────────────────── ────────────── ────────────────── ──────────────
#   fork-social-ops          postiz         heal (critical)    3h 22m
#   fork-qa-harness          qwen-code      dep-upgrade        45m

growthub fleet approvals confirm <fork-id> --yaml decisions.yaml
# decisions.yaml: path → [approve|skip|reject]
# Job resumes; trace updated
```

### Kernel Packet

**`KERNEL_PACKET_TEAM_COORDINATION`**
- Team is a **directory + registration**, not a subsystem (files in `~/.growthub/teams/`)
- Team policy is orthogonal to fork policy (inheritance, not replacement)
- No new transport: team operations use existing fork-sync + GitHub integration
- Audit trail: every team action → `~/.growthub/teams/<team-id>/audit.jsonl` (append-only)
- Role assignments stored locally (no hosted auth required yet; foundation for Phase 3)

### Why this phase compounds

- **Operators stop managing forks in isolation.** Teams are the unit of work.
- **Multi-fork operations become coordinated**, not manual (detect drift across team → plan heals in parallel → confirm once, apply to many)
- **Team policies set defaults**, reducing per-fork repetition
- **Approval queue is local**, ops manage confirmations without external infrastructure
- **Output:** Ops can manage N forks as one logical team; approval is async + local

---

## Phase 3: Enterprise Governance & Org-Level Policy (Enterprise Tier)

**Depends on:** Phase 2 complete (team coordination, local approvals, role assignments)
**Unlocks:** Phase 4 (multi-zone + distributed control)

### What ships

**3.1 Organization Policy Engine**
```bash
growthub org create \
  --name "ACME Inc." \
  --policy-file ./org-policy.json

# org-policy.json:
{
  "autoApproveDeps": {
    "patch": true,
    "minor": true,
    "major": false
  },
  "requireApprovalThreshold": "critical",
  "untouchablePaths": ["secrets/", "*.env", "compliance/"],
  "auditRequired": ["remote-push", "heal-apply"],
  "roleGates": {
    "heal": ["operator", "admin"],
    "policy-change": ["admin"],
    "remote-sync": ["admin"]
  }
}
```

**3.2 Policy Enforcement at Heal Time**
```bash
growthub fleet heal --team acme-products --policy-audit
# Outputs:
#   3 actions: auto-approved (patch deps within policy)
#   1 action: BLOCKED (matches org.untouchablePaths = "secrets/")
#   1 action: awaiting approval (criticality = warning, policy requires confirmation)
```

**3.3 Immutable Audit Trail (Org-Level)**
```bash
# Every significant action appended to ~/.growthub/org/audit.jsonl
# Format: timestamp | actor | action | fork-id | result | policy-decision

growthub org audit \
  --from 2026-01-01 --to 2026-03-31 \
  --filter "remote-push,heal-apply" \
  --for-user alice \
  --csv > compliance_report.csv

# Output: exportable for SOC2 / compliance reviews
```

**3.4 Compliance & Release Gates**
```bash
growthub org policy audit --fork-id fork-blog-engine --heal-plan <json>
# Evaluates: "Would this heal plan violate org policy?"
# Output: allowed-actions | blocked-actions | requires-confirmation

# Heal can only proceed if audit returns zero blocked-actions
```

**3.5 Org-Wide Team Policies (Centralized, Inheritable)**
```bash
growthub team policy inherit-from-org acme-products
# Team now uses org defaults (auto-approve patch, require-approval critical, etc.)
# Team can still override specific settings (narrower is allowed; wider requires org approval)
```

**3.6 User/Role-Based Approval Gating** (Still Local)
```bash
# Policy: "heal requires confirmation from 2 operators"
growthub fleet heal --team acme-products --apply
# Pauses: awaiting confirmations from alice, bob
# They confirm locally:
growthub fleet approvals confirm <fork-id> --role operator --user alice
growthub fleet approvals confirm <fork-id> --role operator --user bob
# After 2 confirmations: heal auto-resumes
```

### Kernel Packet

**`KERNEL_PACKET_ENTERPRISE_GOVERNANCE`**
- Org policy is **canonical + inherited** by all teams (unless explicitly overridden)
- Policy enforcement is **deterministic**: every heal evaluated against org policy before execution
- Audit trail is **immutable + exportable** (compliance-ready)
- Approval gating is still **local** (no hosted service); just local role checks + multi-user confirmations
- No new auth: uses existing file-based team member roles (Phase 2 foundation)

### Why this phase compounds

- **Enterprise procurement asks are answerable:** "Prove you never touched production secrets" → `growthub org audit --filter untouchablePaths`
- **Governance is deterministic:** org policy is evaluated, not guessed
- **Compliance exports are real:** audit trails are durable, timestamped, exportable
- **Approval is multi-party:** ops can require N confirmations before healing production
- **Output:** Org gets policy-driven governance; ops get compliance-ready audit trails

---

## Phase 4: Multi-Zone Distributed Control (Scale Tier)

**Depends on:** Phase 3 complete (org policy + audit + approval gating)
**Unlocks:** Phase 5 (agent-orchestrated workflows)

### What ships

**4.1 Zone Definition & Network Boundaries**
```bash
growthub zone create prod-us-east \
  --type "on-prem" \
  --gateway "ssh://admin@prod-gateway.acme.com" \
  --policy "inherit-from-org"

growthub zone list
# Output: zones + reachability status
#   prod-us-east:    reachable (SSH gateway)
#   prod-eu-west:    reachable (SSH gateway)
#   staging-local:   reachable (same machine)
```

**4.2 Zone-Scoped Fork Creation**
```bash
growthub kit fork create \
  --kit higgsfield \
  --team acme-products \
  --zone prod-us-east \
  --out ./agent-studio

# Fork stored on prod-us-east machine (via SSH gateway)
# Healing runs in that zone; git push uses zone-scoped credentials
```

**4.3 Cross-Zone Heal Coordination**
```bash
growthub fleet heal --team acme-products --zones "[prod-us-east, prod-eu-west]" --dry-run
# Detects upstream changes once
# Plans heals independently in each zone (respecting zone policies)
# Returns: per-zone results

# Apply:
growthub fleet heal --team acme-products --zones "[prod-us-east, prod-eu-west]" --apply --background
# Healing in parallel across zones; status aggregated in fleet view
```

**4.4 Distributed Approval Relay (Async, No Polling)**
```bash
# Heal in prod-us-east requires approval from ops team (located elsewhere)
# Ops run: growthub fleet approvals --team acme-products --filter zone=prod-us-east
# First responder confirms; job resumes in prod-us-east
# Trace: who confirmed, from which zone, when
```

**4.5 Capability Replication Across Zones**
```bash
growthub org capability sync --from-zone prod-us-west --to-zone prod-us-east
# Copies custom skills, team-authored templates to all zones (one source of truth)

growthub fleet heal --team acme-products --all-zones
# Healing uses replicated capabilities consistently across all zones
```

**4.6 Zone Health & Observability**
```bash
growthub zone status
# Output: per-zone health + reachability
growthub org observe --by-zone
# Metrics: healing success rate by zone, approval latency by zone, etc.
```

### Kernel Packet

**`KERNEL_PACKET_MULTI_ZONE_CONTROL`**
- Zones are **network-scoped boundaries**, not new auth systems
- Healing is **independent per zone** but **coordinated** via local approval queue
- Capabilities are **replicated** (one source of truth in org, pushed to all zones)
- Org policy applies **uniformly** across zones (no per-zone policy drift)
- Approval relay is **async** (no polling, no heartbeats; approval just triggers job resume)
- Git push via zone gateway uses **existing GitHub auth** (device-flow or PAT)

### Why this phase compounds

- **Enterprise ops:** Agents heal prod in US, staging in EU, **same policy**, **one approval queue**
- **Air-gapped networks:** Zones enable on-prem + managed hybrid (agents don't need direct internet; gateway handles GitHub)
- **Deterministic results:** Healing in zone A vs zone B produces identical outcomes (same upstream, same policy, same capabilities)
- **Failure isolation:** Zone network issue doesn't block other zones
- **Output:** Large orgs can operate agent teams across multiple infrastructure boundaries

---

## Phase 5: Agent-Authored Workflows & Self-Improving Org (Autonomy Tier)

**Depends on:** Phase 4 complete (multi-zone operations, distributed approval)
**Unlocks:** Phase 6 (LLM-native observability + diagnostics)

### What ships

**5.1 Trace-Pattern-Driven Workflow Proposals**
```bash
growthub fleet heal --team acme-products --ai-propose-workflow
# Analyzer (local LLM or heuristic) reads last 50 heal traces:
#   - "100% of patch upgrades auto-approved by policy in last 30 days"
#   - "Minor version bumps: 95% approved, avg latency 2 hours"
#   - "Custom skills never require re-healing: 0% re-trigger rate"
#
# Proposes workflow:
#   [WORKFLOW] auto-heal-patches
#     when: upstream-patch-detected
#     wait: 15m (allow manual stop)
#     run: heal --auto-approve patch
#     notify-if-blocked: slack (optional)

# User reviews: growthub workflow show --source agent-proposal
# User approves: growthub workflow deploy --proposal <id>
# Workflow is durable (stored in org, audited)
```

**5.2 Policy Improvement Proposals (Agent as Advisor)**
```bash
growthub org policy advise --from-fleet-patterns
# Monitor Agent reads audit trail:
#   "Over 90 days: 0 policy violations in critical-approval gates"
#   "Recommendation: auto-approve minor bumps (currently require manual approval)"
#
# Ops reviews: growthub org policy show --proposal <id>
# Ops approves: growthub org policy apply --proposal <id>
# Policy updates; new heal baseline takes effect
```

**5.3 Swarm Orchestration (Multi-Agent Coordination)**
```bash
growthub swarm create acme-agent-team \
  --kits "[studio, operator, workflow]" \
  --orchestrate-via "local-message-queue" \
  --team acme-products

# Swarm creates:
#   - shared memory schema for inter-agent communication
#   - coordination files in workspace
#   - message queue (local file-based, no external deps)

growthub swarm run --team acme-products
# All agent kits start together; heal is coordinated across swarm
# One agent's drift triggers coordinated re-plan for dependent agents
```

**5.4 Workflow Execution (Agent-Driven)**
```bash
growthub workflow execute --name auto-heal-patches --team acme-products --trigger-on upstream-release
# Workflow runs as background job (no operator involvement unless blocked)
# Trace: every workflow step + decisions recorded

# Operator visibility:
growthub workflow status --team acme-products
# Output: running workflows, last results, next scheduled
```

**5.5 Self-Healing Org Topology** (Org Learns)
```bash
# After N successful auto-heals, policy advisor proposes adjustment
# If approved: org baseline shifts (e.g., "auto-approve minor" becomes default)
# All new teams inherit improved policy; existing teams get gentle advisory

# Audit trail captures: "Policy updated based on agent proposal; 90-day success rate 99.2%"
```

### Kernel Packet

**`KERNEL_PACKET_AGENT_WORKFLOWS`**
- Workflows are **derived from trace patterns**, not hard-coded
- Agent proposals are **durable + audited** (stored in org audit log before any action)
- Policy changes require **explicit opt-in** (no auto-updates; advisor proposes, ops approves)
- Swarm uses **local message queue** (no external broker; files in workspace)
- Workflow execution is **durable** (persisted state in trace.jsonl; can resume after interruption)
- No agent writes directly to policy/workflow; all changes are explicit proposals + approvals

### Why this phase compounds

- **Agents become org advisors:** "Your healing patterns suggest you can safely auto-approve minor bumps"
- **Policies evolve from real-world data:** compliance doesn't decay; it adapts to proven patterns
- **Swarms are coordinated, not choreographed:** one agent can trigger re-planning in dependent agents
- **Full autonomy boundary is clear:** agents propose, ops approve, org improves
- **Output:** Org gets agents that learn from operational patterns + improve governance over time

---

## Phase 6: Enterprise Observability & LLM-Native Diagnostics (Insight Tier)

**Depends on:** Phase 5 complete (agent workflows, policy advisors, swarm coordination)
**Unlocks:** Phase 7 (compliance + readiness scoring)

### What ships

**6.1 Local Observability Dashboard**
```bash
growthub org observe --serve http://localhost:8000
# Metrics (all computed from cached audit logs, zero external deps):
#   - Fleet health grid (by team, by kit, by zone)
#   - Drift trends (Is upstream churn increasing? Decreasing?)
#   - Approval latency (How long do ops take to confirm?)
#   - Healing success rate (% applied | skipped | failed per team/zone)
#   - Policy violation frequency (violations caught by org policy gates)
#   - Agent proposal acceptance rate (workflow proposals approved/rejected)
#   - Custom skill inventory (per team, per zone)

# Time windows: last-24h, last-7d, last-30d, last-90d (filterable)
```

**6.2 LLM-Native Fleet Diagnostics**
```bash
growthub fleet debug --team acme-products --ai-summary
# Local LLM (via `growthub local-intelligence`) ingests:
#   - Last 20 heal traces for the team
#   - Current fleet health + team policies + org policy
#   - Upstream kit CHANGELOG (if available)
#
# Returns natural-language diagnostics:
#   "3 forks failing heal: skills/ai-skill.ts matches policy.untouchablePaths.
#    Recommend: (1) update policy to exclude custom skills, or (2) move skills to custom/ (exempt).
#    Success rate would improve from 85% → 98%."

growthub fleet debug --fork fork-blog-engine --ai-trace-analysis
# "Last 5 heals: 4 applied cleanly, 1 blocked on custom config.
#  Recommendation: mark ./config/custom.json as untouchable; or sync it from upstream first."
```

**6.3 Zone-Level Observability**
```bash
growthub org observe --by-zone --metric "healing-success-rate"
# Output: prod-us-east: 99.2% | prod-eu-west: 97.8% | staging-local: 95.1%
# Helps identify zone-specific issues (e.g., EU network lag affecting heal latency)

growthub zone diagnose prod-us-east
# "Gateway latency: 45ms. Last heal took 8m (usually 4m). Upstream kit changelog available."
```

**6.4 Audit Trail Visualization & Export**
```bash
growthub org audit --dashboard --from 2026-01-01 --to 2026-03-31
# Browser UI: timeline of all actions, filterable by actor/team/fork/action
# Can export to CSV, JSON for compliance reviews

growthub org audit --policy-violations-only --csv > violations.csv
# Compliance report: all policy violations caught (or nearly caught) by org gates
```

### Kernel Packet

**`KERNEL_PACKET_ENTERPRISE_OBSERVABILITY`**
- Observability is **local-first**: all queries run on cached audit logs (no remote calls)
- LLM diagnostics use **local model** (Qwen via `local-intelligence`) + cached org state
- Dashboard is **self-contained** (served by CLI, no external BI tool)
- Metrics are **deterministic + reproducible**: same trace input always yields same metrics
- Exports are **compliance-ready**: immutable timestamps, full actor/action trail

### Why this phase compounds

- **Ops get actionable insights** without external observability vendor
- **LLM diagnoses real fleet patterns** (not generic advice)
- **Compliance audits are automated** (export immutable trails for SOC2/ISO reviews)
- **Zone-level diagnostics catch infrastructure issues** before they become outages
- **Output:** Orgs have production-grade visibility + LLM-powered diagnostics, all local

---

## Phase 7: Enterprise Readiness Scorecard & Compliance Automation (Readiness Tier)

**Depends on:** Phase 6 complete (observability + LLM diagnostics + audit exports)
**Completes roadmap vision**

### What ships

**7.1 Enterprise Readiness Scorecard**
```bash
growthub org readiness --category "soc2" --category "disaster-recovery" --category "multi-zone"
# Output:
#   SOC2 Compliance:
#     ✓ immutable-audit-trail    (audit.jsonl append-only, validated)
#     ✓ approval-gating-enabled  (role-based confirmations required for heal)
#     ✓ policy-enforcement       (org policy gates all significant actions)
#     ✓ actor-attribution        (every action recorded with actor + timestamp)
#     ✗ mfa-enabled              (local tokens, no hosted MFA yet)
#   
#   Disaster Recovery:
#     ✓ snapshot-capability      (can snapshot org state)
#     ✓ cross-zone-replication   (capabilities replicated across zones)
#     ✗ rollback-tested          (not tested in last 90 days)
#   
#   Multi-Zone:
#     ✓ zones-active             (3 zones, all reachable)
#     ✓ policy-sync              (org policy applied uniformly)
#     ✗ capability-replication   (not tested in last 30 days)
#
# Score: 12/16 (75%) — ready for SOC2 except MFA
```

**7.2 Compliance Automation**
```bash
growthub org compliance-report --standard "soc2" --from 2026-Q1 --to 2026-Q2
# Auto-generates: governance structure doc, audit log proof, policy enforcement examples
# Output: PDF-ready markdown suitable for auditors

growthub org compliance-check --pre-production
# Runs all readiness checks; fails if critical gaps (e.g., approval gating missing)
# Perfect for CI gate before prod deployment
```

**7.3 Org Snapshot & Point-in-Time Restore**
```bash
growthub org snapshot create --name "2026-Q2-cutover"
# Captures: all team policies, fork registrations, org policy, zone definitions, workflow state
# Storage: ~/.growthub/org/snapshots/2026-Q2-cutover.tgz

# If healing experiment breaks assumptions:
growthub org snapshot restore 2026-Q2-cutover --dry-run
# Outputs: what would be restored + what's different now
growthub org snapshot restore 2026-Q2-cutover --apply
# Restores org to point-in-time state; forks remain as-is (no data loss)
```

**7.4 Governance Documentation Generator**
```bash
growthub org docs generate --format "md" --include "[policy, roles, zones, audit]"
# Auto-creates: policy.md (org policies + inheritance), roles.md (team member permissions), zones.md (network topology), audit-guide.md (how to read audit trails)
# Perfect for onboarding new team members

growthub org docs generate --format "html" --serve http://localhost:8001
# Browser-based governance wiki, always in sync with actual config
```

**7.5 Continuous Compliance Monitoring**
```bash
growthub org monitor-compliance --category "soc2" --alert-on "policy-violation,unapproved-action"
# Runs in background; alerts ops if:
#   - Policy violation detected
#   - Action taken without required approvals
#   - Audit trail corrupted (append-only invariant broken)
#   - Zone unreachable for >30m

# Alerts are local (no external service; writes to ~/.growthub/org/alerts.jsonl)
```

### Kernel Packet

**`KERNEL_PACKET_COMPLIANCE_AUTOMATION`**
- Scorecard is **deterministic + cacheable** (recomputed from audit logs + config)
- Compliance reports are **generator-based** (markdown → PDF is tooling, not CLI's concern)
- Snapshots are **point-in-time opaque blobs** (no git history rewriting; org/teams stay clean)
- Governance docs are **auto-generated from config**, so they never drift from reality
- Continuous monitoring is **local** (no external compliance service dependency)

### Why this phase compounds

- **Enterprise procurement:** Scorecard + compliance report answer any "how do you prove X?" question
- **Onboarding:** Auto-generated governance docs keep new team members in sync
- **Safety net:** Snapshots + rollback let ops experiment confidently
- **Output:** Orgs can confidently commit to compliance + governance standards

---

## Summary: Dependency-Ordered Compounding

| Phase | Capability | Enterprise Unlock |
|-------|-----------|------------------|
| **1** | Fork UX consolidation + policy editor | Operators control + preview forks safely |
| **2** | Team coordination + local approvals | Teams replace individual forks as unit of work |
| **3** | Org policy + audit trail + role gating | Enterprise governance is deterministic + auditable |
| **4** | Multi-zone distributed control | Ops scale across infrastructure boundaries |
| **5** | Agent workflows + self-improving org | Agents advise on policy; org learns from patterns |
| **6** | Observability + LLM diagnostics | Ops get insights without external tools |
| **7** | Readiness scorecard + compliance automation | Enterprise procurement / audit readiness |

---

## Each Phase Outputs the Foundation for Next

- **Phase 1 output** → Rich fork visibility + policy control → feeds Phase 2
- **Phase 2 output** → Team-level operations + local approval queue → feeds Phase 3
- **Phase 3 output** → Org policy + audit trail + role assignments → feeds Phase 4
- **Phase 4 output** → Multi-zone operations + distributed approval relay → feeds Phase 5
- **Phase 5 output** → Agent workflows + learned policies → feeds Phase 6
- **Phase 6 output** → Observability + diagnostics → feeds Phase 7
- **Phase 7 output** → Compliance-ready governance + ops confidence → **shipping enterprise agent orgs**

---

## Cross-Cutting Discipline (All Phases)

1. **Consistent Beautiful Output**
   - Every new command reuses clack prompts, picocolors, spinners, status boxes
   - Nested UX (settings nav pattern) keeps menus clean
   - Next-step hints in every help text

2. **Scripting Support**
   - `--json` output on all commands
   - `--yes` auto-approve for CI pipelines
   - Trace events machine-readable (append to `.jsonl`)

3. **Deterministic Testing**
   - Kernel packets freeze test gates before merge
   - `bash scripts/pr-ready.sh` runs validation suite
   - No regressions; each phase passes before next begins

4. **Documentation Surge**
   - README updated with end-to-end flows per phase
   - Kernel packet docs link from main roadmap
   - Examples in help text (e.g., `growthub kit fork heal --help`)

5. **No New Dependencies**
   - Each phase reuses existing stack (clack, picocolors, pino, zod, commander)
   - Observability = local file processing, not external vendor
   - LLM diagnostics = local Qwen model, not third-party API

---

## Releasing Each Phase

Each phase ships as a minor version:

- **v0.5.x** — Phase 1 (fork UX consolidation)
- **v0.6.x** — Phase 2 (team coordination)
- **v0.7.x** — Phase 3 (org governance)
- **v0.8.x** — Phase 4 (multi-zone)
- **v0.9.x** — Phase 5 (agent workflows)
- **v1.0.x** — Phase 6 (observability)
- **v1.1.x** — Phase 7 (compliance automation)

Each release:
1. Merges to `main` + publishes to npm
2. Includes updated README with new surface area
3. Ships kernel packet docs (frozen for that phase)
4. Bundles updated esbuild dist

---

## Why This Roadmap Works

1. **No arbitrary timelines** — each phase depends on previous outputs, not calendar dates
2. **Compound leverage** — Phase N gains all capabilities from Phase 1..N-1
3. **Customer-first** — aligns with v0.4.2 vision (sustainable customization → team ops → enterprise governance)
4. **Kernel packet discipline** — each phase has frozen contract + invariants before shipping
5. **Local-first philosophy** — no external services required; observability, compliance, approval = local operations
6. **Enterprise-ready exit** — Phase 7 ships with scorecard + compliance automation ready for procurement

**Starting from v0.4.2, this path transforms Growthub from "kit discovery platform" into "enterprise agent organization control plane."**
