"use client";

import { Button } from "./ui/button";
import type { KitComplexity, KitType, SortOption } from "@/lib/types";

interface FilterBarProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  complexityFilter: KitComplexity | "all";
  onComplexityChange: (complexity: KitComplexity | "all") => void;
  typeFilter: KitType | "all";
  onTypeChange: (type: KitType | "all") => void;
  featuredOnly: boolean;
  onFeaturedToggle: () => void;
}

export function FilterBar({
  sortBy,
  onSortChange,
  complexityFilter,
  onComplexityChange,
  typeFilter,
  onTypeChange,
  featuredOnly,
  onFeaturedToggle,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort:</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
              ["popular", "Popularity"],
              ["easy-first", "Easy first"],
              ["complex-first", "Complex first"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={sortBy === value ? "secondary" : "outline"}
              size="sm"
              onClick={() => onSortChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Setup:</span>
          {(
            [
              ["all", "All"],
              ["easy", "Easy"],
              ["moderate", "Moderate"],
              ["complex", "Complex"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={complexityFilter === value ? "secondary" : "outline"}
              size="sm"
              onClick={() => onComplexityChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          {(
            [
              ["all", "All"],
              ["worker", "Worker"],
              ["workflow", "Workflow"],
              ["self-contained", "Self-contained"],
              ["uses-codebase", "Uses codebase"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={typeFilter === value ? "secondary" : "outline"}
              size="sm"
              onClick={() => onTypeChange(value as KitType | "all")}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Button
            variant={featuredOnly ? "secondary" : "outline"}
            size="sm"
            onClick={onFeaturedToggle}
          >
            Featured only
          </Button>
        </div>
      </div>
    </div>
  );
}
