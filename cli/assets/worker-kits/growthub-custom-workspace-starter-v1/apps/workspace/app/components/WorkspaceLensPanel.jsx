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
import { Activity, BarChart3, Check, Copy, Eye, GitBranch, MoreVertical, Search } from "lucide-react";
import { deriveWorkspaceState, deriveSwarmConditionPacket, deriveWorkspaceContributions, deriveLensWalkthroughState, LENS_WALKTHROUGH_DISMISS_FLAG } from "@/lib/workspace-activation";
import { WorkspaceContributionGraph } from "./WorkspaceContributionGraph.jsx";
import { WorkspaceLensWalkthrough } from "./WorkspaceLensWalkthrough.jsx";
import { HelperSidecar } from "../data-model/components/HelperSidecar.jsx";
import {
  getHelperSandboxRow,
  isHelperHandoffDismissed,
  isHelperConfigured,
  WorkspaceHelperSetupModal,
} from "./WorkspaceHelperSetupModal.jsx";

// Read the guided-tour step from the ?walkthrough= param (steps 2–3 land here
// after the rail reveal). Anything outside 2–3 means no in-panel tour.
function readWalkthroughStep() {
  if (typeof window === "undefined") return 0;
  const n = parseInt(new URLSearchParams(window.location.search).get("walkthrough") || "", 10);
  return n === 2 || n === 3 ? n : 0;
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
  { id: "fleet", label: "Fleet" },
];

