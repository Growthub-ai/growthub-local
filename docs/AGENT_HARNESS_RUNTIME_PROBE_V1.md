# Agent Harness Runtime Probe V1

Empirical companion to [`AGENT_HARNESS_PATTERN_SYNTHESIS_V1.md`](./AGENT_HARNESS_PATTERN_SYNTHESIS_V1.md). Where that document mapped harness patterns (P1–P14) from stated contracts, this one verifies them by direct measurement of a live harness session — process topology, file layout, network behavior, hook execution, and event envelopes — and records what each measurement changes about the synthesis.

## 1. Intent and Method

A frontier agent harness was probed from the inside: the agent running in a Claude Code remote-execution session (CLI v2.1.42, cloud environment, Firecracker-backed container) inspected its own substrate using ordinary shell access. No prompt text is recited; every claim below describes architecture observed as filesystem state, process state, network responses, or message-stream mechanics.

Every claim carries an epistemic tag:

- **[observed]** — directly measured in the probed session (file contents, process listings, HTTP responses, envelope structures).
- **[specified]** — stated as a behavioral contract by the harness but not independently exercised in the session.
- **[inferred]** — concluded from an observation; the inference step is named.
- **[unknown]** — not observable from inside the session; explicitly out of evidence.

## 2. The Specimen

[observed] Process tree of the probed session, eldest first:

```text
PID 1  /process_api --firecracker-init --addr 0.0.0.0:2024
         --max-ws-buffer-size 32768 --block-local-connections
  └─ environment-manager task-run --stdin --session cse_… --session-mode resume-cached
       └─ claude --output-format=stream-json --input-format=stream-json
                 --replay-user-messages --verbose
                 --settings /root/.claude/launcher-settings.json
```

Three load-bearing facts fall out of one `ps` invocation:

1. **The harness is a microVM supervisor wrapping a headless CLI.** PID 1 is a Firecracker-init process exposing a control API; it blocks local connections at the supervisor level. The agent loop itself is the *same Claude Code CLI binary users run interactively*, driven in headless mode with NDJSON-over-stdio in both directions (`--output-format=stream-json --input-format=stream-json`).
2. **Sessions are resumable cached state**, not fresh processes per turn (`--session-mode resume-cached`); user messages are replayed into the resumed process (`--replay-user-messages`).
3. **Behavior is configured by a settings file**, not baked into the binary (`--settings launcher-settings.json` — §5).

[inferred — from (1)] This is convergent evolution with the AWaC design: `growthub pipeline execute` streaming `ExecutionEvent` NDJSON from a headless CLI is the same shape the frontier vendor chose for its own production agent product. The "one binary, interactive and headless, NDJSON as the headless contract" property is therefore validated as the load-bearing design, not an implementation convenience — and worth protecting as an explicit invariant in `docs/CMS_SDK_V1.md` consumers.

## 3. Credential and Network Plane

The session demonstrates a complete "the model never holds a secret" architecture, assembled from four observed mechanisms:

