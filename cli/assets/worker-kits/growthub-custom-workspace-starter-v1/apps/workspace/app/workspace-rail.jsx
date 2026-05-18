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
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
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
  const rows = useMemo(() => getNavFolderRows(workspaceConfig), [workspaceConfig]);
  const dashboards = useMemo(() => listAvailableDashboards(workspaceConfig), [workspaceConfig]);
  const viewableObjects = useMemo(() => listAvailableObjectsForViews(workspaceConfig), [workspaceConfig]);

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null); // folderId or `${folderId}::${itemId}`
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renamingItemId, setRenamingItemId] = useState(null); // `${folderId}::${itemId}`
  const [renameDraft, setRenameDraft] = useState("");
  const [addPickerFor, setAddPickerFor] = useState(null); // { folderId, kind: "dashboard"|"view" }
  const menuWrapRef = useRef(null);
  const dragState = useRef(null);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const onPointerDown = (e) => {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenuId]);

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
    setCreating(false);
    setCreateDraft("");
    if (!trimmed) return;
    const name = trimmed.length > NAV_FOLDER_NAME_MAX ? trimmed.slice(0, NAV_FOLDER_NAME_MAX) : trimmed;
    const next = [
      ...rows,
      { id: nextNavFolderId(), name, order: rows.length, collapsed: false, items: [] },
    ];
    await writeRows(next);
  }, [createDraft, rows, writeRows]);

  const renameFolder = useCallback(async (folderId) => {
    const trimmed = renameDraft.trim();
    setRenamingFolderId(null);
    setRenameDraft("");
    if (!trimmed) return;
    const name = trimmed.length > NAV_FOLDER_NAME_MAX ? trimmed.slice(0, NAV_FOLDER_NAME_MAX) : trimmed;
    const next = rows.map((row) => (row.id === folderId ? { ...row, name } : row));
    await writeRows(next);
  }, [renameDraft, rows, writeRows]);

  const renameItem = useCallback(async (folderId, itemId) => {
    const trimmed = renameDraft.trim();
    setRenamingItemId(null);
    setRenameDraft("");
    if (!trimmed) return;
    const label = trimmed.length > NAV_ITEM_LABEL_MAX ? trimmed.slice(0, NAV_ITEM_LABEL_MAX) : trimmed;
    const next = rows.map((row) => {
      if (row.id !== folderId) return row;
      const items = (row.items || []).map((it) => (it.id === itemId ? { ...it, label } : it));
      return { ...row, items };
    });
    await writeRows(next);
  }, [renameDraft, rows, writeRows]);

  const toggleCollapsed = useCallback(async (folderId) => {
    const next = rows.map((row) => (row.id === folderId ? { ...row, collapsed: !row.collapsed } : row));
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
    const item = {
      id: nextNavItemId(),
      type: "dashboard",
      refId: dashboard.id,
      label: dashboard.name,
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
    const item = {
      id: nextNavItemId(),
      type: "view",
      objectId: dmObject.id,
      label: dmObject.label,
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
    router.push(`/views/${encodeURIComponent(item.id)}`);
  };

  const renderItemRow = (folder, item) => {
    const composedId = `${folder.id}::${item.id}`;
    const isRenaming = renamingItemId === composedId;
    const isMenuOpen = openMenuId === composedId;
    const isActive = item.type === "view" && pathname.startsWith(`/views/${encodeURIComponent(item.id)}`);
    return (
      <li
        key={item.id}
        className={`workspace-rail-folder-item${isActive ? " is-active" : ""}`}
        draggable
        onDragStart={(e) => handleItemDragStart(e, folder.id, item.id)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => handleItemDrop(e, folder.id, item.id)}
      >
        <button
          type="button"
          className="workspace-rail-folder-item-main"
          onClick={() => (item.type === "dashboard" ? openDashboardItem(item) : openViewItem(item))}
          title={item.label || item.refId || item.objectId}
        >
          {item.type === "dashboard"
            ? <LayoutDashboard size={13} className="workspace-rail-folder-item-icon" />
            : <TableIcon size={13} className="workspace-rail-folder-item-icon" />}
          {isRenaming ? (
            <input
              autoFocus
              className="workspace-rail-thread-rename"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); renameItem(folder.id, item.id); }
                if (e.key === "Escape") { setRenamingItemId(null); setRenameDraft(""); }
              }}
              onBlur={() => renameItem(folder.id, item.id)}
            />
          ) : (
            <span className="workspace-rail-folder-item-label">{item.label || item.refId || item.objectId}</span>
          )}
        </button>
        <div className="workspace-rail-thread-menu-wrap" ref={isMenuOpen ? menuWrapRef : null}>
          <button
            type="button"
            className="workspace-rail-thread-menu-btn"
            aria-label={`Actions for ${item.label || "item"}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(isMenuOpen ? null : composedId);
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
                onClick={() => {
                  setOpenMenuId(null);
                  setRenamingItemId(composedId);
                  setRenameDraft(item.label || "");
                }}
              >
                <Pencil size={13} aria-hidden="true" /> Rename
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
          )}
        </div>
      </li>
    );
  };

  const renderFolder = (folder) => {
    const isMenuOpen = openMenuId === folder.id;
    const isRenaming = renamingFolderId === folder.id;
    const collapsed = Boolean(folder.collapsed);
    const items = Array.isArray(folder.items) ? folder.items : [];
    return (
      <li
        key={folder.id}
        className="workspace-rail-folder"
        draggable={!isRenaming}
        onDragStart={(e) => handleFolderDragStart(e, folder.id)}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={(e) => handleFolderDrop(e, folder.id)}
      >
        <div className="workspace-rail-folder-header">
          <button
            type="button"
            className="workspace-rail-folder-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
            onClick={() => toggleCollapsed(folder.id)}
          >
            {collapsed
              ? <ChevronRight size={12} aria-hidden="true" />
              : <ChevronDown size={12} aria-hidden="true" />}
            <Folder size={13} className="workspace-rail-folder-icon" aria-hidden="true" />
            {isRenaming ? (
              <input
                autoFocus
                className="workspace-rail-thread-rename"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); renameFolder(folder.id); }
                  if (e.key === "Escape") { setRenamingFolderId(null); setRenameDraft(""); }
                }}
                onBlur={() => renameFolder(folder.id)}
              />
            ) : (
              <span className="workspace-rail-folder-name">{folder.name}</span>
            )}
          </button>
          <div className="workspace-rail-thread-menu-wrap" ref={isMenuOpen ? menuWrapRef : null}>
            <button
              type="button"
              className="workspace-rail-thread-menu-btn"
              aria-label={`Actions for folder ${folder.name}`}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(isMenuOpen ? null : folder.id);
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
                  onClick={() => {
                    setOpenMenuId(null);
                    setRenamingFolderId(folder.id);
                    setRenameDraft(folder.name);
                  }}
                >
                  <Pencil size={13} aria-hidden="true" /> Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-rail-thread-menu-item"
                  disabled={dashboards.length === 0}
                  onClick={() => setAddPickerFor({ folderId: folder.id, kind: "dashboard" })}
                >
                  <LayoutDashboard size={13} aria-hidden="true" /> Add dashboard
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-rail-thread-menu-item"
                  disabled={viewableObjects.length === 0}
                  onClick={() => setAddPickerFor({ folderId: folder.id, kind: "view" })}
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
            )}
          </div>
        </div>
        {!collapsed && (
          <ul className="workspace-rail-folder-items" role="list">
            {items.length === 0 ? (
              <li className="workspace-rail-folder-empty">Empty folder — use ⋯ to add a dashboard or view.</li>
            ) : (
              items.map((item) => renderItemRow(folder, item))
            )}
          </ul>
        )}
      </li>
    );
  };

  const picker = addPickerFor ? (
    <div className="workspace-rail-folder-picker-backdrop" onClick={() => setAddPickerFor(null)}>
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
                    <LayoutDashboard size={13} aria-hidden="true" />
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
                    <TableIcon size={13} aria-hidden="true" />
                    <span>{o.label}</span>
                    <span className="workspace-rail-folder-picker-hint">{o.columns.length} field{o.columns.length === 1 ? "" : "s"}</span>
                  </button>
                </li>
              ))}
        </ul>
      </div>
    </div>
  ) : null;

  return (
    <div className="workspace-rail-folders" aria-label="Custom folders">
      <div className="workspace-rail-folders-head">
        <span className="workspace-rail-section-label">Folders</span>
        <button
          type="button"
          className="workspace-rail-folders-add-btn"
          aria-label="Create folder"
          title="New folder"
          onClick={() => { setCreating(true); setCreateDraft(""); }}
        >
          <FolderPlus size={13} aria-hidden="true" />
        </button>
      </div>
      {creating && (
        <div className="workspace-rail-folder-create">
          <Plus size={12} aria-hidden="true" />
          <input
            autoFocus
            className="workspace-rail-thread-rename"
            value={createDraft}
            onChange={(e) => setCreateDraft(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); createFolder(); }
              if (e.key === "Escape") { setCreating(false); setCreateDraft(""); }
            }}
            onBlur={createFolder}
          />
        </div>
      )}
      {rows.length === 0 && !creating ? (
        <p className="workspace-rail-folders-empty">
          No folders yet. Create one to organize dashboards and table views.
        </p>
      ) : (
        <ul className="workspace-rail-folders-list" role="list">
          {rows.map(renderFolder)}
        </ul>
      )}
      {picker}
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
    <aside className="workspace-rail" aria-label="Workspace navigation">
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
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={13} />
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
