# AWaC Eligibility Calculus V1

Companion to [`docs/GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md`](./GTM_AGENT_LEVERAGE_FRAMEWORK_V1.md) and [`docs/AWAC_MENTAL_MODELS_BRIDGE_V1.md`](./AWAC_MENTAL_MODELS_BRIDGE_V1.md).

This document formalizes the governed creation cockpit as a calculus — a small set of rules that fully describe how the workspace derives guidance for humans and agents — and maps each mechanism to verifiable production patterns from frontier labs and the academic literature. It is grounded in live workspace QA observation (June 2026) of the v0.14.0 cockpit running in three distinct production workspaces: a Twenty CRM API registry, an email-GTM serverless infrastructure registry (QStash, Nango, Slack rows), and an Asana direct-API registry, plus the sandbox workflow runtime cockpit.

## What Live Observation Verifies

Five properties were directly observed in the running product:

1. **Record-level derivation.** Each API Registry row carries its own activation state (for example `90% ACTIVATED`, `3/7`), its own done/pending/blocked/next lattice, and its own contextual guidance. The cockpit is not a page-level wizard; it is a field evaluated at every record.
2. **The lattice is a partial order, not a sequence.** A row was observed with resolver Done and sandbox automation Done while auth was Pending and test/Data-Source/refresh were Blocked. Steps complete out of order when their own evidence exists; blocked status propagates only along true dependencies. This is the structural difference between a derived cockpit and a scripted wizard.
3. **Blocked-cascade from real runtime state.** A missing env secret rendered the test step Blocked, which rendered Data Source creation Blocked, which rendered refresh Blocked — with the cockpit naming the exact env keys that would unblock it and stating the authority contract inline: the workspace stores only the reference; the value never reaches the browser.
4. **Response profiling generates the next legal move.** For a paginated API, the cockpit reported the record path and entity, detected pagination, marked the row `Resolver required`, and explained why a resolver is needed to fetch and concatenate pages — derived guidance, not canned copy.
5. **Consent surfaces precede mutation.** Data Source creation shows a preview — the object it will create, the registry linkage, the sidecar it will write to, the detected fields it will carry, and the statement that nothing fetches until Refresh. The workflow runtime cockpit likewise exposes run locality (local vs serverless), execution adapter, and runtime before any run.

## The Calculus

```text
W  — world state: rows, source records, receipts, env-status, runs, resolver files
E  — evidence: the persisted, append-only subset of W (monotone)
L  — eligibility: L(x) = the legal moves for entity x, a pure function of E
G  — guidance: the cockpit, render(L(x)), shown identically to humans and agents
a  — action: permitted only if a ∈ L(x), executed through a governed surface
r  — receipt: proof(a), appended to E
```

The loop: `E -> L -> G -> a -> r -> E'`.

### The Seven Laws

1. **Purity.** L is a pure function of E. Re-rendering the cockpit recomputes the same state; nothing is remembered by the UI that is not in the artifact.
2. **Monotone evidence.** E is append-only. Completion can be revoked only by new evidence (a failed re-test), never by amnesia.
3. **No completion without evidence.** `done(x, step) ⇔ ∃ e ∈ E proving step`. Clicks are not evidence.
4. **Dependency locality.** `blocked(x, step)` propagates only along declared dependencies. Independent steps complete independently (observed: resolver and automation Done under auth Pending).
5. **Entity granularity.** L is evaluated per record ("subatomic"). Workspace-level readiness (Lens) is a fold over per-entity eligibility, never an independent assertion.
6. **Authority asymmetry.** Secrets cross boundaries only as references. Guidance may name what is missing; values never enter rows, browser state, or exports.
7. **Symmetric audience.** G is the same surface for humans and agents. An agent's next action is whatever the cockpit marks Next; an agent's report is whatever receipt it appended.

### Why the Calculus Is the Token-Economics Engine

For an agent, L(x) collapses an unbounded action space into a small enumerated set, with blocking reasons attached. Planning becomes selection. Verification becomes reading. Coordination becomes writing receipts into E that the next reader derives from. Token cost therefore scales with the size of state, not with the number of agents or the length of any conversation.

## Citation Map

Each observed mechanism corresponds to an established production pattern. Links and venues as of the January 2026 knowledge cutoff.

| Observed mechanism | Production pattern | Source |
|---|---|---|
| Artifact as canonical, cloud as additive | Local-first software | Kleppmann, Wiggins, van Hardenberg, McGranaghan, "Local-first software: You own your data, in spite of the cloud," ACM Onward! 2019 |
| Agent state externalized into inspectable structure | Cognitive architectures for language agents (memory/action space/decision loop made explicit) | Sumers, Yao, Narasimhan, Griffiths, "Cognitive Architectures for Language Agents" (CoALA), TMLR 2024 |
| Explicit flows over unbounded autonomy | Workflows-first agent design | Anthropic, "Building Effective Agents," Dec 2024 |
| Action grounded in observed state, not belief | Reasoning interleaved with environment observation | Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models," ICLR 2023 |
| Many agents, one shared structured state, no transcript passing | Blackboard architecture; stigmergic coordination | Erman, Hayes-Roth, Lesser, Reddy, "The Hearsay-II Speech-Understanding System," ACM Computing Surveys 1980; Grassé 1959; Heylighen, "Stigmergy as a universal coordination mechanism," Cognitive Systems Research 2016 |
| Multi-agent cost scales with coordination, so coordinate through artifacts | Multi-agent systems consume an order of magnitude more tokens than chat; context separation and externalized memory are the mitigations | Anthropic, "How we built our multi-agent research system," June 2025 |
| Resolver digests payloads before context; profiling at the membrane | Process data in the execution environment rather than pouring raw payloads through the model | Anthropic, "Code execution with MCP," Nov 2025; Anthropic, "Effective context engineering for AI agents," 2025 |
| Tools as governed, evaluable interfaces | Tool design and evaluation guidance | Anthropic, "Writing effective tools for agents," 2025; Model Context Protocol spec, Nov 2024 |
| Propose -> review -> apply -> receipt | Human-in-the-loop interrupts over checkpointed state | LangGraph persistence and human-in-the-loop documentation (LangChain) |
| Local run -> scheduler -> durable persistence upgrade lane | Durable execution | Temporal, "What is durable execution"; Vercel Workflows durable-execution model |
| Receipts, traces, run evidence as first-class | Agent tracing and observability | OpenAI Agents SDK tracing documentation; OpenTelemetry GenAI semantic conventions, 2024–2025 |
| Graduated authority earned from logged evidence | Agent reliability decays with task horizon; checkpointed evidence loops extend the effective horizon | Kwa et al. (METR), "Measuring AI Ability to Complete Long Tasks," 2025 |
| Action posts twice: act and proof | Double-entry bookkeeping | Pacioli, Summa de Arithmetica, 1494 |

## The Claim This Supports

The cockpit observed in production is a working implementation of the convergent answer the field keeps re-deriving: externalize truth into an auditable artifact, derive the legal moves from the evidence, show humans and agents the same guidance, and append proof after every action. The novelty is not any single mechanism — each has precedent above — it is compiling all of them into one local-first, per-record, owner-controlled artifact that ships as an exported workspace.
