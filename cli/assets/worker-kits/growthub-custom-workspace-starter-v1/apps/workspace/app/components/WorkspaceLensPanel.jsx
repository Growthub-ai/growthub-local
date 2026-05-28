"use client";

/**
 * WorkspaceLensPanel — the post-activation operating surface.
 *
 * Workspace Lens is NOT onboarding. It is the ongoing, minimal, filterable,
 * agent-assignable stream of derived workspace state that the user unlocks
 * after completing setup. It renders the secondary lenses from
 * `deriveWorkspaceState` as aggregate-first cards (summaries + next action +
 * drill-down), never raw records, and keeps the human view aligned with the
 * machine `deriveSwarmConditionPacket` packet.
 *
 * Invariants (inherited from the lens layer):
 *   - Pure derivation in. No mutation, no secrets in the output.
 *   - Aggregate-first: one card per lens. Detail rows live in Data Model /
 *     run console / dashboards — this surface shows the causal summary.
 *   - Neutral, calm presentation: gray scale, collapsed by default, no
 *     semantic color overload, no icon spam.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { deriveWorkspaceState, deriveSwarmConditionPacket, deriveWorkspaceContributions, deriveLensWalkthroughState, LENS_WALKTHROUGH_DISMISS_FLAG, hasLocalAgentSandbox } from "@/lib/workspace-activation";
import { WorkspaceContributionGraph } from "./WorkspaceContributionGraph.jsx";
import { WorkspaceLensWalkthrough } from "./WorkspaceLensWalkthrough.jsx";

// Read the guided-tour step from the ?walkthrough= param (steps 2–3 land here
// after the rail reveal). Anything outside 2–3 means no in-panel tour.
function readWalkthroughStep() {
  if (typeof window === "undefined") return 0;
  const n = parseInt(new URLSearchParams(window.location.search).get("walkthrough") || "", 10);
  return n === 2 || n === 3 ? n : 0;
}

const SANDBOX_OBJECT_ID = "sandbox-environments";

// Subatomic-worker scaffold: build a governed local-agent-host sandbox row
// (Claude Code / Codex / local model) under the data model — the same
// sandbox-environment primitive the onboarding "create workflow" action uses.
// Pure config transform; the caller PATCHes dataModel through /api/workspace.
function buildLocalAgentSandbox(config) {
  const dataModel = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
  const COLUMNS = ["Name", "lifecycleStatus", "version", "runLocality", "runtime", "adapter", "agentHost", "localModel", "intelligenceAdapterMode", "instructions", "command", "timeoutMs", "status", "description"];
  const row = {
    Name: "workspace-lens-agent",
    lifecycleStatus: "draft",
    version: "1",
    runLocality: "local",
    runtime: "node",
    adapter: "local-agent-host",
    agentHost: "claude_local",
    localModel: "",
    intelligenceAdapterMode: "",
    instructions: "Workspace Lens agent. Operate this workspace through its governed surfaces (PATCH /api/workspace, POST /api/workspace/sandbox-run). Stay aware of Workspace Lens state — what is healthy, blocked, and agent-assignable — and help the operator close the loop in plain language.",
    command: "",
    timeoutMs: "120000",
    status: "draft",
    description: "Local agent host (Claude Code / Codex / local model) created from Workspace Lens.",
  };
  const existing = objects.find((o) => o?.id === SANDBOX_OBJECT_ID && o?.objectType === "sandbox-environment");
  const base = existing || {
    id: SANDBOX_OBJECT_ID, label: "Sandbox Environments", source: "Sandbox Environments",
    objectType: "sandbox-environment", icon: "Box", columns: COLUMNS, rows: [],
    binding: { mode: "manual", source: "Sandbox Environments" },
  };
  const next = {
    ...base,
    columns: Array.from(new Set([...(Array.isArray(base.columns) ? base.columns : []), ...COLUMNS])),
    rows: [...(Array.isArray(base.rows) ? base.rows : []), row],
  };
  const nextObjects = existing
    ? objects.map((o) => (o?.id === SANDBOX_OBJECT_ID ? next : o))
    : [...objects, next];
  return { ...config, dataModel: { ...dataModel, objects: nextObjects } };
}

// Same workspace-ui-cache flag transform the rail/onboarding dismiss use.
function withUiCacheFlag(config, key, value) {
  const dataModel = config?.dataModel && typeof config.dataModel === "object" ? config.dataModel : {};
  const objects = Array.isArray(dataModel.objects) ? dataModel.objects : [];
  const existing = objects.find((o) => o?.id === "workspace-ui-cache");
  const cacheObject = existing || {
    id: "workspace-ui-cache", label: "Workspace UI Cache", source: "Workspace UI Cache",
    objectType: "custom", icon: "Settings", columns: ["id", key], rows: [],
    binding: { mode: "manual", source: "Workspace UI Cache" },
  };
  const columns = Array.from(new Set([...(Array.isArray(cacheObject.columns) ? cacheObject.columns : ["id"]), key]));
  const rows = Array.isArray(cacheObject.rows) ? cacheObject.rows : [];
  const hasRow = rows.some((r) => r?.id === "activation");
  const nextRows = hasRow
    ? rows.map((r) => (r?.id === "activation" ? { ...r, [key]: value } : r))
    : [...rows, { id: "activation", [key]: value }];
  const nextCache = { ...cacheObject, columns, rows: nextRows };
  const nextObjects = existing
    ? objects.map((o) => (o?.id === "workspace-ui-cache" ? nextCache : o))
    : [...objects, nextCache];
  return { ...config, dataModel: { ...dataModel, objects: nextObjects } };
}

// Map a ?filter= query value (and the contribution graph's "runs") onto a
// canonical filter id so tooltip deep-links open the right filtered view.
function readInitialFilter() {
  if (typeof window === "undefined") return "all";
  const raw = (new URLSearchParams(window.location.search).get("filter") || "").trim().toLowerCase();
  if (!raw) return "all";
  if (raw === "runs") return "observability";
  return raw;
}

// Lens state → a single neutral status word the whole surface filters on.
function lensStatusKind(lens) {
  if (lens.complete) return "ready";
  if ((lens.steps || []).some((s) => s.status === "blocked")) return "blocked";
  return "pending";
}

const STATUS_LABEL = { ready: "Ready", blocked: "Blocked", pending: "In progress" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "blocked", label: "Blocked" },
  { id: "ready", label: "Ready" },
  { id: "assignable", label: "Agent-assignable" },
  { id: "persistence", label: "Persistence" },
  { id: "observability", label: "Runs" },
  { id: "deploy", label: "Deploy" },
  { id: "tasks", label: "Tasks" },
  { id: "app-build", label: "App build" },
];

export function WorkspaceLensPanel({ workspaceConfig, workspaceSourceRecords, metadataGraph }) {
  const [filter, setFilter] = useState(readInitialFilter);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [walkStep, setWalkStep] = useState(0);

  // URL params (?filter=, ?walkthrough=) are read on the client after mount —
  // useState initializers run during SSR where window is undefined, so the
  // deep-links from the contribution graph and the rail reveal land here.
  useEffect(() => {
    const f = readInitialFilter();
    if (f !== "all") setFilter(f);
    const w = readWalkthroughStep();
    if (w) setWalkStep(w);
  }, []);

  const walkthrough = useMemo(
    () => deriveLensWalkthroughState({ workspaceConfig, workspaceSourceRecords, metadataGraph }),
    [workspaceConfig, workspaceSourceRecords, metadataGraph],
  );
  // Steps 2–3 show only when arrived via the guided reveal and still eligible
  // (lens unlocked, no activity yet, not previously dismissed).
  const showWalk = walkStep >= 2 && walkthrough.show;

  const dismissWalkthrough = useMemo(() => async () => {
    setWalkStep(0);
    try {
      const next = withUiCacheFlag(workspaceConfig || {}, LENS_WALKTHROUGH_DISMISS_FLAG, true);
      await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: next.dataModel }),
      });
    } catch {
      /* best-effort; local state already hides the tour */
    }
  }, [workspaceConfig]);

  const onWalkPrimary = useMemo(() => (step) => {
    if (step === 2) setWalkStep(3);
    else dismissWalkthrough();
  }, [dismissWalkthrough]);

  // Subatomic-worker handoff: until a local agent exists, nudge the operator to
  // scaffold one and bring the helper live. One safe governed write + handoff.
  const needsAgent = !hasLocalAgentSandbox(workspaceConfig);
  const [scaffolding, setScaffolding] = useState(false);
  const scaffoldAgent = useMemo(() => async () => {
    if (scaffolding) return;
    setScaffolding(true);
    try {
      const next = buildLocalAgentSandbox(workspaceConfig || {});
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: next.dataModel }),
      });
      if (!res.ok) throw new Error("scaffold failed");
      // Close the loop: land on the surface where the new agent object + the
      // helper widget are live and aware of the workspace.
      window.location.href = `/data-model?object=${encodeURIComponent(SANDBOX_OBJECT_ID)}&helper=1`;
    } catch {
      setScaffolding(false);
    }
  }, [workspaceConfig, scaffolding]);

  const contributions = useMemo(
    () => deriveWorkspaceContributions({ workspaceConfig, workspaceSourceRecords, metadataGraph }),
    [workspaceConfig, workspaceSourceRecords, metadataGraph],
  );

  const composed = useMemo(
    () => deriveWorkspaceState({ workspaceConfig, workspaceSourceRecords, metadataGraph }),
    [workspaceConfig, workspaceSourceRecords, metadataGraph],
  );
  const lenses = useMemo(() => Object.values(composed.lenses || {}), [composed]);

  const counts = useMemo(() => {
    let ready = 0; let blocked = 0; let assignable = 0;
    for (const lens of lenses) {
      const kind = lensStatusKind(lens);
      if (kind === "ready") ready += 1;
      if (kind === "blocked") blocked += 1;
      if (!lens.complete && lens.nextStepId) assignable += 1;
    }
    return { total: lenses.length, ready, blocked, assignable };
  }, [lenses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lenses.filter((lens) => {
      const kind = lensStatusKind(lens);
      if (filter === "blocked" && kind !== "blocked") return false;
      if (filter === "ready" && kind !== "ready") return false;
      if (filter === "assignable" && (lens.complete || !lens.nextStepId)) return false;
      if (["persistence", "observability", "deploy", "tasks", "app-build"].includes(filter) && lens.lensId !== filter) return false;
      if (q) {
        const hay = `${lens.title} ${lens.headline} ${(lens.steps || []).map((s) => s.label).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lenses, filter, query]);

  return (
    <div className="workspace-lens">
      <header className="workspace-lens-head">
        <div>
          <h1 className="workspace-lens-title">Workspace Lens</h1>
          <p className="workspace-lens-subtitle">Live derived state for this workspace.</p>
        </div>
        <p className="workspace-lens-score" aria-label="Workspace lens summary">
          {counts.total} lenses · {counts.ready} ready · {counts.blocked} blocked · {counts.assignable} agent-assignable
        </p>
      </header>

      {showWalk ? (
        <WorkspaceLensWalkthrough
          step={walkStep}
          className="is-panel"
          onPrimary={onWalkPrimary}
          onDismiss={dismissWalkthrough}
        />
      ) : null}

      {needsAgent ? (
        <div className="workspace-lens-agent-callout" role="note">
          <div className="workspace-lens-agent-callout-text">
            <p className="workspace-lens-agent-callout-title">Bring your workspace agent live</p>
            <p className="workspace-lens-agent-callout-body">
              Create a governed local agent (Claude Code, Codex, or a local model) that operates this
              workspace through its own surfaces — then open the helper, now aware of your Lens, to work in
              plain language.
            </p>
          </div>
          <button
            type="button"
            className="workspace-lens-agent-callout-btn"
            onClick={scaffoldAgent}
            disabled={scaffolding}
          >
            {scaffolding ? "Creating…" : "Create agent & open helper"}
          </button>
        </div>
      ) : null}

      <WorkspaceContributionGraph
        data={contributions}
        onSelectDay={() => setFilter("observability")}
        buildDayHref={(date) => `/workspace-lens?filter=runs&day=${date}`}
      />

      <div className="workspace-lens-controls">
        <div className="workspace-lens-filters" role="tablist" aria-label="Filter lenses">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={"workspace-lens-filter" + (filter === f.id ? " is-active" : "")}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="workspace-lens-search"
          placeholder="Search lenses, workflows, objects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search lenses"
        />
      </div>

      <ul className="workspace-lens-stream" role="list">
        {visible.map((lens) => {
          const kind = lensStatusKind(lens);
          const next = (lens.steps || []).find((s) => s.id === lens.nextStepId) || null;
          const blockedStep = (lens.steps || []).find((s) => s.status === "blocked") || null;
          const isOpen = expanded === lens.lensId;
          const packet = isOpen
            ? deriveSwarmConditionPacket({ workspaceConfig, workspaceSourceRecords, metadataGraph }, { lensId: lens.lensId })
            : null;
          return (
            <li key={lens.lensId} className={"workspace-lens-card is-" + kind} data-lens={lens.lensId}>
              <button
                type="button"
                className="workspace-lens-card-head"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : lens.lensId)}
              >
                <span className="workspace-lens-card-title">{lens.title}</span>
                <span className={"workspace-lens-chip is-" + kind}>{STATUS_LABEL[kind]}</span>
                <span className="workspace-lens-card-progress">{lens.completedCount}/{lens.totalCount}</span>
                <ChevronDown
                  size={14}
                  className={"workspace-lens-caret" + (isOpen ? " is-open" : "")}
                  aria-hidden="true"
                />
              </button>
              <p className="workspace-lens-card-headline">{lens.headline}</p>
              {!lens.complete && next ? (
                <div className="workspace-lens-card-next">
                  <span className="workspace-lens-next-label">Next:</span>
                  {next.href ? (
                    <Link href={next.href} className="workspace-lens-next-link">{next.cta || next.label}</Link>
                  ) : (
                    <span>{next.label}</span>
                  )}
                </div>
              ) : null}

              {isOpen ? (
                <div className="workspace-lens-card-detail">
                  <ol className="workspace-lens-steps" role="list">
                    {(lens.steps || []).map((s) => (
                      <li key={s.id} className={"workspace-lens-step is-" + s.status}>
                        <span className="workspace-lens-step-label">{s.label}</span>
                        <span className="workspace-lens-step-status">{s.status}</span>
                        {s.hint ? <span className="workspace-lens-step-hint">{s.hint}</span> : null}
                      </li>
                    ))}
                  </ol>
                  {blockedStep ? (
                    <p className="workspace-lens-blocked">Blocked: {blockedStep.label}</p>
                  ) : null}
                  {packet ? (
                    <div className="workspace-lens-agent">
                      <p className="workspace-lens-agent-title">
                        {lens.complete ? "Agent condition (resolved)" : "Assignable to an agent"}
                      </p>
                      <p className="workspace-lens-agent-row"><span>Goal</span>{packet.goal}</p>
                      <p className="workspace-lens-agent-row"><span>State</span>{packet.currentState}</p>
                      {packet.prerequisite ? (
                        <p className="workspace-lens-agent-row"><span>Prerequisite</span>{packet.prerequisite}</p>
                      ) : null}
                      <p className="workspace-lens-agent-row"><span>Tools</span>{packet.availableTools.join(" · ")}</p>
                      <p className="workspace-lens-agent-row"><span>Evidence</span>{packet.expectedEvidence.join(" · ")}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="workspace-lens-empty">No lenses match this filter.</li>
        ) : null}
      </ul>
    </div>
  );
}
