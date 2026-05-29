# Causation ITT and Pure Eligibility Drivers

This document records the product theory behind the Workspace Lens and helper
handoff work shipped in the `growthub-custom-workspace-starter-v1` workspace.
It is the operational continuation of the AWaC configuration-causation thesis:
workspace configuration is not passive description. It is the causal substrate
that determines what the user sees, what the helper can safely do, what is
blocked, what is complete, and what action is eligible next.

Reference context: the Growthub Local AWaC white paper frames the workspace
artifact as a live causal graph: config plus source records plus run evidence
derive activation, guidance, workflow execution, and agent behavior.

## Definition

**Causation ITT** means **information-theoretic transformation** applied to a
governed workspace:

1. The workspace starts as high-entropy state: objects, dashboards, workflows,
   sandboxes, source records, helper receipts, persistence mode, and deploy
   evidence can all exist in different combinations.
2. A pure deriver reads that state without side effects.
3. The deriver emits low-entropy guidance: complete, blocked, eligible, next
   action, evidence, and available tools.
4. The user or helper acts through the normal no-code surfaces.
5. Workspace state changes, then the same deriver recomputes the next view.

The product rule is simple: **state becomes eligibility, eligibility becomes
guidance, guidance becomes action, action becomes evidence**.

## Pure Eligibility Drivers

A pure eligibility driver is a deterministic function over workspace evidence.
It never depends on a hidden UI flag, a hardcoded tour step, or a fake agent row.
It answers one product question:

> Given the current workspace artifact, what is the user or helper eligible to
> do next?

Eligibility drivers in this feature branch include:

| Driver | Source state | User-facing result |
| --- | --- | --- |
| Workspace activation | `growthub.config.json`, source records, metadata graph | Unlocks Workspace Lens only after real setup conditions are met |
| Workspace Lens registry | Derived lens state from `workspace-activation.js` | Shows persistence, orchestration, deploy, tasks, and app-build readiness |
| Contribution graph | Run receipts, helper receipts, source records | Renders daily workspace activity using a GitHub-style contribution model |
| Helper handoff | `workspace-helper-sandbox` row plus `workspace-ui-cache` flag | Shows setup once, then opens the real helper widget after configuration |
| Helper sandbox setup | Sandbox environment fields | Configures the existing helper widget to use Codex, Claude, or another agent host |
| Swarm condition packet | Lens state plus available tools | Gives agents the same goal, prerequisite, evidence, and tool contract as the UI |

The important boundary is that these are **drivers**, not duplicated workflows.
They do not create a competing Workspace Lens agent. They expose the canonical
helper widget path and the canonical sandbox-environment primitive.

## No-Code Product Implication

The user should never need to understand the raw config to complete the loop.
The no-code surface must show the controls implied by the eligibility state:

- if the helper sandbox is missing, the Ask Helper button and Workspace Lens
  callout open the same helper setup modal
- if the sandbox is configured, both surfaces open the real helper widget
- the setup modal exposes the same mental model as the Data Model sandbox row:
  where it runs, execution adapter, Paperclip agent host, runtime, timeout, and
  network policy
- once setup succeeds, `workspace-ui-cache` stores the completion flag so the
  callout does not keep reappearing
- every helper response still routes through the governed helper query and
  apply flow

This keeps the user inside one no-code product path while preserving the
workspace-as-code contract underneath it.

## The Daily Ritual Loop

Workspace Lens turns activation into an ongoing operating surface:

1. **Read state**: derive the lenses and contribution graph from the workspace.
2. **See the situation**: filters, search, cards, and the active-branches table
   reduce the workspace into visible control points.
3. **Pick the next action**: eligible rows expose preview, next action,
   condition packet, and copyable lens URLs.
4. **Use the helper**: the helper widget uses the configured
   `workspace-helper-sandbox` agent host.
5. **Apply safely**: proposals mutate only through the existing helper apply and
   workspace PATCH boundaries.
6. **Record evidence**: run records, source records, helper receipts, and UI
   cache rows become tomorrow's derived state.

This is the dopamine loop without hidden state: each useful action creates
evidence, and evidence makes the next visible state better.

## Agent Contract

Agents must operate the same state machine the user sees.

They can be given a derived condition packet:

- goal
- current state
- prerequisite
- available tools
- expected evidence

They should not invent objects or mutate JSON directly when the no-code surface
or helper apply flow can perform the same action. The purpose of the driver is
to collapse ambiguity so the agent can act with the same constraints as the
human operator.

## Implementation Anchors

The feature branch implements this theory in the governed workspace starter:

- `apps/workspace/lib/workspace-activation.js`
- `apps/workspace/app/components/WorkspaceLensPanel.jsx`
- `apps/workspace/app/components/WorkspaceContributionGraph.jsx`
- `apps/workspace/app/components/WorkspaceHelperSetupModal.jsx`
- `apps/workspace/app/workspace-rail.jsx`
- `apps/workspace/app/data-model/components/HelperSidecar.jsx`
- `apps/workspace/app/api/workspace/helper/query/route.js`
- `apps/workspace/lib/workspace-helper-apply.js`

The invariant is that all user guidance remains derived from the workspace
artifact, and all action remains routed through governed workspace primitives.

## Release Rule

This document describes product causation. It does not add a new runtime layer,
new storage adapter, new agent type, or competing workflow. Any future extension
must preserve these constraints:

- one canonical helper widget
- one canonical helper sandbox row: `workspace-helper-sandbox`
- no duplicate Workspace Lens agent rows
- no hidden UI-only activation state
- no mutation path outside the workspace API, helper apply flow, or sandbox-run
  adapter boundary
- no claims of completion without persisted evidence
