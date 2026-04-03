/**
 * Skills.sh Picker Modal — Search → Select → Add flow.
 *
 * Ported from gh-app packages/agents-sandbox/lib/skills-sh/components/SkillsShSkillPickerModal.tsx
 * Pattern: Search skills.sh directory → select skill → resolve snapshot → create knowledge item.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Sparkles } from "lucide-react";
import { agentsApi, type SkillsShSearchResult, type SkillsShSkillSnapshot } from "../api/agents";

interface SkillsShSkillPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  onComplete?: (payload: {
    item: Record<string, unknown>;
    snapshot: SkillsShSkillSnapshot;
  }) => void;
}

export function SkillsShSkillPickerModal({
  open,
  onOpenChange,
  agentId,
  onComplete,
}: SkillsShSkillPickerModalProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SkillsShSearchResult[]>([]);
  const [selected, setSelected] = useState<SkillsShSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();

  // Search on open and on query change (debounced)
  useEffect(() => {
    if (!open) return;

    const searchQuery = trimmedQuery || "";
    const handler = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await agentsApi.searchSkillsSh(searchQuery);
        const list = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
      } catch (err) {
        console.error("[SkillsShPicker] Search failed:", err);
        setItems([]);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, trimmedQuery ? 300 : 0);

    return () => clearTimeout(handler);
  }, [open, trimmedQuery]);

  const hasResults = items.length > 0;

  const selectedDetails = useMemo(() => {
    if (!selected) return null;
    return `${selected.owner}/${selected.repo} · ${selected.skillName}`;
  }, [selected]);

  const handleSubmit = async () => {
    if (!selected || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const data = await agentsApi.createSkillSh(agentId, selected);
      if (!data.success) {
        throw new Error("Failed to add skill");
      }

      onComplete?.({
        item: data.item,
        snapshot: data.snapshot,
      });
      handleClose();
    } catch (err) {
      console.error("[SkillsShPicker] Create failed:", err);
      setError(err instanceof Error ? err.message : "Failed to add skill");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setQuery("");
    setItems([]);
    setSelected(null);
    setLoading(false);
    setSubmitting(false);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Search skills.sh
          </DialogTitle>
          <DialogDescription>
            Browse and add skills from the open skills directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for skills (e.g., ai-elements, github)"
                className="pl-9"
              />
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!trimmedQuery && !loading && items.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              Start typing to search the open skills directory on skills.sh.
            </p>
          )}
          {!trimmedQuery && !loading && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Featured skills from the directory. Refine with a search query.
            </p>
          )}

          {trimmedQuery && !loading && !hasResults && !error && (
            <p className="text-sm text-muted-foreground">No skills found. Try another query.</p>
          )}

          {hasResults && (
            <div
              className="rounded-md border border-border"
              style={{
                height: "360px",
                overflowY: "scroll",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <ul className="divide-y divide-border">
                {items.map((item, index) => {
                  const isSelected = selected?.id === item.id;
                  const uniqueKey = `${item.id}-${index}`;
                  return (
                    <li
                      key={uniqueKey}
                      className={`p-4 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-accent"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelected(item)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm">{item.skillName}</h4>
                            <Badge variant="secondary" className="text-[10px]">skills.sh</Badge>
                          </div>
                          {item.summary && (
                            <p className="text-sm text-muted-foreground">{item.summary}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {item.owner}/{item.repo}
                          </p>
                          {item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {item.tags.slice(0, 4).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground shrink-0">
                          <div className="font-mono">{item.installCommand}</div>
                          {item.metrics?.installs != null && (
                            <div>{item.metrics.installs.toLocaleString()} installs</div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted-foreground">{selectedDetails || ""}</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!selected || submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  "Add skill"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
