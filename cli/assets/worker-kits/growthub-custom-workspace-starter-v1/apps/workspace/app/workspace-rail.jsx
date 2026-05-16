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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  Home,
  MessageCircle,
  MessageCirclePlus,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";

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

function getHelperThreadRows(workspaceConfig) {
  const objects = workspaceConfig?.dataModel?.objects || [];
  const ht = objects.find((o) => o?.id === "helper-threads");
  const rows = Array.isArray(ht?.rows) ? ht.rows : [];
  return rows
    .filter((r) => r && !r.archived)
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
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
