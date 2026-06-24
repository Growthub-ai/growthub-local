"use client";

/**
 * Workspace Map — read-only schema/relationship canvas.
 *
 * Renders the workspace data model as a node canvas using the SAME visual
 * grammar as the workflow OrchestrationGraphCanvas (dotted grid, card nodes,
 * connector edges, zoom controls), but the CONTENT is the metadata graph, not
 * an executable workflow.
 *
 * Hard rules (mirrors the kit's governance invariants):
 *   - Graph data comes ONLY from buildWorkspaceMetadataStore →
 *     buildWorkspaceMetadataGraph. No ad-hoc config parsing here.
 *   - No mutations, no PATCH, no localStorage. This surface only reads
 *     /api/workspace and navigates to existing surfaces on click.
 *   - Secrets never reach the graph (the store strips them); we render only
 *     labels, counts, and types.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize2, Search, X, ZoomIn, ZoomOut } from "lucide-react";

import { buildWorkspaceMetadataStore } from "@/lib/workspace-metadata-store";
import { buildWorkspaceMetadataGraph } from "@/lib/workspace-metadata-graph";
import { LucideIcon, OBJECT_TYPE_PRESETS, objectTypeBadge, pluralize } from "./dm-shared.jsx";

// Which node types appear on the map, in lane (left→right) order, with the
// icon + legend swatch for each. Workflow execution detail (nodes, inputs,
// runs) stays in the Workflow Canvas — the map is the structural overview.
const LANES = [
  { key: "integration", types: ["integration"], label: "Integrations", icon: "Globe", color: "#0ea5e9" },
  { key: "source", types: ["sourceRecord"], label: "Sources", icon: "Database", color: "#14b8a6" },
  { key: "object", types: ["dataModelObject"], label: "Objects", icon: "Box", color: "#4f6bed" },
  { key: "flow", types: ["workflow", "sandbox"], label: "Workflows", icon: "Zap", color: "#8b5cf6" },
  { key: "dashboard", types: ["dashboard"], label: "Dashboards", icon: "LayoutDashboard", color: "#f97316" },
];

const RENDERED_TYPES = new Set(LANES.flatMap((lane) => lane.types));
const NODE_WIDTH = 220;
const COL_GAP = 60;
const ROW_GAP = 24;
const PAD = 28;

function nodeHeight(node) {
  // Object cards carry a field strip + stat → taller. Everything else is compact.
  return node.type === "dataModelObject" ? 122 : 80;
}

function nodeIconName(node) {
  if (node.type === "dataModelObject") {
    return node.summary?.objectType
      ? OBJECT_TYPE_PRESETS[node.summary.objectType]?.icon || "Box"
      : "Box";
  }
  const lane = LANES.find((entry) => entry.types.includes(node.type));
  return lane?.icon || "Box";
}

export function WorkspaceDataModelCanvas() {
  const router = useRouter();
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [sourceRecords, setSourceRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
      setWorkspaceConfig(payload.workspaceConfig || null);
      setSourceRecords(
        payload.workspaceSourceRecords && typeof payload.workspaceSourceRecords === "object"
          ? payload.workspaceSourceRecords
          : {}
      );
    } catch (err) {
      setError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived graph — never throws on malformed config (the store/graph guard).
  const graph = useMemo(() => {
    if (!workspaceConfig) return { nodes: [], edges: [] };
    try {
      const store = buildWorkspaceMetadataStore({
        workspaceConfig,
        workspaceSourceRecords: sourceRecords,
      });
      return buildWorkspaceMetadataGraph(store);
    } catch {
      return { nodes: [], edges: [] };
    }
  }, [workspaceConfig, sourceRecords]);

  // Group field labels by the object id they belong to, for the object cards.
  const fieldsByObjectId = useMemo(() => {
    const map = new Map();
    for (const node of graph.nodes) {
      if (node.type !== "field") continue;
      const objectId = node.summary?.objectId;
      if (!objectId) continue;
      if (!map.has(objectId)) map.set(objectId, []);
      map.get(objectId).push(node.label);
    }
    return map;
  }, [graph.nodes]);

  // Deterministic lane layout — no randomness, stable across renders.
  const { placed, positions, width, height } = useMemo(() => {
    const positionMap = new Map();
    const placedNodes = [];
    let maxBottom = 0;
    LANES.forEach((lane, laneIndex) => {
      const laneNodes = graph.nodes.filter((node) => lane.types.includes(node.type));
      const x = PAD + laneIndex * (NODE_WIDTH + COL_GAP);
      let y = PAD;
      for (const node of laneNodes) {
        const h = nodeHeight(node);
        positionMap.set(node.id, { x, y, w: NODE_WIDTH, h });
        placedNodes.push(node);
        y += h + ROW_GAP;
      }
      maxBottom = Math.max(maxBottom, y);
    });
    return {
      placed: placedNodes,
      positions: positionMap,
      width: PAD + LANES.length * (NODE_WIDTH + COL_GAP),
      height: Math.max(maxBottom, 460),
    };
  }, [graph.nodes]);

  // Only edges whose BOTH endpoints are rendered on the map. Deduped by id.
  const edges = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const edge of graph.edges) {
      if (!positions.has(edge.from) || !positions.has(edge.to)) continue;
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      out.push(edge);
    }
    return out;
  }, [graph.edges, positions]);

  const needle = query.trim().toLowerCase();
  const matches = useCallback(
    (node) => {
      if (!needle) return true;
      const s = node.summary || {};
      // Match the fields a customer actually searches by — object type, source
      // id, integration/status, workflow lifecycle, adapter/auth, fetched date —
      // not just label/type.
      const haystack = [
        node.label, node.type,
        s.objectType, s.objectId, s.status, s.lane, s.lifecycleStatus,
        s.adapter, s.authStatus, s.authProvider, s.integrationId,
        s.runLocality, s.fetchedAt, s.sourceAuthority,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    },
    [needle]
  );

  // Human-readable label for the open action, by node type.
  function openLabel(node) {
    if (node.type === "workflow" || node.type === "sandbox") return "Open in Workflow Canvas";
    return "Open in Data Model";
  }

  // Read-only metadata rows for the detail panel — derived from the graph
  // summary only (no secrets, no config parsing).
  function detailRows(node) {
    const s = node.summary || {};
    const rows = [];
    const push = (k, v) => { if (v !== undefined && v !== null && v !== "") rows.push({ k, v: String(v) }); };
    if (node.type === "dataModelObject") {
      push("Type", s.objectType);
      push("Records", Number.isFinite(s.rowCount) ? s.rowCount : undefined);
      push("Backing", s.isLiveBacked ? "live" : s.readOnly ? "read-only" : "manual");
      push("Source authority", s.sourceAuthority);
    } else if (node.type === "sourceRecord") {
      push("Records", Number.isFinite(s.recordCount) ? s.recordCount : 0);
      push("Integration", s.integrationId);
      push("Fetched", s.fetchedAt ? String(s.fetchedAt).slice(0, 10) : undefined);
    } else if (node.type === "workflow") {
      push("Steps", Number.isFinite(s.nodeCount) ? s.nodeCount : 0);
      push("Lifecycle", s.lifecycleStatus);
      push("Requires input", s.requiresInput ? "yes" : undefined);
    } else if (node.type === "sandbox") {
      push("Adapter", s.adapter);
      push("Auth", s.authStatus);
      push("Locality", s.runLocality);
      push("Lifecycle", s.lifecycleStatus);
    } else if (node.type === "integration") {
      push("Status", s.status);
      push("Lane", s.lane);
    } else if (node.type === "dashboard") {
      push("Widgets", Number.isFinite(s.widgetCount) ? s.widgetCount : 0);
    }
    return rows;
  }

  const selectedNode = useMemo(
    () => placed.find((node) => node.id === selectedId) || null,
    [placed, selectedId]
  );

  function handleOpen(node) {
    const summary = node.summary || {};
    if (node.type === "dataModelObject") {
      router.push(`/data-model?object=${encodeURIComponent(summary.objectId || "")}`);
    } else if (node.type === "workflow" || node.type === "sandbox") {
      const params = new URLSearchParams();
      if (summary.objectId) params.set("object", summary.objectId);
      if (summary.rowId) params.set("row", summary.rowId);
      // Explicit field for consistency with the CEO/Agent Team handoff pattern;
      // WorkflowSurface still falls back to orchestrationGraph if absent.
      params.set("field", "orchestrationConfig");
      router.push(`/workflows${params.toString() ? `?${params.toString()}` : ""}`);
    } else {
      router.push("/data-model");
    }
  }

  function zoom(delta) {
    setScale((current) => Math.min(1.4, Math.max(0.6, Math.round((current + delta) * 10) / 10)));
  }

  const handleCanvasPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target?.closest?.("button, a, input, label, .wm-detail, .wm-zoom")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handleCanvasPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    canvas.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
    canvas.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
  }, []);

  const endCanvasPan = useCallback((event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  const hasNodes = placed.length > 0;

  return (
    <div className="wm-shell">
      <div className="wm-toolbar">
        <Link className="wm-back-link" href="/workspace-lens" aria-label="Back to Workspace Lens">
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <div>
          <h1>Workspace Map</h1>
          <span className="wm-sub">
            {hasNodes ? `${pluralize(placed.length, "node")} · ${pluralize(edges.length, "link")}` : "Read-only view of your workspace data model"}
          </span>
        </div>
        <label className="dm-toolbar-search" style={{ marginLeft: 16 }}>
          <Search size={13} aria-hidden="true" />
          <input
            value={query}
            placeholder="Search objects, sources, workflows"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search the workspace map"
          />
        </label>
        <div className="wm-legend">
          {LANES.map((lane) => (
            <span key={lane.key} className="wm-legend-item">
              <span className="wm-legend-swatch" style={{ background: lane.color }} />
              {lane.label}
            </span>
          ))}
        </div>
      </div>

      <div
        ref={canvasRef}
        className={`wm-canvas${isPanning ? " is-panning" : ""}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={endCanvasPan}
        onPointerCancel={endCanvasPan}
        onPointerLeave={endCanvasPan}
      >
        {loading && <div className="wm-empty"><span>Loading workspace map…</span></div>}
        {!loading && error && <div className="wm-empty"><strong>Could not load the map</strong><span>{error}</span></div>}
        {!loading && !error && !hasNodes && (
          <div className="wm-empty">
            <strong>Nothing to map yet</strong>
            <span>Add objects, link a data source, or publish a workflow and they will appear here.</span>
          </div>
        )}
        {!loading && !error && hasNodes && (
          <>
            {/* Sizer reserves the SCALED footprint so .wm-canvas (overflow:auto)
                scrolls fully when zoomed in on dense workspaces. The inner
                layer holds the unscaled coordinate system and is transformed. */}
            <div className="wm-canvas-inner" style={{ width: width * scale, height: height * scale }}>
              <div className="wm-canvas-scale" style={{ width, height, transform: `scale(${scale})` }}>
              <svg className="wm-edge" width={width} height={height} style={{ left: 0, top: 0 }}>
                <defs>
                  <marker id="wm-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#cbd5e1" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const a = positions.get(edge.from);
                  const b = positions.get(edge.to);
                  if (!a || !b) return null;
                  const overlapsX = Math.max(a.x, b.x) < Math.min(a.x + a.w, b.x + b.w);
                  const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
                  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
                  const cls = ["backedBySourceRecord", "boundToIntegration", "belongsToIntegration"].includes(edge.relation)
                    ? "is-source"
                    : "";
                  const d = overlapsX
                    ? `M ${top.x + top.w / 2} ${top.y + top.h} L ${bottom.x + bottom.w / 2} ${bottom.y}`
                    : [
                        `M ${left.x + left.w} ${left.y + left.h / 2}`,
                        `H ${(left.x + left.w + right.x) / 2}`,
                        `V ${right.y + right.h / 2}`,
                        `H ${right.x}`,
                      ].join(" ");
                  return <path key={edge.id} className={cls} d={d} markerEnd="url(#wm-arrow)" />;
                })}
              </svg>
              {placed.map((node) => {
                const pos = positions.get(node.id);
                const dim = needle && !matches(node);
                const isObject = node.type === "dataModelObject";
                const badge = isObject ? objectTypeBadge(node.summary?.objectType) : null;
                const fields = isObject ? (fieldsByObjectId.get(node.summary?.objectId) || []).slice(0, 5) : [];
                const rowCount = node.summary?.rowCount;
                const recordCount = node.summary?.recordCount;
                return (
                  <button
                    type="button"
                    key={node.id}
                    className={`wm-node${node.id === selectedId ? " is-selected" : ""}`}
                    style={{ left: pos.x, top: pos.y, width: pos.w, opacity: dim ? 0.32 : 1 }}
                    onClick={() => setSelectedId(node.id)}
                    aria-pressed={node.id === selectedId}
                    title={`Inspect ${node.label}`}
                  >
                    <span className="wm-node-head">
                      <span className="wm-node-icon"><LucideIcon name={nodeIconName(node)} size={14} /></span>
                      <span className="wm-node-title">{node.label || node.type}</span>
                      {badge && <span className={`dm-badge ${badge.cls}`}>{badge.label}</span>}
                    </span>
                    <span className="wm-node-body">
                      {isObject && (
                        <span className="wm-node-stat">
                          {Number.isFinite(rowCount) ? pluralize(rowCount, "record") : "—"}
                          {node.summary?.isLiveBacked ? " · live" : node.summary?.readOnly ? " · read-only" : " · manual"}
                        </span>
                      )}
                      {node.type === "sourceRecord" && (
                        <span className="wm-node-stat">
                          {Number.isFinite(recordCount) ? pluralize(recordCount, "record") : "no records"}
                          {node.summary?.fetchedAt ? ` · fetched ${String(node.summary.fetchedAt).slice(0, 10)}` : ""}
                        </span>
                      )}
                      {node.type === "workflow" && (
                        <span className="wm-node-stat">
                          {pluralize(node.summary?.nodeCount || 0, "step")}
                          {node.summary?.lifecycleStatus ? ` · ${node.summary.lifecycleStatus}` : ""}
                        </span>
                      )}
                      {node.type === "sandbox" && (
                        <span className="wm-node-stat">
                          {node.summary?.adapter || "sandbox"}
                          {node.summary?.authStatus ? ` · ${node.summary.authStatus}` : ""}
                        </span>
                      )}
                      {node.type === "integration" && (
                        <span className="wm-node-stat">{node.summary?.status || node.summary?.lane || "integration"}</span>
                      )}
                      {node.type === "dashboard" && (
                        <span className="wm-node-stat">{pluralize(node.summary?.widgetCount || 0, "widget")}</span>
                      )}
                      {fields.length > 0 && (
                        <span className="wm-node-fields">
                          {fields.map((field, index) => (
                            <span key={`${node.id}-f-${index}`} className="wm-node-field">{field}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              </div>
            </div>
            <div className="wm-zoom" role="group" aria-label="Zoom controls">
              <button type="button" onClick={() => zoom(-0.1)} aria-label="Zoom out"><ZoomOut size={15} /></button>
              <button type="button" onClick={() => setScale(1)} aria-label="Reset zoom"><Maximize2 size={14} /></button>
              <button type="button" onClick={() => zoom(0.1)} aria-label="Zoom in"><ZoomIn size={15} /></button>
            </div>
            {selectedNode && (
              <aside className="wm-detail" aria-label={`${selectedNode.label} detail`}>
                <div className="wm-detail-head">
                  <span className="wm-node-icon"><LucideIcon name={nodeIconName(selectedNode)} size={14} /></span>
                  <span className="wm-detail-title">{selectedNode.label || selectedNode.type}</span>
                  <button type="button" className="wm-detail-close" aria-label="Close detail" onClick={() => setSelectedId("")}><X size={14} /></button>
                </div>
                <dl className="wm-detail-meta">
                  {detailRows(selectedNode).map((row) => (
                    <div key={row.k} className="wm-detail-row"><dt>{row.k}</dt><dd>{row.v}</dd></div>
                  ))}
                </dl>
                <button type="button" className="dm-btn-primary-sm wm-detail-cta" onClick={() => handleOpen(selectedNode)}>
                  {openLabel(selectedNode)}
                </button>
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default WorkspaceDataModelCanvas;
