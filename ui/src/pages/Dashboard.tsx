import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { ticketsApi } from "../api/tickets";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import {
  Bot, CircleDot, DollarSign, ShieldCheck, LayoutDashboard, PauseCircle,
  LayoutGrid, List, CalendarDays, ArrowRight, Plus,
} from "lucide-react";
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import { NewTicketModal } from "../components/NewTicketModal";
import {
  formatTicketStageLabel,
  getTicketStageDefinition,
  normalizeTicketStageDefinitions,
  type Agent,
  type Issue,
  type Ticket as TicketType,
} from "@paperclipai/shared";
import { PluginSlotOutlet } from "@/plugins/slots";

// ─── Ticket Command Center helpers ────────────────────────────────────────────
function tcL(s: string) { return formatTicketStageLabel(s); }

function ticketStageLabel(ticket: TicketType, stage: string) {
  const stageDefinitions = normalizeTicketStageDefinitions({
    stageDefinitions: ticket.stageDefinitions,
    stageOrder: ticket.stageOrder,
  });
  return getTicketStageDefinition(stageDefinitions, stage)?.label ?? tcL(stage);
}

function collectiveStageLabel(tickets: TicketType[], stage: string) {
  const owner = tickets.find((ticket) => ticket.stageOrder.includes(stage) || ticket.currentStage === stage);
  return owner ? ticketStageLabel(owner, stage) : tcL(stage);
}

