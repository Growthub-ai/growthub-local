"use client";

/**
 * Shared workspace nav rail.
 *
 * One canonical rail rendered on every governed-workspace page. Two-row
 * header (brand + utility actions, then tab toggles + Ask helper pill),
 * tab-driven body:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [G] workspace-name ▾          🔍   [▸]       │  Top row
 *   │ [🏠 Home] [💬 Chat]      [✶+  Ask helper]    │  Tab row
 *   ├──────────────────────────────────────────────┤
 *   │ HOME tab body:           CHAT tab body:      │
 *   │  Dashboards               Latest             │
 *   │  Data Model               💬 Best Skills     │
 *   │  Management               💬 Casual greet    │
 *   │  Workspace Settings       (… more threads)   │
 *   └──────────────────────────────────────────────┘
 *
 * Chat threads come from the governed `helper-threads` custom object
 * (id = "helper-threads") in workspaceConfig.dataModel.objects[].rows.
 * Rename / archive / delete actions mutate that object in place via
 * PATCH /api/workspace { dataModel } — the same PATCH allowlist used by
 * the rest of the workspace builder.
 *
 * Surface-specific slots (`dashboardsSlot`, `dataModelSlot`,
 * `managementSlot`, `settingsSlot`) let the page inject its own
 * Dashboards / Data Model / Management / Workspace Settings behaviour
 * while keeping the visual treatment identical across every page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Home,
  LayoutDashboard,
  MessageCircle,
  MessageCirclePlus,
  MoreHorizontal,
  MoreVertical,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Table as TableIcon,
  Trash2,
  X,
} from "lucide-react";
import {
  NAV_FOLDERS_OBJECT_ID,
  NAV_FOLDER_NAME_MAX,
  NAV_ITEM_LABEL_MAX,
  ensureNavFoldersObject,
  nextNavFolderId,
  nextNavItemId,
} from "@/lib/workspace-helper-apply";
import { ICON_PICKER_SET, LucideIcon } from "./data-model/components/dm-shared.jsx";

function textColorForAccent(accent) {
  const hex = String(accent || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#252525" : "#ffffff";
}

function relativeTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const INTENT_LABEL = {
  build_dashboard: "Build dashboard",
  create_widget: "Create widget",
  register_api: "Register API",
  create_object: "Create object",
  edit_view: "Edit view",
  repair: "Repair workspace",
  explain: "Explain",
};

function deriveThreadTitle(row) {
  const title = typeof row?.title === "string" ? row.title.trim() : "";
  if (title) return title;
  const summary = typeof row?.summary === "string" ? row.summary.trim() : "";
  if (summary) {
    const firstClause = summary.split(/[\n\.]/)[0].trim();
    if (firstClause) return firstClause.length > 56 ? `${firstClause.slice(0, 55)}…` : firstClause;
  }
  return INTENT_LABEL[row?.intent] || "Helper conversation";
}

function getNavFolderRows(workspaceConfig) {
  const obj = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
  const rows = Array.isArray(obj?.rows) ? obj.rows : [];
  return rows
    .slice()
    .sort((a, b) => {
      const oa = Number.isFinite(a?.order) ? a.order : 0;
      const ob = Number.isFinite(b?.order) ? b.order : 0;
      return oa - ob;
    });
}

function listAvailableDashboards(workspaceConfig) {
  const dashboards = Array.isArray(workspaceConfig?.dashboards) ? workspaceConfig.dashboards : [];
  return dashboards
    .filter((d) => d && d.id && d.name)
    .map((d) => ({ id: d.id, name: d.name }));
}

function listAvailableObjectsForViews(workspaceConfig) {
  // Mirror the user-facing object set surfaced in the data-model UI:
  // exclude the helper-owned hidden custom objects (helper sandbox,
  // nav-folders). Everything else — including helper-threads and the
  // six core governed business objects — is fair game for a folder
  // view item.
  const HIDDEN = new Set(["workspace-helper-sandbox", NAV_FOLDERS_OBJECT_ID]);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects
    .filter((o) => o && o.id && o.label && !HIDDEN.has(o.id))
    .map((o) => ({
      id: o.id,
      label: o.label,
      columns: Array.isArray(o.columns) ? o.columns : [],
    }));
}

function getHelperThreadRows(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects || [];
  const ht = objects.find((o) => o?.id === "helper-threads");
  const rows = Array.isArray(ht?.rows) ? ht.rows : [];
  return rows
    .filter((r) => r && !r.archived)
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

/** Preset swatches for folder / nav-item icon badges (Twenty-style). */
const NAV_COLOR_SWATCHES = [
  { color: "#f97316", iconBg: "#fff7ed", label: "Orange" },
  { color: "#3b82f6", iconBg: "#eff6ff", label: "Blue" },
  { color: "#14b8a6", iconBg: "#f0fdfa", label: "Teal" },
  { color: "#8b5cf6", iconBg: "#f5f3ff", label: "Violet" },
  { color: "#ec4899", iconBg: "#fdf2f8", label: "Pink" },
  { color: "#64748b", iconBg: "#f8fafc", label: "Slate" },
];

const NAV_FOLDER_STYLE_DEFAULT = { icon: "Folder", color: "#f97316", iconBg: "#fff7ed" };
const NAV_ITEM_STYLE_DEFAULT = {
  dashboard: { icon: "LayoutDashboard", color: "#3b82f6", iconBg: "#eff6ff" },
  view: { icon: "Table", color: "#14b8a6", iconBg: "#f0fdfa" },
};

/** Default visible rows before scroll — keeps the rail from growing unbounded. */
const NAV_MAX_VISIBLE_FOLDERS = 10;
const NAV_MAX_VISIBLE_ITEMS = 10;

function navFolderStyle(folder) {
  return {
    icon: folder?.icon || NAV_FOLDER_STYLE_DEFAULT.icon,
    color: folder?.color || NAV_FOLDER_STYLE_DEFAULT.color,
    iconBg: folder?.iconBg || NAV_FOLDER_STYLE_DEFAULT.iconBg,
  };
}

function navItemStyle(item) {
  const base = NAV_ITEM_STYLE_DEFAULT[item?.type] || NAV_ITEM_STYLE_DEFAULT.view;
  return {
    icon: item?.icon || base.icon,
    color: item?.color || base.color,
    iconBg: item?.iconBg || base.iconBg,
  };
}

