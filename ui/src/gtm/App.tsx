import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "@/lib/router";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { accessApi } from "@/api/access";
import { approvalsApi } from "@/api/approvals";
import { ApiError } from "@/api/client";
import { ticketsApi } from "@/api/tickets";
import { issuesApi } from "@/api/issues";
import { heartbeatsApi } from "@/api/heartbeats";
import type { Approval, JoinRequest } from "@paperclipai/shared";
import { approvalLabel, defaultTypeIcon, typeIcon } from "@/components/ApprovalPayload";
import { queryKeys } from "@/lib/queryKeys";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useDialog } from "@/context/DialogContext";
import { shouldRedirectCompanylessRouteToOnboarding } from "@/lib/onboarding-route";
import { surfaceRouteMount, toSurfacePath } from "@/lib/surface-profile";
import { AuthPage } from "@/pages/Auth";
import { BoardClaimPage } from "@/pages/BoardClaim";
import { InviteLandingPage } from "@/pages/InviteLanding";
import { NotFoundPage } from "@/pages/NotFound";
import { AgentDetail } from "@/pages/AgentDetail";
import { IssueDetail } from "@/pages/IssueDetail";
import { OrgChart } from "@/pages/OrgChart";
import { BreadcrumbBar } from "@/components/BreadcrumbBar";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { GrowthubConnectionCard } from "@/components/GrowthubConnectionCard";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { GtmAgentModal } from "@/components/GtmAgentModal";
import { GtmCampaignDetail } from "@/components/GtmCampaignDetail";
import { GtmCampaignModal } from "@/components/GtmCampaignModal";
import { KnowledgeBase } from "@/components/KnowledgeBase";
import { ToastViewport } from "@/components/ToastViewport";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { timeAgo } from "@/lib/timeAgo";
import { buildGrowthubConfigurationUrl, getGrowthubAuthUserId } from "@/lib/growthub-connection";
import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Inbox as InboxIcon,
  Link2,
  Loader2,
  Moon,
  Pause,
  Play,
  Settings,
  Sun,
  Ticket,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { getRecentTouchedIssues, getUnreadTouchedIssues, sortIssuesByMostRecentActivity } from "@/lib/inbox";
import {
  buildGtmLiveAgentIdSet,
  filterAgentsForGtmDirectoryUi,
  parseGtmAgentsListSegment,
} from "@/gtm/lib/gtm-agent-filters";
import {
  loadGtmLastInboxTab,
  parseGtmInboxTabFromPath,
  saveGtmLastInboxTab,
  type GtmInboxTab,
} from "@/gtm/lib/gtm-inbox-tab";
import {
  isGtmAgentsLayout,
  loadGtmAgentsLayoutFavorite,
  normalizeGtmAgentsLayoutParam,
  resolveGtmAgentsLayoutWithoutUrlParam,
  saveGtmAgentsLayout,
  toggleGtmAgentsLayoutFavorite,
  type GtmAgentsLayout,
} from "@/gtm/lib/gtm-agents-layout";
import { PaperclipViewLayoutToggle, PAPERCLIP_VIEW_LAYOUT_ICONS } from "@/components/PaperclipViewLayoutToggle";
import { GtmAgentsViewToggle } from "@/gtm/components/GtmAgentsViewToggle";
import { GtmAgentsListView } from "@/gtm/components/GtmAgentsListView";
import { GtmAgentsKanbanView } from "@/gtm/components/GtmAgentsKanbanView";
import { GtmAgentsTableView } from "@/gtm/components/GtmAgentsTableView";
import { GtmIssuesKanbanView } from "@/gtm/components/GtmIssuesKanbanView";
import { GtmIssuesTableView } from "@/gtm/components/GtmIssuesTableView";
import { GtmIssuesCalendarView } from "@/gtm/components/GtmIssuesCalendarView";
import { GtmIssuesListView } from "@/gtm/components/GtmIssuesListView";
import { GtmInboxIssuesToolbar } from "@/gtm/components/GtmInboxIssuesToolbar";
import { GtmInboxHiddenIssuesSheet } from "@/gtm/components/GtmInboxHiddenIssuesSheet";
import {
  filterIssuesByAssignee,
  filterIssuesBySearch,
  filterIssuesByStatus,
  filterIssuesByUpdatedRange,
  inboxIssueDateBounds,
  parseGtmInboxAssigneeSearchParam,
  type GtmInboxIssueAssigneeFilter,
  type GtmInboxIssueDatePreset,
  type GtmInboxIssueStatusFilter,
} from "@/gtm/lib/gtm-inbox-issue-filters";
import {
  isGtmInboxIssuesViewLayout,
  loadGtmInboxIssuesLayoutFavorite,
  normalizeGtmInboxIssuesLayoutParam,
  resolveGtmInboxIssuesLayoutWithoutUrlParam,
  saveGtmInboxIssuesLayout,
  toggleGtmInboxIssuesLayoutFavorite,
  type GtmInboxIssuesViewLayout,
} from "@/gtm/lib/gtm-inbox-issues-layout";

const SURFACE_ROUTE_PATH = surfaceRouteMount.slice(1);
const SURFACE_ROUTE_PREFIX_PATTERN = new RegExp(`^${surfaceRouteMount}(?=/|$)`);
const GTM_QUERY_KEYS = {
  agents: (companyId: string, scope: "default" | "trash" = "default") =>
    ["gtm", "agents", companyId, scope] as const,
  tickets: (companyId: string) => ["gtm", "tickets", companyId] as const,
  issues: (companyId: string) => ["gtm", "issues", companyId] as const,
  hiddenIssues: (companyId: string) => ["gtm", "issues-hidden", companyId] as const,
};

