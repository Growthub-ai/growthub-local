"use client";

import { Database, GitBranch, Globe, LayoutDashboard, Table2 } from "lucide-react";
import { LucideIcon, objectTypeBadge, pluralize } from "./dm-shared.jsx";

const NODE_ICON = {
  dataModelObject: Table2,
  sourceRecord: Database,
  integration: Globe,
  workflow: GitBranch,
  dashboard: LayoutDashboard
};

function liveLabel(card) {
  if (card?.isLiveBacked) return "Live";
  if (card?.readOnly) return "Read-only";
  return "Manual";
}

/**
 * A single positioned node card on the Workspace Map. Pure presentation —
 * all data is pre-derived by projectWorkspaceMap; this component never reads
 * config. `geometry` carries the absolute x/y/width/height so the SVG edge
 * layer and the card stay pixel-aligned.
 */
export function WorkspaceDataModelNode({ node, geometry, selected, dimmed, onOpen, onSelect }) {
  const Icon = NODE_ICON[node.type] || Database;
  const card = node.card || {};
  const openable = node.type === "dataModelObject" || node.type === "workflow";

  return (
    <div
      className={`dm-map-node dm-map-node--${node.type}${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
      style={{ left: geometry.x, top: geometry.y, width: geometry.width, minHeight: geometry.height }}
      role="button"
      tabIndex={0}
      aria-label={`${node.label} ${node.type}`}
      onClick={() => onSelect?.(node)}
      onDoubleClick={() => openable && onOpen?.(node)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { openable ? onOpen?.(node) : onSelect?.(node); }
      }}
    >
      <div className="dm-map-node__head">
        <span className="dm-map-node__icon" aria-hidden="true"><Icon size={14} /></span>
        <span className="dm-map-node__title">{node.label || "Untitled"}</span>
      </div>

      {node.type === "dataModelObject" && (
        <>
          <div className="dm-map-node__meta">
            <span className={`dm-type-pill ${objectTypeBadge(card.objectType).cls}`}>{objectTypeBadge(card.objectType).label}</span>
            <span className={`dm-map-chip dm-map-chip--${card.isLiveBacked ? "live" : "manual"}`}>{liveLabel(card)}</span>
            <span className="dm-map-node__count">{pluralize(card.rowCount || 0, "record")}</span>
          </div>
          {card.fields?.length > 0 && (
            <ul className="dm-map-node__fields">
              {card.fields.map((field, index) => (
                <li key={`${field.label}:${index}`}><span className="dm-map-node__field-name">{field.label}</span><span className="dm-map-node__field-type">{field.type || "text"}</span></li>
              ))}
              {card.fieldCount > card.fields.length && (
                <li className="dm-map-node__fields-more">+{card.fieldCount - card.fields.length} more</li>
              )}
            </ul>
          )}
        </>
      )}

      {node.type === "sourceRecord" && (
        <div className="dm-map-node__meta">
          <span className="dm-map-chip dm-map-chip--live">Source</span>
          <span className="dm-map-node__count">{pluralize(card.recordCount || 0, "record")}</span>
        </div>
      )}

      {node.type === "integration" && (
        <div className="dm-map-node__meta">
          {card.lane && <span className="dm-map-chip">{card.lane}</span>}
          {card.status && <span className={`dm-map-chip dm-map-chip--${card.status === "connected" ? "live" : "manual"}`}>{card.status}</span>}
        </div>
      )}

      {node.type === "workflow" && (
        <div className="dm-map-node__meta">
          {card.lifecycleStatus && <span className="dm-map-chip">{card.lifecycleStatus}</span>}
          <span className="dm-map-node__count">{pluralize(card.nodeCount || 0, "step")}</span>
          {card.requiresInput && <span className="dm-map-chip dm-map-chip--manual">Needs input</span>}
        </div>
      )}

      {node.type === "dashboard" && (
        <div className="dm-map-node__meta">
          <span className="dm-map-node__count">{pluralize(card.widgetCount || 0, "widget")}</span>
        </div>
      )}

      {openable && <span className="dm-map-node__open-hint">{node.type === "workflow" ? "Open workflow ↗" : "Open object ↗"}</span>}
    </div>
  );
}
