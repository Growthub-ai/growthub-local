import type { ComponentType } from "react";
import { CalendarDays, LayoutGrid, LayoutList, Star, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaperclipViewLayoutId } from "@/lib/paperclip-view-layout";

export const PAPERCLIP_VIEW_LAYOUT_ICONS: Record<
  PaperclipViewLayoutId,
  ComponentType<{ className?: string }>
> = {
  list: LayoutList,
  kanban: LayoutGrid,
  table: Table2,
  calendar: CalendarDays,
};

export interface PaperclipViewLayoutTabSpec {
  id: PaperclipViewLayoutId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export function PaperclipViewLayoutToggle<T extends PaperclipViewLayoutId>({
  views,
  value,
  onValueChange,
  favoriteLayout,
  onFavoriteToggle,
  className,
}: {
  views: readonly PaperclipViewLayoutTabSpec[];
  value: T;
  onValueChange: (layout: T) => void;
  favoriteLayout: T | null;
  onFavoriteToggle: (layout: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full shrink-0 flex-wrap items-stretch border border-border rounded-md overflow-hidden sm:flex-nowrap",
        className,
      )}
    >
      {views.map((v) => {
        const Icon = v.icon;
        const isFavorite = favoriteLayout === v.id;
        const selected = value === v.id;

        return (
          <div
            key={v.id}
            className={cn(
              "flex flex-none items-stretch border-r border-border last:border-r-0",
              selected ? "bg-accent text-foreground" : "bg-background",
            )}
          >
            <button
              type="button"
              className={cn(
                "group/starzone flex w-10 shrink-0 items-center justify-center bg-transparent py-2 pl-3 pr-0 outline-none transition-colors",
                "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                selected ? "text-foreground" : "text-foreground/80",
              )}
              aria-label={isFavorite ? `Remove ${v.label} as default view` : `Star ${v.label} as default view`}
              title={isFavorite ? "Default view (click to clear)" : "Default view — hover for star, then click"}
              onClick={() => onFavoriteToggle(v.id as T)}
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-md">
                <Icon
                  className={cn(
                    "h-4 w-4 transition-all duration-150 ease-out",
                    isFavorite && "scale-75 opacity-0",
                    !isFavorite &&
                      "[@media(hover:hover)]:group-hover/starzone:scale-75 [@media(hover:hover)]:group-hover/starzone:opacity-0",
                  )}
                  aria-hidden
                />
                <Star
                  aria-hidden
                  className={cn(
                    "absolute h-4 w-4 transition-all duration-150 ease-out",
                    isFavorite
                      ? "scale-100 fill-amber-400 text-amber-600 opacity-100 dark:fill-amber-500 dark:text-amber-400"
                      : "scale-90 opacity-0 text-amber-500 [@media(hover:hover)]:group-hover/starzone:scale-100 [@media(hover:hover)]:group-hover/starzone:opacity-100 [@media(hover:hover)]:group-hover/starzone:fill-amber-300 [@media(hover:hover)]:group-hover/starzone:text-amber-600 dark:[@media(hover:hover)]:group-hover/starzone:fill-amber-400/80 dark:[@media(hover:hover)]:group-hover/starzone:text-amber-300",
                  )}
                  strokeWidth={isFavorite ? 0 : 2}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => onValueChange(v.id as T)}
              className={cn(
                "flex min-h-9 min-w-[2.75rem] flex-1 items-center whitespace-nowrap bg-transparent py-2 pr-3 text-left text-[13px] font-medium outline-none transition-colors sm:min-w-0",
                "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                selected ? "text-foreground" : "text-foreground/80 hover:text-foreground",
              )}
              aria-current={selected ? "true" : undefined}
              aria-label={`${v.label} view`}
              title={v.label}
            >
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
