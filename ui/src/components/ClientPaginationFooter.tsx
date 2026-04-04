import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ClientPageSize } from "@/lib/client-pagination";
import { CLIENT_PAGE_SIZE_OPTIONS } from "@/lib/client-pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function ClientPaginationFooter({
  total,
  startIdx,
  endIdx,
  page,
  pageCount,
  pageSize,
  onPageSizeChange,
  onPrev,
  onNext,
  className,
}: {
  total: number;
  startIdx: number;
  endIdx: number;
  page: number;
  pageCount: number;
  pageSize: ClientPageSize;
  onPageSizeChange: (size: ClientPageSize) => void;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  const showingFrom = total === 0 ? 0 : startIdx + 1;
  const showingTo = endIdx;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {total === 0 ? "No items" : `Showing ${showingFrom}–${showingTo} of ${total}`}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">View</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange((v === "all" ? "all" : Number(v)) as ClientPageSize)}
          >
            <SelectTrigger size="sm" className="h-8 w-[4.5rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_PAGE_SIZE_OPTIONS.map((opt) => (
                <SelectItem key={String(opt)} value={String(opt)} className="text-xs">
                  {opt === "all" ? "All" : opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 0 || pageSize === "all"}
            onClick={onPrev}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5rem] text-center text-xs tabular-nums text-muted-foreground">
            {pageSize === "all" ? "—" : `${page + 1} / ${pageCount}`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= pageCount - 1 || pageSize === "all"}
            onClick={onNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