function filterNavFolderRows(rows, query, typeFilter) {
  const q = query.trim().toLowerCase();
  const typeActive = typeFilter !== "all";
  if (!q && !typeActive) {
    return rows.map((folder) => ({
      folder,
      items: Array.isArray(folder.items) ? folder.items : [],
      expand: false,
    }));
  }
  return rows.flatMap((folder) => {
    const items = Array.isArray(folder.items) ? folder.items : [];
    const folderNameMatch = !q || String(folder.name || "").toLowerCase().includes(q);
    const filteredItems = items.filter((item) => {
      if (typeActive && item.type !== typeFilter) return false;
      if (!q || folderNameMatch) return true;
      const label = String(item.label || item.refId || item.objectId || "").toLowerCase();
      return label.includes(q);
    });
    if (typeActive && !filteredItems.length && !folderNameMatch) return [];
    if (q && !folderNameMatch && !filteredItems.length) return [];
    return [{
      folder,
      items: typeActive || q ? filteredItems : items,
      expand: Boolean(q || typeActive),
    }];
  }).map((entry, index, list) => {
    if (!entry.expand) return entry;
    const firstExpandIdx = list.findIndex((e) => e.expand);
    if (index !== firstExpandIdx) return { ...entry, expand: false };
    return entry;
  });
}

function hexToTintBg(hex, alpha = 0.1) {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return "#f5f5f5";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function navCustomizeDirty(snapshot, draft) {
  return (
    snapshot.name !== draft.name
    || snapshot.icon !== draft.icon
    || snapshot.color !== draft.color
    || snapshot.iconBg !== draft.iconBg
  );
}

function NavIconBadge({ icon, color, iconBg }) {
  return (
    <span
      className="workspace-rail-nav-icon-badge"
      style={{ background: iconBg, color }}
    >
      <LucideIcon name={icon} size={14} />
    </span>
  );
}

function NavColorPicker({ color, iconBg, onPick }) {
  return (
    <div className="workspace-rail-nav-color-picker">
      <div className="workspace-rail-nav-color-swatches" role="listbox" aria-label="Icon color">
        {NAV_COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.color}
            type="button"
            role="option"
            aria-selected={color === swatch.color}
            className={"workspace-rail-nav-color-swatch" + (color === swatch.color ? " active" : "")}
            title={swatch.label}
            style={{ background: swatch.iconBg, color: swatch.color }}
            onClick={() => onPick(swatch)}
          >
            <span className="workspace-rail-nav-color-swatch-dot" style={{ background: swatch.color }} />
          </button>
        ))}
      </div>
      <label className="workspace-rail-nav-color-custom">
        <span>Custom</span>
        <input
          type="color"
          value={color}
          onChange={(e) => {
            const hex = e.target.value;
            onPick({ color: hex, iconBg: hexToTintBg(hex) });
          }}
        />
      </label>
    </div>
  );
}

function NavCustomizePanel({
  nameLabel,
  nameMax,
  draft,
  setDraft,
  discardWarn,
  onSave,
  onCancel,
}) {
  return (
    <div className="workspace-rail-nav-customize" onClick={(e) => e.stopPropagation()}>
      {discardWarn ? (
        <p className="workspace-rail-nav-discard-warn" role="status">
          Unsaved changes. Click outside again to discard, or save below.
        </p>
      ) : null}
      <label className="workspace-rail-nav-customize-field">
        <span>{nameLabel}</span>
        <input
          type="text"
          value={draft.name}
          maxLength={nameMax}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSave(); }
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
        />
      </label>
      <span className="workspace-rail-nav-customize-label">Icon</span>
      <div className="dm-icon-picker workspace-rail-nav-icon-picker">
        {ICON_PICKER_SET.map((name) => (
          <button
            key={name}
            type="button"
            className={"dm-icon-picker-btn" + (draft.icon === name ? " active" : "")}
            title={name}
            onClick={() => setDraft((d) => ({ ...d, icon: name }))}
          >
            <LucideIcon name={name} size={16} />
          </button>
        ))}
      </div>
      <span className="workspace-rail-nav-customize-label">Color</span>
      <NavColorPicker
        color={draft.color}
        iconBg={draft.iconBg}
        onPick={(swatch) => setDraft((d) => ({
          ...d,
          color: swatch.color,
          iconBg: swatch.iconBg || d.iconBg,
        }))}
      />
      <div className="workspace-rail-nav-customize-actions">
        <button type="button" className="workspace-rail-nav-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="workspace-rail-nav-btn-primary" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}

function NavCustomizeOverlay({ children, panelRef }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="workspace-rail-thread-menu workspace-rail-nav-menu workspace-rail-nav-menu-stack is-customize"
      role="menu"
      ref={panelRef}
    >
      {children}
    </div>,
    document.body,
  );
}

function NavFolderPickerOverlay({ children, onClose }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="workspace-rail-folder-picker-backdrop" onClick={onClose}>
      {children}
    </div>,
    document.body,
  );
}

/**
 * Custom Folders Navigation Module — mirrors Twenty CRM's drag-to-reorder,
 * user-named folders that group Dashboard links and lightweight Views of
 * governed Data Model objects. Persists in the well-known nav-folders
 * Data Model object via the same PATCH allowlist used by the rest of the
 * rail; if the object is absent the section silently shows zero folders.
 */
