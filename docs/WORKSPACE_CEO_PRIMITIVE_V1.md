# Workspace CEO Primitive V1

Official feature note for the `0.14.4` Workspace CEO Primitive release.

The Workspace CEO Primitive turns the helper sidecar into the workspace operator cockpit. It closes the loop between first-use setup, governed agent swarm execution, reusable Agent Teams, runtime history, and the real workflow canvas.

## Release Thesis

CEO is not a rail button, a new route, or a separate runtime. It is the `/ceo` command surface inside the existing Workspace Helper sidecar:

```text
/ceo
  -> first-use CEO setup checklist
  -> governed /swarm proposal
  -> helper/apply reviewed mutation
  -> swarm-workflows sandbox row
  -> sandbox-run proof
  -> agent-outcomes receipts
  -> setup completion marker
  -> operational cockpit
  -> History + Agent Teams tabs
  -> linked workflow canvas
```

The primitive uses existing workspace state only: Data Model objects, sandbox-environment workflow rows, Agent Outcome receipts, helper/apply proposals, and the `/workflows` canvas. It adds no third mutation lane and no separate swarm object model.

## What 0.14.4 Adds

- `/ceo` opens the CEO Cockpit from the helper command menu.
- First-use setup guides the user through proving one complete governed swarm loop.
- The setup checklist derives from real workspace config and receipt state.
- Once complete, the checklist disappears and the cockpit enters operational mode.
- Operational mode has two focused tabs:
  - `History` for runtime swarm outcomes.
  - `Agent Teams` for reusable atomic team blueprints.
- Agent Teams are governed Data Model rows in the existing `custom` object type.
- Agent Team cards keep their dynamic purpose and blueprint metadata visible.
- A linked Agent Team card opens the real workflow canvas for its linked swarm workflow row.
- The workflow canvas target uses the saved swarm row graph field, not a prompt shortcut.

## Customer Journey

### First Use

The user starts from `/ceo`, not from the rail. The cockpit explains the operator loop and asks the user to prove it once:

1. understand the CEO loop;
2. create a governed agent swarm;
3. validate execution readiness;
4. launch through Background Tasks;
5. observe truthful telemetry;
6. review the outcome;
7. confirm governance receipts;
8. mark CEO setup complete.

Completion is stored as a marker on the workspace helper row after the loop is provably done. The marker is part of workspace config, so the completed state persists with the workspace artifact.

### Daily Use

After setup, `/ceo` becomes a clean operating cockpit:

- `History` answers what ran, whether it is runnable, blocked, failing, or complete, and which workflow owns the evidence.
- `Agent Teams` answers which reusable team blueprints exist and which swarm workflow they are linked to.
- The card action on a linked Agent Team opens the exact workflow canvas for that team’s swarm workflow.

This keeps the mental model stable: Agent Teams are reusable configuration, History is runtime outcome, and the workflow canvas is where the executable orchestration graph lives.

## Source Of Truth

| Concern | Source |
| --- | --- |
| Entry point | Helper command `/ceo` |
| Setup state | `deriveCeoBootstrapState()` over workspace config + receipts |
| Operational history | `deriveCeoCockpit()` over `swarm-workflows` + receipts |
| Agent Teams | `agent-swarm-teams` custom Data Model object |
| Team-to-workflow link | `linkedSwarmWorkflowName` on the Agent Team row |
| Executable graph | linked `swarm-workflows` sandbox row `orchestrationConfig` / `orchestrationGraph` |
| Execution | `POST /api/workspace/sandbox-run` |
| Receipts | `GET /api/workspace/agent-outcomes` |
| Canvas | `/workflows?object=<objectId>&row=<rowName>&field=orchestrationConfig` |

## Required Product Invariants

- No CEO rail button.
- No side route as the primary entry point.
- No prompt-only shortcut for linked Agent Team cards.
- No duplicate swarm object model.
- No direct workflow live-state mutation through PATCH.
- No fake telemetry, fake run records, or synthetic checklist completion.
- No hidden browser/local storage as persistence.
- Agent Teams remain configuration; swarm workflows remain runtime.
- The workflow canvas remains the executable graph authority.

## Validation Map

The primitive is complete when these checks pass together:

- `/ceo` opens the sidecar cockpit.
- First-use checklist hydrates from live `/api/workspace` config and receipts.
- A governed swarm can be proposed, applied, launched, observed, and reviewed.
- `agent-outcomes` contains the run/apply receipts needed by the checklist.
- Completing setup switches the cockpit into operational mode.
- `History` shows completed runtime swarm state.
- `Agent Teams` shows saved blueprints without stacking under History.
- A linked Agent Team opens `/workflows` for its exact linked swarm workflow row.
- Focused CEO/Agent Teams/swarm derivation tests pass.
- Package versions are aligned at `@growthub/cli@0.14.4` and `@growthub/create-growthub-local@0.14.4`.

