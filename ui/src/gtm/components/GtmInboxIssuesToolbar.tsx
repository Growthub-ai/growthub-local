import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  GtmInboxIssueAssigneeFilter,
  GtmInboxIssueDatePreset,
  GtmInboxIssueStatusFilter,
} from "@/gtm/lib/gtm-inbox-issue-filters";
import type { IssueStatus } from "@paperclipai/shared";
import { ISSUE_STATUSES } from "@paperclipai/shared";
import { Calendar, ChevronDown, Search } from "lucide-react";

function formatIssueStatusOption(status: IssueStatus): string {
  return status.replaceAll("_", " ");
}

const DATE_PRESETS: { id: GtmInboxIssueDatePreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "3d", label: "3 days" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "custom", label: "Custom" },
];

const PRESET_QUICK: GtmInboxIssueDatePreset[] = ["all", "today", "3d", "7d", "30d", "90d"];

function formatCustomRangeSummary(from: string, to: string): string | null {
  if (!from || !to) return null;
  const df = new Date(`${from}T12:00:00`);
  const dt = new Date(`${to}T12:00:00`);
  if (Number.isNaN(df.getTime()) || Number.isNaN(dt.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${df.toLocaleDateString(undefined, opts)} – ${dt.toLocaleDateString(undefined, opts)}`;
}

export function GtmInboxIssuesToolbar({
  search,
  onSearchChange,
  datePreset,
  onDatePresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  assigneeFilter,
  onAssigneeFilterChange,
  statusFilter,
  onStatusFilterChange,
  agentsForFilter,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  datePreset: GtmInboxIssueDatePreset;
  onDatePresetChange: (v: GtmInboxIssueDatePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  assigneeFilter: GtmInboxIssueAssigneeFilter;
  onAssigneeFilterChange: (v: GtmInboxIssueAssigneeFilter) => void;
  statusFilter: GtmInboxIssueStatusFilter;
  onStatusFilterChange: (v: GtmInboxIssueStatusFilter) => void;
  agentsForFilter: { id: string; name: string }[];
}) {
  const [dateOpen, setDateOpen] = useState(false);

  const dateTriggerLabel = useMemo(() => {
    if (datePreset === "custom") {
      const range = formatCustomRangeSummary(customFrom, customTo);
      if (range) return range;
      return "Custom range";
    }
    return DATE_PRESETS.find((p) => p.id === datePreset)?.label ?? "All dates";
  }, [datePreset, customFrom, customTo]);

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="relative min-w-0 w-full sm:max-w-xl sm:flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title or issue id…"
          className="h-9 pl-9 text-sm"
          aria-label="Search issues"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-3 sm:gap-y-2 sm:shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Updated</span>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Filter by last updated date"
                className={cn(
                  "inline-flex h-9 min-w-[11rem] max-w-[min(100vw-4rem,20rem)] items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-xs shadow-xs outline-none transition-colors",
                  "hover:bg-accent/50",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                )}
              >
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{dateTriggerLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end" sideOffset={6}>
              <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Last updated
              </p>
              <div className="flex flex-col gap-0.5">
                {PRESET_QUICK.map((id) => {
                  const p = DATE_PRESETS.find((x) => x.id === id)!;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onDatePresetChange(p.id);
                        setDateOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                        datePreset === p.id
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1.5 border-t border-border pt-1.5">
                <button
                  type="button"
                  onClick={() => onDatePresetChange("custom")}
                  className={cn(
                    "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                    datePreset === "custom"
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  Custom
                </button>
                {datePreset === "custom" ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                      <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => onCustomFromChange(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                        aria-label="From date"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                      <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => onCustomToChange(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                        aria-label="To date"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Assignee</span>
          <Select value={assigneeFilter} onValueChange={(v) => onAssigneeFilterChange(v as GtmInboxIssueAssigneeFilter)}>
            <SelectTrigger size="sm" className="h-9 min-w-[11rem] text-xs">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="user_assigned">Human assignee</SelectItem>
              {agentsForFilter.length > 0 ? (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Agents</SelectLabel>
                  {agentsForFilter.map((a) => (
                    <SelectItem key={a.id} value={`agent:${a.id}`}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as GtmInboxIssueStatusFilter)}>
            <SelectTrigger size="sm" className="h-9 min-w-[11rem] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ISSUE_STATUSES.map((status) => (
                <SelectItem key={status} value={status} className="text-xs capitalize">
                  {formatIssueStatusOption(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