function NavFoldersSection({
  workspaceConfig,
  pathname,
  onPatchNavFolders,
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [createDiscardWarn, setCreateDiscardWarn] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null); // folderId or `${folderId}::${itemId}`
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [customizeTarget, setCustomizeTarget] = useState(null);
  const [discardWarn, setDiscardWarn] = useState(false);
  const [addPickerFor, setAddPickerFor] = useState(null); // { folderId, kind: "dashboard"|"view" }
  const [filterQuery, setFilterQuery] = useState("");
  const [filterType, setFilterType] = useState("all"); // all | dashboard | view
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState(true);

  const rows = useMemo(() => getNavFolderRows(workspaceConfig), [workspaceConfig]);
  const dashboards = useMemo(() => listAvailableDashboards(workspaceConfig), [workspaceConfig]);
  const viewableObjects = useMemo(() => listAvailableObjectsForViews(workspaceConfig), [workspaceConfig]);
  const filteredEntries = useMemo(
    () => filterNavFolderRows(rows, filterQuery, filterType),
    [rows, filterQuery, filterType],
  );
  const filterActive = Boolean(filterQuery.trim()) || filterType !== "all";
  const menuWrapRef = useRef(null);
  const filterMenuRef = useRef(null);
  const customizePanelRef = useRef(null);
  const createInputRef = useRef(null);
  const dragState = useRef(null);

  const closeCustomize = useCallback(() => {
    setCustomizeTarget(null);
    setDiscardWarn(false);
    setOpenMenuId(null);
    setMenuAnchor(null);
  }, []);

  const openAnchoredMenu = useCallback((menuId, trigger) => {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 188;
    const top = Math.min(rect.bottom + 4, window.innerHeight - 86);
    const left = Math.max(10, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    setMenuAnchor({ top, left });
    setOpenMenuId(menuId);
  }, []);

  const requestDiscardCustomize = useCallback(() => {
    if (!customizeTarget) return;
    if (!navCustomizeDirty(customizeTarget.snapshot, customizeTarget.draft)) {
      closeCustomize();
      return;
    }
    if (!discardWarn) {
      setDiscardWarn(true);
      return;
    }
    closeCustomize();
  }, [customizeTarget, discardWarn, closeCustomize]);

  useEffect(() => {
    if (!openMenuId && !customizeTarget) return undefined;
    const onPointerDown = (e) => {
      if (menuWrapRef.current?.contains(e.target)) return;
      if (customizePanelRef.current?.contains(e.target)) return;
      if (customizeTarget) {
        requestDiscardCustomize();
        return;
      }
      setOpenMenuId(null);
      setMenuAnchor(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenuId, customizeTarget, requestDiscardCustomize]);

  useEffect(() => {
    if (!filterMenuOpen) return undefined;
    const onPointerDown = (e) => {
      if (filterMenuRef.current?.contains(e.target)) return;
      setFilterMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen]);

  useEffect(() => {
    if (!creating) {
      setCreateDiscardWarn(false);
      return undefined;
    }
    const onPointerDown = (e) => {
      if (createInputRef.current?.contains(e.target)) return;
      const trimmed = createDraft.trim();
      if (!trimmed) {
        setCreating(false);
        setCreateDraft("");
        setCreateDiscardWarn(false);
        return;
      }
      if (!createDiscardWarn) {
        setCreateDiscardWarn(true);
        return;
      }
      setCreating(false);
      setCreateDraft("");
      setCreateDiscardWarn(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [creating, createDraft, createDiscardWarn]);

  useEffect(() => {
    if (!addPickerFor) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setAddPickerFor(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addPickerFor]);

  const writeRows = useCallback(async (nextRows) => {
    await onPatchNavFolders(nextRows.map((row, i) => ({ ...row, order: i })));
  }, [onPatchNavFolders]);

  const createFolder = useCallback(async () => {
    const trimmed = createDraft.trim();
    if (!trimmed) {
      setCreating(false);
      setCreateDraft("");
      setCreateDiscardWarn(false);
      return;
    }
    const name = trimmed.length > NAV_FOLDER_NAME_MAX ? trimmed.slice(0, NAV_FOLDER_NAME_MAX) : trimmed;
    const next = [
      ...rows,
      {
        id: nextNavFolderId(),
        name,
        order: rows.length,
        collapsed: false,
        items: [],
        ...NAV_FOLDER_STYLE_DEFAULT,
      },
    ];
    setCreating(false);
    setCreateDraft("");
    setCreateDiscardWarn(false);
    await writeRows(next);
  }, [createDraft, rows, writeRows]);

  const startCustomizeFolder = useCallback((folder) => {
    const style = navFolderStyle(folder);
    const snapshot = {
      name: folder.name,
      icon: style.icon,
      color: style.color,
      iconBg: style.iconBg,
    };
    setCustomizeTarget({
      scope: "folder",
      folderId: folder.id,
      snapshot,
      draft: { ...snapshot },
    });
    setDiscardWarn(false);
    setOpenMenuId(folder.id);
  }, []);

  const startCustomizeItem = useCallback((folder, item) => {
    const style = navItemStyle(item);
    const snapshot = {
      name: item.label || item.refId || item.objectId || "",
      icon: style.icon,
      color: style.color,
      iconBg: style.iconBg,
    };
    const composedId = `${folder.id}::${item.id}`;
    setCustomizeTarget({
      scope: "item",
      folderId: folder.id,
      itemId: item.id,
      snapshot,
      draft: { ...snapshot },
    });
    setDiscardWarn(false);
    setOpenMenuId(composedId);
  }, []);

  const saveCustomize = useCallback(async () => {
    if (!customizeTarget) return;
    const trimmed = customizeTarget.draft.name.trim();
    if (!trimmed) return;
    if (customizeTarget.scope === "folder") {
      const next = rows.map((row) => (row.id === customizeTarget.folderId
        ? {
            ...row,
            name: trimmed.slice(0, NAV_FOLDER_NAME_MAX),
            icon: customizeTarget.draft.icon,
            color: customizeTarget.draft.color,
            iconBg: customizeTarget.draft.iconBg,
          }
        : row));
      await writeRows(next);
    } else {
      const label = trimmed.slice(0, NAV_ITEM_LABEL_MAX);
      const next = rows.map((row) => {
        if (row.id !== customizeTarget.folderId) return row;
        return {
          ...row,
          items: (row.items || []).map((it) => (it.id === customizeTarget.itemId
            ? {
                ...it,
                label,
                icon: customizeTarget.draft.icon,
                color: customizeTarget.draft.color,
                iconBg: customizeTarget.draft.iconBg,
              }
            : it)),
        };
      });
      await writeRows(next);
    }
    closeCustomize();
  }, [customizeTarget, rows, writeRows, closeCustomize]);

  const toggleCollapsed = useCallback(async (folderId) => {
    const target = rows.find((row) => row.id === folderId);
    const isOpen = target && !target.collapsed;
    const next = isOpen
      ? rows.map((row) => (row.id === folderId ? { ...row, collapsed: true } : row))
      : rows.map((row) => ({ ...row, collapsed: row.id !== folderId }));
    await writeRows(next);
  }, [rows, writeRows]);

  const deleteFolder = useCallback(async (folderId) => {
    setOpenMenuId(null);
    await writeRows(rows.filter((row) => row.id !== folderId));
  }, [rows, writeRows]);

  const deleteItem = useCallback(async (folderId, itemId) => {
    setOpenMenuId(null);
    const next = rows.map((row) => {
      if (row.id !== folderId) return row;
      return { ...row, items: (row.items || []).filter((it) => it.id !== itemId) };
    });
    await writeRows(next);
  }, [rows, writeRows]);

  const addDashboardItem = useCallback(async (folderId, dashboard) => {
    setAddPickerFor(null);
    setOpenMenuId(null);
    const style = NAV_ITEM_STYLE_DEFAULT.dashboard;
    const item = {
      id: nextNavItemId(),
      type: "dashboard",
      refId: dashboard.id,
      label: dashboard.name,
      icon: style.icon,
      color: style.color,
      iconBg: style.iconBg,
    };
    const next = rows.map((row) => {
      if (row.id !== folderId) return row;
      return { ...row, items: [...(row.items || []), item] };
    });
    await writeRows(next);
  }, [rows, writeRows]);

  const addViewItem = useCallback(async (folderId, dmObject) => {
    setAddPickerFor(null);
    setOpenMenuId(null);
    const style = NAV_ITEM_STYLE_DEFAULT.view;
    const item = {
      id: nextNavItemId(),
      type: "view",
      objectId: dmObject.id,
      label: dmObject.label,
      icon: style.icon,
      color: style.color,
      iconBg: style.iconBg,
      viewConfig: {
        columns: dmObject.columns,
      },
    };
    const next = rows.map((row) => {
      if (row.id !== folderId) return row;
      return { ...row, items: [...(row.items || []), item] };
    });
    await writeRows(next);
  }, [rows, writeRows]);

  // ── Drag-and-drop ────────────────────────────────────────────────────
  //
  // HTML5 DnD with a tiny in-ref state machine; mirrors Twenty's
  // reorder-folders + reorder-items + move-between-folders behaviour.
  //
  //   - drag a folder row → reorder among folders
  //   - drag an item row → reorder inside its folder, or drop into a
  //     different folder (folder header or another folder's body)

  const handleFolderDragStart = (e, folderId) => {
    dragState.current = { kind: "folder", folderId };
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", folderId); } catch { /* noop */ }
  };

  const handleItemDragStart = (e, folderId, itemId) => {
    dragState.current = { kind: "item", folderId, itemId };
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", `${folderId}::${itemId}`); } catch { /* noop */ }
    e.stopPropagation();
  };

  const handleDragEnd = () => { dragState.current = null; };

  const handleDragOver = (e) => {
    if (!dragState.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleFolderDrop = async (e, targetFolderId) => {
    if (!dragState.current) return;
    e.preventDefault();
    const drag = dragState.current;
    dragState.current = null;
    if (drag.kind === "folder") {
      if (!drag.folderId || drag.folderId === targetFolderId) return;
      const fromIdx = rows.findIndex((r) => r.id === drag.folderId);
      const toIdx = rows.findIndex((r) => r.id === targetFolderId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = rows.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      await writeRows(next);
      return;
    }
    if (drag.kind === "item") {
      if (drag.folderId === targetFolderId) return;
      const next = rows.map((row) => ({ ...row, items: Array.isArray(row.items) ? row.items.slice() : [] }));
      const fromRow = next.find((r) => r.id === drag.folderId);
      const toRow = next.find((r) => r.id === targetFolderId);
      if (!fromRow || !toRow) return;
      const itemIdx = fromRow.items.findIndex((it) => it.id === drag.itemId);
      if (itemIdx < 0) return;
      const [item] = fromRow.items.splice(itemIdx, 1);
      toRow.items.push(item);
      await writeRows(next);
    }
  };

  const handleItemDrop = async (e, targetFolderId, targetItemId) => {
    if (!dragState.current) return;
    e.preventDefault();
    e.stopPropagation();
    const drag = dragState.current;
    dragState.current = null;
    if (drag.kind !== "item") {
      // A folder dragged onto an item is treated as a folder drop on the
      // target item's folder, keeping behaviour predictable.
      if (drag.kind === "folder") {
        await handleFolderDrop(e, targetFolderId);
      }
      return;
    }
    const next = rows.map((row) => ({ ...row, items: Array.isArray(row.items) ? row.items.slice() : [] }));
    const fromRow = next.find((r) => r.id === drag.folderId);
    const toRow = next.find((r) => r.id === targetFolderId);
    if (!fromRow || !toRow) return;
    const fromIdx = fromRow.items.findIndex((it) => it.id === drag.itemId);
    if (fromIdx < 0) return;
    const [item] = fromRow.items.splice(fromIdx, 1);
    const toIdx = toRow.items.findIndex((it) => it.id === targetItemId);
    const insertAt = toIdx < 0 ? toRow.items.length : toIdx;
    toRow.items.splice(insertAt, 0, item);
    await writeRows(next);
  };

  const openDashboardItem = (item) => {
    // Dashboards are top-level surfaces; the builder reads the active
    // dashboard from query params if present. Other surfaces simply
    // navigate home; the user lands on the dashboards list. This keeps
    // the rail itself agnostic of surface-specific routing.
    router.push(`/?dashboard=${encodeURIComponent(item.refId)}`);
  };

  const openViewItem = (item) => {
    router.push(`/data-model?object=${encodeURIComponent(item.objectId || "")}`);
  };

  const renderItemMenu = (folder, item) => {
    const composedId = `${folder.id}::${item.id}`;
    const isMenuOpen = openMenuId === composedId;
    const isCustomizing = customizeTarget?.scope === "item"
      && customizeTarget.folderId === folder.id
      && customizeTarget.itemId === item.id;
    return (
      <div className="workspace-rail-thread-menu-wrap workspace-rail-nav-menu-wrap"
        ref={isMenuOpen ? menuWrapRef : null}
      >
        <button
          type="button"
          className="workspace-rail-thread-menu-btn workspace-rail-nav-menu-btn"
          aria-label={`Actions for ${item.label || "item"}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={(e) => {
            e.stopPropagation();
            if (isMenuOpen) {
              if (isCustomizing) requestDiscardCustomize();
              else {
                setOpenMenuId(null);
                setMenuAnchor(null);
              }
            } else {
              openAnchoredMenu(composedId, e.currentTarget);
            }
          }}
        >
          <MoreVertical size={14} />
        </button>
        {isMenuOpen && (isCustomizing ? (
          <NavCustomizeOverlay panelRef={customizePanelRef}>
            <NavCustomizePanel
              nameLabel="Display name"
              nameMax={NAV_ITEM_LABEL_MAX}
              draft={customizeTarget.draft}
              setDraft={(updater) => setCustomizeTarget((t) => ({
                ...t,
                draft: typeof updater === "function" ? updater(t.draft) : updater,
              }))}
              discardWarn={discardWarn}
              onSave={saveCustomize}
              onCancel={() => {
                if (navCustomizeDirty(customizeTarget.snapshot, customizeTarget.draft) && !discardWarn) {
                  setDiscardWarn(true);
                  return;
                }
                closeCustomize();
              }}
            />
          </NavCustomizeOverlay>
        ) : (
          <div
            className="workspace-rail-thread-menu workspace-rail-nav-menu workspace-rail-nav-menu-stack"
            role="menu"
            style={menuAnchor ? { top: `${menuAnchor.top}px`, left: `${menuAnchor.left}px` } : undefined}
          >
            <button
              type="button"
              role="menuitem"
              className="workspace-rail-thread-menu-item"
              onClick={() => startCustomizeItem(folder, item)}
            >
              <Pencil size={13} aria-hidden="true" /> Customize
            </button>
            <button
              type="button"
              role="menuitem"
              className="workspace-rail-thread-menu-item is-destructive"
              onClick={() => deleteItem(folder.id, item.id)}
            >
              <Trash2 size={13} aria-hidden="true" /> Remove
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderItemRow = (folder, item) => {
    const composedId = `${folder.id}::${item.id}`;
    const isMenuOpen = openMenuId === composedId;
    const isActive = item.type === "view" && pathname.startsWith(`/views/${encodeURIComponent(item.id)}`);
    const style = navItemStyle(item);
    const typeHint = item.type === "dashboard" ? "Dashboard" : "View";
    return (
      <li
        key={item.id}
        className={`workspace-rail-folder-item workspace-rail-nav-row${isActive ? " is-active" : ""}${isMenuOpen ? " is-menu-open" : ""}`}
        draggable
        onDragStart={(e) => handleItemDragStart(e, folder.id, item.id)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => handleItemDrop(e, folder.id, item.id)}
      >
        <span className="workspace-rail-tree-guide" aria-hidden="true" />
        <div className="workspace-rail-nav-row-body">
          <button
            type="button"
            className="workspace-rail-nav-row-main"
            onClick={() => (item.type === "dashboard" ? openDashboardItem(item) : openViewItem(item))}
            title={`${item.label || item.refId || item.objectId} · ${typeHint}`}
          >
            <NavIconBadge icon={style.icon} color={style.color} iconBg={style.iconBg} />
            <span className="workspace-rail-nav-row-text">
              <span className="workspace-rail-folder-item-label">{item.label || item.refId || item.objectId}</span>
              <span className="workspace-rail-nav-row-meta">{typeHint}</span>
            </span>
          </button>
          {renderItemMenu(folder, item)}
        </div>
      </li>
    );
  };

  const renderFolderMenu = (folder) => {
    const isMenuOpen = openMenuId === folder.id;
    const isCustomizing = customizeTarget?.scope === "folder" && customizeTarget.folderId === folder.id;
    return (
      <div className="workspace-rail-thread-menu-wrap workspace-rail-nav-menu-wrap"
        ref={isMenuOpen ? menuWrapRef : null}
      >
        <button
          type="button"
          className="workspace-rail-thread-menu-btn workspace-rail-nav-menu-btn"
          aria-label={`Actions for folder ${folder.name}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={(e) => {
            e.stopPropagation();
            if (isMenuOpen) {
              if (isCustomizing) requestDiscardCustomize();
              else {
                setOpenMenuId(null);
                setMenuAnchor(null);
              }
            } else {
              openAnchoredMenu(folder.id, e.currentTarget);
            }
          }}
        >
          <MoreVertical size={14} />
        </button>
        {isMenuOpen && (isCustomizing ? (
          <NavCustomizeOverlay panelRef={customizePanelRef}>
            <NavCustomizePanel
              nameLabel="Folder name"
              nameMax={NAV_FOLDER_NAME_MAX}
              draft={customizeTarget.draft}
              setDraft={(updater) => setCustomizeTarget((t) => ({
                ...t,
                draft: typeof updater === "function" ? updater(t.draft) : updater,
              }))}
              discardWarn={discardWarn}
              onSave={saveCustomize}
              onCancel={() => {
                if (navCustomizeDirty(customizeTarget.snapshot, customizeTarget.draft) && !discardWarn) {
                  setDiscardWarn(true);
                  return;
                }
                closeCustomize();
              }}
            />
          </NavCustomizeOverlay>
        ) : (
          <div
            className="workspace-rail-thread-menu workspace-rail-nav-menu workspace-rail-nav-menu-stack"
            role="menu"
            style={menuAnchor ? { top: `${menuAnchor.top}px`, left: `${menuAnchor.left}px` } : undefined}
          >
            <button
              type="button"
              role="menuitem"
              className="workspace-rail-thread-menu-item"
              onClick={() => startCustomizeFolder(folder)}
            >
              <Pencil size={13} aria-hidden="true" /> Customize
            </button>
            <button
              type="button"
              role="menuitem"
                  className="workspace-rail-thread-menu-item"
                  disabled={dashboards.length === 0}
                  onClick={() => {
                    setOpenMenuId(null);
                    setMenuAnchor(null);
                    setAddPickerFor({ folderId: folder.id, kind: "dashboard" });
                  }}
                >
                  <LayoutDashboard size={13} aria-hidden="true" /> Add dashboard
                </button>
            <button
              type="button"
              role="menuitem"
                  className="workspace-rail-thread-menu-item"
                  disabled={viewableObjects.length === 0}
                  onClick={() => {
                    setOpenMenuId(null);
                    setMenuAnchor(null);
                    setAddPickerFor({ folderId: folder.id, kind: "view" });
                  }}
                >
                  <TableIcon size={13} aria-hidden="true" /> Add view
                </button>
            <button
              type="button"
              role="menuitem"
              className="workspace-rail-thread-menu-item is-destructive"
              onClick={() => deleteFolder(folder.id)}
            >
              <Trash2 size={13} aria-hidden="true" /> Delete
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderFolder = (entry) => {
    const { folder, items, expand: forceExpand } = entry;
    const isMenuOpen = openMenuId === folder.id;
    const isCustomizing = customizeTarget?.scope === "folder" && customizeTarget.folderId === folder.id;
    const collapsed = Boolean(folder.collapsed) && !forceExpand;
    const isExpanded = !collapsed;
    const style = navFolderStyle(folder);
    const visibleItems = items;
    const itemOverflow = visibleItems.length > NAV_MAX_VISIBLE_ITEMS;
    return (
      <li
        key={folder.id}
        className={
          "workspace-rail-folder workspace-rail-nav-row"
          + (isExpanded ? " is-expanded" : "")
          + (isMenuOpen ? " is-menu-open" : "")
        }
        draggable={!isCustomizing}
        onDragStart={(e) => handleFolderDragStart(e, folder.id)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => handleFolderDrop(e, folder.id)}
      >
        <div className="workspace-rail-nav-row-body workspace-rail-folder-header">
          <button
            type="button"
            className="workspace-rail-nav-row-main workspace-rail-folder-toggle"
            aria-expanded={isExpanded}
            aria-label={collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
            onClick={() => toggleCollapsed(folder.id)}
          >
            <NavIconBadge icon={style.icon} color={style.color} iconBg={style.iconBg} />
            <span className="workspace-rail-folder-name">{folder.name}</span>
          </button>
          {renderFolderMenu(folder)}
        </div>
        <div
          className="workspace-rail-folder-accordion-panel"
          aria-hidden={collapsed}
        >
          <div className="workspace-rail-folder-accordion-inner">
            <ul
              className={"workspace-rail-folder-items" + (itemOverflow ? " is-scrollable" : "")}
              role="list"
              aria-label={`Items in ${folder.name}`}
            >
              {visibleItems.length === 0 ? (
                <li className="workspace-rail-folder-empty-spacer" aria-hidden="true" />
              ) : (
                visibleItems.map((item) => renderItemRow(folder, item))
              )}
            </ul>
          </div>
        </div>
      </li>
    );
  };

  const picker = addPickerFor ? (
    <NavFolderPickerOverlay onClose={() => setAddPickerFor(null)}>
      <div className="workspace-rail-folder-picker" onClick={(e) => e.stopPropagation()}>
        <div className="workspace-rail-folder-picker-head">
          <strong>{addPickerFor.kind === "dashboard" ? "Add dashboard" : "Add view"}</strong>
          <button
            type="button"
            className="workspace-rail-folder-picker-close"
            aria-label="Close picker"
            onClick={() => setAddPickerFor(null)}
          >
            <X size={14} />
          </button>
        </div>
        <ul className="workspace-rail-folder-picker-list" role="list">
          {addPickerFor.kind === "dashboard"
            ? dashboards.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="workspace-rail-folder-picker-item"
                    onClick={() => addDashboardItem(addPickerFor.folderId, d)}
                  >
                    <NavIconBadge
                      icon={NAV_ITEM_STYLE_DEFAULT.dashboard.icon}
                      color={NAV_ITEM_STYLE_DEFAULT.dashboard.color}
                      iconBg={NAV_ITEM_STYLE_DEFAULT.dashboard.iconBg}
                    />
                    <span>{d.name}</span>
                  </button>
                </li>
              ))
            : viewableObjects.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="workspace-rail-folder-picker-item"
                    onClick={() => addViewItem(addPickerFor.folderId, o)}
                  >
                    <NavIconBadge
                      icon={NAV_ITEM_STYLE_DEFAULT.view.icon}
                      color={NAV_ITEM_STYLE_DEFAULT.view.color}
                      iconBg={NAV_ITEM_STYLE_DEFAULT.view.iconBg}
                    />
                    <span>{o.label}</span>
                    <span className="workspace-rail-folder-picker-hint">{o.columns.length} field{o.columns.length === 1 ? "" : "s"}</span>
                  </button>
                </li>
              ))}
        </ul>
      </div>
    </NavFolderPickerOverlay>
  ) : null;

  const folderOverflow = filteredEntries.length > NAV_MAX_VISIBLE_FOLDERS;

  return (
    <div
      className={"workspace-rail-folders" + (sectionCollapsed ? " is-section-collapsed" : "")}
      aria-label="Custom folders"
    >
      <div className="workspace-rail-folders-head">
        <button
          type="button"
          className="workspace-rail-folders-section-toggle"
          aria-expanded={!sectionCollapsed}
          onClick={(e) => {
            e.currentTarget.blur();
            setSectionCollapsed((v) => !v);
          }}
        >
          <span className="workspace-rail-section-label">Folders</span>
          {sectionCollapsed
            ? <ChevronRight size={12} className="workspace-rail-folders-section-chevron" aria-hidden="true" />
            : <ChevronDown size={12} className="workspace-rail-folders-section-chevron" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="workspace-rail-folders-add-btn"
          aria-label="Create folder"
          title="New folder"
          onClick={() => {
            setSectionCollapsed(false);
            setCreating(true);
            setCreateDraft("");
          }}
        >
          <FolderPlus size={13} aria-hidden="true" />
        </button>
      </div>
      {!sectionCollapsed ? (
        <>
      <div className="workspace-rail-folders-filters">
        <div className="workspace-rail-folders-search">
          <Search size={12} aria-hidden="true" />
          <input
            type="search"
            className="workspace-rail-folders-search-input"
            placeholder="Filter folders & views"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            aria-label="Filter folders and views by name"
          />
          {filterQuery ? (
            <button
              type="button"
              className="workspace-rail-chat-search-clear"
              onClick={() => setFilterQuery("")}
              aria-label="Clear filter"
            >
              <X size={11} />
            </button>
          ) : null}
        </div>
        <div className="workspace-rail-folders-filter-menu-wrap" ref={filterMenuRef}>
          <button
            type="button"
            className={
              "workspace-rail-folders-filter-btn"
              + (filterMenuOpen ? " is-open" : "")
              + (filterActive ? " has-live-state" : "")
              + (rows.length === 0 ? " is-disabled" : "")
            }
            aria-label="Folder display options"
            aria-haspopup="menu"
            aria-expanded={filterMenuOpen}
            aria-disabled={rows.length === 0}
            title={rows.length === 0
              ? "No folders yet. Create one to organize dashboards and table views."
              : "Folder display options"}
            onClick={(e) => {
              e.currentTarget.blur();
              if (rows.length === 0) return;
              setFilterMenuOpen((v) => !v);
            }}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {filterActive ? <span className="workspace-rail-folders-filter-state-dot" aria-hidden="true" /> : null}
          </button>
          {filterMenuOpen && rows.length > 0 ? (
            <div className="workspace-rail-folders-filter-menu" role="menu">
              <div className="workspace-rail-folders-filter-menu-group">
                <p className="workspace-rail-folders-filter-menu-label">Type</p>
                {[
                  { id: "all", label: "All" },
                  { id: "dashboard", label: "Dashboards" },
                  { id: "view", label: "Views" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filterType === opt.id}
                    className="workspace-rail-folders-filter-menu-item"
                    onClick={() => {
                      setFilterType(opt.id);
                      setFilterMenuOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    <span className="workspace-rail-folders-filter-menu-value">
                      {filterType === opt.id ? "Active" : ""}
                    </span>
                    <ChevronRight size={13} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {filterActive ? (
                <div className="workspace-rail-folders-filter-menu-group">
                  <button
                    type="button"
                    role="menuitem"
                    className="workspace-rail-folders-filter-menu-item is-reset"
                    onClick={() => {
                      setFilterQuery("");
                      setFilterType("all");
                      setFilterMenuOpen(false);
                    }}
                  >
                    <span>Clear folder config</span>
                    <span className="workspace-rail-folders-filter-menu-value">Reset</span>
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              <div className="workspace-rail-folders-filter-menu-group">
                <button type="button" role="menuitem" className="workspace-rail-folders-filter-menu-item">
                  <span>Group by</span>
                  <span className="workspace-rail-folders-filter-menu-value">Folder</span>
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
                <button type="button" role="menuitem" className="workspace-rail-folders-filter-menu-item">
                  <span>Sort by</span>
                  <span className="workspace-rail-folders-filter-menu-value">Custom order</span>
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {creating ? (
        <div className="workspace-rail-folder-create">
          <NavIconBadge
            icon={NAV_FOLDER_STYLE_DEFAULT.icon}
            color={NAV_FOLDER_STYLE_DEFAULT.color}
            iconBg={NAV_FOLDER_STYLE_DEFAULT.iconBg}
          />
          <input
            ref={createInputRef}
            autoFocus
            className="workspace-rail-thread-rename"
            value={createDraft}
            onChange={(e) => {
              setCreateDraft(e.target.value);
              setCreateDiscardWarn(false);
            }}
            placeholder="Folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); createFolder(); }
              if (e.key === "Escape") {
                setCreating(false);
                setCreateDraft("");
                setCreateDiscardWarn(false);
              }
            }}
          />
          <button type="button" className="workspace-rail-nav-btn-primary is-compact" onClick={createFolder}>
            Save
          </button>
          {createDiscardWarn ? (
            <p className="workspace-rail-nav-discard-warn is-inline" role="status">
              Click outside again to discard
            </p>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 && !creating ? null : filteredEntries.length === 0 ? (
        <p className="workspace-rail-folders-empty">No folders or views match this filter.</p>
      ) : (
        <div
          className={"workspace-rail-folders-scroll" + (folderOverflow ? " is-scrollable" : "")}
          role="region"
          aria-label="Folder list"
        >
          <ul className="workspace-rail-folders-list" role="list">
            {filteredEntries.map(renderFolder)}
          </ul>
          {folderOverflow ? (
            <p className="workspace-rail-folders-scroll-hint">
              {filteredEntries.length} folders · scroll for more
            </p>
          ) : null}
        </div>
      )}
      {picker}
        </>
      ) : null}
    </div>
  );
}

export function WorkspaceRail({
  workspaceConfig,
  authority,
  helperOpen = false,
  onOpenHelper,
  onOpenThread,
  onConfigChange,
  dashboardsSlot,
  dataModelSlot,
  // `managementSlot` retained as accepted-but-ignored prop for backward
  // compatibility with callers that still pass it. The Management item
  // moved to the Workspace Settings → Ownership tab.
  managementSlot: _managementSlotDeprecated,
  settingsSlot,
}) {
  const branding = workspaceConfig?.branding || {};
  const workspaceName = branding.name || workspaceConfig?.name || "Growthub Workspace";
  const pathname = usePathname() || "/";
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("home");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatExpanded, setChatExpanded] = useState(false);
  const menuWrapRef = useRef(null);
  const CHAT_PREVIEW_COUNT = 10;

  useEffect(() => {
    if (!openMenuId) return undefined;
    const onPointerDown = (e) => {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenuId]);

  const threads = useMemo(() => getHelperThreadRows(workspaceConfig), [workspaceConfig]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("workspace-rail-collapsed", railCollapsed);
    return () => document.body.classList.remove("workspace-rail-collapsed");
  }, [railCollapsed]);

  const handleAskHelperClick = () => {
    if (onOpenHelper) {
      onOpenHelper();
      return;
    }
    router.push("/data-model?helper=open");
  };

  const handleOpenThread = (row) => {
    if (onOpenThread) {
      onOpenThread(row);
      return;
    }
    router.push(`/data-model?thread=${encodeURIComponent(row.id)}`);
  };

  async function patchNavFolders(updatedRows) {
    const seeded = ensureNavFoldersObject(workspaceConfig);
    const dm = seeded.dataModel;
    const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
    const idx = objects.findIndex((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
    if (idx === -1) return;
    objects[idx] = { ...objects[idx], rows: updatedRows };
    const nextDataModel = { ...dm, objects };
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: nextDataModel }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.workspaceConfig && onConfigChange) {
          onConfigChange(body.workspaceConfig);
        }
      }
    } catch {
      // Best-effort: read-only runtimes return 409; the user can retry.
    }
  }

  async function patchHelperThreads(updatedRows) {
    const dm = workspaceConfig?.dataModel || {};
    const objects = Array.isArray(dm.objects) ? dm.objects.slice() : [];
    const idx = objects.findIndex((o) => o?.id === "helper-threads");
    if (idx === -1) return;
    objects[idx] = { ...objects[idx], rows: updatedRows };
    const nextDataModel = { ...dm, objects };
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataModel: nextDataModel }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.workspaceConfig && onConfigChange) {
          onConfigChange(body.workspaceConfig);
        }
      }
    } catch {
      // Best-effort: read-only runtimes return 409; the user can retry.
    }
  }

  const beginRename = (row) => {
    setOpenMenuId(null);
    setRenamingId(row.id);
    setRenameDraft(deriveThreadTitle(row));
  };

  const commitRename = async (row) => {
    const next = renameDraft.trim();
    setRenamingId(null);
    setRenameDraft("");
    if (!next || next === deriveThreadTitle(row)) return;
    const ht = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads");
    const updated = (ht?.rows || []).map((r) => (r.id === row.id ? { ...r, title: next } : r));
    await patchHelperThreads(updated);
  };

  const archiveThread = async (row) => {
    setOpenMenuId(null);
    const ht = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads");
    const updated = (ht?.rows || []).map((r) => (r.id === row.id ? { ...r, archived: true } : r));
    await patchHelperThreads(updated);
  };

  const deleteThread = async (row) => {
    setOpenMenuId(null);
    const ht = (workspaceConfig?.dataModel?.objects || []).find((o) => o?.id === "helper-threads");
    const updated = (ht?.rows || []).filter((r) => r.id !== row.id);
    await patchHelperThreads(updated);
  };

  return (
    <aside className={"workspace-rail" + (railCollapsed ? " is-collapsed" : "")} aria-label="Workspace navigation">
      {/* Row 1: brand + utility actions */}
      <div className="workspace-rail-topbar">
        <button type="button" className="workspace-rail-brand-button" aria-label={`Workspace ${workspaceName}`}>
          <span
            className="workspace-mark"
            style={{
              background: branding.logoUrl ? undefined : branding.accent || undefined,
              color: branding.logoUrl ? undefined : textColorForAccent(branding.accent),
            }}
          >
            {branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : workspaceName.slice(0, 1).toUpperCase()}
          </span>
          <span className="workspace-brand-label">{workspaceName}</span>
          <ChevronDown size={13} className="workspace-brand-caret" aria-hidden="true" />
        </button>
        <div className="workspace-rail-topbar-actions">
          <button
            type="button"
            className="workspace-rail-icon-btn"
            aria-label="Search workspace"
            title="Search (⌘K)"
            data-rail-search=""
            onClick={() => {
              // Surfaces with a command palette (DataModelShell) listen
              // for this event and open the palette in place. Other
              // surfaces are free to ignore it.
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("growthub:open-command-palette"));
              }
            }}
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            className="workspace-rail-icon-btn"
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={railCollapsed}
            onClick={() => setRailCollapsed((v) => !v)}
          >
            <PanelLeftClose size={13} />
          </button>
          <button
            type="button"
            className="workspace-rail-icon-btn"
            aria-label="Workspace settings"
            title="Workspace settings"
            onClick={() => router.push("/settings/general")}
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* Row 2: tab toggles + Ask helper pill */}
      <div className="workspace-rail-tabbar">
        <div role="tablist" aria-label="Sidebar mode" className="workspace-rail-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "home"}
            className={"workspace-rail-tab" + (activeTab === "home" ? " active" : "")}
            onClick={() => setActiveTab("home")}
            aria-label="Home"
            title="Home"
          >
            <Home size={15} />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={"workspace-rail-tab" + (activeTab === "chat" ? " active" : "")}
            onClick={() => setActiveTab("chat")}
            aria-label="Helper conversations"
            title="Helper conversations"
          >
            <MessageCircle size={15} />
          </button>
        </div>
        <button
          type="button"
          className={"workspace-rail-helper-pill" + (helperOpen ? " active" : "")}
          data-helper-trigger="rail"
          aria-label={helperOpen ? "Close workspace helper" : "Open workspace helper"}
          aria-pressed={helperOpen}
          title={helperOpen ? "Close helper" : "Ask helper"}
          onClick={handleAskHelperClick}
        >
          <MessageCirclePlus size={13} aria-hidden="true" />
          <span>Ask helper</span>
        </button>
      </div>

      {/* Custom Folders Navigation Module — sits directly below the tab
          row and above both the Home nav items and the Chat thread list,
          mirroring Twenty CRM's drag-to-reorder sidebar folders. The
          module is fully backwards compatible: with no `nav-folders`
          object (or zero rows) it shows a thin empty-state hint and
          renders nothing in the body of the rail it would otherwise
          push down. */}
      <NavFoldersSection
        workspaceConfig={workspaceConfig}
        pathname={pathname}
        onPatchNavFolders={patchNavFolders}
      />

      {/* Body: switches by tab. The legacy `Management` nav item now
          lives as the 4th Workspace Settings tab (`/settings/ownership`).
          The Data Model link is renamed to `Management` since the data
          model surface IS the user-facing object/list management. */}
      {activeTab === "home" ? (
        <nav className="workspace-nav" aria-label="Workspace pages">
          {dashboardsSlot ?? (
            <Link href="/" className={pathname === "/" ? "active" : undefined}>
              Dashboards
            </Link>
          )}
          {dataModelSlot ?? (
            <Link
              href="/data-model"
              className={pathname.startsWith("/data-model") ? "active" : undefined}
            >
              Management
            </Link>
          )}
          {settingsSlot ?? (
            <Link
              href="/settings/general"
              className={"workspace-nav-bottom" + (pathname.startsWith("/settings") ? " active" : "")}
            >
              Workspace Settings
            </Link>
          )}
        </nav>
      ) : (
        <div className="workspace-rail-chat" aria-label="Helper conversation threads">
          <div className="workspace-rail-chat-search">
            <Search size={12} aria-hidden="true" />
            <input
              type="text"
              className="workspace-rail-chat-search-input"
              placeholder="Search chats"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              aria-label="Search helper conversations"
            />
            {chatSearch && (
              <button
                type="button"
                className="workspace-rail-chat-search-clear"
                onClick={() => setChatSearch("")}
                aria-label="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <div className="workspace-rail-section-label">Latest</div>
          {(() => {
            const q = chatSearch.trim().toLowerCase();
            const filtered = q
              ? threads.filter((r) => deriveThreadTitle(r).toLowerCase().includes(q))
              : threads;
            if (filtered.length === 0) {
              return (
                <p className="workspace-rail-chat-empty">
                  {q ? `No threads match “${chatSearch.trim()}”.` : "No helper conversations yet. Open one with Ask helper."}
                </p>
              );
            }
            const truncate = !chatExpanded && !q && filtered.length > CHAT_PREVIEW_COUNT;
            const visible = truncate ? filtered.slice(0, CHAT_PREVIEW_COUNT) : filtered;
            return (
              <>
                <div className={`workspace-rail-thread-scroll${truncate ? " is-truncated" : ""}`}>
                  <ul className="workspace-rail-thread-list" role="list">
                    {visible.map((row) => {
                const title = deriveThreadTitle(row);
                const isRenaming = renamingId === row.id;
                const isMenuOpen = openMenuId === row.id;
                return (
                  <li
                    key={row.id}
                    className="workspace-rail-thread-row"
                    data-thread-id={row.id}
                  >
                    <button
                      type="button"
                      className="workspace-rail-thread-main"
                      onClick={() => handleOpenThread(row)}
                      title={`${title}${row.intent ? ` · ${INTENT_LABEL[row.intent] || row.intent}` : ""}`}
                    >
                      <MessageCircle size={14} className="workspace-rail-thread-icon" />
                      {isRenaming ? (
                        <input
                          autoFocus
                          className="workspace-rail-thread-rename"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename(row);
                            }
                            if (e.key === "Escape") {
                              setRenamingId(null);
                              setRenameDraft("");
                            }
                          }}
                          onBlur={() => commitRename(row)}
                        />
                      ) : (
                        <span className="workspace-rail-thread-title">{title}</span>
                      )}
                      <span className="workspace-rail-thread-time" aria-label={`Updated ${relativeTime(row.updatedAt)}`}>
                        {relativeTime(row.updatedAt)}
                      </span>
                    </button>
                    <div
                      className="workspace-rail-thread-menu-wrap"
                      ref={isMenuOpen ? menuWrapRef : null}
                    >
                      <button
                        type="button"
                        className="workspace-rail-thread-menu-btn"
                        aria-label={`Actions for ${title}`}
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(isMenuOpen ? null : row.id);
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {isMenuOpen && (
                        <div className="workspace-rail-thread-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className="workspace-rail-thread-menu-item"
                            onClick={() => beginRename(row)}
                          >
                            <Pencil size={13} aria-hidden="true" /> Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="workspace-rail-thread-menu-item"
                            onClick={() => archiveThread(row)}
                          >
                            <Archive size={13} aria-hidden="true" /> Archive
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="workspace-rail-thread-menu-item is-destructive"
                            onClick={() => deleteThread(row)}
                          >
                            <Trash2 size={13} aria-hidden="true" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                      </li>
                    );
                  })}
                </ul>
                </div>
                {truncate && (
                  <button
                    type="button"
                    className="workspace-rail-chat-show-more"
                    onClick={() => setChatExpanded(true)}
                  >
                    Show {filtered.length - CHAT_PREVIEW_COUNT} more
                  </button>
                )}
                {!truncate && filtered.length > CHAT_PREVIEW_COUNT && chatExpanded && (
                  <button
                    type="button"
                    className="workspace-rail-chat-show-more"
                    onClick={() => setChatExpanded(false)}
                  >
                    Show less
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      <div className="workspace-rail-status">
        <span className="status-dot" />
        {authority || "local-catalog"}
      </div>
    </aside>
  );
}
