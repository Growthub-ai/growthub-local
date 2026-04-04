import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type GtmIssuesCalendarRangeMode = "week" | "month" | "90d";

const RANGE_MODES: { id: GtmIssuesCalendarRangeMode; label: string }[] = [
  { id: "week", label: "Weekly View" },
  { id: "month", label: "Monthly" },
  { id: "90d", label: "90 Day View" },
];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIssueDay(issue: Issue): string | null {
  const raw = issue.updatedAt;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return dayKey(d);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CalendarIssueLinkCard({
  issue,
  issueHref,
  liveIssueIds,
}: {
  issue: Issue;
  issueHref: (issue: Issue) => string;
  liveIssueIds: Set<string>;
}) {
  const live = liveIssueIds.has(issue.id);
  const statusLabel = live ? "Live" : issue.status.replaceAll("_", " ");
  const idLabel = issue.identifier ?? issue.id.slice(0, 8);
  return (
    <Link
      to={issueHref(issue)}
      className={cn(
        "block rounded-md border border-border bg-background px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm",
        "transition-colors hover:border-accent hover:bg-accent/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="block truncate font-medium text-foreground">{issue.title}</span>
      <span className="text-muted-foreground">{statusLabel}</span>
      <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground/90">{idLabel} · {issue.priority}</span>
    </Link>
  );
}

export function GtmIssuesCalendarView({
  issues,
  issueHref,
  liveIssueIds,
}: {
  issues: Issue[];
  issueHref: (issue: Issue) => string;
  liveIssueIds: Set<string>;
}) {
  const [rangeMode, setRangeMode] = useState<GtmIssuesCalendarRangeMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const priorities = useMemo(() => {
    const s = new Set<string>();
    for (const i of issues) {
      s.add(i.priority);
    }
    return Array.from(s).sort();
  }, [issues]);

  const filteredIssues = useMemo(() => {
    if (priorityFilter === "all") return issues;
    return issues.filter((i) => i.priority === priorityFilter);
  }, [issues, priorityFilter]);

  const issueDays = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of filteredIssues) {
      const k = parseIssueDay(issue);
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(issue);
      map.set(k, list);
    }
    return map;
  }, [filteredIssues]);

  const { periodLabel, weeks, minCellHeightClass, dayIssuesMaxHeightClass } = useMemo(() => {
    if (rangeMode === "month") {
      const first = startOfMonth(cursor);
      const year = first.getFullYear();
      const month = first.getMonth();
      const lastDate = new Date(year, month + 1, 0).getDate();
      const startWeekday = new Date(year, month, 1).getDay();
      const pad = startWeekday;
      const daysInGrid = Math.ceil((pad + lastDate) / 7) * 7;
      const cells: { date: Date | null }[] = [];
      for (let i = 0; i < daysInGrid; i += 1) {
        const dayNum = i - pad + 1;
        if (dayNum < 1 || dayNum > lastDate) {
          cells.push({ date: null });
        } else {
          cells.push({ date: new Date(year, month, dayNum, 12, 0, 0, 0) });
        }
      }
      const weeksOut: { date: Date | null }[][] = [];
      for (let w = 0; w < cells.length; w += 7) {
        weeksOut.push(cells.slice(w, w + 7));
      }
      return {
        periodLabel: first.toLocaleString(undefined, { month: "long", year: "numeric" }),
        weeks: weeksOut,
        minCellHeightClass: "min-h-[113.4px]",
        dayIssuesMaxHeightClass: "max-h-[9.975rem]",
      };
    }

    if (rangeMode === "week") {
      const start = startOfWeekSunday(cursor);
      const end = addDays(start, 6);
      const weekCells = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i) }));
      return {
        periodLabel: `${formatShortDate(start)} – ${formatShortDate(end)}`,
        weeks: [weekCells],
        minCellHeightClass: "min-h-[147px]",
        dayIssuesMaxHeightClass: "max-h-[15.75rem]",
      };
    }

    const start = startOfWeekSunday(cursor);
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < 91; i += 1) {
      cells.push({ date: addDays(start, i) });
    }
    const weeksOut: { date: Date | null }[][] = [];
    for (let w = 0; w < cells.length; w += 7) {
      weeksOut.push(cells.slice(w, w + 7));
    }
    return {
      periodLabel: `${formatShortDate(start)} – ${formatShortDate(addDays(start, 89))}`,
      weeks: weeksOut,
      minCellHeightClass: "min-h-[84px]",
      dayIssuesMaxHeightClass: "max-h-[7.0875rem]",
    };
  }, [cursor, rangeMode]);

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const goPrev = () => {
    if (rangeMode === "month") setCursor((c) => addMonths(c, -1));
    else if (rangeMode === "week") setCursor((c) => addDays(c, -7));
    else setCursor((c) => addDays(c, -91));
  };

  const goNext = () => {
    if (rangeMode === "month") setCursor((c) => addMonths(c, 1));
    else if (rangeMode === "week") setCursor((c) => addDays(c, 7));
    else setCursor((c) => addDays(c, 91));
  };

  return (
    <div className="space-y-3 px-2 py-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={goPrev} aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-semibold lg:text-left">{periodLabel}</span>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={goNext} aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-border">
            {RANGE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setRangeMode(m.id)}
                className={cn(
                  "px-2.5 py-1.5 text-xs transition-colors",
                  rangeMode === m.id
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger size="sm" className="h-8 w-[11rem] text-xs" aria-label="Filter by priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {priorities.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Issues appear on the day they were last updated. Scroll inside a day to see them all.
      </p>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-7 gap-px border-b border-border bg-border text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {weekdayLabels.map((d) => (
          <div key={d} className="bg-background px-1 py-2">
            {d}
          </div>
        ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border">
        {weeks.flatMap((week, wi) =>
          week.map((cell, di) => {
            const key = `${wi}-${di}`;
            if (!cell.date) {
              return <div key={key} className={cn("bg-background", minCellHeightClass)} />;
            }
            const k = dayKey(cell.date);
            const dayIssues = issueDays.get(k) ?? [];

            return (
              <div key={key} className={cn("flex flex-col bg-background p-1.5 text-left", minCellHeightClass)}>
                <div className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{cell.date.getDate()}</div>
                {dayIssues.length > 0 ? (
                  <div
                    className={cn(
                      "scrollbar-kanban-column mt-1 space-y-1 overflow-y-auto overscroll-y-contain",
                      dayIssuesMaxHeightClass,
                    )}
                  >
                    {dayIssues.map((issue) => (
                      <CalendarIssueLinkCard key={issue.id} issue={issue} issueHref={issueHref} liveIssueIds={liveIssueIds} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }),
        )}
        </div>
      </div>
    </div>
  );
}
