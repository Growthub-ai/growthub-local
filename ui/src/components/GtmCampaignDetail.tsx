import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildGtmCampaignMetadata,
  normalizeGtmCampaignSettings,
  readGtmCampaignMetadata,
  type Agent,
  type Issue,
  type Ticket,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { gtmApi } from "@/api/gtm";
import { issuesApi } from "@/api/issues";
import { ticketsApi } from "@/api/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GtmCampaignSettingsCard } from "@/components/GtmCampaignContracts";
import { GtmIssueLauncherModal } from "@/components/GtmIssueLauncherModal";
import { IssueRow } from "@/components/IssueRow";
import { useToast } from "@/context/ToastContext";
import { normalizeCompanyPrefix } from "@/lib/company-routes";
import { queryKeys } from "@/lib/queryKeys";
import { toSurfacePath } from "@/lib/surface-profile";
import { cn } from "@/lib/utils";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileText,
  Heart,
  Loader2,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

type GtmTicketDetail = Ticket & { issues?: Issue[] };

type ActiveTab = "issues" | "policy" | "settings";

const ISSUES_PAGE_SIZE = 10;

type GtmCampaignDetailProps = {
  companyId: string;
  ticketId: string;
  companyPrefix?: string | null;
  onNavigate?: (path: string) => void;
  onRequestClose?: () => void;
};

function serializeSettings(settings: ReturnType<typeof normalizeGtmCampaignSettings>): string {
  return JSON.stringify(settings);
}

