import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "../api/tickets";
import { issuesApi } from "../api/issues";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import {
  ArrowRight, Check, ChevronLeft, ChevronRight, Plus, Zap, X,
  Pencil, Trash2, CheckCircle2, MoreHorizontal, Square,
  Play, Loader2, ChevronsRight, ChevronDown, ChevronUp, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, relativeTime } from "../lib/utils";
import { StatusIcon } from "../components/StatusIcon";
import { PageSkeleton } from "../components/PageSkeleton";
import { Link } from "@/lib/router";
import { RunTranscriptView } from "../components/transcript/RunTranscriptView";
import { useLiveRunTranscripts } from "../components/transcript/useLiveRunTranscripts";
import type { LiveRunForIssue } from "../api/heartbeats";
import type { Ticket as TicketType } from "@paperclipai/shared";

// ─── Palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  { dot: "bg-violet-500", ring: "ring-violet-500/30", text: "text-violet-500" },
  { dot: "bg-blue-500",   ring: "ring-blue-500/30",   text: "text-blue-500"   },
  { dot: "bg-amber-500",  ring: "ring-amber-500/30",  text: "text-amber-500"  },
  { dot: "bg-orange-500", ring: "ring-orange-500/30", text: "text-orange-500" },
  { dot: "bg-green-500",  ring: "ring-green-500/30",  text: "text-green-500"  },
  { dot: "bg-pink-500",   ring: "ring-pink-500/30",   text: "text-pink-500"   },
  { dot: "bg-cyan-500",   ring: "ring-cyan-500/30",   text: "text-cyan-500"   },
];
function pal(stage: string, order: string[]) {
  const i = order.indexOf(stage);
  return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
}
function sl(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── InlineEdit ───────────────────────────────────────────────────────────────
function InlineEdit({
  value, onSave, className, multiline, placeholder,
}: {
  value: string; onSave: (v: string) => void;
  className?: string; multiline?: boolean; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  function commit() {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    setEditing(false);
  }
  if (!editing) return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className={cn("group text-left hover:bg-accent/40 rounded px-1 -mx-1 transition-colors cursor-text flex items-start gap-1 w-full", className)}
    >
      <span className={cn(!value && "text-muted-foreground/40 italic")}>{value || placeholder || "Click to edit…"}</span>
      <Pencil className="h-3 w-3 mt-0.5 opacity-0 group-hover:opacity-40 shrink-0 transition-opacity" />
    </button>
  );
  const shared = {
    ref, value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
      if (e.key === "Escape") setEditing(false);
    },
    className: cn("w-full bg-background border border-border rounded px-2 py-1 outline-none text-inherit resize-none", className),
  };
  return multiline
    ? <textarea {...shared as React.TextareaHTMLAttributes<HTMLTextAreaElement>} rows={3} />
    : <input {...shared as React.InputHTMLAttributes<HTMLInputElement>} />;
}

// ─── ConfirmButton ────────────────────────────────────────────────────────────
function ConfirmButton({ onConfirm, children, confirmLabel = "Confirm", danger = false, className }: {
  onConfirm: () => void; children: React.ReactNode;
  confirmLabel?: string; danger?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className={className}>{children}</button>;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => { setOpen(false); onConfirm(); }}
        className={cn("text-xs px-2 py-0.5 rounded border font-medium",
          danger ? "border-red-500/40 text-red-500 hover:bg-red-500/10" : "border-border text-foreground hover:bg-accent")}
      >{confirmLabel}</button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type IssueRow = {
  id: string; identifier: string | null; title: string; status: string;
  ticketStage: string | null; assigneeAgentId?: string | null;
};

const STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress", in_progress: "done", done: "todo",
  backlog: "todo", in_review: "done", blocked: "todo",
};

