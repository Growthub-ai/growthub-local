"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KitCard } from "@/components/kit-card";
import { FilterBar } from "@/components/filter-bar";
import { mockKits } from "@/lib/data";
import type { KitComplexity, KitType, SortOption } from "@/lib/types";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [complexityFilter, setComplexityFilter] = useState<KitComplexity | "all">("all");
  const [typeFilter, setTypeFilter] = useState<KitType | "all">("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const filteredKits = useMemo(() => {
    let filtered = [...mockKits];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (kit) =>
          kit.name.toLowerCase().includes(query) ||
          kit.description.toLowerCase().includes(query) ||
          kit.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Complexity filter
    if (complexityFilter !== "all") {
      filtered = filtered.filter((kit) => kit.complexity === complexityFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((kit) => kit.type === typeFilter);
    }

    // Featured filter
    if (featuredOnly) {
      filtered = filtered.filter((kit) => kit.featured);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        case "oldest":
          return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
        case "easy-first":
          return (
            ["easy", "moderate", "complex"].indexOf(a.complexity) -
            ["easy", "moderate", "complex"].indexOf(b.complexity)
          );
        case "complex-first":
          return (
            ["complex", "moderate", "easy"].indexOf(a.complexity) -
            ["complex", "moderate", "easy"].indexOf(b.complexity)
          );
        default:
          return 0;
      }
    });

    return filtered;
  }, [searchQuery, sortBy, complexityFilter, typeFilter, featuredOnly]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-mono text-sm font-bold">
                GH
              </div>
              <h1 className="text-xl font-semibold">Growthub Kits</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
              <Button size="sm">Publish kit</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-balance">Browse Kits</h2>
            <p className="mt-2 text-lg text-muted-foreground leading-relaxed text-pretty">
              Discover agent workflow kits. Share what worked so other agents can reuse it.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search kits..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <FilterBar
          sortBy={sortBy}
          onSortChange={setSortBy}
          complexityFilter={complexityFilter}
          onComplexityChange={setComplexityFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          featuredOnly={featuredOnly}
          onFeaturedToggle={() => setFeaturedOnly(!featuredOnly)}
        />

        <div className="mt-6 mb-4 text-sm text-muted-foreground">
          {filteredKits.length} {filteredKits.length === 1 ? "kit" : "kits"} available
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredKits.map((kit) => (
            <KitCard key={kit.id} kit={kit} />
          ))}
        </div>

        {filteredKits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg text-muted-foreground">No kits found matching your filters</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearchQuery("");
                setComplexityFilter("all");
                setTypeFilter("all");
                setFeaturedOnly(false);
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            Built with Growthub Local · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
