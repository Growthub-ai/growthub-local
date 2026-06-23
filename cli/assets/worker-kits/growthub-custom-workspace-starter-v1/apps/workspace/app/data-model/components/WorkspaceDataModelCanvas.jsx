"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Database, GitBranch, Globe, LayoutDashboard, Maximize2, Search, Table2, X, ZoomIn, ZoomOut } from "lucide-react";
import { WorkspaceDataModelNode } from "./WorkspaceDataModelNode.jsx";

const CARD_W = 236;
const COL_GAP = 116;
const V_GAP = 26;
const PAD = 48;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;

const COLUMN_ORDER = ["sources", "objects", "consumers"];
const COLUMN_INDEX = { sources: 0, objects: 1, consumers: 2 };

const LEGEND = [
  { type: "sourceRecord", label: "Sources", Icon: Database },
  { type: "integration", label: "Integrations", Icon: Globe },
  { type: "dataModelObject", label: "Objects", Icon: Table2 },
  { type: "workflow", label: "Workflows", Icon: GitBranch },
  { type: "dashboard", label: "Dashboards", Icon: LayoutDashboard }
];

const EDGE_CLASS = { feeds: "is-feeds", reads: "is-reads", writes: "is-writes" };

function nodeHeight(node) {
  if (node.type === "dataModelObject") {
    const fields = node.card?.fields?.length || 0;
    const more = (node.card?.fieldCount || 0) > fields ? 1 : 0;
    return 96 + fields * 20 + more * 18;
  }
  if (node.type === "workflow") return 88;
  return 80;
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

export function WorkspaceDataModelCanvas({ map, onOpenObject, onOpenWorkflow }) {
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  const allNodes = useMemo(() => (Array.isArray(map?.nodes) ? map.nodes : []), [map]);
  const allEdges = useMemo(() => (Array.isArray(map?.edges) ? map.edges : []), [map]);

  // Layout: nodes laid into three columns, each column vertically centred so
  // the graph reads as a balanced left→right schema. Hidden-type nodes are
  // removed from layout (the graph reflows) — search only dims, never reflows.
  const layout = useMemo(() => {
    const visible = allNodes.filter((node) => !hiddenTypes.has(node.type));
    const byColumn = { sources: [], objects: [], consumers: [] };
    for (const node of visible) (byColumn[node.column] || byColumn.objects).push(node);

    const geometry = new Map();
    const columnHeights = {};
    for (const key of COLUMN_ORDER) {
      const list = byColumn[key] || [];
      let h = 0;
      for (const node of list) h += nodeHeight(node) + V_GAP;
      columnHeights[key] = Math.max(0, h - V_GAP);
    }
    const maxH = Math.max(1, ...COLUMN_ORDER.map((key) => columnHeights[key]));

    for (const key of COLUMN_ORDER) {
      const list = byColumn[key] || [];
      const x = PAD + COLUMN_INDEX[key] * (CARD_W + COL_GAP);
      let y = PAD + (maxH - columnHeights[key]) / 2;
      for (const node of list) {
        const height = nodeHeight(node);
        geometry.set(node.id, { x, y, width: CARD_W, height, column: node.column });
        y += height + V_GAP;
      }
    }

    const width = PAD * 2 + 2 * (CARD_W + COL_GAP) + CARD_W;
    const height = PAD * 2 + maxH;
    const visibleIds = new Set(visible.map((n) => n.id));
    const edges = allEdges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    return { visible, geometry, edges, width, height };
  }, [allNodes, allEdges, hiddenTypes]);

  const needle = query.trim().toLowerCase();
  const matches = useCallback((node) => !needle || String(node.label || "").toLowerCase().includes(needle), [needle]);

  const zoomBy = useCallback((delta) => setZoom((value) => clampZoom(value + delta)), []);
  const fitView = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const z = clampZoom(Math.min((rect.width - 32) / layout.width, (rect.height - 32) / layout.height, 1));
    setZoom(z);
    setPan({ x: Math.max(16, (rect.width - layout.width * z) / 2), y: 16 });
  }, [layout.width, layout.height]);

  const handleWheel = useCallback((event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
  }, [zoomBy]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".dm-map-node, button, input")) return;
    dragRef.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, ox: pan.x, oy: pan.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [pan.x, pan.y]);
  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setPan({ x: drag.ox + event.clientX - drag.sx, y: drag.oy + event.clientY - drag.sy });
  }, []);
  const endDrag = useCallback((event) => { if (dragRef.current?.id === event.pointerId) dragRef.current = null; }, []);

  function toggleType(type) {
    setHiddenTypes((current) => {
      const next = new Set(current);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  // Edge path: anchor on the side of each card that faces the other, so
  // right-to-left consumer→object edges still connect cleanly.
  function edgePath(edge) {
    const a = layout.geometry.get(edge.from);
    const b = layout.geometry.get(edge.to);
    if (!a || !b) return null;
    const aRight = (a.column ? COLUMN_INDEX[a.column] : 0) <= (b.column ? COLUMN_INDEX[b.column] : 0);
    const x1 = aRight ? a.x + a.width : a.x;
    const y1 = a.y + a.height / 2;
    const x2 = aRight ? b.x : b.x + b.width;
    const y2 = b.y + b.height / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    const c1 = aRight ? x1 + dx : x1 - dx;
    const c2 = aRight ? x2 - dx : x2 + dx;
    return `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
  }

  const selectedEdgeIds = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set();
    for (const edge of layout.edges) if (edge.from === selectedId || edge.to === selectedId) set.add(edge.id);
    return set;
  }, [selectedId, layout.edges]);

  if (!allNodes.length) {
    return (
      <div className="dm-map-empty">
        <span className="dm-map-empty__icon" aria-hidden="true"><Database size={26} /></span>
        <strong>Your workspace map is empty</strong>
        <p>Create Data Model objects, connect a source, or build a workflow and they will appear here, wired to the data they touch.</p>
      </div>
    );
  }

  return (
    <div className="dm-map">
      <div className="dm-map-controls">
        <label className="dm-db-search dm-map-search">
          <Search size={13} aria-hidden="true" />
          <input type="search" value={query} placeholder="Search the map" aria-label="Search workspace map" onChange={(event) => setQuery(event.target.value)} />
          {query && <button type="button" className="dm-db-search-clear" aria-label="Clear search" onClick={() => setQuery("")}><X size={12} /></button>}
        </label>
        <div className="dm-map-legend" role="group" aria-label="Filter node types">
          {LEGEND.map(({ type, label, Icon }) => {
            const count = allNodes.filter((n) => n.type === type).length;
            if (!count) return null;
            const off = hiddenTypes.has(type);
            return (
              <button key={type} type="button" className={`dm-map-legend__item dm-map-legend__item--${type}${off ? " is-off" : ""}`} aria-pressed={!off} onClick={() => toggleType(type)}>
                <span className="dm-map-legend__dot" aria-hidden="true"><Icon size={11} /></span>
                {label}<span className="dm-map-legend__count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={canvasRef}
        className="dm-map-canvas"
        aria-label="Workspace data model canvas"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <div className="dm-orchestration-floating-tools dm-map-tools" aria-label="Canvas tools">
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(0.1)}><ZoomIn size={14} /></button>
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(-0.1)}><ZoomOut size={14} /></button>
          <button type="button" title="Fit view" aria-label="Fit view" onClick={fitView}><Maximize2 size={14} /></button>
        </div>

        <div className="dm-map-viewport" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, width: layout.width, height: layout.height }}>
          <svg className="dm-map-edges" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.edges.map((edge) => {
              const d = edgePath(edge);
              if (!d) return null;
              const active = selectedEdgeIds ? selectedEdgeIds.has(edge.id) : true;
              return <path key={edge.id} d={d} className={`dm-map-edge ${EDGE_CLASS[edge.relation] || ""}${active ? "" : " is-dim"}`} fill="none" />;
            })}
          </svg>
          {layout.visible.map((node) => (
            <WorkspaceDataModelNode
              key={node.id}
              node={node}
              geometry={layout.geometry.get(node.id)}
              selected={selectedId === node.id}
              dimmed={!matches(node)}
              onSelect={(n) => setSelectedId((current) => (current === n.id ? null : n.id))}
              onOpen={(n) => {
                if (n.type === "dataModelObject") onOpenObject?.(n.card?.objectId);
                else if (n.type === "workflow") onOpenWorkflow?.({ objectId: n.card?.objectId, rowId: n.card?.rowId });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