**3.1 Git credential injection by local proxy.** [observed] `git remote -v` shows origin as `http://local_proxy@127.0.0.1:39377/git/<owner>/<repo>`. All git transport flows through a loopback proxy that injects GitHub credentials server-side; no token exists in repo config, env values, or anywhere the agent can read. The agent authenticates to nothing; the proxy authorizes per-repo (matching the session's declared repository scope).

**3.2 Secrets passed by file descriptor, not environment.** [observed] The environment contains `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` and `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR` — variables whose *values* are fd numbers, not tokens. [inferred] Secrets are piped into the CLI process via inherited descriptors, so they never appear in `env` output, `/proc/*/environ` dumps, or child-process environments — the classic leak surfaces for env-borne secrets.

**3.3 TLS-terminating egress proxy with structured denials.** [observed] `NODE_EXTRA_CA_CERTS` is set (proxy CA injected into the trust chain) and `CLAUDE_CODE_PROXY_RESOLVES_HOSTS=true` (DNS resolution happens at the proxy, closing DNS-tunnel exfiltration). A probe request to an arbitrary domain returned `HTTP 403` with header `x-deny-reason: host_not_allowed` — policy denials are machine-readable, so the agent can distinguish "network policy" from "site down" and report accurately instead of retrying.

**3.4 Commit identity as a verified attestation chain.** [observed] A SessionStart hook re-asserts a pinned committer identity whose SSH signing key is registered with the code host; a generated `commit-msg` hook appends a `Co-authored-by` trailer carrying the session owner's account email; the hook comments reference a server-side strict-match rule that verifies committer identity against the session account. The chain is: harness signs → trailer binds the human account → server verifies both. The hook installs passthrough stubs for all other git hook names so repo-local hooks keep working under the overridden `core.hooksPath`.

**Mapping.** This is the harness-side proof of the AWaC authority-boundary rule ("browser never holds the Bridge token", `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`) implemented at OS depth, and 3.4 is the same trust move as ed25519 fork authority (`cli/src/kits/fork-authority.ts`): make identity cryptographic and verify it at the boundary, not in the agent. Sharpens **O7**: sandbox-environment rows already store secret references only; the probe shows the concrete resolution mechanisms worth standardizing in adapter contracts — loopback credential-injecting proxies for protocol traffic, fd-passing for process secrets, and structured deny reasons (`x-deny-reason` analog) in the sandbox network policy so agent retries don't mask policy.

## 4. Lifecycle Hooks as Deterministic Evaluators

[observed] `launcher-settings.json` declares two hooks; both scripts were read in full.

**4.1 SessionStart** (`session-start-git-identity.sh`): idempotently re-asserts git identity at every session start, including resumed/checkpointed containers carrying stale config. Two design rules are stated in the script itself:

- *Fail-open on startup*: the hook exits 0 even on failure, "so a broken git install can't wedge session startup" — startup hooks must never be able to brick a session.
- *Two-layer fail-safe*: anything the startup hook misses "the Stop hook will still catch" — correctness is enforced at the exit boundary, not the entry.

**4.2 Stop** (`stop-hook-git-check.sh`): runs when the model attempts to end its turn. Verified control flow:

```text
read JSON state from stdin
if stop_hook_active == true        → exit 0   (recursion guard)
if not a git repo                  → exit 0   (graceful out-of-scope bail)
if no git remote                   → exit 0   (bail when remediation is unsatisfiable)
if uncommitted or untracked changes → exit 2 + corrective message on stderr
if branch unpushed …               → exit 2 + corrective message
else                               → exit 0
```

Exit-code semantics [specified by the hooks API, observed in script]: exit 0 permits the stop; exit 2 *blocks the stop and re-injects the stderr text as an instruction*, sending the model back to work. The `stop_hook_active` guard bounds the loop to one re-injection cycle, preventing infinite block-stop recursion. Note the third bail: the hook refuses to emit an instruction the agent cannot satisfy (push with no remote) — evaluators must check that their own remediation is achievable before demanding it.

**Mapping.** This is a complete, field-tested reference design for **O4** (self-eval escalation) and **O9** (kit lifecycle hooks):

- The evaluator is *deterministic code outside the model* — exactly the relationship `selfEval.criteria[]` should have to the agent (harness judges, model remediates).
- Port the exit-code contract directly: kit hooks returning 0 = pass, 2 = block-and-reinject-message, with a `self_eval_active`-style recursion guard recorded in `trace.jsonl` instead of process state.
- Port both meta-rules: entry hooks fail-open + exit hooks enforce; and never emit an unsatisfiable remediation (the growthub analog: a selfEval criterion must not demand a hosted-authority action from a local-only fork).

**4.3 Policy layering.** [observed] Three settings documents coexist: `launcher-settings.json` (hooks + a permission allowlist), `policy-limits.json` (a restrictions object of named boolean policy flags plus a `compliance_taints: []` array), `remote-settings.json` (empty overlay reserved for the environment). [inferred] Policy is a merged stack of layered documents with distinct owners — launcher, platform policy, environment — the same shape as growthub's `policy.json` + kit contract + workspace config, with one notable extra: a *taint list*, i.e. policy state that accumulates from session history rather than being statically declared. Relevant to **O10**: a measure-tier file for sandbox rows could carry taints (e.g. "this row has touched external imports") that downgrade the tier dynamically.

## 5. Deferred Capability Plane (P1 — upgraded to [observed])

The probe session exercised the full deferred-tool state machine:

1. [observed] At session start, deferred tools exist as *names only* in harness-injected reminders; calling one fails schema validation by contract.
2. [observed] MCP servers connect asynchronously after session start (`MCP_CONNECTION_NONBLOCKING=true`); mid-session, a bulk announcement injected ~130 newly available tool names plus *server-shipped instruction blocks* — one connected analytics server delivered multi-rule orchestration guidance (call-ordering rules, session-anchoring rules) as part of its connection handshake, injected as a dedicated instructions section.
3. [observed] Schema resolution is a search call: exact selection (`select:Name`) or ranked keyword search over name+description. A miss returns a typed "no match" result; a fuzzy query returns the best-ranked schema even from an unrelated server. Tool timeout is uniform (`MCP_TOOL_TIMEOUT=60000` ms); transport is streamable HTTP (`USE_SHTTP_MCP=true`).
4. [observed] On resolution, the full JSONSchema is injected into the message stream as a synthetic turn, after which the tool is callable identically to statically-loaded tools — i.e., *capability loading is implemented as conversation-stream insertion*, requiring zero special model machinery.

**Mapping.** Sharpens **O3** and partially **P1**'s gap: mechanism (2) is the strongest precedent for `usageGuidance` — MCP already standardizes a server-level `instructions` channel delivered at connect time, and the harness materially relies on it for orchestration rules. The growthub move: `CapabilityManifestEnvelope` should carry the same two layers (per-node guidance + registry/server-level orchestration rules), and the discovery hub should treat manifest retrieval as the connect-time injection point. Mechanism (4) suggests on-demand `NodeInputSchema` resolution needs no exotic runtime — a `growthub capabilities search` returning schema text for the agent's context is the entire feature.

## 6. Delegation Subsystem (P4 — upgraded to [observed])

A read-only exploration subagent was dispatched during the probed session. Verified mechanics:

- [observed] **Transcript storage**: the subagent's full transcript is JSONL at `~/.claude/projects/<project-slug>/<session-uuid>/subagents/agent-<id>.jsonl`, symlinked into a session-scoped `/tmp/.../tasks/` directory. Records carry `parentUuid` (linked-list threading), `isSidechain: true` (subagent contexts are marked as sidechains of the parent), `promptId`, and `agentId`.
- [observed] **Compaction by delegation**: the subagent transcript measured 531,335 bytes (71 tool uses, ~72.7k tokens consumed); the parent received only the final result message (~4 KB) plus a usage stanza. The parent context is protected by construction — the harness explicitly warns that reading the raw transcript would overflow the caller.
- [observed] **Wake envelope**: completion arrives as an injected notification carrying `task-id`, `status`, the result, and a usage block (`subagent_tokens`, `tool_uses`, `duration_ms`). The parent is event-woken, never polling.
- [specified] **Typed roles with tool allowlists** (read-only explore type, plan type, general type), per-call model override with a precedence chain (call override → agent definition → inherit), opt-in git-worktree isolation with auto-cleanup, and continuation-by-ID with retained context.

**Mapping.** Sharpens **O5** and **O6** with ready-made shapes: swarm agent nodes should persist per-agent JSONL sidechain transcripts under `.growthub-fork/` with parent links (the existing `sandboxRecordRef` is the natural join key), return only a bounded result to the orchestrator, and emit a completion event carrying the usage stanza — `swarm_agent_complete` in the `ExecutionEvent` union has a field-tested payload to copy: `{taskId, status, result, usage:{tokens, toolUses, durationMs}}`. The measured 100:1 transcript-to-result ratio is the empirical argument for why orchestrators must consume results, not transcripts.

## 7. Context and Memory Plane (P8)

- [observed] `CLAUDE_AFTER_LAST_COMPACT=true` — the probed session itself had already crossed at least one compaction boundary; compaction state is surfaced to the process environment as a flag.
- [observed] The complete parent session transcript is durable JSONL on disk (642 KB at probe time) outside the model's context window: the *context* is a sliding window over a persistent log, not the system of record.
- [observed] `CLAUDE_EFFORT=high` — reasoning effort is an environment-level knob, set per session by the supervisor, orthogonal to model identity.
- [specified] The compaction contract: a summary plus unsummarized remainder is handed to the next window; mid-turn narration may never reach the user, so all conclusions must live in the final artifact of a turn.

**Mapping.** Confirms `project.md` + `trace.jsonl` occupy the correct position (durable log under a sliding window) and sharpens **P8's** gap into a one-line contract: AWaC should define the analog of the compaction flag — a `context_boundary` trace event plus a required `project.md` handoff entry — so *crossing a context boundary is an observable, governed event* rather than something that silently degrades agent memory. The effort knob suggests a cheap addition to sandbox rows alongside model id: an `effort` field in the execution adapter contract.

## 8. Event Ingress (P7)

- [observed] External events (PR webhook activity, user messages arriving mid-turn, subagent completions) are all delivered the same way: serialized into the conversation as injected turns wrapped in typed envelopes, with harness-appended directives. There is one inbound channel; everything is an envelope on it.
- [observed] `CLAUDE_CODE_REMOTE_SEND_KEEPALIVES`, `CLAUDE_ENABLE_STREAM_WATCHDOG=1`, and a session-ingress token file: the ingress path is authenticated and watchdog-supervised. [inferred] Webhook → session-ingress POST → message-stream injection is the delivery pipeline; the names are observed, the wiring is inference.
- [specified] Subscription gaps (events that webhooks never deliver, e.g. CI success) are covered by agent-armed scheduled self check-ins, with a re-arm-silently rule — and the probed session demonstrated the *degradation path*: the scheduling tool was absent, the agent detected absence via registry search rather than assuming, and fell back to direct re-checking.

**Mapping.** Sharpens **O6**: the subscription primitive over `ExecutionEvent` streams should normalize *all* wake sources (terminal events, schedule fire, human message) into one envelope type on one channel — the single-channel property is what keeps the agent loop simple — and must document its delivery gaps and the check-in fallback as part of the contract, not as operator lore.

## 9. Verdict Revisions to the P-Map

| Pattern | Prior verdict basis | Now | Material change |
| --- | --- | --- | --- |
| P1 deferred loading | specified | **observed** (§5) | Injection-as-conversation-turn means on-demand schema resolution is trivially portable |
| P4 typed delegation | specified | **observed** (§6) | Sidechain JSONL + usage stanza give O5/O6 concrete schemas |
| P6 layered authority | specified | **observed** (§3, §4.3) | Credential plane is OS-depth, not prompt-depth; adds taint-list concept to O10 |
| P7 event wake | specified | **observed** (§8) | Single-channel envelope normalization is the load-bearing property |
| P8 compaction | specified | **partially observed** (§7) | Compaction is env-visible state; durable-log-under-window confirmed |
| P9 bounded loops | specified | **observed** (§4.2) | Stop hook = full reference design: exit codes, recursion guard, satisfiability check |
| P13 hooks | specified | **observed** (§4) | Fail-open entry / enforcing exit two-layer rule; hooks live in layered settings docs |
| P12 model routing | specified | **partially observed** (§7) | Effort is a knob independent of model id — new field candidate for adapter contract |

New finding outside the original map (§2): the production harness is the interactive CLI run headless under a supervisor with NDJSON stdio — direct external validation of the `growthub pipeline execute` / `ExecutionEvent` architecture as the convergent industry shape.

## 10. Epistemic Limits

Not observable from inside a session, and therefore deliberately absent above: server-side model routing and inference topology; the compaction algorithm's internals (only its boundary flag and contract are visible); whether or how session transcripts feed any training pipeline (the per-agent usage accounting and durable JSONL are *consistent with* a distillation flywheel — O1 — but consistency is not evidence); the supervisor's scheduling policy across sessions. Claims about these would be assumption, so none are made.

## 11. Validation

Docs-only change: `git diff --check` clean; readback of changed sections performed. Companion ordering: read `AGENT_HARNESS_PATTERN_SYNTHESIS_V1.md` first for the P/O numbering this document revises.