// Build canonical stage ordering from union of all tickets' stageOrder arrays
function uniqStages(tickets: TicketType[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tickets) {
    for (const s of t.stageOrder) {
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  // Also add any currentStage not already in stageOrder arrays
  for (const t of tickets) {
    if (!seen.has(t.currentStage)) { seen.add(t.currentStage); out.push(t.currentStage); }
  }
  return out;
}

// ─── Ticket card used in Kanban ───────────────────────────────────────────────
function TicketKanbanCard({ ticket }: { ticket: TicketType; stageOrder: string[] }) {
  const currentIdx = ticket.stageOrder.indexOf(ticket.currentStage);
  const progress = ticket.stageOrder.length > 1
    ? Math.round((currentIdx / (ticket.stageOrder.length - 1)) * 100)
    : 0;

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="block rounded-lg border border-border bg-card p-3 hover:border-primary/30 hover:shadow-sm transition-all no-underline text-inherit group"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium leading-snug line-clamp-2 flex-1">{ticket.title}</p>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-muted-foreground">{ticket.identifier}</span>
        <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
          {ticketStageLabel(ticket, ticket.currentStage)}
        </span>
      </div>

      {/* Stage pipeline mini-dots */}
      {ticket.stageOrder.length > 1 && (
        <div className="flex items-center gap-0.5 mb-2">
          {ticket.stageOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-0.5">
              {i > 0 && <div className={cn("h-px w-2", i <= currentIdx ? "bg-primary/40" : "bg-border")} />}
              <div className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i < currentIdx && "bg-primary/50",
                i === currentIdx && "bg-primary",
                i > currentIdx && "bg-border",
              )} />
            </div>
          ))}
          <span className="text-[10px] text-muted-foreground ml-1.5">
            {currentIdx + 1}/{ticket.stageOrder.length}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {ticket.stageOrder.length > 1 && (
        <div className="h-1 rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </Link>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────
function KanbanView({ tickets, stageOrder }: { tickets: TicketType[]; stageOrder: string[] }) {
  const byStage = useMemo(() => {
    const map = new Map<string, TicketType[]>();
    for (const s of stageOrder) map.set(s, []);
    for (const t of tickets) {
      const col = map.get(t.currentStage) ?? [];
      col.push(t);
      map.set(t.currentStage, col);
    }
    return map;
  }, [tickets, stageOrder]);

  if (stageOrder.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 border border-dashed border-border rounded-lg">
        <p className="text-sm text-muted-foreground">No active tickets. <Link to="/tickets" className="underline">Create one</Link></p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {stageOrder.map((stage) => {
          const cols = byStage.get(stage) ?? [];
          return (
            <div key={stage} className="w-64 shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{collectiveStageLabel(tickets, stage)}</span>
                <span className="text-xs text-muted-foreground ml-auto">{cols.length}</span>
              </div>
              <div className="space-y-2">
                {cols.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Empty</p>
                  </div>
                ) : (
                  cols.map((t) => <TicketKanbanCard key={t.id} ticket={t} stageOrder={stageOrder} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────
function ListView({ tickets, stageOrder }: { tickets: TicketType[]; stageOrder: string[] }) {
  if (tickets.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 border border-dashed border-border rounded-lg">
        <p className="text-sm text-muted-foreground">No active tickets. <Link to="/tickets" className="underline">Create one</Link></p>
      </div>
    );
  }
  const sorted = [...tickets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return (
    <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
      {sorted.map((t) => {
        const cur = t.stageOrder.indexOf(t.currentStage);
        const progress = t.stageOrder.length > 1 ? cur + 1 : 1;
        return (
          <Link
            key={t.id}
            to={`/tickets/${t.id}`}
            className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/50 transition-colors no-underline text-inherit"
          >
            {/* Stage pipeline dots */}
            <div className="flex items-center gap-0.5 shrink-0">
              {t.stageOrder.map((s, i) => (
                <div key={s} className="flex items-center gap-0.5">
                  {i > 0 && <div className={cn("h-px w-2", i <= cur ? "bg-primary/40" : "bg-border")} />}
                  <div className={cn("h-1.5 w-1.5 rounded-full",
                    i < cur && "bg-primary/50",
                    i === cur && "bg-primary",
                    i > cur && "bg-border",
                  )} />
                </div>
              ))}
            </div>

            <span className="flex-1 truncate font-medium">{t.title}</span>

            <span className="text-xs text-muted-foreground shrink-0">
              {progress}/{t.stageOrder.length} stages
            </span>

            <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
              {ticketStageLabel(t, t.currentStage)}
            </span>

            <span className="text-xs text-muted-foreground shrink-0">{timeAgo(t.updatedAt)}</span>

            <span className="text-xs font-mono text-muted-foreground shrink-0">{t.identifier}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

// ─── Roadmap view ──────────────────────────────────────────────────────────────
type RoadmapScale = "week" | "month";

function RoadmapView({ tickets, stageOrder }: { tickets: TicketType[]; stageOrder: string[] }) {
  const [scale, setScale] = useState<RoadmapScale>("week");
  const today = new Date();

  // Week view: 7 columns = Mon–Sun of the current week
  function WeekView() {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
    const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const todayKey = dayKey(today);
    const byDay = new Map<string, TicketType[]>();
    for (const d of days) byDay.set(dayKey(d), []);
    for (const t of tickets) {
      const k = dayKey(new Date(t.updatedAt));
      if (byDay.has(k)) byDay.get(k)!.push(t);
    }
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const k = dayKey(d);
          const isToday = k === todayKey;
          const cols = byDay.get(k) ?? [];
          return (
            <div key={k} className="min-h-[120px]">
              <div className={cn(
                "text-center py-1.5 mb-2 rounded text-xs font-medium",
                isToday ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}>
                <div>{DAY_SHORT[d.getDay()]}</div>
                <div className={cn("font-semibold tabular-nums", isToday && "text-primary")}>{d.getDate()}</div>
              </div>
              <div className="space-y-1">
                {cols.map((t) => (
                  <Link key={t.id} to={`/tickets/${t.id}`}
                    className="block rounded border border-border bg-card px-2 py-1.5 hover:border-primary/30 transition-colors no-underline text-inherit"
                  >
                    <p className="text-[11px] font-medium truncate leading-snug">{t.title}</p>
                    <span className="text-[10px] text-muted-foreground truncate">{ticketStageLabel(t, t.currentStage)}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Month view: full month grid
  function MonthView() {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // day of week first day falls on
    const totalDays = lastDay.getDate();
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const todayKey = dayKey(today);
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const DAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    // Build map of day number → tickets
    const byDayNum = new Map<number, TicketType[]>();
    for (let i = 1; i <= totalDays; i++) byDayNum.set(i, []);
    for (const t of tickets) {
      const d = new Date(t.updatedAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        byDayNum.get(d.getDate())?.push(t);
      }
    }

    const cells: (number | null)[] = [
      ...Array(startPad).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-3">
          {MONTH_NAMES[month]} {year}
        </p>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {DAY_SHORT.map((d) => (
            <div key={d} className="bg-background text-center text-[10px] font-medium text-muted-foreground py-1.5">
              {d}
            </div>
          ))}
          {cells.map((dayNum, idx) => {
            if (!dayNum) {
              return <div key={`pad-${idx}`} className="bg-background h-20" />;
            }
            const cellDate = new Date(year, month, dayNum);
            const k = dayKey(cellDate);
            const isToday = k === todayKey;
            const items = byDayNum.get(dayNum) ?? [];
            return (
              <div key={dayNum} className={cn("bg-background h-20 p-1 overflow-hidden", isToday && "bg-primary/5")}>
                <span className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium mb-0.5",
                  isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}>
                  {dayNum}
                </span>
                <div className="space-y-0.5">
                  {items.slice(0, 2).map((t) => (
                    <Link key={t.id} to={`/tickets/${t.id}`}
                      className="block rounded px-1 py-0.5 text-[10px] truncate font-medium no-underline border border-border bg-card text-foreground hover:border-primary/30 transition-colors"
                    >
                      {t.title}
                    </Link>
                  ))}
                  {items.length > 2 && (
                    <span className="text-[9px] text-muted-foreground pl-1">+{items.length - 2} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Week / Month toggle */}
      <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden w-fit">
        {(["week", "month"] as RoadmapScale[]).map((s) => (
          <button
            key={s}
            onClick={() => setScale(s)}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors capitalize",
              scale === s ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {scale === "week" ? <WeekView /> : <MonthView />}
    </div>
  );
}

// ─── Ticket Command Center panel ──────────────────────────────────────────────
type TicketViewMode = "kanban" | "list" | "roadmap";

function TicketCommandCenter({ companyId }: { companyId: string }) {
  const [view, setView] = useState<TicketViewMode>("kanban");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const { data: tickets, isLoading } = useQuery({
    queryKey: queryKeys.tickets.list(companyId),
    queryFn: () => ticketsApi.list(companyId),
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const activeTickets = useMemo(() => (tickets ?? []).filter((t) => t.status === "active"), [tickets]);
  const stageOrder = useMemo(() => uniqStages(activeTickets), [activeTickets]);

  const VIEWS: { id: TicketViewMode; label: string; icon: React.ElementType }[] = [
    { id: "kanban",   label: "Kanban",   icon: LayoutGrid },
    { id: "list",     label: "List",     icon: List },
    { id: "roadmap", label: "Roadmap", icon: CalendarDays },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Tickets
          </h2>
          {tickets !== undefined && (
            <span className="text-xs text-muted-foreground">
              {activeTickets.length} active
              {(tickets.length - activeTickets.length) > 0 && ` · ${tickets.length - activeTickets.length} closed`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors",
                    view === v.id
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  title={v.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowNewTicket(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent/50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Ticket</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-lg bg-accent/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {view === "kanban" && <KanbanView tickets={activeTickets} stageOrder={stageOrder} />}
          {view === "list" && <ListView tickets={activeTickets} stageOrder={stageOrder} />}
          {view === "roadmap" && <RoadmapView tickets={tickets ?? []} stageOrder={stageOrder} />}
        </>
      )}

      <NewTicketModal open={showNewTicket} onClose={() => setShowNewTicket(false)} companyId={companyId} />
    </div>
  );
}

// ─── Recent Issues helpers ─────────────────────────────────────────────────────
function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    retry: false,
    staleTime: 30_000,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="space-y-6">
      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You have no agents.
            </p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            Create one here
          </button>
        </div>
      )}


      {/* ── Ticket Command Center ── */}
      <TicketCommandCenter companyId={selectedCompanyId!} />

      {data && (
        <>
          {data.budgets.activeIncidents > 0 ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-[linear-gradient(180deg,rgba(255,80,80,0.12),rgba(255,255,255,0.02))] px-4 py-3">
              <div className="flex items-start gap-2.5">
                <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <div>
                  <p className="text-sm font-medium text-red-50">
                    {data.budgets.activeIncidents} active budget incident{data.budgets.activeIncidents === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-red-100/70">
                    {data.budgets.pausedAgents} agents paused · {data.budgets.pausedProjects} projects paused · {data.budgets.pendingApprovals} pending budget approvals
                  </p>
                </div>
              </div>
              <Link to="/costs" className="text-sm underline underline-offset-2 text-red-100">
                Open budgets
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-1 sm:gap-2">
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label="Agents Enabled"
              to="/agents"
              description={
                <span>
                  {data.agents.running} running{", "}
                  {data.agents.paused} paused{", "}
                  {data.agents.error} errors
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Tasks In Progress"
              to="/issues"
              description={
                <span>
                  {data.tasks.open} open{", "}
                  {data.tasks.blocked} blocked
                </span>
              }
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label="Month Spend"
              to="/costs"
              description={
                <span>
                  {data.costs.monthBudgetCents > 0
                    ? `${data.costs.monthUtilizationPercent}% of ${formatCents(data.costs.monthBudgetCents)} budget`
                    : "Unlimited budget"}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals + data.budgets.pendingApprovals}
              label="Pending Approvals"
              to="/approvals"
              description={
                <span>
                  {data.budgets.pendingApprovals > 0
                    ? `${data.budgets.pendingApprovals} budget overrides awaiting board review`
                    : "Awaiting board review"}
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ChartCard title="Run Activity" subtitle="Last 14 days">
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title="Issues by Priority" subtitle="Last 14 days">
              <PriorityChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title="Issues by Status" subtitle="Last 14 days">
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title="Success Rate" subtitle="Last 14 days">
              <SuccessRateChart runs={runs ?? []} />
            </ChartCard>
          </div>

          <PluginSlotOutlet
            slotTypes={["dashboardWidget"]}
            context={{ companyId: selectedCompanyId }}
            className="grid gap-4 md:grid-cols-2"
            itemClassName="rounded-lg border bg-card p-4 shadow-sm"
          />

          <div className="grid md:grid-cols-2 gap-4">
            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Recent Activity
                </h3>
                <div className="border border-border divide-y divide-border overflow-hidden">
                  {recentActivity.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      agentMap={agentMap}
                      entityNameMap={entityNameMap}
                      entityTitleMap={entityTitleMap}
                      className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Tasks */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Recent Tasks
              </h3>
              {recentIssues.length === 0 ? (
                <div className="border border-border p-4">
                  <p className="text-sm text-muted-foreground">No tasks yet.</p>
                </div>
              ) : (
                <div className="border border-border divide-y divide-border overflow-hidden">
                  {recentIssues.slice(0, 10).map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                    >
                      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                        {/* Status icon - left column on mobile */}
                        <span className="shrink-0 sm:hidden">
                          <StatusIcon status={issue.status} />
                        </span>

                        {/* Right column on mobile: title + metadata stacked */}
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                          <span className="line-clamp-2 text-sm sm:order-2 sm:flex-1 sm:min-w-0 sm:line-clamp-none sm:truncate">
                            {issue.title}
                          </span>
                          <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                            <span className="hidden sm:inline-flex"><PriorityIcon priority={issue.priority} /></span>
                            <span className="hidden sm:inline-flex"><StatusIcon status={issue.status} /></span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {issue.identifier ?? issue.id.slice(0, 8)}
                            </span>
                            {issue.assigneeAgentId && (() => {
                              const name = agentName(issue.assigneeAgentId);
                              return name
                                ? <span className="hidden sm:inline-flex"><Identity name={name} size="sm" /></span>
                                : null;
                            })()}
                            <span className="text-xs text-muted-foreground sm:hidden">&middot;</span>
                            <span className="text-xs text-muted-foreground shrink-0 sm:order-last">
                              {timeAgo(issue.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
