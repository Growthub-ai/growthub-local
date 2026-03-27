import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ticketsApi } from "../api/tickets";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Ticket, Plus, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { NewTicketModal } from "../components/NewTicketModal";
import type { Ticket as TicketType } from "@paperclipai/shared";

// ─── Palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  { dot: "bg-violet-500", badge: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
  { dot: "bg-blue-500",   badge: "text-blue-500 bg-blue-500/10 border-blue-500/20"       },
  { dot: "bg-amber-500",  badge: "text-amber-500 bg-amber-500/10 border-amber-500/20"   },
  { dot: "bg-orange-500", badge: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  { dot: "bg-green-500",  badge: "text-green-500 bg-green-500/10 border-green-500/20"   },
  { dot: "bg-pink-500",   badge: "text-pink-500 bg-pink-500/10 border-pink-500/20"       },
  { dot: "bg-cyan-500",   badge: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20"       },
];
function sl(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function sp(s: string, order: string[]) {
  const i = order.indexOf(s);
  return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
}

// ─── Stage pipeline dots ──────────────────────────────────────────────────────
function StagePipeline({ ticket }: { ticket: TicketType }) {
  const stages = ticket.stageOrder;
  const currentIdx = stages.indexOf(ticket.currentStage);
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {stages.map((stage, i) => {
        const p = sp(stage, stages);
        return (
          <div key={stage} className="flex items-center gap-0.5">
            {i > 0 && <div className={cn("h-px w-3", i <= currentIdx ? "bg-green-500/50" : "bg-border")} />}
            <div className={cn(
              "h-2 w-2 rounded-full",
              i < currentIdx && "bg-green-500/70",
              i === currentIdx && p.dot,
              i > currentIdx && "bg-border",
            )} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Ticket row ───────────────────────────────────────────────────────────────
function TicketRow({
  ticket, liveCount,
}: {
  ticket: TicketType;
  liveCount: number;
}) {
  const p = sp(ticket.currentStage, ticket.stageOrder);
  const isClosed = ticket.status === "done" || ticket.status === "cancelled";

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-accent/50 transition-colors no-underline text-inherit group"
    >
      <StagePipeline ticket={ticket} />

      <span className={cn("flex-1 truncate font-medium", isClosed && "text-muted-foreground line-through decoration-muted-foreground/40")}>
        {ticket.title}
      </span>

      {/* Live agent count */}
      {liveCount > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 font-medium shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500" />
          </span>
          {liveCount} live
        </span>
      )}

      {/* Closed icon */}
      {isClosed && (
        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      )}

      {/* Stage badge */}
      <span className={cn("text-xs border rounded px-1.5 py-0.5 shrink-0", p.badge)}>
        {sl(ticket.currentStage)}
      </span>

      <span className="text-xs font-mono text-muted-foreground/50 shrink-0">{ticket.identifier}</span>

      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function Tickets() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => { setBreadcrumbs([{ label: "Tickets" }]); }, [setBreadcrumbs]);

  const { data: tickets, isLoading } = useQuery({
    queryKey: queryKeys.tickets.list(selectedCompanyId!),
    queryFn: () => ticketsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  const { data: liveRuns = [] } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, 100),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  // Map ticketId → live agent count (need issue→ticket mapping)
  // We approximate: count live runs whose issueId belongs to issues in this ticket
  // This is best-effort without a full join; tickets w/ live runs will show counts
  // if the server returns issueTicketId on the run (or we filter by issue list).
  // For now we use issue → ticketId field on the run if available.
  const liveCountByTicketId = useMemo(() => {
    const map = new Map<string, number>();
    for (const run of liveRuns) {
      if ((run.status !== "running" && run.status !== "queued")) continue;
      // LiveRunForIssue may have a ticketId field if server returns it
      const tid = (run as { ticketId?: string }).ticketId;
      if (tid) map.set(tid, (map.get(tid) ?? 0) + 1);
    }
    return map;
  }, [liveRuns]);

  if (isLoading) return <PageSkeleton variant="list" />;

  const active = tickets?.filter((t) => t.status === "active") ?? [];
  const closed = tickets?.filter((t) => t.status !== "active") ?? [];
  const liveTotal = active.reduce((sum, t) => sum + (liveCountByTicketId.get(t.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tickets</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {active.length} active
            {liveTotal > 0 && (
              <span className="ml-2 text-cyan-600 dark:text-cyan-400 font-medium">
                · {liveTotal} agent{liveTotal !== 1 ? "s" : ""} live
              </span>
            )}
            {closed.length > 0 && ` · ${closed.length} closed`}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Ticket
        </Button>
      </div>

      <NewTicketModal
        open={creating}
        onClose={() => setCreating(false)}
        companyId={selectedCompanyId!}
        onSuccess={(id) => { setCreating(false); window.location.href = `/tickets/${id}`; }}
      />

      {!tickets || tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          message="No tickets yet. Create one to group issues across your agent pipeline."
          action="New Ticket"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="space-y-5">
          {/* Active */}
          {active.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active</p>
              <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
                {active.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    liveCount={liveCountByTicketId.get(t.id) ?? 0}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Closed (collapsed by default) */}
          {closed.length > 0 && (
            <div>
              <button
                onClick={() => setShowClosed((s) => !s)}
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
              >
                {showClosed ? "▾" : "▸"} Closed ({closed.length})
              </button>
              {showClosed && (
                <div className="border border-border divide-y divide-border overflow-hidden rounded-lg opacity-60">
                  {closed.map((t) => (
                    <TicketRow key={t.id} ticket={t} liveCount={0} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