export function GtmCampaignDetail({
  companyId,
  ticketId,
  companyPrefix,
  onNavigate,
  onRequestClose,
}: GtmCampaignDetailProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("issues");
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [issuesPage, setIssuesPage] = useState(0);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [descEditing, setDescEditing] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ["gtm", "ticket-detail", ticketId],
    queryFn: () => ticketsApi.get(companyId, ticketId) as Promise<GtmTicketDetail>,
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });

  const ticket = ticketQuery.data;
  const agents = agentsQuery.data ?? [];
  const campaignMetadata = readGtmCampaignMetadata(ticket?.metadata);
  const [settingsDraft, setSettingsDraft] = useState(() => normalizeGtmCampaignSettings(null));
  const [settingsSnapshot, setSettingsSnapshot] = useState("");

  const metadataKey = ticket?.metadata ? JSON.stringify(ticket.metadata) : "";
  useEffect(() => {
    if (!ticket) return;
    const normalized = normalizeGtmCampaignSettings(campaignMetadata?.settings);
    setSettingsDraft(normalized);
    setSettingsSnapshot(serializeSettings(normalized));
    setTitleDraft(ticket.title);
    setDescriptionDraft(ticket.description ?? "");
  }, [metadataKey, ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSettingsChanges = useMemo(
    () => settingsSnapshot !== "" && serializeSettings(settingsDraft) !== settingsSnapshot,
    [settingsDraft, settingsSnapshot],
  );
  const hasTitleDescChanges = ticket
    ? (titleDraft !== ticket.title || descriptionDraft !== (ticket.description ?? ""))
    : false;
  const hasUnsavedChanges = hasSettingsChanges || hasTitleDescChanges;

  const saveCampaignSettings = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error("Ticket not loaded");
      const patch: Record<string, unknown> = {
        metadata: buildGtmCampaignMetadata({
          targetAudience: campaignMetadata?.targetAudience ?? null,
          offer: campaignMetadata?.offer ?? null,
          successDefinition: campaignMetadata?.successDefinition ?? null,
          settings: settingsDraft,
        }),
      };
      if (titleDraft.trim() && titleDraft !== ticket.title) {
        patch.title = titleDraft.trim();
      }
      if (descriptionDraft !== (ticket.description ?? "")) {
        patch.description = descriptionDraft.trim() || null;
      }
      return ticketsApi.update(companyId, ticket.id, patch as Record<string, unknown>);
    },
    onSuccess: async () => {
      setSettingsSnapshot(serializeSettings(settingsDraft));
      setTitleEditing(false);
      setDescEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
      ]);
      pushToast({ title: "Campaign saved", tone: "success" });
    },
  });

  // Archive campaign — sets ticket status to "archived" and archives all issues
  const archiveCampaign = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error("Ticket not loaded");
      const issueIds = (ticket.issues ?? []).map((i) => i.id);
      await ticketsApi.update(companyId, ticket.id, { status: "archived" } as Record<string, unknown>);
      if (issueIds.length > 0) {
        await issuesApi.bulkArchive(companyId, issueIds);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
      ]);
      pushToast({ title: "Campaign archived", body: "Campaign and all issues moved to archive.", tone: "success" });
      onRequestClose?.();
    },
  });

  // Pause/resume campaign — sets ticket status and pauses/resumes all issues
  const togglePause = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error("Ticket not loaded");
      const isPaused = ticket.status === "paused";
      const nextStatus = isPaused ? "active" : "paused";
      const issueStatus = isPaused ? "todo" : "backlog";
      await ticketsApi.update(companyId, ticket.id, { status: nextStatus } as Record<string, unknown>);
      const issues = ticket.issues ?? [];
      await Promise.all(
        issues.map((issue) => issuesApi.update(issue.id, { status: issueStatus })),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
      ]);
      pushToast({ title: ticket?.status === "paused" ? "Campaign resumed" : "Campaign paused", tone: "success" });
    },
  });

  // Duplicate campaign
  const duplicateCampaign = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error("Ticket not loaded");
      return ticketsApi.create(companyId, {
        title: `${ticket.title} (copy)`,
        description: ticket.description ?? undefined,
        instructions: ticket.instructions ?? undefined,
        leadAgentId: ticket.leadAgentId,
        metadata: ticket.metadata as Record<string, unknown> | undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] });
      pushToast({ title: "Campaign duplicated", tone: "success" });
    },
  });

  const removeIssue = useMutation({
    mutationFn: (issueId: string) => issuesApi.remove(issueId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);
      pushToast({ title: "Issue removed", tone: "success" });
    },
  });

  const triggerHeartbeat = useMutation({
    mutationFn: () => gtmApi.enforceHeartbeat(companyId, ticketId),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);
      pushToast({
        title: "Heartbeat enforced",
        body: `Created ${result.issuesCreated} sub-issue(s) for active agents.`,
        tone: "success",
      });
    },
  });

  const triggerPerformanceReview = useMutation({
    mutationFn: () => gtmApi.triggerPerformanceReview(companyId, ticketId),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);
      pushToast({
        title: "Performance review dispatched",
        body: result.reviewIssueId
          ? `CEO agent reviewing ${result.agentsReviewed} agent(s).`
          : (result.error ?? "Failed"),
        tone: result.reviewIssueId ? "success" : "error",
      });
    },
  });

  function handleClose() {
    if (hasUnsavedChanges) {
      setDiscardConfirmOpen(true);
      return;
    }
    onRequestClose?.();
  }

  function handleForceClose() {
    setDiscardConfirmOpen(false);
    onRequestClose?.();
  }

  if (ticketQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading campaign...</div>
      </div>
    );
  }
  if (ticketQuery.error || !ticket) {
    const error = ticketQuery.error;
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load campaign"}
        </div>
      </div>
    );
  }

  const boardPath = (path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!companyPrefix) return toSurfacePath(normalizedPath);
    return toSurfacePath(`/${normalizeCompanyPrefix(companyPrefix)}${normalizedPath}`);
  };

  const allIssues = [...(ticket.issues ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const totalPages = Math.max(1, Math.ceil(allIssues.length / ISSUES_PAGE_SIZE));
  const pagedIssues = allIssues.slice(issuesPage * ISSUES_PAGE_SIZE, (issuesPage + 1) * ISSUES_PAGE_SIZE);
  const isPaused = ticket.status === "paused";

  // Agents involved in this campaign (assigned to its issues)
  const campaignAgentIds = new Set(allIssues.map((i) => i.assigneeAgentId).filter(Boolean));
  if (ticket.leadAgentId) campaignAgentIds.add(ticket.leadAgentId);
  const campaignAgents = agents.filter((a) => campaignAgentIds.has(a.id));

  return (
    <>
      <div className="flex flex-col" style={{ maxHeight: "calc(92vh - 2px)" }}>
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {titleEditing ? (
                  <input
                    className="flex-1 truncate text-base font-semibold bg-transparent border-b border-border outline-none focus:border-primary"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => { if (!titleDraft.trim()) { setTitleDraft(ticket.title); } setTitleEditing(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") setTitleEditing(false); }}
                    autoFocus
                  />
                ) : (
                  <h2
                    className="truncate text-base font-semibold cursor-text hover:bg-accent/30 rounded px-1 -mx-1 transition-colors"
                    onClick={() => setTitleEditing(true)}
                  >
                    {titleDraft || ticket.title}
                  </h2>
                )}
                <Badge variant="outline" className="shrink-0">{ticket.status}</Badge>
              </div>
              <div className="mt-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setDescriptionExpanded((v) => !v)}
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", descriptionExpanded && "rotate-180")} />
                  {descriptionExpanded ? "Hide description" : "Show description"}
                </button>
                {descriptionExpanded ? (
                  descEditing ? (
                    <textarea
                      className="mt-1.5 w-full text-sm text-muted-foreground leading-relaxed bg-transparent border border-border rounded-md p-2 outline-none focus:border-primary resize-y min-h-[60px]"
                      value={descriptionDraft}
                      onChange={(e) => setDescriptionDraft(e.target.value)}
                      onBlur={() => setDescEditing(false)}
                      rows={3}
                      autoFocus
                    />
                  ) : (
                    <p
                      className="mt-1.5 text-sm text-muted-foreground leading-relaxed cursor-text hover:bg-accent/30 rounded px-1 -mx-1 transition-colors"
                      onClick={() => setDescEditing(true)}
                    >
                      {descriptionDraft || "Click to add description..."}
                    </p>
                  )
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasUnsavedChanges ? (
                <Button
                  size="sm"
                  onClick={() => saveCampaignSettings.mutate()}
                  disabled={saveCampaignSettings.isPending}
                  className="gap-1.5"
                >
                  {saveCampaignSettings.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {saveCampaignSettings.isPending ? "Saving..." : "Save"}
                </Button>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-gray-200 bg-white text-muted-foreground shadow-sm transition-colors hover:bg-gray-50 hover:text-foreground dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex border-b border-border">
            <button
              type="button"
              className={cn(
                "relative flex items-center gap-1.5 px-4 pb-2.5 text-sm font-medium transition-colors",
                activeTab === "issues"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("issues")}
            >
              {allIssues.length > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-xs font-medium text-muted-foreground">
                  {allIssues.length}
                </span>
              ) : null}
              Campaign Issues
              {activeTab === "issues" ? (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              ) : null}
            </button>
            <button
              type="button"
              className={cn(
                "relative flex items-center gap-1.5 px-4 pb-2.5 text-sm font-medium transition-colors",
                activeTab === "policy"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("policy")}
            >
              <FileText className="h-3.5 w-3.5" />
              Campaign Policy
              {activeTab === "policy" ? (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              ) : null}
            </button>
            <button
              type="button"
              className={cn(
                "relative flex items-center gap-1.5 px-4 pb-2.5 text-sm font-medium transition-colors",
                activeTab === "settings"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("settings")}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
              {activeTab === "settings" ? (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              ) : null}
            </button>
          </div>
        </div>

        {/* Tab content — fixed height with scroll */}
        <div className="overflow-y-auto px-6 py-5" style={{ height: "528px" }}>
          {activeTab === "issues" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Campaign issues</h3>
                  <p className="text-xs text-muted-foreground">
                    Issues running inside this GTM campaign.
                  </p>
                </div>
                <Button size="sm" onClick={() => setLauncherOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New issue
                </Button>
              </div>

              <div
                className="rounded-lg border border-border bg-card"
                style={{ minHeight: "320px" }}
              >
                {allIssues.length === 0 ? (
                  <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ minHeight: "320px" }}>
                    No issues yet. Launch the first issue to start executing this campaign.
                  </div>
                ) : (
                  <div className="divide-y divide-border overflow-y-auto" style={{ maxHeight: "400px" }}>
                    {pagedIssues.map((issue) => {
                      const issuePath = boardPath(`/issues/${issue.identifier ?? issue.id}`);
                      return (
                        <div key={issue.id} className="flex items-center gap-2">
                          <div
                            className="min-w-0 flex-1 cursor-pointer"
                            onClick={(e) => {
                              if (onNavigate) {
                                e.preventDefault();
                                onNavigate(issuePath);
                              }
                            }}
                          >
                            <IssueRow
                              issue={issue}
                              to={onNavigate ? "#" : issuePath}
                              desktopTrailing={
                                <Badge variant="outline">{issue.status}</Badge>
                              }
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 mr-2"
                            onClick={() => removeIssue.mutate(issue.id)}
                            disabled={removeIssue.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    {issuesPage * ISSUES_PAGE_SIZE + 1}–{Math.min((issuesPage + 1) * ISSUES_PAGE_SIZE, allIssues.length)} of {allIssues.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={issuesPage === 0} onClick={() => setIssuesPage((p) => p - 1)} className="h-7 w-7 p-0">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-2 text-xs text-muted-foreground">{issuesPage + 1} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={issuesPage >= totalPages - 1} onClick={() => setIssuesPage((p) => p + 1)} className="h-7 w-7 p-0">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : activeTab === "policy" ? (
            <div className="space-y-4">
              <GtmCampaignSettingsCard settings={settingsDraft} onChange={setSettingsDraft} />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveCampaignSettings.mutate()}
                  disabled={saveCampaignSettings.isPending || !hasUnsavedChanges}
                  className="gap-1.5"
                >
                  {saveCampaignSettings.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saveCampaignSettings.isPending ? "Saving..." : "Save policy"}
                </Button>
              </div>
            </div>
          ) : (
            /* Settings tab */
            <div className="space-y-6">
              {/* Campaign actions */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Campaign actions</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => togglePause.mutate()}
                    disabled={togglePause.isPending}
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    <div>
                      <p className="text-sm font-medium">{isPaused ? "Resume campaign" : "Pause campaign"}</p>
                      <p className="text-xs text-muted-foreground">
                        {isPaused ? "Resume all issues." : "Pause all issues."}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => triggerHeartbeat.mutate()}
                    disabled={triggerHeartbeat.isPending}
                  >
                    <Heart className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Enforce heartbeat</p>
                      <p className="text-xs text-muted-foreground">Dispatch sub-issues to all active agents.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => triggerPerformanceReview.mutate()}
                    disabled={triggerPerformanceReview.isPending}
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Performance review</p>
                      <p className="text-xs text-muted-foreground">CEO reviews all agent performance.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => duplicateCampaign.mutate()}
                    disabled={duplicateCampaign.isPending}
                  >
                    <Copy className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Duplicate campaign</p>
                      <p className="text-xs text-muted-foreground">Clone with all settings.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => archiveCampaign.mutate()}
                    disabled={archiveCampaign.isPending}
                  >
                    <Archive className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Archive campaign</p>
                      <p className="text-xs text-muted-foreground">Archive campaign and all issues.</p>
                    </div>
                  </button>
                </div>
              </section>

              {/* Campaign agents */}
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Campaign agents</h3>
                  <p className="text-xs text-muted-foreground">Agents assigned to issues in this campaign.</p>
                </div>
                <div className="rounded-lg border border-border bg-card">
                  {campaignAgents.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No agents assigned yet.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Name</th>
                          <th className="px-4 py-2 font-medium">Role</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 font-medium text-right">Issues</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {campaignAgents.map((agent) => {
                          const agentIssueCount = allIssues.filter((i) => i.assigneeAgentId === agent.id).length;
                          const isLead = agent.id === ticket.leadAgentId;
                          return (
                            <tr key={agent.id}>
                              <td className="px-4 py-2.5 font-medium">
                                {agent.name}
                                {isLead ? <span className="ml-1.5 text-xs text-muted-foreground">(lead)</span> : null}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{agent.role}</td>
                              <td className="px-4 py-2.5">
                                <span className={cn(
                                  "inline-flex items-center gap-1.5 text-xs",
                                  agent.status === "active" ? "text-green-600" :
                                  agent.status === "paused" ? "text-yellow-600" :
                                  "text-muted-foreground",
                                )}>
                                  <span className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    agent.status === "active" ? "bg-green-500" :
                                    agent.status === "paused" ? "bg-yellow-500" :
                                    "bg-gray-400",
                                  )} />
                                  {agent.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground">{agentIssueCount}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <GtmIssueLauncherModal
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        companyId={companyId}
        ticket={ticket}
        agents={agents}
        settings={settingsDraft}
      />

      {/* Discard confirm */}
      <Dialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved campaign policy changes. Save them first, or discard and close.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardConfirmOpen(false)}>
              Go back
            </Button>
            <Button
              onClick={() => {
                saveCampaignSettings.mutate(undefined, {
                  onSuccess: () => handleForceClose(),
                });
              }}
              disabled={saveCampaignSettings.isPending}
              className="gap-1.5"
            >
              {saveCampaignSettings.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save and close
            </Button>
            <Button variant="destructive" onClick={handleForceClose}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
