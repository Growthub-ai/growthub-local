/**
 * GTM Campaign Policy Enforcement
 *
 * Self-contained helpers that enforce campaign-level heartbeat policies
 * and performance review cadences by creating actionable sub-issues
 * dispatched to the appropriate agents.
 *
 * Heartbeat enforcement: when a campaign heartbeat fires, create a
 * sub-issue within each campaign issue for the assigned agent so the
 * agent gets fresh context with a `todo` status and starts execution.
 *
 * Performance review: the CEO agent reviews all completed/in-progress
 * issues in the campaign, compares against campaign policy metrics or
 * issue-level goals, and generates a performance review issue with
 * actionable improvements.
 */

import type { Db } from "@paperclipai/db";
import { readGtmCampaignMetadata, type GtmCampaignSettings, parseBrowserSessionConfig } from "@paperclipai/shared";
import { issueService } from "./issues.js";
import { ticketService } from "./tickets.js";
import { agentService } from "./agents.js";
import { logger } from "../middleware/logger.js";

// ------------------------------------------------------------------ //
//  Heartbeat policy enforcement                                       //
// ------------------------------------------------------------------ //

export interface HeartbeatEnforcementResult {
  campaignId: string;
  campaignTitle: string;
  issuesCreated: number;
  errors: string[];
}

/**
 * Enforce heartbeat policy for a single GTM campaign.
 *
 * For every active issue in the campaign that has an assigned agent,
 * create a child issue (sub-issue) with `todo` status so the agent
 * picks it up on the next heartbeat cycle.
 */
