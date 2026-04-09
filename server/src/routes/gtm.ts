import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { AdapterEnvironmentTestResult, Issue, Ticket, TicketStageDefinition } from "@paperclipai/shared";
import { shouldIncludeAgentInGtmDirectoryList } from "@paperclipai/shared";
import { getServerAdapter } from "../adapters/registry.js";
import { readConfigFile, writeConfigFile } from "../config-file.js";
import { agentService } from "../services/agents.js";
import { heartbeatService } from "../services/heartbeat.js";
import { issueService } from "../services/issues.js";
import { ticketService } from "../services/tickets.js";
import { launchLocalGtmWorkflow, readGtmViewModel } from "../services/gtm-state.js";
import { enforceHeartbeatPolicy, enforcePerformanceReview } from "../services/gtm-campaign-policy.js";
import { resolveSharedInstanceWorkspacesDir } from "../home-paths.js";
import { logActivity } from "../services/activity-log.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const GTM_METADATA = {
  product: "gtm",
  surfaceProfile: "gtm",
} as const;


function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function hasChromeEnabledAdapter(agent: { adapterConfig: unknown }): boolean {
  return readRecord(agent.adapterConfig)?.chrome === true;
}

async function resolveIssueBoundInvokeTarget(
  issues: ReturnType<typeof issueService>,
  companyId: string,
  agentId: string,
  requestedIssueId?: string | null,
) {
  if (requestedIssueId) {
    const issue = await issues.getById(requestedIssueId);
    if (!issue || issue.companyId !== companyId) return null;
    if (issue.assigneeAgentId !== agentId) return null;
    if (issue.status === "backlog" || issue.status === "done" || issue.status === "cancelled") return null;
    if (issue.executionRunId) return null;
    return issue;
  }

  const candidates = await issues.list(companyId, {
    assigneeAgentId: agentId,
    status: "todo,in_progress",
  });
  return candidates.find((issue) => !issue.activeRun) ?? null;
}

function isGtmTicket(ticket: Pick<Ticket, "metadata">): boolean {
  const metadata = readRecord(ticket.metadata);
  return metadata?.surfaceProfile === GTM_METADATA.surfaceProfile || metadata?.product === GTM_METADATA.product;
}

function isGtmAgent(agent: { metadata: unknown }): boolean {
  const metadata = readRecord(agent.metadata);
  return metadata?.surfaceProfile === GTM_METADATA.surfaceProfile || metadata?.product === GTM_METADATA.product;
}

function gtmDirectoryAgents<T extends { metadata: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => shouldIncludeAgentInGtmDirectoryList(row));
}

function gtmTicketMetadata(metadata: Record<string, unknown> | null | undefined) {
  return {
    ...(metadata ?? {}),
    ...GTM_METADATA,
    entity: "campaign",
  };
}

function gtmAgentMetadata(metadata: Record<string, unknown> | null | undefined) {
  const merged: Record<string, unknown> = {
    ...(metadata ?? {}),
    ...GTM_METADATA,
    entity: "agent",
  };
  if (!Object.prototype.hasOwnProperty.call(merged, "skills")) {
    merged.skills = [];
  } else if (!Array.isArray(merged.skills)) {
    merged.skills = [];
  } else {
    merged.skills = (merged.skills as unknown[]).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
  }
  return merged;
}

function compactSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeBrowserIdentitySegment(value: string | null | undefined, fallback: string): string {
  const trimmed = compactSentence(value ?? "");
  if (!trimmed) return fallback;
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildBrowserIsolationDefaults(input: { name?: string | null; companyId?: string | null }) {
  const base = sanitizeBrowserIdentitySegment(input.name, "browser-agent");
  return {
    browserSlot: `${base}-slot`,
    tabGroupKey: `gtm-${sanitizeBrowserIdentitySegment(input.companyId, "workspace")}-${base}`,
    tabGroupLabel: `GTM ${compactSentence(input.name ?? "Browser Agent") || "Browser Agent"}`,
    crossAgentTabPolicy: "claim-or-create",
  } as const;
}

function mergeBrowserIsolationConfig(input: {
  adapterConfig: Record<string, unknown>;
  companyId: string;
  agentName?: string | null;
  existingAdapterConfig?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const defaults = buildBrowserIsolationDefaults({
    name: input.agentName,
    companyId: input.companyId,
  });
  const existing = input.existingAdapterConfig ?? {};
  const merged = { ...input.adapterConfig };
  const browserSlot =
    typeof merged.browserSlot === "string" && merged.browserSlot.trim().length > 0
      ? merged.browserSlot.trim()
      : typeof existing.browserSlot === "string" && existing.browserSlot.trim().length > 0
        ? existing.browserSlot.trim()
        : defaults.browserSlot;
  const tabGroupKey =
    typeof merged.tabGroupKey === "string" && merged.tabGroupKey.trim().length > 0
      ? merged.tabGroupKey.trim()
      : typeof existing.tabGroupKey === "string" && existing.tabGroupKey.trim().length > 0
        ? existing.tabGroupKey.trim()
        : defaults.tabGroupKey;
  const tabGroupLabel =
    typeof merged.tabGroupLabel === "string" && merged.tabGroupLabel.trim().length > 0
      ? merged.tabGroupLabel.trim()
      : typeof existing.tabGroupLabel === "string" && existing.tabGroupLabel.trim().length > 0
        ? existing.tabGroupLabel.trim()
        : defaults.tabGroupLabel;
  const crossAgentTabPolicy =
    typeof merged.crossAgentTabPolicy === "string" && merged.crossAgentTabPolicy.trim().length > 0
      ? merged.crossAgentTabPolicy.trim()
      : typeof existing.crossAgentTabPolicy === "string" && existing.crossAgentTabPolicy.trim().length > 0
        ? existing.crossAgentTabPolicy.trim()
        : defaults.crossAgentTabPolicy;
  return {
    ...merged,
    browserSlot,
    tabGroupKey,
    tabGroupLabel,
    crossAgentTabPolicy,
  };
}

function toTitleCase(value: string): string {
  return compactSentence(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDraftTitle(prompt: string, draftProfile: string) {
  const sentence = compactSentence(prompt);
  if (!sentence) {
    return `${toTitleCase(draftProfile || "custom")} GTM Campaign`;
  }

  const trimmed = sentence.replace(/[.?!]+$/, "");
  if (trimmed.length <= 72) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  return `${trimmed.slice(0, 69).trimEnd()}...`;
}


function sortByUpdatedAtDesc<T extends { updatedAt: Date | string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function buildClaudeBindingDefaults() {
  const browserIsolation = buildBrowserIsolationDefaults({ name: "SDR Browser Agent", companyId: "workspace" });
  return {
    name: "SDR Browser Agent",
    title: "Outbound browser SDR",
    adapterType: "claude_local",
    adapterConfig: {
      command: "claude",
      cwd: resolveSharedInstanceWorkspacesDir(),
      chrome: true,
      model: "claude-sonnet-4-6",
      browserSlot: browserIsolation.browserSlot,
      tabGroupKey: browserIsolation.tabGroupKey,
      tabGroupLabel: browserIsolation.tabGroupLabel,
      crossAgentTabPolicy: browserIsolation.crossAgentTabPolicy,
    },
  };
}

/** Process-based local adapters: same shared instance `workspaces` cwd unless the client sets one explicitly. */
const GTM_LOCAL_ADAPTER_TYPES = new Set([
  "claude_local",
  "codex_local",
  "cursor",
  "gemini_local",
  "opencode_local",
  "pi_local",
]);

function mergeGtmAgentAdapterConfig(
  adapterType: string,
  config: Record<string, unknown>,
  options?: {
    companyId?: string;
    agentName?: string | null;
    existingAdapterConfig?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const merged = { ...config };
  if (GTM_LOCAL_ADAPTER_TYPES.has(adapterType)) {
    const cwd = merged.cwd;
    if (!(typeof cwd === "string" && cwd.trim().length > 0)) {
      merged.cwd = resolveSharedInstanceWorkspacesDir();
    }
  }
  if (adapterType === "claude_local" && merged.chrome === true && options?.companyId) {
    return mergeBrowserIsolationConfig({
      adapterConfig: merged,
      companyId: options.companyId,
      agentName: options.agentName,
      existingAdapterConfig: options.existingAdapterConfig,
    });
  }
  return merged;
}

function isManagedClaudeBrowserAgent(agent: { metadata: unknown }): boolean {
  const metadata = readRecord(agent.metadata);
  return isGtmAgent(agent) && metadata?.gtmKind === "claude_browser_sdr";
}

function getGrowthubConnectionState() {
  const config = readConfigFile();
  const baseUrl =
    config?.auth.growthubBaseUrl?.trim() ||
    process.env.GROWTHUB_BASE_URL?.trim() ||
    "";
  return {
    baseUrl,
    connected: Boolean(config?.auth.token?.trim()),
    portalBaseUrl: config?.auth.growthubPortalBaseUrl?.trim() || "",
    machineLabel: config?.auth.growthubMachineLabel?.trim() || "",
    workspaceLabel: config?.auth.growthubWorkspaceLabel?.trim() || "",
    token: config?.auth.token?.trim() || "",
  };
}

function saveGrowthubBaseUrl(baseUrl: string) {
  const config = readConfigFile();
  if (!config) {
    throw new Error("Growthub config not found.");
  }

  writeConfigFile({
    ...config,
    $meta: {
      ...config.$meta,
      updatedAt: new Date().toISOString(),
      source: "configure",
    },
    auth: {
      ...config.auth,
      growthubBaseUrl: baseUrl,
    },
  });
}

export function gtmRoutes(db: Db) {
  const router = Router();
  const tickets = ticketService(db);
  const issues = issueService(db);
  const agents = agentService(db);
  const heartbeats = heartbeatService(db);
  const claudeAdapter = getServerAdapter("claude_local");

  router.get("/profile", (_req, res) => {
    res.json(readGtmViewModel().profile);
  });

  router.get("/knowledge", (_req, res) => {
    res.json(readGtmViewModel().knowledge);
  });

  router.get("/connectors", (_req, res) => {
    const connection = getGrowthubConnectionState();
    res.json([
      {
        label: "Growthub",
        target: connection.baseUrl || null,
        status: connection.connected ? "Connected" : "Needs attention",
        summary: connection.connected
          ? "Local installer authenticated."
          : connection.baseUrl
            ? "Open Configuration to connect this installer."
            : "Set the real Growthub app URL before opening configuration.",
      },
      ...readGtmViewModel().connectors,
    ]);
  });

  router.get("/connection", (req, res) => {
    const connection = getGrowthubConnectionState();
    const host = req.get("host");
    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
    const callbackUrl = host ? `${protocol}://${host}/auth/callback` : "/auth/callback";

    res.json({
      baseUrl: connection.baseUrl,
      callbackUrl,
      connected: connection.connected,
      portalBaseUrl: connection.portalBaseUrl,
      machineLabel: connection.machineLabel,
      workspaceLabel: connection.workspaceLabel,
    });
  });

  router.post("/connection/test", async (_req, res) => {
    const connection = getGrowthubConnectionState();
    if (!connection.baseUrl) {
      res.status(422).json({ error: "Growthub base URL is not configured." });
      return;
    }
    if (!connection.token) {
      res.status(422).json({ error: "Growthub local-machine token is not configured." });
      return;
    }

    try {
      const response = await fetch(new URL("/api/providers/growthub-local/probe", connection.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${connection.token}`,
        },
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        res.status(response.status).json({
          error:
            (typeof data.error === "string" && data.error) ||
            "Growthub local probe failed.",
        });
        return;
      }

      res.json({
        success: true,
        message:
          (typeof data.message === "string" && data.message) ||
          "Growthub local probe succeeded.",
        knowledgeItemId:
          typeof data.knowledgeItemId === "string" ? data.knowledgeItemId : null,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Failed to reach hosted Growthub.",
      });
    }
  });

  router.post("/connection/disconnect", (_req, res) => {
    const config = readConfigFile();
    if (!config) {
      res.status(500).json({ error: "Growthub config not found." });
      return;
    }

    writeConfigFile({
      ...config,
      $meta: {
        ...config.$meta,
        updatedAt: new Date().toISOString(),
        source: "configure",
      },
      auth: {
        ...config.auth,
        token: undefined,
        growthubPortalBaseUrl: undefined,
        growthubMachineLabel: undefined,
        growthubWorkspaceLabel: undefined,
      },
    });

    res.json({
      baseUrl: config.auth.growthubBaseUrl?.trim() || "",
      callbackUrl: "/auth/callback",
      connected: false,
      portalBaseUrl: "",
      machineLabel: "",
      workspaceLabel: "",
    });
  });

  router.post("/connection/config", (req, res) => {
    const rawBaseUrl = typeof req.body?.baseUrl === "string" ? req.body.baseUrl.trim() : "";
    if (!rawBaseUrl) {
      res.status(422).json({ error: "Base URL is required." });
      return;
    }

    let normalizedBaseUrl: string;
    try {
      normalizedBaseUrl = new URL(rawBaseUrl).toString().replace(/\/+$/, "");
    } catch {
      res.status(422).json({ error: "Enter a valid Growthub base URL." });
      return;
    }

    saveGrowthubBaseUrl(normalizedBaseUrl);

    const host = req.get("host");
    const forwardedProto = req.get("x-forwarded-proto");
    const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
    const callbackUrl = host ? `${protocol}://${host}/auth/callback` : "/auth/callback";

    res.json({
      baseUrl: normalizedBaseUrl,
      callbackUrl,
      connected: getGrowthubConnectionState().connected,
    });
  });

  router.get("/workflow", (_req, res) => {
    res.json(readGtmViewModel().workflow);
  });

  router.post("/workflow/run", (_req, res) => {
    try {
      res.json(launchLocalGtmWorkflow().workflow);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to launch local GTM workflow",
      });
    }
  });

  router.get("/companies/:companyId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const scope = typeof req.query.scope === "string" ? req.query.scope : "";
    const includeTerminated = scope === "trash";
    // Always runs GTM directory filter (dxKind / DX surface / eligibility) before splitting by status,
    // so terminated trash and main inventory never include DX-only agents.
    const rows = gtmDirectoryAgents(await agents.list(companyId, { includeTerminated }));
    if (scope === "trash") {
      res.json(rows.filter((a) => a.status === "terminated"));
      return;
    }
    res.json(rows.filter((a) => a.status !== "terminated"));
  });

  router.get("/companies/:companyId/workspace-config", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    try {
      const rows = gtmDirectoryAgents(await agents.list(companyId));
      const existingAgent = rows.find(isManagedClaudeBrowserAgent) ?? null;
      const baseDefaults = buildClaudeBindingDefaults();
      const defaults = {
        ...baseDefaults,
        adapterConfig: mergeGtmAgentAdapterConfig("claude_local", baseDefaults.adapterConfig, {
          companyId,
          agentName: baseDefaults.name,
        }),
      };
      let environmentTest: AdapterEnvironmentTestResult | null = null;
      if (existingAgent) {
        try {
          environmentTest = await claudeAdapter.testEnvironment({
            companyId,
            adapterType: "claude_local",
            config: existingAgent.adapterConfig ?? defaults.adapterConfig,
          });
        } catch {
          environmentTest = null;
        }
      }
      res.json({
        defaults,
        existingAgent,
        environmentTest,
        activeChromeLeases: await import("../services/chrome-lease.js").then((mod) => mod.listActiveChromeLeases()),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to load GTM workspace configuration",
      });
    }
  });

  router.post("/companies/:companyId/workspace-config/claude-browser", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const defaults = buildClaudeBindingDefaults();
    const requestedName = req.body?.name ? String(req.body.name) : defaults.name;
    const metadata = {
      ...gtmAgentMetadata(readRecord(req.body?.metadata)),
      gtmKind: "claude_browser_sdr",
      defaultWorkspaceBinding: true,
    };
    const rows = gtmDirectoryAgents(await agents.list(companyId));
    const existingAgent = rows.find(isManagedClaudeBrowserAgent) ?? null;
    const adapterConfig = mergeGtmAgentAdapterConfig(
      "claude_local",
      {
        ...defaults.adapterConfig,
        ...(readRecord(req.body?.adapterConfig) ?? {}),
        chrome: true,
      },
      {
        companyId,
        agentName: requestedName,
        existingAdapterConfig: readRecord(existingAgent?.adapterConfig),
      },
    );
    const agent = existingAgent
      ? await agents.update(existingAgent.id, {
          name: requestedName,
          title: req.body?.title ? String(req.body.title) : defaults.title,
          adapterType: "claude_local",
          adapterConfig,
          metadata,
        })
      : await agents.create(companyId, {
          name: req.body?.name ? String(req.body.name) : defaults.name,
          role: "general",
          title: req.body?.title ? String(req.body.title) : defaults.title,
          adapterType: "claude_local",
          adapterConfig,
          runtimeConfig: {},
          budgetMonthlyCents: 0,
          capabilities: "GTM browser SDR",
          icon: null,
          metadata,
          permissions: {
            canCreateAgents: false,
          },
          reportsTo: null,
          status: "idle",
          spentMonthlyCents: 0,
          lastHeartbeatAt: null,
          pauseReason: null,
          pausedAt: null,
        });

    const environmentTest = await claudeAdapter.testEnvironment({
      companyId,
      adapterType: "claude_local",
      config: adapterConfig,
    });

    res.status(existingAgent ? 200 : 201).json({
      agent,
      environmentTest,
    });
  });

  router.post("/companies/:companyId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const adapterType = String(req.body?.adapterType ?? "codex_local");
    const rawAdapterConfig =
      typeof req.body?.adapterConfig === "object" && req.body?.adapterConfig !== null
        ? (req.body.adapterConfig as Record<string, unknown>)
        : {};
    const created = await agents.create(companyId, {
      name: String(req.body?.name ?? "").trim(),
      role: String(req.body?.role ?? "general"),
      title: req.body?.title ? String(req.body.title) : null,
      adapterType,
      adapterConfig: mergeGtmAgentAdapterConfig(adapterType, rawAdapterConfig, {
        companyId,
        agentName: String(req.body?.name ?? "").trim(),
      }),
      runtimeConfig: {},
      budgetMonthlyCents: 0,
      capabilities: req.body?.capabilities ? String(req.body.capabilities) : null,
      icon: null,
      metadata: (() => {
        const reqMeta = readRecord(req.body?.metadata) ?? {};
        const kind =
          typeof reqMeta.gtmKind === "string" && reqMeta.gtmKind.trim() ? reqMeta.gtmKind.trim() : "gtm_user_created";
        return gtmAgentMetadata({ ...reqMeta, gtmKind: kind });
      })(),
      permissions: {
        canCreateAgents: false,
      },
      reportsTo: null,
      status: "idle",
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
      pauseReason: null,
      pausedAt: null,
    });
    res.status(201).json(created);
  });

  router.post("/agents/:agentId/invoke", async (req, res) => {
    const agentId = req.params.agentId as string;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    assertCompanyAccess(req, companyId);
    const agent = await agents.getById(agentId);
    if (!agent || agent.companyId !== companyId || !shouldIncludeAgentInGtmDirectoryList(agent)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const actor = getActorInfo(req);
    const body = readRecord(req.body) ?? {};
    const requestedIssueId = readNonEmptyString(body.issueId);
    const requestedTaskId = readNonEmptyString(body.taskId);
    const requestedCommentId = readNonEmptyString(body.commentId);
    const chromeAgent = hasChromeEnabledAdapter(agent);

    let payload: Record<string, unknown> | null = null;
    let contextSnapshot: Record<string, unknown> = { source: "gtm.agent.invoke" };
    let wakeReason = "gtm_manual_invoke";
    let wakeSource: "timer" | "assignment" | "on_demand" | "automation" = "on_demand";

    if (chromeAgent) {
      const targetIssue = await resolveIssueBoundInvokeTarget(issues, companyId, agent.id, requestedIssueId);
      if (!targetIssue) {
        res.status(409).json({
          error:
            "Chrome agents must be launched on an assigned runnable issue. Assign or reopen a GTM issue for this agent, then dispatch that issue instead of using a free-run invoke.",
        });
        return;
      }
      payload = {
        issueId: targetIssue.id,
        taskId: targetIssue.id,
        ...(requestedCommentId ? { commentId: requestedCommentId } : {}),
      };
      contextSnapshot = {
        issueId: targetIssue.id,
        taskId: targetIssue.id,
        source: "gtm.agent.invoke.issue",
      };
      wakeReason = "gtm_issue_invoke";
      wakeSource = "assignment";
    } else if (requestedIssueId || requestedTaskId || requestedCommentId) {
      payload = {
        ...(requestedIssueId ? { issueId: requestedIssueId } : {}),
        ...(requestedTaskId ? { taskId: requestedTaskId } : {}),
        ...(requestedCommentId ? { commentId: requestedCommentId } : {}),
      };
      contextSnapshot = {
        ...contextSnapshot,
        ...(requestedIssueId ? { issueId: requestedIssueId } : {}),
        ...(requestedTaskId ? { taskId: requestedTaskId } : {}),
      };
    }

    const run = await heartbeats.wakeup(agent.id, {
      source: wakeSource,
      triggerDetail: "manual",
      reason: wakeReason,
      payload,
      requestedByActorType: actor.actorType,
      requestedByActorId: actor.actorId,
      contextSnapshot,
    });
    res.json(run);
  });

  router.post("/agents/:agentId/pause", async (req, res) => {
    const agentId = req.params.agentId as string;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    assertCompanyAccess(req, companyId);
    const existing = await agents.getById(agentId);
    if (!existing || existing.companyId !== companyId || !shouldIncludeAgentInGtmDirectoryList(existing)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const updated = await agents.pause(agentId);
    res.json(updated);
  });

  router.post("/agents/:agentId/resume", async (req, res) => {
    const agentId = req.params.agentId as string;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    assertCompanyAccess(req, companyId);
    const existing = await agents.getById(agentId);
    if (!existing || existing.companyId !== companyId || !shouldIncludeAgentInGtmDirectoryList(existing)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const updated = await agents.resume(agentId);
    res.json(updated);
  });

  /** Stop queued + running heartbeat work for one agent (does not pause the agent). */
  router.post("/agents/:agentId/stop-runs", async (req, res) => {
    const agentId = req.params.agentId as string;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    assertCompanyAccess(req, companyId);
    const existing = await agents.getById(agentId);
    if (!existing || existing.companyId !== companyId || !shouldIncludeAgentInGtmDirectoryList(existing)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const cancelledCount = await heartbeats.cancelActiveForAgent(
      agentId,
      "GTM: stopped runs from workspace (invocations cancelled)",
    );
    res.json({ ok: true as const, cancelledCount });
  });

  router.post("/agents/:agentId/restore-terminated", async (req, res) => {
    const agentId = req.params.agentId as string;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
    assertCompanyAccess(req, companyId);
    const existing = await agents.getById(agentId);
    if (!existing || existing.companyId !== companyId || !shouldIncludeAgentInGtmDirectoryList(existing)) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    try {
      const updated = await agents.restoreTerminated(agentId);
      if (!updated) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        action: "agent.restored_from_termination",
        entityType: "agent",
        entityId: updated.id,
      });
      res.json(updated);
    } catch (err) {
      const { HttpError } = await import("../errors.js");
      if (err instanceof HttpError && err.status === 409) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.post("/companies/:companyId/chrome-lease/force-release", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { forceReleaseChromeLeases } = await import("../services/chrome-lease.js");
    const reason =
      typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
        ? req.body.reason.trim()
        : "gtm_force_release";
    const slotId =
      typeof req.body?.slotId === "string" && req.body.slotId.trim().length > 0
        ? req.body.slotId.trim()
        : null;
    const released = forceReleaseChromeLeases(reason, slotId);
    const previous = released[0] ?? null;
    res.json({
      ok: true as const,
      hadLease: released.length > 0,
      releasedCount: released.length,
      previous: previous
        ? {
            slotId: previous.slotId,
            agentId: previous.agentId,
            runId: previous.runId,
            expiresAt: previous.expiresAt,
          }
        : null,
    });
  });

  /**
   * Emergency: cancel all queued/running heartbeats + pending wakeups for this company,
   * SIGTERM adapter children the server still tracks, and clear the in-process Chrome lease.
   */
  router.post("/companies/:companyId/sweep-stray-processes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const sweep = await heartbeats.sweepCompanyAgentWork(companyId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "gtm.emergency_sweep_agent_work",
      entityType: "company",
      entityId: companyId,
      details: sweep,
    });
    res.json({
      ok: true as const,
      cancelledRuns: sweep.cancelledRuns,
      examined: sweep.examined,
      processesSignalled: sweep.processesSignalled,
    });
  });

  router.get("/companies/:companyId/tickets", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await tickets.list(companyId);
    res.json(rows.filter(isGtmTicket));
  });

  router.post("/companies/:companyId/campaign-drafts", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const draftProfile = typeof req.body?.draftProfile === "string" ? req.body.draftProfile.trim().toLowerCase() : "custom";
    const extendExisting = Boolean(req.body?.extendExisting);

    if (!prompt) {
      res.status(422).json({ error: "A prompt is required to generate a campaign draft." });
      return;
    }

    const [companyAgents, companyTickets] = await Promise.all([
      agents.list(companyId),
      tickets.list(companyId),
    ]);
    const ceoAgent = companyAgents.find((agent) => agent.role === "ceo" && agent.status !== "terminated") ?? null;
    const existingCampaignCount = companyTickets.filter(isGtmTicket).length;

    res.json({
      title: buildDraftTitle(prompt, draftProfile),
      description: `CEO-generated GTM draft for ${compactSentence(prompt)}.`,
      instructions: extendExisting
        ? "Extend the current GTM operating pattern where it helps, but keep every campaign field editable before launch."
        : "Treat this as a net-new GTM campaign draft. Refine the instructions, settings, and agent alignment before launch.",
      targetAudience: "",
      offer: "",
      successDefinition:
        existingCampaignCount > 0
          ? "Operators can compare this campaign against the existing GTM pipeline and decide whether to launch, iterate, or merge it."
          : "Operators can approve the campaign, assign the right agents, and run issues directly without hidden workflow constraints.",
      leadAgentId: ceoAgent?.id ?? null,
    });
  });

  router.post("/companies/:companyId/tickets", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const stageDefinitions =
      Array.isArray(req.body?.stageDefinitions) && req.body.stageDefinitions.length > 0
        ? (req.body.stageDefinitions as TicketStageDefinition[])
        : undefined;
    const stageOrder =
      Array.isArray(req.body?.stageOrder) && req.body.stageOrder.length > 0
        ? req.body.stageOrder.map((value: unknown) => String(value))
        : stageDefinitions
          ? undefined
          : ["stage_1"];
    const created = await tickets.create(companyId, {
      title: String(req.body?.title ?? "").trim(),
      description: req.body?.description ? String(req.body.description) : undefined,
      instructions: req.body?.instructions ? String(req.body.instructions) : undefined,
      stageOrder,
      stageDefinitions,
      metadata: gtmTicketMetadata(readRecord(req.body?.metadata)),
      leadAgentId: req.body?.leadAgentId ? String(req.body.leadAgentId) : null,
    }, actor.actorId ?? undefined);
    res.status(201).json(created);
  });

  router.get("/companies/:companyId/issues", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const [gtmTickets, companyAgents] = await Promise.all([
      tickets.list(companyId),
      agents.list(companyId),
    ]);
    const gtmTicketIds = new Set(gtmTickets.filter(isGtmTicket).map((ticket) => ticket.id));
    const gtmAgentIds = new Set(gtmDirectoryAgents(companyAgents).map((agent) => agent.id));
    const rows = await issues.list(companyId);
    res.json(
      rows.filter(
        (issue) =>
          (issue.ticketId != null && gtmTicketIds.has(issue.ticketId)) ||
          (issue.assigneeAgentId != null && gtmAgentIds.has(issue.assigneeAgentId)),
      ),
    );
  });

  /** Hidden (archived) GTM issues — same scope as list issues, for inbox recovery. */
  router.get("/companies/:companyId/issues/hidden", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const [gtmTickets, companyAgents] = await Promise.all([
      tickets.list(companyId),
      agents.list(companyId),
    ]);
    const gtmTicketIds = new Set(gtmTickets.filter(isGtmTicket).map((ticket) => ticket.id));
    const gtmAgentIds = new Set(gtmDirectoryAgents(companyAgents).map((agent) => agent.id));
    const rows = await issues.listArchived(companyId);
    res.json(
      rows.filter(
        (issue) =>
          (issue.ticketId != null && gtmTicketIds.has(issue.ticketId)) ||
          (issue.assigneeAgentId != null && gtmAgentIds.has(issue.assigneeAgentId)),
      ),
    );
  });

  router.post("/companies/:companyId/issues", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const ticketId = req.body?.ticketId ? String(req.body.ticketId) : "";
    const ticket = ticketId ? await tickets.getById(ticketId) : null;
    if (!ticket || ticket.companyId !== companyId || !isGtmTicket(ticket)) {
      res.status(422).json({ error: "Select a GTM campaign before creating queue work." });
      return;
    }

    const actor = getActorInfo(req);
    const created = await issues.create(companyId, {
      ticketId: ticket.id,
      ticketStage: req.body?.ticketStage ? String(req.body.ticketStage) : null,
      title: String(req.body?.title ?? "").trim(),
      description: req.body?.description ? String(req.body.description) : null,
      status: req.body?.status ? String(req.body.status) : "backlog",
      priority: req.body?.priority ? String(req.body.priority) : "medium",
      assigneeAgentId: req.body?.assigneeAgentId ? String(req.body.assigneeAgentId) : null,
      assigneeUserId: null,
      requestDepth: 0,
      billingCode: null,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    res.status(201).json(created);
  });

  router.get("/companies/:companyId/inbox", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const [gtmTickets, companyAgents, companyRuns] = await Promise.all([
      tickets.list(companyId),
      agents.list(companyId),
      heartbeats.list(companyId, undefined, 50),
    ]);
    const filteredTickets = gtmTickets.filter(isGtmTicket);
    const gtmTicketIds = new Set(filteredTickets.map((ticket) => ticket.id));
    const filteredAgents = gtmDirectoryAgents(companyAgents);
    const gtmAgentIds = new Set(filteredAgents.map((agent) => agent.id));
    const gtmAgentNames = new Map(filteredAgents.map((agent) => [agent.id, agent.name]));
    const filteredIssues = (await issues.list(companyId)).filter(
      (issue) =>
        (issue.ticketId != null && gtmTicketIds.has(issue.ticketId)) ||
        (issue.assigneeAgentId != null && gtmAgentIds.has(issue.assigneeAgentId)),
    );
    const gtmIssueIds = new Set(filteredIssues.map((issue) => issue.id));
    const gtmIssueIdentifiers = new Map(filteredIssues.map((issue) => [issue.id, issue.identifier ?? issue.title]));
    const filteredRuns = companyRuns.filter((run) => {
      if (gtmAgentIds.has(run.agentId)) return true;
      const issueId =
        run.contextSnapshot && typeof run.contextSnapshot.issueId === "string"
          ? run.contextSnapshot.issueId
          : null;
      return issueId != null && gtmIssueIds.has(issueId);
    });
    const entries = [
      ...filteredRuns.map((run) => {
        const issueId =
          run.contextSnapshot && typeof run.contextSnapshot.issueId === "string"
            ? run.contextSnapshot.issueId
            : null;
        return {
          id: run.id,
          kind: "run" as const,
          title: `${gtmAgentNames.get(run.agentId) ?? "Agent"} · ${run.status}`,
          subtitle: issueId
            ? `${gtmIssueIdentifiers.get(issueId) ?? issueId} · ${run.invocationSource}`
            : run.invocationSource,
          updatedAt: run.updatedAt,
          issueId,
          agentId: run.agentId,
        };
      }),
      ...filteredIssues.map((issue) => ({
        id: issue.id,
        kind: "issue" as const,
        title: issue.title,
        subtitle: issue.identifier ?? issue.status,
        updatedAt: issue.updatedAt,
      })),
      ...filteredTickets.map((ticket) => ({
        id: ticket.id,
        kind: "ticket" as const,
        title: ticket.title,
        subtitle: ticket.identifier ?? ticket.currentStage,
        updatedAt: ticket.updatedAt,
      })),
    ];
    res.json(sortByUpdatedAtDesc(entries));
  });

  router.get("/companies/:companyId/runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const [companyAgents, companyRuns, gtmIssues] = await Promise.all([
      agents.list(companyId),
      heartbeats.list(companyId, undefined, 50),
      issues.list(companyId),
    ]);
    const gtmAgentIds = new Set(gtmDirectoryAgents(companyAgents).map((agent) => agent.id));
    const gtmIssueIds = new Set(
      gtmIssues
        .filter((issue) => issue.assigneeAgentId != null && gtmAgentIds.has(issue.assigneeAgentId))
        .map((issue) => issue.id),
    );
    const filteredRuns = companyRuns.filter((run) => {
      if (gtmAgentIds.has(run.agentId)) return true;
      const issueId =
        run.contextSnapshot && typeof run.contextSnapshot.issueId === "string"
          ? run.contextSnapshot.issueId
          : null;
      return issueId != null && gtmIssueIds.has(issueId);
    });
    res.json(filteredRuns);
  });

  // ---- Campaign policy enforcement ---- //

  router.post("/companies/:companyId/campaigns/:ticketId/heartbeat", async (req, res) => {
    const companyId = req.params.companyId as string;
    const ticketId = req.params.ticketId as string;
    assertCompanyAccess(req, companyId);
    const result = await enforceHeartbeatPolicy(db, companyId, ticketId);
    res.json(result);
  });

  router.post("/companies/:companyId/campaigns/:ticketId/performance-review", async (req, res) => {
    const companyId = req.params.companyId as string;
    const ticketId = req.params.ticketId as string;
    assertCompanyAccess(req, companyId);
    const result = await enforcePerformanceReview(db, companyId, ticketId);
    res.json(result);
  });

  return router;
}
