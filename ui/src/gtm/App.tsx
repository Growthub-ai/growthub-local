import { useEffect, useMemo, useState } from "react";
import { GTM_DEFAULT_STAGE_ORDER } from "@paperclipai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { gtmApi } from "@/api/gtm";
import { companiesApi } from "@/api/companies";
import { assetsApi } from "@/api/assets";
import { agentsApi } from "@/api/agents";
import { ticketsApi } from "@/api/tickets";
import { issuesApi } from "@/api/issues";
import { heartbeatsApi } from "@/api/heartbeats";
import { queryKeys } from "@/lib/queryKeys";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { shouldRedirectCompanylessRouteToOnboarding } from "@/lib/onboarding-route";
import { surfaceRouteMount, toSurfacePath } from "@/lib/surface-profile";
import { AuthPage } from "@/pages/Auth";
import { BoardClaimPage } from "@/pages/BoardClaim";
import { InviteLandingPage } from "@/pages/InviteLanding";
import { NotFoundPage } from "@/pages/NotFound";
import { AgentDetail } from "@/pages/AgentDetail";
import { TicketDetail } from "@/pages/TicketDetail";
import { IssueDetail } from "@/pages/IssueDetail";
import { BreadcrumbBar } from "@/components/BreadcrumbBar";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { GrowthubConnectionCard } from "@/components/GrowthubConnectionCard";
import { IssueRow } from "@/components/IssueRow";
import { PriorityIcon } from "@/components/PriorityIcon";
import { StatusIcon } from "@/components/StatusIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { ToastViewport } from "@/components/ToastViewport";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { timeAgo } from "@/lib/timeAgo";
import { relativeTime } from "@/lib/utils";
import { buildGrowthubConfigurationUrl, getGrowthubAuthUserId } from "@/lib/growthub-connection";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Inbox as InboxIcon,
  Link2,
  Loader2,
  Moon,
  Play,
  RefreshCcw,
  Settings,
  Sun,
  Ticket,
  UserPlus,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SURFACE_ROUTE_PATH = surfaceRouteMount.slice(1);
const SURFACE_ROUTE_PREFIX_PATTERN = new RegExp(`^${surfaceRouteMount}(?=/|$)`);
const GTM_QUERY_KEYS = {
  agents: (companyId: string) => ["gtm", "agents", companyId] as const,
  tickets: (companyId: string) => ["gtm", "tickets", companyId] as const,
  issues: (companyId: string) => ["gtm", "issues", companyId] as const,
  inbox: (companyId: string) => ["gtm", "inbox", companyId] as const,
};

const AGENT_ADAPTER_OPTIONS = [
  { value: "claude_local", label: "Claude Code" },
  { value: "codex_local", label: "Codex" },
  { value: "gemini_local", label: "Gemini CLI" },
  { value: "opencode_local", label: "OpenCode" },
  { value: "cursor", label: "Cursor" },
  { value: "pi_local", label: "Pi" },
  { value: "openclaw_gateway", label: "OpenClaw Gateway" },
] as const;

const ISSUE_PRIORITY_OPTIONS = ["critical", "high", "medium", "low"] as const;
// Canonical GTM stage order — imported from @paperclipai/shared, never redefined here.
const TICKET_STAGE_ORDER = GTM_DEFAULT_STAGE_ORDER;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRunIssueId(run: { contextSnapshot?: Record<string, unknown> | null }): string | null {
  const context = asRecord(run.contextSnapshot);
  if (!context) return null;
  return asNonEmptyString(context.issueId) ?? asNonEmptyString(context.taskId);
}

function buildRunRetryPayload(run: { id: string; contextSnapshot?: Record<string, unknown> | null }) {
  const payload: Record<string, unknown> = {};
  const context = asRecord(run.contextSnapshot);
  if (!context) return payload;
  const issueId = asNonEmptyString(context.issueId);
  const taskId = asNonEmptyString(context.taskId);
  const taskKey = asNonEmptyString(context.taskKey);
  if (issueId) payload.issueId = issueId;
  if (taskId) payload.taskId = taskId;
  if (taskKey) payload.taskKey = taskKey;
  return payload;
}

function BootstrapPendingPage({ hasActiveInvite = false }: { hasActiveInvite?: boolean }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Instance setup required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasActiveInvite
            ? "No instance admin exists yet. A bootstrap invite is already active. Check your local startup logs for the first admin invite URL, or run this command to rotate it:"
            : "No instance admin exists yet. Run this command in your local environment to generate the first admin invite URL:"}
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
{`pnpm growthub auth bootstrap-ceo`}
        </pre>
      </div>
    </div>
  );
}

function CloudAccessGate() {
  const location = useLocation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "local_trusted" | "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  if (healthQuery.isLoading || (isAuthenticatedMode && sessionQuery.isLoading)) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  if (healthQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error ? healthQuery.error.message : "Failed to load app state"}
      </div>
    );
  }

  if (isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending") {
    return <BootstrapPendingPage hasActiveInvite={healthQuery.data.bootstrapInviteActive} />;
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  return <Outlet />;
}

function formatRelativeDate(value: Date | string | null | undefined) {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function buildGtmBoardPath(companyPrefix: string | null | undefined, boardPath: string) {
  const normalizedBoardPath = boardPath.startsWith("/") ? boardPath : `/${boardPath}`;
  return toSurfacePath(`${companyPrefix ?? ""}${normalizedBoardPath}`);
}

function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const location = useLocation();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to={toSurfacePath("onboarding")} replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={toSurfacePath(`${targetCompany.issuePrefix}/workspace`)} replace />;
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    if (
      shouldRedirectCompanylessRouteToOnboarding({
        pathname: location.pathname,
        hasCompanies: false,
      })
    ) {
      return <Navigate to={toSurfacePath("onboarding")} replace />;
    }
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={toSurfacePath(`${targetCompany.issuePrefix}${location.pathname.replace(SURFACE_ROUTE_PREFIX_PATTERN, "")}${location.search}${location.hash}`)}
      replace
    />
  );
}

function NoCompaniesStartPage() {
  const [useGtmFlow, setUseGtmFlow] = useState(true);

  if (useGtmFlow) {
    // GtmCeoStartFlow handles navigation internally on complete — the company
    // context refresh will pick up the new company and redirect automatically.
    return (
      <GtmCeoStartFlow
        onComplete={() => {
          // Navigation happens via the company context refresh / CompanyRootRedirect.
          // No explicit navigate needed; fallback button shown if user wants DX wizard.
        }}
      />
    );
  }

  // Fallback: generic DX wizard (kept for backwards compat)
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create your first company</h1>
        <p className="mt-2 text-sm text-muted-foreground">Get started by creating a company.</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => setUseGtmFlow(true)}>GTM Setup</Button>
        </div>
      </div>
    </div>
  );
}