export async function enforceHeartbeatPolicy(
  db: Db,
  companyId: string,
  ticketId: string,
): Promise<HeartbeatEnforcementResult> {
  const issues = issueService(db);
  const tickets = ticketService(db);
  const agents = agentService(db);

  const ticket = await tickets.get(ticketId);
  if (!ticket) {
    return { campaignId: ticketId, campaignTitle: "", issuesCreated: 0, errors: ["Campaign not found"] };
  }

  const metadata = readGtmCampaignMetadata(ticket.metadata);
  if (!metadata?.settings?.policy.heartbeatCadence) {
    return { campaignId: ticketId, campaignTitle: ticket.title, issuesCreated: 0, errors: ["No heartbeat policy configured"] };
  }

  // Get all active issues in this campaign
  const allIssues = await tickets.getIssues(ticketId);
  const activeIssues = allIssues.filter(
    (issue) => issue.assigneeAgentId && ["todo", "in_progress", "backlog"].includes(issue.status),
  );

  // Pre-fetch agents so we can read their runtimeConfig.browserSession
  const companyAgents = await agents.list(companyId);
  const agentById = new Map(companyAgents.map((a) => [a.id, a]));

  const errors: string[] = [];
  let created = 0;

  for (const issue of activeIssues) {
    try {
      const assignedAgent = issue.assigneeAgentId ? agentById.get(issue.assigneeAgentId) : null;
      const agentRuntimeConfig = assignedAgent
        ? (typeof assignedAgent.runtimeConfig === "object" && assignedAgent.runtimeConfig !== null
            ? assignedAgent.runtimeConfig as Record<string, unknown>
            : {})
        : {};
      const browserSession = parseBrowserSessionConfig(agentRuntimeConfig.browserSession);
      const browserNote = browserSession?.freshBrowserPerIssue
        ? "\n### Browser Isolation\nThis agent has `freshBrowserPerIssue` enabled. A fresh, isolated Chrome profile will be automatically provisioned for this sub-issue — no shared state with other issues or agents."
        : "";

      const subTitle = `[Heartbeat] ${issue.title}`;
      const subDescription = [
        `## Heartbeat Pulse — ${metadata.settings.policy.heartbeatCadence}`,
        "",
        `This is an automated heartbeat sub-issue for parent issue **${issue.identifier ?? issue.id}**.`,
        "",
        "### Instructions",
        `1. Review the current state of parent issue "${issue.title}"`,
        "2. Continue execution from where the parent issue left off",
        "3. Report progress and blockers back to the parent issue",
        browserNote,
        "",
        metadata.settings.policy.escalationPolicy
          ? `### Escalation Policy\n${metadata.settings.policy.escalationPolicy}`
          : "",
        "",
        metadata.settings.defaultIssueConfig.outputExpectations
          ? `### Output Expectations\n${metadata.settings.defaultIssueConfig.outputExpectations}`
          : "",
      ].filter(Boolean).join("\n");

      await issues.create(companyId, {
        ticketId: ticket.id,
        title: subTitle,
        description: subDescription,
        priority: issue.priority,
        status: "todo",
        assigneeAgentId: issue.assigneeAgentId,
      });
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to create heartbeat sub-issue for ${issue.identifier ?? issue.id}: ${msg}`);
      logger.error({ err, issueId: issue.id }, "heartbeat sub-issue creation failed");
    }
  }

  return {
    campaignId: ticketId,
    campaignTitle: ticket.title,
    issuesCreated: created,
    errors,
  };
}

// ------------------------------------------------------------------ //
//  Performance review cadence                                         //
// ------------------------------------------------------------------ //

export interface PerformanceReviewResult {
  campaignId: string;
  campaignTitle: string;
  reviewIssueId: string | null;
  agentsReviewed: number;
  error: string | null;
}

/**
 * Generate a performance review for a GTM campaign.
 *
 * Creates an issue assigned to the CEO agent that contains:
 * - Summary of all agent activity in the campaign
 * - Comparison against campaign policy metrics or issue-level goals
 * - Actionable recommendations for improving agent workflows
 *
 * The CEO agent then processes this issue to generate the actual
 * review and implement changes.
 */
export async function enforcePerformanceReview(
  db: Db,
  companyId: string,
  ticketId: string,
): Promise<PerformanceReviewResult> {
  const issues = issueService(db);
  const tickets = ticketService(db);
  const agents = agentService(db);

  const ticket = await tickets.get(ticketId);
  if (!ticket) {
    return { campaignId: ticketId, campaignTitle: "", reviewIssueId: null, agentsReviewed: 0, error: "Campaign not found" };
  }

  const metadata = readGtmCampaignMetadata(ticket.metadata);
  const settings = metadata?.settings;

  // Find CEO agent
  const companyAgents = await agents.list(companyId);
  const ceoAgent = companyAgents.find((a) => a.role === "ceo");
  if (!ceoAgent) {
    return { campaignId: ticketId, campaignTitle: ticket.title, reviewIssueId: null, agentsReviewed: 0, error: "No CEO agent found" };
  }

  // Get all issues in this campaign
  const allIssues = await tickets.getIssues(ticketId);

  // Group issues by agent
  const agentIssueMap = new Map<string, typeof allIssues>();
  for (const issue of allIssues) {
    if (!issue.assigneeAgentId) continue;
    const existing = agentIssueMap.get(issue.assigneeAgentId) ?? [];
    existing.push(issue);
    agentIssueMap.set(issue.assigneeAgentId, existing);
  }

  // Build review brief
  const agentSections: string[] = [];
  for (const [agentId, agentIssues] of agentIssueMap) {
    const agent = companyAgents.find((a) => a.id === agentId);
    const agentName = agent ? `${agent.name} (${agent.role})` : agentId.slice(0, 8);

    const completed = agentIssues.filter((i) => i.status === "done").length;
    const inProgress = agentIssues.filter((i) => i.status === "in_progress").length;
    const blocked = agentIssues.filter((i) => i.status === "blocked").length;
    const total = agentIssues.length;

    const issueList = agentIssues
      .map((i) => `  - [${i.status}] ${i.identifier ?? i.id.slice(0, 8)}: ${i.title}`)
      .join("\n");

    agentSections.push([
      `### ${agentName}`,
      `- Total: ${total} | Completed: ${completed} | In Progress: ${inProgress} | Blocked: ${blocked}`,
      "",
      issueList,
    ].join("\n"));
  }

  // Build policy metrics section
  const policySection: string[] = ["## Campaign Policy Metrics"];
  if (settings?.policy.heartbeatCadence) {
    policySection.push(`- **Heartbeat:** ${settings.policy.heartbeatCadence}`);
  }
  if (settings?.policy.performanceReviewCadence) {
    policySection.push(`- **Review Cadence:** ${settings.policy.performanceReviewCadence}`);
  }
  if (settings?.policy.escalationPolicy) {
    policySection.push(`- **Escalation:** ${settings.policy.escalationPolicy}`);
  }
  if (settings?.defaultIssueConfig.successMetric) {
    policySection.push(`- **Success Metric:** ${settings.defaultIssueConfig.successMetric}`);
  }
  if (settings?.defaultIssueConfig.outputExpectations) {
    policySection.push(`- **Output Expectations:** ${settings.defaultIssueConfig.outputExpectations}`);
  }
  if (policySection.length === 1) {
    policySection.push("- No explicit campaign-level policy metrics configured. Use issue-level goals for evaluation.");
  }

  const reviewDescription = [
    `## Performance Review — ${ticket.title}`,
    "",
    `This is an automated performance review for GTM campaign "${ticket.title}".`,
    "Review the activity of all agents in this campaign and generate actionable feedback.",
    "",
    policySection.join("\n"),
    "",
    "## Agent Activity Summary",
    "",
    agentSections.length > 0
      ? agentSections.join("\n\n")
      : "No agent activity found in this campaign.",
    "",
    "## Required Actions",
    "",
    "1. **Review** each agent's issue completion rate and quality against campaign policy metrics",
    "2. **Compare** actual output to expected output expectations and success metrics",
    "3. **Identify** bottlenecks, blocked issues, and areas where agents need improvement",
    "4. **Generate** specific, actionable recommendations for each agent",
    "5. **Implement** workflow changes by creating follow-up issues with concrete improvements",
    "",
    "Post your review findings as a comment on this issue, then create follow-up issues for each actionable change.",
  ].join("\n");

  try {
    const reviewIssue = await issues.create(companyId, {
      ticketId: ticket.id,
      title: `[Performance Review] ${ticket.title}`,
      description: reviewDescription,
      priority: "high",
      status: "todo",
      assigneeAgentId: ceoAgent.id,
    });

    return {
      campaignId: ticketId,
      campaignTitle: ticket.title,
      reviewIssueId: reviewIssue.id,
      agentsReviewed: agentIssueMap.size,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, ticketId }, "performance review issue creation failed");
    return {
      campaignId: ticketId,
      campaignTitle: ticket.title,
      reviewIssueId: null,
      agentsReviewed: 0,
      error: msg,
    };
  }
}
