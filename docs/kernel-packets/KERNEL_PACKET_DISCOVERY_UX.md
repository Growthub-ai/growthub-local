# Discovery UX Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for registering a new top-level discovery lane without breaking the existing hub, navigation ordering, or nested menu flows.

Use it when you are:

- adding a new top-level option to `growthub discover` beyond the shipped lanes (Full Local App, Worker Kits, Templates, Workflows, Agent Harness, Connect Growthub Account, Help CLI)
- adding a new harness under the Agent Harness filter type
- extending nested picker flows with new sub-options
- registering a new interactive picker function (`run<Lane>Picker`)
- adjusting back-navigation or placement of existing options
- adding filter-by-type options to an existing lane

## Why This Packet Exists

The Growthub CLI discovery hub is the canonical entry point for agents and humans. It is the surface where every lane gets equal first-class treatment. PR #77 restructured it as an "Agent Harness" filter-by-type hub alongside workflow and kit lanes. PR #78 finalized the ecosystem map rendering.

Every discovery extension affects:

- the top-level menu order (first impression for new agents)
- nested back-navigation (dead-ends make agents abandon flows)
- filter semantics (type filters must be discoverable)
- UX consistency (Clack prompts, Picocolors styling, banner display)

A bad extension breaks agent navigation, creates dead-ends, duplicates entries, or drifts from the shipped UX conventions. This packet captures the stable path for registering new lanes without breaking any of that.

## Kernel Invariants

Every discovery UX extension must satisfy these invariants before merge:

- existing top-level options remain in their established order (Full Local App, Worker Kits, Templates, Workflows, Agent Harness, Connect Growthub Account, Help CLI)
- new lane is registered in the discovery menu with consistent `emoji + label + hint` pattern
- nested menus include explicit back-navigation (`← Back to main menu` or `← Back to <parent>`)
- `p.isCancel()` checks run on every prompt
- cancellation prints `p.cancel("Cancelled.")` before `process.exit(0)`
- banner displays via `printPaperclipCliBanner()` at lane entry
- `printPaperclipCliBanner()` imported from `cli/src/utils/banner.js`
- Clack prompts (`@clack/prompts`) used for all interactive surfaces
- Picocolors (`picocolors`) used for styling (no raw ANSI codes)
- back-navigation options placed consistently (bottom of option lists per recent iteration)
- no dead-ends in nested picker flows
- picker function returns `"done" | "back"` for consistent wiring
- focused vitest coverage passes
- repo gates pass (`smoke`, `validate`, `verify`)
- harness kernel check passes (`bash scripts/check-agent-harness-kernel.sh`) when adding harness options

## Surface Area Contract

Use this contract shape for every discovery UX extension:

1. **Registration primitive**
   - add option to the top-level discovery `p.select` in `cli/src/index.ts`
   - follow `emoji  Label` format with consistent spacing
   - add hint text describing what the lane does
2. **Picker primitive**
   - export async function `run<Lane>Picker(opts: { allowBackToHub?: boolean }): Promise<"done" | "back">`
   - picker handles its own banner, intro, and outro
   - picker respects `allowBackToHub` for back-navigation wiring
3. **Filter primitive (when lane supports filter-by-type)**
   - provide `p.select` for filter type with `All Types` option plus per-type options
   - preserve existing type options when extending (e.g. Agent Harness filter preserved its existing harness list)
   - filter selection gates subsequent picker
4. **Back-navigation primitive**
   - every nested menu includes `← Back to <parent>` option at the end
   - returning `"back"` from picker surfaces control to parent menu
   - top-level picker returns `"back"` to re-render discovery hub
5. **Cancellation primitive**
   - all `p.isCancel()` checks present on every `p.select`, `p.text`, `p.confirm`
   - cancel handler prints `p.cancel("Cancelled.")` then `process.exit(0)`
6. **Command surface**
   - lane exposes `register<Lane>Commands(program: Command)` for non-interactive entry
   - interactive picker is the default `.action(...)` on the lane command
   - subcommands support scripting (e.g. `list`, `inspect`, `download`, `validate`)
7. **Styling primitive**
   - headers use `pc.bold(...)`
   - dim metadata uses `pc.dim(...)`
   - success states use `pc.green(...)`
   - warnings use `pc.yellow(...)`
   - errors use `pc.red(...)`
   - box rendering uses the existing `box()` helper pattern

## Packet Inputs