function OnboardingRoutePage() {
  const { companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;

  const title = matchedCompany
    ? `Add another agent to ${matchedCompany.name}`
    : companies.length > 0
      ? "Create another company"
      : "Create your first company";
  const description = matchedCompany
    ? "Run onboarding again to add an agent and a starter task for this company."
    : companies.length > 0
      ? "Run onboarding again to create another company and seed its first agent."
      : "Get started by creating a company and your first agent.";

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? "Add Agent" : "Start Onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function useGtmWorkspaceData(companyId: string | null) {
  const profileQuery = useQuery({ queryKey: ["gtm", "profile"], queryFn: () => gtmApi.getProfile() });
  const knowledgeQuery = useQuery({ queryKey: ["gtm", "knowledge"], queryFn: () => gtmApi.getKnowledge() });
  const connectorsQuery = useQuery({ queryKey: ["gtm", "connectors"], queryFn: () => gtmApi.getConnectors() });
  const connectionQuery = useQuery({ queryKey: ["gtm", "connection"], queryFn: () => gtmApi.getConnection() });
  const workflowQuery = useQuery({ queryKey: ["gtm", "workflow"], queryFn: () => gtmApi.getWorkflow() });
  const agentsQuery = useQuery({
    queryKey: companyId ? GTM_QUERY_KEYS.agents(companyId) : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(companyId!),
    enabled: !!companyId,
  });
  const ticketsQuery = useQuery({
    queryKey: companyId ? GTM_QUERY_KEYS.tickets(companyId) : ["gtm", "tickets", "none"],
    queryFn: () => gtmApi.listTickets(companyId!),
    enabled: !!companyId,
  });
  const issuesQuery = useQuery({
    queryKey: companyId ? GTM_QUERY_KEYS.issues(companyId) : ["gtm", "issues", "none"],
    queryFn: () => gtmApi.listIssues(companyId!),
    enabled: !!companyId,
  });

  return {
    profileQuery,
    knowledgeQuery,
    connectorsQuery,
    connectionQuery,
    workflowQuery,
    agentsQuery,
    ticketsQuery,
    issuesQuery,
  };
}

function GtmWorkspacePage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [setupOpen, setSetupOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentTitle, setAgentTitle] = useState("");
  const [claudeCommand, setClaudeCommand] = useState("claude");
  const [claudeCwd, setClaudeCwd] = useState("");
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-6");
  const [claudeChrome, setClaudeChrome] = useState(true);
  const [growthubBaseUrl, setGrowthubBaseUrl] = useState("");
  const {
    profileQuery,
    knowledgeQuery,
    connectorsQuery,
    connectionQuery,
    workflowQuery,
    agentsQuery,
    ticketsQuery,
    issuesQuery,
  } = useGtmWorkspaceData(selectedCompanyId);
  const workspaceConfigQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "workspace-config", selectedCompanyId] : ["gtm", "workspace-config", "none"],
    queryFn: () => gtmApi.getWorkspaceConfig(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const runsQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "runs", selectedCompanyId] : ["gtm", "runs", "none"],
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 8),
    enabled: !!selectedCompanyId,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const setupMutation = useMutation({
    mutationFn: () =>
      gtmApi.upsertWorkspaceClaudeBrowser(selectedCompanyId!, {
        name: agentName,
        title: agentTitle,
        adapterConfig: {
          command: claudeCommand,
          cwd: claudeCwd,
          model: claudeModel,
          chrome: claudeChrome,
        },
      }),
    onSuccess: async () => {
      setSetupOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "workspace-config", selectedCompanyId!] }),
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!) }),
      ]);
      pushToast({ title: "Workspace configured", body: "Claude browser agent is configured for this workspace.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Workspace setup failed",
        body: error instanceof Error ? error.message : "Failed to configure workspace agent",
        tone: "error",
      });
    },
  });

  const launchWorkflow = useMutation({
    mutationFn: () => gtmApi.launchWorkflow(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gtm", "workflow"] });
      pushToast({ title: "Workflow started", body: "Local SDR execution launched.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Workflow failed",
        body: error instanceof Error ? error.message : "Failed to launch workflow",
        tone: "error",
      });
    },
  });
  const saveConnectionConfig = useMutation({
    mutationFn: async () => {
      return await gtmApi.saveConnectionConfig({ baseUrl: growthubBaseUrl.trim() });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "connection"] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "connectors"] }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Configuration failed",
        body: error instanceof Error ? error.message : "Failed to save Growthub configuration",
        tone: "error",
      });
    },
  });
  const testConnectionMutation = useMutation({
    mutationFn: () => gtmApi.testConnection(),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "connection"] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "connectors"] }),
      ]);
      pushToast({
        title: "Growthub pulse succeeded",
        body: result.message,
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Growthub pulse failed",
        body: error instanceof Error ? error.message : "Failed to verify the Growthub local route handler",
        tone: "error",
      });
    },
  });
  const disconnectConnectionMutation = useMutation({
    mutationFn: () => gtmApi.disconnectConnection(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "connection"] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "connectors"] }),
      ]);
      pushToast({
        title: "Growthub disconnected",
        body: "Local connection state was cleared for this installer.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Disconnect failed",
        body: error instanceof Error ? error.message : "Failed to disconnect Growthub locally",
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (connectionQuery.data?.baseUrl) {
      setGrowthubBaseUrl(connectionQuery.data.baseUrl);
    }
  }, [connectionQuery.data?.baseUrl]);

  const openHostedGrowthubConfiguration = (baseUrl: string, callbackUrl: string) => {
    const userId = getGrowthubAuthUserId(sessionQuery.data ?? null);
    if (!userId) {
      pushToast({
        title: "Sign in required",
        body: "Sign in locally before opening the hosted Growthub configuration flow.",
        tone: "error",
      });
      return;
    }
    window.open(
      buildGrowthubConfigurationUrl({
        baseUrl,
        callbackUrl,
        userId,
        surface: "gtm",
        workspaceLabel: selectedCompany?.name ?? profileQuery.data?.workspace ?? "GTM Workspace",
      }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  if (!selectedCompanyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Select or create a company to open the GTM workspace.
      </div>
    );
  }

  const isLoading = [
    profileQuery,
    knowledgeQuery,
    connectorsQuery,
    connectionQuery,
    workflowQuery,
    agentsQuery,
    ticketsQuery,
    issuesQuery,
    workspaceConfigQuery,
    runsQuery,
  ].some((query) => query.isLoading);

  const error = [
    profileQuery.error,
    knowledgeQuery.error,
    connectorsQuery.error,
    connectionQuery.error,
    workflowQuery.error,
    agentsQuery.error,
    ticketsQuery.error,
    issuesQuery.error,
    workspaceConfigQuery.error,
    runsQuery.error,
  ].find(Boolean);

  if (isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading GTM workspace…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load GTM workspace"}
      </div>
    );
  }

  const profile = profileQuery.data!;
  const knowledge = knowledgeQuery.data!;
  const connectors = connectorsQuery.data!;
  const connection = connectionQuery.data!;
  const workflow = workflowQuery.data!;
  const agents = agentsQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const workspaceConfig = workspaceConfigQuery.data!;
  const recentRuns = runsQuery.data ?? [];
  const managedAgent = workspaceConfig.existingAgent;
  const bindingCheck = workspaceConfig.environmentTest;
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);

  const openSetup = () => {
    const source = managedAgent ?? workspaceConfig.defaults;
    const adapterConfig = (managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>;
    setAgentName(source.name ?? "SDR Browser Agent");
    setAgentTitle((managedAgent?.title ?? workspaceConfig.defaults.title) || "");
    setClaudeCommand(String(adapterConfig.command ?? "claude"));
    setClaudeCwd(String(adapterConfig.cwd ?? ""));
    setClaudeModel(String(adapterConfig.model ?? "claude-sonnet-4-6"));
    setClaudeChrome(Boolean(adapterConfig.chrome ?? true));
    setSetupOpen(true);
  };

  const openConnectionConfiguration = () => {
    if (connection.baseUrl?.trim()) {
      openHostedGrowthubConfiguration(connection.baseUrl, connection.callbackUrl);
      return;
    }
    setGrowthubBaseUrl(connection.baseUrl);
    setConnectionOpen(true);
  };

  const launchGrowthubConfiguration = async () => {
    const saved = await saveConnectionConfig.mutateAsync();
    openHostedGrowthubConfiguration(saved.baseUrl, saved.callbackUrl);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">GTM Workspace</Badge>
              <Badge variant="outline">{workflow.status}</Badge>
              <Badge variant={managedAgent ? "secondary" : "outline"}>
                {managedAgent ? "Agent ready" : "Needs setup"}
              </Badge>
            </div>
            <div>
              <CardTitle>{selectedCompany?.name ?? profile.workspace}</CardTitle>
              <CardDescription>
                Build campaigns, queue work, configure the local Claude browser agent, and launch GTM workflows without exposing board planning surfaces.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openSetup}>
              <Wrench className="mr-2 h-4 w-4" />
              {managedAgent ? "Update agent setup" : "Configure browser agent"}
            </Button>
            <Button asChild variant="outline">
              <Link to={boardPath("/agents/all")}>Open agents</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={boardPath("/tickets")}>Open campaigns</Link>
            </Button>
            <Button onClick={() => launchWorkflow.mutate()} disabled={launchWorkflow.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {workflow.actionLabel}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GtmMetricCard title="Agents" value={String(agents.length)} detail="GTM-configured agents" icon={Users} />
        <GtmMetricCard title="Campaigns" value={String(tickets.length)} detail="Workflow tickets" icon={Ticket} />
        <GtmMetricCard title="Queue" value={String(issues.length)} detail="Active GTM issues" icon={Workflow} />
        <GtmMetricCard title="Knowledge" value={String(knowledge.items.length)} detail={knowledge.group.label} icon={BriefcaseBusiness} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Workspace Agent Setup</CardTitle>
            <CardDescription>Default done-for-you Claude browser agent binding for this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agent</p>
              <p className="mt-1">{managedAgent?.name ?? "Not configured"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Binding Status</p>
              <p className="mt-1">{bindingCheck ? bindingCheck.status : "Not tested"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Claude Command</p>
              <p className="mt-1 break-all">{String(((managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>).command ?? "claude")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Working Directory</p>
              <p className="mt-1 break-all">{String(((managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>).cwd ?? "Not configured")}</p>
            </div>
            {bindingCheck?.checks?.length ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Latest Binding Check</p>
                {bindingCheck.checks.slice(0, 3).map((check) => (
                  <div key={check.code} className="rounded-md border border-border p-3">
                    <p className="font-medium">{check.message}</p>
                    {check.hint ? <p className="mt-1 text-muted-foreground">{check.hint}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={openSetup}>Configure</Button>
              {managedAgent ? (
                <Button size="sm" asChild variant="outline">
                  <Link to={boardPath(`/agents/${managedAgent.id}`)}>Open detail</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <GrowthubConnectionCard
          description="Connect this local installer to the hosted Growthub workspace."
          connected={connection.connected}
          baseUrl={connection.baseUrl}
          callbackUrl={connection.callbackUrl}
          portalBaseUrl={connection.portalBaseUrl}
          machineLabel={connection.machineLabel}
          workspaceLabel={connection.workspaceLabel}
          onOpenConfiguration={openConnectionConfiguration}
          onRefresh={() => {
            void connectionQuery.refetch();
            void connectorsQuery.refetch();
          }}
          onPulseConnection={connection.connected ? () => testConnectionMutation.mutate() : undefined}
          onDisconnect={connection.connected ? () => disconnectConnectionMutation.mutate() : undefined}
          pulsePending={testConnectionMutation.isPending}
          disconnectPending={disconnectConnectionMutation.isPending}
        />

        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>Workflow, connections, and recent runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account</p>
              <p className="mt-1">{profile.account}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">App Connection</p>
              <p className="mt-1 break-all">{profile.appConnection}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Runner</p>
              <p className="mt-1 break-all">{workflow.runner}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent Runs</p>
              {recentRuns.length === 0 ? (
                <p className="mt-1 text-muted-foreground">No runs yet.</p>
              ) : (
                <div className="mt-1 space-y-2">
                  {recentRuns.slice(0, 4).map((run) => (
                    <div key={run.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{run.status}</p>
                        <span className="text-xs text-muted-foreground">{formatRelativeDate(run.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{run.triggerDetail ?? run.invocationSource}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workspace browser agent</DialogTitle>
            <DialogDescription>Bind the workspace to the local Claude app and make the default SDR browser agent runnable out of the box.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Agent name</label>
              <Input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={agentTitle} onChange={(event) => setAgentTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Claude command</label>
              <Input value={claudeCommand} onChange={(event) => setClaudeCommand(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Working directory</label>
              <Input value={claudeCwd} onChange={(event) => setClaudeCwd(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Input value={claudeModel} onChange={(event) => setClaudeModel(event.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={claudeChrome} onChange={(event) => setClaudeChrome(event.target.checked)} />
              Enable Claude browser mode
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button>
            <Button onClick={() => setupMutation.mutate()} disabled={!agentName.trim() || !claudeCommand.trim() || !claudeCwd.trim() || setupMutation.isPending}>
              {setupMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save and test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Growthub Configuration</DialogTitle>
            <DialogDescription>Set the hosted Growthub URL for this installer, then open the auth flow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Growthub base URL</label>
              <Input value={growthubBaseUrl} onChange={(event) => setGrowthubBaseUrl(event.target.value)} />
            </div>
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              Callback: {connection.callbackUrl}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectionOpen(false)}>Cancel</Button>
            <Button onClick={() => void launchGrowthubConfiguration()} disabled={!growthubBaseUrl.trim() || saveConnectionConfig.isPending}>
              {saveConnectionConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Open Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GtmMetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function GtmAgentsPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { agentId } = useParams<{ agentId?: string }>();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [adapterType, setAdapterType] = useState<string>("codex_local");

  const agentsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.agents(selectedCompanyId) : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createAgent = useMutation({
    mutationFn: () =>
      gtmApi.createAgent(selectedCompanyId!, {
        name,
        title,
        role: "general",
        adapterType,
      }),
    onSuccess: async () => {
      setOpen(false);
      setName("");
      setTitle("");
      setAdapterType("codex_local");
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!) });
      pushToast({ title: "Agent created", body: "The GTM agent is ready for assignment.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Agent creation failed",
        body: error instanceof Error ? error.message : "Failed to create agent",
        tone: "error",
      });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, agentId }: { action: "invoke" | "pause" | "resume"; agentId: string }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      if (action === "invoke") return gtmApi.invokeAgent(agentId, selectedCompanyId);
      if (action === "pause") return gtmApi.pauseAgent(agentId, selectedCompanyId);
      return gtmApi.resumeAgent(agentId, selectedCompanyId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!) });
    },
    onError: (error) => {
      pushToast({
        title: "Agent action failed",
        body: error instanceof Error ? error.message : "Failed to control agent",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Select a company to manage GTM agents.</div>;
  }
  if (agentsQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading agents…</div>;
  }
  if (agentsQuery.error) {
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{agentsQuery.error instanceof Error ? agentsQuery.error.message : "Failed to load agents"}</div>;
  }

  const agents = agentsQuery.data ?? [];
  const selectedAgentId = agents.some((agent) => agent.id === agentId) ? agentId ?? null : null;
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);
  const agentDetailQuery = useQuery({
    queryKey: selectedAgentId ? ["gtm", "agent-detail", selectedAgentId] : ["gtm", "agent-detail", "none"],
    queryFn: () => agentsApi.get(selectedAgentId!, selectedCompanyId!),
    enabled: !!selectedCompanyId && !!selectedAgentId,
  });
  const runtimeStateQuery = useQuery({
    queryKey: selectedAgentId ? ["gtm", "agent-runtime", selectedAgentId] : ["gtm", "agent-runtime", "none"],
    queryFn: () => agentsApi.runtimeState(selectedAgentId!, selectedCompanyId!),
    enabled: !!selectedCompanyId && !!selectedAgentId,
  });
  const taskSessionsQuery = useQuery({
    queryKey: selectedAgentId ? ["gtm", "agent-sessions", selectedAgentId] : ["gtm", "agent-sessions", "none"],
    queryFn: () => agentsApi.taskSessions(selectedAgentId!, selectedCompanyId!),
    enabled: !!selectedCompanyId && !!selectedAgentId,
  });
  const runsQuery = useQuery({
    queryKey: selectedAgentId ? ["gtm", "agent-runs", selectedAgentId] : ["gtm", "agent-runs", "none"],
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, selectedAgentId!, 8),
    enabled: !!selectedCompanyId && !!selectedAgentId,
  });

  const [editingName, setEditingName] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingCommand, setEditingCommand] = useState("");
  const [editingCwd, setEditingCwd] = useState("");
  const [editingModel, setEditingModel] = useState("");
  const [editingChrome, setEditingChrome] = useState(false);

  const saveAgentMutation = useMutation({
    mutationFn: () =>
      agentsApi.update(selectedAgentId!, {
        name: editingName,
        title: editingTitle,
        adapterConfig: {
          ...((agentDetailQuery.data?.adapterConfig ?? {}) as Record<string, unknown>),
          command: editingCommand,
          cwd: editingCwd,
          model: editingModel,
          chrome: editingChrome,
        },
      }, selectedCompanyId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "agent-detail", selectedAgentId!] }),
      ]);
      pushToast({ title: "Agent updated", body: "Agent configuration saved.", tone: "success" });
    },
    onError: (error) => {
      pushToast({ title: "Agent update failed", body: error instanceof Error ? error.message : "Failed to update agent", tone: "error" });
    },
  });

  const testBindingMutation = useMutation({
    mutationFn: () =>
      agentsApi.testEnvironment(selectedCompanyId!, "claude_local", {
        adapterConfig: {
          ...((agentDetailQuery.data?.adapterConfig ?? {}) as Record<string, unknown>),
          command: editingCommand,
          cwd: editingCwd,
          model: editingModel,
          chrome: editingChrome,
        },
      }),
    onSuccess: (result) => {
      const top = result.checks[0]?.message ?? "Adapter test complete";
      pushToast({ title: `Binding ${result.status}`, body: top, tone: result.status === "fail" ? "error" : result.status === "warn" ? "warn" : "success" });
    },
    onError: (error) => {
      pushToast({ title: "Binding test failed", body: error instanceof Error ? error.message : "Failed to test binding", tone: "error" });
    },
  });

  const claudeLoginMutation = useMutation({
    mutationFn: () => agentsApi.loginWithClaude(selectedAgentId!, selectedCompanyId!),
    onSuccess: (result) => {
      pushToast({
        title: "Claude login probe complete",
        body: result.loginUrl ?? result.stderr ?? result.stdout ?? "Claude login checked.",
        tone: result.loginUrl ? "warn" : "success",
      });
    },
    onError: (error) => {
      pushToast({ title: "Claude login failed", body: error instanceof Error ? error.message : "Failed to run Claude login", tone: "error" });
    },
  });

  const resetSessionMutation = useMutation({
    mutationFn: () => agentsApi.resetSession(selectedAgentId!, null, selectedCompanyId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gtm", "agent-sessions", selectedAgentId!] });
      pushToast({ title: "Session reset", body: "Agent task session reset.", tone: "success" });
    },
  });

  const detail = agentDetailQuery.data;
  const detailAdapterConfig = (detail?.adapterConfig ?? {}) as Record<string, unknown>;

  useEffect(() => {
    if (!detail) return;
    setEditingName(detail.name);
    setEditingTitle(detail.title ?? "");
    setEditingCommand(String(detailAdapterConfig.command ?? "claude"));
    setEditingCwd(String(detailAdapterConfig.cwd ?? ""));
    setEditingModel(String(detailAdapterConfig.model ?? "claude-sonnet-4-6"));
    setEditingChrome(Boolean(detailAdapterConfig.chrome ?? false));
  }, [detail, detailAdapterConfig.command, detailAdapterConfig.cwd, detailAdapterConfig.model, detailAdapterConfig.chrome]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground">GTM-only agent inventory and controls.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New Agent</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {agents.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No GTM agents configured yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {agents.map((agent) => (
                <div key={agent.id} className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <Link to={boardPath(`/agents/${agent.id}`)} className="truncate font-medium hover:underline">{agent.name}</Link>
                    <p className="truncate text-sm text-muted-foreground">{agent.title ?? agent.role}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{agent.adapterType}</Badge>
                    <Badge variant="outline">{agent.status}</Badge>
                    <Button size="icon-sm" variant="outline" asChild aria-label={`Open settings for ${agent.name}`}>
                      <Link to={boardPath(`/agents/${agent.id}`)}>
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "invoke", agentId: agent.id })}>
                      Run
                    </Button>
                    {agent.status === "paused" ? (
                      <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "resume", agentId: agent.id })}>
                        Resume
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "pause", agentId: agent.id })}>
                        Pause
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create GTM agent</DialogTitle>
            <DialogDescription>Hire a local or browser-facing GTM agent without entering the DX agent builder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Agent name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="SDR Browser Agent" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Outbound automation" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Adapter</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={adapterType}
                onChange={(event) => setAdapterType(event.target.value)}
              >
                {AGENT_ADAPTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createAgent.mutate()} disabled={!name.trim() || createAgent.isPending}>Create Agent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3: CampaignStageBar — pure display, zero state, GTM-scoped
// ---------------------------------------------------------------------------
function CampaignStageBar({ stageOrder, currentStage }: { stageOrder: string[]; currentStage: string | null | undefined }) {
  const stages = stageOrder.length > 0 ? stageOrder : [...GTM_DEFAULT_STAGE_ORDER];
  const currentIdx = currentStage ? stages.indexOf(currentStage) : -1;
  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, idx) => {
        const isCurrent = idx === currentIdx;
        const isDone = idx < currentIdx;
        return (
          <div key={stage} className="flex items-center gap-1">
            {idx > 0 && <div className="h-px w-3 bg-border" />}
            <div
              title={stage}
              className={cn(
                "flex h-5 min-w-[3.5rem] items-center justify-center rounded-full px-2 text-[10px] font-medium capitalize",
                isCurrent && "bg-primary text-primary-foreground",
                isDone && "bg-muted text-muted-foreground line-through",
                !isCurrent && !isDone && "border border-border text-muted-foreground",
              )}
            >
              {stage}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 4: CampaignDetailPanel — issues by status, agent gates, pulse, advance
// ---------------------------------------------------------------------------
type CampaignDetailPanelProps = {
  ticket: { id: string; title: string; currentStage: string | null | undefined; status: string; stageOrder?: string[] | null; instructions?: string | null };
  issues: Array<{ id: string; title: string; status: string; priority: string; ticketId?: string | null; assigneeAgentId?: string | null; identifier?: string | null }>;
  agents: Array<{ id: string; name: string }>;
  runs: Array<{ id: string; agentId: string; status: string; startedAt?: string | null }>;
  companyId: string;
  companyIssuePrefix: string | null | undefined;
  onAdvance: () => void;
  onHireAgent: () => void;
  isAdvancing: boolean;
};

function CampaignDetailPanel({ ticket, issues, agents, runs, companyId, companyIssuePrefix, onAdvance, onHireAgent, isAdvancing }: CampaignDetailPanelProps) {
  const boardPath = (path: string) => buildGtmBoardPath(companyIssuePrefix, path);
  const stageOrder: string[] = Array.isArray(ticket.stageOrder) && ticket.stageOrder.length > 0
    ? ticket.stageOrder
    : [...GTM_DEFAULT_STAGE_ORDER];

  const campaignIssues = issues.filter((i) => i.ticketId === ticket.id);

  // Group issues by status bucket
  const backlog = campaignIssues.filter((i) => i.status === "backlog" || i.status === "todo");
  const active = campaignIssues.filter((i) => i.status === "in_progress" || i.status === "in_review" || i.status === "blocked");
  const done = campaignIssues.filter((i) => i.status === "done" || i.status === "cancelled");

  // Agent gate: for each stage, find any agent assigned to issues nominally "in" that stage
  // We approximate by matching stageOrder index to issue status buckets
  const agentById = (id: string | null | undefined) => agents.find((a) => a.id === id) ?? null;

  // Pulse: most recent run touching any agent assigned to a campaign issue
  const campaignAgentIds = new Set(campaignIssues.map((i) => i.assigneeAgentId).filter(Boolean));
  const pulseRun = runs.find((r) => campaignAgentIds.has(r.agentId)) ?? null;

  const isAtLastStage = stageOrder.length > 0 && ticket.currentStage === stageOrder[stageOrder.length - 1];

  function IssueItem({ issue }: { issue: typeof campaignIssues[number] }) {
    const agent = agentById(issue.assigneeAgentId);
    return (
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div className="min-w-0">
          <Link to={boardPath(`/issues/${issue.id}`)} className="text-sm font-medium hover:underline truncate block">{issue.title}</Link>
          {agent && <span className="text-xs text-muted-foreground">{agent.name}</span>}
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">{issue.priority}</Badge>
      </div>
    );
  }

  return (
    <Card className="border-primary/20 bg-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{ticket.title}</CardTitle>
            <CampaignStageBar stageOrder={stageOrder} currentStage={ticket.currentStage} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={onHireAgent}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Hire Agent
            </Button>
            <Button size="sm" onClick={onAdvance} disabled={isAdvancing || isAtLastStage || ticket.status !== "active"}>
              {isAdvancing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="mr-1.5 h-3.5 w-3.5" />}
              Advance
            </Button>
          </div>
        </div>
        {/* Pulse */}
        {pulseRun && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span>Last run {pulseRun.startedAt ? timeAgo(pulseRun.startedAt) : "recently"}</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{pulseRun.status}</Badge>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Agent Gate per stage */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Stage Gates</p>
          <div className="space-y-1">
            {stageOrder.map((stage) => {
              const stageIssues = campaignIssues.filter((i) => i.assigneeAgentId);
              // Heuristic: take the first agent assigned to any issue in this campaign for the stage label
              const gatedAgent = stage === ticket.currentStage
                ? agentById(campaignIssues.find((i) => i.assigneeAgentId)?.assigneeAgentId)
                : null;
              return (
                <div key={stage} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "w-20 shrink-0 capitalize font-medium",
                    stage === ticket.currentStage ? "text-foreground" : "text-muted-foreground",
                  )}>{stage}</span>
                  <span className="text-muted-foreground">{gatedAgent ? gatedAgent.name : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Issues grouped by status bucket */}
        {campaignIssues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues yet. Use Queue → New Issue to add work to this campaign.</p>
        ) : (
          <div className="space-y-3">
            {active.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-400">In Progress ({active.length})</p>
                {active.map((i) => <IssueItem key={i.id} issue={i} />)}
              </div>
            )}
            {backlog.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Backlog ({backlog.length})</p>
                {backlog.map((i) => <IssueItem key={i.id} issue={i} />)}
              </div>
            )}
            {done.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-green-600 dark:text-green-400">Done ({done.length})</p>
                {done.map((i) => <IssueItem key={i.id} issue={i} />)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase 5: GtmCeoStartFlow — 4-step CEO self-onboarding, GTM-native, zero DX deps
// ---------------------------------------------------------------------------
function GtmCeoStartFlow({ onComplete }: { onComplete: () => void }) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // State threaded across steps
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  // Step 1 state
  const [companyName, setCompanyName] = useState("");
  const createCompany = useMutation({
    mutationFn: () => companiesApi.create({ name: companyName.trim() }),
    onSuccess: async (company) => {
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      setCompanyId(company.id);
      setStep(2);
    },
    onError: (error) => pushToast({ title: "Company creation failed", body: error instanceof Error ? error.message : "Try again.", tone: "error" }),
  });

  // Step 2 state
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [stageOrderInput, setStageOrderInput] = useState([...GTM_DEFAULT_STAGE_ORDER].join(", "));
  const createCampaign = useMutation({
    mutationFn: () => {
      const stageOrder = stageOrderInput.split(",").map((s) => s.trim()).filter(Boolean);
      return gtmApi.createTicket(companyId!, {
        title: campaignTitle.trim(),
        description: campaignDescription.trim() || undefined,
        stageOrder: stageOrder.length > 0 ? stageOrder : [...GTM_DEFAULT_STAGE_ORDER],
      });
    },
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.tickets(companyId!) });
      setTicketId(ticket.id);
      setStep(3);
    },
    onError: (error) => pushToast({ title: "Campaign creation failed", body: error instanceof Error ? error.message : "Try again.", tone: "error" }),
  });

  // Step 3 state
  const [agentName, setAgentName] = useState("");
  const [agentAdapterType, setAgentAdapterType] = useState("claude_local");
  const createAgent = useMutation({
    mutationFn: () =>
      gtmApi.createAgent(companyId!, {
        name: agentName.trim(),
        adapterType: agentAdapterType,
        metadata: { surfaceProfile: "gtm" },
      }),
    onSuccess: async (agent) => {
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(companyId!) });
      setAgentId(agent.id);
      setStep(4);
    },
    onError: (error) => pushToast({ title: "Agent creation failed", body: error instanceof Error ? error.message : "Try again.", tone: "error" }),
  });

  // Step 4 state
  const [issueTitle, setIssueTitle] = useState("First outreach task");
  const [issuePriority, setIssuePriority] = useState("medium");
  const createIssue = useMutation({
    mutationFn: () =>
      gtmApi.createIssue(companyId!, {
        title: issueTitle.trim(),
        priority: issuePriority,
        ticketId: ticketId!,
        assigneeAgentId: agentId ?? null,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.issues(companyId!) }),
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.inbox(companyId!) }),
      ]);
      pushToast({ title: "Ready to launch", body: "Company, campaign, agent, and seed issue created.", tone: "success" });
      onComplete();
    },
    onError: (error) => pushToast({ title: "Issue creation failed", body: error instanceof Error ? error.message : "Try again.", tone: "error" }),
  });

  const stepLabel = ["Create Company", "Create Campaign", "Hire Agent", "Seed Issue"];

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {stepLabel.map((label, idx) => {
            const n = (idx + 1) as 1 | 2 | 3 | 4;
            const active = n === step;
            const done = n < step;
            return (
              <div key={label} className="flex items-center gap-1.5">
                {idx > 0 && <div className="h-px w-5 bg-border" />}
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  done && "bg-primary text-primary-foreground",
                  active && "border-2 border-primary text-primary",
                  !done && !active && "border border-muted-foreground text-muted-foreground",
                )}>
                  {done ? "✓" : n}
                </div>
                <span className={cn("hidden text-xs sm:block", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Create your GTM company</h1>
              <p className="mt-1 text-sm text-muted-foreground">This is the workspace that holds your campaigns and agents.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Company name</label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Sales Team" autoFocus />
            </div>
            <Button onClick={() => createCompany.mutate()} disabled={!companyName.trim() || createCompany.isPending} className="w-full">
              {createCompany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Create your first campaign</h1>
              <p className="mt-1 text-sm text-muted-foreground">A campaign is the GTM container for your issues and agents.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Campaign title</label>
              <Input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} placeholder="Launch outbound sequence for ICP A" autoFocus />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea value={campaignDescription} onChange={(e) => setCampaignDescription(e.target.value)} placeholder="Goal, audience, timing, constraints." rows={2} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stages <span className="text-muted-foreground font-normal">(comma-separated)</span></label>
              <Input value={stageOrderInput} onChange={(e) => setStageOrderInput(e.target.value)} placeholder="planning, execution, qa, human" />
            </div>
            <Button onClick={() => createCampaign.mutate()} disabled={!campaignTitle.trim() || createCampaign.isPending} className="w-full">
              {createCampaign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </div>
        )}

        {/* Step 3 — skippable */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Hire your first agent</h1>
              <p className="mt-1 text-sm text-muted-foreground">Create a GTM agent to execute work on campaign issues. You can skip this and add agents later.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Agent name</label>
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="SDR Browser Agent" autoFocus />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Adapter</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={agentAdapterType}
                onChange={(e) => setAgentAdapterType(e.target.value)}
              >
                {AGENT_ADAPTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setAgentId(null); setStep(4); }} className="flex-1">Skip for now</Button>
              <Button onClick={() => createAgent.mutate()} disabled={!agentName.trim() || createAgent.isPending} className="flex-1">
                {createAgent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Agent
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold">Seed the first issue</h1>
              <p className="mt-1 text-sm text-muted-foreground">Add a starter issue to your campaign so agents have something to execute.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Issue title</label>
              <Input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={issuePriority}
                onChange={(e) => setIssuePriority(e.target.value)}
              >
                {ISSUE_PRIORITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <Button onClick={() => createIssue.mutate()} disabled={!issueTitle.trim() || createIssue.isPending} className="w-full">
              {createIssue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Launch GTM workspace
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GtmCampaignsPage — Phases 2, 3, 4, 6
// ---------------------------------------------------------------------------
function GtmCampaignsPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { ticketId } = useParams<{ ticketId?: string }>();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  // Create dialog state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [stageOrderInput, setStageOrderInput] = useState([...GTM_DEFAULT_STAGE_ORDER].join(", "));
  const [leadAgentId, setLeadAgentId] = useState("");

  // Phase 6: hire-agent dialog state
  const [hireOpen, setHireOpen] = useState(false);
  const [hireMode, setHireMode] = useState<"new" | "existing">("new");
  const [hireName, setHireName] = useState("");
  const [hireAdapterType, setHireAdapterType] = useState("claude_local");
  const [hireExistingAgentId, setHireExistingAgentId] = useState("");
  const [hireIssueTitle, setHireIssueTitle] = useState("Campaign kickoff task");
  const [hireIssuePriority, setHireIssuePriority] = useState("medium");
  const [hireStep, setHireStep] = useState<"agent" | "issue">("agent");
  const [hiredAgentId, setHiredAgentId] = useState<string | null>(null);

  // Data queries
  const ticketsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.tickets(selectedCompanyId) : ["gtm", "tickets", "none"],
    queryFn: () => gtmApi.listTickets(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const agentsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.agents(selectedCompanyId) : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const issuesQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.issues(selectedCompanyId) : ["gtm", "issues", "none"],
    queryFn: () => gtmApi.listIssues(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const runsQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "campaigns-runs", selectedCompanyId] : ["gtm", "campaigns-runs", "none"],
    queryFn: () => gtmApi.listRuns(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Create campaign mutation
  const createTicket = useMutation({
    mutationFn: () => {
      const stageOrder = stageOrderInput.split(",").map((s) => s.trim()).filter(Boolean);
      return gtmApi.createTicket(selectedCompanyId!, {
        title,
        description,
        instructions,
        stageOrder: stageOrder.length > 0 ? stageOrder : [...GTM_DEFAULT_STAGE_ORDER],
        leadAgentId: leadAgentId || null,
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setInstructions("");
      setStageOrderInput([...GTM_DEFAULT_STAGE_ORDER].join(", "));
      setLeadAgentId("");
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.tickets(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.inbox(selectedCompanyId!) });
      pushToast({ title: "Campaign created", body: "The GTM campaign is ready for queue work.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Campaign creation failed",
        body: error instanceof Error ? error.message : "Failed to create campaign",
        tone: "error",
      });
    },
  });

  // Phase 6: hire agent mutations
  const createHireAgent = useMutation({
    mutationFn: () =>
      gtmApi.createAgent(selectedCompanyId!, {
        name: hireName.trim(),
        adapterType: hireAdapterType,
        metadata: { surfaceProfile: "gtm" },
      }),
    onSuccess: async (agent) => {
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!) });
      setHiredAgentId(agent.id);
      setHireStep("issue");
    },
    onError: (error) => pushToast({ title: "Agent creation failed", body: error instanceof Error ? error.message : "Try again.", tone: "error" }),
  });

  const createHireIssue = useMutation({
    mutationFn: () =>
      gtmApi.createIssue(selectedCompanyId!, {
        title: hireIssueTitle.trim(),
        priority: hireIssuePriority,
        ticketId: selectedTicketId!,
        assigneeAgentId: hiredAgentId ?? (hireMode === "existing" ? hireExistingAgentId : null),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.issues(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.inbox(selectedCompanyId!) }),
      ]);
      setHireOpen(false);
      setHireName("");
      setHireExistingAgentId("");
      setHireIssueTitle("Campaign kickoff task");
      setHireStep("agent");
      setHiredAgentId(null);
      pushToast({ title: "Agent hired", body: "Agent created and seed issue added to this campaign.", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Issue creation failed", body: error instanceof Error ? error.message : "Try again.", tone: "error" }),
  });

  if (!selectedCompanyId) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Select a company to manage GTM campaigns.</div>;
  }
  if (ticketsQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading campaigns…</div>;
  }
  if (ticketsQuery.error) {
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{ticketsQuery.error instanceof Error ? ticketsQuery.error.message : "Failed to load campaigns"}</div>;
  }

  const tickets = ticketsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  const selectedTicketId = tickets.some((t) => t.id === ticketId) ? ticketId ?? null : null;
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);

  // Phase 4: ticket detail
  const ticketDetailQuery = useQuery({
    queryKey: selectedTicketId ? ["gtm", "ticket-detail", selectedTicketId] : ["gtm", "ticket-detail", "none"],
    queryFn: () => ticketsApi.get(selectedCompanyId!, selectedTicketId!),
    enabled: !!selectedCompanyId && !!selectedTicketId,
  });
  const [detailTitle, setDetailTitle] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailInstructions, setDetailInstructions] = useState("");

  useEffect(() => {
    const detail = ticketDetailQuery.data;
    if (!detail) return;
    setDetailTitle(detail.title);
    setDetailDescription(detail.description ?? "");
    setDetailInstructions(detail.instructions ?? "");
  }, [ticketDetailQuery.data]);

  const updateTicketMutation = useMutation({
    mutationFn: () =>
      ticketsApi.update(selectedCompanyId!, selectedTicketId!, {
        title: detailTitle,
        description: detailDescription,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.tickets(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", selectedTicketId!] }),
      ]);
      pushToast({ title: "Campaign updated", body: "Campaign controls saved.", tone: "success" });
    },
  });

  const advanceTicketMutation = useMutation({
    mutationFn: () => ticketsApi.advanceStage(selectedCompanyId!, selectedTicketId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.tickets(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", selectedTicketId!] }),
      ]);
      pushToast({ title: "Campaign advanced", body: "Moved campaign to the next stage.", tone: "success" });
    },
  });

  const selectedTicket = ticketDetailQuery.data ?? tickets.find((t) => t.id === selectedTicketId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">GTM workflow campaigns — customizable stages, agent gating, live pulse.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New Campaign</Button>
      </div>

      {/* Phase 3: enriched campaign list */}
      <Card>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No GTM campaigns yet. Create one to start organising queue work.</div>
          ) : (
            <div className="divide-y divide-border">
              {tickets.map((ticket) => {
                const ticketIssues = issues.filter((i) => i.ticketId === ticket.id);
                const leadAgent = agents.find((a) => a.id === (ticket as any).leadAgentId) ?? null;
                const campaignAgentIds = new Set(ticketIssues.map((i) => (i as any).assigneeAgentId).filter(Boolean));
                const hasActiveRun = runs.some((r) => campaignAgentIds.has(r.agentId) && r.status === "running");
                const stageOrder: string[] = Array.isArray((ticket as any).stageOrder) && (ticket as any).stageOrder.length > 0
                  ? (ticket as any).stageOrder
                  : [...GTM_DEFAULT_STAGE_ORDER];
                const isSelected = ticket.id === selectedTicketId;

                return (
                  <div key={ticket.id} className={cn("px-6 py-4 transition-colors", isSelected && "bg-muted/40")}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Link to={boardPath(`/tickets/${ticket.id}`)} className="font-medium hover:underline truncate">{ticket.title}</Link>
                          {hasActiveRun && (
                            <span title="Agent running" className="flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CampaignStageBar stageOrder={stageOrder} currentStage={ticket.currentStage} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{ticket.identifier}</span>
                          {ticketIssues.length > 0 && <span>{ticketIssues.length} issue{ticketIssues.length !== 1 ? "s" : ""}</span>}
                          {leadAgent && <span>Lead: {leadAgent.name}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{ticket.status}</Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 4: inline campaign detail panel */}
      {selectedTicketId && selectedTicket && (
        <CampaignDetailPanel
          ticket={selectedTicket as any}
          issues={issues as any}
          agents={agents}
          runs={runs as any}
          companyId={selectedCompanyId}
          companyIssuePrefix={selectedCompany?.issuePrefix}
          onAdvance={() => advanceTicketMutation.mutate()}
          onHireAgent={() => { setHireStep("agent"); setHiredAgentId(null); setHireOpen(true); }}
          isAdvancing={advanceTicketMutation.isPending}
        />
      )}

      {/* Create campaign dialog — Phase 2: stage customization + lead agent */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create campaign</DialogTitle>
            <DialogDescription>Create a GTM workflow campaign with custom stages and optional lead agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Campaign title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch outbound sequence for ICP A" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Goal, audience, timing, constraints." rows={2} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Instructions</label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Execution instructions for GTM agents." rows={2} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stages <span className="text-xs text-muted-foreground font-normal">(comma-separated, in order)</span></label>
              <Input value={stageOrderInput} onChange={(e) => setStageOrderInput(e.target.value)} placeholder="planning, execution, qa, human" />
            </div>
            {agents.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Lead agent <span className="text-xs text-muted-foreground font-normal">(optional)</span></label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={leadAgentId}
                  onChange={(e) => setLeadAgentId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createTicket.mutate()} disabled={!title.trim() || createTicket.isPending}>
              {createTicket.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 6: Hire agent dialog (2-step) */}
      <Dialog open={hireOpen} onOpenChange={(o) => { setHireOpen(o); if (!o) { setHireStep("agent"); setHiredAgentId(null); } }}>
        <DialogContent>
          {hireStep === "agent" ? (
            <>
              <DialogHeader>
                <DialogTitle>Hire agent for this campaign</DialogTitle>
                <DialogDescription>Create a new GTM agent or pick an existing one, then seed it with a campaign issue.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button type="button" onClick={() => setHireMode("new")} className={cn("flex-1 px-3 py-1.5 text-sm", hireMode === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>New Agent</button>
                  <button type="button" onClick={() => setHireMode("existing")} className={cn("flex-1 px-3 py-1.5 text-sm border-l border-input", hireMode === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Existing Agent</button>
                </div>
                {hireMode === "new" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Agent name</label>
                      <Input value={hireName} onChange={(e) => setHireName(e.target.value)} placeholder="SDR Browser Agent" autoFocus />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Adapter</label>
                      <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={hireAdapterType} onChange={(e) => setHireAdapterType(e.target.value)}>
                        {AGENT_ADAPTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Agent</label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={hireExistingAgentId} onChange={(e) => setHireExistingAgentId(e.target.value)}>
                      <option value="">Select agent</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setHireOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (hireMode === "new") {
                      createHireAgent.mutate();
                    } else {
                      setHiredAgentId(hireExistingAgentId || null);
                      setHireStep("issue");
                    }
                  }}
                  disabled={hireMode === "new" ? (!hireName.trim() || createHireAgent.isPending) : !hireExistingAgentId}
                >
                  {createHireAgent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Next
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Seed a campaign issue</DialogTitle>
                <DialogDescription>Create a starter issue assigned to this agent in the current campaign.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Issue title</label>
                  <Input value={hireIssueTitle} onChange={(e) => setHireIssueTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={hireIssuePriority} onChange={(e) => setHireIssuePriority(e.target.value)}>
                    {ISSUE_PRIORITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setHireStep("agent")}>Back</Button>
                <Button onClick={() => createHireIssue.mutate()} disabled={!hireIssueTitle.trim() || createHireIssue.isPending}>
                  {createHireIssue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Hire &amp; Seed Issue
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GtmQueuePage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [ticketId, setTicketId] = useState("");
  const [assigneeAgentId, setAssigneeAgentId] = useState("");

  const ticketsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.tickets(selectedCompanyId) : ["gtm", "tickets", "none"],
    queryFn: () => gtmApi.listTickets(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const agentsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.agents(selectedCompanyId) : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const issuesQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.issues(selectedCompanyId) : ["gtm", "issues", "none"],
    queryFn: () => gtmApi.listIssues(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createIssue = useMutation({
    mutationFn: () =>
      gtmApi.createIssue(selectedCompanyId!, {
        title,
        description,
        priority,
        ticketId,
        assigneeAgentId: assigneeAgentId || null,
      }),
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setTicketId("");
      setAssigneeAgentId("");
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.issues(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.inbox(selectedCompanyId!) });
      pushToast({ title: "Issue created", body: "The GTM queue item is ready for execution.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Issue creation failed",
        body: error instanceof Error ? error.message : "Failed to create issue",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Select a company to manage the GTM queue.</div>;
  }
  if (issuesQuery.isLoading || ticketsQuery.isLoading || agentsQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading queue…</div>;
  }
  if (issuesQuery.error || ticketsQuery.error || agentsQuery.error) {
    const error = issuesQuery.error ?? ticketsQuery.error ?? agentsQuery.error;
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load queue"}</div>;
  }

  const issues = issuesQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Queue</h1>
          <p className="text-sm text-muted-foreground">Queue work scoped to GTM campaigns only.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={tickets.length === 0}>New Issue</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {issues.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {tickets.length === 0 ? "Create a campaign first, then add queue work." : "No GTM issues in queue."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {issues.map((issue) => (
                <div key={issue.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <Link to={boardPath(`/issues/${issue.id}`)} className="truncate font-medium hover:underline">{issue.title}</Link>
                    <p className="truncate text-sm text-muted-foreground">{issue.identifier ?? issue.id}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{issue.priority}</Badge>
                    <Badge variant="outline">{issue.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create queue issue</DialogTitle>
            <DialogDescription>Assign GTM work to a campaign and optionally bind it to a GTM agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Issue title</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Draft 50 outbound messages" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Campaign</label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={ticketId} onChange={(event) => setTicketId(event.target.value)}>
                <option value="">Select campaign</option>
                {tickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>{ticket.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign agent</label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={assigneeAgentId} onChange={(event) => setAssigneeAgentId(event.target.value)}>
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}>
                {ISSUE_PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, acceptance criteria, and execution notes." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createIssue.mutate()} disabled={!title.trim() || !ticketId || createIssue.isPending}>Create Issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GtmInboxPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [liveRunsOpen, setLiveRunsOpen] = useState(false);
  const agentsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.agents(selectedCompanyId) : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const issuesQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.issues(selectedCompanyId) : ["gtm", "issues", "none"],
    queryFn: () => gtmApi.listIssues(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const runsQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "inbox-runs", selectedCompanyId] : ["gtm", "inbox-runs", "none"],
    queryFn: () => gtmApi.listRuns(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const cancelRun = useMutation({
    mutationFn: (runId: string) => heartbeatsApi.cancel(runId),
    onSuccess: async () => {
      if (!selectedCompanyId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox-runs", selectedCompanyId] }),
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.inbox(selectedCompanyId) }),
      ]);
    },
  });
  const retryRun = useMutation({
    mutationFn: async (run: Awaited<ReturnType<typeof heartbeatsApi.list>>[number]) => {
      const result = await agentsApi.wakeup(
        run.agentId,
        {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "retry_failed_gtm_run",
          payload: buildRunRetryPayload(run),
        },
        selectedCompanyId!,
      );
      if (!("id" in result)) {
        throw new Error("Retry was skipped because the agent is not currently invokable.");
      }
      return result;
    },
    onSuccess: async () => {
      if (!selectedCompanyId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox-runs", selectedCompanyId] }),
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.inbox(selectedCompanyId) }),
      ]);
    },
  });

  if (!selectedCompanyId) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Select a company to open the GTM inbox.</div>;
  }
  if (agentsQuery.isLoading || issuesQuery.isLoading || runsQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading inbox…</div>;
  }
  const error = agentsQuery.error ?? issuesQuery.error ?? runsQuery.error;
  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load inbox"}</div>;
  }

  const issues = [...(issuesQuery.data ?? [])].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const agentNameById = new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent.name]));
  const runs = [...(runsQuery.data ?? [])].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const liveIssueIds = new Set(
    runs
      .filter((run) => run.status === "running" || run.status === "queued")
      .map((run) => getRunIssueId(run))
      .filter((issueId): issueId is string => Boolean(issueId)),
  );
  const activeRuns = runs.filter((run) => run.status === "running" || run.status === "queued");
  const recentRuns = runs.filter((run) => !activeRuns.includes(run)).slice(0, 10);
  const visibleIssues = issues.slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">Live runs, assigned work, and issue activity for GTM agents.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Assigned issues</CardTitle>
            <CardDescription>Issue activity for GTM campaigns and GTM-assigned agents.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to={boardPath("/issues")}>View more</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {issues.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No GTM issues yet. Runs without issue assignments still appear above.</div>
          ) : (
            <div className="divide-y divide-border">
              {visibleIssues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  desktopMetaLeading={(
                    <>
                      <span className="hidden sm:inline-flex">
                        <PriorityIcon priority={issue.priority} />
                      </span>
                      <span className="hidden shrink-0 sm:inline-flex">
                        <StatusIcon status={issue.status} />
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {issue.identifier ?? issue.id.slice(0, 8)}
                      </span>
                      {liveIssueIds.has(issue.id) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 sm:gap-1.5 sm:px-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                          </span>
                          <span className="hidden text-[11px] font-medium text-blue-600 dark:text-blue-400 sm:inline">
                            Live
                          </span>
                        </span>
                      ) : null}
                    </>
                  )}
                  mobileMeta={`updated ${timeAgo(issue.updatedAt)}`}
                  trailingMeta={`updated ${timeAgo(issue.updatedAt)}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Live runs</CardTitle>
            <CardDescription>Manage active and recent GTM agent execution directly from the inbox.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setLiveRunsOpen((current) => !current)}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", liveRunsOpen ? "rotate-180" : "")} />
          </Button>
        </CardHeader>
        {liveRunsOpen ? (
          <CardContent className="space-y-3">
            {runs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No GTM runs yet.</div>
            ) : (
              <>
                {(activeRuns.length > 0 ? activeRuns : recentRuns).map((run) => {
                  const issueId = getRunIssueId(run);
                  const issue = issueId ? issueMap.get(issueId) ?? null : null;
                  const canCancel = run.status === "running" || run.status === "queued";
                  const canRetry = run.status === "failed" || run.status === "timed_out";
                  return (
                    <div key={run.id} className="rounded-md border border-border p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={run.status} />
                            <span className="text-sm font-medium">{run.invocationSource.replaceAll("_", " ")}</span>
                            <span className="text-xs text-muted-foreground">{relativeTime(run.updatedAt)}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Agent <span className="font-medium text-foreground">{agentNameById.get(run.agentId) ?? run.agentId}</span>
                            {run.triggerDetail ? <> · trigger {run.triggerDetail}</> : null}
                          </div>
                          {issue ? (
                            <Link to={boardPath(`/issues/${issue.id}`)} className="block text-sm font-medium hover:underline">
                              {issue.identifier ?? issue.id.slice(0, 8)} · {issue.title}
                            </Link>
                          ) : (
                            <div className="text-sm text-muted-foreground">No assigned GTM issue linked to this run yet.</div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link to={boardPath(`/agents/${run.agentId}/runs/${run.id}`)}>
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              View run
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryRun.mutate(run)}
                            disabled={!canRetry || retryRun.isPending}
                          >
                            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelRun.mutate(run.id)}
                            disabled={!canCancel || cancelRun.isPending}
                          >
                            Pause
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function GtmCompaniesPage() {
  const { companies, selectedCompany } = useCompany();
  const { openOnboarding } = useDialog();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Workspace Management</h1>
          <p className="text-sm text-muted-foreground">Company selection and GTM workspace setup.</p>
        </div>
        <Button onClick={() => openOnboarding()}>Add Company</Button>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {companies.map((company) => (
            <div key={company.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="font-medium">{company.name}</p>
                <p className="text-sm text-muted-foreground">{company.issuePrefix}</p>
              </div>
              {selectedCompany?.id === company.id ? <Badge>Active</Badge> : <Badge variant="outline">Available</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function GtmSettingsPage() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceBrandColor, setWorkspaceBrandColor] = useState("");
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const profileQuery = useQuery({ queryKey: ["gtm", "profile"], queryFn: () => gtmApi.getProfile() });
  const knowledgeQuery = useQuery({ queryKey: ["gtm", "knowledge"], queryFn: () => gtmApi.getKnowledge() });
  const connectorsQuery = useQuery({ queryKey: ["gtm", "connectors"], queryFn: () => gtmApi.getConnectors() });
  const connectionQuery = useQuery({ queryKey: ["gtm", "connection"], queryFn: () => gtmApi.getConnection() });
  const workflowQuery = useQuery({ queryKey: ["gtm", "workflow"], queryFn: () => gtmApi.getWorkflow() });
  const runsQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "runs", selectedCompanyId] : ["gtm", "runs", "none"],
    queryFn: () => gtmApi.listRuns(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const testConnectionMutation = useMutation({
    mutationFn: () => gtmApi.testConnection(),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "connection"] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "connectors"] }),
      ]);
      pushToast({ title: "Growthub pulse succeeded", body: result.message, tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Growthub pulse failed",
        body: error instanceof Error ? error.message : "Failed to verify the Growthub local route handler",
        tone: "error",
      });
    },
  });
  const disconnectConnectionMutation = useMutation({
    mutationFn: () => gtmApi.disconnectConnection(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "connection"] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "connectors"] }),
      ]);
      pushToast({ title: "Growthub disconnected", body: "Local connection state was cleared for this installer.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Disconnect failed",
        body: error instanceof Error ? error.message : "Failed to disconnect Growthub locally",
        tone: "error",
      });
    },
  });
  const workspaceDirty =
    !!selectedCompany
    && (workspaceName !== selectedCompany.name
      || workspaceDescription !== (selectedCompany.description ?? "")
      || workspaceBrandColor !== (selectedCompany.brandColor ?? ""));
  const generalMutation = useMutation({
    mutationFn: (data: { name: string; description: string | null; brandColor: string | null }) =>
      companiesApi.update(selectedCompanyId!, data),
    onSuccess: async (company) => {
      setWorkspaceLogoUrl(company.logoUrl ?? "");
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      pushToast({ title: "Workspace updated", body: "GTM workspace customization saved.", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "Workspace update failed",
        body: error instanceof Error ? error.message : "Failed to save workspace customization",
        tone: "error",
      });
    },
  });
  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const asset = await assetsApi.uploadCompanyLogo(selectedCompanyId!, file);
      return companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId });
    },
    onSuccess: async (company) => {
      setLogoUploadError(null);
      setWorkspaceLogoUrl(company.logoUrl ?? "");
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      pushToast({ title: "Logo updated", body: "Workspace logo saved.", tone: "success" });
    },
    onError: (error) => {
      setLogoUploadError(error instanceof Error ? error.message : "Logo upload failed");
    },
  });
  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: async (company) => {
      setLogoUploadError(null);
      setWorkspaceLogoUrl(company.logoUrl ?? "");
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      pushToast({ title: "Logo removed", body: "Workspace logo removed.", tone: "success" });
    },
    onError: (error) => {
      setLogoUploadError(error instanceof Error ? error.message : "Failed to remove workspace logo");
    },
  });
  useEffect(() => {
    if (!selectedCompany) return;
    setWorkspaceName(selectedCompany.name);
    setWorkspaceDescription(selectedCompany.description ?? "");
    setWorkspaceBrandColor(selectedCompany.brandColor ?? "");
    setWorkspaceLogoUrl(selectedCompany.logoUrl ?? "");
    setLogoUploadError(null);
  }, [selectedCompany]);

  if (profileQuery.isLoading || knowledgeQuery.isLoading || connectorsQuery.isLoading || connectionQuery.isLoading || workflowQuery.isLoading || runsQuery.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading settings…</div>;
  }

  const error = profileQuery.error ?? knowledgeQuery.error ?? connectorsQuery.error ?? connectionQuery.error ?? workflowQuery.error ?? runsQuery.error;
  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load settings"}</div>;
  }

  const profile = profileQuery.data!;
  const knowledge = knowledgeQuery.data!;
  const connectors = connectorsQuery.data!;
  const connection = connectionQuery.data!;
  const workflow = workflowQuery.data!;
  const recentRuns = (runsQuery.data ?? []).slice(0, 4);
  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file || !selectedCompanyId) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  };
  const handleSaveWorkspace = () => {
    if (!selectedCompanyId) return;
    generalMutation.mutate({
      name: workspaceName.trim(),
      description: workspaceDescription.trim() || null,
      brandColor: workspaceBrandColor || null,
    });
  };
  const openConnectionConfiguration = () => {
    if (!connection.baseUrl?.trim()) {
      pushToast({
        title: "Growthub base URL missing",
        body: "Configure the hosted Growthub URL before opening the local callback flow.",
        tone: "error",
      });
      return;
    }
    const userId = getGrowthubAuthUserId(sessionQuery.data ?? null);
    if (!userId) {
      pushToast({
        title: "Sign in required",
        body: "Sign in locally before opening the hosted Growthub configuration flow.",
        tone: "error",
      });
      return;
    }
    const url = buildGrowthubConfigurationUrl({
      baseUrl: connection.baseUrl,
      callbackUrl: connection.callbackUrl,
      userId,
      surface: "gtm",
      workspaceLabel: selectedCompany?.name ?? profile.workspace ?? "GTM Workspace",
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Workspace Customization</CardTitle>
          <CardDescription>Customize this GTM workspace without crossing into DX-only settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={workspaceName || selectedCompany?.name || "Workspace"}
                logoUrl={workspaceLogoUrl || null}
                brandColor={workspaceBrandColor || null}
                className="h-16 w-16 rounded-2xl text-xl"
              />
            </div>
            <div className="grid flex-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Workspace name</label>
                <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Brand color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={workspaceBrandColor || "#6366f1"}
                    onChange={(event) => setWorkspaceBrandColor(event.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <Input
                    value={workspaceBrandColor}
                    placeholder="Auto"
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "" || /^#[0-9a-fA-F]{0,6}$/.test(next)) {
                        setWorkspaceBrandColor(next);
                      }
                    }}
                    className="font-mono"
                  />
                  {workspaceBrandColor ? (
                    <Button variant="ghost" size="sm" onClick={() => setWorkspaceBrandColor("")}>Clear</Button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={workspaceDescription}
                  onChange={(event) => setWorkspaceDescription(event.target.value)}
                  placeholder="Optional workspace description"
                  rows={3}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Logo</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  onChange={handleLogoFileChange}
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-2 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {workspaceLogoUrl ? (
                    <Button variant="outline" size="sm" onClick={() => clearLogoMutation.mutate()} disabled={clearLogoMutation.isPending}>
                      {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                    </Button>
                  ) : null}
                  {logoUploadMutation.isPending ? <span className="text-xs text-muted-foreground">Uploading logo...</span> : null}
                  {logoUploadError ? <span className="text-xs text-destructive">{logoUploadError}</span> : null}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveWorkspace} disabled={!workspaceDirty || generalMutation.isPending || !workspaceName.trim()}>
              {generalMutation.isPending ? "Saving..." : "Save workspace customization"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Visible GTM workspace configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Workspace:</span> {profile.workspace}</div>
          <div><span className="text-muted-foreground">Account:</span> {profile.account}</div>
          <div className="break-all"><span className="text-muted-foreground">App:</span> {profile.appConnection}</div>
        </CardContent>
      </Card>
      <GrowthubConnectionCard
        description="Open the hosted auth flow and return to this local callback."
        connected={connection.connected}
        baseUrl={connection.baseUrl}
        callbackUrl={connection.callbackUrl}
        portalBaseUrl={connection.portalBaseUrl}
        machineLabel={connection.machineLabel}
        workspaceLabel={connection.workspaceLabel}
        onOpenConfiguration={openConnectionConfiguration}
        onRefresh={() => {
          void connectionQuery.refetch();
          void connectorsQuery.refetch();
        }}
        onPulseConnection={connection.connected ? () => testConnectionMutation.mutate() : undefined}
        onDisconnect={connection.connected ? () => disconnectConnectionMutation.mutate() : undefined}
        pulsePending={testConnectionMutation.isPending}
        disconnectPending={disconnectConnectionMutation.isPending}
        openDisabled={!connection.baseUrl?.trim()}
      />
      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
          <CardDescription>Workflow, connection state, and recent pulses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Workflow:</span> {workflow.label}</div>
          <div><span className="text-muted-foreground">Status:</span> {workflow.status}</div>
          <div className="break-all"><span className="text-muted-foreground">Runner:</span> {workflow.runner}</div>
          <div>
            <span className="text-muted-foreground">Pulses:</span>
            {recentRuns.length === 0 ? (
              <span className="ml-2 text-muted-foreground">No runs yet.</span>
            ) : (
              <div className="mt-2 space-y-2">
                {recentRuns.map((run) => (
                  <div key={run.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{run.status}</p>
                      <span className="text-xs text-muted-foreground">{formatRelativeDate(run.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{run.triggerDetail ?? run.invocationSource}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Knowledge</CardTitle>
          <CardDescription>Knowledge group visible to GTM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Group:</span> {knowledge.group.label}</div>
          <div><span className="text-muted-foreground">Items:</span> {knowledge.group.itemCount}</div>
          <div><span className="text-muted-foreground">Connector:</span> {knowledge.group.connector}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connectors</CardTitle>
          <CardDescription>Connector visibility for GTM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {connectors.length === 0 ? (
            <p className="text-muted-foreground">No connectors configured.</p>
          ) : (
            connectors.map((connector) => (
              <div key={connector.label}>
                <p className="font-medium">{connector.label}</p>
                <p className="text-muted-foreground">{connector.summary}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GtmShell() {
  const { selectedCompany } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const navItems = useMemo(
    () => [
      { to: "/workspace", label: "Workspace", icon: BriefcaseBusiness },
      { to: "/tickets", label: "Campaigns", icon: Ticket },
      { to: "/agents/all", label: "Agents", icon: Users },
      { to: "/issues", label: "Queue", icon: Workflow },
      { to: "/inbox", label: "Inbox", icon: InboxIcon },
      { to: "/companies", label: "Companies", icon: Building2 },
      { to: "/company/settings", label: "Settings", icon: Settings },
    ],
    [],
  );
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);

  return (
    <div className="bg-background text-foreground pt-[env(safe-area-inset-top)] md:flex md:h-dvh md:overflow-hidden">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close GTM navigation"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-background transition-transform duration-150 md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyPatternIcon
              companyName={selectedCompany?.name ?? "Workspace"}
              logoUrl={selectedCompany?.logoUrl ?? null}
              brandColor={selectedCompany?.brandColor ?? null}
              className="h-9 w-9 rounded-xl text-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selectedCompany?.name ?? "Workspace"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {selectedCompany?.description?.trim() || "GTM workspace"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.includes(item.to);
              return (
                <Button
                  key={item.to}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  className="justify-start"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Link to={boardPath(item.to)}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-full">
        <BreadcrumbBar />
        <div className="min-h-0 flex-1 overflow-auto">
          <main id="main-content" tabIndex={-1} className="p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <ToastViewport />
    </div>
  );
}

function gtmBoardRoutes() {
  return (
    <>
      <Route index element={<Navigate to="workspace" replace />} />
      <Route path="dashboard" element={<Navigate to="../workspace" replace />} />
      <Route path="workspace" element={<GtmWorkspacePage />} />
      <Route path="onboarding" element={<OnboardingRoutePage />} />
      <Route path="companies" element={<GtmCompaniesPage />} />
      <Route path="company/settings" element={<GtmSettingsPage />} />
      <Route path="agents" element={<Navigate to="../agents/all" replace />} />
      <Route path="agents/all" element={<GtmAgentsPage />} />
      <Route path="agents/active" element={<GtmAgentsPage />} />
      <Route path="agents/paused" element={<GtmAgentsPage />} />
      <Route path="agents/error" element={<GtmAgentsPage />} />
      <Route path="agents/new" element={<GtmAgentsPage />} />
      <Route path="agents/:agentId" element={<AgentDetail />} />
      <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
      <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
      <Route path="tickets" element={<GtmCampaignsPage />} />
      <Route path="tickets/:ticketId" element={<TicketDetail />} />
      <Route path="issues" element={<GtmQueuePage />} />
      <Route path="issues/all" element={<GtmQueuePage />} />
      <Route path="issues/active" element={<GtmQueuePage />} />
      <Route path="issues/backlog" element={<GtmQueuePage />} />
      <Route path="issues/done" element={<GtmQueuePage />} />
      <Route path="issues/recent" element={<GtmQueuePage />} />
      <Route path="issues/:issueId" element={<IssueDetail />} />
      <Route path="activity" element={<GtmInboxPage />} />
      <Route path="inbox" element={<GtmInboxPage />} />
      <Route path="inbox/recent" element={<GtmInboxPage />} />
      <Route path="inbox/unread" element={<GtmInboxPage />} />
      <Route path="inbox/all" element={<GtmInboxPage />} />
      <Route path="inbox/new" element={<GtmInboxPage />} />
      <Route path="*" element={<NotFoundPage scope="board" />} />
    </>
  );
}

export function GtmApp() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={toSurfacePath()} replace />} />
      <Route path="auth" element={<AuthPage />} />
      <Route path="board-claim/:token" element={<BoardClaimPage />} />
      <Route path="invite/:token" element={<InviteLandingPage />} />

      <Route element={<CloudAccessGate />}>
        <Route path={SURFACE_ROUTE_PATH} element={<CompanyRootRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/onboarding`} element={<OnboardingRoutePage />} />
        <Route path={`${SURFACE_ROUTE_PATH}/companies`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/tickets`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/tickets/:ticketId`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/issues`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/issues/:issueId`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/activity`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/inbox`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/new`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/:agentId`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/:agentId/:tab`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/:agentId/runs/:runId`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/:companyPrefix`} element={<GtmShell />}>
          {gtmBoardRoutes()}
        </Route>
        <Route path="dx/*" element={<NotFoundPage scope="global" />} />
        <Route path="*" element={<NotFoundPage scope="global" />} />
      </Route>
    </Routes>
  );
}
