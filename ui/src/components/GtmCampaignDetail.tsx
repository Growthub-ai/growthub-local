import { useEffect, useState } from "react";
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
import { issuesApi } from "@/api/issues";
import { ticketsApi } from "@/api/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GtmCampaignSettingsCard } from "@/components/GtmCampaignContracts";
import { GtmIssueLauncherModal } from "@/components/GtmIssueLauncherModal";
import { useToast } from "@/context/ToastContext";
import { normalizeCompanyPrefix } from "@/lib/company-routes";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { toSurfacePath } from "@/lib/surface-profile";
import { ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";

type GtmTicketDetail = Ticket & { issues?: Issue[] };

type GtmCampaignDetailProps = {
  companyId: string;
  ticketId: string;
  companyPrefix?: string | null;
};

export function GtmCampaignDetail({ companyId, ticketId, companyPrefix }: GtmCampaignDetailProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [launcherOpen, setLauncherOpen] = useState(false);

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

  useEffect(() => {
    if (!ticket) return;
    setSettingsDraft(normalizeGtmCampaignSettings(campaignMetadata?.settings));
  }, [campaignMetadata?.settings, ticket]); // eslint-disable-line react-hooks/exhaustive-deps

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
      pushToast({ title: "Campaign settings saved", tone: "success" });
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
      pushToast({ title: "Task removed", tone: "success" });
    },
  });

  if (ticketQuery.isLoading) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading campaign…</div>;
  }
  if (ticketQuery.error || !ticket) {
    const error = ticketQuery.error;
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load campaign"}</div>;
  }

  const boardPath = (path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!companyPrefix) return toSurfacePath(normalizedPath);
    return toSurfacePath(`/${normalizeCompanyPrefix(companyPrefix)}${normalizedPath}`);
  };

  const issues = [...(ticket.issues ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      {/* Campaign header */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="truncate text-base font-semibold">{ticket.title}</h2>
              <Badge variant="outline">{ticket.status}</Badge>
            </div>
            {ticket.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{ticket.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to={boardPath(`/tickets/${ticket.id}`)}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open ticket
              </Link>
            </Button>
            <Button onClick={() => setLauncherOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New task
            </Button>
          </div>
        </div>
      </div>

      {/* Campaign settings */}
      <GtmCampaignSettingsCard settings={settingsDraft} onChange={setSettingsDraft} />
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => saveCampaignSettings.mutate()} disabled={saveCampaignSettings.isPending}>
          {saveCampaignSettings.isPending ? "Saving…" : "Save campaign settings"}
        </Button>
      </div>

      {/* Issues */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Campaign tasks</h3>
            <p className="text-xs text-muted-foreground">
              Paperclip issues running inside this GTM campaign — assign to agents and track from inbox.
            </p>
          </div>
          <Button size="sm" onClick={() => setLauncherOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New task
          </Button>
        </div>

        {issues.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No tasks yet. Launch the first issue to start executing this campaign.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {issues.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{issue.title}</span>
                    <Badge variant="outline">{issue.priority}</Badge>
                    <Badge variant="outline">{issue.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{issue.identifier ?? issue.id.slice(0, 8)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="flex h-9 min-w-[200px] rounded-md border border-input bg-transparent px-3 text-sm"
                    value={issue.assigneeAgentId ?? ""}
                    onChange={(event) =>
                      assignIssue.mutate({ issueId: issue.id, assigneeAgentId: event.target.value || null })
                    }
                  >
                    <option value="">Unassigned</option>
                    {agents.map((agent: Agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name} ({agent.role})</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <Link to={boardPath(`/issues/${issue.identifier ?? issue.id}`)}>
                      Open issue
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeIssue.mutate(issue.id)}
                    disabled={removeIssue.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <GtmIssueLauncherModal
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        companyId={companyId}
        ticket={ticket}
        agents={agents}
        settings={settingsDraft}
      />
    </div>
  );
}