- lane id (for example `knowledge`, `marketplace`, `<new-lane>`)
- command file under `cli/src/commands/<lane>.ts`
- discovery registration in `cli/src/index.ts`
- picker export in `cli/src/commands/<lane>.ts` (`run<Lane>Picker`)
- focused tests under `cli/src/__tests__/<lane>.test.ts`
- optional docs update in `README.md` and `cli/README.md` ecosystem map

## Packet Procedure

### P1. Picker Implementation

- create `run<Lane>Picker(opts: { allowBackToHub?: boolean }): Promise<"done" | "back">` in `cli/src/commands/<lane>.ts`
- call `printPaperclipCliBanner()` at entry
- call `p.intro(pc.bold("<Lane Name>"))` after banner
- implement filter/selection/action flow with Clack prompts
- handle cancellation on every prompt
- return `"back"` when user selects back-to-hub option
- return `"done"` when action completes

### P2. Command Surface

- implement `register<Lane>Commands(program: Command)` in same file
- default `.action(...)` invokes the interactive picker
- add subcommands for scripting: `list`, `inspect`, `<action>`, `--json` flag where applicable
- subcommands use same styling primitives as picker

### P3. Discovery Registration

- import picker in `cli/src/index.ts`:
  ```ts
  import { register<Lane>Commands, run<Lane>Picker } from "./commands/<lane>.js";
  ```
- register commands against the program: `register<Lane>Commands(program)`
- add option to top-level discovery `p.select` options list in correct position
- wire up picker invocation in discovery action handler
- preserve existing option order and label patterns

### P4. Filter-by-Type Wiring (if lane supports filter)

- add per-type options to discovery `p.select` if following Agent Harness filter pattern
- gate picker entry on selected type
- verify `All Types` catch-all works

### P5. Back-Navigation Wiring

- ensure every nested menu has `← Back to <parent>` option at the end
- ensure picker returns `"back"` when back-to-hub is chosen
- ensure parent handler re-renders top-level menu when child returns `"back"`

### P6. Deterministic Validation

Run:

```bash
cd cli && pnpm vitest src/__tests__/<lane>.test.ts
bash scripts/check-agent-harness-kernel.sh  # if adding harness options
bash scripts/pr-ready.sh
```

### P7. Manual UX Validation

Navigate the discovery hub:

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
```

Verify:

- new lane appears in correct position
- selecting new lane enters picker with banner + intro
- nested menus have back-navigation
- cancellation works at every prompt
- returning `"back"` re-renders top-level menu
- no dead-ends in any sub-flow

### P8. Docs Sync

- update `README.md` ecosystem map if lane is a major addition
- update `cli/README.md` command reference table
- update `docs/CLI_WORKFLOWS_DISCOVERY_V1.md` if lane affects workflow discovery
- preserve README collapsed-accordion structure from PR #78

### P9. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow
- confirm npm remote versions match merged package versions
- run `growthub discover` from the published CLI to validate real-world UX

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
cd cli && pnpm vitest src/__tests__/<lane>.test.ts
bash scripts/check-agent-harness-kernel.sh
bash scripts/pr-ready.sh
```

## Definition Of Done

A discovery UX extension is done only when:

- picker implements the `run<Lane>Picker` signature returning `"done" | "back"`
- command surface registers both interactive default and scripting subcommands
- discovery registration preserves existing option order and styling
- back-navigation exists in every nested menu
- cancellation works at every prompt
- manual UX validation passes in `growthub discover`
- docs sync (README ecosystem map + cli/README command reference)
- focused vitest coverage passes
- PR checks are green
- merge lands in `main`

## UX Anti-Patterns to Avoid

- Dead-ends: any picker that has no `← Back to <parent>` option at the end
- Raw ANSI: bypassing Picocolors for direct escape codes
- Silent cancellation: missing `p.isCancel()` handler that lets the process hang
- Order drift: reordering existing top-level options when adding a new one
- Duplicate entries: same lane registered twice across different menus
- Missing banner: entering a lane without `printPaperclipCliBanner()`
- Inconsistent labels: different emoji/style conventions than existing lanes

## Related Packets

- [Agent Harness Kernel Packet](./KERNEL_PACKET_AGENT_HARNESS.md)
- [Custom Workspace Kernel Packet](./KERNEL_PACKET_CUSTOM_WORKSPACES.md)
- [Template Extension Kernel Packet](./KERNEL_PACKET_TEMPLATE_EXTENSION.md)