const GTM_INBOX_ISSUE_VIEW_TABS = [
  { id: "list" as const, label: "List", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.list },
  { id: "kanban" as const, label: "Kanban", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.kanban },
  { id: "table" as const, label: "Table", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.table },
  { id: "calendar" as const, label: "Calendar", icon: PAPERCLIP_VIEW_LAYOUT_ICONS.calendar },
];

const ISSUE_PRIORITY_OPTIONS = ["critical", "high", "medium", "low"] as const;

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
  const scopedPrefix = companyPrefix ? `/${companyPrefix}` : "";
  return toSurfacePath(`${scopedPrefix}${normalizedBoardPath}`);
}

/** Path after /gtm/:companyPrefix (leading slash, e.g. /agents/foo, /inbox/recent). */
function gtmBoardRelativePathname(pathname: string): string {
  const pathAfterSurface = pathname.replace(SURFACE_ROUTE_PREFIX_PATTERN, "");
  const segments = pathAfterSurface.split("/").filter(Boolean);
  const rest = segments.slice(1).join("/");
  return rest ? `/${rest}` : "/";
}

function isGtmShellNavItemActive(boardRelative: string, itemTo: string): boolean {
  const to = itemTo.startsWith("/") ? itemTo : `/${itemTo}`;

  if (to === "/inbox") {
    return (
      boardRelative === "/inbox" ||
      boardRelative.startsWith("/inbox/") ||
      boardRelative === "/activity" ||
      boardRelative.startsWith("/activity/") ||
      boardRelative.startsWith("/issues/")
    );
  }

  if (to === "/agents/all") {
    return boardRelative === "/agents" || boardRelative.startsWith("/agents/");
  }

  if (to === "/workspace") {
    return boardRelative === "/workspace" || boardRelative.startsWith("/workspace/");
  }

  if (to === "/tickets") {
    return boardRelative === "/tickets" || boardRelative.startsWith("/tickets/");
  }

  if (to === "/knowledge-base") {
    return boardRelative === "/knowledge-base" || boardRelative.startsWith("/knowledge-base/");
  }

  if (to === "/companies") {
    return boardRelative === "/companies" || boardRelative.startsWith("/companies/");
  }

  if (to === "/company/settings") {
    return boardRelative === "/company/settings" || boardRelative.startsWith("/company/settings/");
  }

  const head = to.split("/").filter(Boolean)[0];
  if (!head) return boardRelative === to;
  const root = `/${head}`;
  return boardRelative === to || boardRelative.startsWith(`${root}/`);
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
  const { openOnboarding } = useDialog();

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create your first company</h1>
        <p className="mt-2 text-sm text-muted-foreground">Get started by creating a company.</p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>New Company</Button>
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

function GtmWorkspacePage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { companyPrefix: routeCompanyPrefix } = useParams<{ companyPrefix?: string }>();
  const boardCompanyPrefix = selectedCompany?.issuePrefix ?? routeCompanyPrefix ?? null;

  const agentsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.agents(selectedCompanyId) : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const ticketsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.tickets(selectedCompanyId) : ["gtm", "tickets", "none"],
    queryFn: () => gtmApi.listTickets(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const knowledgeQuery = useQuery({
    queryKey: ["gtm", "knowledge"],
    queryFn: () => gtmApi.getKnowledge(),
  });
  const issuesQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.issues(selectedCompanyId) : ["gtm", "issues", "none"],
    queryFn: () => gtmApi.listIssues(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Select or create a company to open the GTM workspace.
      </div>
    );
  }

  const loading = agentsQuery.isLoading || ticketsQuery.isLoading || knowledgeQuery.isLoading || issuesQuery.isLoading;
  if (loading) {
    return <div className="py-8 text-sm text-muted-foreground">Loading workspace…</div>;
  }

  const err = agentsQuery.error ?? ticketsQuery.error ?? knowledgeQuery.error ?? issuesQuery.error;
  if (err) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">
        {err instanceof Error ? err.message : "Failed to load workspace"}
      </div>
    );
  }

  const agents = filterAgentsForGtmDirectoryUi(agentsQuery.data ?? []);
  const tickets = ticketsQuery.data ?? [];
  const knowledge = knowledgeQuery.data!;
  const issues = issuesQuery.data ?? [];
  const boardPath = (path: string) => buildGtmBoardPath(boardCompanyPrefix, path);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <GtmMetricCard
        title="Agents"
        value={String(agents.length)}
        detail="GTM-configured agents"
        icon={Users}
        to={boardPath("/agents/all")}
      />
      <GtmMetricCard
        title="Campaigns"
        value={String(tickets.length)}
        detail="Workflow tickets"
        icon={Ticket}
        to={boardPath("/tickets")}
      />
      <GtmMetricCard
        title="Inbox"
        value={String(issues.length)}
        detail="Open issues"
        icon={InboxIcon}
        to={boardPath("/inbox/all")}
      />
      <GtmMetricCard
        title="Knowledge"
        value={String(knowledge.items.length)}
        detail="Workspace Knowledge"
        icon={Database}
        to={boardPath("/knowledge-base")}
      />
    </div>
  );
}

function GtmMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  to,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Users;
  to: string;
}) {
  return (
    <Card className="h-full transition-colors hover:bg-muted/30">
      <Link to={to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardContent className="flex items-start justify-between gap-4 pt-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          </div>
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

function GtmAgentsPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const listSegment = parseGtmAgentsListSegment(location.pathname);
  const isTrash = listSegment === "trash";
  const viewParam = searchParams.get("view");
  const layout: GtmAgentsLayout = normalizeGtmAgentsLayoutParam(viewParam);
  const [favoriteAgentView, setFavoriteAgentView] = useState<GtmAgentsLayout | null>(() => loadGtmAgentsLayoutFavorite());

  useEffect(() => {
    if (!isGtmAgentsLayout(viewParam)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", resolveGtmAgentsLayoutWithoutUrlParam());
          return next;
        },
        { replace: true },
      );
    }
  }, [viewParam, setSearchParams]);

  const setAgentsLayout = useCallback(
    (next: GtmAgentsLayout) => {
      saveGtmAgentsLayout(next);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("view", next);
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** Legacy status routes: status is per-agent; inventory always shows everyone. */
  useEffect(() => {
    const seg = listSegment;
    if (seg === "active" || seg === "paused" || seg === "error") {
      navigate(
        {
          pathname: buildGtmBoardPath(selectedCompany?.issuePrefix, "/agents/all"),
          search: location.search,
        },
        { replace: true },
      );
    }
  }, [listSegment, selectedCompany?.issuePrefix, location.search, navigate]);

  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (listSegment === "new") {
      setOpen(true);
    }
  }, [listSegment]);

  useEffect(() => {
    if (!selectedCompany) {
      setBreadcrumbs([]);
      return;
    }
    const agentsListHref = buildGtmBoardPath(selectedCompany.issuePrefix, "/agents/all");
    if (listSegment === "trash") {
      setBreadcrumbs([
        { label: "Agents", href: agentsListHref },
        { label: "Removed agents" },
      ]);
      return;
    }
    if (listSegment === "new") {
      setBreadcrumbs([
        { label: "Agents", href: agentsListHref },
        { label: "New agent" },
      ]);
      return;
    }
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs, selectedCompany, listSegment]);

  const agentsQuery = useQuery({
    queryKey: selectedCompanyId
      ? GTM_QUERY_KEYS.agents(selectedCompanyId, isTrash ? "trash" : "default")
      : ["gtm", "agents", "none"],
    queryFn: () => gtmApi.listAgents(selectedCompanyId!, isTrash ? "trash" : "default"),
    enabled: !!selectedCompanyId,
  });

  const activityRunsQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "agents-tab-runs", selectedCompanyId] : ["gtm", "agents-tab-runs", "none"],
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 80),
    enabled: !!selectedCompanyId && !isTrash,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, agentId }: { action: "invoke" | "pause" | "resume" | "restore"; agentId: string }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      if (action === "invoke") return gtmApi.invokeAgent(agentId, selectedCompanyId);
      if (action === "pause") return gtmApi.pauseAgent(agentId, selectedCompanyId);
      if (action === "restore") return gtmApi.restoreTerminatedAgent(agentId, selectedCompanyId);
      return gtmApi.resumeAgent(agentId, selectedCompanyId);
    },
    onSuccess: async (_, { action }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "agents", selectedCompanyId!] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "agents-tab-runs", selectedCompanyId!] }),
      ]);
      if (action === "restore") {
        pushToast({
          title: "Agent restored",
          body: "Agent is idle again. Create new API keys if the old ones were revoked at termination.",
          tone: "success",
        });
      }
    },
    onError: (error) => {
      pushToast({
        title: "Agent action failed",
        body: error instanceof Error ? error.message : "Failed to control agent",
        tone: "error",
      });
    },
  });

  const sweepMutation = useMutation({
    mutationFn: () => gtmApi.sweepStrayProcesses(selectedCompanyId!),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!, "default") }),
        queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.agents(selectedCompanyId!, "trash") }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "agents-tab-runs", selectedCompanyId!] }),
      ]);
      pushToast({
        title: "Runs stopped",
        body: `Cancelled ${data.cancelledRuns} run(s); cleared ${data.examined} queued item(s). External CLIs (not started by this server) must be closed manually.`,
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Could not stop runs",
        body: error instanceof Error ? error.message : "Sweep failed",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Select a company to manage GTM agents.</div>;
  }

  const awaitingRuns = !isTrash && activityRunsQuery.isLoading;
  if (agentsQuery.isLoading || awaitingRuns) {
    return <div className="py-8 text-sm text-muted-foreground">Loading agents…</div>;
  }
  if (agentsQuery.error) {
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{agentsQuery.error instanceof Error ? agentsQuery.error.message : "Failed to load agents"}</div>;
  }
  if (!isTrash && activityRunsQuery.error) {
    const err = activityRunsQuery.error;
    return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">{err instanceof Error ? err.message : "Failed to load agent activity"}</div>;
  }

  const liveAgentIds = buildGtmLiveAgentIdSet(activityRunsQuery.data ?? []);
  const rawAgents = agentsQuery.data ?? [];
  const agents = filterAgentsForGtmDirectoryUi(rawAgents);
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{isTrash ? "Removed agents" : "Agents"}</h1>
          <p className="text-sm text-muted-foreground">
            {isTrash
              ? "Terminated agents — use Restore to return them to the main list (issue new API keys if needed)."
              : "GTM-only agent inventory and controls."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isTrash ? (
            <>
              <Button variant="outline" asChild>
                <Link to={boardPath("/agents/org-chart")}>Org Chart</Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={sweepMutation.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Stop all queued and running Paperclip heartbeats for this company, cancel pending invocations, and release the shared Chrome lease? This does not delete agents.",
                    )
                  ) {
                    return;
                  }
                  sweepMutation.mutate();
                }}
              >
                {sweepMutation.isPending ? "Stopping…" : "Stop all runs"}
              </Button>
              <Button onClick={() => navigate({ pathname: boardPath("/agents/new"), search: location.search })}>New Agent</Button>
            </>
          ) : (
            <Button variant="outline" asChild>
              <Link to={{ pathname: boardPath("/agents/all"), search: location.search }}>Back to agents</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GtmAgentsViewToggle
            value={layout}
            onValueChange={setAgentsLayout}
            favoriteLayout={favoriteAgentView}
            onFavoriteToggle={(id) => setFavoriteAgentView(toggleGtmAgentsLayoutFavorite(id))}
          />
          {!isTrash ? (
            <Button variant="outline" size="icon" className="shrink-0" asChild title="Removed agents">
              <Link to={{ pathname: boardPath("/agents/trash"), search: location.search }} aria-label="View removed agents">
                <Archive className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {agents.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {isTrash
                ? "No terminated agents in this workspace."
                : "No GTM agents configured yet."}
            </div>
          ) : layout === "kanban" ? (
            <GtmAgentsKanbanView
              agents={agents}
              isTrash={isTrash}
              liveAgentIds={liveAgentIds}
              boardPath={boardPath}
              onAgentAction={(payload) => actionMutation.mutate(payload)}
            />
          ) : layout === "table" ? (
            <GtmAgentsTableView
              agents={agents}
              isTrash={isTrash}
              liveAgentIds={liveAgentIds}
              boardPath={boardPath}
              onAgentAction={(payload) => actionMutation.mutate(payload)}
            />
          ) : (
            <GtmAgentsListView
              agents={agents}
              isTrash={isTrash}
              liveAgentIds={liveAgentIds}
              boardPath={boardPath}
              onAgentAction={(payload) => actionMutation.mutate(payload)}
            />
          )}
        </CardContent>
      </Card>

      <GtmAgentModal
        open={open}
        onClose={() => {
          setOpen(false);
          if (listSegment === "new") {
            navigate({ pathname: boardPath("/agents/all"), search: location.search }, { replace: true });
          }
        }}
        companyId={selectedCompanyId}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ["gtm", "agents", selectedCompanyId] });
        }}
      />
    </div>
  );
}

function GtmCampaignsPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: selectedCompanyId ? GTM_QUERY_KEYS.tickets(selectedCompanyId) : ["gtm", "tickets", "none"],
    queryFn: () => gtmApi.listTickets(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const campaignAction = useMutation({
    mutationFn: async ({ action, ticketId }: { action: "pause" | "resume" | "duplicate" | "archive"; ticketId: string }) => {
      if (!selectedCompanyId) throw new Error("No company");
      if (action === "pause") {
        return ticketsApi.update(selectedCompanyId, ticketId, { status: "paused" } as Record<string, unknown>);
      }
      if (action === "resume") {
        return ticketsApi.update(selectedCompanyId, ticketId, { status: "active" } as Record<string, unknown>);
      }
      if (action === "archive") {
        return ticketsApi.update(selectedCompanyId, ticketId, { status: "archived" } as Record<string, unknown>);
      }
      // duplicate
      const source = ticketsQuery.data?.find((t) => t.id === ticketId);
      if (!source) throw new Error("Ticket not found");
      return ticketsApi.create(selectedCompanyId, {
        title: `${source.title} (copy)`,
        description: source.description ?? undefined,
        instructions: source.instructions ?? undefined,
        leadAgentId: source.leadAgentId,
        metadata: source.metadata as Record<string, unknown> | undefined,
      });
    },
    onSuccess: async (_, { action }) => {
      if (!selectedCompanyId) return;
      await queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.tickets(selectedCompanyId) });
      const labels: Record<string, string> = { pause: "Campaign paused", resume: "Campaign resumed", duplicate: "Campaign duplicated", archive: "Campaign archived" };
      pushToast({ title: labels[action] ?? "Done", tone: "success" });
    },
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">GTM workflow tickets only.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New Campaign</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No GTM campaigns yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {tickets.map((ticket) => {
                const statusColor =
                  ticket.status === "active" ? "bg-green-500" :
                  ticket.status === "paused" ? "bg-yellow-500" :
                  ticket.status === "completed" ? "bg-blue-500" :
                  ticket.status === "archived" ? "bg-gray-400" :
                  "bg-gray-400";
                return (
                  <div key={ticket.id} className="flex items-center gap-4 px-6 py-3.5">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setDetailTicketId(ticket.id)}>
                      <p className="truncate text-sm font-medium hover:underline">{ticket.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{ticket.identifier}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 mr-1">
                        <span className={cn("h-2 w-2 rounded-full", statusColor)} />
                        <span className="text-xs text-muted-foreground">{ticket.status}</span>
                      </div>
                      {ticket.status === "paused" ? (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); campaignAction.mutate({ action: "resume", ticketId: ticket.id }); }}>
                          <Play className="h-3.5 w-3.5" /> Resume
                        </Button>
                      ) : ticket.status !== "archived" ? (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); campaignAction.mutate({ action: "pause", ticketId: ticket.id }); }}>
                          <Pause className="h-3.5 w-3.5" /> Pause
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); campaignAction.mutate({ action: "duplicate", ticketId: ticket.id }); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {ticket.status !== "archived" ? (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); campaignAction.mutate({ action: "archive", ticketId: ticket.id }); }}>
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setDetailTicketId(ticket.id); }}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCompanyId ? (
        <GtmCampaignModal
          open={open}
          onClose={() => setOpen(false)}
          companyId={selectedCompanyId}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: GTM_QUERY_KEYS.tickets(selectedCompanyId) });
            pushToast({ title: "Campaign created", body: "The GTM campaign workflow is ready.", tone: "success" });
          }}
        />
      ) : null}

      {selectedCompanyId && detailTicketId ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[max(1rem,env(safe-area-inset-top))] md:items-center md:pt-0"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailTicketId(null); }}
        >
          <div
            className="relative bg-background shadow-lg"
            style={{
              width: "min(1288px, 94vw)",
              maxWidth: "94vw",
              maxHeight: "92vh",
              borderRadius: "5px",
              border: "1px solid #d4d4d4",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GtmCampaignDetail
              companyId={selectedCompanyId}
              ticketId={detailTicketId}
              companyPrefix={selectedCompany?.issuePrefix}
              onNavigate={(path) => {
                setDetailTicketId(null);
                navigate(path);
              }}
              onRequestClose={() => setDetailTicketId(null)}
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function GtmCampaignPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { ticketId } = useParams<{ ticketId: string }>();

  if (!selectedCompanyId) {
    return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Select a company to open a GTM campaign.</div>;
  }

  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Campaign</h1>
          <p className="text-sm text-muted-foreground">Focused GTM campaign launcher and stage configuration.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={boardPath("/tickets")}>Back to Campaigns</Link>
        </Button>
      </div>

      <GtmCampaignDetail
        companyId={selectedCompanyId}
        ticketId={ticketId ?? ""}
        companyPrefix={selectedCompany?.issuePrefix ?? null}
      />
    </div>
  );
}

function GtmInboxIndexRedirect() {
  const { selectedCompany } = useCompany();
  const tab = loadGtmLastInboxTab();
  return <Navigate to={buildGtmBoardPath(selectedCompany?.issuePrefix, `/inbox/${tab}`)} replace />;
}

function GtmInboxPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const inboxIssuesViewParam = searchParams.get("view");
  const issuesViewLayout: GtmInboxIssuesViewLayout = normalizeGtmInboxIssuesLayoutParam(inboxIssuesViewParam);
  const [favoriteInboxIssuesView, setFavoriteInboxIssuesView] = useState<GtmInboxIssuesViewLayout | null>(() =>
    loadGtmInboxIssuesLayoutFavorite(),
  );

  useEffect(() => {
    if (!isGtmInboxIssuesViewLayout(inboxIssuesViewParam)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", resolveGtmInboxIssuesLayoutWithoutUrlParam());
          return next;
        },
        { replace: true },
      );
    }
  }, [inboxIssuesViewParam, setSearchParams]);

  const setInboxIssuesViewLayout = useCallback(
    (next: GtmInboxIssuesViewLayout) => {
      saveGtmInboxIssuesLayout(next);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("view", next);
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [issueSearch, setIssueSearch] = useState("");
  const [issueDatePreset, setIssueDatePreset] = useState<GtmInboxIssueDatePreset>("all");
  const [issueCustomFrom, setIssueCustomFrom] = useState("");
  const [issueCustomTo, setIssueCustomTo] = useState("");
  const assigneeSearchParam = searchParams.get("assignee");
  const [issueAssigneeFilter, setIssueAssigneeFilter] = useState<GtmInboxIssueAssigneeFilter>(() =>
    parseGtmInboxAssigneeSearchParam(assigneeSearchParam) ?? "all",
  );
  const [issueStatusFilter, setIssueStatusFilter] = useState<GtmInboxIssueStatusFilter>("all");

  useEffect(() => {
    setIssueAssigneeFilter(parseGtmInboxAssigneeSearchParam(assigneeSearchParam) ?? "all");
  }, [assigneeSearchParam]);
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
  /** Inbox no longer renders a separate Live runs card; data is still used for issue "live" badges. */
  const runsQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "inbox-runs", selectedCompanyId] : ["gtm", "inbox-runs", "none"],
    queryFn: () => gtmApi.listRuns(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const joinRequestsQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.access.joinRequests(selectedCompanyId, "pending_approval") : ["access", "join-requests", "none"],
    queryFn: async () => {
      try {
        return await accessApi.listJoinRequests(selectedCompanyId!, "pending_approval");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) return [];
        throw err;
      }
    },
    enabled: !!selectedCompanyId,
    retry: false,
  });
  const approveJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) => accessApi.approveJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId, "pending_approval") });
    },
  });
  const rejectJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) => accessApi.rejectJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId, "pending_approval") });
    },
  });
  const hireApprovalsQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.approvals.list(selectedCompanyId) : ["approvals", "hire-none"],
    queryFn: async () => {
      try {
        return await approvalsApi.list(selectedCompanyId!);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) return [];
        throw err;
      }
    },
    enabled: !!selectedCompanyId,
    retry: false,
  });
  const approveHireMutation = useMutation({
    mutationFn: async (approval: Approval) => {
      await approvalsApi.approve(approval.id);
      const agentId = (approval.payload as Record<string, unknown> | null)?.agentId;
      if (typeof agentId === "string") {
        try {
          await agentsApi.update(
            agentId,
            { metadata: { product: "gtm", surfaceProfile: "gtm", gtmKind: "gtm_hire_approved" } },
            selectedCompanyId!,
          );
        } catch { /* best-effort */ }
      }
    },
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: ["gtm", "agents", selectedCompanyId] });
    },
  });
  const rejectHireMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId) });
    },
  });

  const isActivityRoute = /\/activity(?:\/|$|\?|#)/.test(location.pathname);
  const inboxTab: GtmInboxTab = isActivityRoute
    ? "recent"
    : (parseGtmInboxTabFromPath(location.pathname) ?? "recent");

  const displayIssues = useMemo(() => {
    const all = issuesQuery.data ?? [];
    if (inboxTab === "unread") {
      return getUnreadTouchedIssues(all).sort(sortIssuesByMostRecentActivity);
    }
    if (inboxTab === "all") {
      return [...all].sort(sortIssuesByMostRecentActivity);
    }
    return getRecentTouchedIssues(all).slice(0, 5);
  }, [inboxTab, issuesQuery.data]);

  const issueUpdatedBounds = useMemo(
    () => inboxIssueDateBounds(issueDatePreset, issueCustomFrom, issueCustomTo),
    [issueDatePreset, issueCustomFrom, issueCustomTo],
  );

  const filteredInboxIssues = useMemo(() => {
    let list = displayIssues;
    list = filterIssuesBySearch(list, issueSearch);
    list = filterIssuesByUpdatedRange(list, issueUpdatedBounds.fromMs, issueUpdatedBounds.toMs);
    list = filterIssuesByAssignee(list, issueAssigneeFilter);
    list = filterIssuesByStatus(list, issueStatusFilter);
    return list;
  }, [displayIssues, issueSearch, issueUpdatedBounds.fromMs, issueUpdatedBounds.toMs, issueAssigneeFilter, issueStatusFilter]);

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

  const allIssues = issuesQuery.data ?? [];

  const runs = [...(runsQuery.data ?? [])].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix, path);
  const liveIssueIds = new Set(
    runs
      .filter((run) => run.status === "running" || run.status === "queued")
      .map((run) => getRunIssueId(run))
      .filter((issueId): issueId is string => Boolean(issueId)),
  );
  const joinRequests = joinRequestsQuery.data ?? [];
  const hireApprovals = (hireApprovalsQuery.data ?? []).filter(
    (a: Approval) => a.type === "hire_agent" && (a.status === "pending" || a.status === "revision_requested"),
  );

  const agentsForIssueFilter = filterAgentsForGtmDirectoryUi(agentsQuery.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Inbox</h1>
          <p className="text-sm text-muted-foreground">Assigned work and issue activity for GTM agents.</p>
        </div>
        {!isActivityRoute ? (
          <Tabs
            value={inboxTab}
            onValueChange={(v) => {
              const next = v as GtmInboxTab;
              saveGtmLastInboxTab(next);
              navigate({ pathname: boardPath(`/inbox/${next}`), search: location.search });
            }}
            className="w-full sm:w-auto"
          >
            <PageTabBar
              items={[
                { value: "recent", label: "Recent" },
                { value: "unread", label: "Unread" },
                { value: "all", label: "All" },
              ]}
              value={inboxTab}
              onValueChange={(v) => {
                const next = v as GtmInboxTab;
                saveGtmLastInboxTab(next);
                navigate({ pathname: boardPath(`/inbox/${next}`), search: location.search });
              }}
              align="start"
            />
          </Tabs>
        ) : null}
      </div>

      {hireApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Agent Hire Approvals</CardTitle>
            <CardDescription>Agents hired by the CEO waiting for board approval.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {hireApprovals.map((approval) => {
                const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
                const label = approvalLabel(approval.type, approval.payload as Record<string, unknown> | null);
                const isPending = approveHireMutation.isPending || rejectHireMutation.isPending;
                return (
                  <div key={approval.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          requested {timeAgo(approval.createdAt)} · status: {approval.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => rejectHireMutation.mutate(approval.id)}>
                        Reject
                      </Button>
                      <Button size="sm" disabled={isPending} onClick={() => approveHireMutation.mutate(approval)}>
                        Approve
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {joinRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Agent Hire Requests</CardTitle>
            <CardDescription>New agents requesting to join this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {joinRequests.map((joinRequest) => (
                <div key={joinRequest.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {joinRequest.requestType === "human"
                        ? "Human join request"
                        : `Agent hire request${joinRequest.agentName ? `: ${joinRequest.agentName}` : ""}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      requested {timeAgo(joinRequest.createdAt)} from IP {joinRequest.requestIp}
                    </p>
                    {joinRequest.adapterType && (
                      <p className="text-xs text-muted-foreground">model: {joinRequest.adapterType}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                      onClick={() => rejectJoinMutation.mutate(joinRequest)}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                      onClick={() => approveJoinMutation.mutate(joinRequest)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PaperclipViewLayoutToggle
            views={GTM_INBOX_ISSUE_VIEW_TABS}
            value={issuesViewLayout}
            onValueChange={setInboxIssuesViewLayout}
            favoriteLayout={favoriteInboxIssuesView}
            onFavoriteToggle={(id) => setFavoriteInboxIssuesView(toggleGtmInboxIssuesLayoutFavorite(id))}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {inboxTab !== "all" ? (
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to={{ pathname: boardPath("/inbox/all"), search: location.search }}>View more</Link>
              </Button>
            ) : null}
            <GtmInboxHiddenIssuesSheet
              companyId={selectedCompanyId}
              boardPath={boardPath}
              queryKeyHidden={GTM_QUERY_KEYS.hiddenIssues(selectedCompanyId)}
              queryKeyIssues={GTM_QUERY_KEYS.issues(selectedCompanyId)}
            />
          </div>
        </div>

        <Card>
          {allIssues.length > 0 ? (
            <CardHeader className="space-y-0 pb-4 pt-6">
              <GtmInboxIssuesToolbar
                search={issueSearch}
                onSearchChange={setIssueSearch}
                datePreset={issueDatePreset}
                onDatePresetChange={setIssueDatePreset}
                customFrom={issueCustomFrom}
                customTo={issueCustomTo}
                onCustomFromChange={setIssueCustomFrom}
                onCustomToChange={setIssueCustomTo}
                assigneeFilter={issueAssigneeFilter}
                onAssigneeFilterChange={setIssueAssigneeFilter}
                statusFilter={issueStatusFilter}
                onStatusFilterChange={setIssueStatusFilter}
                agentsForFilter={agentsForIssueFilter}
              />
            </CardHeader>
          ) : null}
          <CardContent className="p-0">
            {allIssues.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No GTM issues yet.</div>
            ) : displayIssues.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                {inboxTab === "unread" ? "No unread issues right now." : "Nothing to show in this view."}
              </div>
            ) : filteredInboxIssues.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No issues match your search or filters.</div>
            ) : issuesViewLayout === "kanban" ? (
              <GtmIssuesKanbanView
                issues={filteredInboxIssues}
                issueHref={(issue) => boardPath(`/issues/${issue.id}`)}
                liveIssueIds={liveIssueIds}
              />
            ) : issuesViewLayout === "table" ? (
              <GtmIssuesTableView
                issues={filteredInboxIssues}
                issueHref={(issue) => boardPath(`/issues/${issue.id}`)}
                liveIssueIds={liveIssueIds}
              />
            ) : issuesViewLayout === "calendar" ? (
              <GtmIssuesCalendarView
                issues={filteredInboxIssues}
                issueHref={(issue) => boardPath(`/issues/${issue.id}`)}
                liveIssueIds={liveIssueIds}
              />
            ) : (
              <GtmIssuesListView
                issues={filteredInboxIssues}
                issueHref={(issue) => boardPath(`/issues/${issue.id}`)}
                liveIssueIds={liveIssueIds}
              />
            )}
          </CardContent>
        </Card>
      </div>
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
  const { companyPrefix: routeCompanyPrefix } = useParams<{ companyPrefix?: string }>();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceBrandColor, setWorkspaceBrandColor] = useState("");
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentTitle, setAgentTitle] = useState("");
  const [claudeCommand, setClaudeCommand] = useState("claude");
  const [claudeCwd, setClaudeCwd] = useState("");
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-6");
  const [claudeChrome, setClaudeChrome] = useState(true);
  const [claudeBrowserSlot, setClaudeBrowserSlot] = useState("");
  const [claudeTabGroupLabel, setClaudeTabGroupLabel] = useState("");
  const [claudeTabGroupKey, setClaudeTabGroupKey] = useState("");
  const [growthubBaseUrl, setGrowthubBaseUrl] = useState("");
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
  const workspaceConfigQuery = useQuery({
    queryKey: selectedCompanyId ? ["gtm", "workspace-config", selectedCompanyId] : ["gtm", "workspace-config", "none"],
    queryFn: () => gtmApi.getWorkspaceConfig(selectedCompanyId!),
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
          browserSlot: claudeBrowserSlot,
          tabGroupLabel: claudeTabGroupLabel,
          tabGroupKey: claudeTabGroupKey,
          crossAgentTabPolicy: "claim-or-create",
        },
      }),
    onSuccess: async () => {
      setSetupOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "workspace-config", selectedCompanyId!] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "agents", selectedCompanyId!] }),
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
  const saveConnectionConfig = useMutation({
    mutationFn: async () => gtmApi.saveConnectionConfig({ baseUrl: growthubBaseUrl.trim() }),
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
  useEffect(() => {
    if (connectionQuery.data?.baseUrl) {
      setGrowthubBaseUrl(connectionQuery.data.baseUrl);
    }
  }, [connectionQuery.data?.baseUrl]);

  const workspaceConfigLoading = Boolean(selectedCompanyId) && workspaceConfigQuery.isLoading;
  if (
    profileQuery.isLoading
    || knowledgeQuery.isLoading
    || connectorsQuery.isLoading
    || connectionQuery.isLoading
    || workflowQuery.isLoading
    || runsQuery.isLoading
    || workspaceConfigLoading
  ) {
    return <div className="py-8 text-sm text-muted-foreground">Loading settings…</div>;
  }

  const error =
    profileQuery.error
    ?? knowledgeQuery.error
    ?? connectorsQuery.error
    ?? connectionQuery.error
    ?? workflowQuery.error
    ?? runsQuery.error
    ?? (selectedCompanyId ? workspaceConfigQuery.error : null);
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

  const boardPath = (path: string) => buildGtmBoardPath(selectedCompany?.issuePrefix ?? routeCompanyPrefix ?? null, path);

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
        workspaceLabel: selectedCompany?.name ?? profile.workspace ?? "GTM Workspace",
      }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openConnectionConfiguration = () => {
    if (connection.baseUrl?.trim()) {
      openHostedGrowthubConfiguration(connection.baseUrl, connection.callbackUrl);
      return;
    }
    setGrowthubBaseUrl(connection.baseUrl ?? "");
    setConnectionOpen(true);
  };

  const launchGrowthubConfiguration = async () => {
    const saved = await saveConnectionConfig.mutateAsync();
    setConnectionOpen(false);
    openHostedGrowthubConfiguration(saved.baseUrl, saved.callbackUrl);
  };

  const workspaceConfig = workspaceConfigQuery.data ?? null;
  const managedAgent = workspaceConfig?.existingAgent ?? null;
  const bindingCheck = workspaceConfig?.environmentTest ?? null;
  const activeChromeLeases = workspaceConfig?.activeChromeLeases ?? [];

  const openSetup = () => {
    if (!workspaceConfig) return;
    const source = managedAgent ?? workspaceConfig.defaults;
    const adapterConfig = (managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>;
    setAgentName(source.name ?? "SDR Browser Agent");
    setAgentTitle((managedAgent?.title ?? workspaceConfig.defaults.title) || "");
    setClaudeCommand(String(adapterConfig.command ?? "claude"));
    setClaudeCwd(String(adapterConfig.cwd ?? ""));
    setClaudeModel(String(adapterConfig.model ?? "claude-sonnet-4-6"));
    setClaudeChrome(Boolean(adapterConfig.chrome ?? true));
    setClaudeBrowserSlot(String(adapterConfig.browserSlot ?? ""));
    setClaudeTabGroupLabel(String(adapterConfig.tabGroupLabel ?? ""));
    setClaudeTabGroupKey(String(adapterConfig.tabGroupKey ?? ""));
    setSetupOpen(true);
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

      {workspaceConfig ? (
        <>
          <Card className="xl:col-span-2">
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

          <Card className="xl:col-span-2">
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
                <p className="mt-1 break-all">
                  {String(
                    ((managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>).command ?? "claude",
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Working Directory</p>
                <p className="mt-1 break-all">
                  {String(
                    ((managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>).cwd ?? "Not configured",
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Browser Slot</p>
                <p className="mt-1 break-all">
                  {String(
                    ((managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>).browserSlot ?? "default",
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tab Group</p>
                <p className="mt-1 break-all">
                  {String(
                    ((managedAgent?.adapterConfig ?? workspaceConfig.defaults.adapterConfig) as Record<string, unknown>).tabGroupLabel ?? "Not configured",
                  )}
                </p>
              </div>
              {activeChromeLeases.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active Browser Slots</p>
                  {activeChromeLeases.map((lease) => (
                    <div key={`${lease.slotId}:${lease.runId}`} className="rounded-md border border-border p-3">
                      <p className="font-medium">{lease.slotId}</p>
                      <p className="mt-1 text-muted-foreground">Agent {lease.agentId}</p>
                    </div>
                  ))}
                </div>
              ) : null}
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
                <Button size="sm" variant="outline" onClick={openSetup}>
                  Configure
                </Button>
                {managedAgent ? (
                  <Button size="sm" asChild variant="outline">
                    <Link to={boardPath(`/agents/${managedAgent.id}`)}>Open detail</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

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

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workspace browser agent</DialogTitle>
            <DialogDescription>
              Bind the workspace to the local Claude app and make the default SDR browser agent runnable out of the box.
            </DialogDescription>
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Browser slot</label>
              <Input value={claudeBrowserSlot} onChange={(event) => setClaudeBrowserSlot(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tab group label</label>
              <Input value={claudeTabGroupLabel} onChange={(event) => setClaudeTabGroupLabel(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tab group key</label>
              <Input value={claudeTabGroupKey} onChange={(event) => setClaudeTabGroupKey(event.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={claudeChrome} onChange={(event) => setClaudeChrome(event.target.checked)} />
              Enable Claude browser mode
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => setupMutation.mutate()}
              disabled={
                !selectedCompanyId
                || !agentName.trim()
                || !claudeCommand.trim()
                || !claudeCwd.trim()
                || !claudeBrowserSlot.trim()
                || !claudeTabGroupLabel.trim()
                || !claudeTabGroupKey.trim()
                || setupMutation.isPending
              }
            >
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
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">Callback: {connection.callbackUrl}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectionOpen(false)}>
              Cancel
            </Button>
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

function GtmShell() {
  const { selectedCompany } = useCompany();
  const { companyPrefix: routeCompanyPrefix } = useParams<{ companyPrefix?: string }>();
  const { theme, toggleTheme } = useTheme();
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const boardCompanyPrefix = selectedCompany?.issuePrefix ?? routeCompanyPrefix ?? null;

  const navItems = useMemo(
    () => [
      { to: "/workspace", label: "Workspace", icon: BriefcaseBusiness },
      { to: "/tickets", label: "Campaigns", icon: Ticket },
      { to: "/agents/all", label: "Agents", icon: Users },
      { to: "/inbox", label: "Inbox", icon: InboxIcon },
      { to: "/knowledge-base", label: "Knowledge Base", icon: Database },
      { to: "/companies", label: "Companies", icon: Building2 },
      { to: "/company/settings", label: "Settings", icon: Settings },
    ],
    [],
  );
  const boardPath = (path: string) => buildGtmBoardPath(boardCompanyPrefix, path);
  const boardRelative = gtmBoardRelativePathname(location.pathname);

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
              const active = isGtmShellNavItemActive(boardRelative, item.to);
              return (
                <Link
                  key={item.to}
                  to={boardPath(item.to)}
                  className={cn(buttonVariants({ variant: active ? "secondary" : "ghost" }), "justify-start gap-2")}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-full">
        <BreadcrumbBar />
        <div className="min-h-0 flex flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-auto">
            <main id="main-content" tabIndex={-1} className="p-4 md:p-6">
              <Outlet />
            </main>
          </div>
          <PropertiesPanel />
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
      <Route path="agents/trash" element={<GtmAgentsPage />} />
      <Route path="agents/org-chart" element={<OrgChart />} />
      <Route path="agents/:agentId" element={<AgentDetail />} />
      <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
      <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
      <Route path="tickets" element={<GtmCampaignsPage />} />
      <Route path="tickets/:ticketId" element={<GtmCampaignPage />} />
      <Route path="issues/:issueId" element={<IssueDetail />} />
      <Route path="knowledge-base" element={<KnowledgeBase />} />
      <Route path="activity" element={<GtmInboxPage />} />
      <Route path="inbox" element={<GtmInboxIndexRedirect />} />
      <Route path="inbox/recent" element={<GtmInboxPage />} />
      <Route path="inbox/unread" element={<GtmInboxPage />} />
      <Route path="inbox/all" element={<GtmInboxPage />} />
      <Route path="inbox/new" element={<Navigate to="../inbox/recent" replace />} />
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
        <Route path={`${SURFACE_ROUTE_PATH}/workspace`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/companies`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/inbox/:tab`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/tickets`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/tickets/:ticketId`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/issues/:issueId`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/activity`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/inbox`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/new`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/trash`} element={<UnprefixedBoardRedirect />} />
        <Route path={`${SURFACE_ROUTE_PATH}/agents/org-chart`} element={<UnprefixedBoardRedirect />} />
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
