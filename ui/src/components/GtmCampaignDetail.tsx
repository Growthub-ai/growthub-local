import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildGtmCampaignMetadata,
  buildTicketStageOrder,
  normalizeGtmCampaignSettings,
  normalizeTicketStageDefinitions,
  normalizeTicketStageKey,
  readGtmCampaignMetadata,
  type Agent,
  type Issue,
  type Ticket,
  type TicketStageDefinition,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { ticketsApi } from "@/api/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GtmCampaignSettingsCard, GtmStageContractEditor, type GtmStageDraft } from "@/components/GtmCampaignContracts";
import { GtmIssueLauncherModal } from "@/components/GtmIssueLauncherModal";
import { useToast } from "@/context/ToastContext";
import { normalizeCompanyPrefix } from "@/lib/company-routes";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { toSurfacePath } from "@/lib/surface-profile";
import { ChevronRight, ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";

type GtmTicketDetail = Ticket & { issues?: Issue[] };

type GtmCampaignDetailProps = {
  companyId: string;
  ticketId: string;
  companyPrefix?: string | null;
};

function createStageDrafts(stageDefinitions: TicketStageDefinition[]): GtmStageDraft[] {
  return stageDefinitions.map((stage, index) => ({ ...stage, expanded: index === 0 }));
}

export function GtmCampaignDetail({ companyId, ticketId, companyPrefix }: GtmCampaignDetailProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherStage, setLauncherStage] = useState<string | null>(null);

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
  const stageDefinitions = useMemo(
    () => normalizeTicketStageDefinitions({ stageDefinitions: ticket?.stageDefinitions, stageOrder: ticket?.stageOrder }),
    [ticket?.stageDefinitions, ticket?.stageOrder],
  );
  const [stageDrafts, setStageDrafts] = useState<GtmStageDraft[]>([]);
  const [settingsDraft, setSettingsDraft] = useState(() => normalizeGtmCampaignSettings(null));

  const stages = buildTicketStageOrder(stageDefinitions);
  const currentStage = ticket?.currentStage ?? stages[0] ?? null;
  const issuesByStage = useMemo(() => {
    const grouped = new Map<string, Issue[]>();
    for (const stage of stages) grouped.set(stage, []);
    for (const issue of ticket?.issues ?? []) {
      const stageKey = issue.ticketStage ?? currentStage ?? stages[0] ?? "unscoped";
      const bucket = grouped.get(stageKey) ?? [];
      bucket.push(issue);
      grouped.set(stageKey, bucket);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    }
    return grouped;
  }, [currentStage, stages, ticket?.issues]);

  useEffect(() => {
    if (!ticket) return;
    setStageDrafts(createStageDrafts(stageDefinitions));
    setSettingsDraft(normalizeGtmCampaignSettings(campaignMetadata?.settings));
  }, [campaignMetadata?.settings, stageDefinitions, ticket]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCampaignContracts = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error("Ticket not loaded");
      const normalizedDefinitions = normalizeTicketStageDefinitions({ stageDefinitions: stageDrafts });
      return ticketsApi.update(companyId, ticket.id, {
        currentStage: normalizedDefinitions.some((stage) => stage.key === ticket.currentStage)
          ? ticket.currentStage
          : normalizedDefinitions[0]?.key,
        stageDefinitions: normalizedDefinitions,
        stageOrder: buildTicketStageOrder(normalizedDefinitions),
      } as Record<string, unknown>);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
      ]);
      pushToast({
        title: "Stage contract saved",
        body: "The GTM campaign stage bindings were updated without changing the DX ticket contract.",
        tone: "success",
      });
    },
  });

  const saveCampaignSettings = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error("Ticket not loaded");
      return ticketsApi.update(companyId, ticket.id, {
        metadata: buildGtmCampaignMetadata({
          targetAudience: campaignMetadata?.targetAudience ?? null,
          offer: campaignMetadata?.offer ?? null,
          successDefinition: campaignMetadata?.successDefinition ?? null,
          settings: settingsDraft,
        }),
      } as Record<string, unknown>);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
      ]);
      pushToast({
        title: "Campaign settings saved",
        body: "The GTM campaign orchestrator settings were saved on the wrapped campaign metadata layer.",
        tone: "success",
      });
    },
  });

  const assignIssue = useMutation({
    mutationFn: ({ issueId, assigneeAgentId }: { issueId: string; assigneeAgentId: string | null }) =>
      issuesApi.update(issueId, { assigneeAgentId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);
      pushToast({
        title: "Issue updated",
        body: "The GTM issue assignment was updated.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Assignment failed",
        body: error instanceof Error ? error.message : "Failed to update issue assignment.",
        tone: "error",
      });
    },
  });

  const removeIssue = useMutation({
    mutationFn: (issueId: string) => issuesApi.remove(issueId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticketId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);
      pushToast({
        title: "Issue removed",
        body: "The campaign issue was removed from this GTM workflow.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Remove failed",
        body: error instanceof Error ? error.message : "Failed to remove issue.",
        tone: "error",
      });
    },
  });

  if (ticketQuery.isLoading) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading GTM campaign…</div>;
  }
  if (ticketQuery.error || !ticket) {
    const error = ticketQuery.error;
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load campaign"}</div>;
  }

  function addStage() {
    setStageDrafts((current) => [
      ...current.map((stage) => ({ ...stage, expanded: false })),
      {
        key: `stage_${current.length + 1}`,
        label: "",
        kind: null,
        ownerRole: null,
        handoffMode: null,
        instructions: null,
        exitCriteria: null,
        metadata: null,
        expanded: true,
      },
    ]);
  }

  function removeStage(index: number) {
    if (stageDrafts.length <= 1) return;
    setStageDrafts(stageDrafts.filter((_stage, stageIndex) => stageIndex !== index));
  }

  function moveStage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= stageDrafts.length) return;
    const next = [...stageDrafts];
    const [stage] = next.splice(index, 1);
    next.splice(nextIndex, 0, stage);
    setStageDrafts(next);
  }

  const boardPath = (path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!companyPrefix) return toSurfacePath(normalizedPath);
    return toSurfacePath(`/${normalizeCompanyPrefix(companyPrefix)}${normalizedPath}`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="truncate text-base font-semibold">{ticket.title}</h2>
              <Badge variant="outline">{ticket.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              GTM campaign launcher layered on the canonical ticket pipeline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to={boardPath(`/tickets/${ticket.id}`)}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open raw ticket
              </Link>
            </Button>
            <Button onClick={() => setLauncherOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New task
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {stages.map((stage, index) => (
            <div key={stage} className="flex items-center gap-2">
              <Badge variant={stage === currentStage ? "default" : "outline"}>
                {stageDefinitions.find((definition) => definition.key === stage)?.label ?? stage}
              </Badge>
              {index < stages.length - 1 ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <GtmCampaignSettingsCard settings={settingsDraft} onChange={setSettingsDraft} />
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => saveCampaignSettings.mutate()} disabled={saveCampaignSettings.isPending}>
              {saveCampaignSettings.isPending ? "Saving..." : "Save campaign settings"}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <GtmStageContractEditor
            stages={stageDrafts}
            currentStage={currentStage}
            onChange={(next) =>
              setStageDrafts(
                next.map((stage, index) => ({
                  ...stage,
                  key: normalizeTicketStageKey(stage.key || stage.label || `stage_${index + 1}`),
                })),
              )
            }
            onAddStage={addStage}
            onRemoveStage={removeStage}
            onMoveStage={moveStage}
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => saveCampaignContracts.mutate()} disabled={saveCampaignContracts.isPending}>
              {saveCampaignContracts.isPending ? "Saving..." : "Save stage contract"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Stage issues</h3>
            <p className="text-xs text-muted-foreground">
              Stage-scoped GTM issues with explicit open, assign, add, and remove controls.
            </p>
          </div>
          <Button onClick={() => setLauncherOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New issue
          </Button>
        </div>
        <div className="space-y-4 px-4 py-4">
          {stageDefinitions.map((stage) => {
            const stageIssues = issuesByStage.get(stage.key) ?? [];
            return (
              <div key={stage.key} className="rounded-xl border border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={stage.key === currentStage ? "default" : "outline"}>
                        {stage.label || stage.key}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{stageIssues.length} issue{stageIssues.length === 1 ? "" : "s"}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stage.instructions?.trim() || "No stage instructions yet."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLauncherStage(stage.key);
                      setLauncherOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add issue
                  </Button>
                </div>

                {stageIssues.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-muted-foreground">
                    No active issues in this stage yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {stageIssues.map((issue) => (
                      <div key={issue.id} className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{issue.title}</span>
                            <Badge variant="outline">{issue.priority}</Badge>
                            <Badge variant="outline">{issue.status}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{issue.identifier ?? issue.id.slice(0, 8)}</span>
                            <span>{stage.label || stage.key}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="flex h-9 min-w-[220px] rounded-md border border-input bg-transparent px-3 text-sm"
                            value={issue.assigneeAgentId ?? ""}
                            onChange={(event) =>
                              assignIssue.mutate({
                                issueId: issue.id,
                                assigneeAgentId: event.target.value || null,
                              })
                            }
                          >
                            <option value="">Unassigned</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name} ({agent.role})
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.location.assign(boardPath(`/issues/${issue.identifier ?? issue.id}`))}
                          >
                            Open issue
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeIssue.mutate(issue.id)}
                            disabled={removeIssue.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <GtmIssueLauncherModal
        open={launcherOpen}
        onClose={() => {
          setLauncherOpen(false);
          setLauncherStage(null);
        }}
        companyId={companyId}
        ticket={ticket}
        agents={agents}
        stageDefinitions={stageDefinitions}
        defaultStage={launcherStage ?? currentStage ?? stages[0] ?? "stage_1"}
        settings={settingsDraft}
      />
    </div>
  );
}