// ─── TaskRow ──────────────────────────────────────────────────────────────────
function TaskRow({
  issue, agents, activeRun, isDispatching,
  transcript, hasOutput,
  onDispatch, onStop, onUpdateIssue, onDeleteIssue,
  stages, currentStage,
}: {
  issue: IssueRow;
  agents: { id: string; name: string }[];
  activeRun: LiveRunForIssue | undefined;
  isDispatching: boolean;
  transcript: import("../adapters").TranscriptEntry[];
  hasOutput: boolean;
  onDispatch: (agentId: string) => void;
  onStop: (runId: string) => void;
  onUpdateIssue: (patch: Record<string, unknown>) => void;
  onDeleteIssue: () => void;
  stages: string[];
  currentStage: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLive = !!activeRun;
  const canRun = !isLive && !isDispatching;

  // Auto-expand when agent goes live
  useEffect(() => {
    if (isLive) setExpanded(true);
  }, [isLive]);

  const assignedAgent = agents.find((a) => a.id === issue.assigneeAgentId);

  return (
    <div className={cn(
      "transition-colors",
      isLive ? "bg-cyan-500/[0.03] border-l-2 border-l-cyan-500/40" : "hover:bg-accent/20",
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status cycle */}
        <button
          onClick={() => onUpdateIssue({ status: STATUS_CYCLE[issue.status] ?? "todo" })}
          title={`${issue.status} — click to cycle`}
          className="shrink-0 hover:scale-110 transition-transform"
        >
          <StatusIcon status={issue.status} />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={issue.title}
            onSave={(v) => onUpdateIssue({ title: v })}
            className="text-sm font-medium"
          />
        </div>

        {/* Live indicator + stop */}
        {isLive && activeRun && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1.5 text-[11px] text-cyan-600 dark:text-cyan-400 font-medium hover:underline"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500" />
              </span>
              {activeRun.agentName} · {relativeTime(activeRun.createdAt)}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <button
              onClick={() => onStop(activeRun.id)}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 transition-colors"
            >
              <Square className="h-2.5 w-2.5 fill-current" /> Stop
            </button>
          </div>
        )}

        {/* Run button */}
        {canRun && issue.assigneeAgentId && (
          <button
            onClick={() => onDispatch(issue.assigneeAgentId!)}
            disabled={isDispatching}
            className="flex items-center gap-1 text-[11px] font-medium text-foreground border border-border hover:bg-accent rounded-md px-2 py-1 transition-colors shrink-0"
            title={`Run with ${assignedAgent?.name ?? "agent"}`}
          >
            {isDispatching
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
              : <><Play className="h-3 w-3 fill-current" /> Run</>
            }
          </button>
        )}

        {/* Link */}
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          className="text-xs font-mono text-muted-foreground/40 shrink-0 hover:text-foreground transition-colors"
        >
          {issue.identifier ?? issue.id.slice(0, 8)}
        </Link>

        {/* Delete */}
        <ConfirmButton
          onConfirm={onDeleteIssue}
          confirmLabel="Delete" danger
          className="shrink-0 text-muted-foreground/30 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>

      {/* Agent selector row */}
      <div className="flex items-center gap-2 px-4 pb-2.5 pl-11">
        <span className="text-[11px] text-muted-foreground/50 shrink-0">Agent</span>
        <select
          value={issue.assigneeAgentId ?? ""}
          onChange={(e) => onUpdateIssue({ assigneeAgentId: e.target.value || null })}
          className="text-xs bg-background border border-border rounded px-2 py-0.5 outline-none text-foreground cursor-pointer max-w-[240px]"
        >
          <option value="">— Unassigned —</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {canRun && !issue.assigneeAgentId && (
          <span className="text-[11px] text-muted-foreground/40">← assign then Run</span>
        )}
        {issue.assigneeAgentId && canRun && (
          <button
            onClick={() => onDispatch(issue.assigneeAgentId!)}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors"
          >
            <Play className="h-2.5 w-2.5 fill-current" /> Run
          </button>
        )}
      </div>

      {/* Live transcript (expandable) */}
      {expanded && (
        <div className="mx-4 mb-3 rounded-lg border border-cyan-500/20 bg-background/60 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground">Live output</span>
            <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-3">
            <RunTranscriptView
              entries={transcript}
              density="compact"
              limit={12}
              streaming={isLive}
              collapseStdout
              thinkingClassName="!text-[10px] !leading-4"
              emptyMessage={
                hasOutput ? "Parsing output…" :
                isLive ? "Waiting for agent output…" :
                "No transcript captured."
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StageSettingsMenu ───────────────────────────────────────────────────────
function StageSettingsMenu({
  stage, stages, currentIdx, isLast,
  dispatchableCount, liveCount, advancing, runningAll,
  onRename, onGoBack, onAdvance, onRunAll, onStopAll, onDelete,
}: {
  stage: string; stages: string[]; currentIdx: number; isLast: boolean;
  dispatchableCount: number; liveCount: number; advancing: boolean; runningAll: boolean;
  onRename: (newName: string) => void;
  onGoBack: () => void; onAdvance: () => void;
  onRunAll: () => void; onStopAll: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) { setOpen(false); setRenaming(false); }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close() { setOpen(false); setRenaming(false); }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => { setOpen((o) => !o); setRenaming(false); }}
        className="flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-accent transition-colors"
        title="Stage settings"
      >
        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-border bg-popover shadow-xl py-1 text-sm"
        >
          {renaming ? (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rename stage</p>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) { onRename(draft.trim()); close(); }
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => { if (draft.trim()) { onRename(draft.trim()); close(); } }}
                  className="text-xs px-2.5 py-1 rounded border border-border hover:bg-accent font-medium"
                >Save</button>
                <button onClick={() => setRenaming(false)} className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setDraft(sl(stage)); setRenaming(true); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent text-left"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Rename stage
            </button>
          )}

          {!renaming && currentIdx > 0 && (
            <button
              onClick={() => { onGoBack(); close(); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent text-left"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Go back a stage
            </button>
          )}

          {!renaming && !isLast && (
            <button
              onClick={() => { onAdvance(); close(); }}
              disabled={advancing}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent text-left disabled:opacity-50"
            >
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Advance to {sl(stages[currentIdx + 1])}
            </button>
          )}

          {!renaming && dispatchableCount > 0 && (
            <button
              onClick={() => { onRunAll(); close(); }}
              disabled={runningAll}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent text-left disabled:opacity-50"
            >
              <ChevronsRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Run all tasks ({dispatchableCount})
            </button>
          )}

          {!renaming && liveCount > 0 && (
            <button
              onClick={() => { onStopAll(); close(); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent text-left"
            >
              <Square className="h-3.5 w-3.5 fill-current text-muted-foreground shrink-0" /> Stop all agents
            </button>
          )}

          {!renaming && stages.length > 1 && <div className="border-t border-border my-1" />}

          {!renaming && stages.length > 1 && (
            <div className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-red-500/10 text-red-500 cursor-pointer">
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
              <ConfirmButton onConfirm={() => { onDelete(); close(); }} confirmLabel="Delete" danger className="text-red-500 text-sm">
                Delete stage…
              </ConfirmButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SpawnForm ────────────────────────────────────────────────────────────────
function SpawnForm({
  agents, spawning,
  onSubmit, onCancel,
}: {
  agents: { id: string; name: string }[];
  spawning: boolean;
  onSubmit: (title: string, agentId: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");

  return (
    <div className="mx-4 mb-3 rounded-lg border border-border bg-background p-3 space-y-3">
      <input
        autoFocus
        placeholder="Task title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) onSubmit(title.trim(), agentId);
          if (e.key === "Escape") onCancel();
        }}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 border-b border-border pb-2"
      />
      <div className="flex items-center gap-2">
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="flex-1 text-xs bg-background border border-border rounded-md px-2 py-1.5 outline-none"
        >
          <option value="">— No agent —</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Button
          size="sm"
          disabled={!title.trim() || spawning}
          onClick={() => onSubmit(title.trim(), agentId)}
          className="gap-1.5 shrink-0"
        >
          {spawning
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
            : agentId
              ? <><Play className="h-3.5 w-3.5" /> Create & Run</>
              : <><Plus className="h-3.5 w-3.5" /> Create</>
          }
        </Button>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      {agentId && (
        <p className="text-[11px] text-muted-foreground/40">Agent will be dispatched immediately after creation.</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [spawnStage, setSpawnStage] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tickets.detail(ticketId!),
    queryFn: () => ticketsApi.get(selectedCompanyId!, ticketId!),
    enabled: !!selectedCompanyId && !!ticketId,
    refetchInterval: 6000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns = [] } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, 50),
    enabled: !!selectedCompanyId,
    refetchInterval: 3000,
  });

  const ticket = data as (typeof data & { issues?: IssueRow[] }) | undefined;

  // ── Live transcripts for ALL runs touching this ticket ──
  const ticketRunIds = new Set(
    (ticket?.issues ?? []).flatMap((i) =>
      liveRuns.filter((r) => r.issueId === i.id).map((r) => r.id)
    )
  );
  const relevantRuns = liveRuns.filter(
    (r) => ticketRunIds.has(r.id) && (r.status === "running" || r.status === "queued")
  );
  const { transcriptByRun, hasOutputForRun } = useLiveRunTranscripts({
    runs: relevantRuns,
    companyId: selectedCompanyId!,
    maxChunksPerRun: 150,
  });

  // ── Helpers ──
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list(selectedCompanyId!) });
  }
  function patchListCache(updater: (old: TicketType[]) => TicketType[]) {
    queryClient.setQueryData<TicketType[]>(
      queryKeys.tickets.list(selectedCompanyId!),
      (old) => updater(old ?? []),
    );
  }

  // ── Mutations ──
  const { mutate: updateTicket } = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      ticketsApi.update(selectedCompanyId!, ticketId!, patch),
    onSuccess: (updated) => {
      patchListCache((old) => old.map((t) => (t.id === ticketId ? { ...t, ...updated } : t)));
      invalidate();
    },
  });

  const { mutate: deleteTicket } = useMutation({
    mutationFn: () => ticketsApi.remove(selectedCompanyId!, ticketId!),
    onSuccess: () => {
      patchListCache((old) => old.filter((t) => t.id !== ticketId));
      navigate("/tickets");
    },
  });

  const { mutate: advance, isPending: advancing } = useMutation({
    mutationFn: () => ticketsApi.advanceStage(selectedCompanyId!, ticketId!),
    onSuccess: (updated) => {
      patchListCache((old) => old.map((t) => (t.id === ticketId ? { ...t, ...updated } : t)));
      invalidate();
    },
  });

  const { mutate: spawnAndRun, isPending: spawning } = useMutation({
    mutationFn: async ({ title, agentId, stage }: { title: string; agentId: string; stage: string }) => {
      const issue = await issuesApi.create(selectedCompanyId!, {
        title,
        assigneeAgentId: agentId || undefined,
        ticketId,
        ticketStage: stage,
        status: "todo",
      });
      if (agentId && issue?.id) {
        // Wake agent directly — reliable regardless of issue state
        await agentsApi.wakeup(agentId, {
          source: "assignment",
          triggerDetail: "manual",
          reason: "ticket_task_created",
          payload: { issueId: issue.id },
        });
      }
      return issue;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      setSpawnStage(null);
    },
  });

  const { mutate: updateIssue } = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      issuesApi.update(id, patch),
    onSuccess: invalidate,
  });

  const { mutate: deleteIssue } = useMutation({
    mutationFn: (id: string) => issuesApi.remove(id),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  const { mutate: dispatchIssue } = useMutation({
    mutationFn: async ({ issueId, agentId }: { issueId: string; agentId: string }) => {
      // Ensure issue is assigned to this agent and in a runnable status
      await issuesApi.update(issueId, { assigneeAgentId: agentId, status: "todo" });
      // Wake the agent directly — bypasses checkout status checks
      return agentsApi.wakeup(agentId, {
        source: "assignment",
        triggerDetail: "manual",
        reason: "ticket_dispatch",
        payload: { issueId },
      });
    },
    onMutate: ({ issueId }) => setDispatchingId(issueId),
    onSettled: () => setDispatchingId(null),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
    },
  });

  const { mutate: cancelRun } = useMutation({
    mutationFn: (runId: string) => heartbeatsApi.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
    },
  });

  useEffect(() => {
    if (ticket) setBreadcrumbs([
      { label: "Tickets", href: "/tickets" },
      { label: ticket.identifier ?? ticket.id.slice(0, 8) },
    ]);
  }, [ticket, setBreadcrumbs]);

  if (isLoading || !ticket) return <PageSkeleton variant="detail" />;

  const stages = ticket.stageOrder as string[];
  const currentIdx = stages.indexOf(ticket.currentStage);
  const isLast = currentIdx === stages.length - 1;
  const isClosed = ticket.status === "done" || ticket.status === "cancelled";

  const issuesByStage = stages.reduce<Record<string, IssueRow[]>>((acc, stage) => {
    acc[stage] = (ticket.issues ?? []).filter((i) => i.ticketStage === stage);
    return acc;
  }, {});

  // Map: issueId → active run
  const liveByIssueId = new Map<string, LiveRunForIssue>();
  for (const run of liveRuns) {
    if (!run.issueId) continue;
    if (run.status === "running" || run.status === "queued") {
      if (!liveByIssueId.has(run.issueId)) liveByIssueId.set(run.issueId, run);
    }
  }

  const currentStageIssues = issuesByStage[ticket.currentStage] ?? [];
  const liveCountCurrent = currentStageIssues.filter((i) => liveByIssueId.has(i.id)).length;
  const allCurrentDone = currentStageIssues.length > 0 && currentStageIssues.every((i) => i.status === "done");
  const dispatchableIssues = currentStageIssues.filter(
    (i) => i.assigneeAgentId && !liveByIssueId.has(i.id) && dispatchingId !== i.id
  );

  async function runAll() {
    if (!dispatchableIssues.length) return;
    setRunningAll(true);
    try {
      await Promise.all(dispatchableIssues.map(async (issue) => {
        await issuesApi.update(issue.id, { assigneeAgentId: issue.assigneeAgentId, status: "todo" });
        await agentsApi.wakeup(issue.assigneeAgentId!, {
          source: "assignment",
          triggerDetail: "manual",
          reason: "ticket_run_all",
          payload: { issueId: issue.id },
        });
      }));
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
    } finally {
      setRunningAll(false);
    }
  }

  async function stopAll() {
    const activeRuns = currentStageIssues
      .map((i) => liveByIssueId.get(i.id))
      .filter(Boolean) as LiveRunForIssue[];
    for (const run of activeRuns) {
      await heartbeatsApi.cancel(run.id);
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
  }

  function addStage() {
    const name = newStageName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || stages.includes(name)) return;
    updateTicket({ stageOrder: [...stages, name] });
    setNewStageName(""); setAddingStage(false);
  }

  function removeStage(stage: string) {
    if (stages.length <= 1) return;
    const next = stages.filter((s) => s !== stage);
    updateTicket({
      stageOrder: next,
      currentStage: stage === ticket!.currentStage ? next[0] : ticket!.currentStage,
    });
  }

  function renameStage(oldName: string, newName: string) {
    const cleaned = newName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!cleaned || cleaned === oldName || stages.includes(cleaned)) return;
    updateTicket({
      stageOrder: stages.map((s) => (s === oldName ? cleaned : s)),
      currentStage: ticket!.currentStage === oldName ? cleaned : ticket!.currentStage,
    });
  }

  const currentP = pal(ticket.currentStage, stages);

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-mono text-muted-foreground">{ticket.identifier}</p>
          <InlineEdit value={ticket.title} onSave={(v) => updateTicket({ title: v })} className="text-xl font-semibold" />
          <InlineEdit
            value={ticket.description ?? ""} onSave={(v) => updateTicket({ description: v })}
            className="text-sm text-muted-foreground" multiline placeholder="Add description…"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isClosed && !isLast && (
            <Button size="sm" onClick={() => advance()} disabled={advancing}
              className={cn(allCurrentDone && "ring-2 ring-offset-2 ring-foreground/20")}>
              <ArrowRight className="h-4 w-4 mr-1.5" />
              {sl(stages[currentIdx + 1])}
            </Button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-accent transition-colors"
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-border bg-popover shadow-lg py-1 text-sm">
                  {!isClosed ? (
                    <>
                      <button
                        onClick={() => { setMenuOpen(false); updateTicket({ status: "paused" }); }}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent text-left"
                      >
                        Pause ticket
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); updateTicket({ status: "done" }); }}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent text-left"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Close ticket
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setMenuOpen(false); updateTicket({ status: "active" }); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent text-left"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> Reopen
                    </button>
                  )}
                  <div className="border-t border-border my-1" />
                  <div className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-500/10 text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    <ConfirmButton
                      onConfirm={() => { setMenuOpen(false); deleteTicket(); }}
                      confirmLabel="Delete" danger className="text-red-500 text-sm"
                    >
                      Delete ticket…
                    </ConfirmButton>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Closed banner ── */}
      {isClosed && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-accent/40 px-4 py-2.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground font-medium">
            Ticket {ticket.status === "cancelled" ? "cancelled" : "closed"}
          </span>
          <button onClick={() => updateTicket({ status: "active" })} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">
            Reopen
          </button>
        </div>
      )}

      {/* ── Stage pipeline ── */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {stages.map((stage, i) => {
          const p = pal(stage, stages);
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={stage} className="flex items-center gap-0.5 group/stage">
              {i > 0 && <ChevronRight className="h-3 w-3 text-border mx-0.5 shrink-0" />}
              <div
                onClick={() => stage !== ticket.currentStage && updateTicket({ currentStage: stage })}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer select-none",
                  isCurrent && "border border-border bg-accent",
                  isPast && "text-muted-foreground hover:bg-accent/50",
                  !isCurrent && !isPast && "text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40",
                )}
              >
                {isPast
                  ? <Check className="h-3 w-3 text-muted-foreground shrink-0" />
                  : <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", isCurrent ? p.dot : "bg-border/50")} />
                }
                <span onClick={(e) => e.stopPropagation()}>
                  <InlineEdit value={sl(stage)} onSave={(v) => renameStage(stage, v)} className="text-xs font-medium" />
                </span>
                {stages.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStage(stage); }}
                    className="opacity-0 group-hover/stage:opacity-60 hover:!opacity-100 transition-opacity ml-0.5"
                  ><X className="h-2.5 w-2.5" /></button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add stage */}
        {addingStage ? (
          <div className="flex items-center gap-1 ml-1">
            <ChevronRight className="h-3 w-3 text-border" />
            <input
              autoFocus value={newStageName} onChange={(e) => setNewStageName(e.target.value)}
              placeholder="stage name"
              onKeyDown={(e) => { if (e.key === "Enter") addStage(); if (e.key === "Escape") setAddingStage(false); }}
              className="text-xs bg-background border border-border rounded px-2 py-0.5 outline-none w-24"
            />
            <button onClick={addStage} className="text-xs text-foreground/60 hover:text-foreground px-1">+</button>
            <button onClick={() => setAddingStage(false)} className="text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
          </div>
        ) : (
          <button
            onClick={() => setAddingStage(true)}
            className="ml-2 text-xs text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add stage
          </button>
        )}
      </div>

      {/* ── Active stage panel ── */}
      {(() => {
        const stage = ticket.currentStage;
        const stageIssues = issuesByStage[stage] ?? [];

        return (
          <div className="rounded-xl border border-border bg-card">
            {/* Stage header / controls */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn("h-2 w-2 rounded-full", currentP.dot)} />
                <span className="text-sm font-semibold">{sl(stage)}</span>
                <span className="text-xs text-muted-foreground">— active</span>
                {liveCountCurrent > 0 && (
                  <span className="flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 font-medium">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    </span>
                    {liveCountCurrent} agent{liveCountCurrent !== 1 ? "s" : ""} live
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Back one stage */}
                {currentIdx > 0 && (
                  <button
                    onClick={() => updateTicket({ currentStage: stages[currentIdx - 1] })}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 transition-colors"
                    title="Back one stage"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Stop All */}
                {liveCountCurrent > 0 && (
                  <button
                    onClick={stopAll}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors"
                  >
                    <Square className="h-3 w-3 fill-current" /> Stop all
                  </button>
                )}

                {/* Run All */}
                {dispatchableIssues.length > 0 && (
                  <button
                    onClick={runAll}
                    disabled={runningAll}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-border bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {runningAll
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</>
                      : <><ChevronsRight className="h-3.5 w-3.5" /> Run all ({dispatchableIssues.length})</>
                    }
                  </button>
                )}

                {/* New Task */}
                <button
                  onClick={() => setSpawnStage(spawnStage === stage ? null : stage)}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                >
                  <Zap className="h-3.5 w-3.5" /> New Task
                </button>

                {/* Stage Settings */}
                <StageSettingsMenu
                  stage={stage}
                  stages={stages}
                  currentIdx={currentIdx}
                  isLast={isLast}
                  dispatchableCount={dispatchableIssues.length}
                  liveCount={liveCountCurrent}
                  advancing={advancing}
                  runningAll={runningAll}
                  onRename={(name) => renameStage(stage, name)}
                  onGoBack={() => updateTicket({ currentStage: stages[currentIdx - 1] })}
                  onAdvance={() => advance()}
                  onRunAll={runAll}
                  onStopAll={stopAll}
                  onDelete={() => removeStage(stage)}
                />
              </div>
            </div>

            {/* Spawn form */}
            {spawnStage === stage && (
              <SpawnForm
                agents={agents}
                spawning={spawning}
                onSubmit={(title, agentId) => spawnAndRun({ title, agentId, stage })}
                onCancel={() => setSpawnStage(null)}
              />
            )}

            {/* Task list */}
            {stageIssues.length === 0 && spawnStage !== stage ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground/50 mb-3">No tasks in this stage yet.</p>
                <button
                  onClick={() => setSpawnStage(stage)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-3 py-1.5 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add first task
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {stageIssues.map((issue) => {
                  const activeRun = liveByIssueId.get(issue.id);
                  const runId = activeRun?.id;
                  const transcript = runId ? (transcriptByRun.get(runId) ?? []) : [];
                  const hasOutput = runId ? hasOutputForRun(runId) : false;

                  return (
                    <TaskRow
                      key={issue.id}
                      issue={issue}
                      agents={agents}
                      activeRun={activeRun}
                      isDispatching={dispatchingId === issue.id}
                      transcript={transcript}
                      hasOutput={hasOutput}
                      onDispatch={(agentId) => dispatchIssue({ issueId: issue.id, agentId })}
                      onStop={(runId) => cancelRun(runId)}
                      onUpdateIssue={(patch) => updateIssue({ id: issue.id, patch })}
                      onDeleteIssue={() => deleteIssue(issue.id)}
                      stages={stages}
                      currentStage={stage}
                    />
                  );
                })}
              </div>
            )}

            {/* All done → advance */}
            {allCurrentDone && !isLast && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-green-500/5">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground font-medium flex-1">All tasks done — ready to advance</span>
                <Button size="sm" onClick={() => advance()} disabled={advancing}>
                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                  Advance to {sl(stages[currentIdx + 1])}
                </Button>
              </div>
            )}
            {allCurrentDone && isLast && !isClosed && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-green-500/5">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground font-medium flex-1">All stages complete</span>
                <Button size="sm" onClick={() => updateTicket({ status: "done" })}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Close ticket
                </Button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Completed stages ── */}
      {currentIdx > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wide px-1">Completed</p>
          {stages.slice(0, currentIdx).map((stage) => {
            const stageIssues = issuesByStage[stage] ?? [];
            const doneCount = stageIssues.filter((i) => i.status === "done").length;
            const p = pal(stage, stages);
            return (
              <button key={stage}
                onClick={() => updateTicket({ currentStage: stage })}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border/50 bg-accent/20 text-sm w-full text-left hover:bg-accent/50 transition-colors"
              >
                <Check className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", p.dot)} />
                <span className="font-medium text-muted-foreground">{sl(stage)}</span>
                <span className="text-xs text-muted-foreground/50">
                  {doneCount}/{stageIssues.length} tasks done
                </span>
                <span className="ml-auto text-xs text-muted-foreground/30">revisit →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Upcoming stages ── */}
      {currentIdx < stages.length - 1 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground/30 uppercase tracking-wide px-1">Up next</p>
          {stages.slice(currentIdx + 1).map((stage) => {
            const p = pal(stage, stages);
            const stageIssues = issuesByStage[stage] ?? [];
            return (
              <button key={stage}
                onClick={() => updateTicket({ currentStage: stage })}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border/30 text-sm opacity-40 hover:opacity-70 transition-opacity w-full text-left"
              >
                <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", p.dot)} />
                <span className="font-medium">{sl(stage)}</span>
                {stageIssues.length > 0 && (
                  <span className="text-xs text-muted-foreground/50">{stageIssues.length} task{stageIssues.length !== 1 ? "s" : ""}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground/30">jump ahead →</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
