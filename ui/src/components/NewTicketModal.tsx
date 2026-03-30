import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi, type GhPr, type GhRepo } from "../api/tickets";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import {
  GitPullRequest, GitBranch, Plus, X, ChevronDown, Search,
  Bot, Zap, ArrowRight, Check, Loader2, ExternalLink,
} from "lucide-react";
import type { Agent } from "@paperclipai/shared";

// ─── Stage palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  { dot: "bg-violet-500", text: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/30" },
  { dot: "bg-blue-500",   text: "text-blue-500",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
  { dot: "bg-amber-500",  text: "text-amber-500",  bg: "bg-amber-500/10",  border: "border-amber-500/30" },
  { dot: "bg-orange-500", text: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  { dot: "bg-green-500",  text: "text-green-500",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  { dot: "bg-pink-500",   text: "text-pink-500",   bg: "bg-pink-500/10",   border: "border-pink-500/30" },
  { dot: "bg-cyan-500",   text: "text-cyan-500",   bg: "bg-cyan-500/10",   border: "border-cyan-500/30" },
];
function stagePal(i: number) { return PALETTE[i % PALETTE.length]; }
function stageLabel(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

const DEFAULT_STAGES = ["planning", "execution", "review", "qa", "human"];

// ─── Section wrapper ───────────────────────────────────────────────────────────
function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

// ─── GitHub PR Picker ─────────────────────────────────────────────────────────
function GithubPrPicker({
  companyId,
  selectedPr,
  onSelect,
}: {
  companyId: string;
  selectedPr: GhPr | null;
  onSelect: (pr: GhPr | null) => void;
}) {
  const [repo, setRepo] = useState("antonioromero1220/gh-app");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: repos = [] } = useQuery({
    queryKey: ["github-repos", companyId],
    queryFn: () => ticketsApi.githubRepos(companyId),
    staleTime: 60_000,
  });

  const { data: prs = [], isFetching } = useQuery({
    queryKey: ["github-prs", companyId, repo],
    queryFn: () => ticketsApi.githubPrs(companyId, repo),
    staleTime: 30_000,
    enabled: !!repo,
  });

  const filtered = prs.filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) || String(p.number).includes(search)
  );

  return (
    <div className="space-y-2">
      {/* Repo selector */}
      <div className="flex items-center gap-2">
        <select
          value={repo}
          onChange={(e) => { setRepo(e.target.value); setSearch(""); setOpen(true); }}
          className="flex-1 text-xs bg-background border border-border rounded-md px-2 py-1.5 outline-none text-foreground"
        >
          <option value="antonioromero1220/gh-app">antonioromero1220/gh-app</option>
          <option value="antonioromero1220/growthub-core">antonioromero1220/growthub-core</option>
          {(repos as GhRepo[])
            .filter((r) => r.fullName !== "antonioromero1220/gh-app" && r.fullName !== "antonioromero1220/growthub-core")
            .slice(0, 15)
            .map((r) => (
              <option key={r.fullName} value={r.fullName}>{r.fullName}</option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
        >
          <GitPullRequest className="h-3.5 w-3.5" />
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Browse PRs"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Selected PR chip */}
      {selectedPr && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
          <GitPullRequest className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{selectedPr.title}</p>
            <p className="text-[11px] text-muted-foreground">
              #{selectedPr.number} · <GitBranch className="inline h-2.5 w-2.5" /> {selectedPr.branch}
            </p>
          </div>
          <a href={selectedPr.url} target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button type="button" onClick={() => onSelect(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* PR dropdown */}
      {open && (
        <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PRs…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            />
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {isFetching ? "Loading…" : "No open PRs found"}
              </p>
            ) : (
              filtered.map((pr) => (
                <button
                  key={pr.number}
                  type="button"
                  onClick={() => { onSelect(pr); setOpen(false); setSearch(""); }}
                  className={cn(
                    "flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-accent/50 transition-colors",
                    selectedPr?.number === pr.number && "bg-blue-500/5"
                  )}
                >
                  <GitPullRequest className={cn(
                    "h-3.5 w-3.5 mt-0.5 shrink-0",
                    pr.draft ? "text-muted-foreground" : "text-green-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-snug">{pr.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      #{pr.number} · {pr.branch} · {pr.user}
                      {pr.draft && " · Draft"}
                    </p>
                  </div>
                  {selectedPr?.number === pr.number && <Check className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent picker pill ────────────────────────────────────────────────────────
function AgentPill({ agent, onRemove }: { agent: Agent; onRemove: () => void }) {
  const statusColor: Record<string, string> = {
    active: "bg-green-500", running: "bg-cyan-500", paused: "bg-amber-500", error: "bg-red-500",
  };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-border bg-card text-xs">
      <span className={cn("h-1.5 w-1.5 rounded-full", statusColor[agent.status] ?? "bg-border")} />
      {agent.name}
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground ml-0.5">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// suppress unused warning — AgentPill is available for future use
void AgentPill;

// ─── Main modal ───────────────────────────────────────────────────────────────
export interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess?: (ticketId: string) => void;
}

export function NewTicketModal({ open, onClose, companyId, onSuccess }: NewTicketModalProps) {
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [stages, setStages] = useState<string[]>([...DEFAULT_STAGES]);
  const [newStage, setNewStage] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [leadAgentId, setLeadAgentId] = useState<string>("");
  const [linkedPr, setLinkedPr] = useState<GhPr | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setInstructions("");
      setStages([...DEFAULT_STAGES]); setLeadAgentId(""); setLinkedPr(null);
      setNewStage(""); setAddingStage(false);
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open]);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: open,
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: () =>
      ticketsApi.create(companyId, {
        title: title.trim(),
        description: description.trim() || undefined,
        stageOrder: stages,
        instructions: instructions.trim() || undefined,
        leadAgentId: leadAgentId || undefined,
        metadata: linkedPr
          ? {
              linkedPr: {
                number: linkedPr.number,
                title: linkedPr.title,
                url: linkedPr.url,
                branch: linkedPr.branch,
                repo: linkedPr.repo,
              },
            }
          : undefined,
      }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list(companyId) });
      onSuccess?.(ticket.id);
      onClose();
    },
  });

  function addStage() {
    const name = newStage.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name || stages.includes(name)) return;
    setStages((s) => [...s, name]);
    setNewStage(""); setAddingStage(false);
  }

  function removeStage(s: string) {
    if (stages.length <= 1) return;
    setStages((prev) => prev.filter((x) => x !== s));
  }

  const statusColor: Record<string, string> = {
    active: "bg-green-500", running: "bg-cyan-500", paused: "bg-amber-500", error: "bg-red-500",
  };
  const leadAgent = agents.find((a) => a.id === leadAgentId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-y-auto p-0 gap-0"
        style={{ width: "75vw", maxWidth: "75vw" }}
      >
        {/* ── Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            New Ticket
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Define scope, bind a PR, assign agents, and configure the pipeline.
          </p>
        </DialogHeader>

        {/* ── Body */}
        <div className="px-6 py-5 space-y-6">

          {/* Title */}
          <Section label="Title">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Winning Ads Image Mutation — GH MAX Mode"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus:border-primary/60 transition-colors placeholder:text-muted-foreground/50"
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            />
          </Section>

          {/* Scope / Description */}
          <Section label="Scope & Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what needs to be built, the problem being solved, and any constraints…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary/60 transition-colors resize-none placeholder:text-muted-foreground/50"
            />
          </Section>

          {/* GitHub PR */}
          <Section label="Linked GitHub PR">
            <GithubPrPicker
              companyId={companyId}
              selectedPr={linkedPr}
              onSelect={setLinkedPr}
            />
            {!linkedPr && (
              <p className="text-[11px] text-muted-foreground/60">
                Bind an open PR from your repos to give agents direct context on the active branch.
              </p>
            )}
          </Section>

          {/* Pipeline Stages */}
          <Section label="Pipeline Stages">
            <div className="flex items-center flex-wrap gap-1.5">
              {stages.map((stage, i) => {
                const p = stagePal(i);
                return (
                  <span
                    key={stage}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium",
                      p.bg, p.border, p.text
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", p.dot)} />
                    {stageLabel(stage)}
                    {stages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStage(stage)}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                );
              })}
              {addingStage ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    placeholder="stage"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addStage(); }
                      if (e.key === "Escape") setAddingStage(false);
                    }}
                    className="text-xs bg-background border border-border rounded-full px-2.5 py-1 outline-none w-24"
                  />
                  <button type="button" onClick={addStage} className="text-xs text-foreground/60 hover:text-foreground px-1">+</button>
                  <button type="button" onClick={() => setAddingStage(false)}><X className="h-3 w-3 text-muted-foreground" /></button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingStage(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add stage
                </button>
              )}
            </div>
          </Section>

          {/* Lead Agent */}
          <Section label="Lead Agent">
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setLeadAgentId((id) => id === agent.id ? "" : agent.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all",
                    leadAgentId === agent.id
                      ? "border-primary/60 bg-primary/5"
                      : "border-border hover:border-border/80 hover:bg-accent/40"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", statusColor[agent.status] ?? "bg-border")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{agent.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{agent.role}</p>
                  </div>
                  {leadAgentId === agent.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))}
            </div>
            {agents.length === 0 && (
              <p className="text-xs text-muted-foreground/60">No agents configured yet.</p>
            )}
          </Section>

          {/* Agent Instructions */}
          <Section label="Agent Instructions">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder={`Specific instructions for agents working this ticket…\ne.g. "Follow the videoMutation pipeline pattern. Do not modify stable registry files. Use the brand kit ref images."`}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary/60 transition-colors resize-none placeholder:text-muted-foreground/50 font-mono text-[13px]"
            />
          </Section>
        </div>

        {/* ── Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
            {linkedPr && (
              <span className="flex items-center gap-1 text-blue-500">
                <GitPullRequest className="h-3 w-3" /> PR #{linkedPr.number}
              </span>
            )}
            {leadAgent && (
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" /> {leadAgent.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              {stages.length} stage{stages.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => create()}
              disabled={!title.trim() || isPending}
              className="gap-1.5"
            >
              {isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</>
              ) : (
                <><ArrowRight className="h-3.5 w-3.5" />Create Ticket</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