export function WorkspaceLensPanel({ workspaceConfig, workspaceSourceRecords, metadataGraph }) {
  const [localConfig, setLocalConfig] = useState(workspaceConfig);
  const [filter, setFilter] = useState(readInitialFilter);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [walkStep, setWalkStep] = useState(0);
  const [openActionMenu, setOpenActionMenu] = useState(null);
  const effectiveConfig = localConfig || workspaceConfig;
  const helperRow = getHelperSandboxRow(effectiveConfig);
  const helperConfigured = isHelperConfigured(effectiveConfig);
  const helperHandoffDismissed = helperConfigured || isHelperHandoffDismissed(effectiveConfig);
  const [setupOpen, setSetupOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperView, setHelperView] = useState("chat");

  useEffect(() => {
    setLocalConfig(workspaceConfig);
  }, [workspaceConfig]);

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

  const openHelperHandoff = useMemo(() => () => {
    setHelperView("chat");
    if (helperConfigured) {
      setHelperOpen(true);
      return;
    }
    setSetupOpen(true);
  }, [helperConfigured]);

  // Open the SAME helper sidecar directly in the read-only simulation cockpit
  // (shared with the /simulate command). Setup gate is identical to the helper
  // handoff — a simulation reads the receipt stream the configured agent emits.
  const openSimulation = useMemo(() => () => {
    if (!helperConfigured) {
      setSetupOpen(true);
      return;
    }
    setHelperView("simulation");
    setHelperOpen(true);
  }, [helperConfigured]);

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
      if (!FILTERS.some((f) => f.id === filter) && lens.lensId !== filter) return false;
      if (q) {
        const hay = `${lens.title} ${lens.headline} ${(lens.steps || []).map((s) => s.label).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lenses, filter, query]);

  const productionItems = useMemo(() => {
    return lenses.flatMap((lens) => (lens.steps || []).map((step) => ({
      id: `${lens.lensId}:${step.id}`,
      label: step.cta || step.label,
      complete: step.status === "complete",
      href: step.href || `/workspace-lens?filter=${lens.lensId}`,
    }))).slice(0, 5);
  }, [lenses]);

  const productionCounts = useMemo(() => {
    const steps = lenses.flatMap((lens) => lens.steps || []);
    return {
      total: steps.length,
      complete: steps.filter((step) => step.status === "complete").length,
    };
  }, [lenses]);

  const observabilityStats = useMemo(() => {
    const objects = Array.isArray(effectiveConfig?.dataModel?.objects) ? effectiveConfig.dataModel.objects : [];
    const sourceCount = workspaceSourceRecords && typeof workspaceSourceRecords === "object"
      ? Object.keys(workspaceSourceRecords).length
      : 0;
    const sandboxCount = objects.filter((object) => object?.objectType === "sandbox-environment").length;
    return [
      { label: "Ready lenses", value: counts.ready },
      { label: "Open actions", value: counts.assignable },
      { label: "Sandbox environments", value: sandboxCount },
      { label: "Source records", value: sourceCount },
    ];
  }, [counts.assignable, counts.ready, effectiveConfig, workspaceSourceRecords]);

  const helperStatusLabel = helperConfigured
    ? `Agent connected: ${helperRow?.agentHost || "local agent"}`
    : "Helper setup needed";

  const copyLensUrl = (lensId) => {
    if (typeof window === "undefined" || !navigator?.clipboard) return;
    navigator.clipboard.writeText(`${window.location.origin}/workspace-lens?filter=${lensId}`);
  };

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

      {!helperHandoffDismissed ? (
        <div className="workspace-lens-helper-callout" role="note">
          <div className="workspace-lens-helper-callout-text">
            <p className="workspace-lens-helper-callout-title">Connect the helper</p>
            <p className="workspace-lens-helper-callout-body">
              Pick the agent that powers the helper widget. Codex is recommended.
            </p>
          </div>
          <button
            type="button"
            className="workspace-lens-helper-callout-btn"
            onClick={openHelperHandoff}
          >
            {helperConfigured ? "Open helper" : "Set up helper"}
          </button>
        </div>
      ) : null}

      <WorkspaceHelperSetupModal
        workspaceConfig={effectiveConfig}
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onSaved={(nextConfig) => {
          setLocalConfig(nextConfig);
          setSetupOpen(false);
          setHelperOpen(true);
        }}
      />

      <WorkspaceContributionGraph
        data={contributions}
        onSelectDay={() => setFilter("observability")}
        buildDayHref={(date) => `/workspace-lens?filter=runs&day=${date}`}
      />

      <div className="workspace-lens-controls workspace-builder-filterbar">
        <div className="workspace-lens-filters workspace-builder-filterbar__segments" role="tablist" aria-label="Filter lenses">
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
        <label className="workspace-builder-filterbar__search workspace-lens-search-wrap">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            className="workspace-lens-search"
            placeholder="Search lenses, workflows, objects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search lenses"
          />
        </label>
      </div>

      <section className="workspace-lens-control-grid" aria-label="Workspace control panel">
        <article className="workspace-lens-control-card">
          <div className="workspace-lens-control-card-head">
            <div>
              <h2>Production Checklist</h2>
              <span>{productionCounts.complete}/{productionCounts.total}</span>
            </div>
            <button type="button" className="workspace-lens-icon-btn" aria-label="Checklist options">
              <MoreVertical size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="workspace-lens-checklist" role="list">
            {productionItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={"workspace-lens-check-item" + (item.complete ? " is-complete" : "")}
              >
                <span>{item.label}</span>
                {item.complete ? <Check size={14} aria-hidden="true" /> : null}
              </Link>
            ))}
          </div>
        </article>

        <article className="workspace-lens-control-card">
          <div className="workspace-lens-control-card-head">
            <div>
              <h2>Observability</h2>
              <span>Live</span>
            </div>
            <button type="button" className="workspace-lens-icon-btn" aria-label="Observability options">
              <MoreVertical size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="workspace-lens-stat-list">
            {observabilityStats.map((stat) => (
              <div key={stat.label} className="workspace-lens-stat-row">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="workspace-lens-control-card workspace-lens-helper-card">
          <div className="workspace-lens-control-card-head">
            <div>
              <h2>Helper Analytics</h2>
              <span>{helperConfigured ? "Active" : "Setup"}</span>
            </div>
            <button type="button" className="workspace-lens-icon-btn" aria-label="Helper options">
              <MoreVertical size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="workspace-lens-helper-card-body">
            <BarChart3 size={28} aria-hidden="true" />
            <strong>{helperStatusLabel}</strong>
            <p>Workspace Lens actions run through the same helper widget sandbox.</p>
            <div className="workspace-lens-helper-card-actions">
              <button type="button" onClick={openHelperHandoff}>
                {helperConfigured ? "Open helper" : "Set up helper"}
              </button>
              <button type="button" onClick={openSimulation} data-lens-action="simulate">
                Run simulation
              </button>
            </div>
          </div>
        </article>
      </section>

      <section className="workspace-lens-branches" aria-label="Active branches">
        <div className="workspace-lens-branches-head">
          <h2>Active Branches</h2>
          <span>{visible.length}/{lenses.length}</span>
        </div>
        <div className="workspace-lens-branches-table" role="table">
          {visible.map((lens) => {
          const kind = lensStatusKind(lens);
          const next = (lens.steps || []).find((s) => s.id === lens.nextStepId) || null;
          const blockedStep = (lens.steps || []).find((s) => s.status === "blocked") || null;
          const isOpen = openActionMenu === lens.lensId;
          const packet = expanded === lens.lensId
            ? deriveSwarmConditionPacket({ workspaceConfig, workspaceSourceRecords, metadataGraph }, { lensId: lens.lensId })
            : null;
          return (
            <div key={lens.lensId} className="workspace-lens-branch-row" role="row" data-lens={lens.lensId}>
              <div className="workspace-lens-branch-name" role="cell">
                <GitBranch size={14} aria-hidden="true" />
                <span>{lens.title}</span>
              </div>
              <div className="workspace-lens-branch-actions" role="cell">
                {next?.href ? (
                  <Link href={next.href} className="workspace-lens-preview-pill">
                    <Eye size={12} aria-hidden="true" />
                    Preview
                  </Link>
                ) : (
                  <span className="workspace-lens-preview-pill">
                    <Activity size={12} aria-hidden="true" />
                    Healthy
                  </span>
                )}
                <span className={"workspace-lens-chip is-" + kind}>{STATUS_LABEL[kind]}</span>
                <span className="workspace-lens-progress-pill">{lens.completedCount}/{lens.totalCount}</span>
                <span className="workspace-lens-owner-pill">workspace-lens</span>
                <button
                  type="button"
                  className="workspace-lens-icon-btn"
                  aria-label={`${lens.title} actions`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenActionMenu(isOpen ? null : lens.lensId)}
                >
                  <MoreVertical size={15} aria-hidden="true" />
                </button>
                {isOpen ? (
                  <div className="workspace-lens-action-menu">
                    <button type="button" onClick={() => { setExpanded(lens.lensId); setOpenActionMenu(null); }}>
                      View condition packet
                    </button>
                    {next?.href ? <Link href={next.href}>Open next action</Link> : null}
                    <button type="button" onClick={() => { setFilter(lens.lensId); setOpenActionMenu(null); }}>
                      Filter to this lens
                    </button>
                    <button type="button" onClick={() => copyLensUrl(lens.lensId)}>
                      Copy Lens URL <Copy size={13} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="workspace-lens-branch-summary">{lens.headline}</p>
              {!lens.complete && next ? (
                <p className="workspace-lens-branch-next">Next: {next.cta || next.label}</p>
              ) : null}
              {blockedStep ? (
                <p className="workspace-lens-branch-next">Blocked: {blockedStep.label}</p>
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
          );
        })}
        {visible.length === 0 ? (
          <div className="workspace-lens-empty">No lenses match this filter.</div>
        ) : null}
        </div>
      </section>

      <HelperSidecar
        open={helperOpen}
        onClose={() => setHelperOpen(false)}
        workspaceConfig={effectiveConfig}
        initialIntent="explain"
        initialPrompt=""
        initialView={helperView}
        onApplied={(nextConfig) => setLocalConfig(nextConfig)}
      />
    </div>
  );
}
